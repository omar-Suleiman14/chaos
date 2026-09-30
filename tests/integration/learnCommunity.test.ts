/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import {
  creatorIdentity,
  otherCreatorIdentity,
  quizFixture,
  questionFixtures,
} from "../fixtures";
import type { LessonDocument } from "../../convex/learnModel";
const modules = import.meta.glob("../../convex/**/*.*s");
function ref<K extends keyof typeof api.learnCommunity>(name: K) {
  return api.learnCommunity[name];
}
const metadata = {
  title: "Learning",
  description: "Published description",
  language: "en",
  tags: [],
};
const document: LessonDocument = {
  schemaVersion: 1,
  blocks: ["one", "two"].map((id) => ({
    id,
    type: "paragraph",
    text: id,
    citations: [],
    conceptIds: [],
  })),
};
async function setup(publish = true) {
  const t = convexTest(schema, modules),
    owner = t.withIdentity(creatorIdentity),
    other = t.withIdentity(otherCreatorIdentity);
  const adminIdentity = {
    ...creatorIdentity,
    subject: "admin",
    tokenIdentifier: "https://chaos.test.clerk.accounts.dev|admin",
  };
  const admin = t.withIdentity(adminIdentity);
  await t.run(async (ctx) => {
    await ctx.db.insert("admins", {
      clerkId: "admin",
      email: "admin@example.com",
      grantedAt: 0,
    });
  });
  const lessonId = await owner.mutation(api.lessons.create, {
    metadata,
    document,
  });
  const published = publish
    ? await owner.mutation(api.lessons.publish, {
        lessonId,
        expectedRevision: 0,
        visibility: "public",
      })
    : null;
  const versionId = published?.ok ? published.versionId : undefined;
  return { t, owner, other, admin, lessonId, versionId };
}
describe("Learn community and private learning state", () => {
  it("serves only public published snapshots, including to owners, never private drafts", async () => {
    const { t, owner, other, lessonId } = await setup(false);
    await expect(owner.query(ref("get"), { lessonId })).rejects.toThrow(
      "not public",
    );
    await expect(t.query(ref("get"), { lessonId })).rejects.toThrow(
      "unauthorized",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("lessonPermissions", {
        lessonId,
        userId: otherCreatorIdentity.subject,
        role: "reader",
      });
    });
    await expect(other.query(ref("get"), { lessonId })).rejects.toThrow(
      "not public",
    );
    await owner.mutation(api.lessons.publish, {
      lessonId,
      expectedRevision: 0,
      visibility: "public",
    });
    await owner.mutation(api.lessons.saveDraft, {
      lessonId,
      expectedRevision: 1,
      document: { schemaVersion: 1, blocks: [] },
      metadata: { ...metadata, title: "Private draft secret" },
    });
    const result = await t.query(ref("get"), { lessonId });
    expect(result.document).toEqual(document);
    expect(result.metadata).toEqual(metadata);
    expect(result).not.toHaveProperty("draft");
    expect(result).not.toHaveProperty("ownerId");
    await owner.mutation(api.lessons.setLifecycle, {
      lessonId,
      expectedRevision: 2,
      action: "archive",
    });
    await expect(owner.query(ref("get"), { lessonId })).rejects.toThrow(
      "not public",
    );
  });
  it("makes saves/helpfulness idempotent and aggregates exact across users and withdrawals", async () => {
    const { t, other, owner, admin, lessonId } = await setup();
    await expect(
      t.mutation(ref("setSignals"), { lessonId, saved: true }),
    ).rejects.toThrow("authenticated");
    for (let n = 0; n < 3; n++)
      await other.mutation(ref("setSignals"), {
        lessonId,
        saved: true,
        helpful: true,
      });
    await owner.mutation(ref("setSignals"), { lessonId, saved: true });
    expect((await t.query(ref("get"), { lessonId })).counts).toEqual({
      saves: 2,
      helpful: 1,
      views: 0,
    });
    await other.mutation(ref("setSignals"), { lessonId, saved: false });
    expect((await t.query(ref("get"), { lessonId })).counts).toEqual({
      saves: 1,
      helpful: 1,
      views: 0,
    });
    await admin.mutation(ref("moderate"), {
      lessonId,
      action: "hide",
      reason: "Review copyright",
    });
    await expect(
      other.mutation(ref("setSignals"), { lessonId, saved: true }),
    ).rejects.toThrow();
    await other.mutation(ref("setSignals"), { lessonId, helpful: false });
    await other.mutation(ref("setSignals"), { lessonId, helpful: false });
    await admin.mutation(ref("moderate"), {
      lessonId,
      action: "restore",
      reason: "Review cleared",
    });
    expect((await t.query(ref("get"), { lessonId })).counts).toEqual({
      saves: 1,
      helpful: 0,
      views: 0,
    });
  });
  it("deduplicates authenticated meaningful views by user and UTC day, not version", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T23:59:00Z"));
    try {
      const { t, other, owner, lessonId, versionId } = await setup();
      const args = {
        lessonId,
        versionId: versionId!,
        blockId: "one",
        engagedSeconds: 15,
      };
      await expect(t.mutation(ref("recordView"), args)).rejects.toThrow(
        "authenticated",
      );
      for (const bad of [
        { engagedSeconds: 14 },
        { engagedSeconds: Number.NaN },
        { blockId: "fabricated" },
      ])
        await expect(
          other.mutation(ref("recordView"), { ...args, ...bad }),
        ).rejects.toThrow("engagement");
      expect(await other.mutation(ref("recordView"), args)).toBe(true);
      expect(
        await other.mutation(ref("recordView"), { ...args, blockId: "two" }),
      ).toBe(false);
      const newer = await owner.mutation(api.lessons.publish, {
        lessonId,
        expectedRevision: 1,
        visibility: "public",
      });
      if (!newer.ok) throw new Error("publish failed");
      await expect(other.mutation(ref("recordView"), args)).rejects.toThrow(
        "engagement",
      );
      expect(
        await other.mutation(ref("recordView"), {
          ...args,
          versionId: newer.versionId,
        }),
      ).toBe(false);
      expect(
        await owner.mutation(ref("recordView"), {
          ...args,
          versionId: newer.versionId,
        }),
      ).toBe(true);
      vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
      expect(
        await other.mutation(ref("recordView"), {
          ...args,
          versionId: newer.versionId,
        }),
      ).toBe(true);
      expect((await t.query(ref("get"), { lessonId })).counts.views).toBe(3);
      expect(
        await t.run((ctx) => ctx.db.query("learnCommunityViews").take(10)),
      ).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("isolates progress by identity/version and rejects stale sessions, writes and invalid blocks", async () => {
    const { t, other, owner, lessonId, versionId } = await setup();
    const key = { lessonId, versionId: versionId! };
    await expect(t.query(ref("getProgress"), key)).rejects.toThrow(
      "authenticated",
    );
    const sessionSeq = await other.mutation(ref("startSession"), key);
    expect(
      await other.mutation(ref("completeBlocks"), {
        ...key,
        sessionSeq,
        writeSeq: 2,
        blockIds: ["one", "one"],
      }),
    ).toBe(true);
    expect(
      await other.mutation(ref("completeBlocks"), {
        ...key,
        sessionSeq,
        writeSeq: 1,
        blockIds: ["two"],
      }),
    ).toBe(false);
    expect(
      await other.mutation(ref("completeBlocks"), {
        ...key,
        sessionSeq,
        writeSeq: 2,
        blockIds: ["two"],
      }),
    ).toBe(false);
    expect(
      (await other.query(ref("getProgress"), key))?.completedBlocks,
    ).toEqual(["one"]);
    const next = await other.mutation(ref("startSession"), key);
    expect(next).toBe(sessionSeq + 1);
    expect(
      await other.mutation(ref("completeBlocks"), {
        ...key,
        sessionSeq,
        writeSeq: 99,
        blockIds: ["two"],
      }),
    ).toBe(false);
    for (const bad of [
      { blockIds: ["invalid"] },
      { blockIds: Array(501).fill("one") },
      { writeSeq: -1 },
      { sessionSeq: 1.5 },
    ])
      await expect(
        other.mutation(ref("completeBlocks"), {
          ...key,
          sessionSeq: next,
          writeSeq: 1,
          blockIds: ["two"],
          ...bad,
        }),
      ).rejects.toThrow();
    expect(
      await other.mutation(ref("completeBlocks"), {
        ...key,
        sessionSeq: next,
        writeSeq: 1,
        blockIds: ["two"],
      }),
    ).toBe(true);
    expect(
      (await other.query(ref("getProgress"), key))?.completedBlocks,
    ).toEqual(["one", "two"]);
    expect(await owner.query(ref("getProgress"), key)).toBeNull();
    const anotherIssuer = t.withIdentity({
      ...otherCreatorIdentity,
      issuer: "https://different.test",
      tokenIdentifier: "https://different.test|user_creator_2",
    });
    expect(await anotherIssuer.query(ref("getProgress"), key)).toBeNull();
    const published = await owner.mutation(api.lessons.publish, {
      lessonId,
      expectedRevision: 1,
      visibility: "public",
    });
    if (!published.ok) throw new Error("publish failed");
    expect(
      await other.query(ref("getProgress"), {
        lessonId,
        versionId: published.versionId,
      }),
    ).toBeNull();
    await expect(other.query(ref("getProgress"), key)).rejects.toThrow(
      "unauthorized",
    );
    // Valid ID from this deployment but belongs to another lesson.
    const foreignLesson = await owner.mutation(api.lessons.create, {
      metadata,
      document,
    });
    await expect(
      owner.mutation(ref("startSession"), {
        lessonId: foreignLesson,
        versionId: versionId!,
      }),
    ).rejects.toThrow("Version");
  });
  it("keeps revision progress private, bounds target selection and refuses stale draft revisions", async () => {
    const { t, other, owner, lessonId, versionId } = await setup();
    await expect(
      other.mutation(ref("startSession"), { lessonId, revision: 1 }),
    ).rejects.toThrow("unauthorized");
    await expect(
      owner.mutation(ref("startSession"), { lessonId }),
    ).rejects.toThrow("exactly one");
    await expect(
      owner.mutation(ref("startSession"), { lessonId, revision: 1, versionId }),
    ).rejects.toThrow("exactly one");
    await owner.mutation(ref("startSession"), { lessonId, revision: 1 });
    await owner.mutation(api.lessons.saveDraft, {
      lessonId,
      expectedRevision: 1,
      document,
    });
    await expect(
      owner.mutation(ref("completeBlocks"), {
        lessonId,
        revision: 1,
        sessionSeq: 1,
        writeSeq: 1,
        blockIds: ["one"],
      }),
    ).rejects.toThrow("Stale");
    await t.run(async (ctx) => {
      await ctx.db.insert("lessonPermissions", {
        lessonId,
        userId: otherCreatorIdentity.subject,
        role: "reader",
      });
    });
    await expect(
      other.mutation(ref("startSession"), { lessonId, revision: 2 }),
    ).rejects.toThrow("unauthorized");
    expect(
      await owner.query(ref("getProgress"), { lessonId, revision: 2 }),
    ).toBeNull();
  });
  it("creates stable admin concepts and reports exposure only without altering quiz data", async () => {
    const { t, admin, other, owner, lessonId, versionId } = await setup();
    const concept = {
      slug: "stable-concept",
      title: "Concept",
      description: "Human-defined concept",
    };
    await expect(other.mutation(ref("createConcept"), concept)).rejects.toThrow(
      "admin",
    );
    const conceptId = await admin.mutation(ref("createConcept"), concept);
    expect(await admin.mutation(ref("createConcept"), concept)).toBe(conceptId);
    await expect(
      admin.mutation(ref("createConcept"), {
        ...concept,
        title: "Changed meaning",
      }),
    ).rejects.toThrow("already defined");
    const mapping = {
      lessonId,
      versionId: versionId!,
      blockId: "one",
      conceptId,
    };
    await expect(other.mutation(ref("mapConcept"), mapping)).rejects.toThrow(
      "admin",
    );
    const mappingId = await admin.mutation(ref("mapConcept"), mapping);
    expect(await admin.mutation(ref("mapConcept"), mapping)).toBe(mappingId);
    const questionId = await t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", {
        ...quizFixture,
        creatorId: creatorIdentity.subject,
        creatorUsername: "creator",
      });
      return ctx.db.insert("questions", { ...questionFixtures.mcq, quizId });
    });
    const before = await t.run((ctx) => ctx.db.get("questions", questionId));
    await expect(
      admin.mutation(ref("mapConcept"), { ...mapping, questionId }),
    ).rejects.toThrow("embedded quiz");
    expect(await t.run((ctx) => ctx.db.get("questions", questionId))).toEqual(
      before,
    );
    const evidenceArgs = { lessonId, versionId: versionId!, conceptId };
    expect(
      (await other.query(ref("learningEvidence"), evidenceArgs)).state,
    ).toBe("no_evidence");
    const sessionSeq = await other.mutation(ref("startSession"), {
      lessonId,
      versionId,
    });
    await other.mutation(ref("completeBlocks"), {
      lessonId,
      versionId,
      sessionSeq,
      writeSeq: 1,
      blockIds: ["one"],
    });
    const evidence = await other.query(ref("learningEvidence"), evidenceArgs);
    expect(evidence.state).toBe("exposure_reported");
    expect(evidence.reason).toContain("mastery are unconfirmed");
    expect(
      (await owner.query(ref("learningEvidence"), evidenceArgs)).state,
    ).toBe("no_evidence");
  });
  it("moderates with immutable reasons, private reports and owner appeals; preserves published data", async () => {
    const { t, admin, other, owner, lessonId, versionId } = await setup();
    const args = {
      lessonId,
      category: "copyright" as const,
      detail: "Please review attribution",
    };
    const reportId = await other.mutation(ref("report"), args);
    expect(await other.mutation(ref("report"), args)).toBe(reportId);
    expect((await t.query(ref("get"), { lessonId })).versionId).toBe(versionId);
    await expect(
      other.query(ref("listReports"), { status: "open" }),
    ).rejects.toThrow("admin");
    await expect(
      other.mutation(ref("moderate"), {
        lessonId,
        action: "remove",
        reason: "test",
      }),
    ).rejects.toThrow("admin");
    await expect(
      admin.mutation(ref("moderate"), {
        lessonId,
        action: "remove",
        reason: " ",
      }),
    ).rejects.toThrow("text");
    const auditId = await admin.mutation(ref("moderate"), {
      lessonId,
      action: "remove",
      reason: "Takedown pending rights review",
      reportId,
    });
    const auditBefore = await t.run((ctx) =>
      ctx.db.get("learnModerationAudit", auditId),
    );
    await expect(t.query(ref("get"), { lessonId })).rejects.toThrow();
    await expect(owner.query(ref("get"), { lessonId })).rejects.toThrow(
      "not public",
    );
    await expect(
      other.mutation(ref("appeal"), {
        lessonId,
        auditId,
        reason: "I am not owner",
      }),
    ).rejects.toThrow();
    const appealId = await owner.mutation(ref("appeal"), {
      lessonId,
      auditId,
      reason: "Licensed use",
    });
    expect(
      await owner.mutation(ref("appeal"), {
        lessonId,
        auditId,
        reason: "Licensed use",
      }),
    ).toBe(appealId);
    await expect(other.query(ref("getAppeal"), { appealId })).rejects.toThrow(
      "admin",
    );
    await expect(
      other.query(ref("moderationHistory"), { lessonId }),
    ).rejects.toThrow("admin");
    await admin.mutation(ref("resolveAppeal"), {
      appealId,
      accepted: true,
      reason: "Rights confirmed",
    });
    expect((await owner.query(ref("getAppeal"), { appealId }))?.status).toBe(
      "accepted",
    );
    await expect(t.query(ref("get"), { lessonId })).rejects.toThrow();
    for (const action of ["review", "hide", "restore"] as const) {
      await admin.mutation(ref("moderate"), {
        lessonId,
        action,
        reason: "Structured review outcome",
      });
      if (action !== "restore")
        await expect(t.query(ref("get"), { lessonId })).rejects.toThrow();
    }
    expect((await t.query(ref("get"), { lessonId })).document).toEqual(
      document,
    );
    expect(
      await t.run((ctx) => ctx.db.get("learnModerationAudit", auditId)),
    ).toEqual(auditBefore);
    expect(
      await owner.query(ref("moderationHistory"), { lessonId }),
    ).toHaveLength(4);
    expect(
      await admin.query(ref("listReports"), { status: "resolved" }),
    ).toHaveLength(1);
  });
  it("keeps identity claims private and independent of public version quality", async () => {
    const { t, admin, other, owner, lessonId, versionId } = await setup();
    const claimId = await owner.mutation(ref("claimIdentity"), {
      role: "educator",
      institution: "Example institution",
    });
    expect(
      await owner.mutation(ref("claimIdentity"), {
        role: "educator",
        institution: "Example institution",
      }),
    ).toBe(claimId);
    await owner.mutation(ref("claimIdentity"), {
      role: "student",
      institution: "Example institution",
    });
    await expect(
      other.mutation(ref("reviewIdentity"), {
        claimId,
        status: "verified",
        reason: "self verified",
      }),
    ).rejects.toThrow("admin");
    await admin.mutation(ref("reviewIdentity"), {
      claimId,
      status: "verified",
      reason: "External identity review completed",
    });
    expect(await other.query(ref("getMyClaims"), {})).toEqual([]);
    await expect(t.query(ref("getMyClaims"), {})).rejects.toThrow(
      "authenticated",
    );
    expect(
      (await owner.query(ref("getMyClaims"), {})).find(
        (c) => c.role === "educator",
      )?.status,
    ).toBe("verified");
    expect((await t.query(ref("get"), { lessonId })).quality).toBe(
      "unreviewed",
    );
    await expect(
      other.mutation(ref("reviewQuality"), {
        lessonId,
        versionId: versionId!,
        status: "reviewed",
        reason: "test",
      }),
    ).rejects.toThrow("admin");
    await admin.mutation(ref("reviewQuality"), {
      lessonId,
      versionId: versionId!,
      status: "needs_changes",
      reason: "Missing context",
    });
    expect((await t.query(ref("get"), { lessonId })).quality).toBe(
      "needs_changes",
    );
    await admin.mutation(ref("reviewIdentity"), {
      claimId,
      status: "revoked",
      reason: "Identity no longer confirmed",
    });
    expect((await t.query(ref("get"), { lessonId })).quality).toBe(
      "needs_changes",
    );
    const published = await owner.mutation(api.lessons.publish, {
      lessonId,
      expectedRevision: 1,
      visibility: "public",
    });
    expect(published.ok).toBe(true);
    expect((await t.query(ref("get"), { lessonId })).quality).toBe(
      "unreviewed",
    );
    const claims = await owner.query(ref("getMyClaims"), {});
    expect(claims).toHaveLength(2);
    expect(claims.every((c) => !("evidence" in c) && !("storageId" in c))).toBe(
      true,
    );
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("learnIdentityAudit")
          .withIndex("by_claimId", (q) => q.eq("claimId", claimId))
          .take(10),
      ),
    ).toHaveLength(2);
  });
});

