import { useEffect, useState } from "react";
import { getAnalysisProgress } from "../services/api";
import { plural } from "../lib/qa";
import AgentAvatar from "./AgentAvatar";

// Analyst, then Drafter, while a requirement is analyzed. Polls the progress the
// backend records under `progressKey` (sent with the analyze request).
export default function AnalysisProgress({ progressKey }) {
  const [progress, setProgress] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await getAnalysisProgress(progressKey);
        if (!cancelled && data.stage) setProgress(data);
      } catch {
        // Transient poll failure: keep the last known stage.
      }
    }
    poll();
    const id = setInterval(poll, 1200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [progressKey]);

  const drafting = progress.stage === "drafter";
  const steps = [
    drafting
      ? {
          agent: "analyst",
          state: "done",
          title: "Analyst read the requirement",
          detail:
            `${plural(progress.points ?? 0, "point")}, ${plural(progress.questions ?? 0, "open question")} for the product owner` +
            (progress.differences ? `, ${progress.differences} where the app differs` : ""),
        }
      : progress.step
        ? { agent: "analyst", state: "live", title: "Analyst is checking the requirement", detail: `It ${progress.step}` }
        : { agent: "analyst", state: "live", title: "Analyst is reading the requirement", detail: "Then checks it against your app map and your project's knowledge" },
    drafting
      ? { agent: "drafter", state: "live", title: "Drafter is writing test cases", detail: "From the requirement, the app map and your project's rules" }
      : { agent: "drafter", state: "idle", title: "Drafter writes the test cases", detail: "Starts when the Analyst is done" },
  ];

  return (
    <ol role="status" aria-live="polite" className="space-y-0">
      {steps.map((step, i) => (
        <li key={step.agent}>
          <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3">
            <AgentAvatar agent={step.agent} state={step.state} size="md" />
            <div className="animate-rise pt-0.5" key={step.title}>
              <p className={step.state === "idle" ? "text-muted-foreground" : "font-medium"}>{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className={`my-1 ml-[17px] h-5 w-0.5 transition-colors ${drafting ? "bg-primary" : "bg-border"}`} aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}
