"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle appearance"
      title="Toggle appearance"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted ${className}`}
    >
      <Sun size={16} className="dark:hidden" aria-hidden="true" />
      <Moon size={16} className="hidden dark:block" aria-hidden="true" />
    </button>
  );
}
