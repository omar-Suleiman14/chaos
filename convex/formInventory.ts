import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { getAuthIdentity } from "./authIdentity";
import { matchesAccountFormCollaborator, matchesFormCollaborator, verifiedIdentityEmail } from "./authz";

type Actor =
  | { kind: "identity"; identity: NonNullable<Awaited<ReturnType<typeof getAuthIdentity>>> }
  | { kind: "account"; userId: string };

/** Keep native verified-email invitations distinct from account-only transport grants. */
export async function enumerateForms(
  ctx: QueryCtx,
  actor: Actor,
  bounds: { owned: 300 | 500; memberships: 100 | 200; excludeOwnedShared?: boolean },
) {
  const userId = actor.kind === "identity" ? actor.identity.subject : actor.userId;
  const owned = await ctx.db.query("forms").withIndex("by_ownerId_and_updatedAt", q => q.eq("ownerId", userId)).order("desc").take(bounds.owned);
  const email = actor.kind === "identity" ? verifiedIdentityEmail(actor.identity) : undefined;
  const memberships = [
    ...await ctx.db.query("formCollaborators").withIndex("by_userId", q => q.eq("userId", userId)).take(bounds.memberships),
    ...(email ? await ctx.db.query("formCollaborators").withIndex("by_email", q => q.eq("email", email)).take(bounds.memberships) : []),
  ];
  const seen = new Set<string>(owned.map(form => form._id));
  const shared: { form: Doc<"forms">; membership: Doc<"formCollaborators"> }[] = [];
  for (const membership of memberships) {
    const matches = actor.kind === "identity" ? matchesFormCollaborator(membership, actor.identity) : matchesAccountFormCollaborator(membership, userId);
    if (!matches || seen.has(membership.formId)) continue;
    seen.add(membership.formId);
    const form = await ctx.db.get("forms", membership.formId);
    if (!form || bounds.excludeOwnedShared && form.ownerId === userId) continue;
    shared.push({ form, membership });
  }
  return { owned, shared };
}
