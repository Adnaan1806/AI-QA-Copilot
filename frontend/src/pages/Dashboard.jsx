import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createProject, listProjects } from "../services/api";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useButtonPress } from "../motion/useButtonPress";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:bg-slate-950 dark:focus:ring-indigo-500/20";

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
  const newProjectPress = useButtonPress();
  const createPress = useButtonPress();

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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Projects
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Organize your QA work by project.
          </p>
        </div>
        <button
          ref={newProjectPress.ref}
          {...newProjectPress.handlers}
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25"
        >
          {showForm ? "Cancel" : "New Project"}
        </button>
      </div>

      <Reveal show={showForm} className="mt-6">
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            required
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`h-20 resize-none ${inputClass}`}
          />
          <input
            type="url"
            placeholder="Base URL (e.g. https://your-app.com) — needed to generate automation"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className={inputClass}
          />
          <button
            ref={createPress.ref}
            {...createPress.handlers}
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {creating && <Spinner className="h-4 w-4" />}
            {creating ? "Creating..." : "Create Project"}
          </button>
        </form>
      </Reveal>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div ref={listRef} className="mt-6 space-y-2">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <Spinner className="h-4 w-4" /> Loading...
          </p>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No projects yet. Create your first one to get started.
            </p>
          </div>
        ) : (
          projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/60"
            >
              <div className="min-w-0 pr-4">
                <p className="truncate font-medium text-gray-900 dark:text-white">{p.name}</p>
                {p.description && (
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {p.description}
                  </p>
                )}
              </div>
              <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                {p.test_suite_count} suite{p.test_suite_count === 1 ? "" : "s"}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
