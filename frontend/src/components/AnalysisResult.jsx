const ICONS = {
  requirements: (
    <path
      d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  risks: (
    <path
      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.87 1.5h18.62a1 1 0 00.87-1.5L13.71 3.86a1 1 0 00-1.72 0z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  missing: (
    <path
      d="M12 8v4m0 4h.01M12 22a10 10 0 100-20 10 10 0 000 20z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  testing: (
    <path
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const THEMES = {
  requirements: {
    border: "border-indigo-200 dark:border-indigo-500/20",
    badge: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
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
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${theme.border}`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${theme.badge}`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            {ICONS[icon]}
          </svg>
        </span>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm italic text-gray-400 dark:text-gray-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300 dark:bg-slate-600" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalysisResult({ result }) {
  if (!result) return null;

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 text-left md:grid-cols-2">
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
