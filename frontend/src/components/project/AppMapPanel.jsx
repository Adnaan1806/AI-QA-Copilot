import { useEffect, useState } from "react";
import { ChevronRight, RotateCw, Settings2 } from "lucide-react";
import {
  crawlApp,
  getAppMap,
  getFact,
  updateCrawlSettings,
} from "../../services/api";
import { formatDate, plural } from "../../lib/qa";
import { cn } from "../../lib/utils";
import Spinner from "../../motion/Spinner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ErrorMessage, LoadingMessage } from "../StatusMessages";
import FactActions from "./FactActions";
import WorkflowsPanel from "./WorkflowsPanel";

const POLL_MS = 3000;

const STATUS_LABEL = {
  observed: "Seen by the crawler",
  proven: "Proven by a passing test",
  stated: "Stated by a person",
  confirmed: "Confirmed",
};

function PageDetail({ projectId, pageId, onRemoved }) {
  const [fact, setFact] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getFact(projectId, pageId)
      .then(setFact)
      .catch((err) => setError(err.message));
  }, [projectId, pageId]);

  if (error) return <ErrorMessage message={error} />;
  if (!fact) return <LoadingMessage />;
  const {
    headings = [],
    buttons = [],
    fields = [],
    messages = [],
  } = fact.content;

  const section = (title, items) =>
    items.length > 0 && (
      <div className="space-y-1">
        <h5 className="text-xs text-muted-foreground">{title}</h5>
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="space-y-3">
      {section(
        "Headings",
        headings.map((h) => h.text),
      )}
      {section(
        "Buttons",
        buttons.map((b) =>
          b.role === "button" ? b.name : `${b.role}: ${b.name}`,
        ),
      )}
      {section(
        "Fields",
        fields.map(
          (f) =>
            `${f.label || "(no label)"} · ${f.type}${f.required ? " · required" : ""}${
              f.options?.length ? `: ${f.options.join(", ")}` : ""
            }`,
        ),
      )}
      {section("Messages", messages)}
      <p className="text-xs text-muted-foreground">
        {STATUS_LABEL[fact.status] ?? fact.status} · first seen{" "}
        {formatDate(fact.first_seen_at)} · last seen{" "}
        {formatDate(fact.last_seen_at)}
      </p>
      <FactActions projectId={projectId} fact={fact} what="page" onChanged={setFact} onRemoved={onRemoved} />
    </div>
  );
}

