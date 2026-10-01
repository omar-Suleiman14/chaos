import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { creatorRestricted, requireActiveUser } from "./authz";
import { assessmentRef } from "./quizForkModel";
import { lessonAccess, lessonAccessForActor } from "./lessons";
import { recentEvidence } from "./learnPractice";
import { summarizeEvidence } from "./learnPracticeModel";
import type { Id } from "./_generated/dataModel";
import { attachAssessmentForActor } from "./learnCollections";
import { canonicalCommunityActor } from "./learnCommunityIntegrations";

/** Public badge facts only, with expiry so an open client cannot keep a stale badge. */
export const publicIdentity = query({
  args: { username: v.string() },
  returns: v.array(v.object({ kind: v.union(v.literal("student"), v.literal("educator")), expiresAt: v.number() })),
  handler: async (ctx, args) => {
    if (!args.username || args.username.length > 100) return [];
    const user = await ctx.db.query("users").withIndex("by_username", q => q.eq("username", args.username)).unique();
    if (!user || await creatorRestricted(ctx, user.clerkId)) return [];
    const key = canonicalCommunityActor(user.clerkId).tokenIdentifier;
    const claims = await ctx.db.query("learnIdentityClaims").withIndex("by_userKey_and_role", q => q.eq("userKey", key)).take(2);
    return claims.filter(c => c.status === "verified" && c.method === "manual_review" && !!c.reviewedBy && (c.expiresAt ?? 0) > Date.now()).map(c => ({ kind: c.role, expiresAt: c.expiresAt! }));
  },
});

const formAttachment = v.object({ id: v.id("forms"), label: v.string(), order: v.number() });
/** Atomic owner-only replacement, preserving classic links and detecting stale panels. */
export const saveFormAttachments = mutation({
  args: { lessonId: v.id("lessons"), expected: v.array(formAttachment), attachments: v.array(formAttachment) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const lesson = await lessonAccess(ctx, args.lessonId, true);
    if (lesson.ownerId !== identity.subject) throw new Error("Only the lesson owner can edit practice attachments.");
    if (args.attachments.length > 50 || args.expected.length > 50 || new Set(args.attachments.map(a => a.id)).size !== args.attachments.length) throw new Error("Invalid assessment relationships.");
    const current = await ctx.db.query("lessonAssessments").withIndex("by_lessonId_and_order", q => q.eq("lessonId", args.lessonId)).take(51);
    const forms = current.filter(row => row.asset.kind === "form");
    const normalize = (rows: { id: string; label: string; order: number }[]) => JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)));
    if (normalize(forms.map(row => ({ id: row.asset.id, label: row.label, order: row.order }))) !== normalize(args.expected)) throw new Error("Practice changed elsewhere. Refresh before saving again.");
    for (const row of forms) if (!args.attachments.some(a => a.id === row.asset.id)) await ctx.db.delete("lessonAssessments", row._id);
    for (const attachment of args.attachments) await attachAssessmentForActor(ctx, identity.subject, { lessonId: args.lessonId, asset: { kind: "form", id: attachment.id }, label: attachment.label, order: attachment.order });
    return null;
  },
});

/** Publication identifiers only: no answer keys or respondent evidence leave here. */
export const forkSource = query({
  args: { asset: assessmentRef },
  returns: v.union(v.null(), v.object({ formVersionId: v.id("formVersions") }), v.object({ expectedPublishedAt: v.number() })),
  handler: async (ctx, { asset }) => {
    const { identity } = await requireActiveUser(ctx);
    if (asset.kind === "form") {
      const form = await ctx.db.get("forms", asset.id);
      if (!form || form.isBanned || await creatorRestricted(ctx, form.ownerId) || form.publishedVersion === undefined) return null;
      if (form.ownerId !== identity.subject && (form.status !== "live" || form.settings.access !== "public" || form.settings.allowedEmails?.length || form.settings.allowedDomains?.length)) return null;
      const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", form.publishedVersion!)).unique();
      return version?.definition.quiz?.enabled ? { formVersionId: version._id } : null;
    }
    const quiz = await ctx.db.get("quizzes", asset.id);
    return quiz?.isPublished && quiz.publishedSnapshot && quiz.publishedAt !== undefined && !quiz.isBanned && !await creatorRestricted(ctx, quiz.creatorId) ? { expectedPublishedAt: quiz.publishedAt } : null;
  },
});

