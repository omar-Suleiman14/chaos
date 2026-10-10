import { v } from "convex/values";
import { env, action, internalAction, internalMutation, internalQuery, mutation, query, httpAction } from "./_generated/server";
import type { MutationCtx, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireActiveUser } from "./authz";
import { createLessonForActor } from "./lessons";
import { lessonDocument, lessonMeta } from "./learnModel";
import { randomHex, sha256Hex } from "./serverUtils";
import { encryptSecret, decryptSecret } from "./webhookCrypto";
import { notionBlocksToLesson, type NotionBlock } from "../lib/notionBlocks";

const VERSION = "2025-09-03";
const MAX_ITEMS = 100;
const PAGE_ID = /^[a-f0-9-]{32,36}$/i;
const STATE_TTL_MS = 10 * 60_000;

function config() {
  const clientId = env.NOTION_CLIENT_ID;
  const clientSecret = env.NOTION_CLIENT_SECRET;
  const redirectUri = env.NOTION_REDIRECT_URI;
  const encryptionKey = env.NOTION_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey || encryptionKey.length < 32)
    throw new Error("NOTION_NOT_CONFIGURED: Set NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI and NOTION_ENCRYPTION_KEY in Convex.");
  const uri = new URL(redirectUri);
  if (uri.protocol !== "https:" && uri.hostname !== "localhost") throw new Error("NOTION_NOT_CONFIGURED: OAuth callback must use HTTPS.");
  return { clientId, clientSecret, redirectUri, encryptionKey };
}

async function notionFetch<T>(accessToken: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://api.notion.com/v1" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error("NOTION_HTTP_" + response.status + ": Notion rejected the request. Check page sharing and connection permissions.");
  return await response.json() as T;
}

type NotionSearch = { results: Array<Record<string, unknown>>; has_more: boolean; next_cursor: string | null };
type NotionPage = Record<string, unknown>;
type Connection = Doc<"notionConnections">;
async function token(ctx: ActionCtx): Promise<{ conn: Connection; accessToken: string }> {
  const conn = await ctx.runQuery(internal.notion.authenticatedConnection, {});
  if (!conn) throw new Error("NOTION_NOT_CONNECTED: Connect a Notion workspace first.");
  return { conn, accessToken: await decryptSecret(conn.tokenCiphertext, config().encryptionKey) };
}

function titleFromPage(page: NotionPage): string {
  const props = page.properties as Record<string, { type?: string; title?: Array<{ plain_text?: string }> }> | undefined;
  const title = Object.values(props ?? {}).find((p) => p.type === "title")?.title ?? page.title as Array<{ plain_text?: string }> | undefined;
  return title?.map((p) => p.plain_text ?? "").join("").trim().slice(0, 200) || "Untitled";
}

/** Whether this deployment has Notion OAuth configured; never exposes the values. */
export const available = query({
  args: {},
  handler: async () => {
    try { config(); return true; } catch { return false; }
  },
});

export const connection = query({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.query("notionConnections").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).unique();
    return row ? { workspaceName: row.workspaceName, workspaceId: row.workspaceId, dataSourceTitle: row.dataSourceTitle ?? null, dataSourceId: row.dataSourceId ?? null, connected: true } : null;
  },
});

export const beginConnect = mutation({
  args: { locale: v.union(v.literal("en"), v.literal("ar")) },
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const { clientId, redirectUri } = config();
    const state = randomHex(32);
    const stateHash = await sha256Hex(state);
    await ctx.db.insert("notionOAuthStates", { stateHash, ownerId: identity.subject, locale: args.locale, expiresAt: Date.now() + STATE_TTL_MS });
    await ctx.scheduler.runAfter(STATE_TTL_MS, internal.notion.expireState, { stateHash });
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("owner", "user");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },
});

export const expireState = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("notionOAuthStates").withIndex("by_stateHash", q => q.eq("stateHash", args.stateHash)).unique();
    if (row && row.expiresAt <= Date.now()) await ctx.db.delete("notionOAuthStates", row._id);
  },
});

