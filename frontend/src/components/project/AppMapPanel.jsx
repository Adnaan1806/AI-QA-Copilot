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

const POLL_MS = 3000;

const STATUS_LABEL = {
  observed: "Seen by the crawler",
  proven: "Proven by a passing test",
  stated: "Stated by a person",
  confirmed: "Confirmed",
};

function PageDetail({ projectId, pageId }) {
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
            `${f.label || "(no label)"} · ${f.type}${f.required ? " · required" : ""}`,
        ),
      )}
      {section("Messages", messages)}
      <p className="text-xs text-muted-foreground">
        {STATUS_LABEL[fact.status] ?? fact.status} · first seen{" "}
        {formatDate(fact.first_seen_at)} · last seen{" "}
        {formatDate(fact.last_seen_at)}
      </p>
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

// Pages grouped by the first part of their path: "/docs/intro" -> "docs".
function sections(pages) {
  const counts = new Map();
  for (const page of pages) {
    const path = page.url.replace(/^https?:\/\/[^/]+/, "");
    const first = path.split("/").filter(Boolean)[0] ?? "";
    const name = first ? `/${first}` : "Home";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

function Summary({ map }) {
  const groups = sections(map.pages);
  const fields = map.pages.reduce((n, p) => n + p.fields, 0);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
      <div className="space-y-1.5">
        <h4 className="text-xs text-muted-foreground">Sections</h4>
        <ul className="flex flex-wrap gap-1.5">
          {groups.map(([name, count]) => (
            <li
              key={name}
              className="tabular rounded-md border border-border px-2 py-0.5"
            >
              <span className="font-mono text-xs">{name}</span>{" "}
              <span className="text-xs text-muted-foreground">{count}</span>
            </li>
          ))}
        </ul>
      </div>
      {map.layout && (
        <div className="space-y-1.5">
          <h4 className="text-xs text-muted-foreground">On every page</h4>
          <p>
            {map.layout.buttons.length > 0 && (
              <span className="font-mono text-xs">
                {map.layout.buttons.join(" · ")}
              </span>
            )}
            {map.layout.link_count > 0 && (
              <span className="text-muted-foreground">
                {map.layout.buttons.length > 0 && " · "}
                {plural(map.layout.link_count, "navigation link")}
              </span>
            )}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {fields > 0
          ? `${plural(fields, "form field")} found across the pages.`
          : "No form fields on the pages it reached. Forms behind a login or a click aren't mapped yet."}
      </p>
    </div>
  );
}

export default function AppMapPanel({ projectId, hasBaseUrl }) {
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const running = map?.status === "running";

  useEffect(() => {
    getAppMap(projectId)
      .then(setMap)
      .catch((err) => setError(err.message));
  }, [projectId]);

  // Poll while a crawl runs; pages appear when it finishes.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      getAppMap(projectId)
        .then(setMap)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [projectId, running]);

  async function handleCrawl() {
    setStarting(true);
    setError(null);
    try {
      setMap(await crawlApp(projectId));
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  if (!map)
    return error ? <ErrorMessage message={error} /> : <LoadingMessage />;

  const statusLine = running
    ? "Mapping the app. This takes about a minute for 30 pages."
    : map.status === "failed"
      ? null
      : map.status === "done"
        ? `${plural(map.pages.length, "page")} mapped ${formatDate(map.finished_at)}${
            map.skipped_count
              ? `, ${plural(map.skipped_count, "link")} not visited`
              : ""
          }`
        : "Not mapped yet.";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose space-y-1">
          <h3 className="text-sm font-semibold">App map</h3>
          <p className="text-sm text-muted-foreground">
            The pages, buttons and fields the crawler found by following the
            app&apos;s links. Agents use the real labels from here when writing
            steps. It never clicks buttons or submits forms.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            disabled={running}
          >
            <Settings2 />
            Crawl settings
          </Button>
          <Button
            size="sm"
            onClick={handleCrawl}
            disabled={!hasBaseUrl || running || starting}
          >
            {running || starting ? (
              <Spinner className="size-3.5" />
            ) : (
              <RotateCw />
            )}
            {map.status ? "Refresh" : "Map the app"}
          </Button>
        </div>
      </div>

      {editing && (
        <SettingsForm
          projectId={projectId}
          settings={map.settings}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setMap(updated);
            setEditing(false);
          }}
        />
      )}

      {!hasBaseUrl && (
        <p className="text-sm text-review">
          Add the app URL above to map the app.
        </p>
      )}
      {statusLine && (
        <p className="tabular text-sm text-muted-foreground">{statusLine}</p>
      )}
      {map.status === "failed" && (
        <ErrorMessage message={`The last crawl failed: ${map.error}`} />
      )}
      <ErrorMessage message={error} />

      {map.pages.length > 0 && <Summary map={map} />}

      {map.pages.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPages((v) => !v)}
          aria-expanded={showPages}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform",
              showPages && "rotate-90",
            )}
          />
          {showPages ? "Hide" : "Show"} the {plural(map.pages.length, "page")}
        </button>
      )}

      {showPages && map.pages.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {map.pages.map((page) => {
            const open = openId === page.id;
            const path = page.url.replace(/^https?:\/\/[^/]+/, "") || "/";
            return (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : page.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-90",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {page.title}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {path}
                    </span>
                  </span>
                  <span className="tabular hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {[
                      page.buttons && plural(page.buttons, "control"),
                      page.fields && plural(page.fields, "field"),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Content only"}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-border bg-muted/30 px-4 py-3 pl-11">
                    <PageDetail projectId={projectId} pageId={page.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {map.skipped.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            aria-expanded={showSkipped}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                showSkipped && "rotate-90",
              )}
            />
            Why some links weren&apos;t visited
          </button>
          {showSkipped && (
            <ul className="space-y-0.5 pl-[18px] text-xs">
              {map.skipped.map((link) => (
                <li key={link.url} className="flex gap-2">
                  <span className="min-w-0 truncate font-mono text-muted-foreground">
                    {link.url}
                  </span>
                  <span className="shrink-0">{link.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
