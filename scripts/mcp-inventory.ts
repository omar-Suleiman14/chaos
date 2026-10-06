import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "../lib/mcp/server";

type Tool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];

async function listTools(admin: boolean) {
 const server = createChaosMcpServer({ call: null, admin, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const client = new Client({ name: admin ? "admin-inventory" : "inventory", version: "1" });
 const [a,b] = InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(a),client.connect(b)]);
 const { tools } = await client.listTools();
 await client.close(); await server.close();
 return tools;
}

/** Everything a client sees for a tool. A change here changes what ChatGPT and Claude are offered. */
const contract = (tool: Tool) => ({ title: tool.title ?? null, description: tool.description ?? "", permission: (tool._meta as Record<string, unknown> | undefined)?.["chaos/permission"] ?? null, annotations: tool.annotations ?? null, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? null });

/** Names what changed between two schema snapshots, tool by tool, so CI says more than "stale". */
function describeChanges(before: Record<string, Record<string, unknown>>, after: Record<string, Record<string, unknown>>) {
 const lines: string[] = [];
 for (const name of Object.keys(after)) if (!(name in before)) lines.push(`+ ${name} (added)`);
 for (const name of Object.keys(before)) if (!(name in after)) lines.push(`- ${name} (removed)`);
 for (const name of Object.keys(after)) {
  if (!(name in before)) continue;
  const fields = Object.keys(after[name]).filter(field => JSON.stringify(before[name][field]) !== JSON.stringify(after[name][field]));
  if (fields.length) lines.push(`~ ${name}: ${fields.join(", ")} changed`);
 }
 return lines;
}

async function main() {
 const publicTools = await listTools(false);
 const names = publicTools.map(t => t.name).sort();
 const adminTools = (await listTools(true)).filter(t => !names.includes(t.name));
 const adminNames = adminTools.map(t => t.name).sort();
 const json = JSON.stringify({ count: names.length, names, administratorCount: adminNames.length, administratorNames: adminNames }, null, 2) + "\n";
 const byName = (tools: Tool[]) => Object.fromEntries([...tools].sort((x, y) => x.name.localeCompare(y.name)).map(t => [t.name, contract(t)]));
 const schemas = { public: byName(publicTools), administrator: byName(adminTools) };
 const schemaJson = JSON.stringify(schemas, null, 1) + "\n";
 const docs = `# MCP tool inventory\n\nGenerated from the public and administrator MCP registries with \`pnpm mcp:inventory\`. Administrator tools are advertised only to verified administrator connections; see [MCP permissions](mcp-permissions.md).\n\n${names.length} public tools are registered. The count describes API coverage; see [Connect](/connect) for useful workflows.\n\n${names.map(n => `- \`${n}\``).join("\n")}\n\n## Administrator tools\n\n${adminNames.length} additional tools mirror the administration UI. Every call rechecks current backend authorization.\n\n${adminNames.map(n => `- \`${n}\``).join("\n")}\n`;
 const marker = `<!-- mcp-inventory:start -->\nThe public MCP registry currently exposes **${names.length} tools**. See the [generated inventory](docs/mcp-tool-inventory.md) and [connection guide](https://chaos.fail/connect).\n<!-- mcp-inventory:end -->`;
 const readme = await readFile("README.md", "utf8");
 const updated = readme.includes("<!-- mcp-inventory:start -->") ? readme.replace(/<!-- mcp-inventory:start -->[\s\S]*?<!-- mcp-inventory:end -->/,marker) : readme + "\n" + marker + "\n";
 const files: [string, string][] = [["lib/mcp/inventory.json",json],["lib/mcp/tool-schemas.json",schemaJson],["docs/mcp-tool-inventory.md",docs],["README.md",updated]];
 if (!process.argv.includes("--check")) { for (const [path,content] of files) await writeFile(path,content); return; }

 const stale: string[] = [];
 for (const [path,content] of files) if (await readFile(path,"utf8").catch(() => "") !== content) stale.push(path);
 if (!stale.length) return;
 const previous = JSON.parse(await readFile("lib/mcp/tool-schemas.json","utf8").catch(() => "{}")) as Partial<typeof schemas>;
 const changes = [...describeChanges(previous.public ?? {}, schemas.public), ...describeChanges(previous.administrator ?? {}, schemas.administrator).map(line => `${line} [administrator]`)];
 throw new Error([
  `MCP tools changed without updating the snapshot (${stale.join(", ")}).`,
  `Public tools: ${names.length} (snapshot ${previous.public ? Object.keys(previous.public).length : "missing"}). Administrator tools: ${adminNames.length}.`,
  ...changes,
  "If the change is intended, run pnpm mcp:inventory and commit the result.",
 ].join("\n"));
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