export const oauthState = internalQuery({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("notionOAuthStates").withIndex("by_stateHash", (q) => q.eq("stateHash", args.stateHash)).unique();
    return state && state.expiresAt > Date.now() ? { locale: state.locale } : null;
  },
});

export const oauthComplete = internalMutation({
  args: {
    stateHash: v.string(), tokenCiphertext: v.string(), workspaceId: v.string(),
    workspaceName: v.string(), botId: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("notionOAuthStates").withIndex("by_stateHash", (q) => q.eq("stateHash", args.stateHash)).unique();
    if (!state || state.expiresAt <= Date.now()) throw new Error("OAuth state expired or already used.");
    await ctx.db.delete("notionOAuthStates", state._id);
    const old = await ctx.db.query("notionConnections").withIndex("by_ownerId", (q) => q.eq("ownerId", state.ownerId)).unique();
    if (old) await ctx.db.patch("notionConnections", old._id, {
      workspaceId: args.workspaceId, workspaceName: args.workspaceName, botId: args.botId,
      tokenCiphertext: args.tokenCiphertext, dataSourceId: undefined, dataSourceTitle: undefined, updatedAt: Date.now(),
    });
    else await ctx.db.insert("notionConnections", {
      ownerId: state.ownerId, workspaceId: args.workspaceId, workspaceName: args.workspaceName,
      botId: args.botId, tokenCiphertext: args.tokenCiphertext, createdAt: Date.now(), updatedAt: Date.now(),
    });
  },
});

function callbackUrl(locale: "en" | "ar", status: string) {
  const origin = env.CHAOS_APP_URL;
  if (!origin) throw new Error("CHAOS_APP_URL must be set to an app origin for Notion OAuth.");
  const url = new URL("/" + locale + "/dashboard/connections", origin);
  url.searchParams.set("notion", status);
  return url.toString();
}

/** Callback is on the Convex HTTPS actions host, with no browser authentication. */
export const oauthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  if (!/^[a-f0-9]{64}$/.test(state)) return new Response("Invalid OAuth state", { status: 400 });
  const stateHash = await sha256Hex(state);
  const pending = await ctx.runQuery(internal.notion.oauthState, { stateHash });
  if (!pending) return new Response("OAuth state expired or already used", { status: 400 });
  if (!url.searchParams.get("code") || url.searchParams.has("error"))
    return Response.redirect(callbackUrl(pending.locale, "denied"), 303);
  try {
    const { clientId, clientSecret, redirectUri, encryptionKey } = config();
    const basic = btoa(clientId + ":" + clientSecret);
    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: { Authorization: "Basic " + basic, "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: redirectUri }),
    });
    if (!response.ok) throw new Error("Notion token exchange failed");
    const auth = await response.json() as { access_token: string; workspace_id: string; workspace_name?: string | null; bot_id: string };
    if (!auth.access_token || !auth.workspace_id || !auth.bot_id) throw new Error("Incomplete Notion authorization");
    await ctx.runMutation(internal.notion.oauthComplete, {
      stateHash, tokenCiphertext: await encryptSecret(auth.access_token, encryptionKey),
      workspaceId: auth.workspace_id, workspaceName: auth.workspace_name || "Notion workspace", botId: auth.bot_id,
    });
    return Response.redirect(callbackUrl(pending.locale, "connected"), 303);
  } catch {
    return Response.redirect(callbackUrl(pending.locale, "failed"), 303);
  }
});

export const authenticatedConnection = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireActiveUser(ctx);
    return await ctx.db.query("notionConnections").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).unique();
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireActiveUser(ctx);
    const row = await ctx.db.query("notionConnections").withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject)).unique();
    if (row) await ctx.db.delete("notionConnections", row._id);
  },
});

