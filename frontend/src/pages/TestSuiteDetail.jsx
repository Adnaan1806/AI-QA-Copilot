import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Upload } from "lucide-react";
import { createRequirement, getTestSuite } from "../services/api";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ErrorMessage, PageError, PageLoading } from "../components/StatusMessages";

export default function TestSuiteDetail() {
  const { suiteId } = useParams();
  const [suite, setSuite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const listRef = useListStagger([loading, suite?.requirements.length]);

  useSetBreadcrumbs(suite ? [{ label: "Projects", to: "/" }, { label: suite.name }] : []);

  function load() {
    setLoading(true);
    setError(null);
    return getTestSuite(suiteId)
      .then(setSuite)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createRequirement(suiteId, { text, file });
      setText("");
      setFile(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected) setText("");
  }

  if (loading) {
    return <PageLoading />;
  }

  if (error && !suite) {
    return <PageError message={error} />;
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{suite.name}</h1>
          {suite.description && <p className="mt-1 text-muted-foreground">{suite.description}</p>}
        </div>
        <Button variant="outline" asChild>
          <Link to={`/suites/${suiteId}/automation`}>Test Automation</Link>
        </Button>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">Add a Requirement</h2>
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              className="h-32 resize-none"
              placeholder="Paste a user story, requirement, or acceptance criteria..."
              value={text}
              disabled={!!file}
              onChange={(e) => setText(e.target.value)}
            />

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5">
              <span className="flex items-center gap-2">
                <Upload className="size-4.5 shrink-0" />
                {file ? file.name : "Or upload a PDF requirement document"}
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {file && (
                <button
                  type="button"
                  className="text-xs font-medium text-destructive hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                  }}
                >
                  Remove
                </button>
              )}
            </label>

            <Button
              type="submit"
              disabled={submitting || (!text.trim() && !file)}
              className="w-full gap-2 bg-linear-to-r from-primary to-emerald-500 text-white hover:opacity-90"
            >
              {submitting && <Spinner className="h-4 w-4" />}
              {submitting ? "Analyzing & drafting test cases..." : "Add & Analyze Requirement"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ErrorMessage message={error} className="mt-4" />

      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">Requirements in this Suite</h2>
      {suite.requirements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm italic text-muted-foreground">No requirements yet.</p>
        </div>
      ) : (
        <div ref={listRef} className="space-y-2">
          {suite.requirements.map((r) => (
            <Link key={r.id} to={`/requirements/${r.id}`} className="block">
              <Card className="flex-row items-center justify-between px-4 py-3.5 transition-colors hover:bg-primary/5 hover:ring-primary/40">
                <div className="min-w-0 pr-4">
                  <p className="truncate font-medium text-foreground">{r.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">
                    {r.approved_test_case_count}/{r.test_case_count} approved
                  </Badge>
                  {r.has_report && (
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      Report ready
                    </Badge>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
