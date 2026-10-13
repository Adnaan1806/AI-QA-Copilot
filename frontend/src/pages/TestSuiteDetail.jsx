import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, Plus, X } from "lucide-react";
import { createRequirement, getProject, getTestSuite } from "../services/api";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { useDataVersion } from "../context/DataVersionContext";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import RequirementTable from "../components/RequirementTable";
import AnalysisProgress from "../components/AnalysisProgress";
import {
  EmptyState,
  ErrorMessage,
  Page,
  PageError,
  PageHeader,
  PageLoading,
} from "../components/StatusMessages";

function AddRequirementForm({ suiteId, onCancel, onCreated }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressKey, setProgressKey] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    // randomUUID needs a secure context (https or localhost).
    const key = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setProgressKey(key);
    setSubmitting(true);
    setError(null);
    try {
      const created = await createRequirement(suiteId, { text, file, progressKey: key });
      onCreated(created.requirement_id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="space-y-1.5">
        <Label htmlFor="requirement-text">Requirement</Label>
        <Textarea
          id="requirement-text"
          className="min-h-32 resize-y"
          placeholder="Paste a user story, requirement, or acceptance criteria"
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
        <Button type="submit" disabled={submitting || (!text.trim() && !file)}>
          {submitting && <Spinner className="size-3.5" />}
          {submitting ? "Analyzing" : "Analyze and draft test cases"}
        </Button>
        {!submitting && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {submitting && <span className="text-sm text-muted-foreground">This usually takes under a minute.</span>}
      </div>

      {submitting && progressKey && (
        <div className="border-t border-border pt-4">
          <AnalysisProgress progressKey={progressKey} />
        </div>
      )}
    </form>
  );
}

export default function TestSuiteDetail() {
  const { suiteId } = useParams();
  const navigate = useNavigate();
  const { bump } = useDataVersion();
  const [suite, setSuite] = useState(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useSetBreadcrumbs(
    suite && project
      ? [
          { label: "Projects", to: "/" },
          { label: project.name, to: `/projects/${project.id}` },
          { label: suite.name },
        ]
      : [],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    getTestSuite(suiteId)
      .then(async (s) => {
        setSuite(s);
        setShowForm(s.requirements.length === 0);
        setProject(await getProject(s.project_id));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [suiteId]);

  if (loading) return <PageLoading />;
  if (error && !suite) return <PageError message={error} />;

  return (
    <Page className="space-y-6">
      <PageHeader
        title={suite.name}
        subtitle={suite.description}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/suites/${suiteId}/automation`}>Automation overview</Link>
            </Button>
            {!showForm && (
              <Button onClick={() => setShowForm(true)}>
                <Plus />
                Add requirement
              </Button>
            )}
          </>
        }
      />

      {showForm && (
        <AddRequirementForm
          suiteId={suiteId}
          onCancel={() => setShowForm(false)}
          onCreated={(requirementId) => {
            bump();
            navigate(`/requirements/${requirementId}`);
          }}
        />
      )}

      <ErrorMessage message={error} />

      {suite.requirements.length === 0 ? (
        !showForm && (
          <EmptyState>
            No requirements yet. Add one and the copilot drafts test cases for you to review.
          </EmptyState>
        )
      ) : (
        <RequirementTable requirements={suite.requirements} />
      )}
    </Page>
  );
}