export const listPages = action({
  args: {},
  handler: async (ctx): Promise<Array<{ id: string; title: string; url: string }>> => {
    const { accessToken } = await token(ctx);
    const data = await notionFetch<NotionSearch>(accessToken, "/search", { filter: { property: "object", value: "page" }, page_size: MAX_ITEMS });
    return data.results.filter((item) => item.object === "page" && typeof item.id === "string").map((item) => ({
      id: item.id as string, title: titleFromPage(item), url: typeof item.url === "string" ? item.url : "",
    }));
  },
});

export const listDataSources = action({
  args: {},
  handler: async (ctx): Promise<Array<{ id: string; title: string }>> => {
    const { accessToken } = await token(ctx);
    const result = await notionFetch<NotionSearch>(accessToken, "/search", { filter: { property: "object", value: "data_source" }, page_size: MAX_ITEMS });
    return result.results.filter(item => item.object === "data_source" && typeof item.id === "string").map(item => ({
      id: item.id as string,
      title: Array.isArray(item.title) ? (item.title as Array<{ plain_text?: string }>).map(t => t.plain_text ?? "").join("") || "Untitled database" : "Untitled database",
    }));
  },
});

export const chooseDataSource = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    if (!PAGE_ID.test(args.id)) throw new Error("Invalid Notion data source ID.");
    const { conn, accessToken } = await token(ctx);
    // Read with this user's own Notion token: an arbitrary or unshared ID cannot be configured.
    const source = await notionFetch<{ id: string; title?: Array<{ plain_text?: string }> }>(accessToken, "/data_sources/" + args.id);
    if (source.id !== args.id) throw new Error("Selected Notion database is unavailable.");
    const title = (source.title ?? []).map(t => t.plain_text ?? "").join("") || "Notion database";
    await ctx.runMutation(internal.notion.storeDataSource, { connectionId: conn._id, dataSourceId: args.id, title });
  },
});

export const storeDataSource = internalMutation({
  args: { connectionId: v.id("notionConnections"), dataSourceId: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const conn = await ctx.db.get("notionConnections", args.connectionId);
    if (!conn || conn.ownerId !== identity.subject) throw new Error("NOTION_NOT_CONNECTED");
    await ctx.db.patch("notionConnections", conn._id, { dataSourceId: args.dataSourceId, dataSourceTitle: args.title.slice(0, 200), updatedAt: Date.now() });
  },
});

export const disableResultSync = mutation({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireActiveUser(ctx);
    const conn = await ctx.db.query("notionConnections").withIndex("by_ownerId", q => q.eq("ownerId", identity.subject)).unique();
    if (conn) await ctx.db.patch("notionConnections", conn._id, { dataSourceId: undefined, dataSourceTitle: undefined, updatedAt: Date.now() });
  },
});

type BlockPage = { results: NotionBlock[]; next_cursor: string | null; has_more: boolean };
async function pageBlocks(accessToken: string, pageId: string): Promise<Array<{ block: NotionBlock; parentId?: string }>> {
  const result: Array<{ block: NotionBlock; parentId?: string }> = [];
  async function read(id: string, depth: number, parentId?: string) {
    let cursor: string | null = null;
    do {
      const suffix: string = cursor ? "&start_cursor=" + encodeURIComponent(cursor) : "";
      const response: BlockPage = await notionFetch<BlockPage>(accessToken, "/blocks/" + id + "/children?page_size=100" + suffix);
      for (const block of response.results) {
        if (result.length >= 400) throw new Error("NOTION_PAGE_TOO_LARGE: Import pages with at most 400 blocks.");
        result.push({ block, ...(parentId ? { parentId } : {}) });
        if (block.has_children) {
          if (depth >= 2) throw new Error("NOTION_PAGE_TOO_DEEP: Import pages with no more than two nested levels.");
          if (PAGE_ID.test(block.id)) await read(block.id, depth + 1, block.id);
        }
      }
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);
  }
  await read(pageId, 0);
  return result;
}

