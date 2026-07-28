import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download } from "lucide-react";
import {
  approveAllTestCases,
  deleteTestCase,
  exportTestCases,
  getRequirement,
  updateTestCase,
} from "../services/api";
import AnalysisResult from "../components/AnalysisResult";
import TestCaseTable from "../components/TestCaseTable";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";

export default function RequirementTestCases() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const analysis = useMemo(
    () =>
      requirement && {
        requirements: requirement.requirements,
        risks: requirement.risks,
        missing_info: requirement.missing_info,
        testing_considerations: requirement.testing_considerations,
      },
    [requirement],
  );

  useSetBreadcrumbs(
    requirement
      ? [
          { label: "Projects", to: "/" },
          { label: requirement.name, to: `/requirements/${id}` },
          { label: "Test Cases" },
        ]
      : [],
  );

  function load() {
    setLoading(true);
    setError(null);
    return getRequirement(id)
      .then(setRequirement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpdateTestCase(testCaseId, patch) {
    setError(null);
    try {
      await updateTestCase(testCaseId, patch);
      // Editing content resets just this test case back to draft server-side.
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteTestCase(testCaseId) {
    setError(null);
    try {
      await deleteTestCase(testCaseId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAcceptAll() {
    setAccepting(true);
    setError(null);
    try {
      const testCases = await approveAllTestCases(id);
      setRequirement((prev) => ({ ...prev, test_cases: testCases }));
    } catch (err) {
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await exportTestCases(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (error && !requirement) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-sm text-destructive">
        {error}
      </p>
    );
  }

  const totalCount = requirement.test_cases.length;
  const approvedCount = requirement.test_cases.filter((tc) => tc.status === "approved").length;
  const allAccepted = totalCount > 0 && approvedCount === totalCount;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Requirement Analysis & Test Cases
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCount === 0 ? "No test cases yet" : `${approvedCount} of ${totalCount} accepted`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allAccepted && (
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-1.5">
              {exporting ? <Spinner className="h-3.5 w-3.5" /> : <Download className="size-4" />}
              {exporting ? "Exporting..." : "Export to Excel"}
            </Button>
          )}
          <Button
            onClick={handleAcceptAll}
            disabled={accepting || totalCount === 0 || allAccepted}
            className="gap-1.5 bg-linear-to-r from-primary to-emerald-500 text-white shadow-sm shadow-primary/25 hover:opacity-90"
          >
            {accepting && <Spinner className="h-3.5 w-3.5" />}
            {accepting
              ? "Accepting..."
              : allAccepted
                ? "All Test Cases Accepted"
                : "Accept All Test Cases"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">Analysis</h2>
      <AnalysisResult result={analysis} />

      <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">Test Cases</h2>
      <TestCaseTable
        testCases={requirement.test_cases}
        onUpdate={handleUpdateTestCase}
        onDelete={handleDeleteTestCase}
      />
    </div>
  );
}
