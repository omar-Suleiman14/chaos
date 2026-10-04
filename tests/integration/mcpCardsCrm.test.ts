import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTestConvex } from "./setup";
import { recordStudent } from "@/convex/studentRoster";

const secret = "mcp-cards-crm-test-secret-at-least-32-characters";
const adminId = "user_CrmAdmin", studentId = "user_CrmStudent";
const contact = { name: "  Maya  ", email: "MAYA@example.com", organization: "School", stage: "new", owner: "Sam", source: "Referral" };
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv("CHAOS_MCP_SECRET", secret);
  const t = createTestConvex();
  await t.run(async ctx => {
    for (const [clerkId, username] of [[adminId, "teacher"], [studentId, "learner"]]) await ctx.db.insert("users", { clerkId, username, name: username, email: `${username}@example.com`, createdAt: 0, cardAvatarSeed: `${username}-chosen`, publicAuthorAssets: clerkId === adminId ? 1 : 0 });
    await ctx.db.insert("admins", { clerkId: adminId, email: "teacher@example.com", grantedAt: 0 });
    await recordStudent(ctx, { authorId: adminId, studentId, context: "Private study context" });
    await recordStudent(ctx, { authorId: adminId, guestKey: "anonymous", guestName: "Private guest", context: "Private guest context" });
  });
  const send = (tool: string, input: Record<string, unknown>, userId = adminId, key = secret) => t.fetch("/api/mcp/v1", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ tool, input, userId }) });
  return { t, send };
}

describe("MCP Cards and CRM trusted transport", () => {
  it("protects CRM with the authenticated actor, shares saved fields and audit, and rejects revoked admins", async () => {
    const { t, send } = await setup();
    expect((await send("list_crm_contacts", { paginationOpts: { numItems: 1, cursor: null } }, adminId, "wrong")).status).toBe(401);
    expect((await send("save_crm_contact", { ...contact, userId: adminId }, studentId)).status).toBe(403);
    const created = await send("save_crm_contact", { ...contact, linkedUserId: (await t.run(ctx => ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", studentId)).unique()))!._id });
    expect(created.status).toBe(200);
    const { result: { contactId } } = await created.json();
    expect((await send("add_crm_note", { contactId, body: "  Called about courses.  ", userId: studentId })).status).toBe(200);
    const detail = await (await send("get_crm_contact", { contactId })).json();
    expect(detail.result.contact).toMatchObject({ name: "Maya", email: "maya@example.com" });
    expect(detail.result.notes[0]).toMatchObject({ body: "Called about courses.", actorId: adminId });
    expect((await send("get_crm_contact", { contactId, userId: adminId }, studentId)).status).toBe(403);
    expect((await send("save_crm_contact", contact)).status).toBe(409);
    expect((await send("list_crm_contacts", { paginationOpts: { numItems: 100, cursor: null } })).status).toBe(400);
    expect((await t.run(ctx => ctx.db.query("adminAudit").collect())).map(row => row.actorId)).toEqual([adminId, adminId]);
    await t.run(async ctx => { const row = await ctx.db.query("admins").first(); await ctx.db.delete(row!._id); });
    expect((await send("get_crm_contact", { contactId })).status).toBe(403);
    expect((await send("add_crm_note", { contactId, body: "Denied" })).status).toBe(403);
  });

  it("reads public Cards and only opted-in students, never guest or private study context", async () => {
    const { t, send } = await setup();
    const initial = await (await send("list_public_student_cards", { username: "teacher" })).json();
    expect(initial.result.page).toEqual([]);
    expect((await (await send("get_student_card_visibility", { username: "teacher", userId: adminId }, studentId)).json()).result.visible).toBe(false);
    expect((await send("set_student_card_visibility", { username: "teacher", visible: true, userId: studentId }, adminId)).status).toBe(400);
    expect((await send("set_student_card_visibility", { username: "teacher", visible: true }, studentId)).status).toBe(200);
    const publicRows = await (await send("list_public_student_cards", { username: "teacher" })).json();
    expect(publicRows.result.page).toHaveLength(1);
    expect(publicRows.result.page[0]).toMatchObject({ username: "learner", context: null, seed: "learner-chosen" });
    expect(JSON.stringify(publicRows)).not.toContain("Private");
    const card = await (await send("get_public_card", { username: "teacher" })).json();
    expect(card.result.card.seed).toBe("teacher-chosen"); expect(card.result.card).not.toHaveProperty("email");
    expect((await (await send("list_public_authors", {})).json()).result.page).toHaveLength(1);
    expect((await send("set_author_listing_visibility", { visible: false, userId: studentId })).status).toBe(200);
    expect((await (await send("list_public_authors", {})).json()).result.page).toEqual([]);
    expect((await (await send("get_public_card", { username: "teacher" })).json()).result.card).not.toBeNull();
    await send("set_student_card_visibility", { username: "teacher", visible: false }, studentId);
    expect((await (await send("list_public_student_cards", { username: "teacher" })).json()).result.page).toEqual([]);
    expect((await send("list_public_authors", { limit: 49 })).status).toBe(400);
    await t.run(async ctx => { const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", studentId)).unique(); await ctx.db.patch(user!._id, { isBanned: true }); });
    expect((await send("set_author_listing_visibility", { visible: true }, studentId)).status).toBe(403);
    // A hidden or restricted profile never leaks through the shared public-card read.
    expect((await (await send("get_public_card", { username: "learner" })).json()).result.card).toBeNull();
  });

  it("filters and paginates CRM follow-ups before returning records", async () => {
    const { t, send } = await setup();
    for (const [email, nextFollowUp, stage] of [["late@example.com", 1900000000000, "active"], ["early@example.com", 1800000000000, "contacted"], ["closed@example.com", 1700000000000, "closed"]]) await send("save_crm_contact", { ...contact, email, nextFollowUp, stage });
    const first = await (await send("list_crm_contacts", { followUps: true, paginationOpts: { numItems: 1, cursor: null } })).json();
    expect(first.result.page.map((row: { email: string }) => row.email)).toEqual(["early@example.com"]);
    const next = await (await send("list_crm_contacts", { followUps: true, paginationOpts: { numItems: 1, cursor: first.result.continueCursor } })).json();
    expect(next.result.page.map((row: { email: string }) => row.email)).toEqual(["late@example.com"]);
    const ref = makeFunctionReference<"query">("mcpCrm:list");
    await expect(t.query(ref, { userId: studentId, paginationOpts: { numItems: 1, cursor: null } })).rejects.toThrow("FORBIDDEN");
  });
});