/** Private, durable history of imported lesson drafts; independent of OAuth connection lifetime. */
export const listImports = query({
  args: {},
  returns: v.array(v.object({ lessonId: v.id("lessons"), title: v.string(), importedAt: v.number() })),
  handler: async (ctx) => {
    const { identity } = await requireActiveUser(ctx);
    const rows = await ctx.db.query("notionImports")
      .withIndex("by_ownerId_and_importedAt", q => q.eq("ownerId", identity.subject))
      .order("desc").take(50);
    const lessons: Array<{ lessonId: Id<"lessons">; title: string; importedAt: number }> = [];
    for (const row of rows) {
      const lesson = await ctx.db.get("lessons", row.lessonId);
      if (lesson?.ownerId === identity.subject && lesson.communityState !== "removed") {
        lessons.push({ lessonId: lesson._id, title: lesson.metadata.title || "Untitled lesson", importedAt: row.importedAt });
      }
    }
    return lessons;
  },
});

export const importPage = action({
  args: { pageId: v.string() },
  handler: async (ctx, args): Promise<{ lessonId: Id<"lessons">; skipped: number }> => {
    if (!PAGE_ID.test(args.pageId)) throw new Error("Invalid Notion page ID.");
    const { conn, accessToken } = await token(ctx);
    const page = await notionFetch<NotionPage>(accessToken, "/pages/" + args.pageId);
    if (page.object !== "page" || page.id !== args.pageId) throw new Error("Notion page was not shared with this connection.");
    const title = titleFromPage(page);
    const { document, skipped } = notionBlocksToLesson(await pageBlocks(accessToken, args.pageId));
    if (!document.blocks.length) throw new Error("No supported text blocks to import from this page.");
    const metadata = { title, description: "Imported from Notion. Review before publishing.", language: /[\u0600-\u06ff]/.test(title + JSON.stringify(document.blocks.slice(0, 3))) ? "ar" : "en", tags: [] as string[] };
    const lessonId = await ctx.runMutation(internal.notion.createImportedLesson, { connectionId: conn._id, pageId: args.pageId, metadata, document });
    return { lessonId, skipped };
  },
});

export const createImportedLesson = internalMutation({
  args: { connectionId: v.id("notionConnections"), pageId: v.string(), metadata: lessonMeta, document: lessonDocument },
  handler: async (ctx, args) => {
    const { identity } = await requireActiveUser(ctx);
    const conn = await ctx.db.get("notionConnections", args.connectionId);
    if (!conn || conn.ownerId !== identity.subject) throw new Error("NOTION_NOT_CONNECTED");
    const existing = await ctx.db.query("notionImports").withIndex("by_ownerId_and_pageId", q => q.eq("ownerId", identity.subject).eq("pageId", args.pageId)).unique();
    if (existing && await ctx.db.get("lessons", existing.lessonId)) return existing.lessonId;
    const lessonId = await createLessonForActor(ctx, identity.subject, { metadata: args.metadata, document: args.document });
    if (existing) await ctx.db.patch("notionImports", existing._id, { lessonId, importedAt: Date.now() });
    else await ctx.db.insert("notionImports", { ownerId: identity.subject, pageId: args.pageId, lessonId, importedAt: Date.now() });
    return lessonId;
  },
});

