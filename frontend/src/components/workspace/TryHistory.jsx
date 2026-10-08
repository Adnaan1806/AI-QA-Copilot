import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "../../lib/utils";
import { formatDate, plural } from "../../lib/qa";
import { changedChecks, collapseUnchanged, diffStats, lineDiff } from "../../lib/lineDiff";
import { getTestCaseTries } from "../../services/api";
import Spinner from "../../motion/Spinner";

const KIND_LABEL = {
  replayed: "Replayed saved script",
  generated: "Generated",
  healed: "Healed",
};

// The healed try is the one worth reading first: it shows what the healer changed.
function defaultTry(tries) {
  const healed = tries.map((t, i) => (t.kind === "healed" ? i : -1)).filter((i) => i >= 0);
  return healed.length ? healed[healed.length - 1] : tries.length - 1;
}

function DiffView({ before, after }) {
  const lines = lineDiff(before, after);
  const { added, removed } = diffStats(lines);
  if (!added && !removed) {
    return <p className="text-xs text-muted-foreground">Same script as the previous try.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-background font-mono text-xs leading-relaxed">
      {collapseUnchanged(lines).map((line, i) =>
        line.type === "skip" ? (
          <div key={i} className="border-y border-border/60 bg-muted/40 px-3 py-0.5 text-muted-foreground">
            {plural(line.count, "unchanged line")}
          </div>
        ) : (
          <div
            key={i}
            className={cn(
              "flex whitespace-pre",
              line.type === "add" && "bg-pass-wash",
              line.type === "del" && "bg-fail-wash",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "w-6 shrink-0 text-center select-none",
                line.type === "add" ? "text-pass" : line.type === "del" ? "text-fail" : "text-muted-foreground/50",
              )}
            >
              {line.type === "add" ? "+" : line.type === "del" ? "−" : ""}
            </span>
            <span className="sr-only">{line.type === "add" ? "Added: " : line.type === "del" ? "Removed: " : ""}</span>
            <span className="pr-3">{line.text || " "}</span>
          </div>
        ),
      )}
    </div>
  );
}

function TryDetail({ tries, index, currentCode }) {
  const current = tries[index];
  const previous = index > 0 ? tries[index - 1] : null;
  const showDiff = current.kind === "healed" && previous;
  const removedChecks = showDiff ? changedChecks(lineDiff(previous.code, current.code)) : [];

  return (
    <div className="space-y-2.5">
      {current.kind === "healed" && current.reason && (
        <p className="text-xs">
          <span className="text-muted-foreground">Healer's fix: </span>
          {current.reason}
        </p>
      )}
      {removedChecks.length > 0 && (
        <div className="flex gap-2 rounded-md border border-review/40 bg-review-wash p-2.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-review" />
          <div className="space-y-1">
            <p className="font-medium text-review">
              This fix removed or rewrote {plural(removedChecks.length, "check")}. Make sure the test still verifies
              the expected result.
            </p>
            <ul className="space-y-0.5 font-mono text-muted-foreground">
              {removedChecks.map((check, i) => (
                <li key={i}>{check}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {showDiff ? (
        <div className="space-y-1.5">
          <h5 className="text-xs text-muted-foreground">Changes from try {index}</h5>
          <DiffView before={previous.code} after={current.code} />
        </div>
      ) : current.code === currentCode ? (
        <p className="text-xs text-muted-foreground">This try's script is the current script, shown below.</p>
      ) : (
        <div className="space-y-1.5">
          <h5 className="text-xs text-muted-foreground">Script</h5>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed">
            <code>{current.code}</code>
          </pre>
        </div>
      )}
      {!current.passed && current.output && (
        <div className="space-y-1.5">
          <h5 className="text-xs text-review">Why try {index + 1} failed</h5>
          <pre className="max-h-56 overflow-auto rounded-md border border-review/30 bg-review-wash p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {current.output}
          </pre>
        </div>
      )}
      {current.stop_reason && (
        <p className="rounded-md border border-border bg-background p-2.5 text-xs">
          <span className="font-medium">Healing stopped. </span>
          {current.stop_reason}
        </p>
      )}
    </div>
  );
}

function RunTries({ run, heading, currentCode }) {
  const [selected, setSelected] = useState(() => defaultTry(run.tries));
  const index = Math.min(selected, run.tries.length - 1);

  return (
    <div className="space-y-2.5">
      <h4 className="text-xs text-muted-foreground">{heading}</h4>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Tries">
        {run.tries.map((t, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true" className="text-muted-foreground/60">→</span>}
            <button
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={i === index}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                i === index
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", t.passed ? "bg-pass" : "bg-review")} />
              <span className="tabular">Try {i + 1}</span>
              <span>· {KIND_LABEL[t.kind] ?? t.kind}</span>
              <span className="sr-only">{t.passed ? ", passed" : ", failed"}</span>
            </button>
          </li>
        ))}
      </ol>
      <TryDetail tries={run.tries} index={index} currentCode={currentCode} />
    </div>
  );
}

// Every try of the case's latest automation run, and what healing changed between them.
export default function TryHistory({ testCaseId, currentCode, version }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getTestCaseTries(testCaseId)
      .then((data) => !cancelled && setState({ loading: false, data, error: null }))
      .catch((error) => !cancelled && setState({ loading: false, data: null, error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [testCaseId, version]);

  if (state.loading && !state.data) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3" /> Loading tries
      </p>
    );
  }
  if (state.error) return <p className="text-xs text-fail">Couldn't load the tries: {state.error}</p>;

  const { latest, origin } = state.data;
  if (!latest) return null; // runs from before tries were recorded

  if (origin) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The latest run replayed the saved script and it passed first time. Below is how that script was made.
        </p>
        <RunTries key={`origin-${version}`} run={origin} currentCode={currentCode} heading={`Run on ${formatDate(origin.created_at)}`} />
      </div>
    );
  }
  return (
    <RunTries
      key={`latest-${version}`}
      run={latest}
      currentCode={currentCode}
      heading={`Latest run, ${formatDate(latest.created_at)}: ${plural(latest.tries.length, "try", "tries")}`}
    />
  );
}
