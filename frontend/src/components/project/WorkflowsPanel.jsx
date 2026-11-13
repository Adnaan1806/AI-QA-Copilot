import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { listFacts } from "../../services/api";
import { formatDate, plural } from "../../lib/qa";
import { cn } from "../../lib/utils";
import { ErrorMessage, LoadingMessage } from "../StatusMessages";
import FactActions from "./FactActions";

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

// The pages a flow passes through, in order: "/inventory.html → /cart.html".
function route(flow) {
  const pages = [flow.content.start_url, ...(flow.content.steps ?? []).map((s) => s.url)]
    .filter(Boolean)
    .map((url) => url.replace(/^https?:\/\/[^/]+/, "") || "/");
  return pages.filter((page, i) => page !== pages[i - 1]);
}

// The flows passing tests proved: one per path through the app, listing the
// cases that took it. Steps only -- not what the app should do there.
export default function WorkflowsPanel({ projectId, onCounts }) {
  const [flows, setFlows] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  function show(list) {
    setFlows(list);
    onCounts({ flows: list.length, flowCases: list.reduce((n, f) => n + (f.content.cases?.length ?? 1), 0) });
  }

  useEffect(() => {
    listFacts(projectId, "workflow")
      .then(show)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const caseTotal = flows?.reduce((n, f) => n + (f.content.cases?.length ?? 1), 0) ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm">
        <span className="font-medium">Flows</span>
        <span className="tabular text-muted-foreground">
          {flows && `${flows.length} · from ${plural(caseTotal, "passing case")}`}
        </span>
      </div>
      <ErrorMessage message={error} />
      {flows === null ? (
        !error && (
          <div className="p-4">
            <LoadingMessage />
          </div>
        )
      ) : flows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          None yet. A flow appears when an automated test case passes: the path it took through the app.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
          {flows.map((flow) => {
            const open = openId === flow.id;
            const steps = flow.content.steps ?? [];
            const cases = flow.content.cases ?? [];
            const options = flow.content.options ?? {};
            return (
              <li key={flow.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : flow.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <ChevronRight
                    className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{flow.title}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {route(flow).join(" → ")}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {flow.status === "confirmed" ? "Confirmed" : plural(cases.length || 1, "case")}
                  </span>
                </button>
                {open && (
                  <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3 pl-11 text-sm">
                    <ol className="space-y-1">
                      {steps.map((step, i) => (
                        <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-1">
                          <span className="tabular text-muted-foreground">{i + 1}</span>
                          <span>
                            <span className="text-muted-foreground">{step.step_text}</span>
                            <span className="block font-mono text-xs">{describe(step)}</span>
                            {options[String(i)]?.length > 1 && (
                              <span className="block text-xs text-muted-foreground">
                                Proven with: {options[String(i)].join(", ")}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {cases.length > 0 && (
                      <div className="space-y-0.5 text-xs">
                        <p className="text-muted-foreground">Proven by</p>
                        <ul className="space-y-0.5">
                          {cases.map((c) => (
                            <li key={c.id}>{c.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Last proven {formatDate(flow.last_seen_at)}
                      {flow.content.healed && " · a passing script was healed, so it may differ slightly from these steps"}
                    </p>
                    <FactActions
                      projectId={projectId}
                      fact={flow}
                      what="flow"
                      onChanged={(updated) => show(flows.map((f) => (f.id === updated.id ? updated : f)))}
                      onRemoved={(removed) => show(flows.filter((f) => f.id !== removed.id))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
