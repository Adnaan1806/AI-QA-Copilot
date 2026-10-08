import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { listRequirements } from "../services/api";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Input } from "../components/ui/input";
import RequirementTable from "../components/RequirementTable";
import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
  Page,
  PageHeader,
} from "../components/StatusMessages";
import { cn } from "../lib/utils";
import { readVerdict, requirementStage } from "../lib/qa";

const FILTERS = [
  { key: "", label: "All" },
  { key: "review", label: "In review", test: (r) => r.case_counts.draft > 0 },
  { key: "ready", label: "Ready to automate", test: (r, stage) => stage.key === "ready" },
  { key: "failing", label: "Failing scripts", test: (r) => r.case_counts.needs_review > 0 },
  {
    key: "not-ready",
    label: "Not ready to release",
    test: (r) => readVerdict(r.release_recommendation, r.release_verdict)?.tone === "fail",
  },
];

export default function AllRequirements() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const active = searchParams.get("stage") ?? "";

  useSetBreadcrumbs([{ label: "All requirements" }]);

  useEffect(() => {
    listRequirements()
      .then(setRequirements)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const withStage = useMemo(
    () => requirements.map((r) => ({ r, stage: requirementStage(r.case_counts, !!r.release_recommendation) })),
    [requirements],
  );

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, f.test ? withStage.filter(({ r, stage }) => f.test(r, stage)).length : withStage.length]),
  );

  const filter = FILTERS.find((f) => f.key === active) ?? FILTERS[0];
  const needle = query.trim().toLowerCase();
  const visible = withStage
    .filter(({ r, stage }) => !filter.test || filter.test(r, stage))
    .filter(
      ({ r }) =>
        !needle ||
        [r.name, r.suite_name, r.project_name].some((s) => s.toLowerCase().includes(needle)),
    )
    // Oldest first when reviewing: it's been waiting longest.
    .sort((a, b) =>
      active === "review"
        ? new Date(a.r.created_at) - new Date(b.r.created_at)
        : new Date(b.r.created_at) - new Date(a.r.created_at),
    )
    .map(({ r }) => r);

  return (
    <Page className="space-y-5">
      <PageHeader title="All requirements" subtitle="Every requirement across your projects" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter by stage" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={active === f.key}
              onClick={() => setSearchParams(f.key ? { stage: f.key } : {}, { replace: true })}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm",
                active === f.key
                  ? "bg-pencil-wash font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tabular text-xs opacity-80">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search requirements"
            placeholder="Search by name, suite, or project"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <ErrorMessage message={error} />

      {loading ? (
        <LoadingMessage />
      ) : visible.length === 0 ? (
        <EmptyState>
          {requirements.length === 0
            ? "No requirements yet. Open a suite and add one to get drafted test cases."
            : active === "review"
              ? "Nothing waiting for review. Every drafted case has been approved or rejected."
              : "No requirements match this filter."}
        </EmptyState>
      ) : (
        <RequirementTable requirements={visible} showLocation />
      )}
    </Page>
  );
}
