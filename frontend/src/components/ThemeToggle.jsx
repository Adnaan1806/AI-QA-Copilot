import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useButtonPress } from "../motion/useButtonPress";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  // Icon shown communicates the mode you'll switch TO, not the current mode.
  const sunIconRef = useRef(null); // shown in dark mode (switch to light)
  const moonIconRef = useRef(null); // shown in light mode (switch to dark)
  const press = useButtonPress();
  const isFirstRender = useRef(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useGSAP(
    () => {
      const showing = isDark ? sunIconRef.current : moonIconRef.current;
      const hiding = isDark ? moonIconRef.current : sunIconRef.current;
      if (!showing || !hiding) return;

      if (isFirstRender.current) {
        gsap.set(showing, { opacity: 1, scale: 1, rotate: 0 });
        gsap.set(hiding, { opacity: 0, scale: 0.5, rotate: isDark ? 90 : -90 });
        isFirstRender.current = false;
        return;
      }

      gsap.to(hiding, { opacity: 0, scale: 0.5, rotate: isDark ? -90 : 90, duration: 0.2, ease: "power1.in" });
      gsap.fromTo(
        showing,
        { opacity: 0, scale: 0.5, rotate: isDark ? 90 : -90 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.3, ease: "back.out(2)", delay: 0.05 },
      );
    },
    { dependencies: [isDark] },
  );

  return (
    <button
      ref={press.ref}
      {...press.handlers}
      type="button"
      onClick={() => setIsDark((prev) => !prev)}
      aria-label="Toggle theme"
      className="relative grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
    >
      <svg
        ref={sunIconRef}
        viewBox="0 0 24 24"
        fill="none"
        className="absolute h-4.5 w-4.5"
        style={{ opacity: 0 }}
      >
        <path
          d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.41 1.41M7.05 16.95l-1.41 1.41m0-12.72l1.41 1.41M16.95 16.95l1.41 1.41M12 8a4 4 0 100 8 4 4 0 000-8z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <svg
        ref={moonIconRef}
        viewBox="0 0 24 24"
        fill="none"
        className="absolute h-4.5 w-4.5"
        style={{ opacity: 0 }}
      >
        <path
          d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
