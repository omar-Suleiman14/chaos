"use client";
/**
 * Read-aloud settings inside the reading settings menu: voices per language, follow-along
 * mode, highlight color and playback speed. Loaded on demand by ReadingMenu.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { FOLLOW_MODES, NARRATION_COLORS, SPEEDS, type NarrationColor, type ReaderPrefs } from "@/lib/learn/readerPrefs";
import { pickVoice, rankVoices, readerRegion } from "@/lib/learn/narration/voices";
import { speechSupported } from "@/lib/learn/narration/support";
import { narrationVars } from "@/lib/learn/narration/palette";
import type { Lang } from "@/lib/learn/narration/speakable";
import { ChoiceChips, type SetPrefs } from "./ChoiceChips";
import { useVoices } from "./useVoices";

const copy = {
  en: {
    back: "Back", voice: (lang: string) => `${lang} voice`, automatic: "Automatic", automaticBest: (name: string) => `Automatic (${name})`, noVoices: "No voice on this device",
    follow: "Follow along", follows: { word: "Word", sentence: "Sentence", paragraph: "Paragraph", off: "Off" }, color: "Highlight color",
    colors: { gray: "Gray", brown: "Brown", red: "Red", orange: "Orange", yellow: "Yellow", green: "Green", blue: "Blue", purple: "Purple", pink: "Pink" } as Record<NarrationColor, string>,
    speed: "Playback speed", oneSpeed: "Use one speed for whole lesson", oneSpeedOff: "Each section can keep its own speed from the player.",
    wordHint: "Word following needs a voice that reports word timing; otherwise the sentence is followed.", unsupported: "Read aloud isn't available in this browser.",
    langs: { en: "English", ar: "Arabic" } as Record<Lang, string>,
  },
  ar: {
    back: "رجوع", voice: (lang: string) => `صوت ${lang}`, automatic: "تلقائي", automaticBest: (name: string) => `تلقائي (${name})`, noVoices: "لا صوت على هذا الجهاز",
    follow: "تتبّع القراءة", follows: { word: "كلمة", sentence: "جملة", paragraph: "فقرة", off: "إيقاف" }, color: "لون التظليل",
    colors: { gray: "رمادي", brown: "بني", red: "أحمر", orange: "برتقالي", yellow: "أصفر", green: "أخضر", blue: "أزرق", purple: "بنفسجي", pink: "وردي" } as Record<NarrationColor, string>,
    speed: "سرعة التشغيل", oneSpeed: "سرعة واحدة للدرس كله", oneSpeedOff: "يمكن لكل قسم أن يحتفظ بسرعته من المشغّل.",
    wordHint: "تتبّع الكلمات يحتاج صوتًا يُبلغ عن توقيت الكلمات؛ وإلا تُتتبّع الجملة.", unsupported: "القراءة بصوت عالٍ غير متاحة في هذا المتصفح.",
    langs: { en: "الإنجليزية", ar: "العربية" } as Record<Lang, string>,
  },
};

const SPEED_LABELS = Object.fromEntries(SPEEDS.map((s) => [String(s), `${s}×`]));

/** `onBack` adds a Back row for menus that open these settings as a sub-level. */
export default function ListenSettings({ prefs, setPrefs, onBack }: { prefs: ReaderPrefs; setPrefs: SetPrefs; onBack?: () => void }) {
  const t = useCopy(copy);
  const voices = useVoices();
  const [voiceFor, setVoiceFor] = useState<Lang | null>(null);
  const [returned, setReturned] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Moving between levels keeps focus inside the menu, on the new level's first row.
  const first = useRef(!onBack);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    root.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [voiceFor]);
  const back = (voiceFor || onBack) && (
    <button type="button" role="menuitem" className="lx-reading-menu__row" onClick={() => { if (voiceFor) { setVoiceFor(null); setReturned(true); } else onBack?.(); }}>
      <ChevronLeft size={16} className="lx-flip" aria-hidden />{t.back}
    </button>
  );
  if (!speechSupported()) return <div ref={root} className="lx-level">{back}<p className="lx-muted" style={{ padding: "4px 10px" }}>{t.unsupported}</p></div>;
  // Levels slide in from the side they lead to, like a navigation stack.
  if (voiceFor) return <div ref={root} key="voices" className="lx-level" data-from="end"><VoiceList lang={voiceFor} voices={voices} prefs={prefs} setPrefs={setPrefs} back={back} /></div>;
  return (
    <div ref={root} key="main" className="lx-level" data-from={returned ? "start" : undefined}>
      {back}
      {(["en", "ar"] as const).map((lang) => {
        const voice = pickVoice(voices, lang, prefs.voices[lang], readerRegion(lang));
        return (
          <button key={lang} type="button" role="menuitem" className="lx-reading-menu__row lx-voice-row" aria-haspopup="true" onClick={() => setVoiceFor(lang)}>
            <span style={{ flex: 1 }}>{t.voice(t.langs[lang])}</span>
            <span className="lx-reading-menu__value" dir="auto">{voice?.name ?? t.noVoices}</span>
            <ChevronRight size={16} className="lx-flip" aria-hidden />
          </button>
        );
      })}
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="follow" label={t.follow} options={t.follows} values={FOLLOW_MODES} />
      {prefs.follow === "word" && <p className="lx-reading-menu__hint">{t.wordHint}</p>}
      <div role="group" aria-label={t.color} className="lx-reading-menu__group">
        <span className="lx-reading-menu__label">{t.color}</span>
        <div className="lx-narr-swatches">
          {NARRATION_COLORS.map((c) => (
            <button key={c} type="button" role="menuitemradio" aria-checked={prefs.narrationColor === c} aria-label={t.colors[c]} title={t.colors[c]} className="lx-narr-swatch"
              style={narrationVars(c) as React.CSSProperties} onClick={() => setPrefs({ narrationColor: c })}>
              {prefs.narrationColor === c && <Check size={13} strokeWidth={3} aria-hidden />}
            </button>
          ))}
        </div>
      </div>
      <ChoiceChips prefs={prefs} setPrefs={setPrefs} name="speed" label={t.speed} options={SPEED_LABELS} values={SPEEDS} />
      <button type="button" role="menuitemcheckbox" aria-checked={prefs.oneSpeed} className="lx-reading-menu__row" onClick={() => setPrefs({ oneSpeed: !prefs.oneSpeed })}>
        <span style={{ flex: 1 }}>{t.oneSpeed}</span><span className="lx-switch" aria-hidden />
      </button>
      {!prefs.oneSpeed && <p className="lx-reading-menu__hint">{t.oneSpeedOff}</p>}
    </div>
  );
}

