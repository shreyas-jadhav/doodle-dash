import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import SketchCanvas from "./components/SketchCanvas";
import constants from "./constants";

function App() {
  // Game state
  const gameState = "playing";

  const [output, setOutput] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [sketchHasChanged, setSketchHasChanged] = useState(false);

  // What the user must sketch

  const [predictions] = useState([]);

  // Create a reference to the worker object.
  const worker = useRef(null);

  // We use the `useEffect` hook to setup the worker as soon as the `App` component is mounted.
  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
    }

    // Create a callback function for messages from the worker thread.
    const onMessageReceived = (e) => {
      const result = e.data;

      switch (result.status) {
        case "ready":
          // Pipeline ready: the worker is ready to accept messages.

          break;

        case "update":
          // Generation update: update the output text.
          break;

        case "result":
          // TODO optimize:

          setIsPredicting(false);

          {
            const filteredResult = result.data.filter(
              (x) => !constants.BANNED_LABELS.includes(x.label)
            );
            const timespent = canvasRef.current.getTimeSpentDrawing();

            // Slowly start rejecting labels that are not the target
            const applyEasyMode = timespent - constants.REJECT_TIME_DELAY;
            if (
              applyEasyMode > 0 &&
              filteredResult[0].score > constants.START_REJECT_THRESHOLD
            ) {
              // The number of labels to reject
              let amount = applyEasyMode / constants.REJECT_TIME_PER_LABEL;

              for (
                let i = 0;
                i < filteredResult.length && i < amount + 1;
                ++i
              ) {
                if (amount > i) {
                  filteredResult[i].score = 0;
                } else {
                  // fractional amount
                  filteredResult[i].score *= i - amount;
                }
              }

              // sort again
              filteredResult.sort((a, b) => b.score - a.score);
            }

            // Normalize to be a probability distribution
            const sum = filteredResult.reduce((acc, x) => acc + x.score, 0);
            filteredResult.forEach((x) => (x.score /= sum));

            setOutput(filteredResult);
          }
          break;
      }
    };

    // Attach the callback function as an event listener.
    worker.current.addEventListener("message", onMessageReceived);
    // worker.current.addEventListener('error', alert);

    // Define a cleanup function for when the component is unmounted.
    return () =>
      worker.current.removeEventListener("message", onMessageReceived);
  });

  // Set up classify function
  const classify = useCallback(() => {
    if (worker.current && canvasRef.current) {
      const image = canvasRef.current.getCanvasData();
      if (image !== null) {
        setIsPredicting(true);
        worker.current.postMessage({ action: "classify", image });
      }
    }
  }, []);

  const canvasRef = useRef(null);

  const handleClearCanvas = (resetTimeSpentDrawing = false) => {
    if (canvasRef.current) {
      canvasRef.current.clearCanvas(resetTimeSpentDrawing);
    }
  };

  useEffect(() => {
    worker.current.postMessage({ action: "load" });
  }, []);

  // GAME LOOP:
  useEffect(() => {
    if (gameState === "playing") {
      const classifyTimer = setInterval(() => {
        if (sketchHasChanged) {
          !isPredicting && classify();
        }
        setSketchHasChanged(false);
      }, constants.PREDICTION_REFRESH_TIME);

      return () => {
        clearInterval(classifyTimer);
      };
    } else if (gameState === "end") {
      // The game ended naturally (after timer expired)
      handleClearCanvas(true);
    }
  }, [gameState, isPredicting, sketchHasChanged, classify]);

  useEffect(() => {
    if (gameState === "playing") {
      const preventDefault = (e) => e.preventDefault();
      document.addEventListener("touchmove", preventDefault, {
        passive: false,
      });
      return () => {
        document.removeEventListener("touchmove", preventDefault, {
          passive: false,
        });
      };
    }
  }, [gameState]);

  const isPlaying = true;

  return (
    <>
      <div
        className={`h-full w-full top-0 left-0 absolute ${
          isPlaying ? "" : "pointer-events-none"
        }`}
      >
        <SketchCanvas
          onSketchChange={() => {
            setSketchHasChanged(true);
          }}
          ref={canvasRef}
        />
      </div>

      {isPlaying && (
        <ul className="absolute top-5 right-5 text-center border-red-100">
          {predictions.map((x, i) => (
            <li key={i}>
              <img
                src={x.image}
                alt={x.output?.label ?? "unknown"}
                className="w-16 h-16"
              />
            </li>
          ))}
        </ul>
      )}
      {isPlaying && (
        <div className="absolute bottom-5 text-center">
          <h1 className="text-2xl font-bold mb-3">
            {output &&
              `Prediction: ${output[0].label} (${(
                100 * output[0].score
              ).toFixed(1)}%)`}
          </h1>
          {/* other outputs */}
          {output &&
            output.slice(1, 5).map((x, i) => (
              <p key={i}>
                {x.label} ({(100 * x.score).toFixed(1)}%)
              </p>
            ))}

          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                handleClearCanvas();
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
