import { defineTable } from "convex/server";
import { v } from "convex/values";

export const nodeKind = v.union(
  v.literal("year"),
  v.literal("semester"),
  v.literal("module"),
  v.literal("subject"),
  v.literal("custom"),
);
export const curriculumTables = {
  curriculumInstitutions: defineTable({
    key: v.string(),
    name: v.string(),
  }).index("by_key", ["key"]).searchIndex("search_name", { searchField: "name", filterFields: [] }),
  curriculumPrograms: defineTable({
    institutionId: v.id("curriculumInstitutions"),
    key: v.string(),
    name: v.string(),
  }).index("by_institutionId_and_key", ["institutionId", "key"]).searchIndex("search_name", { searchField: "name", filterFields: ["institutionId"] }),
  curriculumVersions: defineTable({
    programId: v.id("curriculumPrograms"),
    key: v.string(),
    name: v.string(),
  }).index("by_programId_and_key", ["programId", "key"]),
  curriculumNodes: defineTable({
    versionId: v.id("curriculumVersions"),
    parentId: v.union(v.id("curriculumNodes"), v.null()),
    key: v.string(),
    name: v.string(),
    kind: nodeKind,
    conceptKeys: v.array(v.string()),
  })
    .index("by_versionId_and_key", ["versionId", "key"])
    .index("by_versionId_and_parentId", ["versionId", "parentId"]).searchIndex("search_name", { searchField: "name", filterFields: ["versionId", "kind"] }),
  curriculumAliases: defineTable({
    scope: v.string(),
    alias: v.string(),
    targetId: v.union(
      v.id("curriculumInstitutions"),
      v.id("curriculumPrograms"),
      v.id("curriculumVersions"),
      v.id("curriculumNodes"),
    ),
  }).index("by_scope_and_alias", ["scope", "alias"]),
  lessonCurriculumMappings: defineTable({
    lessonId: v.id("lessons"),
    versionId: v.id("curriculumVersions"),
    nodeId: v.id("curriculumNodes"),
    conceptKeys: v.array(v.string()),
    blockIds: v.array(v.string()),
  }).index("by_lessonId_and_nodeId", ["lessonId", "nodeId"]),
};
