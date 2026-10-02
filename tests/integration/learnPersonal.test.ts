/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const put = makeFunctionReference<"mutation">("learnPersonal:put");
const list = makeFunctionReference<"query">("learnPersonal:list");
const remove = makeFunctionReference<"mutation">("learnPersonal:remove");
const follow = makeFunctionReference<"mutation">("learnPersonal:followModule");
const modules = import.meta.glob("../../convex/**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Test", description: "", tags: [], language: "en" }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Portal pressure", citations: [], conceptIds: [] }] } });
  const published = await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
  if (!published.ok) throw new Error("Publication failed");
  const args = { key: "annotation1", lessonId, versionId: published.versionId, blockId: "p", kind: "note", note: "Private thought", expectedRevision: 0 };
  return { t, owner, other, args, lessonId };
}
describe("private Learn annotations", () => {
  it("enforces the per-lesson record cap", async () => {
    const { t, owner, args } = await setup();
    await t.run(async ctx => {
      for (let i = 0; i < 200; i++) await ctx.db.insert("learnPersonal", { owner: creatorIdentity.tokenIdentifier!, key: `cap${i}`, lessonId: args.lessonId, versionId: args.versionId, blockId: "p", kind: "save", note: "", revision: 1, updatedAt: Date.now(), deleted: false });
    });
    await expect(owner.mutation(put, args)).rejects.toThrow("limit");
  });
  it("isolates identities and requires authentication", async () => {
    const { t, owner, other, args, lessonId } = await setup();
    await owner.mutation(put, args);
    const read = { lessonId, paginationOpts: { numItems: 20, cursor: null } };
    expect((await other.query(list, read)).page).toEqual([]);
    await expect(t.query(list, read)).rejects.toThrow("authenticated");
    expect(await other.mutation(remove, { key: args.key, expectedRevision: 1 })).toBe(0);
  });
  it("checks exact selections and bounds", async () => {
    const { owner, args } = await setup();
    await expect(owner.mutation(put, { ...args, kind: "highlight", note: "", anchor: { start: 0, end: 6, quote: "wrong" } })).rejects.toThrow("exactly");
    await expect(owner.mutation(put, { ...args, note: "x".repeat(4001) })).rejects.toThrow("length");
    await expect(owner.mutation(put, { ...args, blockId: "missing" })).rejects.toThrow("Block");
    expect((await owner.mutation(put, { ...args, kind: "highlight", note: "", anchor: { start: 0, end: 6, quote: "Portal" } })).revision).toBe(1);
  });
  it("retries are idempotent and stale different edits conflict", async () => {
    const { owner, args } = await setup();
    expect((await owner.mutation(put, args)).revision).toBe(1);
    expect((await owner.mutation(put, args)).revision).toBe(1);
    await expect(owner.mutation(put, { ...args, note: "changed" })).rejects.toThrow("REVISION_CONFLICT");
    expect((await owner.mutation(put, { ...args, note: "changed", expectedRevision: 1 })).revision).toBe(2);
  });
  it("recovers and removes own notes after lesson access is revoked", async () => {
    const { owner, other, args, lessonId } = await setup();
    await other.mutation(put, args);
    await owner.mutation(api.lessons.setLifecycle, { lessonId, expectedRevision: 1, action: "unpublish" });
    await expect(other.mutation(put, { ...args, note: "new", expectedRevision: 1 })).rejects.toThrow("unauthorized");
    expect((await other.query(list, { lessonId, paginationOpts: { numItems: 20, cursor: null } })).page[0].note).toBe("Private thought");
    expect(await other.mutation(remove, { key: args.key, expectedRevision: 1 })).toBe(2);
    expect(await other.mutation(remove, { key: args.key, expectedRevision: 1 })).toBe(2);
  });
  it("module follows are private, bounded and revision protected", async () => {
    const { t, owner, other } = await setup();
    const nodeId = await t.run(async ctx => {
      const institutionId = await ctx.db.insert("curriculumInstitutions", { key: "i", name: "I" });
      const programId = await ctx.db.insert("curriculumPrograms", { institutionId, key: "p", name: "P" });
      const versionId = await ctx.db.insert("curriculumVersions", { programId, key: "v", name: "V" });
      return ctx.db.insert("curriculumNodes", { versionId, parentId: null, key: "m", name: "M", kind: "module", conceptKeys: [] });
    });
    expect(await owner.mutation(follow, { nodeId, followed: true, expectedRevision: 0 })).toBe(1);
    expect(await owner.mutation(follow, { nodeId, followed: true, expectedRevision: 0 })).toBe(1);
    await expect(owner.mutation(follow, { nodeId, followed: false, expectedRevision: 0 })).rejects.toThrow("REVISION_CONFLICT");
    expect(await other.query(makeFunctionReference<"query">("learnPersonal:listModuleFollows"), {})).toEqual([]);
  });
});
