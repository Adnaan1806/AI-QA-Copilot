import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import Spinner from "../../motion/Spinner";
import { PRIORITY_LABEL, TYPE_LABEL } from "../../lib/qa";

// Edit or create one test case. `label` is the case number (TC-4) for an existing
// case; `hasScript` says whether it already has an automation result.
export default function CaseEditor({ testCase, label, hasScript, onSave, onCancel }) {
  const isNew = !testCase.id;
  const [title, setTitle] = useState(testCase.title);
  const [type, setType] = useState(testCase.type);
  const [priority, setPriority] = useState(testCase.priority);
  const [steps, setSteps] = useState(testCase.steps.join("\n"));
  const [expected, setExpected] = useState(testCase.expected_result);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // The backend sends any edited case back to draft so its automation is
  // regenerated from the new content. Say so before the approval disappears.
  const losesApproval = !isNew && testCase.status === "approved";
  const leavesRejected = !isNew && testCase.status === "rejected";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Add a title for this case");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        type,
        priority,
        steps: steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        expected_result: expected.trim(),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const idBase = testCase.id ?? "new";

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="space-y-4"
      aria-label={isNew ? "New test case" : `Edit ${label}`}
    >
      <h3 className="text-base font-semibold">{isNew ? "New test case" : `Edit ${label}`}</h3>

      {(losesApproval || leavesRejected) && (
        <p className="flex gap-2 rounded-md bg-review-wash px-3 py-2 text-sm text-review">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {losesApproval
              ? `Saving moves ${label} back to draft, so it needs approval again before automation.`
              : `Saving moves ${label} back to draft for review.`}
            {losesApproval && hasScript && " Its current automation result will be replaced on the next run."}
          </span>
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-title`}>Title</Label>
        <Input id={`${idBase}-title`} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-type`}>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id={`${idBase}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABEL).map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-priority`}>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id={`${idBase}-priority`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABEL).map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-steps`}>Steps</Label>
        <Textarea
          id={`${idBase}-steps`}
          className="min-h-28 resize-y"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">One step per line.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-expected`}>Expected result</Label>
        <Textarea
          id={`${idBase}-expected`}
          className="min-h-16 resize-y"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <div className="flex gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={saving}>
          {saving && <Spinner className="size-3.5" />}
          {isNew ? "Add case" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
