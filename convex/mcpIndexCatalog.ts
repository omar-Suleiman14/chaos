import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireAdminForActor } from "./adminAccess";
import { publishIndexCatalogEntries, readIndexCatalog } from "./indexCatalog";
import { INDEX_CATALOG_BATCH_SIZE } from "./indexCatalogModel";

// Administrator-gated MCP access to the live Chaos Index catalogue (index.chaos.fail).
// The HTTP transport in convex/http.ts supplies the verified userId; the tools never
// take an actor argument. Reads return the public catalogue in the site's tuple shapes;
// writes go through the same idempotent, validating upsert as the updater secret API.

const BATCH_MESSAGE = `send at most ${INDEX_CATALOG_BATCH_SIZE} entries per call.`;

export const list = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    files: v.array(v.array(v.any())),
    questions: v.array(v.array(v.any())),
    generatedAt: v.number(),
  }),
  handler: async (ctx, { userId }) => {
    await requireAdminForActor(ctx, userId);
    return await readIndexCatalog(ctx);
  },
});

export const upsert = internalMutation({
  args: {
    userId: v.string(),
    entries: v.array(v.any()),
    updatedBy: v.optional(v.string()),
  },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    rejected: v.array(v.object({ index: v.number(), reason: v.string() })),
    stored: v.array(v.any()),
  }),
  handler: async (ctx, { userId, entries, updatedBy }) => {
    await requireAdminForActor(ctx, userId);
    if (entries.length > INDEX_CATALOG_BATCH_SIZE) fail(`BATCH_TOO_LARGE: ${BATCH_MESSAGE}`);
    if (!entries.length) fail("VALIDATION_FAILED: Send at least one entry.");
    const writer = updatedBy?.trim() ? `mcp:${updatedBy.trim().slice(0, 48)}` : "mcp-admin";
    return await publishIndexCatalogEntries(ctx, entries, writer);
  },
});

function fail(message: string): never {
  throw new Error(message);
}
