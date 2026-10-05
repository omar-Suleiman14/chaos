import type { GlossaryEntry } from "@/convex/lessonGlossaryModel";
export type { GlossaryEntry };

export interface GlossaryMatcher { pattern: RegExp; byKey: Map<string, GlossaryEntry> }
const key = (text: string) => text.trim().toLocaleLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One pattern for every term and alias, longest first so "left ventricle" wins over "ventricle". */
export function glossaryMatcher(entries: GlossaryEntry[]): GlossaryMatcher | null {
  const byKey = new Map<string, GlossaryEntry>();
  for (const entry of entries) for (const form of [entry.term, ...(entry.aliases ?? [])]) if (form.trim() && !byKey.has(key(form))) byKey.set(key(form), entry);
  if (!byKey.size) return null;
  const forms = [...byKey.keys()].sort((a, b) => b.length - a.length).map(escape).join("|");
  // Letters and digits on either side mean the term is part of a longer word.
  return { pattern: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${forms})(?![\\p{L}\\p{N}_])`, "giu"), byKey };
}

export function findEntry(matcher: GlossaryMatcher | null, text: string): GlossaryEntry | undefined {
  return matcher?.byKey.get(key(text));
}

/** Splits text into plain parts and term matches. Each entry is marked once per `seen` set, so a block is not covered in highlights. */
export function splitTerms(text: string, matcher: GlossaryMatcher | null, seen: Set<GlossaryEntry>): (string | { text: string; entry: GlossaryEntry })[] {
  if (!matcher || !text) return [text];
  const parts: (string | { text: string; entry: GlossaryEntry })[] = [];
  let cursor = 0;
  for (const match of text.matchAll(matcher.pattern)) {
    const entry = matcher.byKey.get(key(match[0]));
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push({ text: match[0], entry });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
