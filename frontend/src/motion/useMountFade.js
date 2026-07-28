import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DURATION, EASE } from "./constants";

// Lightweight fade+rise — for swapping between two differently-shaped
// views (e.g. read vs. edit) where a full enter/exit choreography would be
// overkill. Pass `deps` (e.g. [editing]) to re-trigger on each swap, not
// just the component's first mount.
export function useMountFade(deps = []) {
  const ref = useRef(null);

  useGSAP(
    () => {
      if (!ref.current) return;
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: DURATION.toggle, ease: EASE.out, overwrite: true },
      );
    },
    { dependencies: deps },
  );

  return ref;
}
