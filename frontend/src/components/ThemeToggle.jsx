import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={() => setIsDark((prev) => !prev)}
      aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
          <path
            d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.41 1.41M7.05 16.95l-1.41 1.41m0-12.72l1.41 1.41M16.95 16.95l1.41 1.41M12 8a4 4 0 100 8 4 4 0 000-8z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5">
          <path
            d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
