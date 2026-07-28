import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listRequirements } from "../services/api";
import Accordion, { ChevronIcon } from "../motion/Accordion";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

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

  useSetBreadcrumbs([{ label: "History" }]);

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
      <h1 className="text-2xl font-bold tracking-tight text-foreground">History</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        All requirements analyzed so far, grouped by project.
      </p>

      {error && (
        <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Loading...
        </p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm italic text-muted-foreground">No requirements yet.</p>
        </div>
      ) : (
        <div ref={listRef} className="space-y-4">
          {groups.map((group) => (
            <Card key={group.projectId} className="py-0">
              <Accordion
                defaultOpen
                buttonClassName="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
                bodyClassName="space-y-2 px-4 pb-4"
                summary={(open) => (
                  <>
                    <div className="flex items-center gap-2 text-foreground">
                      <ChevronIcon open={open} />
                      <span className="font-semibold">{group.projectName}</span>
                    </div>
                    <Badge variant="secondary">
                      {group.requirements.length} requirement
                      {group.requirements.length === 1 ? "" : "s"}
                    </Badge>
                  </>
                )}
              >
                {group.requirements.map((r) => (
                  <Link key={r.id} to={`/requirements/${r.id}`} className="block">
                    <Card className="flex-row items-center justify-between px-4 py-3.5 transition-colors hover:bg-primary/5 hover:ring-primary/40">
                      <div className="min-w-0 pr-4">
                        <p className="truncate font-medium text-foreground">{r.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.suite_name} · {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {r.test_case_count} test case{r.test_case_count === 1 ? "" : "s"}
                      </Badge>
                    </Card>
                  </Link>
                ))}
              </Accordion>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
