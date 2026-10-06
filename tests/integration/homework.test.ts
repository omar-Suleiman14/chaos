/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, it, expect } from "vitest";
import base from "../../convex/schema";

import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { readFormCounts } from "@/convex/formCounts";
const schema = base;
const modules = import.meta.glob("../../convex/**/*.*s");
const ref = (name: string) =>
  makeFunctionReference<"mutation">(`homework:${name}`);
const read = (name: string) =>
  makeFunctionReference<"query">(`homework:${name}`);
async function setup() {
  const t = convexTest(schema, modules);
  const identity = (subject: string) => ({
    subject,
    issuer: "https://test",
    tokenIdentifier: `https://test|${subject}`,
  });
  const host = t.withIdentity(identity("host")),
    student = t.withIdentity(identity("student")),
    other = t.withIdentity(identity("other"));
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: "student",
      name: "Student",
      email: "s@test.com",
      username: "student",
      createdAt: now,
    });
    const definition = emptyDefinition("Quiz");
    definition.quiz = { enabled: true };
    definition.fields = [
      {
        id: "q",
        type: "choice",
        label: "Q",
        required: true,
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        quiz: { correctOptionIds: ["a"], points: 2 },
      },
    ];
    const formId = await ctx.db.insert("forms", {
      ownerId: "host",
      title: "Quiz",
      shareId: "quiz",
      status: "live",
      draft: definition,
      draftRevision: 1,
      settings: defaultFormSettings,
      publishedVersion: 1,
      responseCount: 0,
      partialCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const versionId = await ctx.db.insert("formVersions", {
      formId,
      version: 1,
      definition,
      publishedAt: now,
      publishedBy: "host",
      draftRevision: 1,
    });
    return { formId, versionId };
  });
  const assignmentId = await host.mutation(ref("create"), {
    ...ids,
    title: "Homework",
    opensAt: now - 1000,
    deadline: now + 60000,
    maxAttempts: 1,
  });
  const enroll = () =>
    host.mutation(ref("enroll"), {
      assignmentId,
      email: "s@test.com",
      active: true,
    });
  const response = () =>
    t.run((ctx) =>
      ctx.db.insert("formResponses", {
        formId: ids.formId,
        version: 1,
        respondentId: "student",
        status: "completed",
        answers: { q: "a" },
        language: "en",
        submissionKey: crypto.randomUUID(),
        receiptCode: "r",
        startedAt: Date.now(),
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        reviewed: false,
        tags: [],
        spam: false,
        searchText: "",
        quizScore: 999,
      }),
    );
  return { t, host, student, other, assignmentId, enroll, response };
}
describe("homework", () => {
  it("uploads pinned private homework files with owned receipts and rechecks enrollment", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    await s.t.run(async ctx => {
      const a = (await ctx.db.get("homeworkAssignments", s.assignmentId))!;
      const version = (await ctx.db.get("formVersions", a.versionId))!;
      await ctx.db.patch("formVersions", version._id, { definition: { ...version.definition, fields: [...version.definition.fields, { id: "file", type: "file", label: "Work", required: true, max: 1 }] } });
      await ctx.db.patch("forms", a.formId, { status: "draft", publishedVersion: 2 });
    });
    await expect(s.other.mutation(ref("generateUploadUrl"), { attemptId, fieldId: "file" })).rejects.toThrow("Own attempt");
    await expect(s.student.mutation(ref("generateUploadUrl"), { attemptId, fieldId: "q" })).rejects.toThrow("INVALID_FIELD");
    const url = await s.student.mutation(ref("generateUploadUrl"), { attemptId, fieldId: "file" });
    const token = new URL(url.slice(url.indexOf("/forms/upload")), "https://test").searchParams.get("ticket")!;
    const check = makeFunctionReference<"query">("respond:checkUploadTicket");
    const record = makeFunctionReference<"mutation">("respond:recordUpload");
    expect(await s.student.query(check, { token, now: Date.now() })).toBe(true);
    expect(await s.other.query(check, { token, now: Date.now() })).toBe(false);
    const storageId = await s.t.run(ctx => ctx.storage.store(new Blob(["work"], { type: "text/plain" })));
    await expect(s.student.mutation(record, { token, storageId, name: "work.txt", contentType: "text/plain", size: 999 })).rejects.toThrow("UPLOAD_INVALID");
    for (const invalid of [{ contentType: "application/x-executable", size: 4 }, { contentType: "text/plain", size: 0 }, { contentType: "text/plain", size: 11 * 1024 * 1024 }]) {
      await expect(s.student.mutation(record, { token, storageId, name: "work.txt", ...invalid })).rejects.toThrow("UPLOAD_INVALID");
    }
    const receipt = await s.student.mutation(record, { token, storageId, name: "work.txt", contentType: "text/plain", size: 4 });
    await expect(s.student.mutation(record, { token, storageId, name: "work.txt", contentType: "text/plain", size: 4 })).rejects.toThrow("UPLOAD_TICKET_INVALID");
    const submit = (files: string[]) => s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a", file: files }, language: "en" });
    await expect(submit([storageId])).rejects.toThrow("receipt");
    await s.t.run(ctx => ctx.db.patch("formUploads", receipt.uploadId, { homeworkAttemptId: undefined }));
    await expect(submit([receipt.uploadId])).rejects.toThrow("receipt");
    await s.t.run(ctx => ctx.db.patch("formUploads", receipt.uploadId, { homeworkAttemptId: attemptId }));
    await expect(submit([receipt.uploadId, receipt.uploadId])).rejects.toThrow("file count");
    await s.host.mutation(ref("enroll"), { assignmentId: s.assignmentId, studentId: "student", active: false });
    await expect(submit([receipt.uploadId])).rejects.toThrow("enrollment");
    await s.enroll();
    const result = await submit([receipt.uploadId]);
    expect(result.score).toBe(2);
    expect(await s.t.run(ctx => ctx.db.get("formUploads", receipt.uploadId))).toMatchObject({ responseId: result.responseId, homeworkAttemptId: attemptId });
    expect(await s.student.query(check, { token, now: Date.now() })).toBe(false);
  });
  it("revokes pending upload tickets at deadline and on unenrollment", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    await s.t.run(async ctx => {
      const a = (await ctx.db.get("homeworkAssignments", s.assignmentId))!;
      const version = (await ctx.db.get("formVersions", a.versionId))!;
      await ctx.db.patch("formVersions", version._id, { definition: { ...version.definition, fields: [...version.definition.fields, { id: "file", type: "file", label: "Work", required: false }] } });
    });
    const url = await s.student.mutation(ref("generateUploadUrl"), { attemptId, fieldId: "file" });
    const token = new URL(url.slice(url.indexOf("/forms/upload")), "https://test").searchParams.get("ticket")!;
    const check = makeFunctionReference<"query">("respond:checkUploadTicket");
    await s.host.mutation(ref("enroll"), { assignmentId: s.assignmentId, studentId: "student", active: false });
    expect(await s.student.query(check, { token, now: Date.now() })).toBe(false);
    await s.enroll();
    await s.t.run(ctx => ctx.db.patch("homeworkAssignments", s.assignmentId, { deadline: Date.now() - 1 }));
    expect(await s.student.query(check, { token, now: Date.now() })).toBe(false);
  });

  it("submits and grades the pinned version after republishing, once only", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    await s.t.run(async ctx => {
      const a = (await ctx.db.get("homeworkAssignments", s.assignmentId))!;
      const v = (await ctx.db.get("formVersions", a.versionId))!;
      const changed = { ...v.definition, fields: v.definition.fields.map(f => ({ ...f, quiz: { correctOptionIds: ["b"], points: 100 } })) };
      await ctx.db.insert("formVersions", { formId: a.formId, version: 2, definition: changed, publishedAt: Date.now(), publishedBy: "host", draftRevision: 2 });
      await ctx.db.patch("forms", a.formId, { publishedVersion: 2, draft: changed });
    });
    const result = await s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" });
    expect(result).toMatchObject({ score: 2, maxScore: 2, duplicate: false });
    await s.host.mutation(ref("setClosed"), { assignmentId: s.assignmentId, closed: true });
    const retry = await s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "b" }, language: "en" });
    expect(retry).toEqual({ ...result, duplicate: true });
    const saved = await s.t.run(ctx => ctx.db.get("formResponses", result.responseId));
    expect(saved).toMatchObject({ version: 1, answers: { q: "a" }, quizScore: 2, respondentId: "student" });
    const count = await s.t.run(async ctx => (await readFormCounts(ctx, (await ctx.db.get("forms", saved!.formId))!)).responseCount);
    expect(count).toBe(1);
    await expect(s.other.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" })).rejects.toThrow("Own attempt");
  });
  it("refuses invalid answers, revoked enrollment and late pinned submissions without writes", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    await expect(s.student.mutation(ref("submitAttempt"), { attemptId, answers: {}, language: "en" })).rejects.toThrow("VALIDATION_FAILED");
    await expect(s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "forged" }, language: "en" })).rejects.toThrow("VALIDATION_FAILED");
    await s.host.mutation(ref("enroll"), { assignmentId: s.assignmentId, studentId: "student", active: false });
    await expect(s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" })).rejects.toThrow("enrollment");
    await s.enroll();
    await s.t.run(ctx => ctx.db.patch("homeworkAssignments", s.assignmentId, { deadline: Date.now() - 1 }));
    await expect(s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" })).rejects.toThrow("not open");
    const attempt = await s.t.run(ctx => ctx.db.get("homeworkAttempts", attemptId));
    expect(attempt!.responseId).toBeUndefined();
  });
  it("delivers only the pinned version without keys after the form is republished", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    await s.t.run(async ctx => {
      const assignment = (await ctx.db.get("homeworkAssignments", s.assignmentId))!;
      const version = (await ctx.db.get("formVersions", assignment.versionId))!;
      const newer = { ...version.definition, title: "New unrelated quiz", fields: [] };
      await ctx.db.insert("formVersions", { formId: assignment.formId, version: 2, definition: newer, publishedAt: Date.now(), publishedBy: "host", draftRevision: 2 });
      await ctx.db.patch("forms", assignment.formId, { publishedVersion: 2, draft: newer });
      await ctx.db.patch("formVersions", version._id, { definition: { ...version.definition, fields: version.definition.fields.map(f => ({ ...f, options: f.options?.map(o => ({ ...o, score: 99 })), quiz: { correctOptionIds: ["a"], points: 2, explanation: "SECRET_EXPLANATION" } })) } });
    });
    const result = await s.student.query(read("getAttemptDefinition"), { attemptId });
    expect(result.version).toBe(1); expect(result.definition.title).toBe("Quiz");
    expect(result.definition.fields[0].quiz).toBeUndefined();
    expect(result.definition.fields[0].options[0].score).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("SECRET_EXPLANATION");
    expect(result.attemptsRemaining).toBe(0);
    await expect(s.other.query(read("getAttemptDefinition"), { attemptId })).rejects.toThrow("Own attempt");
    await expect(s.t.query(read("getAttemptDefinition"), { attemptId })).rejects.toThrow("authenticated");
  });
  it("revokes delivery on unenrollment, closure, deadline and exhausted/completed attempts", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    await s.host.mutation(ref("enroll"), { assignmentId: s.assignmentId, studentId: "student", active: false });
    await expect(s.student.query(read("getAttemptDefinition"), { attemptId })).rejects.toThrow("enrollment");
    await s.enroll();
    for (const patch of [{ closed: true }, { deadline: Date.now() - 1 }, { opensAt: Date.now() + 100000 }, { maxAttempts: 0 }]) {
      const original = await s.t.run(ctx => ctx.db.get("homeworkAssignments", s.assignmentId));
      await s.t.run(ctx => ctx.db.patch("homeworkAssignments", s.assignmentId, patch));
      await expect(s.student.query(read("getAttemptDefinition"), { attemptId })).rejects.toThrow();
      await s.t.run(ctx => ctx.db.patch("homeworkAssignments", s.assignmentId, { closed: original!.closed, deadline: original!.deadline, opensAt: original!.opensAt, maxAttempts: original!.maxAttempts }));
    }
    await s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" });
    await expect(s.student.query(read("getAttemptDefinition"), { attemptId })).rejects.toThrow("Attempt unavailable");
  });
  it("does not deliver unreleased fields or moderated content", async () => {
    const s = await setup(); await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    const formId = await s.t.run(async ctx => {
      const a = (await ctx.db.get("homeworkAssignments", s.assignmentId))!;
      const version = (await ctx.db.get("formVersions", a.versionId))!;
      await ctx.db.patch("formVersions", version._id, { definition: { ...version.definition, fields: version.definition.fields.map(f => ({ ...f, releasesAt: Date.now() + 30000 })) } });
      return a.formId;
    });
    const delivered = await s.student.query(read("getAttemptDefinition"), { attemptId });
    expect(delivered.definition.fields).toEqual([]); expect(delivered.nextFieldReleaseAt).toBeGreaterThan(delivered.serverTime);
    await s.t.run(ctx => ctx.db.patch("forms", formId, { isBanned: true }));
    await expect(s.student.query(read("getAttemptDefinition"), { attemptId })).rejects.toThrow("unavailable");
    await expect(s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId })).rejects.toThrow("unavailable");
  });
  it("requires host ownership and enrollment", async () => {
    const s = await setup();
    await expect(
      s.other.mutation(ref("enroll"), {
        assignmentId: s.assignmentId,
        studentId: "student",
        active: true,
      }),
    ).rejects.toThrow("owner");
    await expect(
      s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId }),
    ).rejects.toThrow("enrollment");
    await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), {
      assignmentId: s.assignmentId,
    });
    await expect(
      s.other.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" }),
    ).rejects.toThrow("Own attempt");
  });
  it("counts only the attempt's own submission and caps attempts", async () => {
    const s = await setup();
    await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId });
    expect(await s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId })).toBe(attemptId);
    // An ordinary form submission (e.g. a retry through the public link) is not homework evidence.
    await s.response();
    await s.student.mutation(ref("submitAttempt"), { attemptId, answers: { q: "a" }, language: "en" });
    const result = await s.student.query(read("myProgress"), { assignmentId: s.assignmentId });
    expect(result[0].score).toBe(2);
    expect(result[0].maxScore).toBe(2);
    expect(await s.other.query(read("myProgress"), { assignmentId: s.assignmentId })).toEqual([]);
    await expect(s.other.query(read("report"), { assignmentId: s.assignmentId, studentId: "student" })).rejects.toThrow("owner");
    await expect(s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId })).rejects.toThrow("limit");
  });
  it("refuses new attempts once closed, and only toggles students already enrolled by ID", async () => {
    const s = await setup();
    await expect(s.host.mutation(ref("enroll"), { assignmentId: s.assignmentId, studentId: "student", active: true })).rejects.toThrow("NOT_FOUND");
    await s.enroll();
    await s.host.mutation(ref("setClosed"), { assignmentId: s.assignmentId, closed: true });
    await expect(s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId })).rejects.toThrow("open");
  });
});
