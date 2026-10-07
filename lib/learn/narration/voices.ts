/**
 * System voices for read aloud. Voices are enumerated from the device (Web Speech), never
 * hard-coded: Apple devices offer their Siri/Enhanced voices, Windows its Natural voices,
 * Android its Google voices. Nothing loads until the reader asks for speech.
 */
import type { Lang } from "./speakable";

export interface VoiceLike { voiceURI: string; name: string; lang: string; localService: boolean; default: boolean }

const norm = (lang: string) => lang.replace(/_/g, "-").toLowerCase();

/** Novelty and robotic voices (macOS ships many) are never picked on their own. */
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ)\b/i;
const LOW = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|fred|junior|ralph|kathy)\b/i;
const HIGH = /\b(premium|enhanced|natural|neural|siri|online)\b/i;

export function voicesFor<V extends VoiceLike>(voices: readonly V[], lang: Lang): V[] {
  return voices.filter((v) => norm(v.lang).split("-")[0] === lang);
}

/** Higher is better: quality markers, the reader's own region, then on-device voices (they report word timing). */
export function voiceScore(v: VoiceLike, lang: Lang, region?: string): number {
  let score = 0;
  if (HIGH.test(v.name)) score += 4;
  if (NOVELTY.test(v.name)) score -= 20;
  else if (LOW.test(v.name)) score -= 3;
  const [code, place] = norm(v.lang).split("-");
  if (code === lang && region && place === region.toLowerCase()) score += 2;
  if (lang === "en" && !region && place === "us") score += 1;
  if (v.localService) score += 1;
  if (v.default) score += 0.5;
  return score;
}

/** Voices for a language, best first. */
export function rankVoices<V extends VoiceLike>(voices: readonly V[], lang: Lang, region?: string): V[] {
  return voicesFor(voices, lang).map((v, i) => ({ v, i, score: voiceScore(v, lang, region) }))
    .sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.v);
}

/** The reader's saved voice when the device still has it, otherwise the best voice for the language. */
/** Chaos's chosen voice per language when the device has it: Moira (Irish English, Apple). */
const HOUSE_VOICE: Partial<Record<Lang, RegExp>> = { en: /^moira\b/i };

export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: Lang, preferred?: string, region?: string): V | null {
  const own = preferred ? voices.find((v) => v.voiceURI === preferred && voicesFor([v], lang).length) : undefined;
  if (own) return own;
  const ranked = rankVoices(voices, lang, region);
  const house = HOUSE_VOICE[lang];
  return (house && ranked.find((v) => house.test(v.name))) || ranked[0] || null;
}

/** The region of the reader's own language setting for a language ("GB" for en-GB), when it matches. */
export function readerRegion(lang: Lang): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  for (const l of navigator.languages ?? [navigator.language]) {
    const [code, region] = norm(l ?? "").split("-");
    if (code === lang && region) return region;
  }
  return undefined;
}

/** Voices load asynchronously in Chromium; resolve once they are there (or after a short wait). */
export function loadVoices(synth: SpeechSynthesis, wait = 1500): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); synth.removeEventListener?.("voiceschanged", done); resolve(synth.getVoices()); };
    const timer = setTimeout(done, wait);
    synth.addEventListener?.("voiceschanged", done);
  });
}
