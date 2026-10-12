import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  CASE_STATE_LABEL,
  PRIORITY_LABEL,
  TYPE_LABEL,
  caseLabel,
  formatDate,
  plural,
} from "../../lib/qa";
import { answerQuestion } from "../../services/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { StateChip } from "../QaChips";
import ConfirmDialog from "../ConfirmDialog";
import Spinner from "../../motion/Spinner";
import CaseEditor from "./CaseEditor";

const PRIORITY_SHORT = { high: "High", medium: "Med", low: "Low" };
const CARD = "rounded-lg border border-border bg-card";
const SIGNED_OFF = new Set(["approved", "passed", "needs_review"]);

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

// Open questions go to the product owner, so they can be copied as a ready-to-send
// message, or answered here when the answer is known: the answer becomes a project
// rule and the question stays listed with it.
function QuestionsCard({ requirement, projectId, onAnswered }) {
  const [answering, setAnswering] = useState(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const open = [
    ...(requirement.open_questions ?? []).map((q) => ({ text: q, app: true })),
    ...requirement.missing_info.map((q) => ({ text: q, app: false })),
  ];
  const answered = requirement.answered_questions ?? [];

  async function copyQuestions() {
    const message = [
      `Open questions on "${requirement.name}":`,
      ...open.map((q, i) => `${i + 1}. ${q.app ? "(Differs from the app) " : ""}${q.text}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Questions copied. Paste them into Slack, Jira, or email.");
    } catch {
      toast.error("Couldn't reach the clipboard. Select the questions and copy them instead.");
    }
  }

  async function save(question) {
    const answer = text.trim();
    if (!answer || saving) return;
    setSaving(true);
    try {
      await answerQuestion(projectId, { requirementId: requirement.requirement_id, question: question.text, answer });
      onAnswered({ question: question.text, differs_from_app: question.app, answer });
      setAnswering(null);
      setText("");
      toast.success("Saved as a rule. Drafting uses it from now on.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Open questions" className={cn(CARD, "space-y-3 px-4 py-3.5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn("size-2 rounded-full transition-colors duration-500", open.length ? "bg-review" : "bg-pass")}
            aria-hidden
          />
          Open questions
          <span className="tabular font-normal text-muted-foreground">{open.length}</span>
        </h3>
        {open.length > 0 && (
          <Button variant="ghost" size="xs" onClick={copyQuestions} className="text-primary">
            <Copy />
            Copy as message
          </Button>
        )}
      </div>
      {open.length === 0 && answered.length === 0 ? (
        <p className="text-sm text-muted-foreground">None. The requirement covers what the cases need.</p>
      ) : (
        <ul className="space-y-2.5 text-sm">
          {open.map((q) => (
            <li key={q.text} className="space-y-1.5 border-b border-border pb-2.5 last:border-b-0 last:pb-0">
              {q.app && (
                <span className="inline-flex rounded-sm bg-review-wash px-1.5 text-xs font-medium text-review">
                  Differs from the app
                </span>
              )}
              <p>{q.text}</p>
              {answering === q.text ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    aria-label="Answer"
                    placeholder="The answer, as a rule the cases can rely on"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setAnswering(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(q);
                    }}
                    className="min-h-16"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(q)} disabled={saving || !text.trim()}>
                      {saving && <Spinner className="size-3.5" />}
                      Save as rule
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAnswering(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setAnswering(q.text);
                    setText("");
                  }}
                >
                  Answer
                </Button>
              )}
            </li>
          ))}
          {answered.map((q) => (
            <li key={q.question} className="flex animate-rise gap-2.5 border-b border-border pb-2.5 last:border-b-0 last:pb-0">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-pass text-sheet" aria-hidden>
                <Check className="size-3" strokeWidth={3.5} />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-muted-foreground">{q.question}</p>
                {q.answer && <p className="border-l-2 border-pass py-0.5 pl-2.5">{q.answer}</p>}
                <p className="text-xs font-medium text-pass">Answered, saved as a rule</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && (
        <p className="text-xs text-muted-foreground">An answer becomes a project rule, so the next drafts use it.</p>
      )}
    </section>
  );
}

function RisksCard({ risks }) {
  return (
    <section aria-label="Risks" className={cn(CARD, "space-y-2 px-4 py-3.5")}>
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
    </section>
  );
}

// What the analysis read out of the requirement, and its notes for testing it.
function BreakdownCard({ requirement }) {
  const [open, setOpen] = useState(false);
  const points = requirement.requirements;
  const notes = requirement.testing_considerations;
  if (!points.length && !notes.length) return null;
  return (
    <section className={cn(CARD, "overflow-hidden")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground"
      >
        Requirement breakdown and notes
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-rise space-y-3 border-t border-border px-4 py-3">
          {points.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium">What the requirement asks for</h4>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {points.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            </div>
          )}
          {notes.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium">Testing notes</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-border">
                {notes.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
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

function CaseRow({ testCase, index, state, selected, fresh, onClick }) {
  const assumptions = state === "draft" ? testCase.assumptions?.length ?? 0 : 0;
  return (
    <li data-case={testCase.id}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onClick}
        className={cn(
          "grid w-full cursor-pointer grid-cols-[16px_1fr_auto] gap-3 border-t border-border px-4 py-2.5 text-left text-sm transition-colors",
          selected ? "bg-pencil-wash shadow-[inset_2px_0_0_var(--pencil)]" : "hover:bg-muted/50",
          fresh && "animate-slide-in",
        )}
      >
        <CaseMark state={state} />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            <span className="tabular">{caseLabel(index)}</span>
            <span className="ml-2">{TYPE_LABEL[testCase.type] ?? testCase.type}</span>
          </span>
          <span className={cn("block", state === "rejected" && "text-muted-foreground line-through")}>{testCase.title}</span>
          {state === "rejected" && testCase.reject_reason && (
            <span className="block text-xs text-muted-foreground">
              {testCase.reject_reason}
              {testCase.reviewed_by_name && ` · ${testCase.reviewed_by_name}`}
            </span>
          )}
          {assumptions > 0 && (
            <span className="mt-1 inline-flex rounded-sm bg-review-wash px-1.5 text-xs font-medium text-review">
              {plural(assumptions, "assumption")}
            </span>
          )}
        </span>
        {state !== "rejected" && (
          <span className={cn("text-xs", testCase.priority === "high" ? "text-fail" : "text-muted-foreground")}>
            {PRIORITY_SHORT[testCase.priority] ?? testCase.priority}
          </span>
        )}
      </button>
    </li>
  );
}

function GroupHeading({ label, count, first }) {
  return (
    <div
      className={cn(
        "flex justify-between px-4 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase",
        !first && "border-t border-border",
      )}
    >
      <span>{label}</span>
      <span className="tabular">{count}</span>
    </div>
  );
}

// Extra cases the QA agent drafted but didn't add. Adding one makes it a draft
// case like any other; ones already added (same title) are hidden.
function SuggestionRows({ requirement, onAdd }) {
  const [adding, setAdding] = useState(null);
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
    <>
      <GroupHeading label="Suggested, not added" count={remaining.length} />
      <ul>
        {remaining.map((s) => (
          <li key={s.title} className="grid grid-cols-[16px_1fr_auto] items-start gap-3 border-t border-border px-4 py-2.5 text-sm">
            <span className="mt-0.5 size-4 rounded-[4px] border-[1.5px] border-dashed border-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{TYPE_LABEL[s.type] ?? s.type}</span>
              <span className="block">{s.title}</span>
              {s.why && <span className="block text-xs text-muted-foreground">{s.why}</span>}
            </span>
            <Button variant="outline" size="xs" disabled={adding !== null} onClick={() => add(s)}>
              {adding === s.title ? <Spinner className="size-3" /> : <Plus />}
              Add
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

function CaseDetail({
  testCase,
  index,
  state,
  position,
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
  const assumptions = testCase.assumptions ?? [];
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
          {position && <span className="tabular ml-auto">{position}</span>}
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

      {assumptions.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-review/35 bg-review-wash/50 px-3 py-2.5">
          <p className="text-sm font-medium text-review">
            {plural(assumptions.length, "assumption")}: written from the requirement, not seen in the app map
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm marker:text-review/60">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

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
      className="animate-rise space-y-3 border-t border-border pt-4 outline-none"
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

// A ring of small marks around the check, placed once.
const BURST = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2;
  const dist = 90 + (i % 4) * 26;
  return {
    left: `${50 + (Math.cos(angle) * dist) / 4.2}%`,
    top: `${Math.round(98 + Math.sin(angle) * dist * 0.75)}px`,
    color: ["var(--pencil)", "var(--pass)", "var(--review)", "var(--graphite)"][i % 4],
    delay: `${(i % 5) * 45}ms`,
    round: i % 3 === 0,
  };
});

// Shown once the last draft is reviewed in this visit: the next step, and any
// suggestions still worth a look.
function DonePanel({ counts, openQuestions, baseUrlMissing, projectId, hasReport, exporting, onGenerate, onExport, onDismiss }) {
  return (
    <div className="relative flex flex-col items-center gap-3.5 overflow-hidden px-6 py-14 text-center">
      {BURST.map((b, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("animate-burst absolute size-[7px]", b.round ? "rounded-full" : "rounded-[2px]")}
          style={{ left: b.left, top: b.top, background: b.color, animationDelay: b.delay }}
        />
      ))}
      <svg viewBox="0 0 72 72" className="size-[72px]" aria-hidden>
        <circle cx="36" cy="36" r="30" fill="none" stroke="var(--pass)" strokeWidth="3" className="animate-draw" style={{ "--len": 190 }} />
        <path
          d="M24 37l8 8 16-18"
          fill="none"
          stroke="var(--pass)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw"
          style={{ "--len": 40, animationDelay: "0.5s", animationDuration: "0.35s" }}
        />
      </svg>
      <h3 className="text-xl font-semibold">Every case is reviewed</h3>
      <p className="max-w-[46ch] text-sm text-muted-foreground">
        {counts.approved + counts.passed + counts.needs_review} approved, {counts.rejected} rejected.{" "}
        {openQuestions
          ? `${plural(openQuestions, "open question is", "open questions are")} still unanswered.`
          : "No open questions left."}
      </p>
      {baseUrlMissing ? (
        <p className="text-sm">
          Add the app URL on the{" "}
          <Link to={`/projects/${projectId}`} className="text-primary underline">
            project
          </Link>{" "}
          to generate automation.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        {!baseUrlMissing && <Button onClick={onGenerate}>{hasReport ? "Re-run automation" : "Generate automation"}</Button>}
        <Button variant="outline" onClick={onExport} disabled={exporting}>
          {exporting && <Spinner className="size-3.5" />}
          Export to Excel
        </Button>
        <Button variant="ghost" className="text-primary" onClick={onDismiss}>
          Look over the cases
        </Button>
      </div>
    </div>
  );
}

// The case list on the left, the selected case in the middle, and what the
// analysis found in a rail on the right. Approving or rejecting a case moves on
// to the next draft, so a reviewer can work down the list by keyboard.
export default function ReviewPanel({
  requirement,
  states,
  counts,
  scriptsById,
  accounts = [],
  projectId,
  selectedId,
  onSelect,
  celebrating,
  onDismissDone,
  baseUrlMissing,
  exporting,
  onGenerate,
  onExport,
  onSetStatus,
  onSaveCase,
  onCreateCase,
  onDeleteCase,
  onAnswered,
  onOpenAutomation,
}) {
  const cases = requirement.test_cases;
  const [filter, setFilter] = useState(() => (states.includes("draft") ? "review" : "all"));
  const [mode, setMode] = useState("view"); // view | edit | new | reject
  const [busyId, setBusyId] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef(null);
  const detailRef = useRef(null);

  const index = Math.max(0, cases.findIndex((c) => c.id === selectedId));
  const selected = cases[index];

  const groups = useMemo(() => {
    const ids = (keep) => cases.map((c, i) => [c, i]).filter(([, i]) => keep(states[i]));
    return {
      drafts: ids((s) => s === "draft"),
      signedOff: ids((s) => SIGNED_OFF.has(s)),
      rejected: ids((s) => s === "rejected"),
    };
  }, [cases, states]);
  const visible = filter === "review" ? groups.drafts : [...groups.drafts, ...groups.signedOff, ...groups.rejected];

  useEffect(() => {
    listRef.current?.querySelector(`[data-case="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function nextDraftAfter(i) {
    for (let step = 1; step <= cases.length; step++) {
      const j = (i + step) % cases.length;
      if (states[j] === "draft" && j !== i) return cases[j].id;
    }
    return null;
  }

  function pick(id) {
    onSelect(id);
    setMode("view");
  }

  async function setStatus(status, rejectReason) {
    if (!selected || busyId) return;
    const id = selected.id;
    const label = caseLabel(index);
    const advanceTo = status === "draft" ? null : nextDraftAfter(index);
    setBusyId(id);
    try {
      await onSetStatus(id, status, rejectReason);
      setMode("view");
      if (advanceTo) onSelect(advanceTo);
      if (status !== "draft") {
        const next = advanceTo && caseLabel(cases.findIndex((c) => c.id === advanceTo));
        toast(`${label} ${status === "approved" ? "approved" : "rejected"}`, {
          description: next ? `Next up: ${next}` : undefined,
          action: {
            label: "Undo",
            onClick: () => onSetStatus(id, "draft").then(() => onSelect(id), () => {}),
          },
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  function move(delta) {
    if (!visible.length) return;
    const at = visible.findIndex(([c]) => c.id === selectedId);
    const j = at < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, at + delta));
    pick(visible[j][0].id);
  }

  useEffect(() => {
    function onKey(e) {
      if (mode !== "view" || pendingDelete || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") move(1);
      else if (key === "k" || e.key === "ArrowUp") move(-1);
      else if (key === "a" && !celebrating && states[index] === "draft") setStatus("approved");
      else if (key === "r" && !celebrating && states[index] === "draft") setMode("reject");
      else if (key === "e" && !celebrating && selected) setMode("edit");
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

  const draftAt = groups.drafts.findIndex(([c]) => c.id === selectedId);
  const position = draftAt >= 0 ? `${draftAt + 1} of ${groups.drafts.length} to review` : null;
  const openQuestions = requirement.missing_info.length + (requirement.open_questions?.length ?? 0);
  const row = ([tc, i]) => (
    <CaseRow
      key={tc.id}
      testCase={tc}
      index={i}
      state={states[i]}
      selected={tc.id === selectedId && mode !== "new" && !celebrating}
      fresh={tc.id === freshId}
      onClick={() => {
        pick(tc.id);
        // Stacked layout: the detail sits below the list, so bring it into view.
        if (!window.matchMedia("(min-width: 1024px)").matches) {
          requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
        }
      }}
    />
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(280px,330px)]">
      <section aria-label="Test cases" className={cn(CARD, "overflow-hidden")}>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2.5">
          {[
            ["review", "To review", groups.drafts.length],
            ["all", "All", cases.length],
          ].map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-sm",
                filter === key
                  ? "border-primary bg-pencil-wash text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="tabular">{n}</span>
            </button>
          ))}
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto lg:max-h-[720px]">
          <GroupHeading label="To review" count={groups.drafts.length} first />
          {groups.drafts.length ? (
            <ul aria-label="Cases to review">{groups.drafts.map(row)}</ul>
          ) : (
            <p className="px-4 pb-3 text-sm text-muted-foreground">Nothing left to review.</p>
          )}
          {filter === "all" && groups.signedOff.length > 0 && (
            <>
              <GroupHeading label="Approved" count={groups.signedOff.length} />
              <ul aria-label="Approved cases">{groups.signedOff.map(row)}</ul>
            </>
          )}
          {filter === "all" && groups.rejected.length > 0 && (
            <>
              <GroupHeading label="Rejected" count={groups.rejected.length} />
              <ul aria-label="Rejected cases">{groups.rejected.map(row)}</ul>
            </>
          )}
          <SuggestionRows
            requirement={requirement}
            onAdd={async (suggestion) => {
              // eslint-disable-next-line no-unused-vars
              const { why, starts_logged_out, ...payload } = suggestion; // assumptions carry over
              const created = await onCreateCase({ ...payload, start_state: starts_logged_out ? "logged_out" : null });
              setFreshId(created.id);
              setFilter("review");
              pick(created.id);
              toast.success(`Added as ${caseLabel(cases.length)}, a draft to review`);
            }}
          />
        </div>
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
      </section>

      <section ref={detailRef} aria-label="Selected case" className={cn(CARD, "min-w-0 scroll-mt-16")}>
        {mode === "new" ? (
          <div className="p-5 md:p-6">
            <CaseEditor
              testCase={BLANK_CASE}
              onCancel={() => setMode("view")}
              onSave={async (payload) => {
                const created = await onCreateCase(payload);
                setFreshId(created.id);
                pick(created.id);
              }}
            />
          </div>
        ) : celebrating ? (
          <DonePanel
            counts={counts}
            openQuestions={openQuestions}
            baseUrlMissing={baseUrlMissing}
            projectId={projectId}
            hasReport={!!requirement.report}
            exporting={exporting}
            onGenerate={onGenerate}
            onExport={onExport}
            onDismiss={() => {
              setFilter("all");
              onDismissDone();
            }}
          />
        ) : !selected ? (
          <p className="p-5 text-sm text-muted-foreground md:p-6">
            No test cases yet. Add one to start building coverage for this requirement.
          </p>
        ) : mode === "edit" ? (
          <div className="p-5 md:p-6">
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
          </div>
        ) : (
          <div key={selected.id} className="animate-rise p-5 md:p-6">
            <CaseDetail
              testCase={selected}
              index={index}
              state={states[index]}
              position={position}
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
          </div>
        )}
      </section>

      <aside aria-label="From the analysis" className="grid items-start gap-3 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
        <QuestionsCard requirement={requirement} projectId={projectId} onAnswered={onAnswered} />
        <div className="grid gap-3">
          <RisksCard risks={requirement.risks} />
          <BreakdownCard requirement={requirement} />
        </div>
      </aside>

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
