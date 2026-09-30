/**
 * Convex errors arrive as "[CONVEX M(x)] [Request ID: …] Server Error\nUncaught
 * Error: CODE: message\n    at handler (…)". Extract the code and the
 * human-readable message.
 */
export function parseError(err: unknown, fallback = "Something went wrong. Please try again."): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const withoutStack = raw.split(/\n\s+at /)[0];
  const match = withoutStack.match(/([A-Z][A-Z_]{2,}): ([\s\S]*)$/);
  if (match) return { code: match[1], message: match[2].trim() || fallback };
  const uncaught = withoutStack.match(/Uncaught Error: ([\s\S]*)$/);
  if (uncaught) return { code: "ERROR", message: uncaught[1].trim() || fallback };
  if (/network|fetch|connection/i.test(raw)) return { code: "NETWORK", message: "You appear to be offline. Your work is kept here; try again when connected." };
  return { code: "ERROR", message: raw && !raw.includes("[CONVEX") ? raw : fallback };
}

export function errorMessage(err: unknown, fallback?: string): string {
  return parseError(err, fallback).message;
}
