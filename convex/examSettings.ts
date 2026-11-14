import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveUser, creatorRestricted } from "./authz";
import { defaultExamSettings, examSettings, validateExamSettings } from "./examSettingsModel";

type Ctx = MutationCtx | QueryCtx;

async function owned(ctx: Ctx, draftId: Id<"examBuilderDrafts">) {
  const { identity, user } = await requireActiveUser(ctx);
  if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
  const ownerId = identity.subject;
  const draft = await ctx.db.get("examBuilderDrafts", draftId);
  if (!draft || draft.ownerId !== ownerId) throw new Error("NOT_FOUND: Exam draft not found.");
  const course = await ctx.db.get("learnCollections", draft.courseId);
  if (!course || course.ownerId !== ownerId || course.archived ||
      course.communityState === "removed")
    throw new Error("NOT_FOUND: Active owned course not found.");
  if (await creatorRestricted(ctx, ownerId)) throw new Error("FORBIDDEN: Account restricted.");
  const release = await ctx.db.query("examReleases")
    .withIndex("by_draft", q => q.eq("draftId", draftId)).unique();
  if (release && (release.ownerId !== ownerId || release.courseId !== course._id))
    throw new Error("NOT_FOUND: Exam release not found.");
  return { draft, release };
}

export const getForDraft = query({
  args: { draftId: v.id("examBuilderDrafts") },
  handler: async (ctx, { draftId }) => {
    const { draft, release } = await owned(ctx, draftId);
    const snapshot = release ? await ctx.db.get("examSnapshots", release.activeSnapshotId) : null;
    if (release && (!snapshot || snapshot.ownerId !== draft.ownerId ||
        snapshot.draftId !== draftId))
      throw new Error("NOT_FOUND: Sealed exam not found.");
    return {
      settings: release?.settings ?? defaultExamSettings,
      revision: release?.settingsRevision ?? 0,
      snapshotId: release?.activeSnapshotId ?? null,
      snapshotVersion: snapshot?.version ?? null,
      snapshotDraftRevision: snapshot?.draftRevision ?? null,
      draftRevision: draft.revision,
      preparedForAudience: release?.preparedForAudience ?? false,
      studentEntryEnabled: release?.studentEntryEnabled ?? false,
    };
  },
});

/** Saving policy never grants a student permission, and invalidates preparation. */
export const saveForDraft = mutation({
  args: {
    draftId: v.id("examBuilderDrafts"), expectedRevision: v.number(),
    settings: examSettings,
  },
  returns: v.number(),
  handler: async (ctx, { draftId, expectedRevision, settings }) => {
    const { release } = await owned(ctx, draftId);
    if (!release) throw new Error("SNAPSHOT_REQUIRED: Seal the exam before saving its release settings.");
    if (release.studentEntryEnabled)
      throw new Error("EXAM_ACTIVE: Close the student release before editing settings.");
    if (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision !== (release.settingsRevision ?? 0))
      throw new Error("REVISION_CONFLICT: Exam settings changed; reload before saving.");
    const clean = validateExamSettings(settings, Date.now());
    await ctx.db.patch("examReleases", release._id, {
      settings: clean, settingsRevision: expectedRevision + 1,
      preparedForAudience: false, updatedAt: Date.now(),
    });
    return expectedRevision + 1;
  },
});

/** A readiness flag only. It DOES NOT enable exam starts or create an audience. */
export const setPrepared = mutation({
  args: { draftId: v.id("examBuilderDrafts"), expectedRevision: v.number(),
    prepared: v.boolean() },
  returns: v.number(),
  handler: async (ctx, { draftId, expectedRevision, prepared }) => {
    const { draft, release } = await owned(ctx, draftId);
    if (!release) throw new Error("SNAPSHOT_REQUIRED: Seal the exam first.");
    if (release.studentEntryEnabled)
      throw new Error("EXAM_ACTIVE: Cannot change readiness during student entry.");
    if (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision !== (release.settingsRevision ?? 0))
      throw new Error("REVISION_CONFLICT: Exam settings changed; reload before proceeding.");
    if (prepared) {
      const snapshot = await ctx.db.get("examSnapshots", release.activeSnapshotId);
      if (!snapshot || snapshot.ownerId !== draft.ownerId ||
          snapshot.draftId !== draftId || snapshot.draftRevision !== draft.revision)
        throw new Error("STALE_SNAPSHOT: Seal the latest exam revision before preparing.");
      if (!release.settings)
        throw new Error("SETTINGS_REQUIRED: Save exam settings before preparing.");
      validateExamSettings(release.settings, Date.now());
    }
    await ctx.db.patch("examReleases", release._id, {
      preparedForAudience: prepared, settingsRevision: expectedRevision + 1,
      updatedAt: Date.now(),
    });
    return expectedRevision + 1;
  },
});
