import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, RotateCw } from "lucide-react";
import {
  downloadTestCaseTrace,
  generateAutomationAndReport,
  getRequirement,
  rerunTestCaseAutomation,
} from "../services/api";
import Accordion, { ChevronIcon } from "../motion/Accordion";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useMountFade } from "../motion/useMountFade";
import { usePulseOnChange } from "../motion/usePulseOnChange";
import { useListStagger } from "../motion/useListStagger";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import AutomationProgressBar from "../components/AutomationProgressBar";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const SCRIPT_STATUS_STYLES = {
  passed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  needs_review: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
};

function ScriptStatusBadge({ status }) {
  const ref = usePulseOnChange(status);
  return (
    <Badge
      ref={ref}
      className={`transition-colors duration-300 ${SCRIPT_STATUS_STYLES[status] || SCRIPT_STATUS_STYLES.passed}`}
    >
      {status === "needs_review" ? "Needs review" : "Passed"}
    </Badge>
  );
}

export default function RequirementAutomation() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloadingTraceId, setDownloadingTraceId] = useState(null);
  const [rerunningId, setRerunningId] = useState(null);
  const scriptsRef = useListStagger([requirement?.automation_scripts.length]);
  const reportFadeRef = useMountFade([!!requirement?.report]);

  useSetBreadcrumbs(
    requirement
      ? [
          { label: "Projects", to: "/" },
          { label: requirement.name, to: `/requirements/${id}` },
          { label: "Test Automation" },
        ]
      : [],
  );

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

  async function handleRerunTestCase(testCaseId) {
    setRerunningId(testCaseId);
    setError(null);
    try {
      const updated = await rerunTestCaseAutomation(testCaseId);
      setRequirement(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setRerunningId(null);
    }
  }

  async function handleDownloadTrace(testCaseId) {
    setDownloadingTraceId(testCaseId);
    setError(null);
    try {
      await downloadTestCaseTrace(testCaseId);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingTraceId(null);
    }
  }

  if (loading) {
    return (
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (error && !requirement) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-sm text-destructive">
        {error}
      </p>
    );
  }

  const totalCount = requirement.test_cases.length;
  const approvedCount = requirement.test_cases.filter((tc) => tc.status === "approved").length;
  const allAccepted = totalCount > 0 && approvedCount === totalCount;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Test Automation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {requirement.name} · {approvedCount}/{totalCount} test case
            {totalCount === 1 ? "" : "s"} accepted
          </p>
        </div>
        {allAccepted && (
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-1.5 bg-linear-to-r from-primary to-emerald-500 text-white shadow-sm shadow-primary/25 hover:opacity-90"
          >
            {generating && <Spinner className="h-3.5 w-3.5" />}
            {generating
              ? "Generating..."
              : requirement.report
                ? "Regenerate"
                : "Generate Automation & Report"}
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Reveal show={generating} className="mt-6">
        <AutomationProgressBar requirementId={id} />
      </Reveal>

      {!generating && requirement.automation_scripts.length === 0 && !requirement.report ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm italic text-muted-foreground">
            {totalCount === 0 ? (
              <>
                No test cases yet. Go to{" "}
                <Link
                  to={`/requirements/${id}/test-cases`}
                  className="font-medium text-primary hover:underline"
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
                  className="font-medium text-primary hover:underline"
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
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                Automation Scripts (pytest-playwright)
              </h2>
              <div ref={scriptsRef} className="space-y-3">
                {requirement.automation_scripts.map((script) => {
                  const tc = requirement.test_cases.find((t) => t.id === script.test_case_id);
                  return (
                    <Card key={script.test_case_id} className="overflow-hidden py-0">
                      <Accordion
                        summary={(open) => (
                          <>
                            <span className="truncate">{tc ? tc.title : script.test_case_id}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="text-xs font-normal text-muted-foreground">
                                {script.attempts} attempt{script.attempts === 1 ? "" : "s"}
                              </span>
                              <ScriptStatusBadge status={script.status} />
                              <ChevronIcon
                                open={open}
                                className="h-4 w-4 shrink-0 text-muted-foreground"
                              />
                            </span>
                          </>
                        )}
                        headerActions={
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Rerun this test case's automation"
                              title="Rerun just this test case, without regenerating everything else"
                              disabled={rerunningId === script.test_case_id}
                              onClick={() => handleRerunTestCase(script.test_case_id)}
                            >
                              {rerunningId === script.test_case_id ? (
                                <Spinner className="size-4" />
                              ) : (
                                <RotateCw className="size-4" />
                              )}
                            </Button>
                            {script.has_trace && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Download Playwright trace"
                                title="Download Playwright trace (open with npx playwright show-trace, or drop it into trace.playwright.dev)"
                                disabled={downloadingTraceId === script.test_case_id}
                                onClick={() => handleDownloadTrace(script.test_case_id)}
                              >
                                {downloadingTraceId === script.test_case_id ? (
                                  <Spinner className="size-4" />
                                ) : (
                                  <Download className="size-4" />
                                )}
                              </Button>
                            )}
                          </>
                        }
                      >
                        <pre className="overflow-x-auto bg-zinc-900 p-4 text-xs text-zinc-100">
                          <code>{script.code}</code>
                        </pre>
                        {script.status === "needs_review" && script.last_output && (
                          <div className="border-t border-border">
                            <Accordion
                              buttonClassName="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-400"
                              summary={(open) => (
                                <>
                                  Last failure output
                                  <ChevronIcon open={open} className="h-3.5 w-3.5 shrink-0" />
                                </>
                              )}
                            >
                              <pre className="overflow-x-auto bg-zinc-900 p-4 text-xs text-amber-200">
                                <code>{script.last_output}</code>
                              </pre>
                            </Accordion>
                          </div>
                        )}
                      </Accordion>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {requirement.report && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-foreground">Report</h2>
              <Card ref={reportFadeRef} className="space-y-4 p-5">
                <p className="text-sm text-muted-foreground">{requirement.report.summary}</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      Coverage Analysis
                    </h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {requirement.report.coverage_analysis.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">Quality Risks</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {requirement.report.quality_risks.map((item, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300 dark:bg-red-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm font-medium text-primary">
                  Release recommendation: {requirement.report.release_recommendation}
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
