/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, it, expect } from "vitest";
import base from "../../convex/schema";

import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
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
      studentId: "student",
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
      s.other.mutation(ref("recordAttempt"), {
        attemptId,
        responseId: await s.response(),
      }),
    ).rejects.toThrow("Own attempt");
  });
  it("server grades once; edits and retries cannot change evidence; caps attempts", async () => {
    const s = await setup();
    await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), {
      assignmentId: s.assignmentId,
    });
    expect(
      await s.student.mutation(ref("startAttempt"), {
        assignmentId: s.assignmentId,
      }),
    ).toBe(attemptId);
    const responseId = await s.response();
    await s.student.mutation(ref("recordAttempt"), { attemptId, responseId });
    await s.t.run((ctx) =>
      ctx.db.patch(responseId, {
        answers: { q: "b" },
        editCount: 1,
        editedAt: Date.now(),
      }),
    );
    await s.student.mutation(ref("recordAttempt"), { attemptId, responseId });
    const result = await s.student.query(read("myProgress"), {
      assignmentId: s.assignmentId,
    });
    expect(result[0].score).toBe(2);
    expect(result[0].maxScore).toBe(2);
    expect(
      await s.other.query(read("myProgress"), { assignmentId: s.assignmentId }),
    ).toEqual([]);
    await expect(
      s.other.query(read("report"), {
        assignmentId: s.assignmentId,
        studentId: "student",
      }),
    ).rejects.toThrow("owner");
    await expect(
      s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId }),
    ).rejects.toThrow("limit");
  });
  it("rejects late and edited initial records", async () => {
    const s = await setup();
    await s.enroll();
    const attemptId = await s.student.mutation(ref("startAttempt"), {
      assignmentId: s.assignmentId,
    });
    const responseId = await s.response();
    await s.t.run((ctx) =>
      ctx.db.patch(responseId, { submittedAt: Date.now() + 120000 }),
    );
    await expect(
      s.student.mutation(ref("recordAttempt"), { attemptId, responseId }),
    ).rejects.toThrow("window");
    await s.t.run((ctx) =>
      ctx.db.patch(responseId, { submittedAt: Date.now(), editCount: 1 }),
    );
    await expect(
      s.student.mutation(ref("recordAttempt"), { attemptId, responseId }),
    ).rejects.toThrow("edited");
    await s.host.mutation(ref("setClosed"), {
      assignmentId: s.assignmentId,
      closed: true,
    });
    await expect(
      s.student.mutation(ref("startAttempt"), { assignmentId: s.assignmentId }),
    ).rejects.toThrow("open");
  });
});
