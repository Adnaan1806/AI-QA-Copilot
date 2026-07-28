import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Sun, Moon } from "lucide-react";
import { Button } from "./ui/button";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  // Icon shown communicates the mode you'll switch TO, not the current mode.
  const sunIconRef = useRef(null); // shown in dark mode (switch to light)
  const moonIconRef = useRef(null); // shown in light mode (switch to dark)
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
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setIsDark((prev) => !prev)}
      aria-label="Toggle theme"
      className="relative rounded-full"
    >
      <Sun ref={sunIconRef} className="absolute size-4.5" style={{ opacity: 0 }} />
      <Moon ref={moonIconRef} className="absolute size-4.5" style={{ opacity: 0 }} />
    </Button>
  );
}
