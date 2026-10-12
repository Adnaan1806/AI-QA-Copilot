import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { createFact, deleteFact, listFacts, updateFact } from "../../services/api";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import ConfirmDialog from "../ConfirmDialog";
import { ErrorMessage, LoadingMessage } from "../StatusMessages";

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

// What the team knows that the app can't show. Unlike the app map, rules may
// decide expected results: a person said the app should behave so.
export default function TeamKnowledgePanel({ projectId }) {
  const [rules, setRules] = useState(null);
  const [terms, setTerms] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // "new-rule" | "new-term" | fact id
  const [removing, setRemoving] = useState(null);
  const [confirming, setConfirming] = useState(false);

  function load() {
    return Promise.all([listFacts(projectId, "rule"), listFacts(projectId, "term")])
      .then(([r, t]) => {
        setRules(r);
        setTerms(t);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function save(promise) {
    await promise;
    setEditing(null);
    await load();
  }

  async function remove() {
    setConfirming(true);
    try {
      await deleteFact(projectId, removing.id);
      setRemoving(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  if (rules === null) return error ? <ErrorMessage message={error} /> : <LoadingMessage />;

  const row = (fact, children, form) => (
    <li key={fact.id} className="px-4 py-2.5 text-sm">
      {editing === fact.id ? (
        form
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="xs" onClick={() => setEditing(fact.id)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setRemoving(fact)}
              className="text-fail hover:bg-fail-wash hover:text-fail"
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose space-y-1">
          <h3 className="text-sm font-semibold">Rules and terms</h3>
          <p className="text-sm text-muted-foreground">
            What the team knows that the app can&apos;t show: business rules, and what the
            project&apos;s own words mean. The QA agent reads them when it writes cases, and
            unlike the app map, a rule can decide what a case expects.
          </p>
        </div>
        {editing === null && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing("new-rule")}>
              <Plus />
              Add rule
            </Button>
            <Button variant="outline" onClick={() => setEditing("new-term")}>
              <Plus />
              Add term
            </Button>
          </div>
        )}
      </div>

      <ErrorMessage message={error} />

      {editing === "new-rule" && (
        <div className="rounded-lg border border-border p-4">
          <RuleForm
            onCancel={() => setEditing(null)}
            onSave={({ text }) => save(createFact(projectId, { kind: "rule", text }))}
          />
        </div>
      )}
      {editing === "new-term" && (
        <div className="rounded-lg border border-border p-4">
          <TermForm
            onCancel={() => setEditing(null)}
            onSave={({ term, meaning }) => save(createFact(projectId, { kind: "term", term, meaning }))}
          />
        </div>
      )}

      {rules.length === 0 && terms.length === 0 && editing === null && (
        <p className="text-sm text-muted-foreground">
          None yet. Add the rules a tester should know, like limits, discounts or who may do what.
        </p>
      )}

      {rules.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs text-muted-foreground">Business rules</h4>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {rules.map((rule) =>
              row(
                rule,
                rule.content.text,
                <RuleForm
                  rule={rule}
                  onCancel={() => setEditing(null)}
                  onSave={({ text }) => save(updateFact(projectId, rule.id, { text }))}
                />,
              ),
            )}
          </ul>
        </div>
      )}

      {terms.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs text-muted-foreground">Glossary</h4>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {terms.map((term) =>
              row(
                term,
                <>
                  <span className="font-medium">{term.content.term}</span>
                  <span className="text-muted-foreground"> · {term.content.meaning}</span>
                </>,
                <TermForm
                  term={term}
                  onCancel={() => setEditing(null)}
                  onSave={({ term: word, meaning }) => save(updateFact(projectId, term.id, { term: word, meaning }))}
                />,
              ),
            )}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove this ${removing?.kind === "term" ? "term" : "rule"}?`}
        message={removing && `"${removing.title}" will no longer be given to the agents.`}
        confirmLabel="Remove"
        danger
        confirming={confirming}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
