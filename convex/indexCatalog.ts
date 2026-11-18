import { v } from "convex/values";
import { env, httpAction, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { readBoundedBody } from "./httpBody";
import { respond, error } from "./httpResponses";
import { sha256Hex } from "./serverUtils";
import {
  INDEX_CATALOG_BATCH_SIZE,
  type IndexCatalogFileTuple,
  type IndexCatalogQuestionTuple,
  type NormalizedIndexCatalogEntry,
  indexCatalogFileTuple,
  indexCatalogIdentity,
  indexCatalogQuestionTuple,
  indexCatalogSameRow,
  normalizeIndexCatalogEntry,
} from "./indexCatalogModel";

/**
 * The live Chaos Index catalogue. Writes come from the scheduled Telegram updater through
 * `POST /api/index-catalog` with a bearer secret; reads are public and cached.
 * The static site keeps embedded fallback data (apps/medical-index/index.html), so a missing
 * or failing endpoint degrades to the shipped snapshot, never to an empty page.
 */

const sameSecret = async (a: string, b: string): Promise<boolean> => {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

/**
 * Idempotent upsert of a batch of entries. Identity is (channel, messageId, kind); content that
 * already matches is left untouched, edits are patched in place, and everything accepted is read
 * back as the site's tuple shapes so the caller can verify what actually landed.
 */
export const publish = mutation({
  args: {
    secret: v.string(),
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
  handler: async (ctx, args) => {
    const secret = env.CHAOS_INDEX_UPDATER_SECRET?.trim() ?? "";
    if (secret.length < 32) throw new Error("INDEX_UPDATER_NOT_CONFIGURED");
    if (!(await sameSecret(args.secret, secret))) throw new Error("UNAUTHORIZED");
    if (args.entries.length > INDEX_CATALOG_BATCH_SIZE) throw new Error(`BATCH_TOO_LARGE: send at most ${INDEX_CATALOG_BATCH_SIZE} entries per call.`);

    const writer = args.updatedBy?.trim() ? args.updatedBy.trim().slice(0, 64) : "updater";
    const rejected: { index: number; reason: string }[] = [];
    let created = 0, updated = 0, unchanged = 0;
    const stored: unknown[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < args.entries.length; index++) {
      const result = normalizeIndexCatalogEntry(args.entries[index]);
      if (!result.ok) {
        rejected.push({ index, reason: result.reason });
        continue;
      }
      const entry = result.entry;
      const identity = indexCatalogIdentity(entry);
      if (seen.has(identity)) {
        rejected.push({ index, reason: "Duplicate of an earlier entry in this batch." });
        continue;
      }
      seen.add(identity);
      const existing = await ctx.db
        .query("indexCatalogEntries")
        .withIndex("by_identity", q => q.eq("channel", entry.channel).eq("messageId", entry.messageId).eq("kind", entry.kind))
        .unique();
      const fields = {
        moduleIndex: entry.moduleIndex,
        subject: entry.subject,
        type: entry.type,
        caption: entry.caption,
        filename: entry.filename,
        date: entry.date,
        lectureRefs: entry.lectureRefs,
      };
      if (!existing) {
        await ctx.db.insert("indexCatalogEntries", { ...entry, updatedBy: writer, updatedAt: Date.now() });
        created++;
        stored.push(project(entry));
        continue;
      }
      if (!indexCatalogSameRow(existing, entry)) {
        await ctx.db.patch("indexCatalogEntries", existing._id, { ...fields, updatedBy: writer, updatedAt: Date.now() });
        updated++;
      } else {
        unchanged++;
      }
      stored.push(project(entry));
    }
    return { created, updated, unchanged, rejected, stored };
  },
});

const project = (entry: NormalizedIndexCatalogEntry): IndexCatalogFileTuple | IndexCatalogQuestionTuple =>
  entry.kind === "file" ? indexCatalogFileTuple(entry) : indexCatalogQuestionTuple(entry);

/** The full public catalogue in the site's tuple shapes. Public data, no secrets. */
export const catalog = query({
  args: {},
  returns: v.object({
    files: v.array(v.array(v.any())),
    questions: v.array(v.array(v.any())),
    generatedAt: v.number(),
  }),
  handler: async (ctx) => {
    const files: IndexCatalogFileTuple[] = [];
    const questions: IndexCatalogQuestionTuple[] = [];
    const rows = await ctx.db.query("indexCatalogEntries").collect();
    for (const row of rows) {
      if (row.kind === "file") files.push(indexCatalogFileTuple(row));
      else questions.push(indexCatalogQuestionTuple(row));
    }
    const byNumber = (row: IndexCatalogFileTuple | IndexCatalogQuestionTuple) =>
      typeof row[0] === "number" ? row[0] : Number(String(row[0]).split("/")[1] ?? 0);
    files.sort((a, b) => a[1] - b[1] || a[2].localeCompare(b[2]) || byNumber(a) - byNumber(b));
    questions.sort((a, b) => a[1] - b[1] || a[2].localeCompare(b[2]) || byNumber(a) - byNumber(b));
    return { files, questions, generatedAt: Date.now() };
  },
});

// ── HTTP surface ─────────────────────────────────────────────────────────────
// Public read for the static Chaos Index site; authenticated write for the updater.

const CATALOG_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export const catalogGet = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CATALOG_CORS });
  if (url.pathname !== "/api/index-catalog") return error(404, "NOT_FOUND", "Unknown endpoint.", undefined, CATALOG_CORS);
  try {
    const result = await ctx.runQuery(api.indexCatalog.catalog, {});
    return respond({ status: 200, body: result, headers: { ...CATALOG_CORS, "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (caught) {
    console.error("index catalog read failed", caught);
    return error(500, "ERROR", "The catalogue is temporarily unavailable.", undefined, CATALOG_CORS);
  }
});

export const catalogPost = httpAction(async (ctx, request) => {
  const fail = (status: number, code: string, message: string) => error(status, code, message, undefined, CATALOG_CORS);
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) return fail(401, "UNAUTHORIZED", "Send Authorization: Bearer <updater secret>.");
  const bytes = await readBoundedBody(request, (size) => size > 256 * 1024);
  if (bytes === null) return fail(413, "VALIDATION_FAILED", "The body is larger than 256 KiB.");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail(400, "VALIDATION_FAILED", "The body is not valid JSON.");
  }
  const entries = (body as { entries?: unknown } | null)?.entries;
  const updatedBy = (body as { updatedBy?: unknown } | null)?.updatedBy;
  if (!Array.isArray(entries) || !entries.length) return fail(400, "VALIDATION_FAILED", 'Send {"entries": [...]} with at least one entry.');
  try {
    const result = await ctx.runMutation(api.indexCatalog.publish, {
      secret: match[1],
      entries,
      updatedBy: typeof updatedBy === "string" ? updatedBy : undefined,
    });
    return respond({ status: 200, body: result, headers: CATALOG_CORS });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (message === "UNAUTHORIZED") return fail(401, "UNAUTHORIZED", "Unknown updater secret.");
    if (message === "INDEX_UPDATER_NOT_CONFIGURED") return fail(503, "UNAVAILABLE", "Catalogue publishing is not configured yet.");
    if (message.startsWith("BATCH_TOO_LARGE")) return fail(413, "BATCH_TOO_LARGE", message.replace("BATCH_TOO_LARGE: ", ""));
    console.error("index catalog publish failed", caught);
    return fail(500, "ERROR", "Publishing failed. Nothing was rejected because of content.");
  }
});
