import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { createProject, listProjects, listRequirements } from "../services/api";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { useDataVersion } from "../context/DataVersionContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import RequirementTable from "../components/RequirementTable";
import {
  EmptyState,
  ErrorMessage,
  LoadingMessage,
  Page,
  PageHeader,
} from "../components/StatusMessages";
import { plural, readVerdict } from "../lib/qa";

// Draft cases first (someone has to review them), then failing scripts, then
// requirements whose report says they can't ship.
function needsAttention(requirements) {
  const score = (r) => {
    if (r.case_counts.draft > 0) return 0;
    if (r.case_counts.needs_review > 0) return 1;
    if (readVerdict(r.release_recommendation, r.release_verdict)?.tone === "fail") return 2;
    return null;
  };
  return requirements
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => a.s - b.s || new Date(a.r.created_at) - new Date(b.r.created_at))
    .map((x) => x.r);
}

function NewProjectForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({ name, description, base_url: baseUrl });
      onCreated(project);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Project name</Label>
        <Input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-base-url">App URL to test</Label>
        <Input
          id="project-base-url"
          type="url"
          placeholder="https://your-app.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Automation runs against this URL. You can add it later.</p>
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="project-description">Description</Label>
        <Textarea
          id="project-description"
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-16 resize-none"
        />
      </div>
      <ErrorMessage message={error} className="md:col-span-2" />
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={creating}>
          {creating && <Spinner className="size-3.5" />}
          Create project
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bump } = useDataVersion();
  const [projects, setProjects] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const showForm = searchParams.get("new") === "1";

  useSetBreadcrumbs([{ label: "Projects" }]);

  useEffect(() => {
    Promise.all([listProjects(), listRequirements()])
      .then(([p, r]) => {
        setProjects(p);
        setRequirements(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function setShowForm(open) {
    setSearchParams(open ? { new: "1" } : {}, { replace: true });
  }

  const attention = needsAttention(requirements);

  return (
    <Page className="space-y-8">
      <PageHeader
        title="Projects"
        actions={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus />
              New project
            </Button>
          )
        }
      />

      {showForm && (
        <NewProjectForm
          onCancel={() => setShowForm(false)}
          onCreated={(project) => {
            bump();
            navigate(`/projects/${project.id}`);
          }}
        />
      )}

      <ErrorMessage message={error} />

      {loading ? (
        <LoadingMessage />
      ) : (
        <>
          {attention.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">Needs attention</h2>
                <Link to="/requirements" className="text-sm text-primary hover:underline">
                  All requirements
                </Link>
              </div>
              <RequirementTable requirements={attention.slice(0, 6)} showLocation />
            </section>
          )}

          <section className="space-y-3">
            {attention.length > 0 && <h2 className="text-base font-semibold">All projects</h2>}
            {projects.length === 0 ? (
              <EmptyState
                action={
                  !showForm && (
                    <Button onClick={() => setShowForm(true)}>
                      <Plus />
                      New project
                    </Button>
                  )
                }
              >
                Projects hold the test suites for one app. Create one to start adding requirements.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{p.name}</span>
                        {p.description && (
                          <span className="block truncate text-sm text-muted-foreground">{p.description}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-6 text-sm text-muted-foreground">
                        {p.base_url ? (
                          <span className="font-mono text-xs">{p.base_url.replace(/^https?:\/\//, "")}</span>
                        ) : (
                          <span className="text-review">No app URL</span>
                        )}
                        <span className="tabular">{plural(p.test_suite_count, "suite")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
