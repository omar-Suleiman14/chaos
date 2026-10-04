import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const contact = {
  name: "  Maya  ",
  email: "MAYA@example.com",
  organization: "School",
  stage: "new" as const,
  owner: "Sam",
  source: "Referral",
};
async function setup() {
  const t = await createTestConvexWithAdmin(otherCreatorIdentity.subject);
  return {
    t,
    admin: t.withIdentity(otherCreatorIdentity),
    member: t.withIdentity(creatorIdentity),
  };
}
describe("admin CRM", () => {
  it("denies non-admin contact reads, writes and note access", async () => {
    const { t, admin, member } = await setup();
    const contactId = await admin.mutation(api.admin.saveContact, contact);
    await expect(
      member.mutation(api.admin.saveContact, contact),
    ).rejects.toThrow();
    await expect(
      t.query(api.admin.contacts, {
        paginationOpts: { numItems: 25, cursor: null },
      }),
    ).rejects.toThrow();
    await expect(
      member.query(api.admin.contactNotes, { contactId }),
    ).rejects.toThrow();
    await expect(
      member.mutation(api.admin.addContactNote, { contactId, body: "Private" }),
    ).rejects.toThrow();
  });
  it("persists normalized contacts, updates, notes and audit entries", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.admin.saveContact, {
      ...contact,
      nextFollowUp: 1900000000000,
    });
    await expect(
      admin.mutation(api.admin.saveContact, {
        ...contact,
        email: "maya@example.com",
      }),
    ).rejects.toThrow("already exists");
    await admin.mutation(api.admin.saveContact, {
      ...contact,
      id,
      stage: "active",
    });
    await admin.mutation(api.admin.addContactNote, {
      contactId: id,
      body: "  Called about courses.  ",
    });
    const saved = await t.run((ctx) => ctx.db.get(id));
    expect(saved).toMatchObject({
      name: "Maya",
      email: "maya@example.com",
      stage: "active",
    });
    expect(saved?.nextFollowUp).toBeUndefined();
    const notes = await admin.query(api.admin.contactNotes, { contactId: id });
    expect(notes[0]).toMatchObject({
      body: "Called about courses.",
      actorId: otherCreatorIdentity.subject,
    });
    const audit = await t.run((ctx) => ctx.db.query("adminAudit").collect());
    expect(audit.map((entry) => entry.action)).toEqual([
      "crm_contact_created",
      "crm_contact_updated",
      "crm_note_added",
    ]);
  });
  it("filters scheduled follow-ups before pagination and sorts by date", async () => {
    const { admin } = await setup();
    await admin.mutation(api.admin.saveContact, {
      ...contact,
      email: "late@example.com",
      nextFollowUp: 1900000000000,
    });
    await admin.mutation(api.admin.saveContact, {
      ...contact,
      name: "Earlier",
      email: "early@example.com",
      nextFollowUp: 1800000000000,
    });
    await admin.mutation(api.admin.saveContact, {
      ...contact,
      email: "closed@example.com",
      stage: "closed",
      nextFollowUp: 1700000000000,
    });
    await admin.mutation(api.admin.saveContact, {
      ...contact,
      email: "unscheduled@example.com",
    });
    const page = await admin.query(api.admin.contacts, {
      followUps: true,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(page.page[0].name).toBe("Earlier");
    const next = await admin.query(api.admin.contacts, {
      followUps: true,
      paginationOpts: { numItems: 10, cursor: page.continueCursor },
    });
    expect(next.page.map((contact) => contact.email)).toEqual([
      "late@example.com",
    ]);
  });
});
