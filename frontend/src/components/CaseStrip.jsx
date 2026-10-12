import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { CASE_STATES, CASE_STATE_LABEL, countStates } from "../lib/qa";

const SEGMENT = {
  draft: "border-[1.5px] border-muted-foreground bg-transparent",
  approved: "bg-graphite",
  passed: "bg-pass",
  needs_review: "bg-review",
  rejected:
    "border border-border bg-[linear-gradient(135deg,transparent_42%,var(--graphite-2)_42%_58%,transparent_58%)]",
};

const SIZE = {
  sm: "h-2.5 w-2.5 rounded-[2px]",
  md: "h-3.5 w-3.5 rounded-[2px]",
  lg: "h-5 w-6 rounded-[3px]",
};

// Above this many cases the strip switches to a proportional bar so it stays
// the same width as a short requirement's strip.
const MAX_SEGMENTS = 24;

function describe(counts) {
  return CASE_STATES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${CASE_STATE_LABEL[s].toLowerCase()}`)
    .join(", ");
}

const SIGNED_OFF = new Set(["approved", "passed", "needs_review"]);

// Segments whose case was just signed off, each with a delay so a batch
// approval pops one after another.
function useJustSignedOff(states) {
  const previous = useRef(states);
  const [popping, setPopping] = useState(new Map());

  useEffect(() => {
    const before = previous.current;
    previous.current = states;
    if (!states || !before || states.length !== before.length) return;
    const fresh = new Map();
    states.forEach((s, i) => {
      if (SIGNED_OFF.has(s) && !SIGNED_OFF.has(before[i])) fresh.set(i, fresh.size * 110);
    });
    if (!fresh.size) return;
    setPopping(fresh);
    const timer = setTimeout(() => setPopping(new Map()), 600 + fresh.size * 110);
    return () => clearTimeout(timer);
  }, [states]);

  return popping;
}

// One segment per test case, coloured by its state. Pass `states` (one per case,
// in case order) when you have the full requirement, or `counts` from a list API.
// With `onSelect`, each segment is a button that opens its case.
export default function CaseStrip({ states, counts, titles, size = "md", selectedIndex, onSelect, className }) {
  const ordered =
    states ?? CASE_STATES.flatMap((s) => Array.from({ length: counts?.[s] ?? 0 }, () => s));
  const tally = counts ?? countStates(ordered);
  const popping = useJustSignedOff(states);

  if (ordered.length === 0) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No cases</span>;
  }

  if (ordered.length > MAX_SEGMENTS) {
    return (
      <span
        role="img"
        aria-label={describe(tally)}
        title={describe(tally)}
        className={cn("inline-flex h-2.5 w-36 overflow-hidden rounded-[2px] bg-muted", className)}
      >
        {CASE_STATES.filter((s) => tally[s] > 0).map((s) => (
          <span
            key={s}
            className={cn("h-full", SEGMENT[s], s === "draft" && "border-y-0 border-r-0")}
            style={{ width: `${(tally[s] / ordered.length) * 100}%` }}
          />
        ))}
      </span>
    );
  }

  if (onSelect) {
    return (
      <span aria-label={describe(tally)} className={cn("inline-flex shrink-0 items-center gap-[3px] align-middle", className)}>
        {ordered.map((s, i) => (
          <button
            key={i}
            type="button"
            title={titles?.[i]}
            aria-label={titles?.[i]}
            aria-current={i === selectedIndex ? "true" : undefined}
            onClick={() => onSelect(i)}
            style={popping.has(i) ? { animationDelay: `${popping.get(i)}ms` } : undefined}
            className={cn(
              "block cursor-pointer transition-colors duration-300",
              SIZE[size],
              SEGMENT[s],
              i === selectedIndex && "shadow-[0_0_0_2px_var(--background),0_0_0_3px_var(--pencil)]",
              popping.has(i) && "animate-strip-pop",
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={describe(tally)}
      title={describe(tally)}
      className={cn("inline-flex shrink-0 items-center gap-[3px] align-middle", className)}
    >
      {ordered.map((s, i) => (
        <span
          key={i}
          title={titles?.[i]}
          style={popping.has(i) ? { animationDelay: `${popping.get(i)}ms` } : undefined}
          className={cn("block transition-colors duration-300", SIZE[size], SEGMENT[s], popping.has(i) && "animate-strip-pop")}
        />
      ))}
    </span>
  );
}
