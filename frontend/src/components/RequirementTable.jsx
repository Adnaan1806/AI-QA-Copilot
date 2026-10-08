import { Link, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { activeTotal, formatDate, requirementStage, signedOff } from "../lib/qa";
import CaseStrip from "./CaseStrip";
import { VerdictChip } from "./QaChips";

const STAGE_STYLE = {
  review: "text-foreground",
  ready: "text-primary",
  reported: "text-muted-foreground",
  empty: "text-muted-foreground",
};

// Requirements with their case strip, stage, and verdict. `showLocation` adds the
// project / suite under each name for cross-project lists.
export default function RequirementTable({ requirements, showLocation = false, className }) {
  const navigate = useNavigate();

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60 text-left text-xs text-muted-foreground">
            <th className="w-[40%] px-4 py-2 font-medium">Requirement</th>
            <th className="px-4 py-2 font-medium">Cases</th>
            <th className="px-4 py-2 font-medium">Stage</th>
            <th className="px-4 py-2 font-medium">Verdict</th>
            <th className="px-4 py-2 text-right font-medium">Added</th>
          </tr>
        </thead>
        <tbody>
          {requirements.map((r) => {
            const counts = r.case_counts;
            const stage = requirementStage(counts, !!r.release_recommendation);
            const to = `/requirements/${r.id}`;
            return (
              <tr
                key={r.id}
                onClick={(e) => {
                  if (!e.target.closest("a")) navigate(to);
                }}
                className="cursor-pointer border-t border-border first:border-t-0 hover:bg-muted/50"
              >
                <td className="px-4 py-2.5">
                  <Link to={to} className="font-medium hover:text-primary hover:underline">
                    {r.name}
                  </Link>
                  {showLocation && (
                    <div className="text-xs text-muted-foreground">
                      {r.project_name} / {r.suite_name}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <CaseStrip counts={counts} size="sm" />
                    <span className="tabular text-xs text-muted-foreground">
                      {signedOff(counts)}/{activeTotal(counts)}
                    </span>
                  </span>
                </td>
                <td className={cn("px-4 py-2.5 whitespace-nowrap", STAGE_STYLE[stage.key])}>
                  {stage.label}
                  {stage.key === "review" && (
                    <span className="tabular text-muted-foreground"> ({counts.draft} left)</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <VerdictChip recommendation={r.release_recommendation} verdict={r.release_verdict} />
                </td>
                <td className="tabular px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">
                  {formatDate(r.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
