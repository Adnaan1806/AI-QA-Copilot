import { useRef } from "react";
import { useLocation } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DURATION, EASE } from "./constants";

// React Router swaps route content synchronously (no intermediate unmounted
// state to animate an exit against), so this animates entrance only: a
// short fade + rise that re-triggers whenever the pathname changes.
export default function PageTransition({ children }) {
  const location = useLocation();
  const ref = useRef(null);

  useGSAP(
    () => {
      if (!ref.current) return;
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: DURATION.page, ease: EASE.out },
      );
    },
    { dependencies: [location.pathname], scope: ref },
  );

  return <div ref={ref}>{children}</div>;
}
