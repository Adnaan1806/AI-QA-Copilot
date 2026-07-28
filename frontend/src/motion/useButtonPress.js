import { useRef } from "react";
import gsap from "gsap";

// Adds tactile press-depth feedback to any button/link without touching its
// existing hover styling. Spread `handlers` onto the element and attach `ref`.
export function useButtonPress({ scale = 0.96 } = {}) {
  const ref = useRef(null);

  function press() {
    const el = ref.current;
    if (!el || el.disabled) return;
    gsap.to(el, { scale, duration: 0.12, ease: "power2.out", overwrite: true });
  }

  function release() {
    const el = ref.current;
    if (!el) return;
    gsap.to(el, { scale: 1, duration: 0.25, ease: "back.out(2)", overwrite: true });
  }

  return {
    ref,
    handlers: {
      onPointerDown: press,
      onPointerUp: release,
      onPointerLeave: release,
      onPointerCancel: release,
    },
  };
}
