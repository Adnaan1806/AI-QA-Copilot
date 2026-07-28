import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DURATION, EASE } from "../motion/constants";
import { useButtonPress } from "../motion/useButtonPress";
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
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  const cancelPress = useButtonPress();
  const confirmPress = useButtonPress();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  useGSAP(() => {
    if (open) {
      setMounted(true);
    } else if (mounted) {
      gsap.to(backdropRef.current, { opacity: 0, duration: DURATION.exit, ease: EASE.in });
      gsap.to(panelRef.current, {
        opacity: 0,
        scale: 0.95,
        y: 6,
        duration: DURATION.exit,
        ease: EASE.in,
        onComplete: () => setMounted(false),
      });
    }
  }, [open]);

  useGSAP(
    () => {
      if (!open || !backdropRef.current || !panelRef.current) return;
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: DURATION.toggle, ease: EASE.out });
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, scale: 0.95, y: 6 },
        { opacity: 1, scale: 1, y: 0, duration: DURATION.toggle, ease: EASE.out },
      );
    },
    { dependencies: [mounted] },
  );

  if (!mounted) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm dark:bg-black/70"
      style={{ opacity: 0 }}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        style={{ opacity: 0 }}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{message}</p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelPress.ref}
            {...cancelPress.handlers}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmPress.ref}
            {...confirmPress.handlers}
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90"
            }`}
          >
            {confirming && <Spinner className="h-3.5 w-3.5" />}
            {confirming ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
