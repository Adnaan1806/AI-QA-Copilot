import { formatDate } from "../../lib/qa";
import { EmptyState } from "../StatusMessages";
import VerdictBanner from "./VerdictBanner";

function List({ title, items, dot }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span className={`mt-[7px] size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing noted.</p>
      )}
    </section>
  );
}

export default function ReportPanel({ report, onOpenAutomation }) {
  if (!report) {
    return (
      <EmptyState>
        No report yet. It's written when automation runs.{" "}
        <button type="button" onClick={onOpenAutomation} className="text-primary hover:underline">
          Go to automation
        </button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <VerdictBanner recommendation={report.release_recommendation}>
        <p className="tabular text-xs text-muted-foreground">Written {formatDate(report.created_at)}</p>
      </VerdictBanner>
      <div className="space-y-6 rounded-lg border border-border bg-card px-5 py-5 md:px-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Summary</h3>
          <p className="max-w-[72ch] text-sm">{report.summary}</p>
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <List title="Coverage" items={report.coverage_analysis} dot="bg-pass" />
          <List title="Quality risks" items={report.quality_risks} dot="bg-fail" />
        </div>
      </div>
    </div>
  );
}
