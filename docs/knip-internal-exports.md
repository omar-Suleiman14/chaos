# Internal-export cleanup, group 1

Issue #185 requests reviewed groups of approximately ten Knip findings. On current `main`, the committed baseline has 152 entries but Knip reports 149 actual findings. This group makes ten active, module-local implementations private; it does not delete their logic or change values.

| File | Symbols made private | Remaining internal usage |
| --- | --- | --- |
| `lib/flags.ts` | `MAX_RAMP_DAYS`, `EXPIRY_WARNING_DAYS` | Flag lifetime validation and expiry warnings |
| `lib/hosts.ts` | `SECTION_HOME`, `splitHosts` | Section-root redirects and configured self-hosted origins |
| `lib/questionImport.ts` | `QUESTION_IMPORT_LIMITS` | CSV/XLSX byte, row, column, error and expanded-size limits |
| `lib/search.ts` | `normalizeWithMap` | Unicode normalization and original-text match offsets |
| `lib/mcp/errors.ts` | `MCP_ERROR_CATEGORIES` | Exported error-category type inference |
| `lib/mcp/oauth.ts` | `publicOrigin` | MCP resource URLs and OAuth metadata |
| `lib/mcp/permissions.ts` | `MCP_PERMISSIONS` | Exported permission type inference |
| `lib/mcp/server.ts` | `authRequired` | Registered-tool authentication challenges |

Repository-wide symbol searches across application, components, backend, libraries, scripts, tests and docs found references only in each implementation's own module. None is a Convex/framework entrypoint or a registered tool name. This is a private application package, with no published package export contract for these helpers. Keep used exported types, runtime arrays, validators, tool registrations and security behavior unchanged.

Regenerate with `node scripts/knip-check.mjs --update`, then run `pnpm knip:check`. Actual findings decrease **149 → 139** (ten resolved, 6.7%); tracked entries decrease **152 → 139**. The additional three removed entries were already absent before this change: `editor-draft.newClientKey`, `editor-draft.QuizSettingsDraft`, and `Glossary.termSpeech`. Their UI implementations are untouched. There are no added findings, rule changes, ignored symbols, removed tests or larger budgets.

Existing focused tests exercise flag rules, split-host/self-hosting URLs, Unicode search, import safety, authentication provider routes, MCP auth challenges, permissions and error boundaries. Typecheck/build verify all static imports; generated inventory verification checks tool/schema correspondence. New tests that merely inspect `export` keywords would duplicate these checks and provide no behavior coverage.

Remaining baseline entries require their own usage review. In particular, visual components belong to Claude, and local Learn compatibility/import/media functions must not be deleted from Knip findings alone. No runtime performance claim is made; the measurable change is the unused-export count.
