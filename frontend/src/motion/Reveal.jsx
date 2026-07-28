import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DURATION, EASE } from "./constants";

// Height/opacity-animated replacement for `{show && <thing/>}`. Unlike a
// plain conditional, this keeps `children` mounted long enough to animate
// the exit before actually unmounting.
export default function Reveal({ show, children, className = "" }) {
  const [mounted, setMounted] = useState(show);
  const wrapRef = useRef(null);
  const contentRef = useRef(null);

  useGSAP(() => {
    if (show) setMounted(true);
  }, [show]);

  useGSAP(
    () => {
      const wrap = wrapRef.current;
      const content = contentRef.current;
      if (!mounted || !wrap || !content) return;

      if (show) {
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
          { opacity: 0, y: -4 },
          { opacity: 1, y: 0, duration: DURATION.toggle, ease: EASE.out, delay: 0.05 },
        );
      } else {
        gsap.to(wrap, { height: 0, duration: DURATION.toggle, ease: EASE.inOut });
        gsap.to(content, {
          opacity: 0,
          duration: DURATION.exit,
          ease: EASE.in,
          onComplete: () => setMounted(false),
        });
      }
    },
    { dependencies: [show, mounted], scope: wrapRef },
  );

  if (!mounted) return null;

  return (
    <div ref={wrapRef} className={className} style={{ overflow: "hidden" }}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
