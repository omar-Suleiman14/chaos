import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { codedMessage } from "../codedMessage";

/**
 * What kind of failure a tool error is, so people and assistants know how to recover:
 * fix the arguments, ask for access, reload and retry, finish the content first, wait, or report a fault.
 */
export const MCP_ERROR_CATEGORIES = ["validation", "auth", "permission", "ownership", "not_found", "revision_conflict", "publication", "rate_limit", "plan", "internal"] as const;
export type McpErrorCategory = (typeof MCP_ERROR_CATEGORIES)[number];

const CATEGORY: Record<string, McpErrorCategory> = {
  VALIDATION_FAILED: "validation", INVALID_ARGUMENT: "validation", DRAFT_LIMIT: "validation", LIMIT: "validation",
  UNAUTHORIZED: "auth", ACCOUNT_REQUIRED: "auth", NOT_CONFIGURED: "auth",
  PERMISSION_DENIED: "permission", READ_ONLY: "permission", APPROVAL_REQUIRED: "permission", ACCOUNT_RESTRICTED: "permission", ADMIN_REQUIRED: "permission",
  FORBIDDEN: "permission", NOT_OWNER: "ownership",
  NOT_FOUND: "not_found",
  REVISION_CONFLICT: "revision_conflict", DRAFT_CONFLICT: "revision_conflict", SETTINGS_CONFLICT: "revision_conflict", MEMBERSHIP_CONFLICT: "revision_conflict", CONFLICT: "revision_conflict",
  INVALID_STATUS: "publication", FORM_ARCHIVED: "publication", CONTENT_HELD: "publication", NOT_PUBLISHABLE: "publication", PUBLISH_BLOCKED: "publication",
  RATE_LIMITED: "rate_limit",
  MONTHLY_CREATION_LIMIT: "plan", PRO_REQUIRED: "plan", BUSINESS_REQUIRED: "plan",
};

const RECOVERY: Record<McpErrorCategory, string> = {
  validation: "Fix the arguments and try again.",
  auth: "Reconnect the Chaos account.",
  permission: "This connection or account is not allowed to do this.",
  ownership: "Only the owner can do this.",
  not_found: "Use an id returned by a Chaos tool; it may have been deleted or not shared with this account.",
  revision_conflict: "Reload the current state, then retry with its revision.",
  publication: "Resolve the item's status or problems before publishing or changing it.",
  rate_limit: "Wait a moment before trying again.",
  plan: "This needs a different Chaos plan.",
  internal: "Chaos hit an unexpected problem. Try again in a moment.",
};

/** FORBIDDEN covers both "only the owner" and "admin access required"; the message tells them apart. */
export function errorCategory(code: string, message = ""): McpErrorCategory {
  if ((code === "FORBIDDEN" || code === "PERMISSION_DENIED") && /\bowner\b/i.test(message)) return "ownership";
  return CATEGORY[code] ?? (code.endsWith("_REQUIRED") ? "plan" : code.endsWith("_CONFLICT") ? "revision_conflict" : code === "ERROR" ? "internal" : "validation");
}

export class McpToolError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Errors thrown as `CODE: message` (Convex mutations, permission checks) keep their code. */
function coded(error: unknown): McpToolError | null {
  if (error instanceof McpToolError) return error;
  const match = error instanceof Error ? codedMessage(error.message, "tool") : null;
  return match ? new McpToolError(match.code, match.message) : null;
}

/** The SDK reports schema failures as "message at path" lines; turn them into "path: message" problems. */
function inputValidation(message: string): McpToolError | null {
  const match = /Input validation error: Invalid arguments for tool (\S+): ([\s\S]*)$/.exec(message);
  if (!match) return null;
  const problems = match[2].split("\n").filter(Boolean).slice(0, 10).map((line) => {
    const at = /^([\s\S]*) at (\S+)$/.exec(line);
    return (at ? `${at[2]}: ${at[1]}` : line).slice(0, 300);
  });
  return new McpToolError("VALIDATION_FAILED", `Invalid arguments for ${match[1]}: ${problems.join("; ")}`, { problems });
}

/** A tool error with its code, category and recovery hint in the text, and the same fields machine-readable in _meta. */
export function toolError(error: unknown): CallToolResult {
  const known = coded(error) ?? (error instanceof Error ? inputValidation(error.message) : null);
  const code = known?.code ?? "ERROR";
  const category = errorCategory(code, known?.message);
  const message = known && category !== "internal" ? known.message : RECOVERY.internal;
  const details = known?.details;
  const sentence = /[.!?)]$/.test(message) ? message : `${message}.`;
  const text = `${code} (${category}): ${sentence}${message === RECOVERY[category] ? "" : ` ${RECOVERY[category]}`}${details === undefined ? "" : `\n\n${JSON.stringify(details)}`}`;
  return {
    isError: true,
    content: [{ type: "text", text }],
    _meta: { "chaos/error": { code, category, retryable: category === "revision_conflict" || category === "rate_limit" || category === "internal", ...(details === undefined ? {} : { details }) } },
  };
}
