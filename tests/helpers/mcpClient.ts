import { afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChaosMcpServer } from "../../lib/mcp/server";

const active = new Set<{ client: Client; server: ReturnType<typeof createChaosMcpServer> }>();

afterEach(async () => {
  const sessions = [...active];
  active.clear();
  await Promise.all(sessions.map(async ({ client, server }) => {
    try { await client.close(); } finally { await server.close(); }
  }));
});

/** Real registered SDK tools over the same in-memory protocol; each test owns its sessions. */
export async function connectMcpTestClient(
  options: Parameters<typeof createChaosMcpServer>[0],
  clientInfo: ConstructorParameters<typeof Client>[0],
): Promise<Client> {
  const server = createChaosMcpServer(options);
  const client = new Client(clientInfo);
  active.add({ client, server });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}
