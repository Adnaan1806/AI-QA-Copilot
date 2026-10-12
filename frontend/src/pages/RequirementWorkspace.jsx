import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import {
  approveAllTestCases,
  createTestCase,
  deleteTestCase,
  downloadTestCaseTrace,
  exportTestCases,
  generateAutomationAndReport,
  getProject,
  getRequirement,
  getTestSuite,
  listAccounts,
  rerunTestCaseAutomation,
  updateRequirementName,
  updateTestCase,
} from "../services/api";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { useDataVersion } from "../context/DataVersionContext";
import { Button } from "../components/ui/button";
import CaseStrip from "../components/CaseStrip";
import InlineEdit from "../components/InlineEdit";
import { StageTracker } from "../components/QaChips";
import { ErrorMessage, Page, PageError, PageLoading } from "../components/StatusMessages";
import ReviewPanel from "../components/workspace/ReviewPanel";
import AutomationPanel from "../components/workspace/AutomationPanel";
import ReportPanel from "../components/workspace/ReportPanel";
import { cn } from "../lib/utils";
import {
  activeTotal,
  caseState,
  countStates,
  describeCase,
  plural,
  readyToAutomate,
  scriptsByCaseId,
  signedOff,
  stageSteps,
} from "../lib/qa";

const TAB_PATH = { review: "", automation: "/automation", report: "/report" };

// "5 of 8 approved" with a bar that fills as cases are signed off; the count
// bumps when it goes up.
function ReviewProgress({ signed, total, rejected, reviewedNow, toGo }) {
  const previous = useRef(signed);
  const grew = signed > previous.current;
  useEffect(() => {
    previous.current = signed;
  }, [signed]);
  const pct = total ? Math.round((signed / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex flex-col gap-1.5">
        <span className="tabular flex gap-3 text-sm">
          <span key={signed} className={grew ? "animate-count-bump" : undefined}>
            {signed} of {plural(total, "case")} approved
          </span>
          {rejected > 0 && <span className="text-muted-foreground">{rejected} rejected</span>}
        </span>
        <span className="h-1 w-44 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className={cn("block h-full rounded-full transition-[width] duration-700 ease-out", pct === 100 ? "bg-pass" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>
      {reviewedNow > 0 && (
        <span className="tabular text-xs text-muted-foreground">
          {reviewedNow} reviewed this session{toGo > 0 && ` · ${toGo} to go`}
        </span>
      )}
    </div>
  );
}

function RequirementText({ content }) {
  const [expanded, setExpanded] = useState(false);
  const long = content.length > 280;
  return (
    <div className="max-w-[90ch] text-sm text-muted-foreground">
      <p className={cn("whitespace-pre-wrap", long && !expanded && "line-clamp-2")}>{content}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show less" : "Show full requirement"}
        </button>
      )}
    </div>
  );
}

