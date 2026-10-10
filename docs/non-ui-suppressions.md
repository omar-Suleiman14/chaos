# Non-UI suppression and broad-type audit

Issue #189 reviewed the current backend/library/script exceptions against `docs/warning-cleanup.md`. Visual and accessibility exceptions remain with Claude; generated Convex files are excluded from edits. Textual searches also matched ordinary documentation prose, which is not a TypeScript annotation.

## Scoped changes

Thirteen paired function-scoped `no-control-regex` exceptions covered more code than their intended regex literals. Removing them temporarily produced fourteen diagnostics, all for intentional control-character patterns. Replace the pairs with fourteen `oxlint-disable-next-line` guards at those exact regex lines, retaining the security rationale and patterns.

| File | Regex lines guarded | Preserved purpose |
| --- | ---: | --- |
| `convex/formRespondent.ts` | 2 | Typed and legacy hidden URL parameter sanitization |
| `convex/learnSources.ts` | 3 | Public label privacy, file signatures and source metadata validation |
| `convex/courses.ts` | 1 | Course cover URL validation |
| `convex/integrationContract.ts` | 1 | Connector source validation |
| `convex/liveTeams.ts` | 1 | Live team names |
| `convex/respond.ts` | 1 | Upload record filename sanitization |
| `convex/learnValidation.ts` | 3 | Public text and image/link validation |
| `lib/auth/redirect.ts` | 1 | Local authentication-return path validation |
| `lib/xlsx.ts` | 1 | XML 1.0 character safety |

Remove the explicit `any` on the owner index callback in `lessons.buildLessonSearchText`; the generated `users.by_clerkId` index now supplies the inferred callback type. Its query and returned search text are unchanged. The remaining explicit-any public search result shape is already replaced by the separately managed #136 PR (#226); avoid duplicating that in-flight implementation here.

## Exceptions retained

| Category | Locations / reason |
| --- | --- |
| Installation-owned environment | `http`, `auth`, `auth.config`, `authIdentity`, `betterAuth/auth`: selected authentication provider, deployment configuration and legacy ownership-key migration. Removing these exceptions would break supported installation paths. |
| Index compatibility | Three `schema` indexes retain creation ordering/legacy cleanup. Better Auth schema and its generator retain upstream adapter-selected names. Index removal requires a migration and is outside lint cleanup. |
| CRM residual filtering | Two `crmServices` filters preserve indexed follow-up ordering and search/date semantics before pagination. |
| Subscription identity | `queryCache` and `stableQueries` intentionally key effects/memos by query content. Fresh argument objects cannot determine subscription identity without resubscription loops. |
| Validated unknown records | HTTP/integration/MCP parsers, `mcpIds`, `mcpContract`, importers and document adapters inspect unknown data through runtime guards or existing schema/SDK boundaries. Keep those checks and error contracts; type assertions alone never authorize access. |
| SDK/generic bridges | MCP structured responses and sanitized SDK errors, Convex query/cache argument generics, DNS callback overloads, stream/worker APIs and synthetic tooling have separately typed interfaces. Removing casts without an equivalent overload/validation solution can alter errors, SSRF pinning or compatibility. |
| Migration dispatch | `classicQuizMigration` and `consistency` dispatch across table-specific row shapes. Keep controlled table lists, legacy remapping and restartable workers rather than asserting that historical data has one current shape. |
| Browser compatibility | Voice/audio/preferences and haptics casts support browser/vendor APIs and decoded preference shapes; their behavior is outside this backend lint change. |

No lint configuration, rule level, ignored path, CI check, sanitizer pattern or test is relaxed. Typecheck and lint validate the inferred index callback and narrower exceptions. Comparing transpiled JavaScript before/after (comments removed) yields identical output for all ten changed implementation files.

A temporary synthetic copy of `safeAuthReturn` adds an unreviewed control-character regex inside the function. The original function-wide exception accepts it (exit 0); the narrowed guards report `no-control-regex` (exit 1). That synthetic pattern is not committed. Existing targeted redirect, hidden-parameter, import/export, source, live-team, lesson and respondent security regressions retain meaningful coverage. No runtime/performance improvement is claimed.
