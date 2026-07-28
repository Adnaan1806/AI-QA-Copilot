import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

// Heuristic stage schedule, not tied to real backend events (the backend
// runs one long awaited call with no progress channel). Durations are
// rough guesses at where a typical run spends its time — if a run runs
// long, the panel just sits on the last stage with the elapsed counter
// still climbing, rather than lying about being "almost done".
const STAGES = [
  { label: "Launching a headless browser…", at: 0 },
  { label: "Exploring the app's flows…", at: 4000 },
  { label: "Generating Playwright scripts…", at: 12000 },
  { label: "Running the generated tests…", at: 28000 },
  { label: "Compiling the release report…", at: 45000 },
];

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Mounted only while a generation run is active (parent gates it with
// <Reveal>). Runs its own elapsed-time clock for as long as it stays
// mounted — it doesn't need to know when the run actually finishes.
export default function AutomationProgressBar() {
  const [elapsed, setElapsed] = useState(0);
  const labelRef = useRef(null);
  const barRef = useRef(null);
  const prevStageIndex = useRef(-1);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 200);
    return () => clearInterval(id);
  }, []);

  const stageIndex = STAGES.reduce((acc, stage, i) => (elapsed >= stage.at ? i : acc), 0);
  const stage = STAGES[stageIndex];
  const overtime = elapsed > 60000;

  useGSAP(
    () => {
      if (prevStageIndex.current === stageIndex || !labelRef.current) {
        prevStageIndex.current = stageIndex;
        return;
      }
      prevStageIndex.current = stageIndex;
      gsap.fromTo(
        labelRef.current,
        { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );
    },
    { dependencies: [stageIndex] },
  );

  useGSAP(() => {
    if (!barRef.current) return;
    const tween = gsap.to(barRef.current, {
      backgroundPosition: "-200% 0",
      duration: 1.6,
      ease: "none",
      repeat: -1,
    });
    return () => tween.kill();
  }, []);

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5 dark:border-teal-500/20 dark:bg-teal-500/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-600" />
          </span>
          <span
            ref={labelRef}
            className="truncate text-sm font-medium text-teal-800 dark:text-teal-200"
          >
            {stage.label}
          </span>
        </div>
        <span className="shrink-0 font-mono text-xs text-teal-500 dark:text-teal-300">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-teal-100 dark:bg-teal-500/10">
        <div
          ref={barRef}
          className="h-full w-full rounded-full bg-[length:200%_100%] bg-[linear-gradient(90deg,transparent_0%,#14b8a6_50%,transparent_100%)] dark:bg-[linear-gradient(90deg,transparent_0%,#2dd4bf_50%,transparent_100%)]"
        />
      </div>

      {overtime && (
        <p className="mt-3 text-xs text-teal-500 dark:text-teal-300">
          Still working — requirements with more test cases can take a little longer.
        </p>
      )}
    </div>
  );
}
