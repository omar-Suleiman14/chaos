import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * The one rule for reading a source's metadata or content: the owner, anyone when that part
 * is public, or a grantee while that part is restricted. Making a part private revokes grants
 * without deleting them. Callers apply their own status and creator-restriction checks first.
 */
export async function canReadSourcePart(ctx: QueryCtx, source: Doc<"learnSources">, actor: string | null, part: "metadata" | "content"): Promise<boolean> {
  if (actor !== null && actor === source.ownerId) return true;
  const level = part === "metadata" ? source.metadataVisibility : source.contentVisibility;
  if (level === "public") return true;
  if (level !== "restricted" || actor === null) return false;
  const grant = await ctx.db.query("learnSourceGrants").withIndex("by_sourceId_and_userId", q => q.eq("sourceId", source._id).eq("userId", actor)).unique();
  return grant?.[part] === true;
}
