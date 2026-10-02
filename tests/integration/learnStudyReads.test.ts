/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { studyReads, StudyClient } from "../../lib/learn/studyClient";
import type { ConvexReactClient } from "convex/react";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
const modules = import.meta.glob("../../convex/**/*.*s");
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    for (const identity of [creatorIdentity, otherCreatorIdentity]) await ctx.db.insert("users", { clerkId: identity.subject, name: identity.name, email: identity.email, username: identity.nickname, createdAt: 0 });
  });
  const owner = t.withIdentity(creatorIdentity), reader = t.withIdentity(otherCreatorIdentity);
  const ids = await t.run(async ctx => {
    const definition = emptyDefinition("Published quiz"); definition.quiz = { enabled: true };
    definition.fields = [{ id: "q", type: "choice", label: "Q", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 1, explanation: "PRIVATE KEY" } }];
    const formId = await ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: "Draft edits", shareId: "study-public", status: "live", draft: definition, draftRevision: 2, settings: defaultFormSettings, responseCount: 0, partialCount: 0, publishedVersion: 1, createdAt: 0, updatedAt: 0 });
    const versionId = await ctx.db.insert("formVersions", { formId, version: 1, definition, publishedAt: 1, publishedBy: "Owner", draftRevision: 1 });
    const conceptId = await ctx.db.insert("learnConcepts", { title: "Cells", slug: "cells", description: "", createdBy: "admin" });
    return { formId, versionId, conceptId };
  });
  return { t, owner, reader, ...ids };
}
describe("durable study UI reads", () => {
  it("persists pending minimal claims and exposes only reviewed unexpired public badge facts", async () => {
    const { owner, t } = await setup();
    const client = new StudyClient(owner as unknown as Pick<ConvexReactClient, "query" | "mutation">);
    const claimId = await client.claimIdentity("student", "University");
    const claims = await owner.query(api.learnCommunity.getMyClaims, {}); expect(claims[0]._id).toBe(claimId); expect(claims[0].status).toBe("pending");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
    try {
      expect(await t.query(studyReads.publicIdentity, { username: creatorIdentity.nickname })).toEqual([]);
      const expiresAt = Date.now() + 10000;
      await t.run(ctx => ctx.db.patch("learnIdentityClaims", claimId, { status: "verified", method: "manual_review", reviewedBy: "reviewer", expiresAt }));
      expect(await t.query(studyReads.publicIdentity, { username: creatorIdentity.nickname })).toEqual([{ kind: "student", expiresAt }]);
      await t.run(ctx => ctx.db.patch("learnIdentityClaims", claimId, { expiresAt: Date.now() - 1 }));
      expect(await t.query(studyReads.publicIdentity, { username: creatorIdentity.nickname })).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  });
  it("saves attachments atomically, refuses other actors and stale panels", async () => {
    const { owner, reader, formId } = await setup();
    const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Lesson", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Content", citations: [], conceptIds: [] }] } });
    const input = { lessonId, expected: [], attachments: [{ id: formId, label: "Practice", order: 0 }] };
    await expect(reader.mutation(studyReads.saveFormAttachments, input)).rejects.toThrow(/unauthorized|owner/);
    await owner.mutation(studyReads.saveFormAttachments, input);
    const rows = await owner.query(api.learnCollections.listAssessments, { lessonId }); expect(rows).toHaveLength(1); expect(rows[0].asset.id).toBe(formId);
    await expect(owner.mutation(studyReads.saveFormAttachments, input)).rejects.toThrow("changed elsewhere");
    await owner.mutation(studyReads.saveFormAttachments, { lessonId, expected: input.attachments, attachments: [] });
    expect(await owner.query(api.learnCollections.listAssessments, { lessonId })).toEqual([]);
  });
  it("creates a real immutable draft and lineage through the study client without exposing keys", async () => {
    const { t, reader, formId, versionId } = await setup();
    expect(await reader.query(studyReads.forkSource, { asset: { kind: "form", id: formId } })).toEqual({ formVersionId: versionId });
    const client = new StudyClient(reader as unknown as Pick<ConvexReactClient, "query" | "mutation">);
    const id = await client.forkQuiz(formId);
    expect(id).not.toBe(formId);
    const lineage = await reader.query(api.quizForks.getLineage, { asset: { kind: "form", id: id as typeof formId } });
    expect(lineage?.parentVersion).toEqual({ kind: "form", id: versionId }); expect(lineage?.parent).toEqual({ kind: "form", id: formId });
    await t.run(async ctx => { const draft = await ctx.db.get("forms", id as typeof formId); expect(draft?.status).toBe("draft"); expect(draft?.draft.title).toBe("Published quiz (fork)"); });
  });
  it("rejects anonymous/private sources and resolves owned practice links only", async () => {
    const { t, owner, reader, formId } = await setup();
    await expect(t.query(studyReads.forkSource, { asset: { kind: "form", id: formId } })).rejects.toThrow("authenticated");
    expect(await reader.query(studyReads.practiceLink, { formId, version: 1 })).toBeNull();
    expect(await owner.query(studyReads.practiceLink, { formId, version: 1 })).toEqual({ title: "Published quiz", href: "/f/study-public" });
    await t.run(ctx => ctx.db.patch("forms", formId, { settings: { ...defaultFormSettings, access: "signed_in" } }));
    expect(await reader.query(studyReads.forkSource, { asset: { kind: "form", id: formId } })).toBeNull();
    expect(await owner.query(studyReads.practiceLink, { formId, version: 2 })).toBeNull();
  });
  it("discovers only own ingested concept names, never raw answers or invented states", async () => {
    const { t, owner, reader, formId, conceptId } = await setup();
    await t.run(async ctx => {
      const responseId = await ctx.db.insert("formResponses", { formId, version: 1, status: "completed", answers: { q: "b" }, respondentId: creatorIdentity.subject, language: "en", submissionKey: crypto.randomUUID(), receiptCode: "receipt", startedAt: Date.now() - 1000, submittedAt: Date.now(), updatedAt: Date.now(), reviewed: false, tags: [], spam: false, searchText: "" });
      await ctx.db.insert("learnPracticeEvidence", { userId: creatorIdentity.tokenIdentifier, formResponseId: responseId, formId, version: 1, fieldId: "q", conceptId, earned: 0, possible: 1, answeredAt: Date.now(), responseUpdatedAt: Date.now() });
    });
    expect(await owner.query(studyReads.myConcepts, {})).toEqual({ concepts: [{ id: conceptId, title: "Cells" }], truncated: false });
    expect(await reader.query(studyReads.myConcepts, {})).toEqual({ concepts: [], truncated: false });
    const states = await owner.query(api.learnPractice.conceptStates, { conceptIds: [conceptId], now: Date.now() });
    expect(states[0].state).toBe("insufficient"); expect(states[0].attempts).toBe(1);
  });
});
