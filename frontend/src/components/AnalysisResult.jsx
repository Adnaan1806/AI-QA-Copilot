import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ListChecks, TriangleAlert, CircleHelp, FlaskConical } from "lucide-react";
import { DURATION, EASE, STAGGER } from "../motion/constants";
import { Card } from "./ui/card";

const ICONS = {
  requirements: ListChecks,
  risks: TriangleAlert,
  missing: CircleHelp,
  testing: FlaskConical,
};

const THEMES = {
  requirements: {
    border: "border-primary/20",
    badge: "bg-primary/10 text-primary",
  },
  risks: {
    border: "border-red-200 dark:border-red-500/20",
    badge: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
  missing: {
    border: "border-amber-200 dark:border-amber-500/20",
    badge: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  testing: {
    border: "border-emerald-200 dark:border-emerald-500/20",
    badge: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
};

function Section({ title, items, emptyLabel, icon }) {
  const theme = THEMES[icon];
  const Icon = ICONS[icon];
  return (
    <Card className={`border p-4 ring-0 ${theme.border}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${theme.badge}`}>
          <Icon className="size-4" />
        </span>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function AnalysisResult({ result }) {
  const containerRef = useRef(null);

  useGSAP(
    () => {
      if (!result || !containerRef.current) return;
      // fromTo (not from) so a re-trigger always lands back at fully
      // visible, instead of animating from wherever a prior in-flight
      // tween on the same elements happened to be interrupted.
      gsap.fromTo(
        containerRef.current.children,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.page,
          ease: EASE.out,
          stagger: STAGGER.item * 2,
          overwrite: true,
        },
      );
    },
    { dependencies: [result], scope: containerRef },
  );

  if (!result) return null;

  return (
    <div ref={containerRef} className="mt-6 grid grid-cols-1 gap-4 text-left md:grid-cols-2">
      <Section
        title="Requirements"
        items={result.requirements}
        emptyLabel="No requirements extracted."
        icon="requirements"
      />
      <Section
        title="Risks"
        items={result.risks}
        emptyLabel="No risks identified."
        icon="risks"
      />
      <Section
        title="Missing Information"
        items={result.missing_info}
        emptyLabel="Nothing flagged as missing."
        icon="missing"
      />
      <Section
        title="Testing Considerations"
        items={result.testing_considerations}
        emptyLabel="No testing considerations noted."
        icon="testing"
      />
    </div>
  );
}
