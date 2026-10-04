import { expect, it } from "vitest";
import { fromDurableDocument, toDurableDocument } from "@/lib/learn/chaosDocument";
import type { LessonDocument } from "@/convex/learnModel";
import type { Id } from "@/convex/_generated/dataModel";
it("preserves shared asset references and distinct block IDs across editor round trips", () => {
 const document: LessonDocument = { schemaVersion: 1, blocks: [
  { id: "cards_a", type: "flashcards", setId: "shared" as Id<"flashcardSets">, citations: [], conceptIds: [] },
  { id: "cards_b", type: "flashcards", setId: "shared" as Id<"flashcardSets">, citations: [], conceptIds: [], required: true },
  { id: "quiz_a", type: "quiz", asset: { kind: "form", id: "quiz" as Id<"forms"> }, citations: [], conceptIds: [] },
 ] };
 const result = toDurableDocument(fromDurableDocument(document), document);
 expect(result.blocks.map(b => b.id)).toEqual(["cards_a", "cards_b", "quiz_a"]);
 expect(result.blocks.filter(b => b.type === "flashcards").map(b => b.setId)).toEqual(["shared", "shared"]);
 expect(result.blocks[2]).toMatchObject({ asset: { kind: "form", id: "quiz" } });
});
