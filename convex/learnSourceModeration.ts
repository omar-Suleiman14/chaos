import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireActiveUser, requireAdmin, creatorRestricted } from "./authz";
import schema from "./schema";
function reason(text: string) { if (!text.trim() || text.length > 4000) throw new Error("Provide a reason up to 4000 characters"); return text.trim(); }
export const report = mutation({ args: { sourceId: v.id("learnSources"), category: v.union(v.literal("copyright"), v.literal("abuse")), detail: v.string() }, returns: v.id("learnSourceReports"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const source = await ctx.db.get("learnSources", args.sourceId);
  if (!source || source.status === "removed" || (source.ownerId !== identity.subject && (source.metadataVisibility !== "public" || await creatorRestricted(ctx, source.ownerId)))) throw new Error("Source not found or unauthorized");
  const detail = reason(args.detail); const prior = await ctx.db.query("learnSourceReports").withIndex("by_sourceId_and_reporterKey_and_category", q => q.eq("sourceId", source._id).eq("reporterKey", identity.tokenIdentifier).eq("category", args.category)).unique();
  return prior?._id ?? ctx.db.insert("learnSourceReports", { ...args, detail, reporterKey: identity.tokenIdentifier, status: "open", createdAt: Date.now() });
} });
export const queue = query({ args: { status: v.union(v.literal("open"), v.literal("resolved")), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("learnSourceReports")), handler: async (ctx, args) => { await requireAdmin(ctx); return ctx.db.query("learnSourceReports").withIndex("by_status", q => q.eq("status", args.status)).paginate(args.paginationOpts); } });
export const act = mutation({ args: { sourceId: v.id("learnSources"), action: v.union(v.literal("takedown"), v.literal("restore")), reason: v.string(), reportId: v.optional(v.id("learnSourceReports")) }, returns: v.id("learnSourceAudit"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); await requireAdmin(ctx); const source = await ctx.db.get("learnSources", args.sourceId); if (!source) throw new Error("Source not found");
  const explanation = reason(args.reason); const after = args.action === "takedown" ? "removed" as const : "active" as const;
  if (args.reportId) { const report = await ctx.db.get("learnSourceReports", args.reportId); if (!report || report.sourceId !== source._id) throw new Error("Report mismatch"); await ctx.db.patch("learnSourceReports", report._id, { status: "resolved" }); }
  await ctx.db.patch("learnSources", source._id, { status: after });
  return ctx.db.insert("learnSourceAudit", { sourceId: source._id, actorKey: identity.tokenIdentifier, action: args.action, reason: explanation, before: source.status, after, createdAt: Date.now() });
} });
export const appeal = mutation({ args: { sourceId: v.id("learnSources"), auditId: v.id("learnSourceAudit"), reason: v.string() }, returns: v.id("learnSourceAppeals"), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const source = await ctx.db.get("learnSources", args.sourceId); const audit = await ctx.db.get("learnSourceAudit", args.auditId);
  if (!source || source.ownerId !== identity.subject || !audit || audit.sourceId !== source._id || audit.action !== "takedown") throw new Error("Source audit not found or unauthorized");
  const explanation = reason(args.reason); const prior = await ctx.db.query("learnSourceAppeals").withIndex("by_auditId_and_ownerId", q => q.eq("auditId", audit._id).eq("ownerId", identity.subject)).unique();
  return prior?._id ?? ctx.db.insert("learnSourceAppeals", { ...args, reason: explanation, ownerId: identity.subject, status: "open", createdAt: Date.now() });
} });
export const resolveAppeal = mutation({ args: { appealId: v.id("learnSourceAppeals"), accepted: v.boolean(), reason: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); await requireAdmin(ctx); const appeal = await ctx.db.get("learnSourceAppeals", args.appealId); if (!appeal || appeal.status !== "open") throw new Error("Open appeal not found");
  const explanation = reason(args.reason); await ctx.db.patch("learnSourceAppeals", appeal._id, { status: args.accepted ? "accepted" : "denied", resolution: explanation, resolvedBy: identity.tokenIdentifier });
  // An accepted appeal records a decision. Restore is a separate explicit action,
  // so an older appeal cannot undo a later independent takedown.
  return null;
} });
export const history = query({ args: { sourceId: v.id("learnSources"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(schema.doc("learnSourceAudit")), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const source = await ctx.db.get("learnSources", args.sourceId); if (!source || source.ownerId !== identity.subject) await requireAdmin(ctx);
  return ctx.db.query("learnSourceAudit").withIndex("by_sourceId", q => q.eq("sourceId", args.sourceId)).order("desc").paginate(args.paginationOpts);
} });
