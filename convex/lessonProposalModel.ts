import { defineTable } from "convex/server";
import { v } from "convex/values";
import { lessonBlock, lessonDocument, lessonMeta } from "./learnModel";

/** Same shape as lessons.lessonBlockOperation; kept here so the schema does not import function modules. */
const blockOperation = v.union(
  v.object({ action: v.literal("append"), blocks: v.array(lessonBlock) }),
  v.object({ action: v.literal("update"), blockId: v.string(), block: lessonBlock }),
  v.object({ action: v.literal("move"), blockId: v.string(), beforeId: v.union(v.string(), v.null()) }),
  v.object({ action: v.literal("delete"), blockId: v.string() }),
);

/**
 * A connected app's lesson update held for the owner's review. `document` is the full
 * proposed draft as of `baseRevision`; block edits also keep their operations so they can
 * be re-applied on a newer draft if the owner chooses to.
 */
export const proposalTables = {
  lessonProposals: defineTable({
    ownerId: v.string(),
    tokenId: v.id("integrationTokens"),
    lessonId: v.id("lessons"),
    baseRevision: v.number(),
    document: lessonDocument,
    metadata: v.optional(lessonMeta),
    operations: v.optional(v.array(blockOperation)),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  }).index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_lessonId_and_status", ["lessonId", "status"]),
};
