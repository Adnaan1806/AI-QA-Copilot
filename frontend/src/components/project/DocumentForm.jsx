import { useState } from "react";
import { FileText, X } from "lucide-react";
import { uploadKnowledge } from "../../services/api";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { ErrorMessage } from "../StatusMessages";

// A document for the project's knowledge: pasted text, or a PDF.
export default function DocumentForm({ projectId, onCancel, onUploaded }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onUploaded(
        await uploadKnowledge(projectId, { name: name.trim(), text, file }),
      );
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="knowledge-name">Name</Label>
        <Input
          id="knowledge-name"
          placeholder={file ? file.name : "e.g. Checkout business rules"}
          value={name}
          disabled={submitting}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="knowledge-text">Content</Label>
        <Textarea
          id="knowledge-text"
          className="min-h-32 resize-y"
          placeholder="Paste business rules, a user guide, past stories or test cases"
          value={text}
          disabled={!!file || submitting}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {file ? (
          <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <FileText className="size-4 text-muted-foreground" />
            {file.name}
            <button
              type="button"
              className="text-muted-foreground hover:text-fail"
              onClick={() => setFile(null)}
              aria-label="Remove PDF"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 text-primary hover:underline">
            <FileText className="size-4" />
            Upload a PDF instead
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) setText("");
              }}
            />
          </label>
        )}
      </div>

      <ErrorMessage message={error} />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={submitting || (file ? false : !text.trim() || !name.trim())}
        >
          {submitting && <Spinner className="size-3.5" />}
          Add to knowledge
        </Button>
        {!submitting && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
