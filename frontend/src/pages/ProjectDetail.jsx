import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createTestSuite, getProject, listTestSuites, updateProject } from "../services/api";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useButtonPress } from "../motion/useButtonPress";
import { useMountFade } from "../motion/useMountFade";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:bg-slate-950 dark:focus:ring-indigo-500/20";

function EditableBaseUrl({ baseUrl, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(baseUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const savePress = useButtonPress();
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
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Base URL:{" "}
          {baseUrl ? (
            <span className="font-medium text-gray-700 dark:text-gray-300">{baseUrl}</span>
          ) : (
            <span className="italic text-amber-600 dark:text-amber-400">
              not set — required to generate automation
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit base URL"
          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <path
              d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={fadeRef} className="mt-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="url"
          placeholder="https://your-app.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass}
        />
        <button
          ref={savePress.ref}
          {...savePress.handlers}
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
        >
          {saving && <Spinner className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(baseUrl);
            setEditing(false);
            setError(null);
          }}
          className="shrink-0 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
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
  const newSuitePress = useButtonPress();
  const createPress = useButtonPress();

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
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-gray-400 dark:text-gray-500">
        <Spinner className="h-4 w-4" /> Loading...
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
          <EditableBaseUrl baseUrl={project.base_url} onSave={handleSaveBaseUrl} />
        </div>
        <button
          ref={newSuitePress.ref}
          {...newSuitePress.handlers}
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25"
        >
          {showForm ? "Cancel" : "New Test Suite"}
        </button>
      </div>

      <Reveal show={showForm} className="mt-6">
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
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
            ref={createPress.ref}
            {...createPress.handlers}
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {creating && <Spinner className="h-4 w-4" />}
            {creating ? "Creating..." : "Create Test Suite"}
          </button>
        </form>
      </Reveal>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <h2 className="mt-10 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Test Suites
      </h2>
      <div ref={listRef} className="space-y-2">
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
