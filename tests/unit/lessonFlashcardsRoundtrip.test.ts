import { expect, it } from "vitest";
import { learnBlockSchema } from "@/lib/mcp/learn";
import { fromDurableDocument, toDurableDocument } from "@/lib/learn/chaosDocument";
import { editorBlocksToLessonDocument, lessonDocumentToEditorBlocks } from "@/lib/lessonBlockAdapter";
import type { LessonDocument } from "@/convex/learnModel";

const document: LessonDocument = { schemaVersion: 1, blocks: [
  { id: "before", type: "paragraph", text: "Explanation", citations: [], conceptIds: [] },
  { id: "cards", type: "flashcards", setId: "deck-id" as never, citations: [], conceptIds: [] },
  { id: "after", type: "paragraph", text: "Continue learning", citations: [], conceptIds: [] },
] };
it("preserves flashcard asset identity and its position in the lesson flow", () => {
  const editor = fromDurableDocument(document);
  expect(editor.map(b => b.type)).toEqual(["paragraph", "lessonFlashcards", "paragraph"]);
  expect(toDurableDocument(editor, document)).toEqual(document);
  const generic = lessonDocumentToEditorBlocks(document);
  if (!generic.ok) throw new Error("Invalid document");
  expect(editorBlocksToLessonDocument(generic.value)).toEqual({ ok: true, value: document, problems: [] });
});
it("saves new and changed references without copying cards", () => {
  const blocks = [{ id: "new", type: "lessonFlashcards", props: { setId: "first" }, children: [] }];
  expect(toDurableDocument(blocks).blocks[0]).toMatchObject({ type: "flashcards", setId: "first" });
  blocks[0].props.setId = "second";
  expect(toDurableDocument(blocks).blocks[0]).toMatchObject({ setId: "second" });
  blocks[0].props.setId = "";
  expect(() => toDurableDocument(blocks)).toThrow();
});

it("accepts the same flashcard contract through MCP", () => {
  expect(learnBlockSchema.parse(document.blocks[1])).toEqual(document.blocks[1]);
});
