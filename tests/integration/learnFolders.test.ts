/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { defineSchema, makeFunctionReference } from "convex/server";
import schema from "../../convex/schema";
import { folderTables, MAX_FOLDER_DEPTH, MAX_FOLDER_MOVE_NODES } from "../../convex/folderModel";
import type * as folders from "../../convex/folders";
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from "convex/server";
import { creatorIdentity, otherCreatorIdentity, quizFixture } from "../fixtures";
import { api } from "../../convex/_generated/api";
import { emptyDefinition } from "../../convex/formLogic";
import "./setup";

const modules = import.meta.glob("../../convex/**/*.*s");
const testSchema = defineSchema({ ...schema.tables, ...folderTables });
function ref<K extends keyof typeof folders>(name: K) {
  type F = ApiFromModules<{ folders: typeof folders }>["folders"][K];
  return makeFunctionReference<F["_type"], FunctionArgs<F>, FunctionReturnType<F>>(`folders:${name}`);
}
const f = {
  create: ref("create"), list: ref("list"), rename: ref("rename"), move: ref("move"), remove: ref("remove"),
  addMember: ref("addMember"), removeMember: ref("removeMember"), listMembers: ref("listMembers"),
};
const page = { numItems: 20, cursor: null };
async function fixture() {
  const t = convexTest({ schema: testSchema, modules, transactionLimits: true });
  const owner = t.withIdentity(creatorIdentity);
  const other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  const root = await owner.mutation(f.create, { name: " Root ", parentId: null });
  return { t, owner, other, root };
}

