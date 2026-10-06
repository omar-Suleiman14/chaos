/**
 * MCP tools return forms as `form_<id>` and classic quizzes as `quiz_<id>`
 * (convex/mcp.ts), while assessment references (lesson attachments, quiz
 * blocks, course module assessments, live games from lessons) store bare
 * ids. Assistants pass back exactly what a tool returned, so every asset
 * reference in a tool input accepts both. The prefix is authoritative for
 * the kind: `quiz_` is always a classic quiz, `form_` always a form.
 */
const PREFIXED = /^(form|quiz)_([A-Za-z0-9]+)$/;

export function bareAssetRef<A extends { kind: "form" | "quiz"; id: string }>(asset: A): A {
  const match = PREFIXED.exec(asset.id);
  return match ? { ...asset, kind: match[1] as A["kind"], id: match[2] } : asset;
}

/** Rewrites every `{ kind: "form" | "quiz", id }` inside a tool input to bare ids. */
export function normalizeAssetRefs<T>(value: T, depth = 0): T {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeAssetRefs(item, depth + 1)) as T;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) out[key] = normalizeAssetRefs(item, depth + 1);
  if ((out.kind === "form" || out.kind === "quiz") && typeof out.id === "string" && Object.keys(out).length === 2) return bareAssetRef(out as { kind: "form" | "quiz"; id: string }) as T;
  return out as T;
}
