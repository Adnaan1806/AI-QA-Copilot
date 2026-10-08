import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Spinner from "../motion/Spinner";

// Shows a value with a pencil button; swaps to an input in place.
// `display` renders the read state, `required` blocks saving an empty value.
export default function InlineEdit({
  value,
  onSave,
  label,
  display,
  type = "text",
  placeholder,
  required = false,
  inputClassName,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => setDraft(value), [value]);

  async function save(e) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (required && !trimmed) {
      setError(`${label} can't be empty`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        {display}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label.toLowerCase()}`}
          title={`Edit ${label.toLowerCase()}`}
          className="text-muted-foreground"
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && cancel()} className="w-full max-w-xl">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          type={type}
          aria-label={label}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={inputClassName}
        />
        <Button type="submit" disabled={saving} className="shrink-0">
          {saving && <Spinner className="size-3.5" />}
          Save
        </Button>
        <Button type="button" variant="outline" className="shrink-0" onClick={cancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-1.5 text-sm text-fail">{error}</p>}
    </form>
  );
}
