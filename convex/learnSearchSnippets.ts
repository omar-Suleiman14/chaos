/** Bounded search previews. Stop after five matches instead of scanning every document block. */
export function matchingLessonSnippets<T extends { id: string }>(
  blocks: readonly T[],
  words: readonly string[],
): { id: string; text: string }[] {
  const matches: { id: string; text: string }[] = [];
  if (words.length === 0) return matches;
  for (const block of blocks) {
    if (!("text" in block) || typeof block.text !== "string") continue;
    const text = block.text;
    if (!words.some(word => text.toLocaleLowerCase().includes(word))) continue;
    matches.push({ id: block.id, text: text.slice(0, 300) });
    if (matches.length === 5) break;
  }
  return matches;
}
