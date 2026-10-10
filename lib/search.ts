/**
 * Small, fast, pure client-side search for the Ctrl+K palette.
 *
 * - Text is normalized (case, diacritics, Arabic tashkeel/tatweel and letter variants) so that
 *   "Cafe" finds "Café" and "مدرسة" finds "مَدْرَسَه".
 * - Every query word must prefix-match some word of the document (AND).
 * - Score: title exact/prefix > title word > kind/section > body. Words of 5+ letters also
 *   tolerate one typo, at a lower score.
 * - Results carry a snippet of the body around the first match and the ranges to highlight.
 */

export interface SearchDoc {
  id: string;
  title: string;
  /** Short secondary text such as a kind or section ("Quiz", "Sharing"). */
  extra?: string;
  /** Long plain text searched last and used for snippets. */
  body?: string;
}

/** Character ranges [start, end) in the original text. */
export type Range = [number, number];

export interface Snippet { text: string; ranges: Range[] }

export interface SearchResult<T extends SearchDoc = SearchDoc> {
  doc: T;
  score: number;
  titleRanges: Range[];
  snippet?: Snippet;
}

interface Token { t: string; s: number; e: number }

const folded = new Map<string, string>();

/** One character of Arabic or Latin text reduced to its search form ("" drops it). */
function foldChar(ch: string): string {
  const code = ch.charCodeAt(0);
  // Plain ASCII needs only lowercasing; everything else is folded once and remembered.
  if (code < 0x80) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch;
  let out = folded.get(ch);
  if (out === undefined) folded.set(ch, (out = foldSlow(ch, code)));
  return out;
}

function foldSlow(ch: string, code: number): string {
  // Tashkeel, dagger alif and tatweel.
  if ((code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640) return "";
  switch (code) {
    case 0x0623: case 0x0625: case 0x0622: case 0x0671: return "ا"; // أ إ آ ٱ → ا
    case 0x0649: return "ي"; // ى → ي
    case 0x0629: return "ه"; // ة → ه
    default: break;
  }
  return ch.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Normalize text. `map[i]` is the index in the original text of normalized character i. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const out = foldChar(text[i]);
    for (let j = 0; j < out.length; j++) { norm += out[j]; map.push(i); }
  }
  return { norm, map };
}

export function normalize(text: string): string {
  return normalizeWithMap(text).norm;
}

const WORD = /[\p{L}\p{N}]+/gu;

function tokenize(text: string): Token[] {
  const { norm, map } = normalizeWithMap(text);
  const tokens: Token[] = [];
  for (const m of norm.matchAll(WORD)) {
    const start = m.index ?? 0;
    tokens.push({ t: m[0], s: map[start], e: map[start + m[0].length - 1] + 1 });
  }
  return tokens;
}

/** Whether `a` and `b` differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = a.length - b.length;
  if (diff > 1 || diff < -1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (diff === 0) return a.slice(i + 1) === b.slice(i + 1);
  return diff > 0 ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const TYPO_MIN = 5;

/** Arabic definite article at the start of a word (ال). */
const article = (tok: string) => tok.length > 3 && tok.startsWith("ال");
/** Where the typed word begins inside a token that matched it as a prefix. */
const matchOffset = (word: string, tok: string) => (!tok.startsWith(word) && article(tok) && tok.startsWith(word, 2) ? 2 : 0);

/** A prefix or (for longer words) near-prefix match. 0 = none, 1 = typo, 2 = prefix, 3 = exact. */
function matchWord(word: string, tok: string): 0 | 1 | 2 | 3 {
  if (tok === word) return 3;
  if (tok.startsWith(word)) return 2;
  // Arabic "the": المدرسة is found by مدرسة.
  if (article(tok) && tok.startsWith(word, 2)) return 2;
  if (word.length >= TYPO_MIN && (withinOneEdit(word, tok) || withinOneEdit(word, tok.slice(0, word.length)))) return 1;
  return 0;
}

export interface IndexedDoc<T extends SearchDoc = SearchDoc> {
  doc: T;
  title: Token[];
  extra: Token[];
  body: Token[];
  normTitle: string;
}

/** Tokenize once; reuse the index across keystrokes. */
export function buildIndex<T extends SearchDoc>(docs: T[]): IndexedDoc<T>[] {
  return docs.map((doc) => ({
    doc,
    title: tokenize(doc.title),
    extra: tokenize(doc.extra ?? ""),
    body: tokenize(doc.body ?? ""),
    normTitle: normalize(doc.title).trim(),
  }));
}

const SCORE = {
  title: { 3: 60, 2: 50, 1: 20 },
  extra: { 3: 28, 2: 25, 1: 10 },
  body: { 3: 12, 2: 10, 1: 4 },
} as const;

/** Best token in `tokens` for `word`: highest match quality, earliest position. */
function best(tokens: Token[], word: string): { quality: 1 | 2 | 3; token: Token; index: number } | null {
  let found: { quality: 1 | 2 | 3; token: Token; index: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const q = matchWord(word, tokens[i].t);
    if (q && (!found || q > found.quality)) {
      found = { quality: q, token: tokens[i], index: i };
      if (q === 3) break;
    }
  }
  return found;
}

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 130;