/** Called only for accepted, completed, non-spam submissions. Does not send PII or answers. */
export async function queueResult(ctx: MutationCtx, form: Doc<"forms">, response: Doc<"formResponses">) {
  try {
    const conn = await ctx.db.query("notionConnections").withIndex("by_ownerId", (q) => q.eq("ownerId", form.ownerId)).unique();
    if (!conn?.dataSourceId) return;
    const existing = await ctx.db.query("notionResultDeliveries").withIndex("by_connectionId_and_responseId", q => q.eq("connectionId", conn._id).eq("responseId", response._id)).unique();
    if (existing) return;
    const id = await ctx.db.insert("notionResultDeliveries", {
      ownerId: form.ownerId, connectionId: conn._id, dataSourceId: conn.dataSourceId, responseId: response._id, formId: form._id,
      formTitle: form.title, ...(response.quizScore !== undefined ? { score: response.quizScore } : {}),
      ...(response.quizMaxScore !== undefined ? { maxScore: response.quizMaxScore } : {}),
      submittedAt: response.submittedAt ?? Date.now(), attempts: 0, status: "pending", createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.notion.deliverResult, { id });
  } catch (error) {
    console.error("notion enqueue failed", error);
  }
}

export const pendingDelivery = internalQuery({
  args: { id: v.id("notionResultDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("notionResultDeliveries", args.id);
    if (!delivery || delivery.status !== "pending") return null;
    const conn = await ctx.db.get("notionConnections", delivery.connectionId);
    // Reconfiguring or disconnecting must never send a queued response to a different destination.
    if (!conn || conn.ownerId !== delivery.ownerId || conn.dataSourceId !== delivery.dataSourceId) return null;
    const owner = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", delivery.ownerId)).unique();
    if (owner?.isBanned || owner?.suspendedUntil) return null;
    return { delivery, conn };
  },
});

export const deliveryOutcome = internalMutation({
  args: { id: v.id("notionResultDeliveries"), pageId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("notionResultDeliveries", args.id);
    if (!row || row.status !== "pending") return;
    if (args.pageId) {
      await ctx.db.patch("notionResultDeliveries", row._id, { status: "sent", attempts: row.attempts + 1, notionPageId: args.pageId, lastError: undefined });
    } else {
      const attempts = row.attempts + 1;
      const failed = attempts >= 5;
      await ctx.db.patch("notionResultDeliveries", row._id, { status: failed ? "failed" : "pending", attempts, lastError: (args.error ?? "Notion delivery failed").slice(0, 160) });
      if (!failed) await ctx.scheduler.runAfter([60_000, 180_000, 900_000, 3_600_000][attempts - 1] ?? 3_600_000, internal.notion.deliverResult, { id: row._id });
    }
  },
});

export const deliverResult = internalAction({
  args: { id: v.id("notionResultDeliveries") },
  handler: async (ctx, args) => {
    const pending = await ctx.runQuery(internal.notion.pendingDelivery, { id: args.id });
    if (!pending) return;
    const { conn, delivery } = pending;
    try {
      const accessToken = await decryptSecret(conn.tokenCiphertext, config().encryptionKey);
      const ds = conn.dataSourceId!;
      const source = await notionFetch<{ properties: Record<string, { type: string }> }>(accessToken, "/data_sources/" + ds);
      const titleProp = Object.entries(source.properties).find(([, prop]) => prop.type === "title")?.[0];
      if (!titleProp) throw new Error("Notion data source has no title property");
      const stableTitle = ("Chaos: " + delivery.formTitle).slice(0, 115) + " (" + delivery.responseId + ")";
      // Check before each retry: Notion lacks an idempotency key for page creation.
      const found = await notionFetch<{ results: Array<{ id: string }> }>(accessToken, "/data_sources/" + ds + "/query", {
        filter: { property: titleProp, title: { equals: stableTitle } }, page_size: 1,
      });
      if (found.results.length) {
        await ctx.runMutation(internal.notion.deliveryOutcome, { id: args.id, pageId: found.results[0].id });
        return;
      }
      const lines = [
        "Chaos response ID: " + delivery.responseId,
        "Submitted: " + new Date(delivery.submittedAt).toISOString(),
        delivery.score === undefined ? "Form response completed" : "Score: " + delivery.score + "/" + (delivery.maxScore ?? "?"),
        "Open form: " + (env.CHAOS_APP_URL ?? "https://chaos.fail") + "/dashboard/forms/" + delivery.formId + "/responses",
      ];
      const created = await notionFetch<{ id: string }>(accessToken, "/pages", {
        parent: { type: "data_source_id", data_source_id: ds },
        properties: { [titleProp]: { title: [{ text: { content: stableTitle } }] } },
        children: lines.map(line => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: line } }] } })),
      });
      await ctx.runMutation(internal.notion.deliveryOutcome, { id: args.id, pageId: created.id });
    } catch (error) {
      await ctx.runMutation(internal.notion.deliveryOutcome, { id: args.id, error: error instanceof Error ? error.message : "Unknown Notion error" });
    }
  },
});
