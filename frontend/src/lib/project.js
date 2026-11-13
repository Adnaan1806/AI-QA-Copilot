import { activeTotal, readVerdict } from "./qa";

// Tailwind needs whole class names, so each tone is spelled out.
const TONES = [
  "bg-[var(--tone-1)] text-[var(--tone-1-ink)]",
  "bg-[var(--tone-2)] text-[var(--tone-2-ink)]",
  "bg-[var(--tone-3)] text-[var(--tone-3-ink)]",
  "bg-[var(--tone-4)] text-[var(--tone-4-ink)]",
  "bg-[var(--tone-5)] text-[var(--tone-5-ink)]",
];

// The same project always gets the same tone, on every page.
export function projectTone(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

// "Retail Demo Store" -> "RD", "Playwright.dev Smoke" -> "PS", "Shop" -> "SH".
export function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

// The app's host, without the long path some apps carry.
export function appHost(baseUrl) {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).host.replace(/^www\./, "");
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
}

// "Today", "Yesterday", or "12 Oct".
export function relativeDay(iso) {
  const date = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// One project's totals, from the requirement list (which carries project_id).
export function projectSummary(project, requirements) {
  const own = requirements
    .filter((r) => r.project_id === project.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const counts = { draft: 0, approved: 0, rejected: 0, passed: 0, failed: 0, needs_review: 0 };
  for (const r of own) for (const k of Object.keys(counts)) counts[k] += r.case_counts[k] ?? 0;
  const reported = own.find((r) => r.release_recommendation || r.release_verdict);
  return {
    requirements: own.length,
    cases: activeTotal(counts),
    counts,
    verdict: reported ? readVerdict(reported.release_recommendation, reported.release_verdict) : null,
    lastActivity: own[0]?.created_at ?? project.created_at,
  };
}
