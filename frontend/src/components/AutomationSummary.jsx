import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Card } from "./ui/card";
import { DURATION, EASE, STAGGER } from "../motion/constants";

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3; // visual gap between the two arc segments, in stroke length units

function StatTile({ label, value, tone }) {
  const toneClasses = {
    neutral: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClasses[tone] || toneClasses.neutral}`}>
        {value}
      </p>
    </div>
  );
}

// Passed vs. Needs Review donut as inline SVG arcs; colors match ScriptStatusBadge.
function ResultDonut({ passed, needsReview }) {
  const total = passed + needsReview;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const passedLen = total > 0 ? (passed / total) * CIRCUMFERENCE : 0;
  const reviewLen = total > 0 ? CIRCUMFERENCE - passedLen : 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox="0 0 100 100"
        width="140"
        height="140"
        className="shrink-0"
        role="img"
        aria-label={`${passRate}% of automated test cases passed`}
      >
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-muted" />
        <g transform="rotate(-90 50 50)">
          {passed > 0 && (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(passedLen - GAP, 0)} ${CIRCUMFERENCE}`}
              strokeDashoffset="0"
              className="stroke-emerald-500 dark:stroke-emerald-700"
            />
          )}
          {needsReview > 0 && (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(reviewLen - GAP, 0)} ${CIRCUMFERENCE}`}
              strokeDashoffset={-passedLen}
              className="stroke-amber-500 dark:stroke-amber-600"
            />
          )}
        </g>
        <text
          x="50"
          y="46"
          textAnchor="middle"
          className="fill-foreground text-[22px] font-bold tabular-nums"
        >
          {passRate}%
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          className="fill-muted-foreground text-[9px] font-medium tracking-wide uppercase"
        >
          Passed
        </text>
      </svg>

      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-700" />
          <span className="font-medium text-foreground">{passed}</span>
          <span className="text-muted-foreground">passed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-600" />
          <span className="font-medium text-foreground">{needsReview}</span>
          <span className="text-muted-foreground">needs review</span>
        </div>
      </div>
    </div>
  );
}

export default function AutomationSummary({ testCases, automationScripts }) {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      const tiles = rootRef.current?.querySelectorAll("[data-stat-tile]");
      if (!tiles || tiles.length === 0) return;
      gsap.fromTo(
        tiles,
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.toggle,
          ease: EASE.out,
          stagger: Math.min(STAGGER.item, STAGGER.cap / tiles.length),
          overwrite: true,
        },
      );
    },
    { dependencies: [testCases.length, automationScripts.length], scope: rootRef },
  );

  const approvedCount = testCases.filter((tc) => tc.status === "approved").length;
  const passedCount = automationScripts.filter((s) => s.status === "passed").length;
  const needsReviewCount = automationScripts.filter((s) => s.status === "needs_review").length;

  return (
    <Card ref={rootRef} className="p-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <ResultDonut passed={passedCount} needsReview={needsReviewCount} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div data-stat-tile>
            <StatTile label="Total test cases" value={testCases.length} tone="neutral" />
          </div>
          <div data-stat-tile>
            <StatTile label="Approved" value={approvedCount} tone="neutral" />
          </div>
          <div data-stat-tile>
            <StatTile label="Passed" value={passedCount} tone="good" />
          </div>
          <div data-stat-tile>
            <StatTile label="Needs review" value={needsReviewCount} tone="warn" />
          </div>
        </div>
      </div>
    </Card>
  );
}
