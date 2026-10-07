"use client";
/**
 * The Listen icon in the reader's top bar: start or stop listening, and every read-aloud
 * setting (voices, follow along, highlight color, speed). The settings' code loads on demand,
 * prefetched when the menu opens, so the lesson's first load carries none of it.
 */
import { memo, useEffect } from "react";
import dynamic from "next/dynamic";
import { Headphones, Play, Square } from "lucide-react";
import { WsMenu } from "@/components/workspace/primitives";
import { useCopy } from "@/lib/i18n";
import type { ReaderPrefs } from "@/lib/learn/readerPrefs";
import type { SetPrefs } from "./ChoiceChips";

const loadSettings = () => import("./ListenSettings");
const ListenSettings = dynamic(loadSettings, { ssr: false });

const copy = {
  en: { label: "Listen", start: "Listen to this lesson", stop: "Stop listening" },
  ar: { label: "استمع", start: "استمع إلى هذا الدرس", stop: "أوقف الاستماع" },
};

const ListenMenu = memo(function ListenMenu({ prefs, setPrefs, listening, onToggle, className }: {
  prefs: ReaderPrefs; setPrefs: SetPrefs; listening: boolean; onToggle: () => void; className?: string;
}) {
  const t = useCopy(copy);
  return (
    <WsMenu label={t.label} menuClassName="lx-reading-menu" triggerClassName={`ws-btn ws-btn--sm ws-btn--ghost${className ? ` ${className}` : ""}`}
      trigger={<><Headphones size={15} aria-hidden /><span className="lx-phone-label">{t.label}</span>{listening && <span className="lx-listen-dot" aria-hidden />}</>}>
      {(close) => <ListenMenuBody prefs={prefs} setPrefs={setPrefs} listening={listening} onToggle={() => { close(); onToggle(); }} />}
    </WsMenu>
  );
});
export default ListenMenu;

function ListenMenuBody({ prefs, setPrefs, listening, onToggle }: { prefs: ReaderPrefs; setPrefs: SetPrefs; listening: boolean; onToggle: () => void }) {
  const t = useCopy(copy);
  useEffect(() => { void loadSettings(); }, []);
  return (
    <div className="lx-reading-menu__body">
      <button type="button" role="menuitem" className="lx-reading-menu__row lx-listen-start" onClick={onToggle}>
        {listening ? <Square size={15} aria-hidden /> : <Play size={15} aria-hidden />}<span style={{ flex: 1 }}>{listening ? t.stop : t.start}</span>
      </button>
      <hr />
      <ListenSettings prefs={prefs} setPrefs={setPrefs} />
    </div>
  );
}
