import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listRequirements } from "../services/api";
import Accordion, { ChevronIcon } from "../motion/Accordion";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";

function groupByProject(requirements) {
  const groups = [];
  const byProjectId = new Map();

  for (const r of requirements) {
    let group = byProjectId.get(r.project_id);
    if (!group) {
      group = { projectId: r.project_id, projectName: r.project_name, requirements: [] };
      byProjectId.set(r.project_id, group);
      groups.push(group);
    }
    group.requirements.push(r);
  }

  return groups;
}

export default function History() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    listRequirements()
      .then(setRequirements)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => groupByProject(requirements), [requirements]);
  const listRef = useListStagger([loading, groups.length]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        History
      </h1>
      <p className="mt-1 mb-6 text-gray-500 dark:text-gray-400">
        All requirements analyzed so far, grouped by project.
      </p>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
          <Spinner className="h-4 w-4" /> Loading...
        </p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm italic text-gray-400 dark:text-gray-500">No requirements yet.</p>
        </div>
      ) : (
        <div ref={listRef} className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.projectId}
              className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <Accordion
                defaultOpen
                buttonClassName="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
                bodyClassName="space-y-2 px-4 pb-4"
                summary={(open) => (
                  <>
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                      <ChevronIcon open={open} />
                      <span className="font-semibold">{group.projectName}</span>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                      {group.requirements.length} requirement
                      {group.requirements.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              >
                {group.requirements.map((r) => (
                  <Link
                    key={r.id}
                    to={`/requirements/${r.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/40 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-teal-500/40 dark:hover:bg-slate-800/60"
                  >
                    <div className="min-w-0 pr-4">
                      <p className="truncate font-medium text-gray-900 dark:text-white">
                        {r.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {r.suite_name} · {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                      {r.test_case_count} test case{r.test_case_count === 1 ? "" : "s"}
                    </span>
                  </Link>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
