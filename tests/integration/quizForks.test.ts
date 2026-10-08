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
  it("refuses restricted actors through the internal MCP entrypoint", async () => {
    const { t } = await setup();
    await t.run(async ctx => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", otherCreatorIdentity.subject)).unique();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    const { formId, versionId } = await t.run(async ctx => {
      const formId = await ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: "Private", shareId: "private", status: "draft", draft: emptyDefinition("Private"), draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
      const versionId = await ctx.db.insert("formVersions", { formId, version: 1, definition: emptyDefinition("Private"), publishedAt: 1, publishedBy: "Casey", draftRevision: 1 });
      return { formId, versionId };
    });
    const asset = { kind: "form" as const, id: formId };
    const mcpFork = makeFunctionReference<"mutation">("quizForks:mcpFork");
    await expect(t.mutation(mcpFork, { userId: otherCreatorIdentity.subject, asset, formVersionId: versionId })).rejects.toThrow("ACCOUNT_RESTRICTED");
    await expect(t.withIdentity(otherCreatorIdentity).mutation(fork, { asset, formVersionId: versionId })).rejects.toThrow("BANNED");
    // A classic quiz can no longer be forked; it is rejected by the argument validator.
    const quizId = await t.run(ctx => ctx.db.insert("quizzes", { creatorId: creatorIdentity.subject, creatorUsername: "creator", title: "Classic", slug: "classic", isPublished: true, createdAt: 0, updatedAt: 0 }));
    await expect(t.withIdentity(creatorIdentity).mutation(fork, { asset: { kind: "quiz", id: quizId }, expectedPublishedAt: 1 })).rejects.toThrow("Validator");
  });
});
