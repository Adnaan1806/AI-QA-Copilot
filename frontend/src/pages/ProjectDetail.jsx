import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { createTestSuite, getProject, getTestSuite, listTestSuites, updateProject } from "../services/api";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { useDataVersion } from "../context/DataVersionContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import InlineEdit from "../components/InlineEdit";
import RequirementTable from "../components/RequirementTable";
import KnowledgePanel from "../components/project/KnowledgePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  EmptyState,
  ErrorMessage,
  Page,
  PageError,
  PageHeader,
  PageLoading,
} from "../components/StatusMessages";
import { plural } from "../lib/qa";

function NewSuiteForm({ projectId, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createTestSuite(projectId, { name, description });
      onCreated();
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="suite-name">Suite name</Label>
        <Input
          id="suite-name"
          required
          placeholder="e.g. Checkout & Payments"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="suite-description">Description</Label>
        <Input
          id="suite-description"
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ErrorMessage message={error} className="md:col-span-2" />
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={creating}>
          {creating && <Spinner className="size-3.5" />}
          Create suite
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { bump } = useDataVersion();
  const [project, setProject] = useState(null);
  const [suites, setSuites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "knowledge" ? "knowledge" : "suites";

  useSetBreadcrumbs(project ? [{ label: "Projects", to: "/" }, { label: project.name }] : []);

  function load() {
    setError(null);
    return Promise.all([getProject(projectId), listTestSuites(projectId)])
      .then(async ([p, list]) => {
        // The suite list has no requirements; fetch each suite's detail for its table.
        const details = await Promise.all(list.map((s) => getTestSuite(s.id)));
        setProject(p);
        setSuites(details);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSaveBaseUrl(baseUrl) {
    setProject(await updateProject(projectId, { base_url: baseUrl }));
  }

  if (loading) return <PageLoading />;
  if (error && !project) return <PageError message={error} />;

  return (
    <Page className="space-y-8">
      <PageHeader
        title={project.name}
        subtitle={project.description}
        actions={
          tab === "suites" &&
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus />
              New suite
            </Button>
          )
        }
      >
        <div className="pt-1 text-sm">
          <InlineEdit
            label="App URL"
            type="url"
            placeholder="https://your-app.com"
            value={project.base_url}
            onSave={handleSaveBaseUrl}
            display={
              project.base_url ? (
                <span className="text-muted-foreground">
                  Tests run against <span className="font-mono text-[13px] text-foreground">{project.base_url}</span>
                </span>
              ) : (
                <span className="text-review">Add the app URL before generating automation</span>
              )
            }
          />
        </div>
      </PageHeader>

      <Tabs
        value={tab}
        onValueChange={(next) => setSearchParams(next === "suites" ? {} : { tab: next }, { replace: true })}
      >
        <TabsList variant="line">
          <TabsTrigger value="suites">Suites</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="suites" className="space-y-8 pt-4">
          {showForm && (
            <NewSuiteForm
              projectId={projectId}
              onCancel={() => setShowForm(false)}
              onCreated={async () => {
                setShowForm(false);
                bump();
                await load();
              }}
            />
          )}

          <ErrorMessage message={error} />

          {suites.length === 0 ? (
            !showForm && (
              <EmptyState
                action={
                  <Button onClick={() => setShowForm(true)}>
                    <Plus />
                    New suite
                  </Button>
                }
              >
                Suites group related requirements, like a feature area or a release. Create one to add
                your first requirement.
              </EmptyState>
            )
          ) : (
            suites.map((suite) => (
              <section key={suite.id} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <h2 className="text-base font-semibold">
                      <Link to={`/suites/${suite.id}`} className="hover:text-primary hover:underline">
                        {suite.name}
                      </Link>
                    </h2>
                    {suite.description && (
                      <span className="text-sm text-muted-foreground">{suite.description}</span>
                    )}
                  </div>
                  <span className="tabular text-sm text-muted-foreground">
                    {plural(suite.requirements.length, "requirement")}
                  </span>
                </div>
                {suite.requirements.length === 0 ? (
                  <EmptyState
                    action={
                      <Button variant="outline" asChild>
                        <Link to={`/suites/${suite.id}`}>Add a requirement</Link>
                      </Button>
                    }
                  >
                    No requirements in this suite yet.
                  </EmptyState>
                ) : (
                  <>
                    <RequirementTable requirements={suite.requirements} />
                    <Link to={`/suites/${suite.id}`} className="inline-block text-sm text-primary hover:underline">
                      Add requirement to {suite.name}
                    </Link>
                  </>
                )}
              </section>
            ))
          )}
        </TabsContent>

        <TabsContent value="knowledge" className="pt-4">
          <KnowledgePanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
