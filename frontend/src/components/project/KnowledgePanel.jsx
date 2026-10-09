import { useEffect, useState } from "react";
import { FileText, Plus, Search, Trash2, X } from "lucide-react";
import {
  deleteKnowledge,
  listKnowledge,
  searchKnowledge,
  uploadKnowledge,
} from "../../services/api";
import { formatDate, plural } from "../../lib/qa";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import ConfirmDialog from "../ConfirmDialog";
import AppMapPanel from "./AppMapPanel";
import WorkflowsPanel from "./WorkflowsPanel";
import { EmptyState, ErrorMessage, LoadingMessage } from "../StatusMessages";

function UploadForm({ projectId, onCancel, onUploaded }) {
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

// Shows what the agents would be given for a requirement, so a reviewer can
// check the knowledge actually answers the questions it should.
function TrySearch({ projectId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setResults((await searchKnowledge(projectId, query.trim())).results);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Try a search</h3>
        <p className="text-sm text-muted-foreground">
          Paste a requirement to see the passages the agents would read when
          drafting its test cases.
        </p>
      </div>
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1 basis-64"
          placeholder="e.g. Guest users can check out without an account"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={searching || !query.trim()}
        >
          {searching ? <Spinner className="size-3.5" /> : <Search />}
          Search
        </Button>
      </form>
      <ErrorMessage message={error} />
      {results &&
        (results.length ? (
          <ol className="space-y-2">
            {results.map((result, i) => (
              <li
                key={i}
                className="space-y-1 rounded-md border border-border p-3 text-sm"
              >
                <div className="tabular flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>{result.source}</span>
                  <span title="Relevance, 0 to 1">
                    {result.score.toFixed(2)}
                  </span>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap">
                  {result.content}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing found in this project's knowledge.
          </p>
        ))}
    </section>
  );
}

export default function KnowledgePanel({ projectId, hasBaseUrl }) {
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(null); // document awaiting confirmation
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDocuments(null);
    listKnowledge(projectId)
      .then(setDocuments)
      .catch((err) => setError(err.message));
  }, [projectId]);

  async function handleDelete() {
    setConfirming(true);
    try {
      await deleteKnowledge(projectId, deleting.id);
      setDocuments((docs) => docs.filter((d) => d.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  const addButton = !showForm && (
    <Button onClick={() => setShowForm(true)}>
      <Plus />
      Add document
    </Button>
  );

  return (
    <div className="space-y-10">
      <AppMapPanel projectId={projectId} hasBaseUrl={hasBaseUrl} />
      <WorkflowsPanel projectId={projectId} />

      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose space-y-1">
            <h3 className="text-sm font-semibold">Documents</h3>
            <p className="text-sm text-muted-foreground">
              Business rules, user guides and past stories for this project.
              Drafted test cases take their expected results from the
              requirement and from these documents. Other projects never see
              them.
            </p>
          </div>
          {documents?.length > 0 && addButton}
        </div>

        {showForm && (
          <UploadForm
            projectId={projectId}
            onCancel={() => setShowForm(false)}
            onUploaded={(doc) => {
              setShowForm(false);
              setDocuments((docs) => [doc, ...docs]);
            }}
          />
        )}

        <ErrorMessage message={error} />

        {documents === null ? (
          !error && <LoadingMessage />
        ) : documents.length === 0 ? (
          !showForm && (
            <EmptyState action={addButton}>No documents yet.</EmptyState>
          )
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {doc.name}
                  </span>
                  <span className="tabular hidden text-muted-foreground sm:inline">
                    {plural(doc.chunk_count, "passage")} · added{" "}
                    {formatDate(doc.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => setDeleting(doc)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <TrySearch projectId={projectId} />
          </>
        )}

        <ConfirmDialog
          open={!!deleting}
          title="Delete this document?"
          message={
            deleting &&
            `"${deleting.name}" will no longer be used when drafting test cases.`
          }
          confirmLabel="Delete"
          danger
          confirming={confirming}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      </div>
    </div>
  );
}
