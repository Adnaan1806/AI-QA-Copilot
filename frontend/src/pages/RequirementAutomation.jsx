import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateAutomationAndReport, getRequirement } from "../services/api";
import Accordion, { ChevronIcon } from "../motion/Accordion";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useButtonPress } from "../motion/useButtonPress";
import { useMountFade } from "../motion/useMountFade";
import { usePulseOnChange } from "../motion/usePulseOnChange";
import { useListStagger } from "../motion/useListStagger";
import AutomationProgressBar from "../components/AutomationProgressBar";

const SCRIPT_STATUS_STYLES = {
  passed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  needs_review: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
};

function ScriptStatusBadge({ status }) {
  const ref = usePulseOnChange(status);
  return (
    <span
      ref={ref}
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-300 ${
        SCRIPT_STATUS_STYLES[status] || SCRIPT_STATUS_STYLES.passed
      }`}
    >
      {status === "needs_review" ? "Needs review" : "Passed"}
    </span>
  );
}

export default function RequirementAutomation() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const generatePress = useButtonPress();
  const scriptsRef = useListStagger([requirement?.automation_scripts.length]);
  const reportFadeRef = useMountFade([!!requirement?.report]);

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
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-gray-400 dark:text-gray-500">
        <Spinner className="h-4 w-4" /> Loading...
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
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
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
            ref={generatePress.ref}
            {...generatePress.handlers}
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating && <Spinner className="h-3.5 w-3.5" />}
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

      <Reveal show={generating} className="mt-6">
        <AutomationProgressBar />
      </Reveal>

      {!generating && requirement.automation_scripts.length === 0 && !requirement.report ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm italic text-gray-400 dark:text-gray-500">
            {totalCount === 0 ? (
              <>
                No test cases yet. Go to{" "}
                <Link
                  to={`/requirements/${id}/test-cases`}
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
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
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
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
                Automation Scripts (pytest-playwright)
              </h2>
              <div ref={scriptsRef} className="space-y-3">
                {requirement.automation_scripts.map((script) => {
                  const tc = requirement.test_cases.find((t) => t.id === script.test_case_id);
                  return (
                    <Accordion
                      key={script.test_case_id}
                      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                      summary={(open) => (
                        <>
                          <span className="truncate">{tc ? tc.title : script.test_case_id}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                              {script.attempts} attempt{script.attempts === 1 ? "" : "s"}
                            </span>
                            <ScriptStatusBadge status={script.status} />
                            <ChevronIcon open={open} className="h-4 w-4 shrink-0 text-gray-400" />
                          </span>
                        </>
                      )}
                    >
                      <pre className="overflow-x-auto bg-gray-900 p-4 text-xs text-gray-100">
                        <code>{script.code}</code>
                      </pre>
                      {script.status === "needs_review" && script.last_output && (
                        <div className="border-t border-gray-200 dark:border-slate-800">
                          <Accordion
                            buttonClassName="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400"
                            summary={(open) => (
                              <>
                                Last failure output
                                <ChevronIcon open={open} className="h-3.5 w-3.5 shrink-0" />
                              </>
                            )}
                          >
                            <pre className="overflow-x-auto bg-gray-900 p-4 text-xs text-amber-200">
                              <code>{script.last_output}</code>
                            </pre>
                          </Accordion>
                        </div>
                      )}
                    </Accordion>
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
              <div
                ref={reportFadeRef}
                className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
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
                <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm font-medium text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
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
