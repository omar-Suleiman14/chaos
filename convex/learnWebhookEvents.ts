/** Metadata-only Learn events using the existing signed, retryable transport. */
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildBody, enqueueDelivery } from "./webhookEvents";
import { learnWebhookEventTypes, type LearnWebhookEventType } from "./webhookModel";

type Ctx = MutationCtx | QueryCtx;
export function isLearnWebhookEvent(event: string): event is LearnWebhookEventType {
  return learnWebhookEventTypes.some((value) => value === event);
}

export async function learnWebhookOwnerTitle(ctx: Ctx, ownerId: string, ref: string): Promise<string | null> {
  const match = /^(lesson|collection)_([A-Za-z0-9]+)$/.exec(ref);
  if (!match) return null;
  if (match[1] === "lesson") {
    const id = ctx.db.normalizeId("lessons", match[2]);
    const asset = id ? await ctx.db.get("lessons", id) : null;
    return asset?.ownerId === ownerId && asset.communityState !== "removed" && asset.communityState !== "hidden" ? asset.metadata.title : null;
  }
  const id = ctx.db.normalizeId("learnCollections", match[2]);
  const asset = id ? await ctx.db.get("learnCollections", id) : null;
  return asset?.ownerId === ownerId && asset.communityState !== "removed" && asset.communityState !== "hidden" ? asset.metadata.title : null;
}

/** Checked both at enqueue and immediately before every transport attempt. */
export async function mayDeliverLearnWebhook(ctx: Ctx, sub: Doc<"webhookSubscriptions">, event: string, ref: string): Promise<boolean> {
  if (!isLearnWebhookEvent(event) || sub.status !== "active" || !sub.events.includes(event)) return false;
  if ((event.startsWith("collection.") ? !ref.startsWith("collection_") : !ref.startsWith("lesson_"))) return false;
  if (await learnWebhookOwnerTitle(ctx, sub.ownerId, ref) === null) return false;
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", sub.ownerId)).first();
  if (!owner || owner.isBanned || owner.suspendedUntil) return false;
  if (sub.connectionId || sub.target === "connection") {
    const token = sub.connectionId ? await ctx.db.get("integrationTokens", sub.connectionId) : null;
    // Collections have no collection read scope yet; fail closed until that contract exists.
    if (ref.startsWith("collection_")) return false;
    if (!token || sub.target !== "connection" || token.ownerId !== sub.ownerId || token.revokedAt !== undefined
      || (token.expiresAt !== undefined && token.expiresAt <= Date.now()) || sub.includeAnswers
      || !token.scopes.includes("webhooks:manage") || !token.scopes.includes("lessons:read")) return false;
    // Explicit selection is required even for assets created by this connection.
    return token.itemRefs.includes(ref);
  }
  // Legacy `all` means forms/quizzes only, never silently expands to Learn.
  return sub.target === "selected" && sub.itemRefs.includes(ref);
}

export type LearnWebhookChange = {
  event: LearnWebhookEventType;
  /** Stable per committed operation; reuse on retries, use a new key for a new change. */
  operationId: string;
  revision: number;
} & (
  | { lessonId: Id<"lessons">; collectionId?: never; versionId?: Id<"lessonVersions">; curriculumVersionId?: Id<"curriculumVersions">; nodeId?: Id<"curriculumNodes"> }
  | { collectionId: Id<"learnCollections">; lessonId?: never; versionId?: Id<"collectionVersions">; curriculumVersionId?: never; nodeId?: never }
);

/** Call within the same mutation transaction as the durable asset change. */
export async function enqueueLearnWebhookEvent(ctx: MutationCtx, change: LearnWebhookChange): Promise<number> {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(change.operationId) || !Number.isSafeInteger(change.revision) || change.revision < 0) throw new Error("INVALID_LEARN_WEBHOOK_EVENT");
  const lesson = change.lessonId ? await ctx.db.get("lessons", change.lessonId) : null;
  const collection = change.collectionId ? await ctx.db.get("learnCollections", change.collectionId) : null;
  const asset = lesson ?? collection;
  if (!asset) return 0;
  const ref = lesson ? `lesson_${lesson._id}` : `collection_${collection!._id}`;
  const eventId = `evt_learn:${change.event}:${ref}:${change.operationId}`;
  // Construct an allowlisted payload, never serialize caller input or the document.
  const data = { itemRef: ref, revision: change.revision,
    ...(lesson ? { lessonId: lesson._id } : { collectionId: collection!._id }),
    ...(change.versionId ? { versionId: change.versionId } : {}),
    ...(change.curriculumVersionId ? { curriculumVersionId: change.curriculumVersionId } : {}),
    ...(change.nodeId ? { nodeId: change.nodeId } : {}) };
  const body = buildBody(eventId, change.event, Date.now(), data);
  const subs = await ctx.db.query("webhookSubscriptions").withIndex("by_ownerId", (q) => q.eq("ownerId", asset.ownerId)).take(100);
  let queued = 0;
  for (const sub of subs) {
    if (!await mayDeliverLearnWebhook(ctx, sub, change.event, ref)) continue;
    const prior = await ctx.db.query("webhookDeliveries").withIndex("by_subscriptionId_and_eventId", (q) => q.eq("subscriptionId", sub._id).eq("eventId", eventId)).first();
    if (prior) continue;
    await enqueueDelivery(ctx, sub, { event: change.event, eventId, itemRef: ref, body, containsAnswers: false });
    queued++;
  }
  return queued;
}
