import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { useButtonPress } from "../motion/useButtonPress";

export default function RequirementTestCases() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const exportPress = useButtonPress();
  const acceptPress = useButtonPress();
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
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-gray-400 dark:text-gray-500">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (error && !requirement) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
        {error}
      </p>
    );
  }

  const totalCount = requirement.test_cases.length;
  const approvedCount = requirement.test_cases.filter((tc) => tc.status === "approved").length;
  const allAccepted = totalCount > 0 && approvedCount === totalCount;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to={`/requirements/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
      >
        ← Back to requirement
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Requirement Analysis & Test Cases
          </h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            {totalCount === 0 ? "No test cases yet" : `${approvedCount} of ${totalCount} accepted`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allAccepted && (
            <button
              ref={exportPress.ref}
              {...exportPress.handlers}
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              {exporting && <Spinner className="h-3.5 w-3.5" />}
              {exporting ? "Exporting..." : "Export to Excel"}
            </button>
          )}
          <button
            ref={acceptPress.ref}
            {...acceptPress.handlers}
            type="button"
            onClick={handleAcceptAll}
            disabled={accepting || totalCount === 0 || allAccepted}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {accepting && <Spinner className="h-3.5 w-3.5" />}
            {accepting
              ? "Accepting..."
              : allAccepted
                ? "All Test Cases Accepted"
                : "Accept All Test Cases"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Analysis
      </h2>
      <AnalysisResult result={analysis} />

      <h2 className="mt-8 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
        Test Cases
      </h2>
      <TestCaseTable
        testCases={requirement.test_cases}
        onUpdate={handleUpdateTestCase}
        onDelete={handleDeleteTestCase}
      />
    </div>
  );
}
