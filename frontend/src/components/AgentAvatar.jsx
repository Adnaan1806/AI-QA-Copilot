import { Check } from "lucide-react";
import { cn } from "../lib/utils";
import { CREW } from "../lib/crew";

const STATE = {
  live: "bg-pencil-wash text-primary animate-agent-pulse",
  idle: "bg-muted text-muted-foreground",
  done: "bg-pass-wash text-pass",
  warn: "bg-review-wash text-review animate-agent-pulse",
  still: "bg-pencil-wash text-primary",
};

const SIZE = { xs: "size-5 [&_svg]:size-3", sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-[18px]" };

// An agent's icon in a circle. "live" pulses while it works; "done" shows a tick.
export default function AgentAvatar({ agent, state = "still", size = "sm", className }) {
  const Icon = state === "done" ? Check : CREW[agent].icon;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full", SIZE[size], STATE[state], className)}
      title={`${CREW[agent].name}: ${CREW[agent].job}`}
      aria-hidden
    >
      <Icon strokeWidth={2.2} />
    </span>
  );
}
