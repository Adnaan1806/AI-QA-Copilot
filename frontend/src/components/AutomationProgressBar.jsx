import { useEffect, useState } from "react";
import { getAutomationProgress } from "../services/api";
import Spinner from "../motion/Spinner";
import AgentAvatar from "./AgentAvatar";
import { CREW } from "../lib/crew";
import { CASE_STATE_LABEL } from "../lib/qa";

// Who is working, per real backend stage (see backend/app/automation/progress.py
// and runner.py for where these are reported). Running a script isn't an agent.
const STAGES = {
  exploring: { agent: "scout", verb: "is exploring the app for" },
  generating_script: { agent: "scripter", verb: "is writing the script for" },
  running_tests: { verb: "Running the script for" },
  healing: { agent: "mender", verb: "is fixing" },
};

const DONE_STAGES = new Set(["passed", "failed", "needs_review"]);

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function ItemRow({ item }) {
  const { stage, test_case_title, attempt } = item;
  if (DONE_STAGES.has(stage)) {
    return (
      <li className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center">
          <span className={`size-2 rounded-full ${DOT[stage]}`} />
        </span>
        <span className="truncate text-muted-foreground">
          {CASE_STATE_LABEL[stage]}: {test_case_title}
        </span>
      </li>
    );
  }
  const { agent, verb } = STAGES[stage] ?? { verb: "Working on" };
  const what = stage === "healing" && attempt ? `try ${attempt} of ${test_case_title}` : test_case_title;
  return (
    <li className="flex items-center gap-2.5">
      {agent ? (
        <AgentAvatar agent={agent} state={stage === "healing" ? "warn" : "live"} />
      ) : (
        <span className="grid size-7 shrink-0 place-items-center">
          <Spinner className="size-3.5 text-primary" />
        </span>
      )}
      <span className="truncate">
        {agent && <span className="font-medium">{CREW[agent].name} </span>}
        <span className="text-muted-foreground">{verb}</span> {what}
      </span>
    </li>
  );
}

const DOT = { passed: "bg-pass", failed: "bg-fail", needs_review: "bg-review" };

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
          {progress?.report ? <AgentAvatar agent="judge" state="live" /> : <Spinner className="size-4 text-primary" />}
          {progress?.report
            ? "Judge is writing the release report"
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
            <ItemRow key={item.test_case_index} item={item} />
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
