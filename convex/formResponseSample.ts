import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Sample before spam/version/field filtering; each caller retains its existing window. */
export async function readCompletedResponseSample(ctx: QueryCtx, formId: Id<"forms">, limit: 1000 | 2000) {
  return await ctx.db.query("formResponses")
    .withIndex("by_formId_and_status_and_submittedAt", q => q.eq("formId", formId).eq("status", "completed"))
    .order("desc").take(limit);
}
