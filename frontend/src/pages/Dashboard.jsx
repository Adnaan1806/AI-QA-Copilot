import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CircleAlert, CircleX, Inbox, Plus } from "lucide-react";
import { createProject, listProjects, listRequirements } from "../services/api";
import Spinner from "../motion/Spinner";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { useDataVersion } from "../context/DataVersionContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import ProjectTile from "../components/ProjectTile";
import { useAuth } from "../context/AuthContext";
import {
  EmptyState,
  ErrorMessage,
  PageLoading,
  Page,
  PageHeader,
} from "../components/StatusMessages";
import { plural, readVerdict } from "../lib/qa";
import { appHost, projectSummary, relativeDay } from "../lib/project";
import { cn } from "../lib/utils";

// Draft cases first (someone has to review them), then failing scripts, then
// requirements whose report says they can't ship.
function needsAttention(requirements) {
  const score = (r) => {
    if (r.case_counts.draft > 0) return 0;
    if (r.case_counts.needs_review > 0) return 1;
    if (readVerdict(r.release_recommendation, r.release_verdict)?.tone === "fail") return 2;
    return null;
  };
  return requirements
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => a.s - b.s || new Date(a.r.created_at) - new Date(b.r.created_at))
    .map((x) => x.r);
}

function NewProjectForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({ name, description, base_url: baseUrl });
      onCreated(project);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Project name</Label>
        <Input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-base-url">App URL to test</Label>
        <Input
          id="project-base-url"
          type="url"
          placeholder="https://your-app.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Automation runs against this URL. You can add it later.</p>
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="project-description">Description</Label>
        <Textarea
          id="project-description"
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-16 resize-none"
        />
      </div>
      <ErrorMessage message={error} className="md:col-span-2" />
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={creating}>
          {creating && <Spinner className="size-3.5" />}
          Create project
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const KIND = {
  draft: { icon: Inbox, tone: "bg-pencil-wash text-primary" },
  failing: { icon: CircleAlert, tone: "bg-review-wash text-review" },
  "not-ready": { icon: CircleX, tone: "bg-fail-wash text-fail" },
};

const CHIP = "inline-flex h-[22px] items-center whitespace-nowrap rounded px-2 text-xs font-medium";
const VERDICT_CHIP = { pass: "bg-pass-wash text-pass", review: "bg-review-wash text-review", fail: "bg-fail-wash text-fail" };

const isNotReady = (r) => readVerdict(r.release_recommendation, r.release_verdict)?.tone === "fail";

// What a requirement needs from you and where to do it: its most urgent reason,
// or the given one when the list is filtered to it.
function taskFor(r, kind) {
  const why = kind ?? (r.case_counts.draft > 0 ? "draft" : r.case_counts.needs_review > 0 ? "failing" : "not-ready");
  if (why === "draft") {
    const n = r.case_counts.draft;
    return { kind: why, reason: `${plural(n, "draft case")} to review`, chip: `${n} to review`, action: "Review", to: `/requirements/${r.id}` };
  }
  if (why === "failing") {
    const n = r.case_counts.needs_review;
    return { kind: why, reason: `${plural(n, "script")} to check after the last run`, chip: `${n} failing`, action: "Open run", to: `/requirements/${r.id}/automation` };
  }
  return { kind: why, reason: "the report says it isn't ready", chip: "Not ready", action: "See report", to: `/requirements/${r.id}/report` };
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function SummaryTile({ kind, label, count, detail, active, onClick }) {
  const Icon = KIND[kind].icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card px-[18px] py-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg",
        active ? "border-primary shadow-[0_0_0_1px_var(--pencil)]" : "border-border",
      )}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("grid size-7 place-items-center rounded-lg", KIND[kind].tone)}>
          <Icon className="size-4" />
        </span>
        {label}
      </span>
      <span className="tabular text-3xl leading-none font-semibold">{count}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

