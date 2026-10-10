import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Isolated Notion credentials; never return encrypted access tokens to the browser. */
export const notionTables = {
  notionConnections: defineTable({
    ownerId: v.string(),
    workspaceId: v.string(),
    workspaceName: v.string(),
    tokenCiphertext: v.string(),
    botId: v.string(),
    dataSourceId: v.optional(v.string()),
    dataSourceTitle: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerId", ["ownerId"]),
  notionOAuthStates: defineTable({
    stateHash: v.string(),
    ownerId: v.string(),
    locale: v.union(v.literal("en"), v.literal("ar")),
    expiresAt: v.number(),
  }).index("by_stateHash", ["stateHash"]),
  notionImports: defineTable({
    ownerId: v.string(),
    pageId: v.string(),
    lessonId: v.id("lessons"),
    importedAt: v.number(),
  }).index("by_ownerId_and_pageId", ["ownerId", "pageId"]),
  notionResultDeliveries: defineTable({
    ownerId: v.string(),
    connectionId: v.id("notionConnections"),
    responseId: v.id("formResponses"),
    formId: v.id("forms"),
    formTitle: v.string(),
    score: v.optional(v.number()),
    maxScore: v.optional(v.number()),
    submittedAt: v.number(),
    attempts: v.number(),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    notionPageId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_connectionId_and_responseId", ["connectionId", "responseId"]),
};