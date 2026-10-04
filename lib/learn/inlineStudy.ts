import { asBlocks, walk, type Block } from "./doc";

/** Legacy attachments remain readable as blocks until an author chooses their position. */
export function legacyFlashcardBlocks(content: unknown, decks: { setId: string }[]): Block[] {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const { block } of walk(asBlocks(content))) {
    ids.add(block.id);
    if (block.type !== "flashcards" && block.type !== "lessonFlashcards") continue;
    if (typeof block.props.setId === "string") seen.add(block.props.setId);
    else {
      try { const value = JSON.parse(String(block.props.lessonData)); if (typeof value.setId === "string") seen.add(value.setId); } catch { /* Incomplete editor blocks are not references. */ }
    }
  }
  const blocks: Block[] = [];
  for (const deck of decks) {
    if (seen.has(deck.setId)) continue;
    seen.add(deck.setId);
    let id = `legacy_flashcards_${blocks.length}`;
    while (ids.has(id)) id += "_";
    ids.add(id);
    blocks.push({ id, type: "lessonFlashcards", props: { setId: deck.setId }, children: [] });
  }
  return blocks;
}
