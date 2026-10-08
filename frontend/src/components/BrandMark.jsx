import { Check } from "lucide-react";
import { cn } from "../lib/utils";

// A checkbox ticked in blue pencil: the sign-off this app exists for.
export default function BrandMark({ className }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md border-2 border-primary text-primary",
        className,
      )}
      aria-hidden
    >
      <Check className="size-4" strokeWidth={3} />
    </span>
  );
}
