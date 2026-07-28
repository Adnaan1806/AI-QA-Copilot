import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { createProject, listProjects } from "../services/api";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const listRef = useListStagger([loading, projects.length]);

  useSetBreadcrumbs([{ label: "Projects" }]);

  function load() {
    setLoading(true);
    listProjects()
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createProject({ name, description, base_url: baseUrl });
      setName("");
      setDescription("");
      setBaseUrl("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="mt-1 text-muted-foreground">Organize your QA work by project.</p>
        </div>
        <Button
          onClick={() => setShowForm((s) => !s)}
          className="gap-1.5 bg-linear-to-r from-primary to-emerald-500 text-white shadow-sm shadow-primary/25 hover:opacity-90"
        >
          {!showForm && <Plus className="size-4" />}
          {showForm ? "Cancel" : "New Project"}
        </Button>
      </div>

      <Reveal show={showForm} className="mt-6">
        <Card>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  required
                  placeholder="Project name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-description">Description (optional)</Label>
                <Textarea
                  id="project-description"
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-20 resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-base-url">Base URL</Label>
                <Input
                  id="project-base-url"
                  type="url"
                  placeholder="https://your-app.com — needed to generate automation"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating && <Spinner className="h-4 w-4" />}
                {creating ? "Creating..." : "Create Project"}
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

      <div ref={listRef} className="mt-6 space-y-2">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Loading...
          </p>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No projects yet. Create your first one to get started.
            </p>
          </div>
        ) : (
          projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="block">
              <Card className="flex-row items-center justify-between px-4 py-3.5 transition-colors hover:bg-primary/5 hover:ring-primary/40">
                <div className="min-w-0 pr-4">
                  <p className="truncate font-medium text-foreground">{p.name}</p>
                  {p.description && (
                    <p className="truncate text-sm text-muted-foreground">{p.description}</p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {p.test_suite_count} suite{p.test_suite_count === 1 ? "" : "s"}
                </Badge>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
