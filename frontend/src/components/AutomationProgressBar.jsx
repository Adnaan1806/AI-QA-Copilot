import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { getAutomationProgress } from "../services/api";

// Verb shown per real backend stage (see backend/app/automation/progress.py
// and runner.py for where these are reported).
const STAGE_VERBS = {
  exploring: "Exploring the app to ground",
  generating_script: "Generating a Playwright script for",
  running_tests: "Running the generated test for",
  healing: "Fixing a failed run for",
};

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function describeStage(progress) {
  if (!progress || !progress.stage) return "Starting up…";
  if (progress.stage === "compiling_report") return "Compiling the release report…";

  const { stage, test_case_index, test_case_total, test_case_title, attempt } = progress;
  const verb = STAGE_VERBS[stage] || "Working on";
  const countSuffix = test_case_total ? ` (test ${test_case_index}/${test_case_total})` : "";
  const attemptSuffix = attempt ? `, attempt ${attempt}` : "";
  return `${verb} "${test_case_title}"${countSuffix}${attemptSuffix}…`;
}

// Mounted only while a generation run is active (parent gates it with
// <Reveal>). Polls the backend's real per-stage progress (not a heuristic
// guess) so this never lies about being "almost done" when it isn't.
export default function AutomationProgressBar({ requirementId }) {
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(null);
  const labelRef = useRef(null);
  const barRef = useRef(null);
  const prevLabel = useRef(null);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!requirementId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await getAutomationProgress(requirementId);
        if (!cancelled) setProgress(data);
      } catch {
        // Transient poll failure — keep showing the last known stage.
      }
    }

    poll();
    const id = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [requirementId]);

  const label = describeStage(progress);
  const overtime = elapsed > 60000;

  useGSAP(
    () => {
      if (prevLabel.current === label || !labelRef.current) {
        prevLabel.current = label;
        return;
      }
      prevLabel.current = label;
      gsap.fromTo(
        labelRef.current,
        { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );
    },
    { dependencies: [label] },
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
    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span ref={labelRef} className="truncate text-sm font-medium text-primary">
            {label}
          </span>
        </div>
        <span className="shrink-0 font-mono text-xs text-primary/70">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
        <div
          ref={barRef}
          className="h-full w-full rounded-full bg-[length:200%_100%] bg-[linear-gradient(90deg,transparent_0%,var(--color-primary)_50%,transparent_100%)]"
        />
      </div>

      {overtime && (
        <p className="mt-3 text-xs text-primary/70">
          Still working — requirements with more test cases can take a little longer.
        </p>
      )}
    </div>
  );
}
