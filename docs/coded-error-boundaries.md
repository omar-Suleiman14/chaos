# Coded error boundaries

`lib/codedMessage.ts` shares only recognition of a coded message and trimming of
its extracted message. Each caller explicitly selects its historical pattern:

| Boundary | Existing recognition rule | Responsibility retained by caller |
| --- | --- | --- |
| Browser `parseError` | Embedded uppercase/underscore code of at least three characters, through end of message | Stack/client suffix removal, empty-message fallback, readable uncaught errors, network wording |
| Backend `errorCode` | Embedded uppercase/underscore code of at least two characters | Raw input conversion and fallback; no added sanitization |
| Convex `mcpErrorCode` | Word-boundary uppercase/underscore code of at least three characters, through end of message | Structured ConvexError details, request/stack removal, readable validation/classification |
| MCP `toolError` | Entire error message begins with uppercase/underscore code of at least two characters | Error-instance requirement, McpToolError details, SDK input validation, category/recovery/retry metadata, internal-error sanitization |

Every pattern requires the existing colon and single space delimiter; message
contents may contain further whitespace or multiple lines. The code must start
with an uppercase letter; historical suffix matching remains as before. No caller
gains a more permissive parser, a new error code, or a different authorization
decision. Unknown programming errors remain sanitized at the MCP tool boundary.

The helper does not convert arbitrary errors, remove stacks or classify failures.
Those differences are deliberate client/transport policies. In particular, a
string input can be parsed by native/backend helpers while MCP's tool error path
continues to require an Error instance. Structured details remain handled by
their original boundaries, not reconstructed from text.

Before extraction, 35 compatibility snapshots were recorded on main `77ba616`
for all four boundary outputs, including short/malformed/embedded codes, wrapped
Convex messages, blank/multiline messages, network failures, internal faults,
permission/revision/rate errors, strings, unknown values and structured details.
`tests/unit/errorBoundaryCompatibility.test.ts` compares exact output shapes after
extraction. The existing MCP error and integration suites verify real transport
sanitization, categories, recoverability, permissions and HTTP responses.
