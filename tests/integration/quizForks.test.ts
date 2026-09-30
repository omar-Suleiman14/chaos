/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../convex/schema";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import type { Infer } from "convex/values";
import { assessmentRef } from "../../convex/quizForkModel";
const modules = import.meta.glob("../../convex/**/*.*s");
type Asset = Infer<typeof assessmentRef>;
const fork = makeFunctionReference<"mutation", { asset: Asset; formVersionId?: string; expectedPublishedAt?: number }, { asset: Asset }>("quizForks:fork");
const lineage = makeFunctionReference<"query", { asset: Asset }>("quizForks:getLineage");
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    for (const identity of [creatorIdentity, otherCreatorIdentity]) await ctx.db.insert("users", { clerkId: identity.subject, name: identity.name, email: identity.email, username: identity.nickname, plan: "pro", createdAt: 0 });
  });
  const owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  return { t, owner, other };
}
describe("assessment fork provenance", () => {
  it("copies immutable form publication, resets operational state and preserves root through generations", async () => {
    const { t, owner, other } = await setup();
    const { formId, versionId } = await t.run(async ctx => {
      const formId = await ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: "Unpublished change", shareId: "original", status: "live", draft: emptyDefinition("Unpublished change"), draftRevision: 2, settings: { ...defaultFormSettings, notifyOnResponse: false }, responseCount: 7, partialCount: 1, publishedVersion: 1, createdAt: 0, updatedAt: 1 });
      const versionId = await ctx.db.insert("formVersions", { formId, version: 1, definition: emptyDefinition("Published original"), publishedAt: 1, publishedBy: "Casey", draftRevision: 1 });
      return { formId, versionId };
    });
    const first = await other.mutation(fork, { asset: { kind: "form", id: formId }, formVersionId: versionId });
    const mcpLineage = makeFunctionReference<"query">("quizForks:mcpLineage");
    expect(await t.query(mcpLineage, { userId: creatorIdentity.subject, asset: { kind: "form", id: formId } })).toEqual({ lineage: null });
    const wrapped = await t.query(mcpLineage, { userId: otherCreatorIdentity.subject, asset: first.asset });
    expect(wrapped.lineage.parent).toEqual({ kind: "form", id: formId });
    if (first.asset.kind !== "form") throw new Error("wrong asset");
    const nextVersionId = await t.run(async ctx => {
      const copy = await ctx.db.get("forms", first.asset.id as typeof formId);
      expect(copy?.draft.title).toBe("Published original (fork)"); expect(copy?.status).toBe("draft"); expect(copy?.responseCount).toBe(0); expect(copy?.publishedVersion).toBeUndefined(); expect(copy?.settings).toEqual(defaultFormSettings);
      await ctx.db.patch("forms", first.asset.id as typeof formId, { status: "live", publishedVersion: 1 });
      return ctx.db.insert("formVersions", { formId: first.asset.id as typeof formId, version: 1, definition: copy!.draft, publishedAt: 2, publishedBy: "Riley", draftRevision: 1 });
    });
    const second = await owner.mutation(fork, { asset: first.asset, formVersionId: nextVersionId });
    const record = await owner.query(lineage, second);
    expect(record.root).toEqual({ kind: "form", id: formId }); expect(record.rootVersion.id).toBe(versionId); expect(record.parent).toEqual(first.asset); expect(record.depth).toBe(2);
    await expect(other.query(lineage, second)).rejects.toThrow("UNAUTHORIZED");
    await t.run(ctx => ctx.db.delete("forms", formId));
    expect((await owner.query(lineage, second)).rootVersion.id).toBe(versionId);
  });
  it("rejects anonymous, private, historical public and mismatched form versions", async () => {
    const { t, owner, other } = await setup();
    const ids = await t.run(async ctx => {
      const formId = await ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: "Private", shareId: "private", status: "draft", draft: emptyDefinition(), draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
      const versionId = await ctx.db.insert("formVersions", { formId, version: 1, definition: emptyDefinition(), publishedAt: 1, publishedBy: "Casey", draftRevision: 1 });
      return { formId, versionId };
    });
    const input = { asset: { kind: "form" as const, id: ids.formId }, formVersionId: ids.versionId };
    await expect(t.mutation(fork, input)).rejects.toThrow("authenticated");
    await expect(other.mutation(fork, input)).rejects.toThrow("UNAUTHORIZED");
    await owner.mutation(fork, input);
    const unrelated = await t.run(ctx => ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: "Other", shareId: "other", status: "draft", draft: emptyDefinition(), draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 }));
    await expect(owner.mutation(fork, { ...input, asset: { kind: "form", id: unrelated } })).rejects.toThrow("UNAUTHORIZED");
    await t.run(ctx => ctx.db.patch("forms", ids.formId, { status: "live", publishedVersion: 1, settings: { ...defaultFormSettings, access: "code", accessCodeHash: "private" } }));
    await expect(other.mutation(fork, input)).rejects.toThrow("UNAUTHORIZED");
    await t.run(ctx => ctx.db.patch("forms", ids.formId, { status: "live", publishedVersion: 2 }));
    await expect(other.mutation(fork, input)).rejects.toThrow("UNAUTHORIZED");
  });
  it("classic snapshots survive republication and never copy unpublished question edits", async () => {
    const { t, owner, other } = await setup();
    const quizId = await t.run(async ctx => {
      const id = await ctx.db.insert("quizzes", { creatorId: creatorIdentity.subject, creatorUsername: "creator", title: "Draft title", slug: "parent", isPublished: true, publishedAt: 10, createdAt: 0, updatedAt: 11 });
      const qid = await ctx.db.insert("questions", { quizId: id, type: "mcq", questionText: "Draft changed", options: ["A", "B"], correctAnswer: "A", points: 1, order: 0 });
      await ctx.db.patch("quizzes", id, { publishedSnapshot: { title: "Published title", questions: [{ _id: qid, type: "mcq", questionText: "Published question", options: ["A", "B"], correctAnswer: "A", points: 1, order: 0 }] } });
      return id;
    });
    await expect(other.mutation(fork, { asset: { kind: "quiz", id: quizId }, expectedPublishedAt: 9 })).rejects.toThrow("CONFLICT");
    const copy = await other.mutation(fork, { asset: { kind: "quiz", id: quizId }, expectedPublishedAt: 10 });
    if (copy.asset.kind !== "quiz") throw new Error("wrong asset");
    const saved = await other.query(lineage, copy);
    await t.run(async ctx => {
      const privateCopy = await ctx.db.get("quizzes", copy.asset.id as typeof quizId);
      expect(privateCopy?.isPublished).toBe(false); expect(privateCopy?.publishedSnapshot).toBeUndefined();
    });
    await t.run(async ctx => {
      const questions = await ctx.db.query("questions").withIndex("by_quiz", q => q.eq("quizId", copy.asset.id as typeof quizId)).take(200);
      await ctx.db.patch("quizzes", copy.asset.id as typeof quizId, { isPublished: true, publishedAt: 15, publishedSnapshot: { title: "Fork published", questions: questions.map(({ _creationTime: _time, quizId: _quiz, deletedAt: _deleted, ...question }) => question) } });
    });
    const grandchild = await owner.mutation(fork, { asset: copy.asset, expectedPublishedAt: 15 });
    const descendant = await owner.query(lineage, grandchild);
    expect(descendant.root).toEqual({ kind: "quiz", id: quizId }); expect(descendant.parent).toEqual(copy.asset); expect(descendant.rootVersion).toEqual(saved.rootVersion); expect(descendant.depth).toBe(2);
    await t.run(async ctx => {
      const q = await ctx.db.get("quizzes", copy.asset.id as typeof quizId);
      expect(q?.creatorId).toBe(otherCreatorIdentity.subject);
      const questions = await ctx.db.query("questions").withIndex("by_quiz", q => q.eq("quizId", copy.asset.id as typeof quizId)).take(5);
      expect(questions[0].questionText).toBe("Published question");
      await ctx.db.patch("quizzes", quizId, { publishedAt: 20, publishedSnapshot: { title: "New publication", questions: [] } });
      const snap = await ctx.db.get("quizForkSnapshots", saved.parentVersion.id);
      expect(snap?.snapshot.title).toBe("Published title");
    });
    await expect(owner.query(lineage, copy)).rejects.toThrow("UNAUTHORIZED");
    await t.run(ctx => ctx.db.patch("quizzes", quizId, { isBanned: true }));
    await expect(owner.mutation(fork, { asset: { kind: "quiz", id: quizId }, expectedPublishedAt: 20 })).rejects.toThrow("UNAUTHORIZED");
  });
  it("refuses restricted actors through the internal MCP entrypoint", async () => {
    const { t } = await setup();
    await t.run(async ctx => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", otherCreatorIdentity.subject)).unique();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    const id = await t.run(ctx => ctx.db.insert("quizzes", { creatorId: creatorIdentity.subject, creatorUsername: "creator", title: "Private", slug: "private", isPublished: false, createdAt: 0, updatedAt: 0 }));
    const mcpFork = makeFunctionReference<"mutation">("quizForks:mcpFork");
    await expect(t.mutation(mcpFork, { userId: otherCreatorIdentity.subject, asset: { kind: "quiz", id }, expectedPublishedAt: 1 })).rejects.toThrow("ACCOUNT_RESTRICTED");
    await expect(t.withIdentity(otherCreatorIdentity).mutation(fork, { asset: { kind: "quiz", id }, expectedPublishedAt: 1 })).rejects.toThrow("BANNED");
    await expect(t.withIdentity(creatorIdentity).mutation(fork, { asset: { kind: "quiz", id }, expectedPublishedAt: 1 })).rejects.toThrow("UNAUTHORIZED");
  });
});
