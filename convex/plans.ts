import type { MutationCtx } from "./_generated/server";
import { supportEmail } from "./support";
import { hasPro } from "./authz";

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
  let count = user.creationMonth === month ? (user.monthlyCreations ?? 0) : 0;
  if (user.creationMonth !== month) {
    // Bootstrap pre-existing records once; six rows are enough to prove the cap.
    const start = Date.parse(`${month}-01T00:00:00Z`);
    const [forms, quizzes] = await Promise.all([
      ctx.db
        .query("forms")
        .withIndex("by_ownerId_and_createdAt", (q) =>
          q.eq("ownerId", ownerId).gte("createdAt", start),
        )
        .take(6),
      ctx.db
        .query("quizzes")
        .withIndex("by_creator_createdAt", (q) =>
          q.eq("creatorId", ownerId).gte("createdAt", start),
        )
        .take(6),
    ]);
    count = forms.length + quizzes.length;
  }
  if (!hasPro(user, now) && count >= 5)
    throw new Error(
      `MONTHLY_CREATION_LIMIT: Free includes 5 forms or quizzes per calendar month (UTC). Contact ${supportEmail()} for Pro.`,
    );
  await ctx.db.patch("users", user._id, {
    creationMonth: month,
    monthlyCreations: count + 1,
  });
}
