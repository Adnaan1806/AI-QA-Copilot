import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import {
  CASE_STATE_LABEL,
  PRIORITY_LABEL,
  TYPE_LABEL,
  caseLabel,
  formatDate,
} from "../../lib/qa";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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

// Extra cases the QA agent drafted but didn't add. Adding one makes it a draft
// case like any other; ones already added (same title) are hidden.
function Suggestions({ requirement, onAdd }) {
  const [adding, setAdding] = useState(null);
  const [open, setOpen] = useState(true);
  const titles = new Set(requirement.test_cases.map((tc) => tc.title.trim().toLowerCase()));
  const remaining = (requirement.suggestions ?? []).filter((s) => !titles.has(s.title.trim().toLowerCase()));
  if (!remaining.length) return null;

  async function add(suggestion) {
    setAdding(suggestion.title);
    try {
      await onAdd(suggestion);
    } finally {
      setAdding(null);
    }
  }

  return (
    <section aria-label="Suggested cases" className="rounded-lg border border-dashed border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-sm font-semibold"
      >
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        Suggested cases
        <span className="tabular font-normal text-muted-foreground">{remaining.length}</span>
        <span className="ml-1 font-normal text-muted-foreground">
          Beyond the acceptance criteria. Add the ones worth testing.
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {remaining.map((s) => (
            <li key={s.title} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{TYPE_LABEL[s.type] ?? s.type}</span>
                </div>
                {s.why && <p className="text-muted-foreground">{s.why}</p>}
              </div>
              <Button variant="outline" size="sm" disabled={adding !== null} onClick={() => add(s)}>
                {adding === s.title ? <Spinner className="size-3.5" /> : <Plus />}
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// How a case starts when the project has accounts. "auto" logs in as the
// default account unless the case deals with logging in itself.
function startValue(testCase, accounts) {
  if (testCase.start_state === "logged_out") return "logged_out";
  if (testCase.start_state === "logged_in") {
    const id = testCase.account_id ?? (accounts.find((a) => a.is_default) ?? accounts[0])?.id;
    return `account:${id}`;
  }
  return "auto";
}

function startPatch(value) {
  if (value === "auto") return { start_state: null, account_id: null };
  if (value === "logged_out") return { start_state: "logged_out", account_id: null };
  return { start_state: "logged_in", account_id: value.slice("account:".length) };
}

function CaseStart({ testCase, accounts, onChange }) {
  const [saving, setSaving] = useState(false);
  if (!accounts.length) return null;
  const value = startValue(testCase, accounts);
  const automatic = testCase.starts_as
    ? `Automatic: logged in as ${testCase.starts_as}`
    : "Automatic: logged out, the case logs in itself";

  async function change(next) {
    if (next === value) return;
    setSaving(true);
    try {
      await onChange(startPatch(next));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">Starts</span>
      <Select value={value} onValueChange={change} disabled={saving}>
        <SelectTrigger size="sm" className="min-w-0" aria-label="How the case starts">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{value === "auto" ? automatic : "Automatic"}</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={`account:${a.id}`}>
              Logged in as {a.name}
            </SelectItem>
          ))}
          <SelectItem value="logged_out">Logged out</SelectItem>
        </SelectContent>
      </Select>
      {saving && <Spinner className="size-3.5" />}
    </div>
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

function CaseDetail({
  testCase,
  index,
  state,
  script,
  accounts,
  busy,
  rejecting,
  onApprove,
  onReject,
  onConfirmReject,
  onCancelReject,
  onRevert,
  onEdit,
  onDelete,
  onChangeStart,
  onOpenAutomation,
}) {
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
        {testCase.covers && (
          <p className="text-sm text-muted-foreground">
            Covers <span className="text-foreground">{testCase.covers}</span>
          </p>
        )}
        <CaseStart testCase={testCase} accounts={accounts} onChange={onChangeStart} />
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

      <ReviewRecord testCase={testCase} state={state} />

      {rejecting ? (
        <RejectForm label={label} busy={busy} onConfirm={onConfirmReject} onCancel={onCancelReject} />
      ) : (
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
      )}
    </div>
  );
}

// Who signed the case off and when; for a rejection, why.
function ReviewRecord({ testCase, state }) {
  if (state === "draft") return null;
  const verb = state === "rejected" ? "Rejected" : "Approved";
  const who = testCase.reviewed_by_name;
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">
        {verb}
        {who && (
          <>
            {" "}
            by <span className="text-foreground">{who}</span>
          </>
        )}
        {testCase.reviewed_at && <> on {formatDate(testCase.reviewed_at)}</>}
        {!who && !testCase.reviewed_at && " before review history was recorded"}
      </p>
      {state === "rejected" && testCase.reject_reason && (
        <p className="border-l-2 border-border py-0.5 pl-3">{testCase.reject_reason}</p>
      )}
    </div>
  );
}

// Common reasons double as a tally of where the drafted cases go wrong.
const REJECT_REASONS = ["Duplicate", "Out of scope", "Wrong expected result", "Not testable", "Other"];

function RejectForm({ label, busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    formRef.current?.focus();
  }, []);

  function submit(e) {
    e?.preventDefault();
    const parts = [reason, note.trim()].filter(Boolean);
    onConfirm(parts.join(": "));
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.target.tagName === "INPUT") return;
    const n = Number(e.key);
    if (n >= 1 && n <= REJECT_REASONS.length) {
      e.preventDefault();
      setReason((current) => (current === REJECT_REASONS[n - 1] ? null : REJECT_REASONS[n - 1]));
    } else if (e.key === "Enter") {
      submit(e);
    }
  }

  return (
    <form
      ref={formRef}
      tabIndex={-1}
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-label={`Reject ${label}`}
      className="space-y-3 border-t border-border pt-4 outline-none"
    >
      <p className="text-sm font-medium">Why reject {label}?</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason">
        {REJECT_REASONS.map((r, i) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => setReason(reason === r ? null : r)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm",
              reason === r
                ? "border-primary bg-pencil-wash text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="tabular text-xs opacity-70">{i + 1}</span>
            {r}
          </button>
        ))}
      </div>
      <Input
        aria-label="Note"
        placeholder="Add a note (optional), e.g. same as TC-1"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
          {busy ? <Spinner className="size-3.5" /> : <X />}
          Reject case
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// List on the left, the selected case on the right. Approving or rejecting a
// case moves on to the next draft, so a reviewer can work down the list by keyboard.
export default function ReviewPanel({
  requirement,
  states,
  scriptsById,
  accounts = [],
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

  async function setStatus(status, rejectReason) {
    if (!selected || busyId) return;
    const advanceTo = status === "draft" ? null : nextDraftAfter(index);
    setBusyId(selected.id);
    try {
      await onSetStatus(selected.id, status, rejectReason);
      setMode("view");
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
      else if (key === "r" && states[index] === "draft") setMode("reject");
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
                  title={state === "rejected" && tc.reject_reason ? `Rejected: ${tc.reject_reason}` : undefined}
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
              accounts={accounts}
              busy={busyId === selected.id}
              rejecting={mode === "reject"}
              onApprove={() => setStatus("approved")}
              onReject={() => setMode("reject")}
              onConfirmReject={(reason) => setStatus("rejected", reason)}
              onCancelReject={() => setMode("view")}
              onRevert={() => setStatus("draft")}
              onEdit={() => setMode("edit")}
              onDelete={() => setPendingDelete(selected)}
              onChangeStart={(patch) => onSaveCase(selected.id, patch)}
              onOpenAutomation={onOpenAutomation}
            />
          )}
        </div>
      </div>

      <Suggestions
        requirement={requirement}
        onAdd={async (suggestion) => {
          // eslint-disable-next-line no-unused-vars
          const { why, starts_logged_out, ...payload } = suggestion;
          const created = await onCreateCase({ ...payload, start_state: starts_logged_out ? "logged_out" : null });
          setSelectedId(created.id);
          setMode("view");
        }}
      />

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
