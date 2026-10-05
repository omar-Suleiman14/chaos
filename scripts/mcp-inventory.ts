import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "../lib/mcp/server";
async function main() {
 const server = createChaosMcpServer({ call: null, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const client = new Client({ name: "inventory", version: "1" });
 const [a,b] = InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(a),client.connect(b)]);
 const { tools } = await client.listTools();
 const names = tools.map(t => t.name).sort();
 const adminServer = createChaosMcpServer({ call: null, admin: true, resourceMetadataUrl: "https://chaos.fail/.well-known/oauth-protected-resource/mcp" });
 const adminClient = new Client({ name: "admin-inventory", version: "1" });
 const [c,d] = InMemoryTransport.createLinkedPair();
 await Promise.all([adminServer.connect(c),adminClient.connect(d)]);
 const adminNames = (await adminClient.listTools()).tools.map(t => t.name).filter(name => !names.includes(name)).sort();
 const json = JSON.stringify({ count: names.length, names, administratorCount: adminNames.length, administratorNames: adminNames }, null, 2) + "\n";
 const docs = `# MCP tool inventory\n\nGenerated from the public and administrator MCP registries with \`pnpm mcp:inventory\`. Administrator tools are advertised only to verified administrator connections; see [MCP permissions](mcp-permissions.md).\n\n${names.length} public tools are registered. The count describes API coverage; see [Connect](/connect) for useful workflows.\n\n${names.map(n => `- \`${n}\``).join("\n")}\n\n## Administrator tools\n\n${adminNames.length} additional tools mirror the administration UI. Every call rechecks current backend authorization.\n\n${adminNames.map(n => `- \`${n}\``).join("\n")}\n`;
 const marker = `<!-- mcp-inventory:start -->\nThe public MCP registry currently exposes **${names.length} tools**. See the [generated inventory](docs/mcp-tool-inventory.md) and [connection guide](https://chaos.fail/connect).\n<!-- mcp-inventory:end -->`;
 const readme = await readFile("README.md", "utf8");
 const updated = readme.includes("<!-- mcp-inventory:start -->") ? readme.replace(/<!-- mcp-inventory:start -->[\s\S]*?<!-- mcp-inventory:end -->/,marker) : readme + "\n" + marker + "\n";
 for (const [path,content] of [["lib/mcp/inventory.json",json],["docs/mcp-tool-inventory.md",docs],["README.md",updated]]) {
  if (process.argv.includes("--check")) { if (await readFile(path,"utf8").catch(() => "") !== content) throw new Error(`${path} is stale; run pnpm mcp:inventory`); }
  else await writeFile(path,content);
 }
 await client.close(); await server.close();
 await adminClient.close(); await adminServer.close();
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
