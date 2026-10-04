import { describe, expect, it } from "vitest";
import { buildThemePatch, findPreset, themeCatalog } from "@/lib/mcp/themes";
import { applyThemePatch, parseThemePatch } from "@/convex/mcpContract";
import { googleFormsTheme } from "@/convex/formLogic";

describe("MCP themes: look-alike presets", () => {
  it("lists both presets and marks Flow as the default", () => {
    const { presets } = themeCatalog();
    expect(presets.find((p) => p.id === "google-forms")).toMatchObject({ name: "Lilac", isDefault: false, description: "A lilac page with separate white question cards." });
    expect(presets.find((p) => p.id === "microsoft-forms")).toMatchObject({ name: "Banner", isDefault: false });
    expect(presets.filter((p) => p.isDefault)).toHaveLength(1);
    expect(presets.find((p) => p.id === "flow")).toMatchObject({ name: "Flow", isDefault: true });
  });

  it("finds them by id, name and common short names", () => {
    for (const name of ["google-forms", "Lilac", "google forms", "Google Forms", "google"]) expect(findPreset(name)?.id, name).toBe("google-forms");
    for (const name of ["microsoft-forms", "Banner", "microsoft forms", "Microsoft"]) expect(findPreset(name)?.id, name).toBe("microsoft-forms");
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
