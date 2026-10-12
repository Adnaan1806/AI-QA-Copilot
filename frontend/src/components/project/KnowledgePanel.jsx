import { useState } from "react";
import { Search, X } from "lucide-react";
import { searchKnowledge } from "../../services/api";
import { formatDate, plural } from "../../lib/qa";
import { cn } from "../../lib/utils";
import Spinner from "../../motion/Spinner";
import { ErrorMessage } from "../StatusMessages";
import AppMapPanel from "./AppMapPanel";
import OpenQuestionsSection from "./OpenQuestionsSection";
import TeamKnowledgePanel from "./TeamKnowledgePanel";

const STATUS = {
  observed: "Seen in the app",
  proven: "Proven by a passing test",
  stated: "From your team",
  confirmed: "Confirmed",
};

// One search over everything the project knows: what the agents would read
// for a requirement, so a reviewer can check the knowledge answers it.
function KnowledgeSearch({ projectId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
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
    <div className="space-y-3">
      <form onSubmit={search} role="search" className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-sm sm:w-80">
        {searching ? <Spinner className="size-3.5" /> : <Search className="size-3.5 text-muted-foreground" aria-hidden />}
        <input
          type="search"
          aria-label="Search knowledge"
          placeholder="Search pages, flows, rules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </form>
      <ErrorMessage message={error} />
      {results && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {results.length ? `What the agents would read for “${query.trim()}”` : "Nothing in this project's knowledge matches."}
            </span>
            <button type="button" onClick={() => setResults(null)} aria-label="Close search results" className="hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <ol className="space-y-2">
            {results.map((result, i) => (
              <li key={i} className="space-y-1 rounded-md border border-border p-2.5 text-sm">
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {result.source}
                    {result.status && ` · ${STATUS[result.status] ?? result.status}`}
                  </span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap">{result.content}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ href, label, value, detail, tone }) {
  return (
    <a
      href={href}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-4 transition-colors hover:border-primary/50",
        tone === "review" ? "border-review/40 bg-review-wash" : "border-border bg-card",
      )}
    >
      <span className={cn("text-xs", tone === "review" ? "text-review" : "text-muted-foreground")}>{label}</span>
      <span className="tabular text-lg font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </a>
  );
}

// Everything the project knows, by where it came from: what the app showed
// (guides steps), what the team said (can decide expectations), and the
// questions still waiting for an answer.
export default function KnowledgePanel({ projectId, hasBaseUrl }) {
  const [counts, setCounts] = useState({});
  const [teamVersion, setTeamVersion] = useState(0);
  const report = (partial) => setCounts((c) => ({ ...c, ...partial }));
  const known = (key) => counts[key] ?? "–";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <h2 className="text-base font-semibold">What this project knows</h2>
          <p className="text-sm text-muted-foreground">
            The agents read this before they write or run tests. What the app shows guides the steps; what your
            team says can decide what a test expects.
          </p>
        </div>
        <KnowledgeSearch projectId={projectId} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          href="#knowledge-app"
          label="Learned from the app"
          value={`${plural(known("pages"), "page")} · ${plural(known("flows"), "flow")}`}
          detail={counts.mappedAt ? `Mapped ${formatDate(counts.mappedAt)}` : "Not mapped yet"}
        />
        <SummaryCard
          href="#knowledge-team"
          label="From your team"
          value={`${known("rules")} rules · ${known("terms")} terms · ${known("documents")} docs`}
          detail="Can decide what tests expect"
        />
        <SummaryCard
          href="#knowledge-questions"
          label="Open questions"
          value={counts.questions ? `${counts.questions} waiting` : "None waiting"}
          detail={counts.questions ? "Answer one and it becomes a rule" : "Questions from requirements land here"}
          tone={counts.questions ? "review" : undefined}
        />
      </div>

      <OpenQuestionsSection
        projectId={projectId}
        onCount={(questions) => report({ questions })}
        onAnswered={() => setTeamVersion((v) => v + 1)}
      />
      <AppMapPanel projectId={projectId} hasBaseUrl={hasBaseUrl} onCounts={report} />
      <TeamKnowledgePanel projectId={projectId} version={teamVersion} onCounts={report} />
    </div>
  );
}
