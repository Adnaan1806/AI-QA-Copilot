import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateAutomationAndReport, getRequirement } from "../services/api";

export default function RequirementAutomation() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    return getRequirement(id)
      .then(setRequirement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateAutomationAndReport(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

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
  const allAccepted = totalCount > 0 && approvedCount === totalCount;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to={`/requirements/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        ← Back to requirement
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Test Automation
          </h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            {requirement.name} · {approvedCount}/{totalCount} test case
            {totalCount === 1 ? "" : "s"} accepted
          </p>
        </div>
        {allAccepted && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {generating
              ? "Generating..."
              : requirement.report
                ? "Regenerate"
                : "Generate Automation & Report"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      {requirement.automation_scripts.length === 0 && !requirement.report ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm italic text-gray-400 dark:text-gray-500">
            {totalCount === 0 ? (
              <>
                No test cases yet. Go to{" "}
                <Link
                  to={`/requirements/${id}/test-cases`}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Requirement Analysis & Test Cases
                </Link>{" "}
                to generate some.
              </>
            ) : allAccepted ? (
              "Not generated yet. Click “Generate Automation & Report” above."
            ) : (
              <>
                Accept all test cases on{" "}
                <Link
                  to={`/requirements/${id}/test-cases`}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Requirement Analysis & Test Cases
                </Link>{" "}
                before generating automation.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {requirement.automation_scripts.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
                Automation Scripts (Playwright)
              </h2>
              <div className="space-y-3">
                {requirement.automation_scripts.map((script) => {
                  const tc = requirement.test_cases.find((t) => t.id === script.test_case_id);
                  return (
                    <details
                      key={script.test_case_id}
                      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                        {tc ? tc.title : script.test_case_id}
                      </summary>
                      <pre className="overflow-x-auto bg-gray-900 p-4 text-xs text-gray-100">
                        <code>{script.code}</code>
                      </pre>
                    </details>
                  );
                })}
              </div>
            </>
          )}

          {requirement.report && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
                Report
              </h2>
              <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {requirement.report.summary}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Coverage Analysis
                    </h3>
                    <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                      {requirement.report.coverage_analysis.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300 dark:bg-slate-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      Quality Risks
                    </h3>
                    <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                      {requirement.report.quality_risks.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300 dark:bg-red-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                  Release recommendation: {requirement.report.release_recommendation}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