/** Bounded discovery of this account's ingested concepts; never raw answers. */
export const myConcepts = query({
  args: {},
  returns: v.object({ concepts: v.array(v.object({ id: v.id("learnConcepts"), title: v.string() })), truncated: v.boolean() }),
  handler: async ctx => {
    const { identity } = await requireActiveUser(ctx);
    const rows = await ctx.db.query("learnPracticeEvidence").withIndex("by_userId_and_formResponseId_and_fieldId_and_conceptId", q => q.eq("userId", identity.tokenIdentifier)).take(201);
    const ids = [...new Set(rows.slice(0, 200).map(row => row.conceptId))];
    const concepts = [];
    for (const id of ids) {
      const concept = await ctx.db.get("learnConcepts", id);
      if (concept) concepts.push({ id, title: concept.title });
    }
    return { concepts, truncated: rows.length > 200 };
  },
});

/** Owned references from selectPractice are suggestions, not access grants. */
export const practiceLink = query({
  args: { formId: v.id("forms"), version: v.number() },
  returns: v.union(v.null(), v.object({ title: v.string(), href: v.string() })),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const form = await ctx.db.get("forms", args.formId);
    if (!form || form.ownerId !== identity.subject || form.status !== "live" || form.isBanned || form.publishedVersion !== args.version || await creatorRestricted(ctx, form.ownerId)) return null;
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", q => q.eq("formId", form._id).eq("version", args.version)).unique();
    return version?.definition.quiz?.enabled ? { title: version.definition.title, href: `/f/${encodeURIComponent(form.shareId)}` } : null;
  },
});

/**
 * The caller's weak concepts (server-graded quiz evidence) with a readable lesson block to
 * revisit. Bounded: 20 concepts from the newest 200 evidence rows, 10 mappings each.
 */
export const weakAreas = query({
  args: { now: v.number() },
  returns: v.array(v.object({ conceptId: v.id("learnConcepts"), title: v.string(), lessonId: v.optional(v.id("lessons")), blockId: v.optional(v.string()), formId: v.id("forms"), lastSeenAt: v.number() })),
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    if (!Number.isFinite(args.now) || args.now < 0) throw new Error("Invalid clock");
    const rows = await ctx.db.query("learnPracticeEvidence").withIndex("by_userId_and_formResponseId_and_fieldId_and_conceptId", q => q.eq("userId", identity.tokenIdentifier)).order("desc").take(200);
    const conceptIds = [...new Set(rows.map(row => row.conceptId))].slice(0, 20);
    const out = [];
    for (const conceptId of conceptIds) {
      const evidence = await recentEvidence(ctx, identity.tokenIdentifier, conceptId, args.now);
      if (!evidence.length || summarizeEvidence(conceptId, evidence, args.now).state !== "weak") continue;
      const concept = await ctx.db.get("learnConcepts", conceptId);
      if (!concept) continue;
      let place: { lessonId: Id<"lessons">; blockId: string } | undefined;
      for (const mapping of await ctx.db.query("learnConceptMappings").withIndex("by_conceptId", q => q.eq("conceptId", conceptId)).take(10)) {
        // Only point at lessons this reader may open.
        try { await lessonAccessForActor(ctx, identity.subject, mapping.lessonId); place = { lessonId: mapping.lessonId, blockId: mapping.blockId }; break; } catch { /* not readable */ }
      }
      out.push({ conceptId, title: concept.title, ...(place ?? {}), formId: evidence[0].formId, lastSeenAt: evidence[0].answeredAt });
    }
    return out;
  },
});
