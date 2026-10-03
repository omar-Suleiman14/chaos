// Actor IDs are accepted only from the authenticated, scope-checked MCP transport.
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalQuery, internalMutation, internalAction, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireLearnActor } from "./mcpLearn";
import { matchesAccountFormCollaborator } from "./authz";
import { getAnalysisForActor, exportResponsesForActor } from "./formResults";
import { logActivity, notify } from "./serverUtils";
import { buildXlsx, safeFilename } from "../lib/xlsx";
const args = { userId: v.string(), formId: v.id("forms") };
async function owned(ctx: QueryCtx | MutationCtx, userId: string, formId: Id<"forms">) {
  await requireLearnActor(ctx, userId);
  const form = await ctx.db.get("forms", formId);
  if (!form || form.ownerId !== userId || form.isBanned) throw new Error("FORBIDDEN: Owned active form required.");
  return form;
}
export const analytics = internalQuery({ args, returns: v.object({ analysisJson: v.string(), sampleLimit: v.number() }), handler: async (ctx, input) => {
  const analysis = await getAnalysisForActor(ctx, await owned(ctx, input.userId, input.formId));
  // Aggregate analytics only; individual written responses and full answer-key definitions stay out of model context.
  const { definition: _definition, ...summary } = analysis;
  void _definition;
  const fields = summary.fields.map(({ texts: _texts, quiz, ...field }) => { void _texts; return { ...field, quiz: quiz ? { answered: quiz.answered, correct: quiz.correct, correctRate: quiz.correctRate } : null }; });
  const analysisJson = JSON.stringify({ ...summary, fields });
  if (analysisJson.length > 300_000) throw new Error("ANALYTICS_LIMIT: Reduce the form size.");
  return { analysisJson, sampleLimit: 2000 };
} });
const member = v.object({ id: v.id("formCollaborators"), email: v.string(), role: v.union(v.literal("editor"), v.literal("viewer")), joined: v.boolean() });
async function members(ctx: QueryCtx | MutationCtx, formId: Id<"forms">) { return ctx.db.query("formCollaborators").withIndex("by_formId", q => q.eq("formId", formId)).take(101); }
function snapshot(rows: Awaited<ReturnType<typeof members>>) { return JSON.stringify(rows.map(r => [r._id, r.email, r.role, r.userId ?? null, r.status ?? null]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))); }
export const collaborators = internalQuery({ args, returns: v.object({ members: v.array(member), membershipRevision: v.string() }), handler: async (ctx, input) => {
  await owned(ctx, input.userId, input.formId); const rows = await members(ctx, input.formId);
  return { members: rows.map(r => ({ id: r._id, email: r.email, role: r.role, joined: !!r.userId && matchesAccountFormCollaborator(r, r.userId) })), membershipRevision: snapshot(rows) };
} });
export const changeCollaborator = internalMutation({ args: { ...args, expectedMembershipRevision: v.string(), email: v.string(), role: v.union(v.literal("editor"), v.literal("viewer"), v.null()) }, returns: v.object({ membershipRevision: v.string() }), handler: async (ctx, input) => {
  const form = await owned(ctx, input.userId, input.formId), rows = await members(ctx, input.formId);
  if (input.expectedMembershipRevision.length > 40_000 || snapshot(rows) !== input.expectedMembershipRevision) throw new ConvexError({ code: "MEMBERSHIP_CONFLICT", message: "Reload collaborators before changing access." });
  const email = input.email.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL");
  const owner = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", input.userId)).first();
  if (owner!.email.toLowerCase() === email) throw new Error("INVALID_EMAIL: Owner access cannot be changed.");
  const match = rows.find(r => r.email === email);
  if (input.role === null) { if (match) { await ctx.db.delete("formCollaborators", match._id); await logActivity(ctx, form._id, input.userId, "removed access", email); } }
  else if (match?.role !== input.role) {
    if (!match && rows.length >= 50) throw new Error("COLLABORATOR_LIMIT");
    if (match) await ctx.db.patch("formCollaborators", match._id, { role: input.role });
    else await ctx.db.insert("formCollaborators", { formId: form._id, email, status: "pending", role: input.role, invitedBy: input.userId, createdAt: Date.now() });
    if (match?.userId && matchesAccountFormCollaborator(match, match.userId)) await notify(ctx, match.userId, "comment", `Your access to this form is now ${input.role}.`, `invite:${form._id}:${email}:${input.role}`, form._id);
    await logActivity(ctx, form._id, input.userId, "shared", `${email} as ${input.role}`);
  }
  return { membershipRevision: snapshot(await members(ctx, form._id)) };
} });
export const exportPage = internalQuery({ args: { ...args, cursor: v.union(v.string(), v.null()), includePartial: v.boolean(), includeSpam: v.boolean() }, returns: v.string(), handler: async (ctx, input) => JSON.stringify(await exportResponsesForActor(ctx, { form: await owned(ctx, input.userId, input.formId) }, { ...input, paginationOpts: { cursor: input.cursor, numItems: 100, maximumRowsRead: 100, maximumBytesRead: 1_000_000 } })) });
const pageRef = makeFunctionReference<"query", { userId: string; formId: Id<"forms">; cursor: string | null; includePartial: boolean; includeSpam: boolean }, string>("mcpFormManagement:exportPage");
export const deleteExport = internalMutation({ args: { storageId: v.id("_storage") }, returns: v.null(), handler: async (ctx, input) => { await ctx.storage.delete(input.storageId); return null; } });
export const exportArtifact = internalAction({ args: { ...args, format: v.union(v.literal("csv"), v.literal("xlsx"), v.literal("json")), includePartial: v.boolean(), includeSpam: v.boolean() }, returns: v.object({ downloadUrl: v.string(), filename: v.string(), rows: v.number(), expiresAt: v.number(), byteSize: v.number() }), handler: async (ctx, input) => {
  type Page = Awaited<ReturnType<typeof exportResponsesForActor>>;
  const rows: Page["rows"] = []; let cursor: string | null = null; let first: Page | null = null; let bytes = 0; const hiddenKeys = new Set<string>();
  for (let i=0; i<51; i++) {
    const raw: string = await ctx.runQuery(pageRef, { userId: input.userId, formId: input.formId, cursor, includePartial: input.includePartial, includeSpam: input.includeSpam });
    bytes += new TextEncoder().encode(raw).length;
    if (bytes > 8_000_000) throw new Error("EXPORT_LIMIT: Export is limited to 8 MB; use paginated UI export.");
    const page = JSON.parse(raw) as Page; first ??= page; rows.push(...page.rows); for (const key of page.hiddenColumns) hiddenKeys.add(key);
    if (rows.length > 5000) throw new Error("EXPORT_LIMIT: At most 5000 responses per artifact.");
    if (page.isDone) break;
    if (i===50) throw new Error("EXPORT_LIMIT: At most 5100 scanned responses; use paginated UI export.");
    cursor = page.continueCursor;
  }
  const columns = [...first!.columns, ...[...hiddenKeys].map(key => ({ key: `hidden:${key}`, label: key }))];
  const table = [["Response ID", "Receipt", "Status", "Submitted at", "Language", "Duration seconds", "Version", "Edit count", "Edited at", "Ending", "Score", "Maximum score", "Tags", "Reviewed", "Spam", ...columns.map(c=>c.label)], ...rows.map(r=>[r.id, r.receiptCode, r.status, new Date(r.submittedAt).toISOString(), r.language, r.durationSeconds, r.version, r.editCount, r.editedAt, r.ending, r.quizScore, r.quizMaxScore, r.tags.join("; "), r.reviewed, r.spam, ...columns.map(c=> c.key.startsWith("hidden:") ? r.hidden[c.key.slice(7)] ?? "" : r.cells[c.key] ?? "")])];
  const csv = (value: unknown) => '"'+String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g,'""')+'"';
  const mime = input.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : input.format === "json" ? "application/json" : "text/csv;charset=utf-8";
  const data = input.format === "xlsx" ? buildXlsx(table) : input.format === "json" ? JSON.stringify({ title: first!.title, columns, rows }) : table.map(r=>r.map(csv).join(",")).join("\r\n");
  const blob = new Blob([data], { type: mime });
  if (blob.size > 16_000_000) throw new Error("EXPORT_LIMIT: Artifact exceeds 16 MB.");
  const storageId = await ctx.storage.store(blob);
  try {
    await ctx.scheduler.runAfter(24*60*60*1000, makeFunctionReference<"mutation">("mcpFormManagement:deleteExport"), { storageId });
    const downloadUrl = await ctx.storage.getUrl(storageId); if (!downloadUrl) throw new Error("EXPORT_FAILED");
    return { downloadUrl, filename: `${safeFilename(first!.title)}.${input.format}`, rows: rows.length, expiresAt: Date.now()+24*60*60*1000, byteSize: blob.size };
  } catch(error) { await ctx.storage.delete(storageId); throw error; }
} });
