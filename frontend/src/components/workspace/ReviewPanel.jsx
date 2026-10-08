import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import {
  CASE_STATE_LABEL,
  PRIORITY_LABEL,
  TYPE_LABEL,
  caseLabel,
} from "../../lib/qa";
import { Button } from "../ui/button";
import { StateChip } from "../QaChips";
import ConfirmDialog from "../ConfirmDialog";
import Spinner from "../../motion/Spinner";
import CaseEditor from "./CaseEditor";

const PRIORITY_SHORT = { high: "High", medium: "Med", low: "Low" };

const BLANK_CASE = {
  title: "",
  type: "functional",
  steps: [],
  expected_result: "",
  priority: "medium",
  status: "draft",
};

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=dialog], [role=alertdialog], [role=listbox]"))
  );
}

// Open questions go to the product owner, so they can be copied as a ready-to-send message.
function AnalysisNotes({ requirement }) {
  const [showMore, setShowMore] = useState(false);
  const questions = requirement.missing_info;
  const risks = requirement.risks;
  const hasMore = requirement.requirements.length > 0 || requirement.testing_considerations.length > 0;

  async function copyQuestions() {
    const text = [
      `Open questions on "${requirement.name}":`,
      ...questions.map((q, i) => `${i + 1}. ${q}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Questions copied. Paste them into Slack, Jira, or email.");
    } catch {
      toast.error("Couldn't reach the clipboard. Select the questions and copy them instead.");
    }
  }

  if (!questions.length && !risks.length && !hasMore) return null;

  return (
    <section aria-label="Analysis" className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid md:grid-cols-2">
        <div className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="size-2 rounded-full bg-review" aria-hidden />
              Open questions for the product owner
              <span className="tabular font-normal text-muted-foreground">{questions.length}</span>
            </h3>
            {questions.length > 0 && (
              <Button variant="ghost" size="xs" onClick={copyQuestions} className="text-primary">
                <Copy />
                Copy as message
              </Button>
            )}
          </div>
          {questions.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
              {questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None. The requirement covers what the cases need.</p>
          )}
        </div>
        <div className="space-y-2 border-t border-border px-4 py-3 md:border-t-0 md:border-l">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="size-2 rounded-full bg-fail" aria-hidden />
            Risks
            <span className="tabular font-normal text-muted-foreground">{risks.length}</span>
          </h3>
          {risks.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
              {risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No risks flagged.</p>
          )}
        </div>
      </div>
      {hasMore && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", showMore && "rotate-180")} />
            {showMore ? "Hide" : "Show"} requirement breakdown and testing notes
          </button>
          {showMore && (
            <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium">What the requirement asks for</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
                  {requirement.requirements.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium">Testing notes</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
                  {requirement.testing_considerations.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const MARK = {
  draft: "border-[1.5px] border-muted-foreground",
  approved: "border-graphite bg-graphite text-sheet",
  passed: "border-graphite bg-graphite text-sheet",
  needs_review: "border-graphite bg-graphite text-sheet",
  rejected: "border-[1.5px] border-border text-muted-foreground",
};

function CaseMark({ state }) {
  return (
    <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px]", MARK[state])} aria-hidden>
      {state === "rejected" ? (
        <X className="size-3" strokeWidth={3} />
      ) : state !== "draft" ? (
        <Check className="size-3" strokeWidth={3.5} />
      ) : null}
    </span>
  );
}

function CaseDetail({ testCase, index, state, script, busy, onApprove, onReject, onRevert, onEdit, onDelete, onOpenAutomation }) {
  const label = caseLabel(index);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular">{label}</span>
          <StateChip state={state} />
          <span>{TYPE_LABEL[testCase.type] ?? testCase.type}</span>
          <span className={testCase.priority === "high" ? "text-fail" : undefined}>
            {PRIORITY_LABEL[testCase.priority] ?? testCase.priority} priority
          </span>
        </div>
        <h3 className={cn("text-[17px] leading-snug font-semibold", state === "rejected" && "text-muted-foreground line-through")}>
          {testCase.title}
        </h3>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs text-muted-foreground">Steps</h4>
        {testCase.steps.length ? (
          <ol className="divide-y divide-border rounded-md border border-border text-sm">
            {testCase.steps.map((step, i) => (
              <li key={i} className="grid grid-cols-[1.75rem_1fr] px-3 py-1.5">
                <span className="tabular text-muted-foreground">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No steps yet. Edit the case to add them.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs text-muted-foreground">Expected result</h4>
        <p className="border-l-2 border-pass py-0.5 pl-3 text-sm">
          {testCase.expected_result || <span className="text-muted-foreground">Not written yet.</span>}
        </p>
      </div>

      {script && (
        <button
          type="button"
          onClick={onOpenAutomation}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          Last automation run: {CASE_STATE_LABEL[script.status === "passed" ? "passed" : "needs_review"].toLowerCase()}
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {state === "draft" && (
            <>
              <Button onClick={onApprove} disabled={busy}>
                {busy ? <Spinner className="size-3.5" /> : <Check />}
                Approve
              </Button>
              <Button variant="outline" onClick={onReject} disabled={busy}>
                <X />
                Reject
              </Button>
            </>
          )}
          {state !== "draft" && (
            <Button variant="outline" onClick={onRevert} disabled={busy}>
              {busy && <Spinner className="size-3.5" />}
              {state === "rejected" ? "Restore to draft" : "Move back to draft"}
            </Button>
          )}
          <Button variant="outline" onClick={onEdit} disabled={busy}>
            Edit
          </Button>
          <Button variant="ghost" onClick={onDelete} disabled={busy} className="text-fail hover:bg-fail-wash hover:text-fail">
            Delete
          </Button>
        </div>
        <p className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
          <kbd className="rounded border border-b-2 border-border px-1 font-mono">J</kbd>
          <kbd className="rounded border border-b-2 border-border px-1 font-mono">K</kbd> move
          <kbd className="ml-1 rounded border border-b-2 border-border px-1 font-mono">A</kbd> approve
          <kbd className="ml-1 rounded border border-b-2 border-border px-1 font-mono">R</kbd> reject
          <kbd className="ml-1 rounded border border-b-2 border-border px-1 font-mono">E</kbd> edit
        </p>
      </div>
    </div>
  );
}

// List on the left, the selected case on the right. Approving or rejecting a
// case moves on to the next draft, so a reviewer can work down the list by keyboard.
export default function ReviewPanel({
  requirement,
  states,
  scriptsById,
  onSetStatus,
  onSaveCase,
  onCreateCase,
  onDeleteCase,
  onOpenAutomation,
  initialCaseId,
}) {
  const cases = requirement.test_cases;
  const [selectedId, setSelectedId] = useState(() => {
    if (initialCaseId && cases.some((c) => c.id === initialCaseId)) return initialCaseId;
    const firstDraft = cases.findIndex((_, i) => states[i] === "draft");
    return cases[firstDraft >= 0 ? firstDraft : 0]?.id ?? null;
  });
  const [mode, setMode] = useState("view"); // view | edit | new
  const [busyId, setBusyId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef(null);
  const detailRef = useRef(null);

  const index = Math.max(0, cases.findIndex((c) => c.id === selectedId));
  const selected = cases[index];

  // Keep a valid selection when cases are deleted.
  useEffect(() => {
    if (cases.length && !cases.some((c) => c.id === selectedId)) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-case="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const nextDraftAfter = useMemo(
    () => (i) => {
      for (let step = 1; step <= cases.length; step++) {
        const j = (i + step) % cases.length;
        if (states[j] === "draft" && j !== i) return cases[j].id;
      }
      return null;
    },
    [cases, states],
  );

  async function setStatus(status) {
    if (!selected || busyId) return;
    const advanceTo = status === "draft" ? null : nextDraftAfter(index);
    setBusyId(selected.id);
    try {
      await onSetStatus(selected.id, status);
      if (advanceTo) setSelectedId(advanceTo);
    } finally {
      setBusyId(null);
    }
  }

  function move(delta) {
    if (!cases.length) return;
    const j = Math.min(cases.length - 1, Math.max(0, index + delta));
    setSelectedId(cases[j].id);
    setMode("view");
  }

  useEffect(() => {
    function onKey(e) {
      if (mode !== "view" || pendingDelete || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") move(1);
      else if (key === "k" || e.key === "ArrowUp") move(-1);
      else if (key === "a" && states[index] === "draft") setStatus("approved");
      else if (key === "r" && states[index] === "draft") setStatus("rejected");
      else if (key === "e" && selected) setMode("edit");
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await onDeleteCase(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <AnalysisNotes requirement={requirement} />

      <div className="grid overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="border-b border-border lg:border-r lg:border-b-0">
          <ul ref={listRef} role="listbox" aria-label="Test cases" className="max-h-[60vh] overflow-y-auto lg:max-h-[640px]">
            {cases.map((tc, i) => {
              const state = states[i];
              const isSelected = tc.id === selectedId && mode !== "new";
              return (
                <li
                  key={tc.id}
                  data-case={tc.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => {
                    setSelectedId(tc.id);
                    setMode("view");
                    // Stacked layout: the detail sits below the list, so bring it into view.
                    if (!window.matchMedia("(min-width: 1024px)").matches) {
                      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
                    }
                  }}
                  className={cn(
                    "grid cursor-pointer grid-cols-[16px_1fr_auto] gap-3 border-t border-border px-4 py-2.5 text-sm first:border-t-0",
                    isSelected ? "bg-pencil-wash shadow-[inset_2px_0_0_var(--pencil)]" : "hover:bg-muted/50",
                  )}
                >
                  <CaseMark state={state} />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">
                      <span className="tabular">{caseLabel(i)}</span>
                      <span className="ml-2">{TYPE_LABEL[tc.type] ?? tc.type}</span>
                    </span>
                    <span className={cn("block", state === "rejected" && "text-muted-foreground line-through")}>
                      {tc.title}
                    </span>
                  </span>
                  <span className={cn("text-xs", tc.priority === "high" ? "text-fail" : "text-muted-foreground")}>
                    {PRIORITY_SHORT[tc.priority] ?? tc.priority}
                  </span>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={cn(
              "flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-muted/50",
              mode === "new" && "bg-pencil-wash",
            )}
          >
            <Plus className="size-4" />
            Add test case
          </button>
        </div>

        <div ref={detailRef} className="min-w-0 scroll-mt-16 p-5 md:p-6">
          {mode === "new" ? (
            <CaseEditor
              testCase={BLANK_CASE}
              onCancel={() => setMode("view")}
              onSave={async (payload) => {
                const created = await onCreateCase(payload);
                setSelectedId(created.id);
                setMode("view");
              }}
            />
          ) : !selected ? (
            <p className="text-sm text-muted-foreground">
              No test cases yet. Add one to start building coverage for this requirement.
            </p>
          ) : mode === "edit" ? (
            <CaseEditor
              key={selected.id}
              testCase={selected}
              label={caseLabel(index)}
              hasScript={scriptsById.has(selected.id)}
              onCancel={() => setMode("view")}
              onSave={async (patch) => {
                await onSaveCase(selected.id, patch);
                setMode("view");
              }}
            />
          ) : (
            <CaseDetail
              testCase={selected}
              index={index}
              state={states[index]}
              script={scriptsById.get(selected.id)}
              busy={busyId === selected.id}
              onApprove={() => setStatus("approved")}
              onReject={() => setStatus("rejected")}
              onRevert={() => setStatus("draft")}
              onEdit={() => setMode("edit")}
              onDelete={() => setPendingDelete(selected)}
              onOpenAutomation={onOpenAutomation}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete ? caseLabel(cases.indexOf(pendingDelete)) : "case"}?`}
        message={
          pendingDelete &&
          `"${pendingDelete.title}" and any automation for it will be removed. To keep it on record, reject it instead.`
        }
        confirmLabel="Delete case"
        danger
        confirming={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
