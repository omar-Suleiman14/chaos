// Pure grading rules shared by quiz-mode forms (formQuiz.ts) and live games. No Convex imports,
// so it is unit-testable and identical everywhere.
//
// Rules:
//  - Single choice / true-false: exact match after trim and case-fold, else 0.
//  - Multi-select: all or nothing. Full points only when the selected set equals the correct set exactly;
//    a missing or an extra choice scores 0. There is no partial credit and no negative marking.
//  - Written: a blank answer scores 0. Keywords match as whole words or phrases after normalisation. All
//    matched = full points; matched share >= the half-marks threshold = half; else 0.
// Keyword matching compares words. It does not understand meaning.

export const DEFAULT_HALF_MARK_THRESHOLD = 50;

/** Case-fold, NFKC, fold Arabic letter variants, drop tashkeel/tatweel, collapse spaces. */
export function normalizeText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFKC")) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640) continue;
    switch (code) {
      case 0x0623: case 0x0625: case 0x0622: case 0x0671: out += "ا"; continue; // alef variants
      case 0x0649: out += "ي"; continue; // alef maqsura -> yaa
      case 0x0629: out += "ه"; continue; // taa marbuta -> haa
      default: break;
    }
    out += ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  }
  return out.replace(/\s+/gu, " ").trim();
}

/**
 * Arabic attaches the article and short particles to the word ("والمدرسة", "بالبيت", "للطالب"),
 * so they are removed before comparing: an optional و/ف, then ال, بال, كال or لل (ل + ال).
 * At least two letters must remain, so short words are left alone.
 */
const ARABIC_PREFIX = /^[وف]?(?:[بك]?ال|لل)/u;
function stripArabicPrefix(word: string): string {
  const rest = word.replace(ARABIC_PREFIX, "");
  return rest !== word && rest.length >= 2 ? rest : word;
}

/** Words of a text: runs of letters and digits, so punctuation never joins or splits matches. */
export function wordsOf(text: string): string[] {
  return (normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? []).map(stripArabicPrefix);
}

function containsPhrase(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  for (let i = 0; i <= words.length - phrase.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) if (words[i + j] !== phrase[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/** Keywords that count (blank ones are ignored) and how many appear as whole words or phrases. */
export function matchKeywords(answer: string, keywords: string[]): { matched: number; total: number } {
  const words = wordsOf(answer);
  const usable = keywords.map(wordsOf).filter((k) => k.length > 0);
  return { matched: usable.filter((k) => containsPhrase(words, k)).length, total: usable.length };
}

export interface Grade { isCorrect: boolean; points: number }

const fold = (s: string) => s.trim().toLowerCase();

export function gradeSingle(answer: string, correct: string | undefined, points: number): Grade {
  const isCorrect = correct !== undefined && correct.trim() !== "" && fold(answer) === fold(correct);
  return { isCorrect, points: isCorrect ? points : 0 };
}

/** Exact set equality after the given normaliser; duplicates in either list are ignored. */
export function sameSet(selected: string[], correct: string[], norm: (s: string) => string = fold): boolean {
  const a = new Set(selected.map(norm).filter(Boolean));
  const b = new Set(correct.map(norm).filter(Boolean));
  if (b.size === 0 || a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Multi-select answers are stored as a JSON array string, so option text may contain commas. */
export function encodeMultiAnswer(selected: string[]): string {
  return JSON.stringify(selected);
}

/**
 * Reads a stored or submitted multi-select answer. A JSON array of strings is the current format;
 * anything else is the older comma-joined text, which is still accepted so stored answers keep grading.
 */
export function parseMultiAnswer(raw: string): string[] {
  const text = raw.trim();
  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed.map((x) => x.trim());
    } catch { /* not JSON: fall through to the old format */ }
  }
  return text.split(",").map((x) => x.trim()).filter(Boolean);
}

export function gradeMulti(selected: string[], correct: string[], points: number): Grade {
  const isCorrect = sameSet(selected, correct);
  return { isCorrect, points: isCorrect ? points : 0 };
}

export function clampThreshold(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isFinite(value)) return DEFAULT_HALF_MARK_THRESHOLD;
  return Math.min(100, Math.max(0, value));
}

export function gradeWritten(answer: string, keywords: string[], points: number, halfMarkThreshold?: number | null): Grade {
  if (wordsOf(answer).length === 0) return { isCorrect: false, points: 0 }; // a blank answer never scores
  const { matched, total } = matchKeywords(answer, keywords);
  if (total === 0) return { isCorrect: true, points }; // no keywords set: any real answer gets full marks
  if (matched === total) return { isCorrect: true, points };
  const share = (matched / total) * 100;
  if (matched > 0 && share >= clampThreshold(halfMarkThreshold)) return { isCorrect: false, points: points / 2 };
  return { isCorrect: false, points: 0 };
}
