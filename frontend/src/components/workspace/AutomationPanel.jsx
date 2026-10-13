import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Download, RotateCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { CASE_STATE_LABEL, caseLabel, formatDate, isFlaky, plural, resultState } from "../../lib/qa";
import { Button } from "../ui/button";
import { StateChip } from "../QaChips";
import CaseStrip from "../CaseStrip";
import AutomationProgressBar from "../AutomationProgressBar";
import Spinner from "../../motion/Spinner";
import { EmptyState } from "../StatusMessages";
import VerdictBanner from "./VerdictBanner";
import TryHistory from "./TryHistory";

function Tally({ states, counts, flaky }) {
  const notAutomated = counts.draft + counts.approved;
  return (
    <div className="tabular flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <CaseStrip states={states} />
      <span className="flex items-center gap-1.5 text-pass">
        <span className="size-2 rounded-full bg-pass" />
        {counts.passed} passed
      </span>
      {counts.failed > 0 && (
        <span className="flex items-center gap-1.5 text-fail">
          <span className="size-2 rounded-full bg-fail" />
          {counts.failed} failed
        </span>
      )}
      <span className="flex items-center gap-1.5 text-review">
        <span className="size-2 rounded-full bg-review" />
        {counts.needs_review} needs review
      </span>
      {notAutomated > 0 && (
        <span className="text-muted-foreground">
          {notAutomated} not automated
          {counts.draft > 0 && `, ${counts.draft} waiting for approval`}
        </span>
      )}
      {flaky > 0 && <span className="text-review">{plural(flaky, "flaky case")}</span>}
      {counts.rejected > 0 && <span className="text-muted-foreground">{counts.rejected} rejected, not run</span>}
    </div>
  );
}

const RESULT_DOT = { passed: "bg-pass", failed: "bg-fail", needs_review: "bg-review" };
const RESULT_TEXT = { passed: undefined, failed: "text-fail", needs_review: "text-review" };

function runLabel(run) {
  const result = CASE_STATE_LABEL[resultState(run.status)];
  return `${result} on ${formatDate(run.created_at)}, ${plural(run.attempts, "try", "tries")}`;
}

// Oldest to newest, left to right, so the latest result sits next to the Result column.
function RunDots({ runs }) {
  if (!runs.length) return <span className="text-xs text-muted-foreground">None</span>;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`Last ${plural(runs.length, "run")}`}>
      {[...runs].reverse().map((run, i) => (
        <span
          key={i}
          title={runLabel(run)}
          className={cn("size-2 rounded-full", RESULT_DOT[resultState(run.status)])}
        />
      ))}
    </span>
  );
}

