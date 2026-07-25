import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRequirement, updateRequirementName } from "../services/api";

function EditableName({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setValue(name);
  }, [name]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {name}
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit name"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
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
    <div>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-xl font-bold text-gray-900 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500 dark:focus:bg-slate-950 dark:focus:ring-indigo-500/20"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(name);
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

const MODULE_ICONS = {
  analysis: (
    <path
      d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  automation: (
    <path
      d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  performance: (
    <path
      d="M3 3v18h18M7 15l4-4 3 3 5-6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

function ModuleLinkCard({ to, icon, title, subtitle, disabled }) {
  const card = (
    <div
      className={`flex aspect-square h-full flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center shadow-sm transition-colors ${
        disabled
          ? "cursor-not-allowed border-dashed border-gray-300 bg-gray-50/60 dark:border-slate-700 dark:bg-slate-900/40"
          : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/60"
      }`}
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${
          disabled
            ? "bg-gray-200 text-gray-400 dark:bg-slate-800 dark:text-gray-500"
            : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          {MODULE_ICONS[icon]}
        </svg>
      </span>
      <div>
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
  );

  if (disabled) return card;
  return (
    <Link to={to} className="block h-full">
      {card}
    </Link>
  );
}

export default function RequirementDetail() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getRequirement(id)
      .then(setRequirement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <p className="mx-auto max-w-5xl p-8 text-sm text-gray-400 dark:text-gray-500">
        Loading...
      </p>
    );
  }

  if (error && !requirement) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
        {error}
      </p>
    );
  }

  const totalCount = requirement.test_cases.length;
  const approvedCount = requirement.test_cases.filter((tc) => tc.status === "approved").length;

  async function handleRenameSave(newName) {
    const updated = await updateRequirementName(id, newName);
    setRequirement(updated);
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to={`/suites/${requirement.suite_id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← Back to suite
      </Link>

      <EditableName name={requirement.name} onSave={handleRenameSave} />
      <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-gray-300">
        {requirement.content}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ModuleLinkCard
          to={`/requirements/${id}/test-cases`}
          icon="analysis"
          title="Requirement Analysis & Test Cases"
          subtitle={
            totalCount === 0
              ? "No test cases yet"
              : `${totalCount} test case${totalCount === 1 ? "" : "s"} · ${approvedCount} accepted`
          }
        />
        <ModuleLinkCard
          to={`/requirements/${id}/automation`}
          icon="automation"
          title="Test Automation"
          subtitle={
            requirement.report
              ? "Playwright scripts and release report ready"
              : approvedCount > 0
                ? "Ready to generate"
                : "Accept test cases first"
          }
        />
        <ModuleLinkCard icon="performance" title="Performance" subtitle="Coming soon" disabled />
      </div>
    </div>
  );
}
