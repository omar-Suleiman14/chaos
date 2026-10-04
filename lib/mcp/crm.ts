import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export function registerCrmTools(
  server: McpServer,
  run: (
    tool: string,
    input: Record<string, unknown>,
    summarize: (data: Record<string, unknown>) => string,
  ) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  const ref = z.string().min(1).max(100);
  const stage = z.enum(["new", "contacted", "active", "closed"]);
  const fields = {
    name: z.string().trim().min(1).max(200),
    email: z.string().max(254),
    organization: z.string().max(200),
    stage,
    owner: z.string().max(200),
    source: z.string().max(200),
    nextFollowUp: z.number().finite().optional(),
    linkedUserId: ref.optional(),
  };
  const contact = z.object({
    _id: ref,
    _creationTime: z.number(),
    name: z.string(),
    email: z.string(),
    organization: z.string(),
    stage,
    owner: z.string(),
    source: z.string(),
    nextFollowUp: z.number().optional(),
    userId: ref.optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  });
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const meta = { securitySchemes };
  server.registerTool(
    "list_crm_contacts",
    {
      title: "List CRM contacts (admin)",
      description:
        "Administrators only: page CRM contacts with optional stage and indexed name search. followUps=true returns scheduled, non-closed contacts in ascending follow-up date order; search then matches the exact name. Contains private contact information; retrieve only what the administrator requests. Page size is bounded to 48.",
      inputSchema: {
        paginationOpts: z
          .object({
            numItems: z.number().int().min(1).max(48),
            cursor: z.string().max(4096).nullable(),
          })
          .strict(),
        search: z.string().max(200).optional(),
        stage: stage.optional(),
        followUps: z.boolean().optional(),
      },
      outputSchema: {
        page: z.array(contact),
        isDone: z.boolean(),
        continueCursor: z.string(),
        splitCursor: z.string().nullable().optional(),
        pageStatus: z
          .enum(["SplitRecommended", "SplitRequired"])
          .nullable()
          .optional(),
      },
      annotations: read,
      _meta: meta,
    },
    (input) => run("list_crm_contacts", input, () => "CRM contacts loaded."),
  );
  server.registerTool(
    "get_crm_contact",
    {
      title: "Read CRM contact (admin)",
      description:
        "Administrators only: read one existing CRM contact and its latest 100 private notes. Returns the saved contact fields, linked account ID, follow-up date and note authors. Read this before replacing contact fields with save_crm_contact.",
      inputSchema: { contactId: ref },
      outputSchema: {
        contact,
        notes: z.array(
          z.object({
            _id: ref,
            _creationTime: z.number(),
            contactId: ref,
            body: z.string(),
            actorId: z.string(),
            createdAt: z.number(),
          }),
        ),
      },
      annotations: read,
      _meta: meta,
    },
    (input) =>
      run("get_crm_contact", input, () => "CRM contact and notes loaded."),
  );
  server.registerTool(
    "save_crm_contact",
    {
      title: "Save CRM contact (admin)",
      description:
        "Administrators only: create a contact, or replace its editable fields when id is supplied. Read get_crm_contact first and preserve fields the administrator did not ask to change. Omitted nextFollowUp clears the scheduled date; omitted linkedUserId unlinks the account. Dates are Unix milliseconds, email may be blank. Writes the admin audit log. Does not send email or notifications. Do not retry after uncertain success.",
      inputSchema: { id: ref.optional(), ...fields },
      outputSchema: { contactId: ref },
      annotations: {
        ...read,
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
      _meta: meta,
    },
    (input) => run("save_crm_contact", input, () => "CRM contact saved."),
  );
  server.registerTool(
    "add_crm_note",
    {
      title: "Add CRM note (admin)",
      description:
        "Administrators only: append a private note to an existing CRM contact and record the authenticated administrator in the audit log. The body must contain 1–5000 characters. Never sends a message to the contact. Do not retry after uncertain success; duplicate notes would be created.",
      inputSchema: { contactId: ref, body: z.string().trim().min(1).max(5000) },
      outputSchema: { ok: z.boolean() },
      annotations: { ...read, readOnlyHint: false, idempotentHint: false },
      _meta: meta,
    },
    (input) => run("add_crm_note", input, () => "Private CRM note added."),
  );
}
