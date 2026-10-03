import { v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { oidcActorId } from "../lib/auth/identity";

type Context = QueryCtx | MutationCtx;

/** Keep legacy actor fields stable; never link accounts using an email claim. */
export async function getAuthIdentity(ctx: Context) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  // eslint-disable-next-line @convex-dev/no-process-env -- installation auth configuration
  const provider = process.env.CHAOS_AUTH_PROVIDER ?? "clerk";
  if (provider !== "betterauth") return identity;
  // eslint-disable-next-line @convex-dev/no-process-env -- installation auth configuration
  const issuer = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
  if (!issuer || identity.issuer !== issuer) throw new Error("Untrusted identity issuer");
  const externalActorId = await oidcActorId(issuer, identity.subject);
  const binding = await ctx.db.query("authIdentityBindings").withIndex("by_externalActorId", q => q.eq("externalActorId", externalActorId)).unique();
  const actorId = binding?.actorId ?? externalActorId;
  return { ...identity, subject: actorId, tokenIdentifier: binding?.tokenIdentifier ?? `chaos|${actorId}` };
}

export const resolveCurrent = query({
  args: {},
  returns: v.union(v.null(), v.object({ actorId: v.string(), tokenIdentifier: v.string() })),
  handler: async ctx => {
    const identity = await getAuthIdentity(ctx);
    return identity ? { actorId: identity.subject, tokenIdentifier: identity.tokenIdentifier } : null;
  },
});

export async function actorForAccount(ctx: Context, actorId: string) {
  const binding = await ctx.db.query("authIdentityBindings").withIndex("by_actorId", q => q.eq("actorId", actorId)).unique();
  if (binding) return { subject: binding.actorId, tokenIdentifier: binding.tokenIdentifier };
  if (/^oidc_[a-f0-9]{64}$/.test(actorId)) return { subject: actorId, tokenIdentifier: `chaos|${actorId}` };
  // eslint-disable-next-line @convex-dev/no-process-env -- legacy identity key retained for data parity
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();
  if (!issuer) throw new Error("CLERK_JWT_ISSUER_DOMAIN is required for legacy identity parity");
  const url = new URL(issuer);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid configured auth issuer");
  return { subject: actorId, tokenIdentifier: `${issuer}|${actorId}` };
}

/** Only the secret-authenticated server transport calls this internal resolver. */
export const resolveTransportActor = internalQuery({
  args: { externalActorId: v.string() }, returns: v.string(),
  handler: async (ctx, args) => {
    const binding = await ctx.db.query("authIdentityBindings").withIndex("by_externalActorId", q => q.eq("externalActorId", args.externalActorId)).unique();
    return binding?.actorId ?? args.externalActorId;
  },
});

/** Operator-only, before the replacement identity signs in. Existing data stays in place. */
export const bindLegacyAccount = internalMutation({
  args: { issuer: v.string(), subject: v.string(), legacyActorId: v.string(), legacyTokenIdentifier: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // eslint-disable-next-line @convex-dev/no-process-env -- operator migration, selected installation issuer
    if (args.issuer !== process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "")) throw new Error("Issuer must match configured Better Auth issuer");
    if (args.subject.length > 512 || !args.legacyTokenIdentifier.endsWith(`|${args.legacyActorId}`)) throw new Error("Invalid legacy identity mapping");
    const externalActorId = await oidcActorId(args.issuer, args.subject);
    const legacy = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.legacyActorId)).unique();
    if (!legacy) throw new Error("Legacy account not found");
    const existing = await ctx.db.query("authIdentityBindings").withIndex("by_externalActorId", q => q.eq("externalActorId", externalActorId)).unique();
    if (existing) {
      if (existing.actorId === args.legacyActorId && existing.tokenIdentifier === args.legacyTokenIdentifier) return null;
      throw new Error("Identity already bound to another account");
    }
    if (await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", externalActorId)).unique()) throw new Error("Replacement identity already has an account; manual reconciliation required");
    if (await ctx.db.query("authIdentityBindings").withIndex("by_actorId", q => q.eq("actorId", args.legacyActorId)).unique()) throw new Error("Legacy account already bound");
    await ctx.db.insert("authIdentityBindings", { externalActorId, actorId: args.legacyActorId, tokenIdentifier: args.legacyTokenIdentifier });
    await ctx.db.insert("adminAudit", { actorId: "operator", action: "bind_auth_identity", target: args.legacyActorId, reason: externalActorId, createdAt: Date.now() });
    return null;
  },
});
