# Learn delivery status

Audit: 2026-09-30, `C:/Users/Lenovo/Documents/chaos` working tree. See [capability matrix](capability-matrix.md) for detailed functions, routes and limits.

## Delivery conclusion

Learn has new durable backend primitives and locally passing focused tests. It is not yet verified as a deployed, wired Learn product. The current `lib/learn/data.ts` hooks still read/write browser state; `localCapabilities` disables shared publishing/device sync. `LessonEditor.tsx` is a local component using browser file storage. No Learn page route or application import of that editor was found in inspected `app/` source. Connections displays Learn selections but does not persist them in its create call. These gaps remain even when backend functions exist.

The full 170-item roadmap is available. This source audit does not establish item-by-item completion. Actual Max UI is outside this repository and remains unconfirmed.

## Backend present and locally verified

- Lessons: `lessons.create/saveDraft/publish/getDraft/getPublished/listOwned/listVersions/restoreVersion/listRecovery/setLifecycle/fork`. Private revision-checked drafts, immutable versions, recovery, ownership and fork origins.
- Sources: `learnSources.create/getMetadata/getContentUrl/update/remove/setGrant`; `POST /learn/sources/upload`, `GET /learn/sources/content`. Independent metadata/content access and revocable proxy authorization; upload validation and private deduplication.
- Organization: `folders.create/list/rename/move/remove/listMembers/addMember/removeMember`; cycle-safe generic hierarchy and membership. `learnCollections.create/replaceItems/publish/getDraft/getPublished/attachAssessment/listAssessments` snapshots collections and owned assessments.
- Curricula: `curricula.createInstitution/createProgram/createVersion/createNode/addAlias/resolveAlias/listInstitutions/listPrograms/listVersions/listNodes/createLessonMapping/removeLessonMapping/listLessonMappings`. Canonical graph/version/mapping primitives, not a delivered institution directory.
- Cards/access: `flashcards.create/save/publish/getPublished/fork`; `lessonPermissions.set/list`. Independent card versions and owner-controlled reader/editor permissions. Card review state remains local.
- Community/evidence: `learnCommunity.setSignals/recordView/report/moderate/appeal/resolveAppeal/reviewIdentity/reviewQuality`, plus bounded queries and moderation history. `startSession/completeBlocks/getProgress/createConcept/mapConcept/learningEvidence` records version-aware progress. Exposure is self-reported; mastery and quiz correctness are explicitly unconfirmed. `learnSearch.searchPublic` searches published assets.

Executed focused Convex tests: `learnAssets`, `learnCommunity`, `learnCurricula`, `learnFolders`, `learnLessons`, `learnSources`, with `pnpm exec vitest run --config vitest.integration.config.mts`: **6 files / 45 tests passed**. Local mocks cover lifecycle and negative permission cases; no deployed acceptance claim follows from that result.

## New contracts: implemented, runtime verification pending

`convex/http.ts` calls `registerLearnIntegrationRoutes`, mounting `/api/integrations/v2/`. `learnIntegrations.ts` implements capabilities/connection reads; selected lesson/item metadata, definition and outline reads; `POST /drafts` for lesson drafts; revision-checked `PATCH` draft/block updates; `DELETE .../link` preserving content. See the matrix for exact paths. `lessons:read/create/update` scopes and separate selected source references gate access. Existing v1 all-forms/quizzes access does not become all-Learn access.

External HTTP APIs are draft-only: no publication, public visibility change, raw BlockNote/editor API, folder/curriculum/progress route or v2 lesson listing was found. Imported provenance is stored in `integrationCreatedItems`. Updates save drafts directly with revision checks; a durable proposal/merge approval queue is not implemented merely because `ChangePreview.tsx` exists.

`lib/mcp/server.ts` registers `registerLearnTools` from `lib/mcp/learn.ts`; `http.ts` dispatches to `mcpLearn.ts`. Exact tools: `list_lessons`, `get_lesson`, `create_lesson`, `save_lesson_draft`, `edit_lesson_blocks`, `publish_lesson`, `restore_lesson_version`, `set_lesson_lifecycle`, `fork_lesson`, `get_learn_source_metadata`. Unlike external connection tokens, authenticated owner MCP has explicit publication/lifecycle operations. MCP uses validated Chaos blocks; source metadata access does not expose file bytes or grant content permissions. Transport and v2 handler behavior were not exercised in this audit.

