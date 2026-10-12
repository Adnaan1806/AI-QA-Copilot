import { cn } from "../lib/utils";

// The Testwright mark: a W whose last stroke is a tick (tests written, then
// signed off), with a spark for the AI. `on` is the surface it sits on, so the
// spark's outline cuts cleanly into the line end.
const SURFACE = {
  background: "stroke-background",
  sidebar: "stroke-sidebar",
  card: "stroke-card",
};

export default function BrandMark({ on = "background", className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0 overflow-visible", className)} aria-hidden>
      <path
        d="M4.5 9 L9.5 23.5 L15.5 12.5 L19.5 19.5 L26 7.5"
        fill="none"
        className="stroke-primary"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.5 1 Q26.8 5.2 31 5.5 Q26.8 5.8 26.5 10 Q26.2 5.8 22 5.5 Q26.2 5.2 26.5 1 Z"
        className={cn("fill-spark", SURFACE[on])}
        strokeWidth="1.4"
        paintOrder="stroke"
      />
    </svg>
  );
}
