"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

export type ThemeMode = Theme | "system";

interface ThemeContextType {
  theme: Theme;
  /** What the person chose: a fixed appearance, or following the device. */
  mode: ThemeMode;
  toggleTheme: (origin?: { x: number; y: number }) => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mode, setModeState] = useState<ThemeMode>("system");
  const followsSystem = useRef(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* Private browsing can deny storage. */ }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initialTheme: Theme = stored === "light" || stored === "dark"
      ? stored
      : media.matches ? "dark" : "light";

    followsSystem.current = stored !== "light" && stored !== "dark";
    setModeState(followsSystem.current ? "system" : initialTheme);
    setTheme(initialTheme);
    applyTheme(initialTheme);

    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (!followsSystem.current) return;
      const nextTheme: Theme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    media.addEventListener?.("change", handleSystemChange);
    return () => media.removeEventListener?.("change", handleSystemChange);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    setMode(nextTheme);
  };

  function setMode(next: ThemeMode) {
    followsSystem.current = next === "system";
    setModeState(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* Keep the in-session preference. */ }
    const nextTheme: Theme = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    if (document.documentElement.classList.contains("dark") === (nextTheme === "dark")) { setTheme(nextTheme); return; }
    const commit = () => {
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };
    // A brief crossfade keeps both pointer and keyboard changes spatially stable.
    const doc = document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduced) {
      commit();
      return;
    }
    doc.startViewTransition(commit).ready.then(() => {
      document.documentElement.animate(
        { opacity: [0, 1] },
        { duration: 180, easing: "ease-out", pseudoElement: "::view-transition-new(root)" },
      );
    }).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
