import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateAutomationAndReport, getProject, getTestSuite } from "../services/api";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { useDataVersion } from "../context/DataVersionContext";
import AutomationProgressBar from "../components/AutomationProgressBar";
import CaseStrip from "../components/CaseStrip";
import { VerdictChip } from "../components/QaChips";
import { Button } from "../components/ui/button";
import {
  EmptyState,
  ErrorMessage,
  Page,
  PageError,
  PageHeader,
  PageLoading,
} from "../components/StatusMessages";
import { plural, readVerdict, readyToAutomate } from "../lib/qa";

function SuiteSummary({ requirements }) {
  const tones = requirements.map((r) => readVerdict(r.release_recommendation, r.release_verdict)?.tone);
  const notReady = tones.filter((t) => t === "fail").length;
  const ready = tones.filter((t) => t === "pass").length;
  const noReport = tones.filter((t) => !t).length;
  const shippable = requirements.length > 0 && ready === requirements.length;

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-5 py-4">
      <span className={`text-lg font-semibold ${shippable ? "text-pass" : "text-fail"}`}>
        {shippable ? "Suite ready to release" : "Suite not ready to release"}
      </span>
      <span className="tabular flex flex-wrap gap-x-4 text-sm text-muted-foreground">
        {ready > 0 && <span className="text-pass">{ready} ready</span>}
        {notReady > 0 && <span className="text-fail">{notReady} not ready</span>}
        {noReport > 0 && <span>{plural(noReport, "requirement")} without a report</span>}
      </span>
    </div>
  );
}

export default function SuiteAutomation() {
  const { suiteId } = useParams();
  const { bump } = useDataVersion();
  const [suite, setSuite] = useState(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);

  useSetBreadcrumbs(
    suite && project
      ? [
          { label: "Projects", to: "/" },
          { label: project.name, to: `/projects/${project.id}` },
          { label: suite.name, to: `/suites/${suiteId}` },
          { label: "Automation" },
        ]
      : [],
  );

  function load() {
    setError(null);
    return getTestSuite(suiteId)
      .then(async (s) => {
        setSuite(s);
        setProject(await getProject(s.project_id));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteId]);

  async function handleGenerate(requirementId) {
    setGeneratingId(requirementId);
    setError(null);
    try {
      await generateAutomationAndReport(requirementId);
      bump();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingId(null);
    }
  }

  if (loading) return <PageLoading />;
  if (error && !suite) return <PageError message={error} />;

  return (
    <Page className="space-y-6">
      <PageHeader
        title="Automation overview"
        subtitle={`Release readiness for every requirement in ${suite.name}`}
      />

      <ErrorMessage message={error} />

      {suite.requirements.length === 0 ? (
        <EmptyState>
          No requirements in this suite yet.{" "}
          <Link to={`/suites/${suiteId}`} className="text-primary hover:underline">
            Add one
          </Link>
        </EmptyState>
      ) : (
        <>
          <SuiteSummary requirements={suite.requirements} />
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-xs text-muted-foreground">
                  <th className="w-[38%] px-4 py-2 font-medium">Requirement</th>
                  <th className="px-4 py-2 font-medium">Cases</th>
                  <th className="px-4 py-2 font-medium">Verdict</th>
                  <th className="px-4 py-2 text-right font-medium">Next step</th>
                </tr>
              </thead>
              <tbody>
                {suite.requirements.map((r) => {
                  const counts = r.case_counts;
                  const ready = readyToAutomate(counts);
                  const generating = generatingId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-border first:border-t-0">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/requirements/${r.id}/automation`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <CaseStrip counts={counts} size="sm" />
                        </td>
                        <td className="px-4 py-2.5">
                          <VerdictChip recommendation={r.release_recommendation} verdict={r.release_verdict} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {ready ? (
                            <Button
                              size="sm"
                              variant={r.has_report ? "outline" : "default"}
                              disabled={generatingId !== null}
                              onClick={() => handleGenerate(r.id)}
                            >
                              {generating && <Spinner className="size-3" />}
                              {r.has_report ? "Re-run automation" : "Generate automation"}
                            </Button>
                          ) : (
                            <Link to={`/requirements/${r.id}`} className="text-sm text-primary hover:underline">
                              {counts.draft > 0
                                ? `Review ${plural(counts.draft, "draft case")}`
                                : "Add test cases"}
                            </Link>
                          )}
                        </td>
                      </tr>
                      {generating && (
                        <tr>
                          <td colSpan={4} className="px-4 pb-4">
                            <AutomationProgressBar requirementId={r.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}
