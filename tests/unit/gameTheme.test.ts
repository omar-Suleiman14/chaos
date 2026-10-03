import { expect, it } from "vitest";
import { gameThemeProps } from "@/components/live/GameTheme";
import { themeFromPreset } from "@/components/forms/formThemes";
it("uses Apple styling by default, including a quiz with a saved form theme",()=>{
 expect(gameThemeProps().className).toBe("live-root live-apple");
 expect(gameThemeProps(themeFromPreset("velvet")).className).toBe("live-root live-apple");
});
it("applies the creator-selected theme when choosing a custom game appearance",()=>{
 const selected=gameThemeProps(themeFromPreset("velvet"),"theme");
 expect(selected.className).not.toContain("live-apple");
 expect(selected.style).toBeDefined();
});