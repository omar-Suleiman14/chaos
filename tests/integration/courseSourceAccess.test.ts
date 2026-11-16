import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api, internal } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
import { emptyDefinition } from "../../convex/formLogic";

afterEach(() => vi.unstubAllEnvs());

it("requires current course approval for source HTTP and MCP metadata reads", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex();
  const doctor = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const sourceId = await doctor.mutation(api.learnSources.create, {
    metadata: { kind: "reference", title: "Private course citation", origin: "test" },
    metadataVisibility: "public", contentVisibility: "public",
  });
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).not.toBeNull();
  const courseId = await doctor.mutation(api.courses.create, { title: "Source protection" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: {
    schemaVersion: 1, blocks: [{ id: "source", type: "source", sourceId, label: "Reading", citations: [], conceptIds: [] }],
  } });
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  expect(await student.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  expect(await t.query(internal.mcpLearn.getSourceMetadata, { userId: otherCreatorIdentity.subject, sourceId })).toBeNull();
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  const [request] = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  await doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
  expect(await student.query(api.learnSources.getMetadata, { sourceId })).not.toBeNull();
  await doctor.mutation(api.courses.setArchived, { courseId, archived: true });
  expect(await student.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  await doctor.mutation(api.courses.setArchived, { courseId, archived: false });
  expect(await student.query(api.learnSources.getMetadata, { sourceId })).not.toBeNull();
  await doctor.mutation(api.courses.unpublish, { courseId });
  expect(await student.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  // Removing unpublished draft content does not release the immutable citation.
  await doctor.mutation(api.courses.setOutline, { courseId, lessonIds: [] });
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  await t.run(ctx => ctx.db.patch("courseJoinRequests", request.id, { status: "removed" }));
  expect(await student.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
});

it("fails closed during legacy backfill and rebuilds associations idempotently", async () => {
  const t = createTestConvex();
  const courseId = await t.run(ctx => ctx.db.insert("learnCollections", {
    ownerId: "owner", metadata: { title: "Legacy", description: "", language: "en", tags: [] },
    items: [], revision: 0, visibility: "public", communityState: "ok", createdAt: 0, updatedAt: 0,
  }));
  const sourceId = await t.run(ctx => ctx.db.insert("learnSources", {
    ownerId: "owner", uploadedBy: "owner", metadata: { kind: "reference", title: "Independent", origin: "test" },
    metadataVisibility: "public", contentVisibility: "public", status: "active", createdAt: 0,
  }));
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).toBeNull();
  const backfill = makeFunctionReference<"mutation", Record<string, never>, null>("courseSourceAccess:backfill");
  await t.mutation(backfill, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.query(api.learnSources.getMetadata, { sourceId })).not.toBeNull();
  await t.mutation(backfill, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run(ctx => ctx.db.query("courseSourceMemberships").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.get("learnCollections", courseId))).not.toBeNull();
});

it("requires approval on direct course assessment links and rejects revoked submissions", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), doctor = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  await doctor.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const definition = emptyDefinition("Course assessment");
  definition.quiz = { enabled: true };
  definition.fields = [{ id: "answer", type: "choice", label: "Answer", required: true,
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], quiz: { correctOptionIds: ["yes"], points: 1 } }];
  const formId = await doctor.mutation(api.forms.createForm, { definition });
  const form = await doctor.query(api.forms.getFormForEditor, { formId });
  await doctor.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
  const shareId = form!.shareId;
  const courseId = await doctor.mutation(api.courses.create, { title: "Assessment course" });
  const lessonId = await doctor.mutation(api.courses.addLesson, { courseId });
  await doctor.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: {
    schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Lesson", citations: [], conceptIds: [] }],
  } });
  await doctor.mutation(api.courses.addAssessment, { courseId, asset: { kind: "form", id: formId } });
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  expect((await t.query(api.respond.getPublicForm, { shareId })).state).toBe("unavailable");
  expect((await student.query(api.respond.getPublicForm, { shareId })).state).toBe("unavailable");
  await student.mutation(api.courseJoinRequests.requestJoin, { courseId });
  const [request] = await doctor.query(api.courseJoinRequests.listPending, { courseId });
  await doctor.mutation(api.courseJoinRequests.decide, { requestId: request.id, approve: true });
  expect((await student.query(api.respond.getPublicForm, { shareId })).state).toBe("open");
  await doctor.mutation(api.courses.setArchived, { courseId, archived: true });
  expect((await student.query(api.respond.getPublicForm, { shareId })).state).toBe("unavailable");
  await doctor.mutation(api.courses.setArchived, { courseId, archived: false });
  expect((await student.query(api.respond.getPublicForm, { shareId })).state).toBe("open");
  await doctor.mutation(api.courses.unpublish, { courseId });
  expect((await student.query(api.respond.getPublicForm, { shareId })).state).toBe("unavailable");
  expect(await doctor.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
  await t.run(ctx => ctx.db.patch("courseJoinRequests", request.id, { status: "removed" }));
  await expect(student.mutation(api.respond.submitResponse, {
    shareId, submissionKey: "revoked-course-form", answers: { answer: "Denied" }, language: "en", final: true, startedAt: Date.now() - 60_000,
  })).rejects.toThrow("FORM_UNAVAILABLE");
});
