import { useEffect, useState } from "react";
import { BookOpen, FileText, Gavel, Plus } from "lucide-react";
import {
  createFact,
  deleteFact,
  deleteKnowledge,
  listFacts,
  listKnowledge,
  updateFact,
} from "../../services/api";
import { formatDate, plural } from "../../lib/qa";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import ConfirmDialog from "../ConfirmDialog";
import { ErrorMessage, LoadingMessage } from "../StatusMessages";
import DocumentForm from "./DocumentForm";

function RuleForm({ rule, onSave, onCancel }) {
  const [text, setText] = useState(rule?.content.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ text });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor={`rule-${rule?.id ?? "new"}`}>Rule</Label>
      <Textarea
        id={`rule-${rule?.id ?? "new"}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Orders over $100 ship free. A promo code can be used once per customer."
        rows={2}
        autoFocus
      />
      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !text.trim()}>
          {saving && <Spinner className="size-3.5" />}
          {rule ? "Save" : "Add rule"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TermForm({ term, onSave, onCancel }) {
  const [word, setWord] = useState(term?.content.term ?? "");
  const [meaning, setMeaning] = useState(term?.content.meaning ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const id = term?.id ?? "new";

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ term: word, meaning });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`term-${id}`}>Term</Label>
          <Input id={`term-${id}`} value={word} onChange={(e) => setWord(e.target.value)} placeholder="e.g. MFE" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`meaning-${id}`}>Meaning</Label>
          <Input
            id={`meaning-${id}`}
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="e.g. Member Firm Engagement report"
          />
        </div>
      </div>
      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !word.trim() || !meaning.trim()}>
          {saving && <Spinner className="size-3.5" />}
          {term ? "Save" : "Add term"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const KIND = {
  rule: { label: "Rule", icon: Gavel },
  term: { label: "Term", icon: BookOpen },
  document: { label: "Document", icon: FileText },
};

function KindTag({ kind }) {
  const { label, icon: Icon } = KIND[kind];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

// "From your team": rules, glossary terms and documents in one list. Unlike
// what was learned from the app, these may decide what a test expects.
export default function TeamKnowledgePanel({ projectId, version, onCounts }) {
  const [rules, setRules] = useState(null);
  const [terms, setTerms] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // "new-rule" | "new-term" | "new-document" | fact id
  const [removing, setRemoving] = useState(null); // {kind, item}
  const [confirming, setConfirming] = useState(false);

  function load() {
    return Promise.all([listFacts(projectId, "rule"), listFacts(projectId, "term"), listKnowledge(projectId)])
      .then(([r, t, d]) => {
        setRules(r);
        setTerms(t);
        setDocuments(d);
        onCounts({ rules: r.length, terms: t.length, documents: d.length });
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, version]);

  async function save(promise) {
    await promise;
    setEditing(null);
    await load();
  }

  async function remove() {
    setConfirming(true);
    try {
      if (removing.kind === "document") await deleteKnowledge(projectId, removing.item.id);
      else await deleteFact(projectId, removing.item.id);
      setRemoving(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  const loading = rules === null;
  const empty = !loading && rules.length + terms.length + documents.length === 0;

  const actions = (kind, item, editable = true) => (
    <div className="flex shrink-0 gap-1">
      {editable && (
        <Button variant="ghost" size="xs" onClick={() => setEditing(item.id)}>
          Edit
        </Button>
      )}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setRemoving({ kind, item })}
        className="text-fail hover:bg-fail-wash hover:text-fail"
      >
        Remove
      </Button>
    </div>
  );

  return (
    <section id="knowledge-team" aria-label="From your team" className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-semibold">From your team</h3>
          <span className="text-xs text-muted-foreground">Can decide what a test expects</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={editing !== null}>
              <Plus />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing("new-rule")}>
              <Gavel /> Business rule
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditing("new-term")}>
              <BookOpen /> Glossary term
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditing("new-document")}>
              <FileText /> Document or PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ErrorMessage message={error} />

      {editing === "new-rule" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <RuleForm onCancel={() => setEditing(null)} onSave={({ text }) => save(createFact(projectId, { kind: "rule", text }))} />
        </div>
      )}
      {editing === "new-term" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <TermForm
            onCancel={() => setEditing(null)}
            onSave={({ term, meaning }) => save(createFact(projectId, { kind: "term", term, meaning }))}
          />
        </div>
      )}
      {editing === "new-document" && (
        <DocumentForm projectId={projectId} onCancel={() => setEditing(null)} onUploaded={() => save(Promise.resolve())} />
      )}

      {loading ? (
        !error && <LoadingMessage />
      ) : empty ? (
        editing === null && (
          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Nothing yet. Add the rules a tester should know (limits, discounts, who may do what), what the
            project&apos;s own words mean, or a spec or user guide.
          </p>
        )
      ) : (
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
          {rules.map((rule) => (
            <li key={rule.id} className="px-4 py-2.5 text-sm">
              {editing === rule.id ? (
                <RuleForm
                  rule={rule}
                  onCancel={() => setEditing(null)}
                  onSave={({ text }) => save(updateFact(projectId, rule.id, { text }))}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <KindTag kind="rule" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{rule.content.text}</span>
                  {actions("rule", rule)}
                </div>
              )}
            </li>
          ))}
          {terms.map((term) => (
            <li key={term.id} className="px-4 py-2.5 text-sm">
              {editing === term.id ? (
                <TermForm
                  term={term}
                  onCancel={() => setEditing(null)}
                  onSave={({ term: word, meaning }) => save(updateFact(projectId, term.id, { term: word, meaning }))}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <KindTag kind="term" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="font-medium">{term.content.term}</span>
                    <span className="text-muted-foreground"> · {term.content.meaning}</span>
                  </span>
                  {actions("term", term)}
                </div>
              )}
            </li>
          ))}
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <KindTag kind="document" />
              <span className="min-w-0 flex-1 truncate font-medium">{doc.name}</span>
              <span className="tabular hidden text-xs text-muted-foreground sm:inline">
                {plural(doc.chunk_count, "passage")} · added {formatDate(doc.created_at)}
              </span>
              {actions("document", doc, false)}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove this ${removing ? KIND[removing.kind].label.toLowerCase() : "item"}?`}
        message={
          removing &&
          `"${removing.item.title ?? removing.item.name}" will no longer be given to the agents.`
        }
        confirmLabel="Remove"
        danger
        confirming={confirming}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
