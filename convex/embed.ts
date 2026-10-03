import { authorDb } from "./authorIndex";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getFormIfRole, requireFormRole } from "./authz";
import { defaultEmbedSettings, isEmbedOrigin, normalizeEmbedOrigins, MAX_EMBED_ORIGINS } from "./embedPolicy";
import { ownerBanned } from "./respond";
import { logActivity } from "./serverUtils";

/**
 * Embedding a published form on another site. The Next proxy asks
 * getEmbedPolicy on every framed load of /f/<shareId> or /<username>/<slug>
 * and turns the answer into a Content-Security-Policy frame-ancestors header.
 */

const policyValidator = v.union(v.null(), v.object({ origins: v.array(v.string()), anyOrigin: v.boolean() }));

/** Whether a form may be framed at all right now, ignoring who asks. */
async function embeddable(ctx: QueryCtx, form: Doc<"forms"> | null) {
  if (!form || !form.embed?.enabled) return null;
  // Published only: drafts, archived forms and forms closed before their first publication stay unframable.
  if ((form.status !== "live" && form.status !== "closed") || form.publishedVersion === undefined) return null;
  // Signed-in forms would need the respondent's session inside someone else's page.
  if (form.settings.access === "signed_in") return null;
  if (await ownerBanned(ctx, form)) return null;
  const origins = form.embed.origins.filter(isEmbedOrigin).slice(0, MAX_EMBED_ORIGINS);
  if (!form.embed.anyOrigin && !origins.length) return null;
  return { origins, anyOrigin: form.embed.anyOrigin };
}

/**
 * Public by design: the answer is what the frame-ancestors header shows anyway.
 * Pass either shareId (for /f/<shareId>) or username and slug (for a custom link).
 */
export const getEmbedPolicy = query({
  args: { shareId: v.optional(v.string()), username: v.optional(v.string()), slug: v.optional(v.string()) },
  returns: policyValidator,
  handler: async (ctx, args) => {
    if (args.shareId !== undefined) {
      const form = await ctx.db.query("forms").withIndex("by_shareId", (q) => q.eq("shareId", args.shareId!)).unique();
      return await embeddable(ctx, form);
    }
    if (args.username === undefined || args.slug === undefined) return null;
    // Same resolution as links.resolveLink, which the page itself uses.
    const user = await ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", args.username!.toLowerCase())).first();
    if (!user) return null;
    const form = await ctx.db
      .query("forms")
      .withIndex("by_ownerId_and_slug", (q) => q.eq("ownerId", user.clerkId).eq("slug", args.slug!.toLowerCase()))
      .first();
    return await embeddable(ctx, form);
  },
});

/** The builder's view of the embedding settings, and whether they apply right now. */
export const getEmbedSettings = query({
  args: { formId: v.id("forms") },
  returns: v.union(v.null(), v.object({
    enabled: v.boolean(), origins: v.array(v.string()), anyOrigin: v.boolean(), canEdit: v.boolean(),
    blockedBy: v.union(v.null(), v.literal("unpublished"), v.literal("signed_in")),
  })),
  handler: async (ctx, args) => {
    const access = await getFormIfRole(ctx, args.formId, "viewer");
    if (!access) return null;
    const { form, role } = access;
    const settings = form.embed ?? defaultEmbedSettings;
    const published = (form.status === "live" || form.status === "closed") && form.publishedVersion !== undefined;
    return {
      enabled: settings.enabled,
      origins: settings.origins,
      anyOrigin: settings.anyOrigin,
      canEdit: role !== "viewer",
      blockedBy: !published ? "unpublished" as const : form.settings.access === "signed_in" ? "signed_in" as const : null,
    };
  },
});

/** Turn embedding on or off and set the sites allowed to frame the form. Owners and editors. */
export const setEmbedSettings = mutation({
  args: { formId: v.id("forms"), enabled: v.boolean(), origins: v.array(v.string()), anyOrigin: v.boolean() },
  returns: v.object({ enabled: v.boolean(), origins: v.array(v.string()), anyOrigin: v.boolean() }),
  handler: async (ctx, args) => {
    const { form, identity } = await requireFormRole(ctx, args.formId, "editor");
    if (args.origins.length > MAX_EMBED_ORIGINS * 2) throw new Error(`INVALID_EMBED: Add at most ${MAX_EMBED_ORIGINS} sites.`);
    const result = normalizeEmbedOrigins(args.origins);
    if ("tooMany" in result) throw new Error(`INVALID_EMBED: Add at most ${MAX_EMBED_ORIGINS} sites.`);
    if ("invalid" in result) throw new Error(`INVALID_EMBED: "${result.invalid.slice(0, 80)}" is not a website address like https://example.com.`);
    const embed = { enabled: args.enabled, origins: result.origins, anyOrigin: args.anyOrigin };
    await authorDb(ctx).patch("forms", form._id, { embed, updatedAt: Date.now() });
    await logActivity(ctx, form._id, identity.subject, "changed embedding", embed.enabled ? (embed.anyOrigin ? "any site" : `${embed.origins.length} site${embed.origins.length === 1 ? "" : "s"}`) : "off");
    return embed;
  },
});
