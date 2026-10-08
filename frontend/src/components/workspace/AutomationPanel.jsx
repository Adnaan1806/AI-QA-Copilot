import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Download, RotateCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { caseLabel, plural } from "../../lib/qa";
import { Button } from "../ui/button";
import { StateChip } from "../QaChips";
import CaseStrip from "../CaseStrip";
import AutomationProgressBar from "../AutomationProgressBar";
import Spinner from "../../motion/Spinner";
import { EmptyState } from "../StatusMessages";
import VerdictBanner from "./VerdictBanner";

function Tally({ states, counts }) {
  const notAutomated = counts.draft + counts.approved;
  return (
    <div className="tabular flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <CaseStrip states={states} />
      <span className="flex items-center gap-1.5 text-pass">
        <span className="size-2 rounded-full bg-pass" />
        {counts.passed} passed
      </span>
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
      {counts.rejected > 0 && <span className="text-muted-foreground">{counts.rejected} rejected, not run</span>}
    </div>
  );
}

function ScriptDetail({ script }) {
  return (
    <div className="space-y-3">
      {script.status === "needs_review" && script.last_output && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-review">Why the last run failed</h4>
          <pre className="max-h-72 overflow-auto rounded-md border border-review/30 bg-review-wash p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {script.last_output}
          </pre>
        </div>
      )}
      <div className="space-y-1.5">
        <h4 className="text-xs text-muted-foreground">Playwright script ({script.framework})</h4>
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
  const firstFailing = cases.find((tc) => scriptsById.get(tc.id)?.status === "needs_review");
  const [openId, setOpenId] = useState(firstFailing?.id ?? null);
  const hasResults = cases.some((tc, i) => states[i] !== "rejected" && scriptsById.has(tc.id));

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
        <VerdictBanner recommendation={requirement.report.release_recommendation} actions={generateButton}>
          <Tally states={states} counts={counts} />
          {baseUrlNote}
        </VerdictBanner>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-4">
          <Tally states={states} counts={counts} />
          {generateButton}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left text-xs text-muted-foreground">
              <th className="w-[52%] px-4 py-2 font-medium">Case</th>
              <th className="px-4 py-2 font-medium">Result</th>
              <th className="px-4 py-2 font-medium">Tries</th>
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
                    <td colSpan={3} className="px-4 py-2.5">
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
                        <StateChip state={script.status === "passed" ? "passed" : "needs_review"} />
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-muted-foreground">{script.attempts}</td>
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
                      <td colSpan={4} className="px-4 pt-1 pb-4">
                        <ScriptDetail script={script} />
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
