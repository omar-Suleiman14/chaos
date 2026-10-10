import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { measureConvex } from "../../perf/lib/convex";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

async function fixture(count: number, distinctOwners = false) {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const ids: Id<"lessons">[] = [];
    for (let i = 0; i < count; i++) {
      const ownerId = distinctOwners ? `synthetic_owner_${i}` : creatorIdentity.subject;
      if (distinctOwners || i === 0) await ctx.db.insert("users", { clerkId: ownerId, name: `Synthetic ${i}`, username: `synthetic_${i}`, email: `synthetic${i}@example.com`, createdAt: 0 });
      const metadata = { title: `Lesson ${i}`, description: "", language: "en", tags: [], ...(i === 0 ? { authorDisplay: "Publication author" } : {}) };
      const document = { schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text: `Published content ${i}`, citations: [], conceptIds: [] }] };
      const lessonId = await ctx.db.insert("lessons", { ownerId, metadata: { ...metadata, title: "Draft title" }, draft: { schemaVersion: 1, blocks: [] }, revision: 1, status: "active", visibility: "public", communityState: "ok", createdAt: i, updatedAt: i, searchText: "" });
      const versionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata, document, authorId: ownerId, publishedAt: 0, visibility: "public" });
      await ctx.db.patch("lessons", lessonId, { publishedVersionId: versionId });
      ids.push(lessonId);
    }
    return ids;
  });
  return { t, ids };
}

describe("batched published lesson reads", () => {
  it.each([1, 10, 50])("preserves ordered full snapshots for a %i-lesson batch", async count => {
    const { t, ids } = await fixture(count);
    const { result, cost, payload } = await measureConvex(() => t.query(api.learnFrontend.publicLessonsBatch, { ids }));
    expect(result.map(row => row.lessonId)).toEqual(ids);
    expect(result.map(row => {
      const block = row.version.document.blocks[0];
      return "text" in block ? block.text : null;
    })).toEqual(ids.map((_, i) => `Published content ${i}`));
    expect(result[0].ownerName).toBe("Publication author");
    if (count > 1) expect(result[1].ownerName).toBe("Synthetic 0");
    expect(cost.databaseQueries).toBe(2 * count + 2);
    expect(cost.documentsRead).toBe(2 * count + 2);
    expect(payload).toBeGreaterThan(0);
  });

  it("preserves duplicate IDs and the first-50-input bound", async () => {
    const { t, ids } = await fixture(50);
    const input = [ids[49], "invalid", "", "x".repeat(101), ids[49], ...ids];
    const result = await t.query(api.learnFrontend.publicLessonsBatch, { ids: input });
    expect(result.map(row => row.lessonId)).toEqual([ids[49], ids[49], ...ids.slice(0, 45)]);
    expect(result[0]).toEqual(await t.query(api.learnFrontend.publicLesson, { id: ids[49] }));
  });

  it("does not share owner decisions across requests or unrelated owners", async () => {
    const { t, ids } = await fixture(10, true);
    const measured = await measureConvex(() => t.query(api.learnFrontend.publicLessonsBatch, { ids }));
    expect(measured.result).toHaveLength(10);
    expect(measured.cost.databaseQueries).toBe(40);
    await t.run(async ctx => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", "synthetic_owner_0")).unique();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    expect((await t.query(api.learnFrontend.publicLessonsBatch, { ids })).map(row => row.lessonId)).toEqual(ids.slice(1));
  });

  it("omits unavailable snapshots without using owner or editor privileges", async () => {
    const { t, ids } = await fixture(7);
    await t.run(async ctx => {
      await ctx.db.patch("lessons", ids[0], { status: "archived" });
      await ctx.db.patch("lessons", ids[1], { communityState: "hidden" });
      await ctx.db.patch("lessons", ids[2], { visibility: "private" });
      await ctx.db.patch("lessons", ids[3], { publishedVersionId: undefined });
      const mismatched = await ctx.db.get("lessons", ids[5]);
      await ctx.db.patch("lessons", ids[4], { publishedVersionId: mismatched!.publishedVersionId });
      const privateVersion = await ctx.db.get("lessons", ids[5]);
      await ctx.db.patch("lessonVersions", privateVersion!.publishedVersionId!, { visibility: "private" });
      await ctx.db.insert("lessonPermissions", { lessonId: ids[2], userId: otherCreatorIdentity.subject, role: "editor" });
    });
    for (const reader of [t, t.withIdentity(creatorIdentity), t.withIdentity(otherCreatorIdentity)]) {
      const result = await reader.query(api.learnFrontend.publicLessonsBatch, { ids });
      expect(result.map(row => row.lessonId)).toEqual([ids[6]]);
    }
  });

  it("rechecks restricted-team membership and revocation on each request", async () => {
    const { t, ids } = await fixture(2);
    const membershipId = await t.run(async ctx => {
      const teamId = await ctx.db.insert("businessTeams", { name: "Synthetic team", ownerId: creatorIdentity.subject, createdAt: 0 });
      const membershipId = await ctx.db.insert("businessMembers", { teamId, userId: otherCreatorIdentity.subject, role: "member", joinedAt: 0 });
      for (const id of ids) {
        const lesson = await ctx.db.get("lessons", id);
        await ctx.db.patch("lessons", id, { visibility: "restricted", audienceTeamId: teamId });
        await ctx.db.patch("lessonVersions", lesson!.publishedVersionId!, { visibility: "restricted" });
      }
      return membershipId;
    });
    expect(await t.query(api.learnFrontend.publicLessonsBatch, { ids })).toEqual([]);
    const member = t.withIdentity(otherCreatorIdentity);
    expect((await member.query(api.learnFrontend.publicLessonsBatch, { ids })).map(row => row.lessonId)).toEqual(ids);
    await t.run(ctx => ctx.db.delete("businessMembers", membershipId));
    expect(await member.query(api.learnFrontend.publicLessonsBatch, { ids })).toEqual([]);
  });

  it("retains legacy public versions and fallback names but excludes suspended creators", async () => {
    const { t, ids } = await fixture(2);
    await t.run(async ctx => {
      for (const id of ids) {
        const lesson = await ctx.db.get("lessons", id);
        await ctx.db.patch("lessonVersions", lesson!.publishedVersionId!, { visibility: undefined });
      }
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).unique();
      await ctx.db.delete("users", user!._id);
    });
    const result = await t.query(api.learnFrontend.publicLessonsBatch, { ids });
    expect(result.map(row => row.ownerName)).toEqual(["Publication author", "Chaos creator"]);
    await t.run(ctx => ctx.db.insert("users", { clerkId: creatorIdentity.subject, name: "Suspended", username: "suspended", email: "synthetic@example.com", createdAt: 0, suspendedUntil: Date.now() + 1000 }));
    expect(await t.query(api.learnFrontend.publicLessonsBatch, { ids })).toEqual([]);
  });
});
