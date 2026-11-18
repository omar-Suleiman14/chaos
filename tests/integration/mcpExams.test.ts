import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const owner = creatorIdentity.subject;
const other = otherCreatorIdentity.subject;
const mutation = (name: string) => makeFunctionReference<"mutation">("mcpExams:" + name);
const query = (name: string) => makeFunctionReference<"query">("mcpExams:" + name);

describe("course exam MCP backend", () => {
  it("creates only private drafts, checks course ownership, revision and snapshot completeness", async () => {
    const t = createTestConvex();
    await t.mutation(internal.mcp.begin, { userId: owner, profile: { name: "Doctor", email: creatorIdentity.email } });
    await t.mutation(internal.mcp.begin, { userId: other, profile: { name: "Other", email: otherCreatorIdentity.email } });
    const { courseId } = await t.mutation(makeFunctionReference<"mutation">("mcpCourses:create"), { userId: owner, title: "MCP Exam Course", language: "en" });
    const { draftId, revision } = await t.mutation(mutation("create"), { userId: owner, courseId, title: "Private Test" });
    expect(revision).toBe(0);
    expect((await t.query(query("list"), { userId: owner, courseId })).exams).toHaveLength(1);
    expect((await t.query(query("get"), { userId: owner, draftId })).title).toBe("Private Test");
    await expect(t.query(query("get"), { userId: other, draftId })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.mutation(mutation("create"), { userId: other, courseId })).rejects.toThrow(/NOT_FOUND/);
    const allocations = [{ id: "whole_course", kind: "course", key: "", count: 1, points: 1 }];
    expect((await t.mutation(mutation("plan"), { userId: owner, draftId, expectedRevision: 0, title: "Single question", targetCount: 1, allocations })).revision).toBe(1);
    await expect(t.mutation(mutation("plan"), { userId: owner, draftId, expectedRevision: 0, title: "Stale", targetCount: 1, allocations })).rejects.toThrow(/REVISION_CONFLICT/);
    const p = await t.query(query("preview"), { userId: owner, draftId });
    expect(p.readyQuestions).toBe(0);
    await expect(t.mutation(mutation("autoFill"), { userId: owner, draftId, expectedRevision: 1 })).rejects.toThrow(/INSUFFICIENT_QUESTIONS/);
    await expect(t.mutation(mutation("seal"), { userId: owner, draftId, expectedRevision: 1 })).rejects.toThrow(/INCOMPLETE_EXAM/);
    expect((await t.query(query("getSettings"), { userId: owner, draftId })).snapshotId).toBeNull();
    expect((await t.query(query("getAudience"), { userId: owner, draftId })).entryEnabled).toBe(false);
    await expect(t.mutation(mutation("setEntry"), { userId: owner, draftId, expectedRevision: 0, enabled: true })).rejects.toThrow(/REVISION_CONFLICT/);
  });
});
