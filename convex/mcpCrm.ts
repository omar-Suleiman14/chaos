import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireLearnActor } from "./mcpLearn";
import {
  addCrmNote,
  contactListArgs,
  contactSaveArgs,
  listCrmContacts,
  readCrmNotes,
  saveCrmContact,
} from "./crmServices";

async function requireCrmAdmin(ctx: QueryCtx | MutationCtx, userId: string) {
  await requireLearnActor(ctx, userId);
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", userId))
    .first();
  if (!admin) throw new Error("FORBIDDEN: Admin access required.");
}
const { userId: _linkedAccount, ...saveArgs } = contactSaveArgs;
export const list = internalQuery({
  args: { userId: v.string(), ...contactListArgs },
  handler: async (ctx, { userId, ...args }) => {
    await requireCrmAdmin(ctx, userId);
    return listCrmContacts(ctx, args);
  },
});
export const get = internalQuery({
  args: { userId: v.string(), contactId: v.id("crmContacts") },
  handler: async (ctx, { userId, contactId }) => {
    await requireCrmAdmin(ctx, userId);
    const contact = await ctx.db.get("crmContacts", contactId);
    if (!contact) throw new Error("NOT_FOUND: Contact not found.");
    return { contact, notes: await readCrmNotes(ctx, contactId) };
  },
});
export const save = internalMutation({
  args: {
    ...saveArgs,
    linkedUserId: v.optional(v.id("users")),
    userId: v.string(),
  },
  handler: async (ctx, { userId, linkedUserId, ...args }) => {
    await requireCrmAdmin(ctx, userId);
    return {
      contactId: await saveCrmContact(ctx, userId, {
        ...args,
        userId: linkedUserId,
      }),
    };
  },
});
export const addNote = internalMutation({
  args: {
    userId: v.string(),
    contactId: v.id("crmContacts"),
    body: v.string(),
  },
  handler: async (ctx, { userId, contactId, body }) => {
    await requireCrmAdmin(ctx, userId);
    await addCrmNote(ctx, userId, contactId, body);
    return { ok: true };
  },
});
