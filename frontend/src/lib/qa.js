// Shared vocabulary for test case state, requirement stage, and release verdict.
// Every screen derives its labels and colours from here so the same thing is
// always called the same name.

export const CASE_STATES = ["passed", "needs_review", "approved", "draft", "rejected"];

export const CASE_STATE_LABEL = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
  passed: "Passed",
  needs_review: "Needs review",
};

export const TYPE_LABEL = {
  functional: "Functional",
  negative: "Negative",
  edge_case: "Edge case",
  security: "Security",
};

export const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

export function caseLabel(index) {
  return `TC-${index + 1}`;
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

// State of one case on the requirement detail payload: review status first,
// then the automation result once an approved case has a script.
export function caseState(testCase, scriptsById) {
  if (testCase.status !== "approved") return testCase.status;
  const script = scriptsById.get(testCase.id);
  if (!script) return "approved";
  return script.status === "passed" ? "passed" : "needs_review";
}

export function scriptsByCaseId(requirement) {
  return new Map(requirement.automation_scripts.map((s) => [s.test_case_id, s]));
}

export function countStates(states) {
  const counts = { draft: 0, approved: 0, rejected: 0, passed: 0, needs_review: 0 };
  for (const s of states) counts[s] += 1;
  return counts;
}

export function activeTotal(counts) {
  return counts.draft + counts.approved + counts.passed + counts.needs_review;
}

// Cases that have been signed off, whether or not they're automated yet.
export function signedOff(counts) {
  return counts.approved + counts.passed + counts.needs_review;
}

export function readyToAutomate(counts) {
  return activeTotal(counts) > 0 && counts.draft === 0;
}

// Where a requirement is in review → automation → verdict.
export function requirementStage(counts, hasReport) {
  const total = activeTotal(counts);
  if (total === 0) return { key: "empty", label: "No cases" };
  if (counts.draft > 0) return { key: "review", label: "In review" };
  if (counts.approved > 0 || !hasReport) return { key: "ready", label: "Ready to automate" };
  return { key: "reported", label: "Reported" };
}

export function stageSteps(counts, hasAnalysis, hasReport) {
  const total = activeTotal(counts);
  const reviewed = total > 0 && counts.draft === 0;
  const automated = reviewed && counts.approved === 0 && counts.passed + counts.needs_review > 0;
  const steps = [
    { key: "analyzed", label: "Analyzed", done: hasAnalysis },
    { key: "reviewed", label: reviewed ? "Reviewed" : "Reviewing", done: reviewed },
    { key: "automated", label: "Automated", done: automated },
    { key: "verdict", label: "Verdict", done: automated && hasReport },
  ];
  const current = steps.find((s) => !s.done);
  return steps.map((s) => ({ ...s, current: s === current }));
}

// The report's release recommendation is free text written by the report agent
// (e.g. "Not ready to release — approve the remaining..."). Read its verdict
// from the wording so it can be shown first and in the right colour.
export function readVerdict(recommendation) {
  if (!recommendation) return null;
  const text = recommendation.trim();
  const lower = text.toLowerCase();
  let tone = "neutral";
  let headline = "Release recommendation";
  if (/\bnot ready\b|\bdo not release\b|\bdon't release\b|\bblock/.test(lower)) {
    tone = "fail";
    headline = "Not ready to release";
  } else if (/\bwith (caution|risks?)\b|\bconditional|\bcaveat/.test(lower)) {
    tone = "review";
    headline = "Ready with risks";
  } else if (/\bready\b/.test(lower)) {
    tone = "pass";
    headline = "Ready to release";
  }
  const detail = text
    .replace(/^(release recommendation:\s*)?(not ready to release|ready to release|ready with risks)\s*[—–:.-]*\s*/i, "")
    .trim();
  return {
    tone,
    headline,
    short: { fail: "Not ready", review: "Ready with risks", pass: "Ready", neutral: "See report" }[tone],
    detail: detail ? detail[0].toUpperCase() + detail.slice(1) : "",
  };
}

// Text colour for a verdict tone.
export const TONE_TEXT = {
  fail: "text-fail",
  review: "text-review",
  pass: "text-pass",
  neutral: "text-foreground",
};

export function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
