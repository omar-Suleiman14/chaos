// Theme helpers for the ChatGPT app. Preset palettes live in
// components/forms/formThemes.ts (Convex cannot import it), so this Next.js side
// resolves a preset name into its full look and sends that to Convex, which
// validates every value again (convex/mcpContract.ts).

import { MCP_APPEARANCES, MCP_LAYOUTS, MCP_RADII } from "@/convex/mcpContract";
import type { McpThemePatch } from "@/convex/mcpContract";
import { backdropOptions, buttonOptions, coverOptions, fontOptions, soundOptions, themePresets } from "@/components/forms/formThemes";

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Other names people use for a look. "chaos" and "evergreen" are the same preset. */
const ALIASES: Record<string, string> = {
  evergreen: "chaos", apple: "flow", googleforms: "google-forms", google: "google-forms", googleformsstyle: "google-forms", paper: "paper", typeform: "spotlight", microsoftforms: "microsoft-forms", microsoft: "microsoft-forms", microsoftformsstyle: "microsoft-forms",
};

/** Find a preset by id or display name, ignoring case, spaces and hyphens. */
export function findPreset(name: string) {
  const key = compact(name);
  const target = ALIASES[key] ?? key;
  return themePresets.find((p) => compact(p.id) === compact(target) || compact(p.name) === key);
}

/** A preset's look without its sound: sound is a separate, opt-in choice. */
export function presetLook(id: string): McpThemePatch {
  const preset = themePresets.find((p) => p.id === id)!;
  const { sound: _sound, background: _background, ...look } = preset.theme;
  return { preset: preset.id, ...look };
}

export type ThemeToolInput = {
  preset?: string;
  accent?: string; pageColor?: string; surfaceColor?: string; textColor?: string;
  font?: string; radius?: string; buttons?: string; cover?: string; backdrop?: string; layout?: string; appearance?: string;
};

export const THEME_OVERRIDE_KEYS = ["accent", "pageColor", "surfaceColor", "textColor", "font", "radius", "buttons", "cover", "backdrop", "layout", "appearance"] as const;

/**
 * Preset first, then individual overrides on top. Throws a plain message when
 * the preset name is unknown; enum and hex values are validated by the tool
 * schema and again by Convex.
 */
export function buildThemePatch(input: ThemeToolInput): { patch: McpThemePatch; presetName?: string } {
  let patch: McpThemePatch = {};
  let presetName: string | undefined;
  if (input.preset) {
    const preset = findPreset(input.preset);
    if (!preset) throw new Error(`No theme called “${input.preset}”. Use list_themes for the available names.`);
    patch = presetLook(preset.id);
    presetName = preset.name;
  }
  for (const key of THEME_OVERRIDE_KEYS) {
    const value = input[key];
    if (value !== undefined) (patch as Record<string, string>)[key] = value;
  }
  return { patch, presetName };
}

/** Everything list_themes returns. */
export function themeCatalog() {
  return {
    presets: themePresets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.inspiration,
      accent: p.theme.accent, pageColor: p.theme.pageColor ?? null, textColor: p.theme.textColor ?? null,
      dark: p.theme.background === "dark",
      font: p.theme.font, buttons: p.theme.buttons ?? "solid", cover: p.theme.cover ?? "none", layout: p.theme.layout ?? "flat",
      isDefault: p.id === "flow",
    })),
    options: {
      fonts: fontOptions.map((o) => ({ id: o.id, name: o.label })),
      buttons: buttonOptions.map((o) => ({ id: o.id, name: o.label })),
      covers: coverOptions.map((o) => ({ id: o.id, name: o.label })),
      backdrops: backdropOptions.map((o) => ({ id: o.id, name: o.label })),
      radius: [...MCP_RADII],
      layouts: [...MCP_LAYOUTS],
      appearance: [...MCP_APPEARANCES],
      sounds: soundOptions.map((o) => ({ id: o.id, name: o.label, description: o.hint })),
    },
    notes: [
      "Forms created from ChatGPT use the theme you pass (default Lilac) with sound on (Glass); set sound to off for silence. Forms made in Chaos itself start silent.",
      "Colours are six-digit hex like #1a73e8. appearance auto adds a darker version for respondents who use dark mode; fixed always uses the chosen colours.",
      "Changing a single property keeps the preset and shows it as edited in Chaos.",
    ],
  };
}
