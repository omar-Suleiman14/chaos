"use client";
/**
 * Reading settings: text size, line width, typeface and appearance. Read-aloud settings live
 * on the Listen icon (ListenMenu). Every choice is a menu item, so the menu's arrow keys reach all of them.
 */
import { memo } from "react";
import { Monitor, Moon, Sun, Type } from "lucide-react";
import { WsMenu } from "@/components/workspace/primitives";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { useCopy } from "@/lib/i18n";
import type { ReaderPrefs } from "@/lib/learn/readerPrefs";
import { ChoiceChips, Segmented, type SetPrefs } from "./ChoiceChips";

const copy = {
  en: {
    reading: "Reading settings", size: "Text size", sizes: { small: "Small", normal: "Normal", large: "Large" }, width: "Line width", widths: { narrow: "Narrow", normal: "Normal", wide: "Wide" },
    font: "Typeface", fonts: { sans: "Sans", serif: "Serif" }, appearance: "Appearance", modes: { light: "Light", dark: "Dark", system: "Auto" },
  },
  ar: {
    reading: "إعدادات القراءة", size: "حجم النص", sizes: { small: "صغير", normal: "عادي", large: "كبير" }, width: "عرض السطر", widths: { narrow: "ضيق", normal: "عادي", wide: "عريض" },
    font: "الخط", fonts: { sans: "بلا زوائد", serif: "بزوائد" }, appearance: "المظهر", modes: { light: "فاتح", dark: "داكن", system: "تلقائي" },
  },
};

/** Memoized: prefs and setPrefs keep their identity, so lesson updates (an agent appending blocks) skip the menu. */
const ReadingMenu = memo(function ReadingMenu({ prefs, setPrefs }: { prefs: ReaderPrefs; setPrefs: SetPrefs }) {
  const t = useCopy(copy);
  return (
    <WsMenu label={t.reading} trigger={<Type size={17} />} menuClassName="lx-reading-menu">
      {() => <ReadingSettings prefs={prefs} setPrefs={setPrefs} />}
    </WsMenu>
  );
});
export default ReadingMenu;

const SIZE_PREVIEW = { small: "12px", normal: "13.5px", large: "15.5px" } as Record<string, string>;
const MODES: readonly ThemeMode[] = ["light", "dark", "system"];
const MODE_ICON = { light: Sun, dark: Moon, system: Monitor };

function ReadingSettings({ prefs, setPrefs }: { prefs: ReaderPrefs; setPrefs: SetPrefs }) {
  const t = useCopy(copy);
  const { mode, setMode } = useTheme();
  return (
    <div className="lx-reading-menu__body">
      {/* Each choice previews itself: sizes in their size, typefaces in their face. */}
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="size" label={t.size} options={t.sizes} optionStyle={(v) => ({ fontSize: SIZE_PREVIEW[v] })} />
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="width" label={t.width} options={t.widths} />
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="font" label={t.font} options={t.fonts} optionStyle={(v) => (v === "serif" ? { fontFamily: '"Libron", Georgia, serif' } : undefined)} />
      <Segmented label={t.appearance} values={MODES} value={mode} onChange={setMode}
        render={(m) => { const Icon = MODE_ICON[m]; return <><Icon size={14} aria-hidden /><bdi>{t.modes[m]}</bdi></>; }} />
    </div>
  );
}
