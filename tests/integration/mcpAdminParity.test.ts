import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import { createTestConvex } from "./setup";
import { quizFixture } from "../fixtures";

const secret = "admin-parity-test-secret-at-least-32-characters";
const adminId = "user_AdminParity", memberId = "user_MemberParity";
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv("CHAOS_MCP_SECRET", secret);
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const admin = await ctx.db.insert("users", { clerkId: adminId, name: "Admin", email: "admin@example.com", username: "admin", createdAt: 0 });
    const member = await ctx.db.insert("users", { clerkId: memberId, name: "Member", email: "member@example.com", username: "member", createdAt: 0 });
    await ctx.db.insert("admins", { clerkId: adminId, email: "admin@example.com", grantedAt: 0 });
    const quiz = await ctx.db.insert("quizzes", { ...quizFixture, creatorId: memberId, creatorUsername: "member" });
    const contact = await ctx.db.insert("crmContacts", { name: "School", email: "school@example.com", organization: "School", owner: "Admin", source: "Referral", stage: "new", nextFollowUp: 123456, createdAt: 0, updatedAt: 0 });
    return { admin, member, quiz, contact };
  });
  const send = (tool: string, input: Record<string, unknown> = {}, userId = adminId, key = secret) => t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ tool, input, userId }) });
  const identity = { subject: adminId, tokenIdentifier: `https://test.example|${adminId}`, issuer: "https://test.example" };
  return { t, ids, send, admin: t.withIdentity(identity) };
}
const paginationOpts = { cursor: null, numItems: 25 };

it("matches all UI reads and serializes activity through the verified transport", async () => {
  const { send, admin, ids } = await setup();
  for (const [tool, input, expected] of [
    ["list_admin_users", { paginationOpts }, await admin.query(api.admin.users, { paginationOpts })],
    ["list_admin_content", { kind: "quizzes", paginationOpts }, await admin.query(api.admin.content, { kind: "quizzes", paginationOpts })],
    ["list_admin_teams", { paginationOpts }, await admin.query(api.admin.teams, { paginationOpts })],
    ["get_admin_overview", {}, { overview: await admin.query(api.adminAnalytics.overview, {}) }],
    ["list_admin_activity", {}, { activity: await admin.query(api.admin.activity, {}) }],
    ["get_crm_activity", { contactId: ids.contact }, { activity: await admin.query(api.admin.contactActivity, { contactId: ids.contact }) }],
  ] as const) {
    const response = await send(tool, input);
    expect(response.status, tool).toBe(200);
    expect((await response.json()).result).toEqual(expected);
  }
  for (const kind of ["courses", "lessons", "flashcards"] as const) {
    const response = await send("list_admin_learning_content", { kind, paginationOpts });
    expect(response.status).toBe(200);
    expect((await response.json()).result).toEqual(await admin.query(api.admin.learningContent, { kind, paginationOpts }));
  }
});

