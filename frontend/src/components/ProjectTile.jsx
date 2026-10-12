import { cn } from "../lib/utils";
import { initials, projectTone } from "../lib/project";

const SIZE = {
  sm: "size-5 rounded-[5px] text-[9px]",
  md: "size-7 rounded-md text-[11px]",
  lg: "size-11 rounded-xl text-[15px]",
};

// A project's initials on its own tone, so it's recognisable across pages.
export default function ProjectTile({ project, size = "sm", className }) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center font-semibold", SIZE[size], projectTone(project.id), className)}
    >
      {initials(project.name)}
    </span>
  );
}
