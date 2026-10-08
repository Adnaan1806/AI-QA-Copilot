import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      // Storage can be blocked; the theme still applies for this session.
    }
  }, [isDark]);

  // The icon shows the mode you'll switch to.
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setIsDark((prev) => !prev)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
