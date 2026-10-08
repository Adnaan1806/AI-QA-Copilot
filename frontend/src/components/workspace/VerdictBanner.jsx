import { cn } from "../../lib/utils";
import { TONE_TEXT, readVerdict } from "../../lib/qa";

const TONE_BORDER = {
  fail: "border-fail/40",
  review: "border-review/40",
  pass: "border-pass/40",
  neutral: "border-border",
};

// The release call, first and in its own colour. The one large type moment in the app.
export default function VerdictBanner({ recommendation, actions, children, className }) {
  const verdict = readVerdict(recommendation);
  if (!verdict) return null;
  return (
    <section
      aria-label="Release verdict"
      className={cn("space-y-3 rounded-lg border bg-card px-5 py-5 md:px-6", TONE_BORDER[verdict.tone], className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className={cn("text-[28px] leading-tight font-semibold tracking-[-0.01em]", TONE_TEXT[verdict.tone])}>
          {verdict.headline}
        </h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {verdict.detail && <p className="max-w-[72ch] text-[15px]">{verdict.detail}</p>}
      {children}
    </section>
  );
}
