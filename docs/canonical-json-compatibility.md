# Canonical serialization compatibility

`convex/canonicalJson.ts` shares recursive key-sorted serialization while retaining
the byte contracts historically used by each caller. These bytes determine answer
equality or persisted idempotency request hashes; changing them can turn a valid
retry into a conflict. No stored hash or answer is rewritten by this extraction.

| Contract | Callers | Object keys | Undefined object property | Undefined scalar/array entry |
| --- | --- | --- | --- | --- |
| `answers` | `respond.updateSubmission` | Lexical | Retained as `undefined` | Undefined scalar; empty array slot |
| `integration` | HTTP v1 and Learn v2 request hashes | Lexical | Omitted | `null` |
| `organization` | Organization v2 request hashes | Existing `localeCompare` | Retained as `null` | `null` |

Arrays retain order. Sparse array holes remain empty in all contracts. Number
formatting, string escaping, non-finite numbers and negative zero retain their
existing `JSON.stringify` behavior. Object traversal remains `Object.entries`;
the helper does not introduce `toJSON` calls, Unicode normalization, alternate
number formats or a new canonicalization standard. The organization contract
retains its existing runtime locale behavior rather than changing historical
ordering to the other endpoints' lexical comparator.

The legacy answer contract can return undefined for an undefined scalar and can
emit non-JSON text for unsupported values. Its ordinary validated answer inputs
remain unchanged; these historical edge cases are preserved rather than silently
normalized. The integration contracts always produce strings or propagate the
same serialization error.

Synthetic expected bytes were captured from the four serializers on main
`77ba616` before extraction. `tests/fixtures/canonical-json.json` and
`tests/unit/canonicalJson.test.ts` cover their distinct contracts. Integration
tests pin existing HTTP v1, Learn v2 and organization v2 hashes, reordered retry
behavior, conflicting requests, namespaces and unchanged answer resubmissions.
Existing authorization/revocation checks before replay remain in their callers.
