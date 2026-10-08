import Spinner from "../motion/Spinner";
import { cn } from "../lib/utils";

export function LoadingMessage({ className }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Spinner className="h-4 w-4" /> Loading...
    </p>
  );
}

export function ErrorMessage({ message, className }) {
  if (!message) return null;
  return (
    <p
      className={cn(
        "rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive",
        className,
      )}
    >
      {message}
    </p>
  );
}

export function PageLoading() {
  return <LoadingMessage className="mx-auto max-w-5xl p-8" />;
}

export function PageError({ message }) {
  return <ErrorMessage message={message} className="mx-auto max-w-5xl rounded-2xl p-8" />;
}
