import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DURATION, EASE, STAGGER } from "./constants";

// Attach the returned ref to a list's direct container. Re-runs the
// stagger-in whenever any value in `deps` changes (e.g. [loading, count]).
export function useListStagger(deps) {
  const ref = useRef(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const items = el.children;
      if (!items || items.length === 0) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.toggle,
          ease: EASE.out,
          stagger: Math.min(STAGGER.item, STAGGER.cap / items.length),
          overwrite: true,
        },
      );
    },
    { dependencies: deps, scope: ref },
  );

  return ref;
}
