import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

it("preserves caller-specific windows, post-window spam filtering, version pooling and small-cell suppression", async () => {
  const t = createTestConvex();
  const formId = await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: creatorIdentity.subject, username: creatorIdentity.nickname, name: creatorIdentity.name, email: creatorIdentity.email, createdAt: 0 });
    const definition = { ...emptyDefinition("Synthetic sampling"), quiz: { enabled: true }, fields: [
      { id: "note", type: "textarea" as const, label: "Note", required: false },
      { id: "q", type: "choice" as const, label: "Choice", required: false, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 1 } },
    ] };
    const id = await ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: definition.title, shareId: "synthetic-sampling", status: "live", draft: definition, draftRevision: 2, settings: defaultFormSettings, publishedVersion: 2, responseCount: 2000, partialCount: 3, createdAt: 0, updatedAt: 0 });
    for (const version of [1, 2]) await ctx.db.insert("formVersions", { formId: id, version, definition, publishedAt: version, publishedBy: creatorIdentity.subject, draftRevision: version });
    for (let i = 0; i < 2001; i++) await ctx.db.insert("formResponses", { formId: id, version: i % 2 + 1, status: "completed", answers: { note: `note-${i}`, q: "a" }, language: i % 2 ? "ar" : "en", submissionKey: `synthetic-${i}`, receiptCode: `synthetic-${i}`, startedAt: i, submittedAt: i, updatedAt: i, reviewed: false, tags: [], spam: i === 2000, searchText: "", quizScore: 1, quizMaxScore: 1 });
    for (let i = 0; i < 3; i++) await ctx.db.insert("formResponses", { formId: id, version: 2, status: "partial", answers: {}, language: "en", submissionKey: `partial-${i}`, receiptCode: `partial-${i}`, startedAt: 3000 + i, submittedAt: 3000 + i, updatedAt: 3000 + i, lastFieldId: "note", reviewed: false, tags: [], spam: false, searchText: "" });
    return id;
  });
  const owner = t.withIdentity(creatorIdentity);
  const analysis = (await owner.query(api.formResults.getAnalysis, { formId }))!;
  expect(analysis).toMatchObject({ responseCount: 2000, partialCount: 3, sampled: 1999, sampleLimited: true, quiz: { graded: 1999 } });
  const note = analysis.fields.find(field => field.fieldId === "note")!;
  expect(note).toMatchObject({ textCount: 1999, stoppedAfter: 3 });
  expect(note.texts?.map(row => row.text)).toEqual(["note-1999", "note-1998", "note-1997", "note-1996", "note-1995"]);
  const texts = (await owner.query(api.formResults.getTextAnswers, { formId, fieldId: "note" }))!;
  expect(texts.map(row => row.text)).toEqual(Array.from({ length: 200 }, (_, i) => `note-${1999 - i}`));
  const mcp = await t.query(internal.mcp.getResults, { userId: creatorIdentity.subject, id: `form_${formId}` });
  expect(mcp).toMatchObject({ responses: 2000, unfinished: 3, quiz: { graded: 999, averageScore: 1, averagePercent: 100 } });
  const cross = await owner.query(api.formSegmentAnalysis.crossTab, { formId, version: 2, segment: { kind: "status" }, compare: { kind: "language" } });
  expect(cross).toEqual({ evidence: { windowLimit: 500, windowLimited: true, minimumCell: 5, version: 2 }, suppressed: true, cells: [] });
  expect(await t.withIdentity(otherCreatorIdentity).query(api.formResults.getAnalysis, { formId })).toBeNull();
  expect(await t.withIdentity(otherCreatorIdentity).query(api.formSegmentAnalysis.crossTab, { formId, version: 2, segment: { kind: "status" }, compare: { kind: "language" } })).toBeNull();
  await expect(t.query(internal.mcp.getResults, { userId: otherCreatorIdentity.subject, id: `form_${formId}` })).rejects.toThrow("NOT_FOUND");
});
