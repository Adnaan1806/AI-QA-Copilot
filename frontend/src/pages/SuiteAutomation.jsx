import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateAutomationAndReport, getTestSuite } from "../services/api";
import Reveal from "../motion/Reveal";
import Spinner from "../motion/Spinner";
import { useListStagger } from "../motion/useListStagger";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import AutomationProgressBar from "../components/AutomationProgressBar";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ErrorMessage, PageError, PageLoading } from "../components/StatusMessages";

function RequirementRow({ r, generating, onGenerate }) {
  return (
    <Card className="py-0">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="min-w-0 pr-4">
          <p className="truncate font-medium text-foreground">{r.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.approved_test_case_count}/{r.test_case_count} accepted
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {r.has_report && (
            <Button variant="outline" asChild>
              <Link to={`/requirements/${r.id}/automation`}>View Results</Link>
            </Button>
          )}
          <Button
            onClick={onGenerate}
            disabled={generating}
            className="gap-1.5 bg-linear-to-r from-primary to-emerald-500 text-white shadow-sm shadow-primary/25 hover:opacity-90"
          >
            {generating && <Spinner className="h-3.5 w-3.5" />}
            {generating
              ? "Generating..."
              : r.has_report
                ? "Regenerate"
                : "Generate Automation & Report"}
          </Button>
        </div>
      </div>
      <Reveal show={generating}>
        <div className="border-t border-border px-4 py-4">
          <AutomationProgressBar requirementId={r.id} />
        </div>
      </Reveal>
    </Card>
  );
}

export default function SuiteAutomation() {
  const { suiteId } = useParams();
  const [suite, setSuite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const listRef = useListStagger([loading, suite?.requirements.length]);

  useSetBreadcrumbs(
    suite
      ? [
          { label: "Projects", to: "/" },
          { label: suite.name, to: `/suites/${suiteId}` },
          { label: "Test Automation" },
        ]
      : [],
  );

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

  async function handleGenerate(requirementId) {
    setGeneratingId(requirementId);
    setError(null);
    try {
      await generateAutomationAndReport(requirementId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingId(null);
    }
  }

  if (loading) {
    return <PageLoading />;
  }

  if (error && !suite) {
    return <PageError message={error} />;
  }

  const eligible = suite.requirements.filter(
    (r) => r.test_case_count > 0 && r.approved_test_case_count === r.test_case_count,
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Test Automation</h1>
      <p className="mt-1 text-muted-foreground">
        {suite.name} · Playwright scripts and release reports for requirements with accepted
        test cases
      </p>

      <ErrorMessage message={error} className="mt-4" />

      <div ref={listRef} className="mt-8 space-y-2">
        {eligible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No requirements with accepted test cases yet. Open a requirement, accept its test
              cases, then come back here to generate automation.
            </p>
          </div>
        ) : (
          eligible.map((r) => (
            <RequirementRow
              key={r.id}
              r={r}
              generating={generatingId === r.id}
              onGenerate={() => handleGenerate(r.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
