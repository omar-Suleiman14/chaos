import { describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
const owned = api.learnFrontend.listOwned, index = api.learnFrontend.listIndexableLessons, quizzes = api.learnFrontend.attachedQuizzes, profile = api.learnFrontend.publicProfile;
const metadata = { title: "Published title", description: "Public description", language: "en", tags: [], indexing: "index" as const };
async function setup() {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  const lessonId = await owner.mutation(api.lessons.create, { metadata, document: { schemaVersion: 1, blocks: [{ id: "intro", type: "paragraph", text: "Content", citations: [], conceptIds: [] }] } });
  return { t, owner, lessonId };
}
describe("native Learn frontend reads", () => {
  it("bounds owned cards and excludes documents and other owners", async () => {
    const { t, owner, lessonId } = await setup();
    await expect(t.query(owned, { paginationOpts: { numItems: 1, cursor: null } })).rejects.toThrow();
    await expect(owner.query(owned, { paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow("1–50");
    const page = await owner.query(owned, { paginationOpts: { numItems: 1, cursor: null } });
    expect(page.page[0].lessonId).toBe(lessonId);
    expect(page.page[0]).not.toHaveProperty("draft");
    expect((await t.withIdentity(otherCreatorIdentity).query(owned, { paginationOpts: { numItems: 1, cursor: null } })).page).toEqual([]);
  });
  it("indexes only current public publications and never draft metadata", async () => {
    const { t, owner, lessonId } = await setup();
    const args = { paginationOpts: { numItems: 50, cursor: null } };
    expect((await t.query(index, args)).page).toEqual([]);
    await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 1, metadata: { ...metadata, title: "SECRET DRAFT" }, document: { schemaVersion: 1, blocks: [] } });
    expect((await t.query(index, args)).page[0].metadata.title).toBe(metadata.title);
    await t.run(ctx => ctx.db.patch("lessons", lessonId, { communityState: "hidden" }));
    expect((await t.query(index, args)).page).toEqual([]);
    await expect(t.query(index, { paginationOpts: { numItems: 100, cursor: null } })).rejects.toThrow();
  });
  it("requires lesson read access and strips quiz answers even for owners", async () => {
    const { t, owner, lessonId } = await setup();
    await expect(t.query(quizzes, { lessonId })).rejects.toThrow("unauthorized");
    await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" });
    await t.run(async ctx => {
      const questionId = ctx.db.normalizeId("questions", "not-an-id");
      expect(questionId).toBeNull();
      const quizId = await ctx.db.insert("quizzes", { title: "Draft secret", slug: "quiz", creatorId: creatorIdentity.subject, creatorUsername: "creator", isPublished: true, createdAt: 0, updatedAt: 0 });
      const qid = await ctx.db.insert("questions", { quizId, type: "mcq", questionText: "Q", options: ["A", "B"], correctAnswer: "A", points: 1, order: 0 });
      await ctx.db.patch("quizzes", quizId, { publishedSnapshot: { title: "Published quiz", questions: [{ _id: qid, type: "mcq", questionText: "Q", options: ["A", "B"], correctAnswer: "A", points: 1, order: 0 }] } });
      await ctx.db.insert("lessonAssessments", { lessonId, asset: { kind: "quiz", id: quizId }, label: "Quiz", order: 0 });
    });
    const result = await t.query(quizzes, { lessonId });
    expect(result[0]).toMatchObject({ title: "Published quiz", questionCount: 1, liveEligible: true, published: true, shareId: null });
    expect(JSON.stringify(result)).not.toContain("correctAnswer");
    expect(JSON.stringify(await owner.query(quizzes, { lessonId }))).not.toContain("questions");
    await t.run(ctx => ctx.db.patch("lessons", lessonId, { visibility: "restricted" }));
    await expect(t.query(quizzes, { lessonId })).rejects.toThrow();
  });
  it("exposes only effective verified roles and hides restricted creators", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
    try {
      const { t } = await setup();
      const uid = await t.run(async ctx => {
        const id = await ctx.db.insert("users", { clerkId: creatorIdentity.subject, name: "Creator", email: "private@example.com", username: "creator", createdAt: 0 });
        await ctx.db.insert("learnIdentityClaims", { userKey: creatorIdentity.tokenIdentifier, role: "student", institution: "Private institution", status: "verified", reason: "Private evidence", createdAt: 0, method: "manual_review", reviewedBy: "admin", verifiedAt: Date.now(), expiresAt: Date.now() + 86400000 });
        await ctx.db.insert("learnIdentityClaims", { userKey: creatorIdentity.tokenIdentifier, role: "educator", institution: "Private institution", status: "revoked", createdAt: 0 });
        return id;
      });
      expect(await t.query(profile, { username: "creator" })).toEqual({ username: "creator", name: "Creator", imageUrl: null, verifiedRoles: ["student"] });
      await t.run(async ctx => {
        const claim = await ctx.db.query("learnIdentityClaims").withIndex("by_userKey_and_role", q => q.eq("userKey", creatorIdentity.tokenIdentifier).eq("role", "student")).unique();
        await ctx.db.patch("learnIdentityClaims", claim!._id, { expiresAt: Date.now() - 1 });
      });
      expect((await t.query(profile, { username: "creator" }))?.verifiedRoles).toEqual([]);
      await t.run(ctx => ctx.db.patch("users", uid, { isBanned: true }));
      expect(await t.query(profile, { username: "creator" })).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
});
