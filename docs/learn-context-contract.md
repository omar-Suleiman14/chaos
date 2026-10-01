# Controlled study context

`learnContext:assemble` and the integration context endpoint remain data-packaging operations. Neither fetches source URLs, extracts uploaded files, calls AI providers, nor includes private notes or outside knowledge.

Existing requests remain valid. Optional `includeCurriculum: true` includes up to 10 applicable mappings from the requested immutable published lesson version, with canonical institution/program/version/node labels. Draft mappings are never substituted. Covered block and concept identifiers are limited to the selected material. Integration requests additionally require `curricula:read`.

Optional `excerptSelections: [{ sourceId, excerptIds }]` includes only manually stored quotations selected by stable ID. Each source must also appear in `sourceIds`, be cited by a selected block, and independently permit content access. Each quotation's exact page/slide/time/section locator must match a selected block citation. Metadata permission does not grant quotation access. Integration requests retain the existing `sources:read` and explicit source-selection checks.

Owners store/replace quotations through `learnSourceExcerpts:replace({ sourceId, expectedRevision, excerpts })`. Replacements require an active owned source, increment `excerptRevision`, and reject stale writes. Up to 50 quotations/50,000 stored JSON bytes are allowed; quotation text is at most 4,000 UTF-8 bytes. No automatic extraction or accuracy claim is made. Returned quotations carry the stored revision and `owner-supplied-unverified` provenance.

Context requests allow at most 10 quotations, 30 lesson blocks and 20 sources. Blocks retain their 50,000-byte limit; the complete context package is capped at 100,000 bytes. Default requests include neither quotations nor curriculum context. Revoked content permission takes effect on subsequent assembly; already exported packages cannot be recalled.

Non-owner context reads also recheck the lesson creator's account restriction even when a reader grant exists. [Boundary regressions](../tests/integration/learnContextBoundaries.test.ts) cover creator bans/suspensions, restricted quotation grant revocation, excerpt replacement/removal, and repeated HTTP requests after source deselection, scope removal, token expiry and revocation. Metadata, API/MCP metadata and default context omit file fingerprints, hashes, storage IDs and unselected quotations. The prior scoped security run passed 87 tests across nine integration suites; live JWT and signed-in browser acceptance remain unverified.

Schema addition: optional `excerpts` and `excerptRevision` on `learnSources` in `learnModel.ts`. No new table or direct `schema.ts` change is required. Deployment/codegen and signed-in UI wiring remain separate verification steps.