function SettingsForm({ projectId, settings, onSaved, onCancel }) {
  const [maxPages, setMaxPages] = useState(settings.max_pages);
  const [maxDepth, setMaxDepth] = useState(settings.max_depth);
  const [startPaths, setStartPaths] = useState(settings.start_paths.join("\n"));
  const [respectRobots, setRespectRobots] = useState(settings.respect_robots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await updateCrawlSettings(projectId, {
          max_pages: Number(maxPages),
          max_depth: Number(maxDepth),
          start_paths: startPaths.split("\n"),
          respect_robots: respectRobots,
        }),
      );
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="crawl-pages">Most pages</Label>
          <Input
            id="crawl-pages"
            type="number"
            min={1}
            max={200}
            value={maxPages}
            onChange={(e) => setMaxPages(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The crawl stops after this many pages.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crawl-depth">Most clicks from the start</Label>
          <Input
            id="crawl-depth"
            type="number"
            min={0}
            max={10}
            value={maxDepth}
            onChange={(e) => setMaxDepth(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Pages further away than this are skipped.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="crawl-starts">Also start from</Label>
        <textarea
          id="crawl-starts"
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm"
          placeholder={"/docs/intro\n/checkout"}
          value={startPaths}
          onChange={(e) => setStartPaths(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          One path per line. Use this to aim the crawl at the parts your
          requirements cover.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={respectRobots}
          onChange={(e) => setRespectRobots(e.target.checked)}
        />
        <span>
          Follow the site&apos;s robots.txt
          <span className="block text-xs text-muted-foreground">
            Turn off only for an app you own.
          </span>
        </span>
      </label>
      <ErrorMessage message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Spinner className="size-3.5" />}
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function pagePath(url) {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

// "Learned from the app": the crawled pages and the flows passing tests proved,
// side by side. Both guide the steps of a test, never what it expects.
export default function AppMapPanel({ projectId, hasBaseUrl, onCounts }) {
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const running = map?.status === "running";

  function show(updated) {
    setMap(updated);
    onCounts({ pages: updated.pages.length, mappedAt: updated.finished_at });
  }

  useEffect(() => {
    getAppMap(projectId)
      .then(show)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Poll while a crawl runs; pages appear when it finishes.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      getAppMap(projectId)
        .then(show)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, running]);

  async function handleCrawl() {
    setStarting(true);
    setError(null);
    try {
      show(await crawlApp(projectId));
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const status = !map
    ? null
    : running
      ? "Mapping the app. This takes about a minute for 30 pages."
      : map.status === "done"
        ? `Mapped ${formatDate(map.finished_at)}`
        : map.status === "failed"
          ? null
          : "Not mapped yet";

  return (
    <section id="knowledge-app" aria-label="Learned from the app" className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-semibold">Learned from the app</h3>
          <span className="text-xs text-muted-foreground">Guides the steps, never what a test expects</span>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className="tabular text-xs text-muted-foreground">{status}</span>}
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} disabled={!map || running}>
            <Settings2 />
            Crawl settings
          </Button>
          <Button variant="outline" size="sm" onClick={handleCrawl} disabled={!map || !hasBaseUrl || running || starting}>
            {running || starting ? <Spinner className="size-3.5" /> : <RotateCw />}
            {map?.status ? "Refresh map" : "Map the app"}
          </Button>
        </div>
      </div>

      {editing && map && (
        <SettingsForm
          projectId={projectId}
          settings={map.settings}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            show(updated);
            setEditing(false);
          }}
        />
      )}
      {!hasBaseUrl && <p className="text-sm text-review">Add the app URL above to map the app.</p>}
      {map?.status === "failed" && <ErrorMessage message={`The last crawl failed: ${map.error}`} />}
      <ErrorMessage message={error} />

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm">
            <span className="font-medium">Pages</span>
            <span className="tabular text-muted-foreground">{map ? map.pages.length : ""}</span>
          </div>
          {!map ? (
            <div className="p-4">
              <LoadingMessage />
            </div>
          ) : map.pages.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              None yet. Map the app to see its pages, buttons and fields. It never clicks buttons or submits forms.
            </p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {map.pages.map((page) => {
                const open = openId === page.id;
                return (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : page.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
                    >
                      <ChevronRight
                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{page.title}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{pagePath(page.url)}</span>
                      </span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {page.status === "confirmed"
                          ? "Confirmed"
                          : [page.buttons && plural(page.buttons, "control"), page.fields && plural(page.fields, "field")]
                              .filter(Boolean)
                              .join(" · ") || "Content only"}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3 pl-11">
                        <PageDetail
                          projectId={projectId}
                          pageId={page.id}
                          onRemoved={() => {
                            setOpenId(null);
                            getAppMap(projectId).then(show).catch(() => {});
                          }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {map?.layout && (
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              On every page:{" "}
              <span className="font-mono">{map.layout.buttons.join(" · ")}</span>
              {map.layout.link_count > 0 && ` · ${plural(map.layout.link_count, "navigation link")}`}
            </p>
          )}
          {map?.skipped.length > 0 && (
            <div className="border-t border-border px-4 py-2.5">
              <button
                type="button"
                onClick={() => setShowSkipped((v) => !v)}
                aria-expanded={showSkipped}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", showSkipped && "rotate-90")} />
                {plural(map.skipped_count, "link")} not visited, and why
              </button>
              {showSkipped && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {map.skipped.map((link) => (
                    <li key={link.url} className="flex gap-2">
                      <span className="min-w-0 truncate font-mono text-muted-foreground">{link.url}</span>
                      <span className="shrink-0">{link.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <WorkflowsPanel projectId={projectId} onCounts={onCounts} />
      </div>
    </section>
  );
}
