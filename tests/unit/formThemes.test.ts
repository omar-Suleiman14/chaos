import { describe, expect, it } from "vitest";
import {
  contrastIssues, contrastRatio, customTheme, darkVariant, isHex, onAccent, randomPalette, themeClass, themeFollowsAppearance, themeFromPreset, themePresets, themeStyle,
} from "@/components/forms/formThemes";
import { checkDefinition, chaosTheme, defaultTheme, googleFormsTheme, microsoftFormsTheme, paperTheme, emptyDefinition, themePresetIds } from "@/convex/formLogic";
import type { FormDefinition } from "@/convex/formLogic";

function withTheme(theme: FormDefinition["theme"]): FormDefinition {
  const def = emptyDefinition("Theme check");
  def.fields = [{ id: "q1", type: "text", label: "Name", required: false }];
  return { ...def, theme };
}

describe("form themes", () => {
  it("offers every preset id exactly once, and each preset publishes cleanly", () => {
    expect(themePresets.map((p) => p.id).sort()).toEqual([...themePresetIds].sort());
    for (const preset of themePresets) {
      const def = withTheme(themeFromPreset(preset.id));
      expect(checkDefinition(def).errors, preset.id).toEqual([]);
      expect(preset.theme.cover, preset.id).toBeTruthy();
    }
  });

  it("keeps every preset above WCAG contrast minimums, so the studio never warns about a built-in theme", () => {
    for (const preset of themePresets) expect(contrastIssues(themeFromPreset(preset.id)), preset.id).toEqual([]);
  });

  it("starts new forms on the Google Forms style, silent and without a start screen, and keeps Paper as a preset", () => {
    expect(emptyDefinition().theme).toEqual(googleFormsTheme);
    expect(googleFormsTheme).toMatchObject({ preset: "google-forms", cover: "none", sound: "off", chrome: "google", pageColor: "#f0ebf8", accent: "#673ab7", font: "roboto" });
    expect(themePresets.find((p) => p.id === "paper")).toBeTruthy();
    expect(paperTheme.chrome).toBeUndefined();
  });

  it("defines the two look-alike presets with their notes", () => {
    const google = themePresets.find((p) => p.id === "google-forms")!;
    const microsoft = themePresets.find((p) => p.id === "microsoft-forms")!;
    expect(google).toMatchObject({ name: "Google Forms style", inspiration: "Looks like Google Forms. Not affiliated with Google." });
    expect(microsoft).toMatchObject({ name: "Microsoft Forms style", inspiration: "Looks like Microsoft Forms. Not affiliated with Microsoft." });
    expect(themeFromPreset("google-forms")).toMatchObject({ ...googleFormsTheme, sound: "off" });
    expect(themeFromPreset("microsoft-forms")).toMatchObject({ ...microsoftFormsTheme, accent: "#03787c", pageColor: "#f3f2f1", font: "segoe", chrome: "microsoft", sound: "off" });
    expect(google.theme.appearance).toBe("fixed");
    for (const preset of [google, microsoft]) {
      expect(checkDefinition(withTheme(themeFromPreset(preset.id))).errors).toEqual([]);
      expect(contrastIssues(themeFromPreset(preset.id))).toEqual([]);
    }
  });

  it("only the two look-alike presets set page chrome", () => {
    expect(themePresets.filter((p) => p.theme.chrome).map((p) => p.id).sort()).toEqual(["google-forms", "microsoft-forms"]);
  });

  it("never bundles Segoe: the font stack is system fonts only", async () => {
    const { headingFontStacks } = await import("@/components/forms/formThemes");
    expect(headingFontStacks.segoe).toContain("Segoe UI");
    expect(headingFontStacks.segoe).not.toContain("--font-segoe");
  });

  it("computes WCAG contrast and a readable label colour for the accent", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(onAccent("#c6ff3d")).toBe("#111111");
    expect(onAccent("#1a0b3d")).toBe("#ffffff");
  });

  it("flags low-contrast custom palettes", () => {
    const theme = customTheme({ ...chaosTheme, pageColor: "#ffffff", textColor: "#eeeeee" });
    expect(contrastIssues(theme).map((i) => i.label)).toContain("Text on page");
  });

  it("derives a dark palette that keeps dark accents visible", () => {
    const dark = darkVariant({ ...chaosTheme, accent: "#1a1a40" });
    expect(isHex(dark.page) && isHex(dark.surface) && isHex(dark.accent)).toBe(true);
    expect(contrastRatio(dark.text, dark.page)).toBeGreaterThan(10);
    expect(contrastRatio(dark.accent, dark.page)).toBeGreaterThan(3);
  });

  it("shuffles palettes that pass the text contrast check", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) {
      for (const dark of [false, true]) {
        const theme = customTheme({ ...chaosTheme, ...randomPalette(dark, random) });
        expect(contrastIssues(theme).filter((x) => x.label.startsWith("Text"))).toEqual([]);
      }
    }
  });

  it("lets auto themes switch palettes in CSS instead of pinning the accent inline", () => {
    const style = themeStyle(withTheme(chaosTheme)) as Record<string, string>;
    expect(style["--form-accent"]).toBeUndefined();
    expect(style["--form-accent-l"]).toBe(chaosTheme.accent);
    expect(style["--form-page-d"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(themeClass(withTheme(chaosTheme))).toContain("form-appearance-auto");
    expect(themeFollowsAppearance(chaosTheme)).toBe(true);
    expect(themeFollowsAppearance(themeFromPreset("neon"))).toBe(false);
  });

  it("counts a changed chrome as an edit", async () => {
    const { isThemeEdited } = await import("@/components/forms/formThemes");
    expect(isThemeEdited(themeFromPreset("google-forms"))).toBe(false);
    expect(isThemeEdited({ ...themeFromPreset("google-forms"), chrome: undefined })).toBe(true);
  });

  it("keeps themes saved before presets on the legacy path", () => {
    const style = themeStyle(withTheme(defaultTheme)) as Record<string, string>;
    expect(style["--form-accent"]).toBe(defaultTheme.accent);
    expect(themeClass(withTheme(defaultTheme))).toContain("form-legacy");
    expect(themeFollowsAppearance(defaultTheme)).toBe(true);
  });
});

describe("theme reset", () => {
  it("keeps the preset name when edited, notices the edit, and resets to the preset", async () => {
    const { isThemeEdited, resetTheme } = await import("@/components/forms/formThemes");
    const paper = themeFromPreset("paper", "https://example.com/logo.png");
    expect(isThemeEdited(paper)).toBe(false);
    const edited = customTheme({ ...paper, accent: "#123456", font: "serif", sound: "off" });
    expect(edited.preset).toBe("paper");
    expect(isThemeEdited(edited)).toBe(true);
    const reset = resetTheme(edited);
    expect(reset).toMatchObject({ preset: "paper", accent: themeFromPreset("paper").accent, font: themeFromPreset("paper").font, logoUrl: "https://example.com/logo.png", sound: "off" });
    expect(isThemeEdited(reset)).toBe(false);
  });

  it("leaves themes that never came from a preset alone", async () => {
    const { isThemeEdited, resetTheme } = await import("@/components/forms/formThemes");
    const custom = customTheme({ accent: "#22c55e", background: "plain", font: "sans", radius: "small" });
    expect(custom.preset).toBe("custom");
    expect(isThemeEdited(custom)).toBe(false);
    expect(resetTheme(custom)).toBe(custom);
  });
});
