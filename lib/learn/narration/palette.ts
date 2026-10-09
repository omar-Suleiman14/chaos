/**
 * Narration follow colors: the muted Notion family Chaos uses for text colors, with a soft
 * tint for sentences and a deeper one for the spoken word, in light and dark appearance.
 * Applied as CSS variables so the stylesheet needs one rule, not one per color.
 */
import type { NarrationColor } from "@/lib/learn/readerPrefs";

/** [soft, strong] for light pages, then for dark pages. */
const PALETTE: Record<NarrationColor, [string, string, string, string]> = {
  gray: ["#ebeced", "#d3d2cf", "#3a3d3f", "#55595b"],
  brown: ["#e9e5e3", "#d8c9c1", "#403836", "#5c4b44"],
  red: ["#fbe4e4", "#f5c6c4", "#4d3434", "#6e4341"],
  orange: ["#f6e9d9", "#f2d2ad", "#4d3e2e", "#6e5332"],
  yellow: ["#fbf3db", "#f4e2a6", "#4a4730", "#6a6235"],
  green: ["#ddedea", "#bfd8d2", "#2e4241", "#3c5e5a"],
  blue: ["#ddebf1", "#b9d6e4", "#2f3f49", "#3d5b6e"],
  purple: ["#eae4f2", "#d5c8e8", "#3b3650", "#54487a"],
  pink: ["#f4dfeb", "#ebc2d9", "#483342", "#6a4460"],
};

let lightDark: boolean | undefined;
/** `--narr` and `--narr-strong` for a color; follows the page's color scheme where `light-dark()` exists. */
export function narrationVars(color: NarrationColor): Record<"--narr" | "--narr-strong", string> {
  const [soft, strong, darkSoft, darkStrong] = PALETTE[color] ?? PALETTE.blue;
  lightDark ??= typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", "light-dark(#000, #fff)");
  if (lightDark) return { "--narr": `light-dark(${soft}, ${darkSoft})`, "--narr-strong": `light-dark(${strong}, ${darkStrong})` };
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return { "--narr": dark ? darkSoft : soft, "--narr-strong": dark ? darkStrong : strong };
}
