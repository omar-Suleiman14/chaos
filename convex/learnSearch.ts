import { v, type Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server";
import { query, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import { creatorRestricted } from "./authz";
import { lessonMeta } from "./learnModel";
import { hasLiveLessonPublication } from "./publicationEligibility";
import { authorSearchCursor, readSearchCursor, writeSearchCursor } from "./learnSearchCursor";
import { matchingLessonSnippets } from "./learnSearchSnippets";
export const searchHit = v.object({ lessonId: v.id("lessons"), versionId: v.id("lessonVersions"), metadata: lessonMeta, matchingBlocks: v.array(v.object({ id: v.string(), text: v.string() })) });

const MAX_CANDIDATES = 20;
const nativeCursor = v.union(v.string(), v.null());
/** Convex permits only one paginate call per function; each bounded source step is internal. */
export const indexedPage = internalQuery({
  args: { text: v.string(), cursor: nativeCursor, numItems: v.number(), endCursor: v.optional(v.string()), candidate: v.optional(v.object({ ownerId: v.string(), creationTime: v.number(), lessonId: v.id("lessons") })) },
  returns: paginationResultValidator(schema.doc("lessons")),
  handler: async (ctx, args): Promise<PaginationResult<Doc<"lessons">>> => {
    const source = ctx.db.query("lessons").withSearchIndex("search_text", q => {
      const search = q.search("searchText", args.text).eq("visibility", "public").eq("communityState", "ok").eq("status", "active");
      return args.candidate ? search.eq("ownerId", args.candidate.ownerId).eq("_creationTime", args.candidate.creationTime) : search;
    });
    const filtered = args.candidate ? source.filter(q => q.eq(q.field("_id"), args.candidate!.lessonId)) : source;
    return filtered.paginate({ cursor: args.cursor, numItems: Math.min(MAX_CANDIDATES, Math.max(1, args.numItems)), ...(args.endCursor !== undefined ? { endCursor: args.endCursor } : {}), maximumRowsRead: MAX_CANDIDATES, maximumBytesRead: 1_000_000 });
  },
});
export const authorPage = internalQuery({
  args: { cursor: nativeCursor, numItems: v.number() },
  returns: paginationResultValidator(schema.doc("users")),
  handler: async (ctx, args): Promise<PaginationResult<Doc<"users">>> => ctx.db.query("users").paginate({ cursor: args.cursor, numItems: Math.min(MAX_CANDIDATES, Math.max(1, args.numItems)), maximumRowsRead: MAX_CANDIDATES, maximumBytesRead: 1_000_000 }),
});
export const authorLessonPage = internalQuery({
  args: { ownerId: v.string(), cursor: nativeCursor },
  returns: paginationResultValidator(schema.doc("lessons")),
  handler: async (ctx, args): Promise<PaginationResult<Doc<"lessons">>> => ctx.db.query("lessons").withIndex("by_ownerId_and_visibility_and_communityState_and_status", q => q.eq("ownerId", args.ownerId).eq("visibility", "public").eq("communityState", "ok").eq("status", "active")).paginate({ cursor: args.cursor, numItems: 1, maximumRowsRead: 1, maximumBytesRead: 1_000_000 }),
});
async function publishedHit(ctx: QueryCtx, lesson: Doc<"lessons">, words: string[], snippets: boolean): Promise<Infer<typeof searchHit> | null> {
  if (!hasLiveLessonPublication(lesson) || lesson.visibility !== "public") return null;
  const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
  if (!version || version.lessonId !== lesson._id || version.visibility !== undefined && version.visibility !== "public") return null;
  const matchingBlocks = snippets ? matchingLessonSnippets(version.document.blocks, words) : [];
  return { lessonId: lesson._id, versionId: version._id, metadata: version.metadata, matchingBlocks };
}

export const searchPublic = query({
  args: { text: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(searchHit),
  handler: async (ctx, args): Promise<PaginationResult<Infer<typeof searchHit>>> => {
    const size = args.paginationOpts.numItems;
    if (!Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error("Search page size must be 1–100");
    const text = args.text.trim();
    if (!text || text.length > 200) throw new Error("Search text must contain 1–200 characters");
    const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let cursor = readSearchCursor(args.paginationOpts.cursor, text);
    const page: Infer<typeof searchHit>[] = [];
    if (cursor.phase === "text") {
      const end = args.paginationOpts.endCursor === undefined ? undefined : readSearchCursor(args.paginationOpts.endCursor, text);
      if (end && end.phase !== "text") throw new Error("Search endCursor must remain within the full-text stream.");
      const result = await ctx.runQuery(internal.learnSearch.indexedPage, { text, cursor: cursor.cursor, numItems: size, ...(end?.phase === "text" && end.cursor !== null ? { endCursor: end.cursor } : {}) });
      for (const lesson of result.page) {
        if (!hasLiveLessonPublication(lesson) || await creatorRestricted(ctx, lesson.ownerId)) continue;
        const hit = await publishedHit(ctx, lesson, words, true);
        if (hit) page.push(hit);
      }
      if (end || !result.isDone) return { page, isDone: end ? result.isDone : false, continueCursor: writeSearchCursor({ phase: "text", text, cursor: result.continueCursor }) };
      cursor = authorSearchCursor(text);
    } else if (args.paginationOpts.endCursor !== undefined) {
      throw new Error("Search endCursor must remain within the full-text stream.");
    }

    // Constant-size continuation: at most 20 queued IDs, one owner stream and one pending probe.
    const users = new Map<Id<"users">, Doc<"users"> | null>();
    const restricted = new Map<string, boolean>();
    let directoryPages = 0, candidates = 0;
    while (page.length < size && candidates < MAX_CANDIDATES) {
      if (!cursor.currentUser) {
        if (!cursor.remainingUsers.length) {
          if (cursor.usersDone || directoryPages >= 5) break;
          const result = await ctx.runQuery(internal.learnSearch.authorPage, { cursor: cursor.userCursor, numItems: MAX_CANDIDATES });
          directoryPages++;
          cursor.userCursor = result.continueCursor;
          cursor.usersRead += result.page.length;
          cursor.usersDone = result.isDone;
          cursor.remainingUsers = result.page.map(user => user._id);
          for (const user of result.page) users.set(user._id, user);
          if (!cursor.remainingUsers.length) continue;
        }
        cursor.currentUser = cursor.remainingUsers.shift()!;
        cursor.lessonCursor = null;
      }
      const userId = ctx.db.normalizeId("users", cursor.currentUser);
      if (!userId) throw new Error("INVALID_SEARCH_CURSOR: Invalid author continuation.");
      if (!users.has(userId)) users.set(userId, await ctx.db.get("users", userId));
      const user = users.get(userId);
      const author = user ? `${user.name} ${user.username}`.toLocaleLowerCase() : "";
      if (!user || !words.some(word => author.includes(word))) {
        cursor.currentUser = null;
        cursor.pending = null;
        continue;
      }
      if (!restricted.has(user.clerkId)) restricted.set(user.clerkId, await creatorRestricted(ctx, user.clerkId));
      if (restricted.get(user.clerkId)) {
        cursor.currentUser = null;
        cursor.pending = null;
        continue;
      }
      let lesson: Doc<"lessons"> | null;
      if (cursor.pending) {
        const id = ctx.db.normalizeId("lessons", cursor.pending.lessonId);
        if (!id) throw new Error("INVALID_SEARCH_CURSOR: Invalid lesson continuation.");
        lesson = await ctx.db.get("lessons", id);
      } else {
        const result = await ctx.runQuery(internal.learnSearch.authorLessonPage, { ownerId: user.clerkId, cursor: cursor.lessonCursor });
        cursor.lessonCursor = result.continueCursor;
        lesson = result.page[0] ?? null;
        if (!lesson) {
          if (result.isDone) cursor.currentUser = null;
          candidates++;
          continue;
        }
        cursor.pending = { lessonId: lesson._id, cursor: null, lastForOwner: result.isDone };
      }
      candidates++;
      const hit = lesson?.ownerId === user.clerkId ? await publishedHit(ctx, lesson, words, false) : null;
      if (hit && lesson) {
        // Ask the same search engine whether this exact candidate belongs to the first stream.
        // Timestamp collisions are filtered by ID and continued within the same bounded probe.
        const match = await ctx.runQuery(internal.learnSearch.indexedPage, { text, cursor: cursor.pending!.cursor, numItems: 1, candidate: { ownerId: lesson.ownerId, creationTime: lesson._creationTime, lessonId: lesson._id } });
        if (!match.page.length && !match.isDone) {
          cursor.pending!.cursor = match.continueCursor;
          break;
        }
        if (!match.page.length) page.push(hit);
      }
      if (cursor.pending!.lastForOwner) {
        cursor.currentUser = null;
        cursor.lessonCursor = null;
      }
      cursor.pending = null;
    }
    const isDone = cursor.usersDone && !cursor.remainingUsers.length && !cursor.currentUser && !cursor.pending;
    return { page, isDone, continueCursor: writeSearchCursor(cursor) };
  },
});
