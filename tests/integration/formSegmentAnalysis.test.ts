/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import schema from "../../convex/schema";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { api } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.*s");
const cross = api.formSegmentAnalysis.crossTab;
const flow = api.formSegmentAnalysis.funnel;

async function setup(n = 20) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "owner" });
  const viewer = t.withIdentity({ subject: "viewer" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const formId = await t.run(async ctx => {
    const def = emptyDefinition("Segments");
    def.fields = [
      { id: "group", type: "choice", label: "Group", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
      { id: "number", type: "number", label: "Value", required: false },
      { id: "branch", type: "choice", label: "Branch", required: false, options: [{ id: "yes", label: "Yes" }], showIf: { match: "all", conditions: [{ fieldId: "group", op: "equals", value: "a" }] } },
    ];
    const id = await ctx.db.insert("forms", { ownerId: "owner", title: "Segments", shareId: "segments", status: "live", draft: def, draftRevision: 1, settings: defaultFormSettings, publishedVersion: 1, responseCount: n, partialCount: 0, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("formVersions", { formId: id, version: 1, definition: def, publishedAt: 1, publishedBy: "owner", draftRevision: 1 });
    await ctx.db.insert("formCollaborators", { formId: id, userId: "viewer", email: "v@test.com", role: "viewer", invitedBy: "owner", createdAt: 1 });
    for (let i = 0; i < n; i++) await ctx.db.insert("formResponses", { formId: id, version: 1, status: i % 2 ? "completed" : "partial", answers: { group: i % 2 ? "b" : "a", number: i % 2 ? 20 : 5 }, language: "en", submissionKey: `key${i}`, respondentId: `secret${i}`, receiptCode: `receipt${i}`, startedAt: 1, submittedAt: i + 1, updatedAt: 1, lastFieldId: "number", reviewed: false, tags: [], spam: false, searchText: "secret", hidden: { email: "private@test.com" } });
    return id;
  });
  return { t, owner, viewer, outsider, formId };
}

it("compares numeric bins within choice segments, grants viewers, refuses strangers and anonymous callers", async () => {
  const { t, owner, viewer, outsider, formId } = await setup();
  const args = { formId, version: 1, segment: { kind: "choice" as const, fieldId: "group" }, compare: { kind: "number" as const, fieldId: "number", boundaries: [10] } };
  const result = await owner.query(cross, args);
  expect(result?.cells).toEqual([{ segment: "a", comparison: "bin:0", count: 10, withinSegmentRate: 1 }, { segment: "b", comparison: "bin:1", count: 10, withinSegmentRate: 1 }].sort((a,b) => b.segment.localeCompare(a.segment)));
  expect(await viewer.query(cross, args)).toEqual(result);
  expect(await outsider.query(cross, args)).toBeNull();
  expect(await t.query(cross, args)).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(/secret|receipt|private@test|respondentId|answers/);
});

it("withholds complementary totals when a small cell exists and validates dimensions", async () => {
  const { owner, formId } = await setup(9);
  const args = { formId, version: 1, segment: { kind: "status" as const }, compare: { kind: "language" as const } };
  expect(await owner.query(cross, args)).toMatchObject({ suppressed: true, cells: [] });
  await expect(owner.query(cross, { ...args, segment: { kind: "number", fieldId: "number", boundaries: [10, 5] } })).rejects.toThrow("INVALID_DIMENSION");
  await expect(owner.query(cross, { ...args, version: 99 })).rejects.toThrow("VERSION_NOT_FOUND");
  const result = await owner.query(flow, { formId, version: 1 });
  expect(result).toMatchObject({ completed: null, partial: null });
  expect(result?.fields.every(f => f.suppressed && f.answered === null)).toBe(true);
});

it("distinguishes unknown progress, inferred reached skips, and completed skips without inventing visits", async () => {
  const { t, owner, formId } = await setup(30);
  await t.run(async ctx => {
    const rows = await ctx.db.query("formResponses").withIndex("by_formId_and_submittedAt", q => q.eq("formId", formId)).take(30);
    for (let i = 0; i < rows.length; i++) {
      await ctx.db.patch("formResponses", rows[i]._id, {
        status: i < 10 ? "completed" : "partial",
        answers: { group: "a" },
        lastFieldId: i >= 20 ? "branch" : undefined,
      });
    }
  });
  const result = await owner.query(flow, { formId, version: 1 });
  expect(result?.fields.find(f => f.fieldId === "number")).toMatchObject({ completedSkipped: 10, unknownProgress: 10, inferredReachedUnanswered: 10, notReached: 0 });
});

it("separates hidden branches from partial not-reached questions using the pinned version", async () => {
  const { owner, formId, t } = await setup();
  await t.run(async ctx => {
    const form = await ctx.db.get("forms", formId);
    await ctx.db.patch("forms", formId, { draft: { ...form!.draft, fields: [] } });
  });
  const result = await owner.query(flow, { formId, version: 1 });
  expect(result).toMatchObject({ completed: 10, partial: 10, progression: "inferred_from_saved_answers" });
  expect(result?.fields.find(f => f.fieldId === "branch")).toMatchObject({ eligible: 10, hidden: 10, notReached: 10, completedSkipped: 0 });
  expect(result?.fields.find(f => f.fieldId === "number")).toMatchObject({ answered: 20, stoppedAfter: 10 });
});

it("excludes spam and other versions, marks the bounded window, and does not return identities", async () => {
  const { t, owner, formId } = await setup(502);
  await t.run(async ctx => {
    const rows = await ctx.db.query("formResponses").withIndex("by_formId_and_submittedAt", q => q.eq("formId", formId)).order("desc").take(2);
    await ctx.db.patch("formResponses", rows[0]._id, { spam: true });
    await ctx.db.patch("formResponses", rows[1]._id, { version: 2 });
  });
  const result = await owner.query(cross, { formId, version: 1, segment: { kind: "status" }, compare: { kind: "language" } });
  expect(result?.evidence.windowLimited).toBe(true);
  expect(result?.cells.reduce((sum, c) => sum + c.count, 0)).toBe(499);
});
