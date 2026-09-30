"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { light: "Use light appearance", dark: "Use dark appearance" },
  ar: { light: "استخدم المظهر الفاتح", dark: "استخدم المظهر الداكن" },
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const t = useCopy(copy);
  const label = theme === "dark" ? t.light : t.dark;

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      aria-label={label}
      title={label}
      className={`theme-toggle relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted ${className}`}
    >
      <Sun size={16} className="theme-toggle__sun" aria-hidden="true" />
      <Moon size={16} className="theme-toggle__moon" aria-hidden="true" />
    </button>
  );
}
