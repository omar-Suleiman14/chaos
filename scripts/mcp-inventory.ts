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
 const json = JSON.stringify({ count: names.length, names }, null, 2) + "\n";
 const docs = `# MCP tool inventory\n\nGenerated from the public MCP registry with \`pnpm mcp:inventory\`. Admin documentation tools are excluded.\n\n${names.length} tools are registered. The count describes API coverage; see [Connect](/connect) for useful workflows.\n\n${names.map(n => `- \`${n}\``).join("\n")}\n`;
 const marker = `<!-- mcp-inventory:start -->\nThe public MCP registry currently exposes **${names.length} tools**. See the [generated inventory](docs/mcp-tool-inventory.md) and [connection guide](https://chaos.fail/connect).\n<!-- mcp-inventory:end -->`;
 const readme = await readFile("README.md", "utf8");
 const updated = readme.includes("<!-- mcp-inventory:start -->") ? readme.replace(/<!-- mcp-inventory:start -->[\s\S]*?<!-- mcp-inventory:end -->/,marker) : readme + "\n" + marker + "\n";
 for (const [path,content] of [["lib/mcp/inventory.json",json],["docs/mcp-tool-inventory.md",docs],["README.md",updated]]) {
  if (process.argv.includes("--check")) { if (await readFile(path,"utf8").catch(() => "") !== content) throw new Error(`${path} is stale; run pnpm mcp:inventory`); }
  else await writeFile(path,content);
 }
 await client.close(); await server.close();
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
