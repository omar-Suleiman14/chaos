import type { LessonDocument, LessonBlock } from "../convex/learnModel";

export type NotionRichText = { plain_text?: string; href?: string | null; annotations?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean } };
export type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};
type RawRich = Record<string, unknown>;

function parts(block: NotionBlock): NotionRichText[] {
  const data = block[block.type] as { rich_text?: RawRich[] } | undefined;
  return (data?.rich_text ?? []).filter((r) => typeof r === "object").map((r) => ({
    plain_text: typeof r.plain_text === "string" ? r.plain_text : "",
    href: typeof r.href === "string" ? r.href : null,
    annotations: typeof r.annotations === "object" && r.annotations !== null ? r.annotations as NotionRichText["annotations"] : undefined,
  }));
}
export function notionBlocksToLesson(input: Array<{ block: NotionBlock; parentId?: string }>): { document: LessonDocument; skipped: number } {
  const blocks: LessonBlock[] = [];
  let skipped = 0;
  for (const { block, parentId } of input) {
    const raw = block[block.type] as Record<string, unknown> | undefined;
    const text = parts(block).map((p) => p.plain_text ?? "").join("").slice(0, 20_000);
    const inline = parts(block).filter(p => p.plain_text).map(p => ({
      text: p.plain_text!.slice(0, 20_000),
      ...(p.href && /^https?:\/\//.test(p.href) ? { href: p.href } : {}),
      ...(p.annotations ? { marks: {
        ...(p.annotations.bold ? { bold: true } : {}),
        ...(p.annotations.italic ? { italic: true } : {}),
        ...(p.annotations.underline ? { underline: true } : {}),
        ...(p.annotations.strikethrough ? { strike: true } : {}),
        ...(p.annotations.code ? { code: true } : {}),
      } } : {}),
    }));
    const common = { id: block.id.replace(/-/g, ""), ...(parentId ? { parentId: parentId.replace(/-/g, "") } : {}), citations: [], conceptIds: [] };
    const content = { ...common, text, ...(inline.length ? { inline } : {}) };
    let item: LessonBlock | null = null;
    switch (block.type) {
      case "paragraph": item = { ...content, type: "paragraph" }; break;
      case "heading_1": item = { ...content, type: "heading", level: 1 }; break;
      case "heading_2": item = { ...content, type: "heading", level: 2 }; break;
      case "heading_3": item = { ...content, type: "heading", level: 3 }; break;
      case "bulleted_list_item": item = { ...content, type: "list", style: "bullet" }; break;
      case "numbered_list_item": item = { ...content, type: "list", style: "number" }; break;
      case "to_do": item = { ...content, type: "list", style: "check", checked: raw?.checked === true }; break;
      case "quote": item = { ...content, type: "quote" }; break;
      case "toggle": item = { ...content, type: "toggle" }; break;
      case "callout": item = { ...content, type: "callout", tone: "info" }; break;
      case "code": item = { ...content, type: "code", language: typeof raw?.language === "string" ? raw.language : "plain text" }; break;
      case "divider": item = { ...common, type: "divider" }; break;
      default: skipped++; break; // Assets need Chaos source records; never invent them.
    }
    if (item) blocks.push(item);
  }
  return { document: { schemaVersion: 1, blocks }, skipped };
}