import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export type Tool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
export type Contract = Record<string, unknown>;

/** Everything a client sees for a tool. A change here changes what ChatGPT and Claude are offered. */
export const contract = (tool: Tool): Contract => ({ title: tool.title ?? null, description: tool.description ?? "", permission: (tool._meta as Record<string, unknown> | undefined)?.["chaos/permission"] ?? null, annotations: tool.annotations ?? null, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema ?? null });

/** Names what changed between two schema snapshots, tool by tool, so a check says more than "stale". */
export function describeChanges(before: Record<string, Contract>, after: Record<string, Contract>): string[] {
  const lines: string[] = [];
  for (const name of Object.keys(after)) if (!(name in before)) lines.push(`+ ${name} (added)`);
  for (const name of Object.keys(before)) if (!(name in after)) lines.push(`- ${name} (removed)`);
  for (const name of Object.keys(after)) {
    if (!(name in before)) continue;
    const fields = Object.keys(after[name]).filter((field) => JSON.stringify(before[name][field]) !== JSON.stringify(after[name][field]));
    if (fields.length) lines.push(`~ ${name}: ${fields.join(", ")} changed`);
  }
  return lines;
}

export const byName = (tools: Tool[]) => Object.fromEntries([...tools].sort((x, y) => x.name.localeCompare(y.name)).map((t) => [t.name, contract(t)]));

export async function withMcpInventorySession<T>(
  connect: () => Promise<void>,
  list: () => Promise<T>,
  closeClient: () => Promise<void>,
  closeServer: () => Promise<void>,
): Promise<T> {
  try {
    await connect();
    return await list();
  } finally {
    await Promise.allSettled([closeClient(), closeServer()]);
  }
}
