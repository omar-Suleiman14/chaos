import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";

const metadata = { title: "Study note", description: "", language: "en", tags: [], indexing: "index" as const };
const document = { schemaVersion: 1 as const, blocks: [] };

describe("indexable lesson owner lookups", () => {
  it("includes same-owner indexed lessons and immediately respects new restrictions", async () => {
    const t = createTestConvex();
    const lessonIds = await t.run(async ctx => {
      await ctx.db.insert("users", { clerkId: creatorIdentity.subject, name: "Creator", username: "creator", email: creatorIdentity.email, createdAt: 0 });
      const ids: Id<"lessons">[] = [];
      for (let i = 0; i < 3; i++) {
        const lessonId = await ctx.db.insert("lessons", {
          ownerId: creatorIdentity.subject, metadata, draft: document, revision: 1,
          status: "active", visibility: "public", communityState: "ok",
          createdAt: i, updatedAt: i, searchText: "",
        });
        const versionId = await ctx.db.insert("lessonVersions", { lessonId, number: 1, metadata, document, authorId: creatorIdentity.subject, publishedAt: i });
        await ctx.db.patch("lessons", lessonId, { publishedVersionId: versionId });
        ids.push(lessonId);
      }
      return ids;
    });
    const listing = () => t.query(api.learnFrontend.listIndexableLessons, { paginationOpts: { numItems: 10, cursor: null } });
    const first = await listing();
    expect(first.page.map(item => item.lessonId)).toEqual(lessonIds);
    await t.run(async ctx => {
      const owner = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", creatorIdentity.subject)).first();
      if (!owner) throw new Error("missing owner");
      await ctx.db.patch("users", owner._id, { isBanned: true });
    });
    expect((await listing()).page).toEqual([]);
  });
});
