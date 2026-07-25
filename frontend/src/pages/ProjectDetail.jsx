import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createTestSuite, getProject, listTestSuites } from "../services/api";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:bg-slate-950 dark:focus:ring-indigo-500/20";

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
      <p className="mx-auto max-w-5xl p-8 text-sm text-gray-400 dark:text-gray-500">
        Loading...
      </p>
    );
  }

  if (error && !project) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← Back to projects
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {project.name}
          </h1>
          {project.description && (
            <p className="mt-1 text-gray-500 dark:text-gray-400">{project.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-transform hover:scale-[1.02]"
        >
          {showForm ? "Cancel" : "New Test Suite"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mt-6 space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <input
            required
            placeholder="Test suite name"
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
          <button
            type="submit"
            disabled={creating}
            className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {creating ? "Creating..." : "Create Test Suite"}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <h2 className="mt-10 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Test Suites
      </h2>
      <div className="space-y-2">
        {suites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No test suites yet. Create one to start a requirement → test case → automation
              workflow.
            </p>
          </div>
        ) : (
          suites.map((s) => (
            <Link
              key={s.id}
              to={`/suites/${s.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/60"
            >
              <div className="min-w-0 pr-4">
                <p className="truncate font-medium text-gray-900 dark:text-white">{s.name}</p>
                {s.description && (
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {s.description}
                  </p>
                )}
              </div>
              <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                {s.requirement_count} requirement{s.requirement_count === 1 ? "" : "s"}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
