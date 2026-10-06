import { ConvexError } from "convex/values";

/**
 * The code, message and details an MCP tool failure is reported with. Coded errors (`CODE: message`
 * or ConvexError `{ code }`) keep their code; readable uncoded messages from Chaos functions are sorted
 * into not found, ownership, publication state or validation, so only genuine faults become ERROR.
 */
export function mcpErrorCode(caught: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (caught instanceof ConvexError && caught.data && typeof caught.data === "object" && !Array.isArray(caught.data)) {
    const { code, message, ...details } = caught.data as Record<string, unknown>;
    if (typeof code === "string" && /^[A-Z][A-Z_]+$/.test(code)) {
      return { code: code === "VALIDATION" ? "VALIDATION_FAILED" : code, message: typeof message === "string" ? message : readable(code), ...(Object.keys(details).length ? { details } : {}) };
    }
  }
  const raw = caught instanceof Error ? caught.message : String(caught);
  // Convex prefixes messages with request ids and "Uncaught Error:" and appends stack frames; neither belongs in a tool result.
  const text = raw.replace(/\n\s+at [\s\S]*$/, "").replace(/^\[Request ID: [^\]]+\]\s*(Server Error\s*)?/, "").replace(/^Uncaught (\w*Error): /, (_, kind: string) => kind === "Error" ? "" : `${kind}: `).trim();
  const coded = /\b([A-Z][A-Z_]{2,}): ([\s\S]*)$/.exec(text);
  if (coded) return { code: coded[1], message: coded[2].trim() };
  if (/^(TypeError|RangeError|ReferenceError|SyntaxError|EvalError|URIError)\b/.test(text)) return { code: "ERROR", message: text };
  if (/ArgumentValidationError|Validator error|does not match validator/i.test(text)) {
    const path = /Path: (\S+)/.exec(text)?.[1];
    const reason = /Validator error: ([^\n]+)/.exec(text)?.[1].slice(0, 200);
    return { code: "VALIDATION_FAILED", message: path ? `The value at ${path.replace(/^\./, "")} is not valid; use ids and values returned by Chaos tools.` : reason ? `The arguments are not valid: ${reason}` : "The arguments are not valid; use ids and values returned by Chaos tools." };
  }
  const line = text.split("\n")[0].slice(0, 300);
  if (/not found|unauthori[sz]ed|unavailable|inaccessible|not accessible/i.test(line)) return { code: "NOT_FOUND", message: line };
  if (/\bonly (the )?owner|not the owner|owner may/i.test(line)) return { code: "FORBIDDEN", message: line };
  if (/is not public|not published|is archived|archive state|moderation|cannot publish|can't publish/i.test(line)) return { code: "INVALID_STATUS", message: line };
  if (/\bmust\b|required|at most|at least|exceeds?|too (long|large|many|big)|invalid|unknown|cannot be changed|mismatch|limit|duplicate|does not belong/i.test(line)) return { code: "VALIDATION_FAILED", message: line };
  return { code: "ERROR", message: line };
}

function readable(code: string) {
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ") + ".";
}
