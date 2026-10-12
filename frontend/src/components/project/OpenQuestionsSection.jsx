import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { answerQuestion, dismissQuestion, listOpenQuestions } from "../../services/api";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { ErrorMessage } from "../StatusMessages";

function Question({ projectId, item, onResolved }) {
  const [answering, setAnswering] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(null); // "answer" | "dismiss"
  const [error, setError] = useState(null);
  const ref = { requirementId: item.requirement_id, question: item.question };

  async function act(kind, call) {
    setBusy(kind);
    setError(null);
    try {
      await call();
      onResolved(kind);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="[overflow-wrap:anywhere]">{item.question}</p>
          <p className="text-xs text-muted-foreground">
            From <Link to={`/requirements/${item.requirement_id}`} className="text-primary hover:underline">{item.requirement_name}</Link>
            {item.differs_from_app && <span className="text-review"> · differs from the app</span>}
          </p>
        </div>
        {!answering && (
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="xs" onClick={() => setAnswering(true)} disabled={busy !== null}>
              Answer
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy !== null}
              onClick={() => act("dismiss", () => dismissQuestion(projectId, ref))}
            >
              {busy === "dismiss" && <Spinner className="size-3" />}
              Dismiss
            </Button>
          </div>
        )}
      </div>
      {answering && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("answer", () => answerQuestion(projectId, { ...ref, answer: text.trim() }));
          }}
        >
          <Label htmlFor={`answer-${item.requirement_id}-${item.question.length}`} className="sr-only">
            Answer
          </Label>
          <Textarea
            id={`answer-${item.requirement_id}-${item.question.length}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Write it as a rule, e.g. Sorting offers only name and price; there is no Newest first."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={busy !== null || !text.trim()}>
              {busy === "answer" && <Spinner className="size-3.5" />}
              Save as a rule
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAnswering(false)} disabled={busy !== null}>
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground">The next test cases drafted will follow it.</span>
          </div>
        </form>
      )}
      <ErrorMessage message={error} />
    </li>
  );
}

// Every requirement's unanswered questions. An answer becomes a business rule.
export default function OpenQuestionsSection({ projectId, onCount, onAnswered }) {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    return listOpenQuestions(projectId)
      .then((list) => {
        setQuestions(list);
        onCount(list.length);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (error) return <ErrorMessage message={error} />;
  if (!questions?.length) return null;

  return (
    <section id="knowledge-questions" aria-label="Open questions" className="scroll-mt-20 space-y-3">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-review" aria-hidden />
        <h3 className="text-sm font-semibold">Open questions</h3>
        <span className="tabular text-sm text-muted-foreground">{questions.length}</span>
        <span className="text-xs text-muted-foreground">Answer one and it becomes a rule</span>
      </div>
      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
        {questions.map((item) => (
          <Question
            key={`${item.requirement_id}:${item.question}`}
            projectId={projectId}
            item={item}
            onResolved={(kind) => {
              if (kind === "answer") onAnswered();
              load();
            }}
          />
        ))}
      </ul>
    </section>
  );
}
