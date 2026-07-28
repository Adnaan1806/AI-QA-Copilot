import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ConfirmDialog from "./ConfirmDialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { DURATION, EASE, STAGGER } from "../motion/constants";
import { usePulseOnChange } from "../motion/usePulseOnChange";
import Spinner from "../motion/Spinner";

const TYPE_STYLES = {
  functional: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  negative: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  edge_case: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  security: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

const PRIORITY_DOT = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground/50",
};

const STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
};

const TYPE_OPTIONS = ["functional", "negative", "edge_case", "security"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];

function TypeBadge({ label }) {
  const ref = usePulseOnChange(label);
  return (
    <Badge
      ref={ref}
      className={`capitalize transition-colors duration-300 ${
        TYPE_STYLES[label] || "bg-muted text-muted-foreground"
      }`}
    >
      {label.replace("_", " ")}
    </Badge>
  );
}

function PriorityBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-muted-foreground">
      <span
        className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${PRIORITY_DOT[label] || PRIORITY_DOT.low}`}
      />
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const ref = usePulseOnChange(status);
  return (
    <Badge
      ref={ref}
      className={`capitalize transition-colors duration-300 ${
        STATUS_STYLES[status] || STATUS_STYLES.draft
      }`}
    >
      {status}
    </Badge>
  );
}

function EditableRow({ tc, onSave, onCancel }) {
  const [title, setTitle] = useState(tc.title);
  const [type, setType] = useState(tc.type);
  const [steps, setSteps] = useState(tc.steps.join("\n"));
  const [expectedResult, setExpectedResult] = useState(tc.expected_result);
  const [priority, setPriority] = useState(tc.priority);
  const [saving, setSaving] = useState(false);
  const rowRef = useRef(null);

  useGSAP(() => {
    if (!rowRef.current) return;
    gsap.fromTo(
      rowRef.current,
      { opacity: 0 },
      { opacity: 1, duration: DURATION.toggle, ease: EASE.out, overwrite: true },
    );
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        title,
        type,
        steps: steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        expected_result: expectedResult,
        priority,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow ref={rowRef} className="align-top bg-primary/5 hover:bg-primary/5">
      <TableCell className="whitespace-normal py-3.5">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </TableCell>
      <TableCell className="py-3.5">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="whitespace-normal py-3.5">
        <Textarea
          className="h-28 resize-none"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
      </TableCell>
      <TableCell className="whitespace-normal py-3.5">
        <Textarea
          className="h-28 resize-none"
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-3.5">
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-3.5">
        <StatusBadge status={tc.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap py-3.5">
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Spinner className="h-3 w-3" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReadRow({ tc, onEdit, onRequestDelete, deleting, rowRef }) {
  return (
    <TableRow ref={rowRef} className="align-top">
      <TableCell className="whitespace-normal font-medium text-foreground">{tc.title}</TableCell>
      <TableCell>
        <TypeBadge label={tc.type} />
      </TableCell>
      <TableCell className="whitespace-normal text-muted-foreground">
        <ul className="space-y-1">
          {tc.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      </TableCell>
      <TableCell className="whitespace-normal text-muted-foreground">
        {tc.expected_result}
      </TableCell>
      <TableCell>
        <PriorityBadge label={tc.priority} />
      </TableCell>
      <TableCell>
        <StatusBadge status={tc.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onRequestDelete}
            disabled={deleting}
            className="gap-1.5"
          >
            {deleting && <Spinner className="h-3 w-3" />}
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function TestCaseTable({ testCases, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const tbodyRef = useRef(null);
  const rowRefs = useRef(new Map());
  const prevCount = useRef(null);

  useGSAP(
    () => {
      const rows = Array.from(rowRefs.current.values());
      if (rows.length === 0) return;
      const isFirstRunOrCountChange =
        prevCount.current === null || prevCount.current !== testCases.length;
      prevCount.current = testCases.length;
      if (!isFirstRunOrCountChange) return;
      gsap.fromTo(
        rows,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.toggle,
          ease: EASE.out,
          stagger: Math.min(STAGGER.item, STAGGER.cap / Math.max(rows.length, 1)),
          overwrite: true,
        },
      );
    },
    { dependencies: [testCases.length], scope: tbodyRef },
  );

  function setRowRef(id, el) {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }

  async function confirmDelete() {
    const tc = pendingDelete;
    setPendingDelete(null);
    setDeletingId(tc.id);

    const row = rowRefs.current.get(tc.id);
    if (row) {
      await gsap.to(row, {
        opacity: 0,
        height: 0,
        duration: DURATION.toggle,
        ease: EASE.inOut,
        overwrite: true,
      });
    }

    try {
      await onDelete(tc.id);
    } finally {
      setDeletingId(null);
    }
  }

  if (testCases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <p className="text-sm italic text-muted-foreground">No test cases yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Steps</TableHead>
            <TableHead>Expected Result</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody ref={tbodyRef}>
          {testCases.map((tc) =>
            editingId === tc.id ? (
              <EditableRow
                key={tc.id}
                tc={tc}
                onSave={async (patch) => {
                  await onUpdate(tc.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <ReadRow
                key={tc.id}
                tc={tc}
                rowRef={(el) => setRowRef(tc.id, el)}
                onEdit={() => setEditingId(tc.id)}
                onRequestDelete={() => setPendingDelete(tc)}
                deleting={deletingId === tc.id}
              />
            ),
          )}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete test case"
        message={
          pendingDelete && `Delete test case "${pendingDelete.title}"? This can't be undone.`
        }
        confirmLabel="Delete"
        danger
        confirming={deletingId === pendingDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
