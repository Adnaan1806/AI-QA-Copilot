import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ClipboardCheck, Gauge, Pencil, Zap } from "lucide-react";
import { getRequirement, updateRequirementName } from "../services/api";
import Spinner from "../motion/Spinner";
import { useMountFade } from "../motion/useMountFade";
import { useListStagger } from "../motion/useListStagger";
import { useSetBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";

function EditableName({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fadeRef = useMountFade([editing]);

  useEffect(() => {
    setValue(name);
  }, [name]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div ref={fadeRef} className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{name}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditing(true)}
          aria-label="Edit name"
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <div ref={fadeRef}>
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-xl font-bold"
        />
        <Button onClick={handleSave} disabled={saving} className="shrink-0 gap-1.5">
          {saving && <Spinner className="h-3.5 w-3.5" />}
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => {
            setValue(name);
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

const MODULE_ICONS = {
  analysis: ClipboardCheck,
  automation: Zap,
  performance: Gauge,
};

function ModuleLinkCard({ to, icon, title, subtitle, disabled }) {
  const Icon = MODULE_ICONS[icon];
  const card = (
    <Card
      className={`aspect-square h-full flex-col items-center justify-center gap-3 p-6 text-center transition-all duration-200 ${
        disabled
          ? "cursor-not-allowed border border-dashed border-border bg-muted/30 ring-0"
          : "hover:-translate-y-0.5 hover:bg-primary/5 hover:shadow-md hover:ring-primary/40"
      }`}
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${
          disabled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="size-6" />
      </span>
      <div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </Card>
  );

  if (disabled) return card;
  return (
    <Link to={to} className="block h-full">
      {card}
    </Link>
  );
}

export default function RequirementDetail() {
  const { id } = useParams();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useSetBreadcrumbs(
    requirement ? [{ label: "Projects", to: "/" }, { label: requirement.name }] : [],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    getRequirement(id)
      .then(setRequirement)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <p className="mx-auto flex max-w-5xl items-center gap-2 p-8 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }

  if (error && !requirement) {
    return (
      <p className="mx-auto max-w-5xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-sm text-destructive">
        {error}
      </p>
    );
  }

  const totalCount = requirement.test_cases.length;
  const approvedCount = requirement.test_cases.filter((tc) => tc.status === "approved").length;

  async function handleRenameSave(newName) {
    const updated = await updateRequirementName(id, newName);
    setRequirement(updated);
  }

  return (
    <RequirementDetailContent
      requirement={requirement}
      id={id}
      totalCount={totalCount}
      approvedCount={approvedCount}
      onRenameSave={handleRenameSave}
    />
  );
}

function RequirementDetailContent({ requirement, id, totalCount, approvedCount, onRenameSave }) {
  const gridRef = useListStagger([requirement.id]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <EditableName name={requirement.name} onSave={onRenameSave} />
      <Card className="mt-3 p-4">
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{requirement.content}</p>
      </Card>

      <div ref={gridRef} className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ModuleLinkCard
          to={`/requirements/${id}/test-cases`}
          icon="analysis"
          title="Requirement Analysis & Test Cases"
          subtitle={
            totalCount === 0
              ? "No test cases yet"
              : `${totalCount} test case${totalCount === 1 ? "" : "s"} · ${approvedCount} accepted`
          }
        />
        <ModuleLinkCard
          to={`/requirements/${id}/automation`}
          icon="automation"
          title="Test Automation"
          subtitle={
            requirement.report
              ? "Playwright scripts and release report ready"
              : approvedCount > 0
                ? "Ready to generate"
                : "Accept test cases first"
          }
        />
        <ModuleLinkCard icon="performance" title="Performance" subtitle="Coming soon" disabled />
      </div>
    </div>
  );
}
