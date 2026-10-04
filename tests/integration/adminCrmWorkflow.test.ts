import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvexWithAdmin } from "./setup";

it("guards and audits pipeline changes and follow-up completion without duplicate events", async () => {
  const t = await createTestConvexWithAdmin("admin"), admin = t.withIdentity({ subject: "admin" }), outsider = t.withIdentity({ subject: "outsider" });
  const contactId = await admin.mutation(api.admin.saveContact, { name: "Contact", email: "contact@example.com", organization: "School", owner: "Admin", source: "Support", stage: "new", nextFollowUp: Date.now() + 86_400_000 });
  await expect(outsider.query(api.admin.contact, { contactId })).rejects.toThrow("admin access");
  await expect(outsider.query(api.admin.contactActivity, { contactId })).rejects.toThrow("admin access");
  await expect(outsider.mutation(api.admin.setContactStages, { contactIds: [contactId], stage: "active" })).rejects.toThrow("admin access");
  await expect(outsider.mutation(api.admin.completeContactFollowUp, { contactId })).rejects.toThrow("admin access");
  await admin.mutation(api.admin.setContactStages, { contactIds: [contactId, contactId], stage: "active" });
  await admin.mutation(api.admin.setContactStages, { contactIds: [contactId], stage: "active" });
  await admin.mutation(api.admin.completeContactFollowUp, { contactId });
  await admin.mutation(api.admin.completeContactFollowUp, { contactId });
  await admin.mutation(api.admin.addContactNote, { contactId, body: "Follow-up completed" });
  const contact = await admin.query(api.admin.contact, { contactId });
  expect(contact?.stage).toBe("active");
  expect(contact?.nextFollowUp).toBeUndefined();
  const activity = await admin.query(api.admin.contactActivity, { contactId });
  expect(activity.map(row => row.action)).toEqual(["crm_note_added", "crm_follow_up_completed", "crm_stage_changed", "crm_contact_created"]);
  expect(activity.every(row => row.actorId === "admin")).toBe(true);
});
