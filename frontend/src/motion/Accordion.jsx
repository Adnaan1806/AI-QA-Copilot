import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronRight } from "lucide-react";
import { DURATION, EASE } from "./constants";

export function ChevronIcon({ open, className = "h-4 w-4 shrink-0" }) {
  return (
    <ChevronRight
      className={`${className} transition-transform duration-300 ${open ? "rotate-90" : ""}`}
    />
  );
}

// Height/opacity-animated collapsible built on Radix Accordion (real ARIA +
// keyboard handling) for accessibility, with the existing GSAP height
// choreography kept via forceMount instead of Radix's CSS-var default.
// Each usage is an independent single-item accordion, not a connected group.
export default function Accordion({
  summary,
  children,
  defaultOpen = false,
  className = "",
  buttonClassName = "flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-foreground",
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
    <AccordionPrimitive.Root
      type="single"
      collapsible
      value={open ? "item" : ""}
      onValueChange={(v) => setOpen(v === "item")}
      className={className}
    >
      <AccordionPrimitive.Item value="item">
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger className={buttonClassName}>
            {typeof summary === "function" ? summary(open) : summary}
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content forceMount>
          <div ref={wrapRef} style={{ height: open ? "auto" : 0, overflow: "hidden" }}>
            <div ref={contentRef} className={bodyClassName} style={{ opacity: open ? 1 : 0 }}>
              {children}
            </div>
          </div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
}
