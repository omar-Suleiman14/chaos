import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { themeInitScript } from "@/lib/theme";

describe("theme source", () => {
  it("keeps dashboard layout free of hardcoded hex colors", () => {
    const source = readFileSync(resolve(process.cwd(), "app/dashboard/layout.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("applies the OS theme before hydration when no preference is stored", () => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: true }),
    });

    window.eval(themeInitScript);

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