## User journey still pending

- Persist Learn selection/scopes from Connections, with explicit content grants. Currently `learnRefs` are omitted from the creation payload; picker wording says not shared yet.
- Mount/wire Learn screens and editor to durable functions; adapt local IDs/files/documents deliberately and preserve user work. Browser publication is not shared publication.
- Wire provenance and change comparison to actual received drafts; define proposed-update review semantics before claiming every external update receives a preview.
- Wire reading/progress and card reviews across devices. Notes, highlights, saved content and discussions remain local hooks; progress primitives alone do not synchronize them.
- Audit and implement Max-side note selection, linking and cards separately, then test the full flow: selected Max content → private Chaos draft → owner review/publication → independent Chaos study → authorized Max display. No respondent mirroring or silent private-source export.

## External blockers and later work

Google/Microsoft provider OAuth registration, credentials/consent and live account integrations remain later external dependencies. Parsed imports and existing authentication are not proof of provider sync. Mail delivery and custom domains need provider/operator configuration. Intended deployment and Max-side access are unverified.

Institutional operations/governance, certification/compliance, disaster-recovery drills, load/soak/capacity tests and production observability are deferred. Backend records for institutions, identity claims or quality reviews do not constitute accreditation, compliance certification or scale proof. Preserve the AI-free direction; local Assist callbacks are remaining surface evidence, not delivered AI services.

## Verification and snapshot limits

Only the two assigned docs were written; no code/UI/TASKS edits, commits or deployments. Source reads included UI, `lib/mcp/server.ts`, `lib/mcp/learn.ts`, `convex/http.ts`, v1/v2 integrations and Learn modules/tests. No live browser, production backend or Max acceptance journey was performed; full typecheck/lint/build/regression were not run by this audit. Older `learn-integration.md` labels were not edited and may be stale.

Concurrent workers were still implementing. Final registrations and hook/Connections wiring were reread before delivery; test results are tied to the test-time snapshot. Recheck changed files, generated API, HTTP/MCP permission failures and signed-in journeys before deployment. This document is a delivery record, not implementation.

Final reread addendum: `learnCommunity.ts` gained `getMySignals`, `getReport`, `listIdentityClaims`, `getQualityReview`, `getConceptMappings` and `rank` during concurrent work. Their source presence was confirmed, but tests were not rerun after those edits. Treat these additions as implementation with verification pending.

## Final verification update

The parent run passed app/backend typechecks and 43 integration files (478 tests; one todo) with two workers. The unrestricted parallel run timed out on the existing 500-answer Live test. MCP registration tests now include 45 tools; folder/curriculum tools have output schemas and scalar writes become structured objects. Official Convex codegen validated against personal development deployment superb-zebra-196. Production fortunate-pigeon-964 was not changed.

This supersedes stale pending statements above: folder/curriculum MCP registration is implemented; Learn v2 has 18 passing contract tests; private context and quiz-based learning evidence have dedicated tests. Permanent lesson externalOrigin preserves connection/source provenance after unlink. Learn routes now exist in concurrent UI work, but durable UI wiring and signed-in journeys remain unverified. Nine shared UI lint errors prevent claiming a clean full-tree release.

Delivery uses e2e before main, as requested. The backend/contract snapshot excludes concurrent UI and marketing changes. Provider integrations, AI-related roadmap items, Live team/homework, billing/domains, operational compliance and load testing remain outstanding or explicitly later. This is a foundation delivery, not completion of all 170 items.

Exact e2e snapshot verification: 522 unit tests, 478 integration tests (one todo), app/backend typechecks and full ESLint with zero errors. Includes respondent handling required by verified-email restriction backend. Concurrent Learn UI is excluded. Live Vercel acceptance and production rollout remain unverified.

Development deployment verification: superb-zebra-196 reported functions ready; CLI then exited 1 with a Windows path error. Independent live HTTP checks confirmed public search 200, unauthenticated v2 capabilities 401, and source CORS preflight 204. Production was not changed; Vercel build and signed-in journeys remain unverified.
