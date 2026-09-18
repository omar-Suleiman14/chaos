"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const followsSystem = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initialTheme: Theme = stored === "light" || stored === "dark"
      ? stored
      : media.matches ? "dark" : "light";

    followsSystem.current = stored !== "light" && stored !== "dark";
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
    followsSystem.current = false;
    setTheme((prev) => {
      const nextTheme: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
      return nextTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
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