function VoiceList({ lang, voices, prefs, setPrefs, back }: { lang: Lang; voices: SpeechSynthesisVoice[]; prefs: ReaderPrefs; setPrefs: SetPrefs; back: React.ReactNode }) {
  const t = useCopy(copy);
  const region = readerRegion(lang);
  const ranked = rankVoices(voices, lang, region);
  const saved = prefs.voices[lang] && ranked.some((v) => v.voiceURI === prefs.voices[lang]) ? prefs.voices[lang] : undefined;
  const choose = (uri: string | undefined) => setPrefs({ voices: { ...prefs.voices, [lang]: uri } });
  return (
    <div role="group" aria-label={t.voice(t.langs[lang])}>
      {back}
      <p className="lx-reading-menu__label" style={{ padding: "6px 10px 2px" }}>{t.voice(t.langs[lang])}</p>
      {!ranked.length && <p className="lx-muted" style={{ padding: "4px 10px" }}>{t.noVoices}</p>}
      {ranked.length > 0 && (
        <button type="button" role="menuitemradio" aria-checked={!saved} className="lx-reading-menu__row" onClick={() => choose(undefined)}>
          <span style={{ flex: 1 }}>{t.automaticBest(pickVoice(voices, lang, undefined, region)?.name ?? t.automatic)}</span>{!saved && <Check size={15} aria-hidden />}
        </button>
      )}
      {ranked.map((v) => (
        <button key={v.voiceURI} type="button" role="menuitemradio" aria-checked={saved === v.voiceURI} className="lx-reading-menu__row" onClick={() => choose(v.voiceURI)}>
          <span style={{ flex: 1, minWidth: 0 }} dir="auto">{v.name}</span><span className="lx-reading-menu__value">{v.lang}</span>{saved === v.voiceURI && <Check size={15} aria-hidden />}
        </button>
      ))}
    </div>
  );
}
