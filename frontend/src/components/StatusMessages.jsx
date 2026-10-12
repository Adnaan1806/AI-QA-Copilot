import Spinner from "../motion/Spinner";
import { cn } from "../lib/utils";

export function LoadingMessage({ className }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Spinner className="size-4" /> Loading
    </p>
  );
}

export function ErrorMessage({ message, className }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-fail/30 bg-fail-wash px-3 py-2 text-sm text-fail",
        className,
      )}
    >
      {message}
    </p>
  );
}

// A page's first load: a spinner in the middle of the content area.
export function PageLoading({ className }) {
  return (
    <div role="status" className={cn("grid min-h-[60vh] place-items-center", className)}>
      <Spinner className="size-9 text-primary" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function PageError({ message }) {
  return (
    <div className="px-6 py-8 md:px-8">
      <ErrorMessage message={message} />
    </div>
  );
}

// An empty list is a prompt to act: say what will appear and how to add the first one.
export function EmptyState({ children, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-5 py-6 text-sm text-muted-foreground",
        className,
      )}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

// Standard page frame: left-aligned, generous but not centred-narrow.
export function Page({ children, className }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {typeof title === "string" ? (
          <h1 className="text-[22px] leading-tight font-semibold">{title}</h1>
        ) : (
          title
        )}
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
