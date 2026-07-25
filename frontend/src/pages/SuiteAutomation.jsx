import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateAutomationAndReport, getTestSuite } from "../services/api";

export default function SuiteAutomation() {
  const { suiteId } = useParams();
  const [suite, setSuite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);

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

  async function handleGenerate(requirementId) {
    setGeneratingId(requirementId);
    setError(null);
    try {
      await generateAutomationAndReport(requirementId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingId(null);
    }
  }

  if (loading) {
    return (
      <p className="mx-auto max-w-5xl p-8 text-sm text-gray-400 dark:text-gray-500">
        Loading...
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

  const eligible = suite.requirements.filter(
    (r) => r.test_case_count > 0 && r.approved_test_case_count === r.test_case_count,
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to={`/suites/${suiteId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← Back to suite
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        Test Automation
      </h1>
      <p className="mt-1 text-gray-500 dark:text-gray-400">
        {suite.name} · Playwright scripts and release reports for requirements with accepted
        test cases
      </p>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-8 space-y-2">
        {eligible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No requirements with accepted test cases yet. Open a requirement, accept its test
              cases, then come back here to generate automation.
            </p>
          </div>
        ) : (
          eligible.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0 pr-4">
                <p className="truncate font-medium text-gray-900 dark:text-white">{r.name}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {r.approved_test_case_count}/{r.test_case_count} accepted
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.has_report && (
                  <Link
                    to={`/requirements/${r.id}/automation`}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
                  >
                    View Results
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => handleGenerate(r.id)}
                  disabled={generatingId === r.id}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {generatingId === r.id
                    ? "Generating..."
                    : r.has_report
                      ? "Regenerate"
                      : "Generate Automation & Report"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
