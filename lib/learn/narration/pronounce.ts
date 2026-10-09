/**
 * Says one word or short phrase, the way a dictionary's speaker button does: in its own
 * language and the reader's chosen voice, without opening the narration player.
 */
import { readPrefs } from "../readerPrefs";
import { dominantLang, type Lang } from "./speakable";
import { speechSupported } from "./support";
import { pickVoice, readerRegion } from "./voices";

let current: SpeechSynthesisUtterance | null = null;

/** Starts speaking `text` and returns a stop function. `onEnd` runs once, when speech ends, fails or is stopped. */
export function pronounce(text: string, { lang, onEnd }: { lang?: Lang; onEnd?: () => void } = {}): () => void {
  let ended = false;
  const finish = () => { if (!ended) { ended = true; onEnd?.(); } };
  const words = text.trim();
  if (!words || !speechSupported()) { finish(); return () => {}; }
  const synth = window.speechSynthesis;
  const language = lang ?? dominantLang(words, "en");
  const voice = pickVoice(synth.getVoices(), language, readPrefs().voices[language], readerRegion(language));
  const u = new SpeechSynthesisUtterance(words);
  u.lang = voice?.lang ?? (language === "ar" ? "ar-SA" : "en-US");
  if (voice) u.voice = voice;
  u.rate = 0.9; // a touch slower than reading speed, so every syllable is heard
  u.onend = finish;
  u.onerror = finish;
  synth.cancel();
  current = u; // engines drop events of utterances nothing references
  synth.speak(u);
  return () => {
    if (current === u) { synth.cancel(); current = null; }
    finish();
  };
}
