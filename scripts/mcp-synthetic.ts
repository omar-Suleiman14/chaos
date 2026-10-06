// Synthetic MCP check against a deployed Chaos (production or staging), the way ChatGPT sees it.
//
//   MCP_SYNTHETIC_URL=https://chaos.fail/mcp MCP_SYNTHETIC_TOKEN=… tsx scripts/mcp-synthetic.ts
//
// 1. list_tools: the deployed tool names and contracts must match lib/mcp/tool-schemas.json,
//    so "the repo has N tools but ChatGPT is offered something else" is caught within hours.
// 2. Authenticated reads (get_my_card, list_folders) with response schemas verified.
// 3. An isolated write: a private draft lesson is created, read back, has its block deleted
//    and is archived. It is never published and lives only in the synthetic account.
// 4. Latency: /api/health and every call is timed over MCP_SYNTHETIC_SAMPLES rounds; p50/p75/p95 go to
//    perf/results/mcp-synthetic.json in the budget format (pnpm perf:check compares them
//    with perf/baselines/mcp-synthetic.json).
//
// The token belongs to a dedicated account with no real content (docs/production-monitoring.md).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { byName, describeChanges, type Contract } from "./lib/mcpContract";
import { quantiles } from "./lib/stats";

const url = process.env.MCP_SYNTHETIC_URL ?? "https://chaos.fail/mcp";
const token = process.env.MCP_SYNTHETIC_TOKEN;
const samples = Math.max(1, Number(process.env.MCP_SYNTHETIC_SAMPLES ?? 5));
const results = join("perf", "results");

const timings: Record<string, number[]> = {};
const failed: string[] = [];
const notes: string[] = [];

async function timed<T>(name: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await run(); } finally { (timings[name] ??= []).push(performance.now() - start); }
}

