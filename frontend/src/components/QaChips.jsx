import { Check } from "lucide-react";
import { cn } from "../lib/utils";
import { CASE_STATE_LABEL, readVerdict } from "../lib/qa";

const CHIP = "inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap";

const STATE_STYLE = {
  draft: "text-muted-foreground ring-1 ring-inset ring-border",
  approved: "bg-muted text-foreground",
  rejected: "text-muted-foreground line-through decoration-muted-foreground/60",
  passed: "bg-pass-wash text-pass",
  needs_review: "bg-review-wash text-review",
};

export function StateChip({ state, className }) {
  return <span className={cn(CHIP, STATE_STYLE[state], className)}>{CASE_STATE_LABEL[state]}</span>;
}

const TONE_STYLE = {
  fail: "bg-fail-wash text-fail",
  review: "bg-review-wash text-review",
  pass: "bg-pass-wash text-pass",
  neutral: "bg-muted text-foreground",
};

export function VerdictChip({ recommendation, className }) {
  const verdict = readVerdict(recommendation);
  if (!verdict) return <span className={cn("text-xs text-muted-foreground", className)}>No report yet</span>;
  return (
    <span className={cn(CHIP, TONE_STYLE[verdict.tone], className)} title={recommendation}>
      <span className="size-1.5 rounded-full bg-current" />
      {verdict.short}
    </span>
  );
}

// Analyzed → Reviewed → Automated → Verdict. A real sequence, drawn as connected steps.
export function StageTracker({ steps, className }) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-y-1 text-xs", className)} aria-label="Progress">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center">
          {i > 0 && <span className="mx-2 h-px w-5 bg-border" aria-hidden />}
          <span
            className={cn(
              "flex items-center gap-1.5",
              step.done && "text-foreground",
              step.current && "font-medium text-primary",
              !step.done && !step.current && "text-muted-foreground",
            )}
            aria-current={step.current ? "step" : undefined}
          >
            <span
              className={cn(
                "grid size-3.5 place-items-center rounded-full border-[1.5px]",
                step.done && "border-graphite bg-graphite text-sheet",
                step.current && "border-primary bg-pencil-wash",
                !step.done && !step.current && "border-muted-foreground",
              )}
              aria-hidden
            >
              {step.done && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
