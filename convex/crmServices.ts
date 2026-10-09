import { v, type Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const crmStage = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("active"),
  v.literal("closed"),
);
export const contactListArgs = {
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
  stage: v.optional(crmStage),
  followUps: v.optional(v.boolean()),
};
export const contactSaveArgs = {
  id: v.optional(v.id("crmContacts")),
  name: v.string(),
  email: v.string(),
  organization: v.string(),
  stage: crmStage,
  owner: v.string(),
  source: v.string(),
  nextFollowUp: v.optional(v.number()),
  userId: v.optional(v.id("users")),
};
type ListArgs = Infer<ReturnType<typeof v.object<typeof contactListArgs>>>;
type SaveArgs = Infer<ReturnType<typeof v.object<typeof contactSaveArgs>>>;

/** Call after checking administrator access in the native or MCP entry point. */
export async function listCrmContacts(ctx: QueryCtx, args: ListArgs) {
  if (
    !Number.isSafeInteger(args.paginationOpts.numItems) ||
    args.paginationOpts.numItems < 1 ||
    args.paginationOpts.numItems > 48 ||
    (args.search?.length ?? 0) > 200
  )
    throw new Error("VALIDATION_FAILED: Invalid CRM search or page size.");
  // Follow-up searches use the name search index (word and prefix matches, by relevance),
  // like the main list; an exact-name filter missed "omar" for "Omar Suleiman".
  if (args.followUps && args.search?.trim())
    return (
      ctx.db
        .query("crmContacts")
        .withSearchIndex("search_name", (q) => {
          const search = q.search("name", args.search!.trim());
          return args.stage ? search.eq("stage", args.stage) : search;
        })
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) => q.and(q.gt(q.field("nextFollowUp"), 0), q.neq(q.field("stage"), "closed")))
        .paginate(args.paginationOpts)
    );
  if (args.followUps)
    return (
      ctx.db
        .query("crmContacts")
        .withIndex("by_follow_up", (q) => q.gt("nextFollowUp", 0))
        // Residual filters preserve indexed date ordering before pagination.
        // eslint-disable-next-line @convex-dev/no-filter-in-query
        .filter((q) =>
          q.and(
            q.neq(q.field("stage"), "closed"),
            args.stage ? q.eq(q.field("stage"), args.stage) : true,
          ),
        )
        .order("asc")
        .paginate(args.paginationOpts)
    );
  if (args.search?.trim())
    return ctx.db
      .query("crmContacts")
      .withSearchIndex("search_name", (q) => {
        const search = q.search("name", args.search!.trim());
        return args.stage ? search.eq("stage", args.stage) : search;
      })
      .paginate(args.paginationOpts);
  const source = args.stage
    ? ctx.db
        .query("crmContacts")
        .withIndex("by_stage", (q) => q.eq("stage", args.stage!))
    : ctx.db.query("crmContacts");
  return source.order("desc").paginate(args.paginationOpts);
}
export async function readCrmNotes(
  ctx: QueryCtx,
  contactId: Id<"crmContacts">,
) {
  if (!(await ctx.db.get("crmContacts", contactId)))
    throw new Error("NOT_FOUND: Contact not found.");
  return ctx.db
    .query("crmNotes")
    .withIndex("by_contact", (q) => q.eq("contactId", contactId))
    .order("desc")
    .take(100);
}
async function auditCrm(
  ctx: MutationCtx,
  actorId: string,
  action: string,
  target: string,
  reason: string,
) {
  await ctx.db.insert("adminAudit", {
    actorId,
    action,
    target,
    reason,
    createdAt: Date.now(),
  });
}
export async function saveCrmContact(
  ctx: MutationCtx,
  actorId: string,
  args: SaveArgs,
) {
  const { id, ...fields } = args;
  const name = fields.name.trim(),
    email = fields.email.trim().toLowerCase();
  if (!name || name.length > 200)
    throw new Error(
      "VALIDATION_FAILED: Enter a contact name (up to 200 characters).",
    );
  if (
    email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  )
    throw new Error("VALIDATION_FAILED: Enter a valid email address.");
  for (const field of [fields.organization, fields.owner, fields.source])
    if (field.length > 200)
      throw new Error(
        "VALIDATION_FAILED: Contact fields must be under 200 characters.",
      );
  if (
    fields.nextFollowUp !== undefined &&
    !Number.isFinite(fields.nextFollowUp)
  )
    throw new Error("VALIDATION_FAILED: Invalid follow-up date.");
  if (fields.userId && !(await ctx.db.get("users", fields.userId)))
    throw new Error("NOT_FOUND: Account not found.");
  if (id && !(await ctx.db.get("crmContacts", id)))
    throw new Error("NOT_FOUND: Contact not found.");
  if (email) {
    const duplicate = await ctx.db
      .query("crmContacts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (duplicate && duplicate._id !== id)
      throw new Error("CONFLICT: A contact with this email already exists.");
  }
  const data = {
    ...fields,
    nextFollowUp: fields.nextFollowUp,
    name,
    email,
    organization: fields.organization.trim(),
    owner: fields.owner.trim(),
    source: fields.source.trim(),
    updatedAt: Date.now(),
  };
  const contactId =
    id ??
    (await ctx.db.insert("crmContacts", { ...data, createdAt: Date.now() }));
  if (id) await ctx.db.patch("crmContacts", id, data);
  await auditCrm(
    ctx,
    actorId,
    id ? "crm_contact_updated" : "crm_contact_created",
    String(contactId),
    name,
  );
  return contactId;
}
export async function addCrmNote(
  ctx: MutationCtx,
  actorId: string,
  contactId: Id<"crmContacts">,
  body: string,
) {
  if (!(await ctx.db.get("crmContacts", contactId)))
    throw new Error("NOT_FOUND: Contact not found.");
  const text = body.trim();
  if (!text || text.length > 5000)
    throw new Error(
      "VALIDATION_FAILED: Enter a note between 1 and 5000 characters.",
    );
  await ctx.db.insert("crmNotes", {
    contactId,
    body: text,
    actorId,
    createdAt: Date.now(),
  });
  await ctx.db.patch("crmContacts", contactId, { updatedAt: Date.now() });
  await auditCrm(
    ctx,
    actorId,
    "crm_note_added",
    String(contactId),
    "Added a contact note",
  );
}
