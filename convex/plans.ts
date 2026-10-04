import type { MutationCtx } from "./_generated/server";
import { supportEmail } from "./support";
import { hasPro, isPaidPlan } from "./authz";
import { planLimits } from "../lib/planCatalog";
import { hasBusinessWorkspace } from "./businessAccess";

/** Count creations, not surviving records: deleting content does not refund quota. */
export async function consumeCreation(ctx: MutationCtx, ownerId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId))
    .unique();
  if (!user)
    throw new Error(
      "ACCOUNT_REQUIRED: Finish signing in before creating content.",
    );
  if (user.isBanned || user.suspendedUntil)
    throw new Error(`ACCOUNT_RESTRICTED: Contact ${supportEmail()}.`);
  const now = Date.now();
  const month = new Date(now).toISOString().slice(0, 7);
  const tier = hasPro(user, now) ? "pro" : "free";
  const limit = planLimits[tier].creationsPerMonth;
  if (limit === null) return;
  let count = user.creationMonth === month ? (user.monthlyCreations ?? 0) : 0;
  if (user.creationMonth !== month) {
    // Bootstrap once, bounded to enough records to prove the active tier's cap.
    const start = Date.parse(`${month}-01T00:00:00Z`);
    const [forms, quizzes] = await Promise.all([
      ctx.db
        .query("forms")
        .withIndex("by_ownerId_and_createdAt", (q) =>
          q.eq("ownerId", ownerId).gte("createdAt", start),
        )
        .take(limit + 1),
      ctx.db
        .query("quizzes")
        .withIndex("by_creator_createdAt", (q) =>
          q.eq("creatorId", ownerId).gte("createdAt", start),
        )
        .take(limit + 1),
    ]);
    count = forms.length + quizzes.length;
  }
  if (count >= limit)
    throw new Error(
      `MONTHLY_CREATION_LIMIT: ${tier === "pro" ? "Pro" : "Free"} includes ${limit} forms or quizzes per calendar month (UTC). Contact ${supportEmail()} for help.`,
    );
  await ctx.db.patch("users", user._id, {
    creationMonth: month,
    monthlyCreations: count + 1,
  });
}

/** Public courses and lessons are free; private publications need a Business workspace or a legacy grant. */
export async function requireVisibilityAllowed(ctx: { db: MutationCtx["db"] }, ownerId: string, visibility: "private" | "public" | "restricted") {
  if (visibility === "public") return;
  const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId)).unique();
  if (!isPaidPlan(user, Date.now()) && !await hasBusinessWorkspace(ctx, ownerId)) throw new Error("BUSINESS_REQUIRED: Create a free Business team to publish private courses and lessons.");
}