function makeSnippet(body: string, hits: Token[], all: Token[], words: string[]): Snippet | undefined {
  if (!hits.length) return undefined;
  const first = hits.reduce((a, b) => (b.s < a.s ? b : a));
  let start = Math.max(0, first.s - SNIPPET_BEFORE);
  // Begin at a word boundary.
  if (start > 0) {
    const space = body.indexOf(" ", start);
    if (space !== -1 && space < first.s) start = space + 1;
  }
  const end = Math.min(body.length, start + SNIPPET_LENGTH);
  const raw = body.slice(start, end);
  const text = (start > 0 ? "…" : "") + raw.replace(/\s+/g, " ") + (end < body.length ? "…" : "");
  // Recompute the offsets against the collapsed text so ranges line up with what is shown.
  const lead = start > 0 ? 1 : 0;
  const shift: number[] = [];
  let out = lead;
  let prevSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const isSpace = /\s/.test(raw[i]);
    if (isSpace && prevSpace) { shift.push(-1); continue; }
    shift.push(out++);
    prevSpace = isSpace;
  }
  const ranges: Range[] = [];
  for (const tok of all) {
    if (tok.s < start || tok.e > end) continue;
    if (!words.some((w) => matchWord(w, tok.t) >= 2)) continue;
    // Only the typed prefix is marked when the word was matched as a prefix.
    const word = words.find((w) => matchWord(w, tok.t) >= 2) ?? "";
    const off = matchOffset(word, tok.t);
    const a = shift[tok.s + off - start];
    if (a >= 0) ranges.push([a, a + Math.min(tok.e - tok.s - off, word.length)]);
  }
  return { text, ranges };
}

/**
 * Search an index. Returns matches best-first; an empty or wordless query returns nothing.
 * `limit` caps the number of results (default: all).
 */
export function searchIndex<T extends SearchDoc>(index: IndexedDoc<T>[], query: string, limit = Infinity): SearchResult<T>[] {
  const words = tokenize(query).map((t) => t.t);
  if (!words.length) return [];
  const phrase = words.join(" ");
  const results: SearchResult<T>[] = [];
  for (const entry of index) {
    let score = 0;
    let ok = true;
    let titleWords = 0;
    const titleRanges: Range[] = [];
    const bodyHits: Token[] = [];
    for (const word of words) {
      const inTitle = best(entry.title, word);
      const inExtra = inTitle && inTitle.quality >= 2 ? null : best(entry.extra, word);
      const inBody = inTitle && inTitle.quality >= 2 ? null : best(entry.body, word);
      let wordScore = 0;
      if (inTitle) {
        wordScore = SCORE.title[inTitle.quality] + (inTitle.index === 0 ? 5 : 0);
        titleWords++;
        const off = inTitle.quality === 1 ? 0 : matchOffset(word, inTitle.token.t);
        const s = inTitle.token.s + off;
        titleRanges.push([s, inTitle.quality === 1 ? inTitle.token.e : Math.min(inTitle.token.e, s + word.length)]);
      }
      if (inExtra) wordScore = Math.max(wordScore, SCORE.extra[inExtra.quality]);
      if (inBody) {
        wordScore = Math.max(wordScore, SCORE.body[inBody.quality]);
        bodyHits.push(inBody.token);
      }
      if (!wordScore) { ok = false; break; }
      score += wordScore;
    }
    if (!ok) continue;
    if (entry.normTitle === phrase) score += 100;
    else if (entry.normTitle.startsWith(phrase)) score += 60;
    else if (words.length > 1 && entry.normTitle.includes(phrase)) score += 30;
    const snippet = titleWords < words.length ? makeSnippet(entry.doc.body ?? "", bodyHits, entry.body, words) : undefined;
    results.push({ doc: entry.doc, score, titleRanges, snippet });
  }
  // Stable: equal scores keep the caller's order (recent first, and so on).
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.score - a.r.score || a.i - b.i)
    .slice(0, limit)
    .map(({ r }) => r);
}

/** Convenience for one-off searches. Prefer buildIndex when the docs stay the same. */
export function search<T extends SearchDoc>(docs: T[], query: string, limit = Infinity): SearchResult<T>[] {
  return searchIndex(buildIndex(docs), query, limit);
}

/** Split text into plain and highlighted parts for rendering with <mark>. */
export function splitByRanges(text: string, ranges: Range[]): { text: string; mark: boolean }[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const [s, e] of sorted) {
    if (s < at || e <= s) continue;
    if (s > at) parts.push({ text: text.slice(at, s), mark: false });
    parts.push({ text: text.slice(s, e), mark: true });
    at = e;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

const STOPWORDS = new Set([
  "how", "do", "does", "did", "i", "we", "you", "can", "could", "should", "would", "to", "a", "an", "the", "my", "me", "of", "in", "on",
  "is", "are", "it", "what", "where", "when", "why", "which", "for", "with", "and", "or", "make", "get", "want", "need", "way",
  "كيف", "ما", "ماذا", "هل", "اين", "متي", "لماذا", "انا", "في", "من", "علي", "الي", "عن", "او", "و",
]);

/** Drops filler words from a question ("how do I change my username" becomes "change username"). Returns the original when nothing would be left. */
export function stripStopwords(query: string): string {
  const words = tokenize(query).map((t) => t.t);
  const kept = words.filter((w) => !STOPWORDS.has(w));
  return kept.length && kept.length < words.length ? kept.join(" ") : query;
}
