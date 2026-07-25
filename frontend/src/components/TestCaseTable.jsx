import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

const TYPE_STYLES = {
  functional: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  negative: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  edge_case: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  security: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const PRIORITY_DOT = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-gray-400 dark:bg-slate-500",
};

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
};

const TYPE_OPTIONS = ["functional", "negative", "edge_case", "security"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];

const editInputClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:bg-slate-950 dark:focus:ring-indigo-500/20";

function TypeBadge({ label }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
        TYPE_STYLES[label] || "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400"
      }`}
    >
      {label.replace("_", " ")}
    </span>
  );
}

function PriorityBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-gray-600 dark:text-gray-300">
      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[label] || PRIORITY_DOT.low}`} />
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
        STATUS_STYLES[status] || STATUS_STYLES.draft
      }`}
    >
      {status}
    </span>
  );
}

function EditableRow({ tc, onSave, onCancel }) {
  const [title, setTitle] = useState(tc.title);
  const [type, setType] = useState(tc.type);
  const [steps, setSteps] = useState(tc.steps.join("\n"));
  const [expectedResult, setExpectedResult] = useState(tc.expected_result);
  const [priority, setPriority] = useState(tc.priority);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        title,
        type,
        steps: steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        expected_result: expectedResult,
        priority,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="align-top bg-indigo-50/30 dark:bg-slate-800/40">
      <td className="px-4 py-3.5">
        <input className={editInputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </td>
      <td className="px-4 py-3.5">
        <select className={editInputClass} value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3.5">
        <textarea
          className={`h-28 resize-none ${editInputClass}`}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
      </td>
      <td className="px-4 py-3.5">
        <textarea
          className={`h-28 resize-none ${editInputClass}`}
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
        />
      </td>
      <td className="px-4 py-3.5">
        <select
          className={editInputClass}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={tc.status} />
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function TestCaseTable({ testCases, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function confirmDelete() {
    const tc = pendingDelete;
    setPendingDelete(null);
    setDeletingId(tc.id);
    try {
      await onDelete(tc.id);
    } finally {
      setDeletingId(null);
    }
  }

  if (testCases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
        <p className="text-sm italic text-gray-400 dark:text-gray-500">No test cases yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-slate-950/60 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Steps</th>
            <th className="px-4 py-3 font-medium">Expected Result</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
          {testCases.map((tc) =>
            editingId === tc.id ? (
              <EditableRow
                key={tc.id}
                tc={tc}
                onSave={async (patch) => {
                  await onUpdate(tc.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <tr
                key={tc.id}
                className="align-top transition-colors hover:bg-gray-50/80 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                  {tc.title}
                </td>
                <td className="px-4 py-3.5">
                  <TypeBadge label={tc.type} />
                </td>
                <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                  <ul className="space-y-1">
                    {tc.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                  {tc.expected_result}
                </td>
                <td className="px-4 py-3.5">
                  <PriorityBadge label={tc.priority} />
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={tc.status} />
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(tc.id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(tc)}
                      disabled={deletingId === tc.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      {deletingId === tc.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete test case"
        message={
          pendingDelete && `Delete test case "${pendingDelete.title}"? This can't be undone.`
        }
        confirmLabel="Delete"
        danger
        confirming={deletingId === pendingDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