it("reuses moderation and CRM mutations with trusted audit attribution and no actor spoofing", async () => {
  const { t, send, ids, admin } = await setup();
  expect((await send("moderate_admin_user", { accountId: ids.member, state: "suspended", days: 3, reason: "Requested suspension", userId: memberId })).status).toBe(200);
  expect(await t.run(ctx => ctx.db.get("users", ids.member))).toMatchObject({ suspendedUntil: expect.any(Number), moderationReason: "Requested suspension" });
  expect((await send("moderate_admin_user", { accountId: ids.member, state: "active", reason: "Restore" })).status).toBe(200);
  expect((await send("moderate_admin_content", { targetId: ids.quiz, hold: true, reason: "Review", userId: memberId })).status).toBe(200);
  expect(await t.run(ctx => ctx.db.get("quizzes", ids.quiz))).toMatchObject({ isBanned: true, isPublished: false });
  expect((await send("moderate_admin_content", { targetId: ids.quiz, hold: false, reason: "Reviewed" })).status).toBe(200);
  expect((await send("set_crm_contact_stages", { contactIds: [ids.contact, ids.contact], stage: "active", userId: memberId })).status).toBe(200);
  expect((await send("complete_crm_follow_up", { contactId: ids.contact, userId: memberId })).status).toBe(200);
  expect(await admin.query(api.admin.contact, { contactId: ids.contact })).toMatchObject({ stage: "active" });
  expect(await admin.query(api.admin.contact, { contactId: ids.contact })).not.toHaveProperty("nextFollowUp");
  const audit = await admin.query(api.admin.activity, {});
  expect(audit).toHaveLength(6);
  expect(audit.every(row => row.actorId === adminId)).toBe(true);
  expect((await (await send("list_admin_activity")).json()).result.activity).toEqual(audit);
  expect((await send("complete_crm_follow_up", { contactId: ids.contact })).status).toBe(200);
  expect(await admin.query(api.admin.activity, {})).toHaveLength(6);
  expect((await send("moderate_admin_user", { accountId: ids.admin, state: "banned", reason: "Self" })).status).not.toBe(200);
  expect(await t.run(ctx => ctx.db.get("users", ids.admin))).not.toHaveProperty("isBanned");
  expect((await send("refresh_admin_analytics")).status).toBe(200);
  expect((await (await send("get_admin_overview")).json()).result.overview.running).toBe(true);
});

it("rejects unauthenticated, non-admin, revoked and restricted actors on every operation", async () => {
  const { t, send, ids, admin } = await setup();
  await expect(admin.query(api.admin.users, { paginationOpts, actorId: memberId } as FunctionArgs<typeof api.admin.users>)).rejects.toThrow(/Validator|validation|extra field/i);
  expect((await send("list_admin_users", { paginationOpts, actorId: memberId })).status).toBe(400);
  const calls = [
    ["get_admin_overview", {}], ["refresh_admin_analytics", {}], ["list_admin_users", { paginationOpts }],
    ["list_admin_content", { kind: "forms", paginationOpts }], ["list_admin_learning_content", { kind: "courses", paginationOpts }],
    ["list_admin_teams", { paginationOpts }], ["list_admin_activity", {}],
    ["moderate_admin_user", { accountId: ids.member, state: "banned", reason: "Denied" }],
    ["moderate_admin_content", { targetId: ids.quiz, hold: true, reason: "Denied" }],
    ["get_crm_activity", { contactId: ids.contact }], ["set_crm_contact_stages", { contactIds: [ids.contact], stage: "closed" }], ["complete_crm_follow_up", { contactId: ids.contact }],
  ] as const;
  expect((await send("list_admin_users", { paginationOpts }, adminId, "wrong")).status).toBe(401);
  for (const [tool, input] of calls) expect((await send(tool, { ...input, userId: adminId }, memberId)).status, tool).toBe(403);
  await t.run(async ctx => { const row = await ctx.db.query("admins").first(); await ctx.db.delete(row!._id); });
  for (const [tool, input] of calls) expect((await send(tool, input)).status, tool).toBe(403);
  await t.run(async ctx => { await ctx.db.insert("admins", { clerkId: adminId, email: "admin@example.com", grantedAt: 0 }); await ctx.db.patch("users", ids.admin, { isBanned: true }); });
  for (const [tool, input] of calls) expect((await send(tool, input)).status, tool).toBe(403);
});

it("keeps canonical bound OAuth actors and mutation audit identity intact", async () => {
  const { t, send, ids } = await setup();
  const externalActorId = `oidc_${"a".repeat(64)}`;
  await t.run(ctx => ctx.db.insert("authIdentityBindings", { externalActorId, actorId: adminId, tokenIdentifier: `legacy|${adminId}` }));
  expect((await send("set_crm_contact_stages", { contactIds: [ids.contact], stage: "contacted" }, externalActorId)).status).toBe(200);
  const response = await send("list_admin_activity", {}, externalActorId);
  expect(response.status).toBe(200);
  expect((await response.json()).result.activity[0].actorId).toBe(adminId);
});
