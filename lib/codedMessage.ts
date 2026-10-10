type Boundary = "client" | "backend" | "convex-mcp" | "tool";

// Historical recognition rules differ; callers retain their own sanitization and fallbacks.
const patterns: Record<Boundary, RegExp> = {
  client: /([A-Z][A-Z_]{2,}): ([\s\S]*)$/,
  backend: /([A-Z][A-Z_]+): ([\s\S]*)/,
  "convex-mcp": /\b([A-Z][A-Z_]{2,}): ([\s\S]*)$/,
  tool: /^([A-Z][A-Z_]+): ([\s\S]*)$/,
};

export function codedMessage(text: string, boundary: Boundary): { code: string; message: string } | null {
  const match = patterns[boundary].exec(text);
  return match ? { code: match[1], message: match[2].trim() } : null;
}
