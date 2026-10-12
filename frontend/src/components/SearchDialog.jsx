import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "radix-ui";
import { FileText, Layers, Search } from "lucide-react";
import { cn } from "../lib/utils";
import ProjectTile from "./ProjectTile";

// Jump to a project, suite or requirement by name. Opened from the sidebar or Ctrl/Cmd+K.
export default function SearchDialog({ open, onOpenChange, projects, requirements }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (text) => !q || text.toLowerCase().includes(q);
    const items = [
      ...projects.filter((p) => match(p.name)).map((p) => ({
        key: `p${p.id}`, kind: "Project", label: p.name, to: `/projects/${p.id}`, project: p,
      })),
      ...projects.flatMap((p) =>
        (p.suites ?? []).filter((s) => match(s.name)).map((s) => ({
          key: `s${s.id}`, kind: "Suite", label: s.name, detail: p.name, to: `/suites/${s.id}`,
        })),
      ),
      ...requirements.filter((r) => match(r.name)).map((r) => ({
        key: `r${r.id}`, kind: "Requirement", label: r.name, detail: `${r.project_name} / ${r.suite_name}`, to: `/requirements/${r.id}`,
      })),
    ];
    return items.slice(0, q ? 20 : 8);
  }, [query, projects, requirements]);

  function go(item) {
    onOpenChange(false);
    setQuery("");
    navigate(item.to);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") setActive((i) => Math.min(results.length - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && results[active]) go(results[active]);
    else return;
    e.preventDefault();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed top-[14vh] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">Find a project, suite or requirement</Dialog.Description>
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Search projects, suites and requirements"
              aria-label="Search"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-b-2 border-border px-1.5 font-mono text-[11px] text-muted-foreground">Esc</kbd>
          </div>
          <ul role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>}
            {results.map((item, i) => (
              <li
                key={item.key}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  i === active && "bg-pencil-wash",
                )}
              >
                {item.project ? (
                  <ProjectTile project={item.project} />
                ) : item.kind === "Suite" ? (
                  <Layers className="size-4 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{item.kind}</span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
