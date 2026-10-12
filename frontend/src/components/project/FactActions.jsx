import { useState } from "react";
import { Check } from "lucide-react";
import { deleteFact, updateFact } from "../../services/api";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import ConfirmDialog from "../ConfirmDialog";
import { ErrorMessage } from "../StatusMessages";

// Confirm or remove something the project learned (a page, a workflow).
// Confirmed facts survive re-crawls; a removed page returns if a crawl finds it again.
export default function FactActions({ projectId, fact, what, onChanged, onRemoved }) {
  const [busy, setBusy] = useState(null); // "confirm" | "remove"
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    setBusy("confirm");
    setError(null);
    try {
      onChanged(await updateFact(projectId, fact.id, { status: "confirmed" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await deleteFact(projectId, fact.id);
      setAsking(false);
      onRemoved(fact);
    } catch (err) {
      setError(err.message);
      setAsking(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {fact.status === "confirmed" ? (
          <span className="flex items-center gap-1 text-xs text-pass">
            <Check className="size-3.5" />
            Confirmed
          </span>
        ) : (
          <Button variant="outline" size="xs" disabled={busy !== null} onClick={confirm}>
            {busy === "confirm" ? <Spinner className="size-3" /> : <Check />}
            Confirm
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          disabled={busy !== null}
          onClick={() => setAsking(true)}
          className="text-fail hover:bg-fail-wash hover:text-fail"
        >
          Remove
        </Button>
      </div>
      <ErrorMessage message={error} />
      <ConfirmDialog
        open={asking}
        title={`Remove this ${what}?`}
        message={`"${fact.title}" will no longer be given to the agents.${
          fact.kind === "page" ? " A later crawl adds it back if the page is still there." : ""
        }`}
        confirmLabel="Remove"
        danger
        confirming={busy === "remove"}
        onConfirm={remove}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
