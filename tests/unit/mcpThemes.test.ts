import { describe, expect, it } from "vitest";
import { buildThemePatch, findPreset, themeCatalog } from "@/lib/mcp/themes";
import { applyThemePatch, parseThemePatch } from "@/convex/mcpContract";
import { googleFormsTheme } from "@/convex/formLogic";

describe("MCP themes: look-alike presets", () => {
  it("lists both presets and marks Google Forms style as the default", () => {
    const { presets } = themeCatalog();
    expect(presets.find((p) => p.id === "google-forms")).toMatchObject({ name: "Google Forms style", isDefault: true, description: "Looks like Google Forms. Not affiliated with Google." });
    expect(presets.find((p) => p.id === "microsoft-forms")).toMatchObject({ name: "Microsoft Forms style", isDefault: false });
    expect(presets.filter((p) => p.isDefault)).toHaveLength(1);
  });

  it("finds them by id, name and common short names", () => {
    for (const name of ["google-forms", "Google Forms style", "google forms", "Google Forms", "google"]) expect(findPreset(name)?.id, name).toBe("google-forms");
    for (const name of ["microsoft-forms", "Microsoft Forms style", "microsoft forms", "Microsoft"]) expect(findPreset(name)?.id, name).toBe("microsoft-forms");
    expect(findPreset("Paper")?.id).toBe("paper");
  });

  it("builds a patch that Convex accepts, and switching presets replaces the chrome", () => {
    const { patch } = buildThemePatch({ preset: "microsoft forms style" });
    expect(patch).toMatchObject({ preset: "microsoft-forms", chrome: "microsoft", font: "segoe" });
    expect("theme" in parseThemePatch(patch)).toBe(true);
    const microsoft = applyThemePatch(googleFormsTheme, patch);
    expect(microsoft).toMatchObject({ preset: "microsoft-forms", chrome: "microsoft", sound: "off" });
    const paper = applyThemePatch(microsoft, buildThemePatch({ preset: "paper" }).patch);
    expect(paper.chrome).toBeUndefined();
    // Overriding one property keeps the chrome.
    expect(applyThemePatch(googleFormsTheme, { accent: "#00796b" }).chrome).toBe("google");
  });

  it("rejects an unknown chrome value", () => {
    expect("errors" in parseThemePatch({ chrome: "apple" })).toBe(true);
  });
});
