import { useEffect, useState } from "react";
import { getAutomationProgress } from "../services/api";
import Spinner from "../motion/Spinner";

// Verb shown per real backend stage (see backend/app/automation/progress.py
// and runner.py for where these are reported).
const STAGE_VERBS = {
  exploring: "Exploring the app for",
  generating_script: "Writing a Playwright script for",
  running_tests: "Running the script for",
  healing: "Fixing a failed run of",
};

const DONE_STAGES = new Set(["passed", "needs_review"]);

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function describeItem(item) {
  const { stage, test_case_title, attempt } = item;
  if (stage === "passed") return `Passed: ${test_case_title}`;
  if (stage === "needs_review") return `Needs review: ${test_case_title}`;
  const verb = STAGE_VERBS[stage] || "Working on";
  return `${verb} ${test_case_title}${attempt ? ` (attempt ${attempt})` : ""}`;
}

const DOT = { passed: "bg-pass", needs_review: "bg-review" };

// Polls the backend's per-test-case progress while a run is active. Test cases
// automate concurrently, so this shows one row per case in flight.
export default function AutomationProgressBar({ requirementId }) {
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 500);
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
        // Transient poll failure: keep showing the last known stage.
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
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Spinner className="size-4 text-primary" />
          {progress?.report
            ? "Writing the release report"
            : total
              ? `Automating cases: ${doneCount} of ${total} finished`
              : "Starting up"}
        </span>
        <span className="tabular text-xs text-muted-foreground">{formatElapsed(elapsed)}</span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${progress?.report ? 100 : Math.max(pct, 4)}%` }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {items.map((item) => (
            <li key={item.test_case_index} className="flex items-center gap-2.5">
              {DONE_STAGES.has(item.stage) ? (
                <span className={`size-2 shrink-0 rounded-full ${DOT[item.stage]}`} />
              ) : (
                <Spinner className="size-3 shrink-0 text-primary" />
              )}
              <span className={`truncate ${DONE_STAGES.has(item.stage) ? "text-muted-foreground" : ""}`}>
                {describeItem(item)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {elapsed > 60000 && (
        <p className="text-xs text-muted-foreground">
          Still working. Requirements with more cases take longer, usually a few minutes.
        </p>
      )}
    </div>
  );
}
