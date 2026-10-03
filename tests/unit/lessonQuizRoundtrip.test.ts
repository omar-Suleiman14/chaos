import { expect, it } from "vitest";
import {
  fromDurableDocument,
  toDurableDocument,
} from "@/lib/learn/chaosDocument";
it("keeps quiz blocks as editable inline blocks through a save roundtrip", () => {
  const document = {
    schemaVersion: 1 as const,
    blocks: [
      {
        id: "q",
        type: "quiz" as const,
        asset: { kind: "form" as const, id: "form-id" as never },
        citations: [],
        conceptIds: [],
      },
    ],
  };
  const editor = fromDurableDocument(document);
  expect(editor[0].type).toBe("lessonQuiz");
  expect(toDurableDocument(editor, document)).toEqual(document);
});
it("saves a newly inserted classic quiz and changes its selected asset", () => {
  const editor = [
    {
      id: "new-quiz",
      type: "lessonQuiz",
      props: { assetKind: "quiz", assetId: "classic-id" },
      children: [],
    },
  ];
  expect(toDurableDocument(editor).blocks[0]).toMatchObject({
    id: "new-quiz",
    type: "quiz",
    asset: { kind: "quiz", id: "classic-id" },
  });
  editor[0].props = { assetKind: "form", assetId: "different-form" };
  expect(toDurableDocument(editor).blocks[0]).toMatchObject({
    asset: { kind: "form", id: "different-form" },
  });
});
