import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
export async function courseSearchText(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  metadata: Doc<"learnCollections">["metadata"],
  _items: Doc<"learnCollections">["items"],
) {
  const owner = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId))
    .unique();
  const text = [
    metadata.title,
    metadata.description,
    metadata.language,
    ...metadata.tags,
    owner?.name ?? "",
    owner?.username ?? "",
  ];
  // Index course publication metadata only; child access can be revoked independently.
  return text.join(" ").slice(0, 30000);
}
