import type { Block } from "@/lib/learn/doc";

/** Synthetic BlockNote JSON, not the normalized backend fixture in content.ts. */
export function lessonEditorContent(
  count: number,
  language: "en" | "ar" = "en",
): Block[] {
  if (!Number.isInteger(count) || count < 1)
    throw new Error("Use a positive block count");
  const text = (i: number) =>
    language === "ar"
      ? `فقرة ${i}: الضغط والدورة الدموية — pressure 120/80.`
      : `Paragraph ${i}: pressure and circulation — الضغط 120/80.`;
  const blocks: Block[] = [];
  for (let i = 0; i < count; i++) {
    const block: Block = {
      id: `editor_${i}`,
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: text(i), styles: {} }],
      children: [],
    };
    // First block stays a paragraph so every size measures the same insertion.
    switch (i % 20) {
      case 1:
        block.type = "heading";
        block.props = { level: 2 };
        break;
      case 2:
        block.type = "bulletListItem";
        break;
      case 3:
        block.type = "checkListItem";
        block.props = { checked: true };
        break;
      case 4:
        block.type = "callout";
        block.props = { tone: "info" };
        break;
      case 5:
        block.type = "equation";
        block.content = [{ type: "text", text: "P = Q R", styles: {} }];
        break;
      case 6:
        block.type = "image";
        block.props = {
          url: "https://example.com/figure.png",
          alt: text(i),
          caption: "Synthetic figure",
          credit: "Synthetic fixture",
          annotations: "",
        };
        block.content = undefined;
        break;
      case 7:
        block.type = "youtube";
        block.props = {
          videoId: "dQw4w9WgXcQ",
          start: 12,
          end: 30,
          caption: "Synthetic video",
        };
        block.content = undefined;
        break;
      case 8:
        block.type = "source";
        block.props = { sourceId: "synthetic_source", locator: "page 23" };
        block.content = undefined;
        break;
      case 9:
        block.type = "lessonDiagram";
        block.props = { text: "flowchart LR\n  A[Pressure] --> B[Flow]" };
        block.content = undefined;
        break;
      case 10:
        block.type = "table";
        block.content = {
          type: "tableContent",
          rows: [
            {
              cells: [
                {
                  type: "tableCell",
                  content: [{ type: "text", text: "Pressure", styles: {} }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "text", text: "120/80", styles: {} }],
                },
              ],
            },
          ],
        };
        break;
      case 11:
        block.type = "lessonQuiz";
        block.props = {
          assetKind: "form",
          assetId: "synthetic_quiz",
          required: true,
        };
        block.content = undefined;
        break;
      case 12:
        block.type = "lessonFlashcards";
        block.props = { setId: "synthetic_deck", required: true };
        block.content = undefined;
        break;
      case 13:
        block.content = [
          { type: "text", text: text(i), styles: { bold: true } },
          {
            type: "link",
            href: "https://example.com/reference",
            content: [{ type: "text", text: "Reference", styles: {} }],
          },
          {
            type: "citation",
            props: { sourceId: "synthetic_source", locator: "page 23" },
          },
        ];
        break;
      case 14:
        block.type = "toggleListItem";
        break;
      case 15:
        // Count children in the requested total, rather than hiding extra blocks.
        if (blocks.at(-1)?.type === "toggleListItem") {
          blocks.at(-1)!.children!.push(block);
          continue;
        }
        break;
      case 16:
        block.type = "divider";
        block.content = undefined;
        break;
      case 17:
        block.type = "quote";
        break;
      case 18:
        block.type = "codeBlock";
        block.props = { language: "text" };
        break;
      case 19:
        block.type = "numberedListItem";
        break;
    }
    blocks.push(block);
  }
  return blocks;
}
