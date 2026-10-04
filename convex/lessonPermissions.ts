import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveUser } from "./authz";
import schema from "./schema";
import { requireBusinessWorkspace } from "./businessAccess";
export const set = mutation({ args: { lessonId: v.id("lessons"), userId: v.string(), role: v.union(v.literal("reader"), v.literal("editor"), v.null()) }, returns: v.null(), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const lesson = await ctx.db.get("lessons", args.lessonId);
  if (!lesson || lesson.ownerId !== identity.subject) throw new Error("Lesson not found or unauthorized");
  if (args.role !== null) await requireBusinessWorkspace(ctx, identity.subject);
  if (args.userId === lesson.ownerId || args.userId.length > 200) throw new Error("Owner role cannot be replaced");
  const target = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.userId)).first();
  if (!target) throw new Error("Recipient must have a Chaos account");
  const prior = await ctx.db.query("lessonPermissions").withIndex("by_lessonId_and_userId", q => q.eq("lessonId", args.lessonId).eq("userId", args.userId)).unique();
  if (!args.role) { if (prior) await ctx.db.delete("lessonPermissions", prior._id); }
  else if (prior) await ctx.db.patch("lessonPermissions", prior._id, { role: args.role });
  else { const count = await ctx.db.query("lessonPermissions").withIndex("by_lessonId_and_userId", q => q.eq("lessonId", args.lessonId)).take(51); if (count.length >= 50) throw new Error("At most 50 collaborators"); await ctx.db.insert("lessonPermissions", { lessonId: args.lessonId, userId: args.userId, role: args.role }); }
  return null;
} });
export const list = query({ args: { lessonId: v.id("lessons") }, returns: v.array(schema.doc("lessonPermissions")), handler: async (ctx, args) => {
  const { identity } = await requireActiveUser(ctx); const lesson = await ctx.db.get("lessons", args.lessonId);
  if (!lesson || lesson.ownerId !== identity.subject) throw new Error("Lesson not found or unauthorized");
  return ctx.db.query("lessonPermissions").withIndex("by_lessonId_and_userId", q => q.eq("lessonId", args.lessonId)).take(50);
} });