function TaskRow({ requirement: r, task }) {
  const Icon = KIND[task.kind].icon;
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-t border-border px-4 py-3.5 first:border-t-0 hover:bg-muted/40 sm:grid-cols-[36px_minmax(0,1fr)_auto]">
      <span className={cn("grid size-9 place-items-center rounded-[10px]", KIND[task.kind].tone)}>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <Link to={task.to} className="block truncate font-medium hover:underline">
          {r.name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          {r.project_name} / {r.suite_name} · {task.reason}
        </span>
      </span>
      <span className="col-start-2 flex items-center gap-3 sm:col-start-auto">
        <span className={cn(CHIP, task.kind === "draft" ? "bg-pencil-wash text-primary" : task.kind === "failing" ? VERDICT_CHIP.review : VERDICT_CHIP.fail)}>
          {task.chip}
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link to={task.to}>{task.action}</Link>
        </Button>
      </span>
    </li>
  );
}

function ProjectCard({ project, summary }) {
  const { counts, cases } = summary;
  const host = appHost(project.base_url);
  const badge =
    counts.draft > 0
      ? { text: `${counts.draft} to review`, cls: "bg-pencil-wash text-primary" }
      : counts.needs_review > 0
        ? { text: `${counts.needs_review} failing`, cls: VERDICT_CHIP.review }
        : !host
          ? { text: "No app URL", cls: VERDICT_CHIP.review }
          : summary.requirements === 0
            ? { text: "Set up", cls: "text-muted-foreground ring-1 ring-border ring-inset" }
            : cases > 0 && counts.passed === cases
              ? { text: "All passing", cls: VERDICT_CHIP.pass }
              : null;
  const width = (n) => ({ width: cases ? `${(n / cases) * 100}%` : "0%" });

  return (
    <Link
      to={`/projects/${project.id}`}
      className="flex flex-col gap-3.5 rounded-2xl sm:aspect-square border border-border bg-card p-[18px] transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
    >
      <span className="flex items-start justify-between gap-2">
        <ProjectTile project={project} size="lg" />
        {badge && <span className={cn(CHIP, badge.cls)}>{badge.text}</span>}
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="block truncate text-base font-semibold">{project.name}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{host ?? "No app URL yet"}</span>
        {project.description && (
          <span className="line-clamp-2 pt-1 text-xs text-muted-foreground">{project.description}</span>
        )}
      </span>
      <span className="mt-auto grid grid-cols-3 gap-1.5">
        {[
          [project.test_suite_count, "suite"],
          [summary.requirements, "requirement"],
          [cases, "case"],
        ].map(([n, word]) => (
          <span key={word} className="flex flex-col">
            <span className="tabular text-lg font-semibold">{n}</span>
            <span className="text-[11px] text-muted-foreground">{n === 1 ? word : `${word}s`}</span>
          </span>
        ))}
      </span>
      <span
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        title={cases ? `${counts.passed} passed, ${counts.needs_review} failing, ${counts.approved} approved, ${counts.draft} draft` : "No cases yet"}
      >
        <span className="bg-pass" style={width(counts.passed)} />
        <span className="bg-review" style={width(counts.needs_review)} />
        <span className="bg-muted-foreground/60" style={width(counts.approved)} />
      </span>
      <span className="flex items-center justify-between gap-2">
        {summary.verdict ? (
          <span className={cn(CHIP, VERDICT_CHIP[summary.verdict.tone])}>{summary.verdict.short}</span>
        ) : (
          <span className={cn(CHIP, "text-muted-foreground ring-1 ring-border ring-inset")}>
            {summary.requirements ? "No report yet" : "No requirements yet"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{relativeDay(summary.lastActivity)}</span>
      </span>
    </Link>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bump } = useDataVersion();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [focus, setFocus] = useState(null); // draft | failing | not-ready
  const [sort, setSort] = useState("recent");
  const showForm = searchParams.get("new") === "1";

  useSetBreadcrumbs([{ label: "Home" }]);

  useEffect(() => {
    Promise.all([listProjects(), listRequirements()])
      .then(([p, r]) => {
        setProjects(p);
        setRequirements(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function setShowForm(open) {
    setSearchParams(open ? { new: "1" } : {}, { replace: true });
    if (open) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const drafts = requirements.filter((r) => r.case_counts.draft > 0);
  const failing = requirements.filter((r) => r.case_counts.needs_review > 0);
  const notReady = requirements.filter(isNotReady);
  const draftCases = drafts.reduce((sum, r) => sum + r.case_counts.draft, 0);
  const failingScripts = failing.reduce((sum, r) => sum + r.case_counts.needs_review, 0);

  const FOCUS_LIST = { draft: drafts, failing, "not-ready": notReady };
  const tasks = (focus ? FOCUS_LIST[focus] : needsAttention(requirements))
    .slice(0, 6)
    .map((r) => ({ r, task: taskFor(r, focus ?? undefined) }));
  const next = needsAttention(requirements).find((r) => r.case_counts.draft > 0);

  const cards = projects
    .map((p) => ({ project: p, summary: projectSummary(p, requirements) }))
    .sort((a, b) =>
      sort === "name"
        ? a.project.name.localeCompare(b.project.name)
        : new Date(b.summary.lastActivity) - new Date(a.summary.lastActivity),
    );

  const headline = [
    draftCases > 0 && `${plural(draftCases, "case is", "cases are")} waiting for your review`,
    notReady.length > 0 && `${plural(notReady.length, "release isn't", "releases aren't")} ready yet`,
  ].filter(Boolean);
  const firstName = user?.name?.split(" ")[0];

  return (
    <Page className="max-w-7xl space-y-8">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={
          loading
            ? null
            : headline.length
              ? `${headline.join(", and ")}.`
              : "Nothing is waiting for you right now."
        }
        actions={
          next ? (
            <Button asChild>
              <Link to={`/requirements/${next.id}`}>
                Continue reviewing: {next.name}
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            !showForm && (
              <Button onClick={() => setShowForm(true)}>
                <Plus />
                New project
              </Button>
            )
          )
        }
      />

      {showForm && (
        <NewProjectForm
          onCancel={() => setShowForm(false)}
          onCreated={(project) => {
            bump();
            navigate(`/projects/${project.id}`);
          }}
        />
      )}

      <ErrorMessage message={error} />

      {loading ? (
        <PageLoading className="min-h-[50vh]" />
      ) : (
        <>
          {requirements.length > 0 && (
            <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
              {[
                ["draft", "Cases to review", draftCases, `across ${plural(drafts.length, "requirement")}`],
                ["failing", "Scripts to check", failingScripts, "failed or flaky on the last run"],
                ["not-ready", "Not ready to release", notReady.length, "reports that say no"],
              ].map(([kind, label, count, detail]) => (
                <SummaryTile
                  key={kind}
                  kind={kind}
                  label={label}
                  count={count}
                  detail={detail}
                  active={focus === kind}
                  onClick={() => setFocus(focus === kind ? null : kind)}
                />
              ))}
            </section>
          )}

          {requirements.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">Your next steps</h2>
                <Link to="/requirements" className="text-sm text-primary hover:underline">
                  All requirements
                </Link>
              </div>
              {tasks.length ? (
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                  {tasks.map(({ r, task }) => (
                    <TaskRow key={r.id} requirement={r} task={task} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  {focus ? "Nothing in this group right now." : "All caught up. Nothing needs you right now."}
                </p>
              )}
            </section>
          )}

          <section className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Projects</h2>
              {projects.length > 1 && (
                <div role="group" aria-label="Sort projects" className="flex gap-0.5 rounded-lg bg-muted p-[3px]">
                  {[
                    ["recent", "Recent"],
                    ["name", "A–Z"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={sort === key}
                      onClick={() => setSort(key)}
                      className={cn(
                        "h-7 rounded-md px-2.5 text-xs font-medium",
                        sort === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {projects.length === 0 ? (
              <EmptyState
                action={
                  !showForm && (
                    <Button onClick={() => setShowForm(true)}>
                      <Plus />
                      New project
                    </Button>
                  )
                }
              >
                Projects hold the test suites for one app. Create one to start adding requirements.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
                {cards.map(({ project, summary }) => (
                  <ProjectCard key={project.id} project={project} summary={summary} />
                ))}
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="flex min-h-32 flex-col items-center justify-center gap-2.5 rounded-2xl sm:aspect-square border border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  <span className="grid size-11 place-items-center rounded-xl border-[1.5px] border-dashed border-current">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-sm font-medium">New project</span>
                  <span className="text-xs text-muted-foreground">Point it at your app's URL</span>
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}