describe("Bounded community discovery and review reads", () => {
  it("ranks published snapshots deterministically with explainable freshness and exploration", async () => {
    const { t, owner, other, admin, lessonId } = await setup();
    const newId = await owner.mutation(api.lessons.create, {
      metadata: { ...metadata, title: "Explore" },
      document,
    });
    await owner.mutation(api.lessons.publish, {
      lessonId: newId,
      expectedRevision: 0,
      visibility: "public",
    });
    const privateId = await owner.mutation(api.lessons.create, {
      metadata: { ...metadata, title: "Private" },
      document,
    });
    await other.mutation(ref("setSignals"), {
      lessonId,
      saved: true,
      helpful: true,
    });
    await owner.mutation(api.lessons.saveDraft, {
      lessonId,
      expectedRevision: 1,
      document,
      metadata: { ...metadata, title: "Secret draft title" },
    });
    const args = { asOf: Date.now(), limit: 20 };
    const first = await t.query(ref("rank"), args);
    expect(await t.query(ref("rank"), args)).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first[0].lessonId).toBe(lessonId);
    expect(first.map((r) => r.lessonId)).not.toContain(privateId);
    expect(first[0].metadata.title).toBe(metadata.title);
    for (const item of first)
      expect(item.score).toBe(
        item.signals.engagement +
          item.signals.freshness +
          item.signals.exploration,
      );
    expect(
      (
        await t.query(ref("rank"), { ...args, asOf: args.asOf + 604_800_000 })
      )[0].signals.freshness,
    ).toBeLessThan(first[0].signals.freshness);
    expect(await t.query(ref("rank"), { ...args, limit: 1 })).toHaveLength(1);
    for (const bad of [
      { limit: 21 },
      { limit: 0 },
      { limit: 1.5 },
      { asOf: Number.NaN },
    ])
      await expect(t.query(ref("rank"), { ...args, ...bad })).rejects.toThrow();
    await admin.mutation(ref("moderate"), {
      lessonId,
      action: "hide",
      reason: "Review",
    });
    expect((await t.query(ref("rank"), args)).map((r) => r.lessonId)).toEqual([
      newId,
    ]);
    await owner.mutation(api.lessons.setLifecycle, {
      lessonId: newId,
      expectedRevision: 1,
      action: "archive",
    });
    expect(await t.query(ref("rank"), args)).toEqual([]);
  });
  it("scopes report, mapping, identity and quality reads and preserves review audits", async () => {
    const { t, owner, other, admin, lessonId, versionId } = await setup();
    const reportId = await other.mutation(ref("report"), {
      lessonId,
      category: "inaccurate",
      detail: "Missing qualification",
    });
    expect((await other.query(ref("getReport"), { reportId }))?.detail).toBe(
      "Missing qualification",
    );
    await expect(owner.query(ref("getReport"), { reportId })).rejects.toThrow(
      "admin",
    );
    await expect(t.query(ref("getReport"), { reportId })).rejects.toThrow(
      "authenticated",
    );
    expect((await admin.query(ref("getReport"), { reportId }))?.status).toBe(
      "open",
    );
    await owner.mutation(ref("setSignals"), { lessonId, saved: true });
    expect(await owner.query(ref("getMySignals"), { lessonId })).toEqual({
      saved: true,
      helpful: false,
    });
    expect(await other.query(ref("getMySignals"), { lessonId })).toEqual({
      saved: false,
      helpful: false,
    });
    const claimId = await owner.mutation(ref("claimIdentity"), {
      role: "student",
      institution: "University",
    });
    await expect(
      other.query(ref("listIdentityClaims"), { status: "pending" }),
    ).rejects.toThrow("admin");
    expect(
      (await admin.query(ref("listIdentityClaims"), { status: "pending" })).map(
        (c) => c._id,
      ),
    ).toContain(claimId);
    await admin.mutation(ref("reviewQuality"), {
      lessonId,
      versionId: versionId!,
      status: "reviewed",
      reason: "First human review",
    });
    const qualityBefore = await t.run((ctx) =>
      ctx.db
        .query("learnQualityAudit")
        .withIndex("by_lessonId_and_versionId", (q) =>
          q.eq("lessonId", lessonId).eq("versionId", versionId!),
        )
        .take(10),
    );
    await admin.mutation(ref("reviewQuality"), {
      lessonId,
      versionId: versionId!,
      status: "needs_changes",
      reason: "Second human review",
    });
    await expect(
      other.query(ref("getQualityReview"), { lessonId, versionId: versionId! }),
    ).rejects.toThrow("admin");
    expect(
      (
        await admin.query(ref("getQualityReview"), {
          lessonId,
          versionId: versionId!,
        })
      )?.reason,
    ).toBe("Second human review");
    const qualityAfter = await t.run((ctx) =>
      ctx.db
        .query("learnQualityAudit")
        .withIndex("by_lessonId_and_versionId", (q) =>
          q.eq("lessonId", lessonId).eq("versionId", versionId!),
        )
        .take(10),
    );
    expect(qualityAfter).toHaveLength(2);
    expect(qualityAfter[0]).toEqual(qualityBefore[0]);
    const conceptId = await admin.mutation(ref("createConcept"), {
      slug: "read-map",
      title: "Map",
      description: "Explicit map",
    });
    const mapArgs = { lessonId, versionId: versionId!, conceptId };
    await admin.mutation(ref("mapConcept"), { ...mapArgs, blockId: "two" });
    expect(await t.query(ref("getConceptMappings"), mapArgs)).toHaveLength(1);
    const auditId = await admin.mutation(ref("moderate"), {
      lessonId,
      action: "remove",
      reason: "Review",
    });
    await expect(t.query(ref("getConceptMappings"), mapArgs)).rejects.toThrow();
    const appealId = await owner.mutation(ref("appeal"), {
      lessonId,
      auditId,
      reason: "Please reconsider",
    });
    await admin.mutation(ref("resolveAppeal"), {
      appealId,
      accepted: false,
      reason: "Review upheld",
    });
    await expect(
      admin.mutation(ref("resolveAppeal"), {
        appealId,
        accepted: true,
        reason: "Rewrite old decision",
      }),
    ).rejects.toThrow("not open");
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("learnAppealAudit")
          .withIndex("by_appealId", (q) => q.eq("appealId", appealId))
          .take(10),
      ),
    ).toHaveLength(1);
  });
  it("rejects writes by restricted accounts and bounds text inputs", async () => {
    const { t, other, owner, lessonId } = await setup();
    await expect(
      owner.mutation(ref("claimIdentity"), {
        role: "student",
        institution: "x".repeat(201),
      }),
    ).rejects.toThrow("length");
    await expect(
      owner.mutation(ref("report"), {
        lessonId,
        category: "spam",
        detail: "x".repeat(2001),
      }),
    ).rejects.toThrow("length");
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: otherCreatorIdentity.subject,
        name: "Restricted",
        email: "r@example.com",
        username: "restricted",
        createdAt: 0,
        isBanned: true,
      });
    });
    await expect(
      other.mutation(ref("setSignals"), { lessonId, saved: true }),
    ).rejects.toThrow("ACCOUNT_BANNED");
    await expect(
      other.mutation(ref("claimIdentity"), {
        role: "educator",
        institution: "School",
      }),
    ).rejects.toThrow("ACCOUNT_BANNED");
  });
});
