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

const DONE_STAGES = new Set(["passed", "needs_review"]);

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function describeItem(item) {
  const { stage, test_case_title, attempt } = item;
  if (stage === "passed") return `Passed "${test_case_title}"`;
  if (stage === "needs_review") return `Needs review: "${test_case_title}"`;
  const verb = STAGE_VERBS[stage] || "Working on";
  const attemptSuffix = attempt ? `, attempt ${attempt}` : "";
  return `${verb} "${test_case_title}"${attemptSuffix}…`;
}

function ProgressRow({ item }) {
  const done = DONE_STAGES.has(item.stage);
  const rowRef = useRef(null);

  useGSAP(() => {
    if (!rowRef.current) return;
    gsap.fromTo(
      rowRef.current,
      { opacity: 0, y: 4 },
      { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" },
    );
  }, []);

  return (
    <div ref={rowRef} className="flex items-center gap-2.5 text-sm">
      {done ? (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            item.stage === "passed" ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
      ) : (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      <span className={`truncate ${done ? "text-muted-foreground" : "font-medium text-primary"}`}>
        {describeItem(item)}
      </span>
    </div>
  );
}

// Polls the backend's per-test-case progress while a run is active. Test cases
// automate concurrently, so this shows one row per test case in flight.
export default function AutomationProgressBar({ requirementId }) {
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(null);
  const barRef = useRef(null);

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

  const items = Object.values(progress?.items || {}).sort(
    (a, b) => (a.test_case_index || 0) - (b.test_case_index || 0),
  );
  const doneCount = items.filter((item) => DONE_STAGES.has(item.stage)).length;
  const total = items[0]?.test_case_total || items.length;
  const overtime = elapsed > 60000;

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
        <span className="text-sm font-medium text-primary">
          {progress?.report
            ? "Compiling the release report…"
            : total
              ? `Automating test cases (${doneCount}/${total} finished)…`
              : "Starting up…"}
        </span>
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

      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <ProgressRow key={item.test_case_index} item={item} />
          ))}
        </div>
      )}

      {overtime && (
        <p className="mt-3 text-xs text-primary/70">
          Still working — requirements with more test cases can take a little longer.
        </p>
      )}
    </div>
  );
}
