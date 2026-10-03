/**
 * Assistants that can create Chaos content through the MCP connector. A lesson made through one of them shows
 * "Created with <name>" next to its author, the way GitHub labels commits made by an app.
 */
export const AI_CLIENTS = ["chatgpt", "claude", "gemini", "copilot", "cursor", "mistral", "perplexity", "other"] as const;
export type AiClient = (typeof AI_CLIENTS)[number];
export type CreatedWith = { client: AiClient; name: string };

const KNOWN: { client: Exclude<AiClient, "other">; name: string; pattern: RegExp }[] = [
  { client: "chatgpt", name: "ChatGPT", pattern: /chatgpt|openai/i },
  { client: "claude", name: "Claude", pattern: /claude|anthropic/i },
  { client: "gemini", name: "Gemini", pattern: /gemini|google/i },
  { client: "copilot", name: "Copilot", pattern: /copilot|microsoft|github/i },
  { client: "cursor", name: "Cursor", pattern: /cursor/i },
  { client: "mistral", name: "Le Chat", pattern: /mistral|le ?chat/i },
  { client: "perplexity", name: "Perplexity", pattern: /perplexity/i },
];

/**
 * Names the assistant from what the connection tells us (OAuth client name first, then User-Agent).
 * Unknown clients keep a short cleaned-up name; nothing at all means the request did not come from a known app.
 */
export function detectAiClient(...hints: (string | null | undefined)[]): CreatedWith | undefined {
  for (const hint of hints) {
    const known = hint ? KNOWN.find(k => k.pattern.test(hint)) : undefined;
    if (known) return { client: known.client, name: known.name };
  }
  const name = hints[0]?.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 40);
  return name ? { client: "other", name } : undefined;
}

/** Validates a value from an untrusted envelope. */
export function parseCreatedWith(value: unknown): CreatedWith | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { client, name } = value as { client?: unknown; name?: unknown };
  if (typeof client !== "string" || !(AI_CLIENTS as readonly string[]).includes(client) || typeof name !== "string") return undefined;
  const clean = name.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 40);
  return clean ? { client: client as AiClient, name: clean } : undefined;
}
