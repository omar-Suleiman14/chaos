import { authorDb } from "./authorIndex";
import { searchHit } from "./learnSearch";
import { directoryHit } from "./learnDiscovery";
import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator, makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { activeIntegrationToken, findIdempotent, logConnectionActivity } from "./integrationModel";
import { requireLearnActor } from "./mcpLearn";
import { requirePublicCommunityLesson, setSignalsForActor } from "./learnCommunity";
import { forkLessonForActor } from "./lessons";
import { sha256Hex } from "./serverUtils";
import type { Id } from "./_generated/dataModel";

/** Matches Convex's issuer-qualified native identity; configuration is server-only. */
export function canonicalCommunityActor(subject: string) {
  // eslint-disable-next-line @convex-dev/no-process-env -- configured auth issuer, not caller input
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();
  if (!issuer) throw new Error("CLERK_JWT_ISSUER_DOMAIN is required for community identity parity");
  const url = new URL(issuer);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid configured auth issuer");
  return { subject, tokenIdentifier: `${issuer}|${subject}` };
}
async function authorize(ctx: QueryCtx | MutationCtx, tokenId: Id<"integrationTokens">, scope: string) {
  const token = await activeIntegrationToken(ctx, tokenId, Date.now());
  if (!token) throw new Error("TOKEN_REVOKED: Connection unavailable");
  await requireLearnActor(ctx, token.ownerId);
  if (!token.scopes.some(value => value === scope)) throw new Error(`INSUFFICIENT_SCOPE: ${scope} required`);
  return token;
}

const directoryArgs = {
  kind: v.union(v.literal("institution"), v.literal("program"), v.literal("module"), v.literal("creator"), v.literal("tag")),
  creatorMatch: v.optional(v.union(v.literal("username"), v.literal("name"))),
  text: v.string(), institutionId: v.optional(v.id("curriculumInstitutions")), versionId: v.optional(v.id("curriculumVersions")), paginationOpts: paginationOptsValidator,
};
export const directory = internalQuery({
  args: { userId: v.string(), ...directoryArgs }, returns: paginationResultValidator(directoryHit),
  handler: async (ctx, args) => {
    await requireLearnActor(ctx, args.userId);
    const { userId: _actor, ...input } = args;
    return ctx.runQuery(makeFunctionReference<"query">("learnDiscovery:search"), input);
  },
});
export const directoryForToken = internalQuery({
  args: { tokenId: v.id("integrationTokens"), ...directoryArgs }, returns: paginationResultValidator(directoryHit),
  handler: async (ctx, args) => {
    await authorize(ctx, args.tokenId, "community:read");
    const { tokenId: _token, ...input } = args;
    return ctx.runQuery(makeFunctionReference<"query">("learnDiscovery:search"), input);
  },
});

/** OAuth transport must supply userId from its authenticated envelope. */
export const saveLesson = internalMutation({
  args: { userId: v.string(), lessonId: v.id("lessons"), saved: v.optional(v.boolean()) },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const subject = await requireLearnActor(ctx, args.userId);
    const saved = args.saved ?? true;
    await setSignalsForActor(ctx, canonicalCommunityActor(subject), { lessonId: args.lessonId, saved });
    return { saved };
  },
});

/** Returns published search snippets only, never source bytes or private drafts. */
export const searchPublic = internalQuery({
  args: { tokenId: v.id("integrationTokens"), text: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(searchHit),
  handler: async (ctx, args) => {
    await authorize(ctx, args.tokenId, "community:read");
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error("VALIDATION_FAILED: Page size must be 1-50");
    return ctx.runQuery(makeFunctionReference<"query">("learnSearch:searchPublic"), { text: args.text, paginationOpts: args.paginationOpts });
  },
});
export const savePublic = internalMutation({
  args: { tokenId: v.id("integrationTokens"), lessonId: v.id("lessons"), saved: v.boolean() },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const token = await authorize(ctx, args.tokenId, "community:save");
    await setSignalsForActor(ctx, canonicalCommunityActor(token.ownerId), { lessonId: args.lessonId, saved: args.saved });
    await logConnectionActivity(ctx, token._id, "community.saved", `lesson_${args.lessonId}`);
    return { saved: args.saved };
  },
});
export const forkPublic = internalMutation({
  args: { tokenId: v.id("integrationTokens"), lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), idempotencyKey: v.string() },
  returns: v.object({ lessonId: v.id("lessons"), revision: v.number() }),
  handler: async (ctx, args) => {
    const token = await authorize(ctx, args.tokenId, "community:fork");
    const { version } = await requirePublicCommunityLesson(ctx, token.ownerId, args.lessonId);
    if (version._id !== args.versionId) throw new Error("NOT_FOUND: Public version unavailable");
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(args.idempotencyKey)) throw new Error("VALIDATION_FAILED: Invalid Idempotency-Key");
    const key = `v2:community:fork:${args.idempotencyKey}`;
    const requestHash = await sha256Hex(JSON.stringify([args.lessonId, args.versionId]));
    const prior = await findIdempotent(ctx, token._id, key);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT: Key already used with different input");
      const parsed: unknown = JSON.parse(prior.body);
      if (!parsed || typeof parsed !== "object" || !("lessonId" in parsed) || typeof parsed.lessonId !== "string") throw new Error("Invalid stored fork result");
      const id = ctx.db.normalizeId("lessons", parsed.lessonId);
      const lesson = id ? await ctx.db.get("lessons", id) : null;
      const link = id ? await ctx.db.query("integrationCreatedItems").withIndex("by_tokenId_and_itemRef", q => q.eq("tokenId", token._id).eq("itemRef", `lesson_${id}`)).unique() : null;
      if (!lesson || lesson.ownerId !== token.ownerId || !link) throw new Error("NOT_FOUND: Fork no longer linked to this connection");
      return { lessonId: lesson._id, revision: 0 };
    }
    const lessonId = await forkLessonForActor(ctx, token.ownerId, args);
    await authorDb(ctx).patch("lessons", lessonId, { externalOrigin: { connectionId: token._id, createdAt: Date.now() } });
    await ctx.db.insert("integrationCreatedItems", { tokenId: token._id, itemRef: `lesson_${lessonId}`, createdAt: Date.now() });
    const result = { lessonId, revision: 0 };
    await ctx.db.insert("integrationIdempotency", { tokenId: token._id, key, requestHash, status: 201, body: JSON.stringify(result), createdAt: Date.now() });
    await logConnectionActivity(ctx, token._id, "community.forked", `lesson_${lessonId}`);
    return result;
  },
});
