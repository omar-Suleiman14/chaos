import type { DocSearchEntry } from "./index";

/**
 * Docs search. Every word of the query must match the start of a word in the entry
 * (so "cust lin" finds "custom links"). Title matches rank above section matches,
 * which rank above body matches. Arabic is compared without diacritics, with the
 * alef and yaa variants folded together and a leading "ال" ignored.
 */
export interface SearchSegment { text: string; hit: boolean }
export interface SearchResult { entry: DocSearchEntry; score: number; snippet: SearchSegment[] }

const WORD = /[\p{L}\p{N}]+/gu;

function normalise(word: string): string {
  let w = word.toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
  if (w.length > 4 && w.startsWith("ال")) w = w.slice(2);
  return w;
}

interface Token { raw: string; norm: string; index: number }
function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD)) tokens.push({ raw: match[0], norm: normalise(match[0]), index: match.index ?? 0 });
  return tokens;
}

export function queryWords(query: string): string[] {
  return [...new Set(tokenise(query).map((t) => t.norm).filter(Boolean))];
}

const anyPrefix = (tokens: Token[], word: string) => tokens.some((t) => t.norm.startsWith(word));

/** A short piece of the body around the first match, with the matching words marked. */
function snippetFor(text: string, tokens: Token[], words: string[]): SearchSegment[] {
  const first = tokens.find((t) => words.some((w) => t.norm.startsWith(w)));
  const length = 150;
  const start = first ? Math.max(0, first.index - 40) : 0;
  // Begin on a word boundary so the snippet does not open mid-word.
  const from = start === 0 ? 0 : (text.indexOf(" ", start) + 1 || start);
  const slice = text.slice(from, from + length);
  const segments: SearchSegment[] = [];
  let cursor = 0;
  for (const token of tokenise(slice)) {
    if (!words.some((w) => token.norm.startsWith(w))) continue;
    if (token.index > cursor) segments.push({ text: slice.slice(cursor, token.index), hit: false });
    segments.push({ text: token.raw, hit: true });
    cursor = token.index + token.raw.length;
  }
  if (cursor < slice.length) segments.push({ text: slice.slice(cursor), hit: false });
  if (from > 0 && segments.length) segments[0] = { ...segments[0], text: `…${segments[0].text}` };
  if (from + length < text.length && segments.length) segments[segments.length - 1] = { ...segments[segments.length - 1], text: `${segments[segments.length - 1].text}…` };
  return segments;
}

export function searchDocs(entries: DocSearchEntry[], query: string, limit = 8): SearchResult[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const results: SearchResult[] = [];
  for (const entry of entries) {
    const title = tokenise(entry.title);
    const section = tokenise(entry.section);
    const body = tokenise(entry.text);
    let score = 0;
    let all = true;
    for (const word of words) {
      if (title.some((t) => t.norm === word)) score += 14;
      else if (anyPrefix(title, word)) score += 10;
      else if (anyPrefix(section, word)) score += 4;
      else if (anyPrefix(body, word)) score += 1;
      else { all = false; break; }
    }
    if (!all) continue;
    if (normalise(entry.title).startsWith(words[0])) score += 4;
    // Whole articles rank just above their own headings when both match equally.
    if (!entry.href.includes("#")) score += 1;
    results.push({ entry, score, snippet: snippetFor(entry.text, body, words) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
