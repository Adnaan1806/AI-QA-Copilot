import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil, Plus } from "lucide-react";
import { createTestSuite, getProject, listTestSuites, updateProject } from "../services/api";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useMountFade } from "../motion/useMountFade";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

function EditableBaseUrl({ baseUrl, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(baseUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fadeRef = useMountFade([editing]);

  useEffect(() => {
    setValue(baseUrl);
  }, [baseUrl]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div ref={fadeRef} className="mt-2 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Base URL:{" "}
          {baseUrl ? (
            <span className="font-medium text-foreground/80">{baseUrl}</span>
          ) : (
            <span className="italic text-amber-600 dark:text-amber-400">
              not set — required to generate automation
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditing(true)}
          aria-label="Edit base URL"
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <div ref={fadeRef} className="mt-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          type="url"
          placeholder="https://your-app.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button onClick={handleSave} disabled={saving} className="shrink-0 gap-1.5">
          {saving && <Spinner className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => {
            setValue(baseUrl);
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [suites, setSuites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const listRef = useListStagger([loading, suites.length]);

  useSetBreadcrumbs(project ? [{ label: "Projects", to: "/" }, { label: project.name }] : []);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getProject(projectId), listTestSuites(projectId)])
      .then(([p, s]) => {
        setProject(p);
        setSuites(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

  async function handleSaveBaseUrl(baseUrl) {
    const updated = await updateProject(projectId, { base_url: baseUrl });
    setProject(updated);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createTestSuite(projectId, { name, description });
      setName("");
      setDescription("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (error && !project) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-muted-foreground">{project.description}</p>
          )}
          <EditableBaseUrl baseUrl={project.base_url} onSave={handleSaveBaseUrl} />
        </div>
        <Button
          onClick={() => setShowForm((s) => !s)}
          className="gap-1.5 bg-linear-to-r from-primary to-emerald-500 text-white shadow-sm shadow-primary/25 hover:opacity-90"
        >
          {!showForm && <Plus className="size-4" />}
          {showForm ? "Cancel" : "New Test Suite"}
        </Button>
      </div>

      <Reveal show={showForm} className="mt-6">
        <Card>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="suite-name">Test suite name</Label>
                <Input
                  id="suite-name"
                  required
                  placeholder="Test suite name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="suite-description">Description (optional)</Label>
                <Textarea
                  id="suite-description"
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-20 resize-none"
                />
              </div>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating && <Spinner className="h-4 w-4" />}
                {creating ? "Creating..." : "Create Test Suite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Reveal>

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">Test Suites</h2>
      <div ref={listRef} className="space-y-2">
        {suites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No test suites yet. Create one to start a requirement → test case → automation
              workflow.
            </p>
          </div>
        ) : (
          suites.map((s) => (
            <Link key={s.id} to={`/suites/${s.id}`} className="block">
              <Card className="flex-row items-center justify-between px-4 py-3.5 transition-colors hover:bg-primary/5 hover:ring-primary/40">
                <div className="min-w-0 pr-4">
                  <p className="truncate font-medium text-foreground">{s.name}</p>
                  {s.description && (
                    <p className="truncate text-sm text-muted-foreground">{s.description}</p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {s.requirement_count} requirement{s.requirement_count === 1 ? "" : "s"}
                </Badge>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
