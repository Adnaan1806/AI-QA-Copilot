import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { DURATION, EASE } from "../motion/constants";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import Spinner from "../motion/Spinner";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const [mounted, setMounted] = useState(open);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);

  // `open` drives Radix's real focus-trap/ESC/scroll-lock behavior immediately.
  // `mounted` (plus forceMount below) keeps the DOM around just long enough
  // for the exit tween to finish before React actually removes it.
  useGSAP(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (!overlayRef.current || !contentRef.current) {
      setMounted(false);
      return;
    }
    gsap.to(overlayRef.current, { opacity: 0, duration: DURATION.exit, ease: EASE.in });
    gsap.to(contentRef.current, {
      opacity: 0,
      scale: 0.95,
      y: 6,
      duration: DURATION.exit,
      ease: EASE.in,
      onComplete: () => setMounted(false),
    });
  }, [open]);

  useGSAP(
    () => {
      if (!open || !overlayRef.current || !contentRef.current) return;
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: DURATION.toggle, ease: EASE.out },
      );
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, scale: 0.95, y: 6 },
        { opacity: 1, scale: 1, y: 0, duration: DURATION.toggle, ease: EASE.out },
      );
    },
    { dependencies: [mounted] },
  );

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      {mounted && (
        <AlertDialogPrimitive.Portal forceMount>
          <AlertDialogPrimitive.Overlay
            ref={overlayRef}
            forceMount
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            style={{ opacity: 0 }}
          />
          <AlertDialogPrimitive.Content
            ref={contentRef}
            forceMount
            className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl outline-none"
            style={{ opacity: 0 }}
          >
            <AlertDialogPrimitive.Title className="text-lg font-semibold">
              {title}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {message}
            </AlertDialogPrimitive.Description>

            <div className="mt-6 flex justify-end gap-2">
              <AlertDialogPrimitive.Cancel asChild>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {cancelLabel}
                </Button>
              </AlertDialogPrimitive.Cancel>
              <Button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className={cn(
                  "gap-2 text-white hover:text-white",
                  danger
                    ? "bg-destructive hover:bg-destructive/90"
                    : "bg-linear-to-r from-primary to-emerald-500 hover:opacity-90",
                )}
              >
                {confirming && <Spinner className="h-3.5 w-3.5" />}
                {confirming ? "Working..." : confirmLabel}
              </Button>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      )}
    </AlertDialogPrimitive.Root>
  );
}
