import { expect, it } from "vitest";
import { legacyFlashcardBlocks } from "@/lib/learn/inlineStudy";
it("keeps legacy decks without duplicating nested inline references", () => {
  const content = [{ id: "p", type: "paragraph", props: {}, children: [{ id: "cards", type: "lessonFlashcards", props: { setId: "first" }, children: [] }] }];
  expect(legacyFlashcardBlocks(content, [{ setId: "first" }, { setId: "second" }, { setId: "second" }])).toEqual([{ id: "legacy_flashcards_0", type: "lessonFlashcards", props: { setId: "second" }, children: [] }]);
  expect(content[0].children).toHaveLength(1);
});
it("understands generic adapter payloads and avoids collisions with real blocks", () => {
  const content = [{ id: "legacy_flashcards_0", type: "flashcards", props: { lessonData: JSON.stringify({ setId: "first" }) }, children: [] }];
  expect(legacyFlashcardBlocks(content, [{ setId: "first" }, { setId: "second" }])[0].id).toBe("legacy_flashcards_0_");
  expect(legacyFlashcardBlocks(content, [])).toEqual([]);
});

it("detects nested inline quizzes of both kinds without conflating IDs", async () => {
  const { inlineQuizKeys } = await import("@/lib/learn/inlineStudy");
  const content = [{ id: "p", type: "paragraph", props: {}, children: [
    { id: "q1", type: "lessonQuiz", props: { assetKind: "form", assetId: "same" }, children: [] },
    { id: "q2", type: "quiz", props: { lessonData: JSON.stringify({ asset: { kind: "quiz", id: "same" } }) }, children: [] },
    { id: "q3", type: "lessonQuiz", props: { assetKind: "form", assetId: "" }, children: [] },
  ] }];
  expect([...inlineQuizKeys(content)]).toEqual(["form:same", "quiz:same"]);
});
