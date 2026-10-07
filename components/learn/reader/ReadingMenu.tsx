"use client";
/**
 * Reading settings: text, appearance and read aloud. Read-aloud settings sit one level in
 * ("Read aloud ›") so the menu stays short on phones; their code loads on demand (prefetched
 * when the menu opens) so the lesson's first load carries none of it. Every row is a menu
 * item, so the menu's arrow-key navigation reaches all of them.
 */
import { memo, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, Type } from "lucide-react";
import { WsMenu } from "@/components/workspace/primitives";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useCopy } from "@/lib/i18n";
import type { ReaderPrefs } from "@/lib/learn/readerPrefs";
import { ChoiceChips, type SetPrefs } from "./ChoiceChips";

const loadListen = () => import("./ListenSettings");
const ListenSettings = dynamic(loadListen, { ssr: false });

const copy = {
  en: {
    reading: "Reading settings", size: "Text size", sizes: { small: "Small", normal: "Normal", large: "Large" }, width: "Line width", widths: { narrow: "Narrow", normal: "Normal", wide: "Wide" },
    font: "Typeface", fonts: { sans: "Sans", serif: "Serif" }, appearance: "Appearance", listen: "Read aloud",
    follows: { word: "Word", sentence: "Sentence", paragraph: "Paragraph", off: "Off" },
  },
  ar: {
    reading: "إعدادات القراءة", size: "حجم النص", sizes: { small: "صغير", normal: "عادي", large: "كبير" }, width: "عرض السطر", widths: { narrow: "ضيق", normal: "عادي", wide: "عريض" },
    font: "الخط", fonts: { sans: "بلا زوائد", serif: "بزوائد" }, appearance: "المظهر", listen: "القراءة بصوت عالٍ",
    follows: { word: "كلمة", sentence: "جملة", paragraph: "فقرة", off: "إيقاف" },
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
  const [view, setView] = useState<"main" | "listen">("main");
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => { void loadListen(); }, []);
  // Coming back from Read aloud keeps focus inside the menu, on its first row.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (view === "main") root.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [view]);
  return (
    <div ref={root} className="lx-reading-menu__body" data-view={view}>
      {view === "main" ? (
        <>
          <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="size" label={t.size} options={t.sizes} />
          <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="width" label={t.width} options={t.widths} />
          <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="font" label={t.font} options={t.fonts} />
          <div className="lx-reading-menu__appearance"><span className="lx-reading-menu__label">{t.appearance}</span><ThemeToggle className="ws-icon-button" /></div>
          <hr />
          <button type="button" role="menuitem" className="lx-reading-menu__row" aria-haspopup="true" onClick={() => setView("listen")}>
            <span style={{ flex: 1 }}>{t.listen}</span>
            <span className="lx-reading-menu__value">{t.follows[prefs.follow]} · <bdi dir="ltr">{prefs.speed}×</bdi></span>
            <ChevronRight size={16} className="lx-flip" aria-hidden />
          </button>
        </>
      ) : (
        <ListenSettings prefs={prefs} setPrefs={setPrefs} onBack={() => setView("main")} />
      )}
    </div>
  );
}
