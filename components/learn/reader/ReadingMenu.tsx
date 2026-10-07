"use client";
/**
 * Reading settings: text size, line width, typeface and appearance. Read-aloud settings live
 * on the Listen icon (ListenMenu). Every choice is a menu item, so the menu's arrow keys reach all of them.
 */
import { memo } from "react";
import { Type } from "lucide-react";
import { WsMenu } from "@/components/workspace/primitives";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useCopy } from "@/lib/i18n";
import type { ReaderPrefs } from "@/lib/learn/readerPrefs";
import { ChoiceChips, type SetPrefs } from "./ChoiceChips";

const copy = {
  en: {
    reading: "Reading settings", size: "Text size", sizes: { small: "Small", normal: "Normal", large: "Large" }, width: "Line width", widths: { narrow: "Narrow", normal: "Normal", wide: "Wide" },
    font: "Typeface", fonts: { sans: "Sans", serif: "Serif" }, appearance: "Appearance",
  },
  ar: {
    reading: "إعدادات القراءة", size: "حجم النص", sizes: { small: "صغير", normal: "عادي", large: "كبير" }, width: "عرض السطر", widths: { narrow: "ضيق", normal: "عادي", wide: "عريض" },
    font: "الخط", fonts: { sans: "بلا زوائد", serif: "بزوائد" }, appearance: "المظهر",
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

function ReadingSettings({ prefs, setPrefs }: { prefs: ReaderPrefs; setPrefs: SetPrefs }) {
  const t = useCopy(copy);
  return (
    <div className="lx-reading-menu__body">
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="size" label={t.size} options={t.sizes} />
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="width" label={t.width} options={t.widths} />
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="font" label={t.font} options={t.fonts} />
      <div className="lx-reading-menu__appearance"><span className="lx-reading-menu__label">{t.appearance}</span><ThemeToggle className="ws-icon-button" /></div>
    </div>
  );
}
