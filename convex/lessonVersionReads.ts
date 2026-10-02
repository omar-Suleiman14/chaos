import { v } from "convex/values";
import { query } from "./_generated/server";
import { lessonAccess } from "./lessons";
import schema from "./schema";
/** Collections may pin a public historical version. Current asset restrictions still win. */
export const get = query({ args: { lessonId: v.id("lessons"), versionId: v.id("lessonVersions") }, returns: schema.doc("lessonVersions"), handler: async (ctx, args) => {
  const lesson = await lessonAccess(ctx, args.lessonId); const version = await ctx.db.get("lessonVersions", args.versionId);
  const identity = await ctx.auth.getUserIdentity();
  if (!version || version.lessonId !== lesson._id || (identity?.subject !== lesson.ownerId && version._id !== lesson.publishedVersionId && (lesson.visibility !== "public" || version.visibility !== "public"))) throw new Error("Lesson version not found or unauthorized");
  return version;
} });
