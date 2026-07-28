import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createRequirement, getTestSuite } from "../services/api";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useButtonPress } from "../motion/useButtonPress";

export default function TestSuiteDetail() {
  const { suiteId } = useParams();
  const [suite, setSuite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const listRef = useListStagger([loading, suite?.requirements.length]);
  const submitPress = useButtonPress();

  function load() {
    setLoading(true);
    setError(null);
    return getTestSuite(suiteId)
      .then(setSuite)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRequirement(suiteId, { text, file });
      setText("");
      setFile(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected) setText("");
  }

  if (loading) {
    return (
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-gray-400 dark:text-gray-500">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (error && !suite) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to={`/projects/${suite.project_id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← Back to project
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {suite.name}
          </h1>
          {suite.description && (
            <p className="mt-1 text-gray-500 dark:text-gray-400">{suite.description}</p>
          )}
        </div>
        <Link
          to={`/suites/${suiteId}/automation`}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
        >
          Test Automation
        </Link>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Add a Requirement
      </h2>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <textarea
          className="h-32 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:bg-slate-950 dark:focus:ring-indigo-500/20"
          placeholder="Paste a user story, requirement, or acceptance criteria..."
          value={text}
          disabled={!!file}
          onChange={(e) => setText(e.target.value)}
        />

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-400 dark:hover:border-indigo-500/40">
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0">
              <path
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {file ? file.name : "Or upload a PDF requirement document"}
          </span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          {file && (
            <button
              type="button"
              className="text-xs font-medium text-red-500 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setFile(null);
              }}
            >
              Remove
            </button>
          )}
        </label>

        <button
          ref={submitPress.ref}
          {...submitPress.handlers}
          type="submit"
          disabled={submitting || (!text.trim() && !file)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Spinner className="h-4 w-4" />}
          {submitting ? "Analyzing & drafting test cases..." : "Add & Analyze Requirement"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Requirements in this Suite
      </h2>
      {suite.requirements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm italic text-gray-400 dark:text-gray-500">
            No requirements yet.
          </p>
        </div>
      ) : (
        <div ref={listRef} className="space-y-2">
          {suite.requirements.map((r) => (
            <Link
              key={r.id}
              to={`/requirements/${r.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/60"
            >
              <div className="min-w-0 pr-4">
                <p className="truncate font-medium text-gray-900 dark:text-white">{r.name}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                  {r.approved_test_case_count}/{r.test_case_count} approved
                </span>
                {r.has_report && (
                  <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Report ready
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
