import { expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { errorCode } from "../../convex/serverUtils";
import { mcpErrorCode } from "../../convex/mcpErrors";
import { parseError } from "../../lib/errors";
import { McpToolError, toolError } from "../../lib/mcp/errors";

const messages = [
  "NOT_FOUND: Missing synthetic lesson",
  "AB: Short code",
  "A: Single letter",
  "_ABC: Leading underscore",
  "INVALID_2: Digit in code",
  "NOT_FOUND: ",
  "NOT_FOUND:  Multi-line\nsecond line  ",
  "prefixNOT_FOUND: Embedded code",
  "prefix NOT_FOUND: Embedded code",
  "[Request ID: synthetic] Server Error\nUncaught Error: NOT_FOUND: Missing synthetic lesson\n    at handler (convex/synthetic.ts:1:1)\nCalled by client",
  "Uncaught Error: Readable failure",
  "[CONVEX M(synthetic)] Server Error\nUncaught Error: Private diagnostic\n    at handler (convex/synthetic.ts:1:1)",
  "Network connection failed",
  "TypeError: Internal diagnostic",
  "PERMISSION_DENIED: Only the owner may change this.",
  "REVISION_CONFLICT: Reload this synthetic item.",
  "RATE_LIMITED: Wait before retrying.",
];

// Snapshots recorded on main 77ba616 before extracting recognition; boundary differences are intentional.
for (const message of messages) {
  for (const input of ["error", "string"] as const) {
    it(`preserves ${input} boundary outputs for ${JSON.stringify(message)}`, () => {
      const value = input === "error" ? new Error(message) : message;
      expect({ client: parseError(value, "Synthetic fallback"), backend: errorCode(value), mcp: mcpErrorCode(value), tool: toolError(value) }).toMatchSnapshot();
    });
  }
}

it("preserves structured Convex errors, tool details and unknown input fallbacks", () => {
  const values = [undefined, null, 0, {}, new ConvexError({ code: "VALIDATION", message: "Synthetic validation", problems: [{ path: "title" }] }), new McpToolError("REVISION_CONFLICT", "Reload synthetic item", { currentRevision: 3 })];
  expect(values.map(value => ({ client: parseError(value, "Synthetic fallback"), backend: errorCode(value), mcp: mcpErrorCode(value), tool: toolError(value) }))).toMatchSnapshot();
});