export default function RequirementWorkspace({ tab }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const [requirement, setRequirement] = useState(null);
  const [suite, setSuite] = useState(null);
  const [project, setProject] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rerunningId, setRerunningId] = useState(null);
  const [downloadingTraceId, setDownloadingTraceId] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  // Cases signed off during this visit; finishing the last draft shows the done panel.
  const [reviewedNow, setReviewedNow] = useState(() => new Set());
  const [doneDismissed, setDoneDismissed] = useState(false);

  useSetBreadcrumbs(
    requirement && suite && project
      ? [
          { label: "Projects", to: "/" },
          { label: project.name, to: `/projects/${project.id}` },
          { label: suite.name, to: `/suites/${suite.id}` },
          { label: requirement.name },
        ]
      : [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRequirement(id)
      .then(async (r) => {
        const s = await getTestSuite(r.suite_id);
        const [p, a] = await Promise.all([getProject(s.project_id), listAccounts(s.project_id)]);
        if (cancelled) return;
        setRequirement(r);
        setSuite(s);
        setProject(p);
        setAccounts(a.accounts);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const scriptsById = useMemo(() => (requirement ? scriptsByCaseId(requirement) : new Map()), [requirement]);
  const states = useMemo(
    () => (requirement ? requirement.test_cases.map((tc) => caseState(tc, scriptsById)) : []),
    [requirement, scriptsById],
  );

  if (loading) return <PageLoading />;
  if (error && !requirement) return <PageError message={error} />;

  const counts = countStates(states);
  const cases = requirement.test_cases;
  const firstDraft = states.indexOf("draft");
  const selectedId = cases.some((c) => c.id === selectedCaseId)
    ? selectedCaseId
    : cases[firstDraft >= 0 ? firstDraft : 0]?.id ?? null;
  const celebrating = reviewedNow.size > 0 && counts.draft === 0 && cases.length > 0 && !doneDismissed;
  const caseTitles = requirement.test_cases.map((tc, i) => describeCase(tc, i, states[i]));
  const total = activeTotal(counts);
  const ready = readyToAutomate(counts);
  const baseUrlMissing = !project.base_url;
  // New approvals since the last run, or never run: automation is the next step.
  const automationDue = ready && (counts.approved > 0 || !requirement.report);

  function goTo(nextTab) {
    navigate(`/requirements/${id}${TAB_PATH[nextTab]}`);
  }

  async function run(action) {
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  function selectCase(caseId) {
    setSelectedCaseId(caseId);
    setDoneDismissed(true);
  }

  function noteReviewed(caseIds, reviewed) {
    setReviewedNow((prev) => {
      const next = new Set(prev);
      caseIds.forEach((caseId) => (reviewed ? next.add(caseId) : next.delete(caseId)));
      return next;
    });
    if (reviewed) setDoneDismissed(false);
  }

  function replaceCase(updated) {
    setRequirement((prev) => ({
      ...prev,
      test_cases: prev.test_cases.map((tc) => (tc.id === updated.id ? updated : tc)),
    }));
    bump();
  }

  const handlers = {
    onSetStatus: (caseId, status, rejectReason) =>
      run(async () => {
        replaceCase(await updateTestCase(caseId, { status, reject_reason: rejectReason }));
        noteReviewed([caseId], status !== "draft");
      }),
    onSaveCase: (caseId, patch) => run(async () => replaceCase(await updateTestCase(caseId, patch))),
    onCreateCase: (payload) =>
      run(async () => {
        const created = await createTestCase(id, payload);
        setRequirement((prev) => ({ ...prev, test_cases: [...prev.test_cases, created] }));
        bump();
        return created;
      }),
    onDeleteCase: (caseId) =>
      run(async () => {
        await deleteTestCase(caseId);
        setRequirement((prev) => ({
          ...prev,
          test_cases: prev.test_cases.filter((tc) => tc.id !== caseId),
          automation_scripts: prev.automation_scripts.filter((s) => s.test_case_id !== caseId),
        }));
        bump();
      }),
  };

  async function handleApproveAll() {
    setApprovingAll(true);
    try {
      const drafts = cases.filter((_, i) => states[i] === "draft").map((c) => c.id);
      const testCases = await run(() => approveAllTestCases(id));
      setRequirement((prev) => ({ ...prev, test_cases: testCases }));
      noteReviewed(drafts, true);
      toast.success(`Approved ${plural(drafts.length, "case")}`);
      bump();
    } catch {
      // Shown via `error`.
    } finally {
      setApprovingAll(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await run(() => exportTestCases(id));
    } catch {
      // Shown via `error`.
    } finally {
      setExporting(false);
    }
  }

  async function handleGenerate() {
    if (tab !== "automation") goTo("automation");
    setGenerating(true);
    try {
      setRequirement(await run(() => generateAutomationAndReport(id)));
      bump();
    } catch {
      // Shown via `error`.
    } finally {
      setGenerating(false);
    }
  }

  async function handleRerun(caseId) {
    setRerunningId(caseId);
    try {
      setRequirement(await run(() => rerunTestCaseAutomation(caseId)));
      bump();
    } catch {
      // Shown via `error`.
    } finally {
      setRerunningId(null);
    }
  }

  async function handleDownloadTrace(caseId) {
    setDownloadingTraceId(caseId);
    try {
      await run(() => downloadTestCaseTrace(caseId));
    } catch {
      // Shown via `error`.
    } finally {
      setDownloadingTraceId(null);
    }
  }

  const tabs = [
    { key: "review", label: "Review", count: counts.draft > 0 ? `${counts.draft} to review` : total },
    { key: "automation", label: "Automation", count: requirement.automation_scripts.length || null },
    { key: "report", label: "Report", count: null },
  ];

  return (
    <Page className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <InlineEdit
            label="Requirement name"
            required
            value={requirement.name}
            inputClassName="text-lg font-semibold"
            onSave={async (name) => {
              setRequirement(await updateRequirementName(id, name));
              bump();
            }}
            display={<h1 className="text-[22px] leading-tight font-semibold">{requirement.name}</h1>}
          />
          <StageTracker
            steps={stageSteps(counts, requirement.requirements.length > 0, !!requirement.report)}
            className="pt-1.5"
          />
        </div>

        <RequirementText content={requirement.content} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CaseStrip
              states={states}
              titles={caseTitles}
              selectedIndex={tab === "review" && !celebrating ? cases.findIndex((c) => c.id === selectedId) : undefined}
              onSelect={(i) => {
                selectCase(cases[i].id);
                if (tab !== "review") goTo("review");
              }}
            />
            <ReviewProgress
              signed={signedOff(counts)}
              total={total}
              rejected={counts.rejected}
              reviewedNow={reviewedNow.size}
              toGo={counts.draft}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ready && (
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? <Spinner className="size-3.5" /> : <Download />}
                Export to Excel
              </Button>
            )}
            {counts.draft > 0 && (
              <Button variant="outline" onClick={handleApproveAll} disabled={approvingAll}>
                {approvingAll && <Spinner className="size-3.5" />}
                Approve remaining {counts.draft}
              </Button>
            )}
          </div>
        </div>

        {automationDue && !generating && tab === "review" && !celebrating && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-pencil-wash px-4 py-3">
            <p className="text-sm">
              <span className="font-medium">Every case is reviewed.</span>{" "}
              {baseUrlMissing ? (
                <>
                  Add the app URL on the{" "}
                  <Link to={`/projects/${project.id}`} className="text-primary underline">
                    project
                  </Link>{" "}
                  to generate automation.
                </>
              ) : (
                "Generate Playwright scripts and the release report next."
              )}
            </p>
            {!baseUrlMissing && (
              <Button onClick={handleGenerate}>
                {requirement.report ? "Re-run automation" : "Generate automation"}
              </Button>
            )}
          </div>
        )}
      </header>

      <nav aria-label="Requirement sections" className="flex gap-6 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.key}
            to={`/requirements/${id}${TAB_PATH[t.key]}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-sm",
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== null && (
              <span className={cn("tabular text-xs", typeof t.count === "string" ? "text-primary" : "text-muted-foreground")}>
                {t.count}
              </span>
            )}
            {t.key === "automation" && generating && <Spinner className="size-3 text-primary" />}
          </Link>
        ))}
      </nav>

      <ErrorMessage message={error} />

      {tab === "review" && (
        <ReviewPanel
          requirement={requirement}
          states={states}
          scriptsById={scriptsById}
          counts={counts}
          accounts={accounts}
          projectId={project.id}
          selectedId={selectedId}
          onSelect={selectCase}
          celebrating={celebrating}
          onDismissDone={() => setDoneDismissed(true)}
          baseUrlMissing={baseUrlMissing}
          exporting={exporting}
          onGenerate={handleGenerate}
          onExport={handleExport}
          onAnswered={(answered) => {
            setRequirement((prev) => ({
              ...prev,
              missing_info: prev.missing_info.filter((q) => q !== answered.question),
              open_questions: (prev.open_questions ?? []).filter((q) => q !== answered.question),
              answered_questions: [...(prev.answered_questions ?? []), answered],
            }));
            bump();
          }}
          onOpenAutomation={() => goTo("automation")}
          {...handlers}
        />
      )}
      {tab === "automation" && (
        <AutomationPanel
          requirement={requirement}
          states={states}
          counts={counts}
          scriptsById={scriptsById}
          canGenerate={ready}
          baseUrlMissing={baseUrlMissing}
          projectId={project.id}
          generating={generating}
          rerunningId={rerunningId}
          downloadingTraceId={downloadingTraceId}
          onGenerate={handleGenerate}
          onRerun={handleRerun}
          onDownloadTrace={handleDownloadTrace}
          onOpenReview={(caseId) => {
            if (caseId) selectCase(caseId);
            goTo("review");
          }}
        />
      )}
      {tab === "report" && <ReportPanel report={requirement.report} onOpenAutomation={() => goTo("automation")} />}
    </Page>
  );
}
