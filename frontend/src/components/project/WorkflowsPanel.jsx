import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { listFacts } from "../../services/api";
import { formatDate, plural } from "../../lib/qa";
import { cn } from "../../lib/utils";
import { ErrorMessage, LoadingMessage } from "../StatusMessages";

// The element as a tester would name it (mirrors workflow_service._target).
function target(strategy, value) {
  if (strategy === "role" && value.includes("|")) {
    const [role, ...name] = value.split("|");
    return `${role} "${name.join("|")}"`;
  }
  if (strategy === "placeholder") return `the field "${value}"`;
  if (strategy === "label") return `"${value}"`;
  if (strategy === "text") return `the text "${value}"`;
  return "an element";
}

function describe(step) {
  const el = target(step.locator_strategy, step.locator_value);
  switch (step.action) {
    case "fill":
      return `Type "${step.value}" into ${el}`;
    case "press_key":
      return `Press ${step.value || "Enter"} in ${el}`;
    case "select_option":
      return `Choose "${step.value}" in ${el}`;
    case "check":
      return `Tick ${el}`;
    default:
      return `Click ${el}`;
  }
}

export default function WorkflowsPanel({ projectId }) {
  const [workflows, setWorkflows] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    listFacts(projectId, "workflow")
      .then(setWorkflows)
      .catch((err) => setError(err.message));
  }, [projectId]);

  return (
    <section className="space-y-4">
      <div className="max-w-prose space-y-1">
        <h3 className="text-sm font-semibold">Workflows</h3>
        <p className="text-sm text-muted-foreground">
          How things are done in the app, learned from test cases that passed:
          each step and the exact control it used. They include screens the app
          map can&apos;t reach, like dialogs. Steps only: a passing run shows
          how to get somewhere, not what the app should do there.
        </p>
      </div>

      <ErrorMessage message={error} />
      {workflows === null ? (
        !error && <LoadingMessage />
      ) : workflows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None yet. They appear as automated test cases pass.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {workflows.map((wf) => {
            const open = openId === wf.id;
            const steps = wf.content.steps ?? [];
            return (
              <li key={wf.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : wf.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-90",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {wf.title}
                  </span>
                  <span className="tabular hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {plural(steps.length, "step")} · proven{" "}
                    {formatDate(wf.last_seen_at)}
                  </span>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3 pl-11 text-sm">
                    <p className="font-mono text-xs text-muted-foreground">
                      Starts at {wf.content.start_url}
                    </p>
                    <ol className="space-y-1">
                      {steps.map((step, i) => (
                        <li
                          key={i}
                          className="grid grid-cols-[1.5rem_1fr] gap-1"
                        >
                          <span className="tabular text-muted-foreground">
                            {i + 1}
                          </span>
                          <span>
                            <span className="text-muted-foreground">
                              {step.step_text}
                            </span>
                            <span className="block font-mono text-xs">
                              {describe(step)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-muted-foreground">
                      Proven by a passing test · first{" "}
                      {formatDate(wf.first_seen_at)}
                      {wf.content.healed &&
                        " · the passing script was healed, so it may differ slightly from these steps"}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
