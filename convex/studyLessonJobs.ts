import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
const args = {
  userId: v.string(),
  jobId: v.id("studyLessonJobs"),
  expectedRevision: v.number(),
};

/** Record failures only after the asset transaction has rolled back. A stale attempt cannot overwrite newer work. */
export const failure = internalMutation({
  args: { ...args, message: v.string() },
  handler: async (ctx, a) => {
    await requireLearnActor(ctx, a.userId);
    const job = await ctx.db.get("studyLessonJobs", a.jobId);
    if (
      !job ||
      job.ownerId !== a.userId ||
      job.revision !== a.expectedRevision ||
      job.state === "published"
    )
      return null;
    await ctx.db.patch("studyLessonJobs", job._id, {
      state: "validation_failed",
      problems: [a.message.slice(0, 2000)],
      revision: job.revision + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const finalize = internalAction({
  args,
  handler: async (ctx, a): Promise<unknown> => {
    try {
      return await ctx.runMutation(
        makeFunctionReference<"mutation">("studyLessons:finalize"),
        a,
      );
    } catch (error) {
      await ctx.runMutation(
        makeFunctionReference<"mutation">("studyLessonJobs:failure"),
        {
          ...a,
          message:
            error instanceof Error
              ? error.message
              : "Study lesson finalization failed; saved checkpoints are retained.",
        },
      );
      throw error;
    }
  },
});
export const publish = internalAction({
  args,
  handler: async (ctx, a): Promise<unknown> => {
    try {
      return await ctx.runMutation(
        makeFunctionReference<"mutation">("studyLessons:publish"),
        a,
      );
    } catch (error) {
      await ctx.runMutation(
        makeFunctionReference<"mutation">("studyLessonJobs:failure"),
        {
          ...a,
          message:
            error instanceof Error
              ? error.message
              : "Study lesson publication failed; saved drafts are retained.",
        },
      );
      throw error;
    }
  },
});