describe("private generic folders", () => {
  it("isolates reads, writes, parents and moves from other accounts and anonymous callers", async () => {
    const { t, owner, other, root } = await fixture();
    expect((await owner.query(f.list, { parentId: null, paginationOpts: page })).page[0].name).toBe("Root");
    expect((await other.query(f.list, { parentId: null, paginationOpts: page })).page).toEqual([]);
    await expect(t.query(f.list, { parentId: null, paginationOpts: page })).rejects.toThrow("Not authenticated");
    await expect(t.mutation(f.create, { name: "anonymous", parentId: null })).rejects.toThrow("Not authenticated");
    await expect(other.query(f.list, { parentId: root, paginationOpts: page })).rejects.toThrow("FOLDER_NOT_FOUND");
    await expect(other.query(f.listMembers, { folderId: root, paginationOpts: page })).rejects.toThrow("FOLDER_NOT_FOUND");
    await expect(other.mutation(f.rename, { folderId: root, name: "stolen" })).rejects.toThrow("FOLDER_NOT_FOUND");
    await expect(other.mutation(f.remove, { folderId: root })).rejects.toThrow("FOLDER_NOT_FOUND");
    await expect(other.mutation(f.move, { folderId: root, parentId: null })).rejects.toThrow("FOLDER_NOT_FOUND");
    await expect(other.mutation(f.create, { name: "foreign parent", parentId: root })).rejects.toThrow("FOLDER_NOT_FOUND");
    const foreign = await other.mutation(f.create, { name: "other", parentId: null });
    await expect(owner.mutation(f.move, { folderId: root, parentId: foreign })).rejects.toThrow("FOLDER_NOT_FOUND");
  });

  it("rejects self/descendant cycles and validates the whole moved subtree depth", async () => {
    const { t, owner, root } = await fixture();
    const child = await owner.mutation(f.create, { name: "child", parentId: root });
    await expect(owner.mutation(f.move, { folderId: root, parentId: root })).rejects.toThrow("FOLDER_CYCLE");
    await expect(owner.mutation(f.move, { folderId: root, parentId: child })).rejects.toThrow("FOLDER_CYCLE");
    let parent = await owner.mutation(f.create, { name: "chain", parentId: null });
    for (let i = 1; i < MAX_FOLDER_DEPTH; i++) parent = await owner.mutation(f.create, { name: `level ${i}`, parentId: parent });
    await expect(owner.mutation(f.create, { name: "too deep", parentId: parent })).rejects.toThrow("FOLDER_DEPTH_LIMIT");
    const penultimate = (await t.run(ctx => ctx.db.get("folders", parent)))!.parentId;
    await expect(owner.mutation(f.move, { folderId: root, parentId: penultimate })).rejects.toThrow("FOLDER_DEPTH_LIMIT");
    expect((await t.run(ctx => ctx.db.get("folders", root)))!.parentId).toBeNull();
    await owner.mutation(f.move, { folderId: child, parentId: null });
    await owner.mutation(f.remove, { folderId: root });
    expect(await t.run(ctx => ctx.db.get("folders", child))).not.toBeNull();
  });

  it("fails closed on corrupt ancestry and oversized subtree moves", async () => {
    const { t, owner, root } = await fixture();
    const child = await owner.mutation(f.create, { name: "child", parentId: root });
    await t.run(ctx => ctx.db.patch("folders", root, { parentId: child }));
    await expect(owner.mutation(f.create, { name: "cycle", parentId: child })).rejects.toThrow("FOLDER_CYCLE");
    await t.run(async ctx => {
      await ctx.db.patch("folders", root, { parentId: null });
      for (let i = 0; i < MAX_FOLDER_MOVE_NODES; i++) await ctx.db.insert("folders", {
        ownerId: creatorIdentity.subject, name: `wide ${i}`, parentId: root, createdAt: 0, updatedAt: 0,
      });
    });
    await expect(owner.mutation(f.move, { folderId: root, parentId: null })).rejects.toThrow("FOLDER_MOVE_LIMIT");
  });

  it("checks asset and membership ownership, deduplicates links and preserves assets", async () => {
    const { t, owner, other, root } = await fixture();
    const quizId = await t.run(ctx => ctx.db.insert("quizzes", { ...quizFixture, creatorId: creatorIdentity.subject, creatorUsername: creatorIdentity.nickname }));
    const foreignQuizId = await t.run(ctx => ctx.db.insert("quizzes", { ...quizFixture, creatorId: otherCreatorIdentity.subject, creatorUsername: otherCreatorIdentity.nickname }));
    const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Owned") });
    const foreignFormId = await other.mutation(api.forms.createForm, { definition: emptyDefinition("Foreign") });
    for (const asset of [{ kind: "quiz" as const, id: foreignQuizId }, { kind: "form" as const, id: foreignFormId }]) {
      await expect(owner.mutation(f.addMember, { folderId: root, asset })).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
    }
    await expect(other.mutation(f.addMember, { folderId: root, asset: { kind: "quiz", id: foreignQuizId } })).rejects.toThrow("FOLDER_NOT_FOUND");
    const asset = { kind: "quiz" as const, id: quizId };
    const memberId = await owner.mutation(f.addMember, { folderId: root, asset });
    expect(await owner.mutation(f.addMember, { folderId: root, asset })).toBe(memberId);
    const formMember = await owner.mutation(f.addMember, { folderId: root, asset: { kind: "form", id: formId } });
    expect((await owner.query(f.listMembers, { folderId: root, paginationOpts: page })).page).toHaveLength(2);
    await expect(other.mutation(f.removeMember, { memberId })).rejects.toThrow("FOLDER_MEMBER_NOT_FOUND");
    await expect(owner.mutation(f.remove, { folderId: root })).rejects.toThrow("FOLDER_NOT_EMPTY");
    const collectionId = await owner.mutation(api.learnCollections.create, { metadata: { title: "Pack", description: "", tags: [], language: "en" } });
    const collectionMember = await owner.mutation(f.addMember, { folderId: root, asset: { kind: "collection", id: collectionId } });
    await owner.mutation(f.removeMember, { memberId: collectionMember });
    await owner.mutation(f.removeMember, { memberId: formMember });
    expect(await t.run(ctx => ctx.db.get("forms", formId))).not.toBeNull();
    await t.run(ctx => ctx.db.delete("quizzes", quizId));
    await expect(owner.mutation(f.addMember, { folderId: root, asset })).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
    await owner.mutation(f.removeMember, { memberId });
    await owner.mutation(f.remove, { folderId: root });
  });

  it("rejects moderated accounts and invalid names", async () => {
    const { t, owner, root } = await fixture();
    await expect(owner.mutation(f.rename, { folderId: root, name: " " })).rejects.toThrow("FOLDER_NAME_INVALID");
    await expect(owner.mutation(f.create, { name: "x".repeat(121), parentId: null })).rejects.toThrow("FOLDER_NAME_INVALID");
    const user = await t.run(ctx => ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique());
    await t.run(ctx => ctx.db.patch("users", user!._id, { isBanned: true }));
    await expect(owner.mutation(f.rename, { folderId: root, name: "blocked" })).rejects.toThrow("ACCOUNT_BANNED");
    await expect(owner.query(f.listMembers, { folderId: root, paginationOpts: page })).rejects.toThrow("ACCOUNT_BANNED");
    await t.run(ctx => ctx.db.patch("users", user!._id, { isBanned: false, suspendedUntil: Date.now() + 10000 }));
    await expect(owner.mutation(f.remove, { folderId: root })).rejects.toThrow("ACCOUNT_SUSPENDED");
  });

  it("requires actual ownership of lessons and sources, even if public", async () => {
    const { t, owner, root } = await fixture();
    const seed = async (ownerId: string) => await t.run(async ctx => ({
      lessonId: await ctx.db.insert("lessons", {
        ownerId, metadata: { title: "Lesson", description: "", language: "en", tags: [] },
        draft: { schemaVersion: 1, blocks: [] }, revision: 1, status: "active",
        visibility: "public", communityState: "ok", createdAt: 0, updatedAt: 0, searchText: "Lesson",
      }),
      sourceId: await ctx.db.insert("learnSources", {
        ownerId, metadata: { title: "Source", kind: "reference", origin: "manual" },
        metadataVisibility: "public", contentVisibility: "public", uploadedBy: ownerId, createdAt: 0, status: "active",
      }),
    }));
    const own = await seed(creatorIdentity.subject);
    const foreign = await seed(otherCreatorIdentity.subject);
    await owner.mutation(f.addMember, { folderId: root, asset: { kind: "lesson", id: own.lessonId } });
    await owner.mutation(f.addMember, { folderId: root, asset: { kind: "source", id: own.sourceId } });
    await expect(owner.mutation(f.addMember, { folderId: root, asset: { kind: "lesson", id: foreign.lessonId } })).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
    await expect(owner.mutation(f.addMember, { folderId: root, asset: { kind: "source", id: foreign.sourceId } })).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
    await t.run(ctx => ctx.db.patch("learnSources", own.sourceId, { status: "removed" }));
    await expect(owner.mutation(f.addMember, { folderId: root, asset: { kind: "source", id: own.sourceId } })).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
    await t.run(ctx => ctx.db.delete("lessons", own.lessonId));
    await expect(owner.mutation(f.addMember, { folderId: root, asset: { kind: "lesson", id: own.lessonId } })).rejects.toThrow("FOLDER_ASSET_NOT_FOUND");
  });
});
