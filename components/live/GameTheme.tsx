import type { FormTheme } from "@/convex/formLogic";
import { emptyDefinition } from "@/convex/formLogic";
import { themeClass, themeFromPreset, themeSound, themeStyle } from "@/components/forms/formThemes";
import "@/components/forms/formThemes.css";

/** Uses the same palette, type and backdrop as forms, with readable game controls. */
export function gameThemeProps(theme?: FormTheme | null) {
  const definition = { ...emptyDefinition(), theme: theme ?? themeFromPreset("chaos") };
  return { className: `live-root ${themeClass(definition)}`, style: themeStyle(definition) };
}

/** Games always play sound; form themes that are silent use the arcade pack. Each device can still mute. */
export function gameSound(theme?: FormTheme | null) {
  const pack = themeSound({ ...emptyDefinition(), theme: theme ?? themeFromPreset("chaos") });
  return pack === "off" ? "arcade" : pack;
}