// Collapsed to a one-line summary; runs that disagree show in amber so a flaky
// case stands out without opening the list.
function RunHistory({ runs }) {
  const [open, setOpen] = useState(false);
  const failed = runs.filter((run) => run.status !== "passed").length;
  const passed = runs.length - failed;
  const outcome =
    failed === 0 ? "all passed" : passed === 0 ? "all need review" : `${passed} passed, ${failed} needs review`;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="tabular flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <span>
          Run history · {plural(runs.length, "run")},{" "}
          <span className={failed ? "text-review" : undefined}>{outcome}</span> · latest{" "}
          {formatDate(runs[0].created_at)}
        </span>
      </button>
      {open && (
        <ol className="tabular space-y-0.5 pl-[18px] text-xs">
          {runs.map((run, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", RESULT_DOT[resultState(run.status)])} />
              <span className={RESULT_TEXT[resultState(run.status)]}>{runLabel(run)}</span>
              {i === 0 && <span className="text-muted-foreground">(latest)</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ScriptDetail({ testCaseId, script }) {
  return (
    <div className="space-y-3">
      {script.status !== "passed" && script.last_output && (
        <div className="space-y-1.5">
          <h4 className={cn("text-xs font-medium", script.status === "failed" ? "text-fail" : "text-review")}>
            {script.status === "failed" ? "Why the case failed" : "Why the last run failed"}
          </h4>
          <pre
            className={cn(
              "max-h-72 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap",
              script.status === "failed" ? "border-fail/30 bg-fail-wash" : "border-review/30 bg-review-wash",
            )}
          >
            {script.last_output}
          </pre>
        </div>
      )}
      {script.runs.length > 1 && <RunHistory runs={script.runs} />}
      {/* Refetch whenever a new run lands, so the tries match the result shown. */}
      <TryHistory testCaseId={testCaseId} currentCode={script.code} version={script.runs[0]?.created_at ?? ""} />
      <div className="space-y-1.5">
        <h4 className="text-xs text-muted-foreground">Current script ({script.framework})</h4>
        <pre className="max-h-96 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed">
          <code>{script.code}</code>
        </pre>
      </div>
    </div>
  );
}

export default function AutomationPanel({
  requirement,
  states,
  counts,
  scriptsById,
  canGenerate,
  baseUrlMissing,
  projectId,
  generating,
  rerunningId,
  downloadingTraceId,
  onGenerate,
  onRerun,
  onDownloadTrace,
  onOpenReview,
}) {
  const cases = requirement.test_cases;
  const firstFailing = cases.find((tc) => {
    const status = scriptsById.get(tc.id)?.status;
    return status !== undefined && status !== "passed";
  });
  const [openId, setOpenId] = useState(firstFailing?.id ?? null);
  const hasResults = cases.some((tc, i) => states[i] !== "rejected" && scriptsById.has(tc.id));
  const flakyCount = cases.filter((tc, i) => states[i] !== "rejected" && isFlaky(scriptsById.get(tc.id)?.runs)).length;

  const generateButton = canGenerate && (
    <Button
      onClick={onGenerate}
      disabled={generating || baseUrlMissing}
      variant={requirement.report && counts.approved === 0 ? "outline" : "default"}
    >
      {generating ? <Spinner className="size-3.5" /> : requirement.report && <RotateCw />}
      {requirement.report ? "Re-run automation" : "Generate automation"}
    </Button>
  );

  const baseUrlNote = baseUrlMissing && (
    <p className="text-sm text-review">
      Add the app URL on the{" "}
      <Link to={`/projects/${projectId}`} className="underline">
        project
      </Link>{" "}
      before generating automation.
    </p>
  );

  if (!hasResults && !generating) {
    return (
      <EmptyState action={canGenerate ? generateButton : null}>
        {cases.length === 0 ? (
          "Add test cases in Review first. Automation runs on approved cases."
        ) : !canGenerate ? (
          <>
            {plural(counts.draft, "case")} still {counts.draft === 1 ? "needs" : "need"} review. Automation runs once
            every case is approved or rejected.{" "}
            <button type="button" onClick={() => onOpenReview()} className="text-primary hover:underline">
              Go to review
            </button>
          </>
        ) : (
          "Every case is reviewed. Generate Playwright scripts and a release report for the approved cases."
        )}
        {baseUrlNote}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {generating && <AutomationProgressBar requirementId={requirement.requirement_id} />}

      {requirement.report ? (
        <VerdictBanner
          recommendation={requirement.report.release_recommendation}
          verdict={requirement.report.verdict}
          actions={generateButton}
        >
          <Tally states={states} counts={counts} flaky={flakyCount} />
          {baseUrlNote}
        </VerdictBanner>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-4">
          <Tally states={states} counts={counts} flaky={flakyCount} />
          {generateButton}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs text-muted-foreground">
              <th className="w-[46%] px-4 py-2 font-medium">Case</th>
              <th className="px-4 py-2 font-medium">Result</th>
              <th className="px-4 py-2 font-medium">Tries</th>
              <th className="px-4 py-2 font-medium" title="Most recent on the right">Recent runs</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((tc, i) => {
              const state = states[i];
              if (state === "rejected") return null;
              const script = scriptsById.get(tc.id);
              const label = caseLabel(i);

              if (!script || state === "draft") {
                return (
                  <tr key={tc.id} className="border-t border-border bg-background/60 text-muted-foreground first:border-t-0">
                    <td className="px-4 py-2.5">
                      <span className="tabular mr-2">{label}</span>
                      {tc.title}
                    </td>
                    <td colSpan={4} className="px-4 py-2.5">
                      {state === "draft" ? (
                        <>
                          Not automated.{" "}
                          <button type="button" onClick={() => onOpenReview(tc.id)} className="text-primary hover:underline">
                            Review it
                          </button>
                        </>
                      ) : (
                        "Approved after the last run. Re-run automation to include it."
                      )}
                    </td>
                  </tr>
                );
              }

              const open = openId === tc.id;
              const rerunning = rerunningId === tc.id;
              return (
                <Fragment key={tc.id}>
                  <tr className={cn("border-t border-border first:border-t-0", open && "bg-muted/50")}>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : tc.id)}
                        aria-expanded={open}
                        className="flex items-start gap-1.5 text-left hover:text-primary"
                      >
                        <ChevronRight
                          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                        />
                        <span>
                          <span className="tabular mr-2 text-muted-foreground">{label}</span>
                          {tc.title}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      {rerunning ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Spinner className="size-3" /> Running
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StateChip state={resultState(script.status)} />
                          {isFlaky(script.runs) && (
                            <span
                              className="inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium text-review ring-1 ring-review/40 ring-inset"
                              title="Recent runs of this case both passed and failed"
                            >
                              Flaky
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-muted-foreground">{script.attempts}</td>
                    <td className="px-4 py-2.5">
                      <RunDots runs={script.runs} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {script.has_trace && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={downloadingTraceId === tc.id}
                            onClick={() => onDownloadTrace(tc.id)}
                            title="Open with npx playwright show-trace, or drop it into trace.playwright.dev"
                          >
                            {downloadingTraceId === tc.id ? <Spinner className="size-3" /> : <Download />}
                            Trace
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rerunning || generating || rerunningId !== null}
                          onClick={() => onRerun(tc.id)}
                          title="Re-run just this case and refresh the report"
                        >
                          <RotateCw />
                          Re-run
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-muted/50">
                      <td colSpan={5} className="px-4 pt-1 pb-4">
                        <ScriptDetail testCaseId={tc.id} script={script} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