async function step(name: string, run: () => Promise<void>) {
  try { await run(); notes.push(`✓ ${name}`); }
  catch (error) { failed.push(name); notes.push(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`); }
}

type CallResult = Awaited<ReturnType<Client["callTool"]>>;
/** Calls a tool and requires a successful, schema-shaped result (the SDK validates structuredContent against outputSchema). */
async function call(client: Client, name: string, args: Record<string, unknown>, outputSchema: boolean): Promise<Record<string, unknown>> {
  const result: CallResult = await timed(name, () => client.callTool({ name, arguments: args }));
  if (result.isError) throw new Error(`${name} returned an error: ${JSON.stringify(result.content).slice(0, 300)}`);
  const structured = result.structuredContent as Record<string, unknown> | undefined;
  if (outputSchema && !structured) throw new Error(`${name} declares an output schema but returned no structured content`);
  return structured ?? {};
}

async function main() {
  if (!token) throw new Error("MCP_SYNTHETIC_TOKEN is required (an OAuth access token for the synthetic account).");
  // The plain API path: a no-backend route, so its latency is the edge and function cold-start cost alone.
  const health = new URL("/api/health", url);
  for (let round = 0; round < samples; round++) {
    await step(`api health (round ${round + 1})`, async () => {
      const response = await timed("api_health", () => fetch(health, { cache: "no-store" }));
      if (!response.ok || (await response.json() as { status?: string }).status !== "ok") throw new Error(`${health} answered ${response.status}`);
    });
  }

  const client = new Client({ name: "chaos-synthetic", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await timed("connect", () => client.connect(transport));

  let outputs = new Set<string>();
  for (let round = 0; round < samples; round++) {
    const { tools } = await timed("list_tools", () => client.listTools());
    outputs = new Set(tools.filter((t) => t.outputSchema).map((t) => t.name));
    if (round > 0) continue;
    await step("deployed tools match the repository", async () => {
      const expected = (JSON.parse(readFileSync("lib/mcp/tool-schemas.json", "utf8")) as { public: Record<string, Contract> }).public;
      const changes = describeChanges(expected, byName(tools));
      notes.push(`  ${tools.length} tools deployed, ${Object.keys(expected).length} in the repository`);
      if (changes.length) throw new Error(`deployed tools differ from lib/mcp/tool-schemas.json:\n${changes.map((c) => `    ${c}`).join("\n")}`);
    });
  }

  for (let round = 0; round < samples; round++) {
    await step(`authenticated reads (round ${round + 1})`, async () => {
      const card = await call(client, "get_my_card", {}, outputs.has("get_my_card"));
      if (typeof card.username !== "string") throw new Error("get_my_card returned no username");
      const folders = await call(client, "list_folders", { parentId: null, paginationOpts: { numItems: 10, cursor: null } }, outputs.has("list_folders"));
      if (!Array.isArray(folders.page)) throw new Error("list_folders returned no page");
    });
  }

  await step("isolated create, read, delete and archive", async () => {
    const stamp = new Date().toISOString();
    const created = await call(client, "create_lesson", {
      metadata: { title: `Synthetic check ${stamp}`, description: "Created and archived by the scheduled MCP check.", language: "en", tags: [] },
      document: { schemaVersion: 1, blocks: [{ id: "synthetic", type: "paragraph", text: stamp, citations: [], conceptIds: [] }] },
      publish: false,
      visibility: "private",
    }, outputs.has("create_lesson"));
    const lessonId = String(created.lessonId ?? "");
    if (!lessonId) throw new Error("create_lesson returned no lessonId");
    if (created.published === true) throw new Error("create_lesson published a lesson created with publish: false");
    try {
      const read = await call(client, "get_lesson", { lessonId, view: "draft" }, outputs.has("get_lesson"));
      const blocks = ((read.document as { blocks?: { id: string }[] } | undefined)?.blocks ?? []).map((b) => b.id);
      if (!blocks.includes("synthetic")) throw new Error("get_lesson did not return the block just written");
      const deleted = await call(client, "delete_lesson_blocks", { lessonId, expectedRevision: Number(read.revision ?? created.revision ?? 0), blockIds: ["synthetic"] }, outputs.has("delete_lesson_blocks"));
      const after = await call(client, "get_lesson", { lessonId, view: "draft" }, outputs.has("get_lesson"));
      if (((after.document as { blocks?: { id: string }[] } | undefined)?.blocks ?? []).some((b) => b.id === "synthetic")) throw new Error("a deleted block is still returned");
      await call(client, "set_lesson_lifecycle", { lessonId, expectedRevision: Number(deleted.revision), action: "archive" }, outputs.has("set_lesson_lifecycle"));
    } catch (error) {
      // Never leave a live synthetic lesson behind, even when a middle step failed.
      const current = await client.callTool({ name: "get_lesson", arguments: { lessonId, view: "outline" } }).catch(() => null);
      const revision = (current?.structuredContent as { revision?: number } | undefined)?.revision;
      if (revision !== undefined) await client.callTool({ name: "set_lesson_lifecycle", arguments: { lessonId, expectedRevision: revision, action: "archive" } }).catch(() => null);
      throw error;
    }
  });

  await client.close();
}

function write() {
  mkdirSync(results, { recursive: true });
  const metrics: Record<string, { value: number; unit: "ms" }> = {};
  const table = ["| Call | n | p50 | p75 | p95 |", "|---|---:|---:|---:|---:|"];
  for (const [name, values] of Object.entries(timings).sort(([a], [b]) => a.localeCompare(b))) {
    const q = quantiles(values);
    for (const [k, value] of Object.entries(q)) if (Number.isFinite(value)) metrics[`${name}.${k}`] = { value, unit: "ms" };
    table.push(`| \`${name}\` | ${values.length} | ${q.p50} ms | ${q.p75} ms | ${q.p95} ms |`);
  }
  writeFileSync(join(results, "mcp-synthetic.json"), JSON.stringify({ suite: "mcp-synthetic", failed, metrics, url, at: new Date().toISOString() }, null, 2) + "\n");
  const md = [`## MCP synthetic check: ${url}`, "", ...notes, "", ...table, ""].join("\n");
  writeFileSync(join(results, "mcp-synthetic.md"), md);
  console.log(md);
}

main()
  .catch((error) => { failed.push("connection"); notes.push(`✗ ${error instanceof Error ? error.message : String(error)}`); })
  .finally(() => { write(); process.exitCode = failed.length ? 1 : 0; });
