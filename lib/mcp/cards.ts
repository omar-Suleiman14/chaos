import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export function registerCardTools(
  server: McpServer,
  run: (
    tool: string,
    input: Record<string, unknown>,
    summarize: (data: Record<string, unknown>) => string,
  ) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  const ref = z.string().trim().min(1).max(64);
  const page = {
    cursor: z.string().max(4096).optional(),
    limit: z.number().int().min(1).max(48).optional(),
  };
  const card = z.object({
    name: z.string(),
    username: z.string(),
    seed: z.string(),
    memberSince: z.number(),
    style: z.number(),
  });
  const pagination = {
    isDone: z.boolean(),
    continueCursor: z.string(),
    splitCursor: z.string().nullable().optional(),
    pageStatus: z
      .enum(["SplitRecommended", "SplitRequired"])
      .nullable()
      .optional(),
  };
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const meta = { securitySchemes };
  server.registerTool(
    "get_student_card_preferences",
    {
      description:
        "Read YOUR global student Card visibility preference. Public by default; visible=false hides your Card from every teacher's public page and the authors carousel. Individual teacher opt-outs can still apply when globally enabled.",
      inputSchema: {},
      outputSchema: { visible: z.boolean() },
      annotations: read,
      _meta: meta,
    },
    (input) =>
      run(
        "get_student_card_preferences",
        input,
        () => "Your student Card preference loaded.",
      ),
  );
  server.registerTool(
    "set_student_card_preferences",
    {
      description:
        "Set YOUR global student Card visibility. Public by default; visible=false opts out of all teachers' public student Cards. visible=true restores the default without clearing individual teacher opt-outs. This is the same preference as settings and the card creation checkbox.",
      inputSchema: { visible: z.boolean() },
      outputSchema: { ok: z.boolean() },
      annotations: { ...read, readOnlyHint: false, openWorldHint: true },
      _meta: meta,
    },
    (input) =>
      run(
        "set_student_card_preferences",
        input,
        () => "Your student Card preference updated.",
      ),
  );
  server.registerTool(
    "list_public_authors",
    {
      description:
        "Browse the public authors carousel with cursor pagination. Only authors with public publications who allow directory listing appear; excludes restricted accounts. Empty pages can still have a continuation cursor. Card fanning is a browser interaction at https://chaos.fail/card.",
      inputSchema: page,
      outputSchema: { page: z.array(card), ...pagination },
      annotations: read,
      _meta: meta,
    },
    (input) =>
      run("list_public_authors", input, () => "Public author cards loaded."),
  );
  server.registerTool(
    "get_public_card",
    {
      description:
        "Read a public Chaos member Card by current username or retained alias: display name, canonical username, chosen avatar seed, join date and theme. Returns card=null when unavailable. No email or account identifiers.",
      inputSchema: { username: ref },
      outputSchema: { card: card.nullable() },
      annotations: read,
      _meta: meta,
    },
    (input) =>
      run("get_public_card", input, () => "Public card lookup complete."),
  );
  server.registerTool(
    "list_public_student_cards",
    {
      description:
        "Read all eligible student Cards for a teacher, public by default unless opted out globally or per teacher. Defaults to 24 per page; follow cursors until isDone to reach every student. No guests, private contexts, answers or grades. Visibility is controlled by each student.",
      inputSchema: { username: ref, ...page },
      outputSchema: {
        page: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            username: z.string().nullable(),
            seed: z.string(),
            style: z.number(),
            context: z.null(),
          }),
        ),
        ...pagination,
      },
      annotations: read,
      _meta: meta,
    },
    (input) =>
      run(
        "list_public_student_cards",
        input,
        () => "Public student cards loaded.",
      ),
  );
  server.registerTool(
    "get_student_card_visibility",
    {
      description:
        "Read YOUR own student-Card visibility for an existing teacher relationship. visible=null means no relationship; false means opted out globally or for this teacher; true means your Card can float around this author's public Card. Never reads another student's preference.",
      inputSchema: { username: ref },
      outputSchema: { visible: z.boolean().nullable() },
      annotations: read,
      _meta: meta,
    },
    (input) =>
      run(
        "get_student_card_visibility",
        input,
        () => "Your student card visibility loaded.",
      ),
  );
  server.registerTool(
    "set_author_listing_visibility",
    {
      description:
        "Choose whether YOUR account appears in the public author carousel and directory. Only authors with public publications are listed. Hiding your listing does not unpublish content or disable direct Card links. Does not change any student's visibility.",
      inputSchema: { visible: z.boolean() },
      outputSchema: { ok: z.boolean() },
      annotations: { ...read, readOnlyHint: false, openWorldHint: true },
      _meta: meta,
    },
    (input) =>
      run(
        "set_author_listing_visibility",
        input,
        () => "Your author listing preference updated.",
      ),
  );
}
