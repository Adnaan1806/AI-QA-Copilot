import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

// Scale-pulses an element whenever `value` changes (skips the initial
// mount). Meant for status/type badges whose label or color flips after a
// save/regenerate, so the change reads as an event instead of a silent swap.
export function usePulseOnChange(value) {
  const ref = useRef(null);
  const prevValue = useRef(value);

  useGSAP(
    () => {
      if (prevValue.current === value) return;
      prevValue.current = value;
      if (!ref.current) return;
      gsap.fromTo(
        ref.current,
        { scale: 1 },
        { scale: 1.18, duration: 0.15, ease: "power2.out", yoyo: true, repeat: 1 },
      );
    },
    { dependencies: [value] },
  );

  return ref;
}
