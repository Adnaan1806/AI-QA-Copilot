import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DURATION, EASE } from "./constants";

export function ChevronIcon({ open, className = "h-4 w-4 shrink-0" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${className} transition-transform duration-300 ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Height/opacity-animated replacement for native <details>/<summary>.
// `summary` can be a node, or a function of `open` for full control over
// layout (e.g. placing the chevron and other badges alongside a title).
export default function Accordion({
  summary,
  children,
  defaultOpen = false,
  className = "",
  buttonClassName = "flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800 dark:text-gray-100",
  bodyClassName = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef(null);
  const contentRef = useRef(null);

  useGSAP(
    () => {
      const wrap = wrapRef.current;
      const content = contentRef.current;
      if (!wrap || !content) return;

      if (open) {
        const height = content.offsetHeight;
        gsap.fromTo(
          wrap,
          { height: 0 },
          {
            height,
            duration: DURATION.toggle,
            ease: EASE.inOut,
            onComplete: () => {
              wrap.style.height = "auto";
            },
          },
        );
        gsap.fromTo(
          content,
          { opacity: 0 },
          { opacity: 1, duration: DURATION.toggle * 0.8, ease: EASE.out, delay: 0.05 },
        );
      } else {
        gsap.to(wrap, { height: 0, duration: DURATION.toggle, ease: EASE.inOut });
        gsap.to(content, { opacity: 0, duration: DURATION.exit, ease: EASE.in });
      }
    },
    { dependencies: [open], scope: wrapRef },
  );

  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={buttonClassName}>
        {typeof summary === "function" ? summary(open) : summary}
      </button>
      <div ref={wrapRef} style={{ height: open ? "auto" : 0, overflow: "hidden" }}>
        <div ref={contentRef} className={bodyClassName} style={{ opacity: open ? 1 : 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
