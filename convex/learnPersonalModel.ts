import { defineTable } from "convex/server";
import { v } from "convex/values";

export const personalKind = v.union(v.literal("save"), v.literal("highlight"), v.literal("note"));
/** Offsets use UTF-16 code units in the stored block text, end exclusive. */
export const personalAnchor = v.object({ start: v.number(), end: v.number(), quote: v.string() });
export const PERSONAL_LIMITS = { perLesson: 200, follows: 200, noteCharacters: 4000, quoteCharacters: 2000, pageSize: 100 } as const;
export const personalTables = {
  learnPersonal: defineTable({ owner: v.string(), key: v.string(), lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), blockId: v.string(), kind: personalKind, anchor: v.optional(personalAnchor), note: v.string(), revision: v.number(), updatedAt: v.number(), deleted: v.boolean() })
    .index("by_owner_and_key", ["owner", "key"])
    .index("by_owner_and_lessonId", ["owner", "lessonId"]),
  learnModuleFollows: defineTable({ owner: v.string(), nodeId: v.id("curriculumNodes"), followed: v.boolean(), revision: v.number() })
    .index("by_owner_and_nodeId", ["owner", "nodeId"]),
};
