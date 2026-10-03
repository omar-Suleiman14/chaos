import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const ref = z.string().min(1).max(100);
const page = {
  paginationOpts: z.object({
    numItems: z.number().int().min(1).max(50),
    cursor: z.string().max(2000).nullable(),
  }),
};
const parentId = ref.nullable();
const pagedOutput = {
  page: z.array(z.record(z.string(), z.unknown())),
  isDone: z.boolean(),
  continueCursor: z.string(),
};
const asset = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("form"), id: ref }),
  z.object({ kind: z.literal("quiz"), id: ref }),
  z.object({ kind: z.literal("lesson"), id: ref }),
  z.object({ kind: z.literal("source"), id: ref }),
  z.object({ kind: z.literal("collection"), id: ref }),
]);
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const write = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
export function registerOrganizationTools(
  server: McpServer,
  run: (
    tool: string,
    input: Record<string, unknown>,
    summarize: (data: Record<string, unknown>) => string,
  ) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  const meta = { securitySchemes };
  server.registerTool(
    "list_folders",
    {
      description:
        "List owned folders under the selected parent; null selects root. Existing active Chaos account required. Continue using continueCursor.",
      inputSchema: { parentId, ...page },
      outputSchema: pagedOutput,
      annotations: read,
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run("list_folders", input, () => "Folders loaded."),
  );
  server.registerTool(
    "create_folder",
    {
      description:
        "Create an owned private folder, maximum depth 8. Requires ownership of parent. Each successful call creates a folder; inspect the list before retrying an uncertain success.",
      inputSchema: { name: z.string().trim().min(1).max(120), parentId },
      outputSchema: { id: ref },
      annotations: write,
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run("create_folder", input, () => "Folder created."),
  );
  server.registerTool(
    "move_folder",
    {
      description:
        "Move an owned folder and its subtree to an owned parent or root. Replaces its current parent; ask for explicit relocation intent. Rejects cycles, depth above 8 and subtrees above 256 nodes. Repeating the same destination is safe, but after uncertain success reload before retrying to avoid overwriting a later move.",
      inputSchema: { folderId: ref, parentId },
      outputSchema: { ok: z.boolean() },
      annotations: { ...write, destructiveHint: true, idempotentHint: true },
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run("move_folder", input, () => "Folder moved."),
  );
  server.registerTool(
    "list_folder_contents",
    {
      description:
        "List owned folder membership references with current asset ownership rechecked. No source bytes, storage IDs or signed URLs. Partial pages may be empty; follow continueCursor.",
      inputSchema: { folderId: ref, ...page },
      outputSchema: pagedOutput,
      annotations: read,
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run("list_folder_contents", input, () => "Folder contents loaded."),
  );
  server.registerTool(
    "add_folder_member",
    {
      description:
        "Idempotently add an owned form, quiz, lesson, active source or collection to an owned folder. Does not change asset sharing or return source bytes.",
      inputSchema: { folderId: ref, asset },
      outputSchema: { id: ref },
      annotations: { ...write, idempotentHint: true },
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run("add_folder_member", input, () => "Folder member added."),
  );
  for (const [name, scope] of [
    ["institutions", {}],
    ["programs", { institutionId: ref }],
    ["versions", { programId: ref }],
    ["nodes", { versionId: ref, parentId: ref.nullable().optional() }],
  ] as const)
    server.registerTool(
      "list_curriculum_" + name,
      {
        description:
          "Browse public canonical curriculum " +
          name +
          ". Existing active account required. Nodes and parents must belong to the selected version. No private lessons or source content.",
        inputSchema: { ...scope, ...page },
        outputSchema: pagedOutput,
        annotations: read,
        _meta: meta,
      },
      (input: Record<string, unknown>) =>
        run("list_curriculum_" + name, input, () => "Curriculum loaded."),
    );
  const coverage = z.array(z.string().trim().min(1).max(200)).max(100);
  server.registerTool(
    "list_lesson_curriculum_mappings",
    {
      description:
        "Read all curriculum mapping references and concept/block coverage of an owned lesson draft, one page at a time. Ownership is required even for public lessons. Continue using continueCursor. No lesson text or source content.",
      inputSchema: { lessonId: ref, ...page },
      outputSchema: pagedOutput,
      annotations: read,
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run(
        "list_lesson_curriculum_mappings",
        input,
        () => "Curriculum mappings loaded.",
      ),
  );
  server.registerTool(
    "search_curriculum_modules",
    {
      description:
        "Find public canonical modules within an explicitly selected curriculum version by natural module name, exact key or registered alias. Returns at most limit results (default 20, maximum 50); choose a version before searching. Existing active account required. No private lessons or source content.",
      inputSchema: {
        versionId: ref,
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: { modules: z.array(z.record(z.string(), z.unknown())) },
      annotations: read,
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run(
        "search_curriculum_modules",
        input,
        () => "Curriculum modules loaded.",
      ),
  );
  server.registerTool(
    "create_lesson_curriculum_mapping",
    {
      description:
        "Map an owned lesson draft to a node of the selected curriculum version. Requires nonempty concept or block coverage, unique entries, concepts declared on the node and block IDs present in the current draft. Does not publish. Duplicate lesson/node mappings are rejected; inspect existing state before retrying uncertain success.",
      inputSchema: {
        lessonId: ref,
        versionId: ref,
        nodeId: ref,
        conceptKeys: coverage,
        blockIds: coverage,
      },
      outputSchema: { id: ref },
      annotations: write,
      _meta: meta,
    },
    (input: Record<string, unknown>) =>
      run(
        "create_lesson_curriculum_mapping",
        input,
        () => "Curriculum mapping created.",
      ),
  );
}
