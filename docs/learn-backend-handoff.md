# Native Learn backend handoff

2026-10-01. This handoff covers native readers; AI remains off. New functions are in `convex/learnFrontend.ts`. Parent deployment/codegen must expose them before browser hooks use generated `api.learnFrontend` bindings. No schema or UI changes are required by this module.

## Reader contracts

- `learnFrontend.listOwned({paginationOpts})`: authenticated, active account; own cards only, newest updated first. Metadata, revision, lifecycle, visibility and current published ID; no draft blocks. Page size 1–50.
- `learnFrontend.attachedQuizzes({lessonId})`: existing lesson reader permissions; at most 50 links. Only currently published, available assessments appear. Returns kind, ID, published title, `shareId`, `href`, questionCount, published=true and liveEligible. Classic quizzes have shareId=null and their existing username/slug URL. No questions, answers, explanations, settings, respondent records or owner keys. liveEligible describes content compatibility, not permission to host; hosting still requires existing owner/editor and plan checks. Access-controlled forms retain their normal respondent access gates.
- `learnFrontend.publicProfile({username})`: public username/name/image plus verifiedRoles. Missing, banned or suspended creators return null. Uses existing issuer-qualified claims; pending/rejected/revoked claims are not badges. Institution, evidence, audit reasons, email and account identifiers stay private. Existing claims have no expiry field: this contract adds no invented expiration or quality score. Requires the existing configured Clerk issuer.
- `learnFrontend.listIndexableLessons({paginationOpts})`: anonymous discovery of active/public/community-ok/current published versions, excluding restricted creators. Published metadata and publication timestamp only. No arbitrary version selector or draft metadata. Page size 1–50. Filtered pages may be empty before isDone=true: continue with continueCursor until isDone. Forward Convex pagination options unchanged. Sitemap/SEO must consume this contract anonymously; authenticated owner access is not proof of indexability.

## Exact existing hook targets

- `useMyLessons`: new listOwned cards; `useLesson` editor: `lessons.getDraft({lessonId})`; public `fetchPublicLesson`: existing `lessons.getPublished({lessonId})` without authentication. `listIndexableLessons`: new query above.
- Create/save: `lessons.create`, `lessons.saveDraft` (whole Chaos document plus optional metadata and expectedRevision). Content and metadata share one revision; do not independently overwrite stale copies. Recovery: `lessons.listRecovery`.
- Publish: `lessons.publish`; handle `{ok:false,problems}` as validation failure. Lifecycle: `lessons.setLifecycle` with archive/unpublish/reactivate; history: `lessons.listVersions`; restore: `lessons.restoreVersion`; fork: `lessons.fork` with explicit published version ID.
- Sources: `learnSources.create/update/remove/getMetadata/getContentUrl/setGrant`; upload `POST /learn/sources/upload`; content `GET /learn/sources/content`. Source metadata and bytes have separate grants; knowing a source ID does not grant download. Persist authorized source IDs, not editor-local blob references.
- Folders: `folders.create/list/move/listMembers/addMember/rename/remove/removeMember`. Collections: `learnCollections.create/replaceItems/publish/getDraft/getPublished`; collections are durable ordered snapshots, not folders.
- Curricula: `curricula.listInstitutions/listPrograms/listVersions/listNodes/listLessonMappings/createLessonMapping/removeLessonMapping`. Canonical entity writes are administrative. Followed-course state is outside this module.
- Quiz attachment: `learnCollections.attachAssessment`; owner/manage relationship inspection: `learnCollections.listAssessments`; readers: new attachedQuizzes. Fork: existing `quizForks.fork`, lineage `quizForks.getLineage`. Never reconstruct quizzes from reader payloads.
- Views/signals: `learnCommunity.recordView/setSignals/getMySignals/get`; progress `startSession/completeBlocks/getProgress` in that module. Preserve version/revision and session/write sequence checks; stale sessions are conflicts.
- Verification: existing `learnCommunity.claimIdentity/getMyClaims`; administrative `reviewIdentity/listIdentityClaims`; readers: new publicProfile. Reporting: `learnCommunity.report/getReport`; quality review is separate from identity.
- Flashcards: `flashcards.create/save/publish/getPublished/fork`. Private annotations: learnPersonal.put/list/remove with stable keys, version/block anchors and revision checks; follows: learnPersonal.followModule/listModuleFollows. Six focused tests pass. Anchored discussions remain unfinished.

## Permission and editor decisions

Backend visibility is **private / public / restricted**. UI `unlisted` is unsupported: require explicit selection of restricted with named reader grants, or public with a warning that it is discoverable. Never silently map unlisted to public. `lessonPermissions.set/list` are owner-only; reader grants allow published reading, editor grants also allow draft editing. Grants do not make an asset indexable and do not grant source bytes or quiz ownership.

The additive Chaos v1 extension supports rich inline marks/links, callout, code, quote, divider, toggle, image attribution and bounded hotspots. Use lib/lessonBlockAdapter.ts and preserve its lesson props. Unsupported inline citations/table merges still return actionable errors; never silently discard them. Map browser-local source IDs to authenticated durable sources before saving images/citations. UI hook/converter wiring is still required; do not enable shared publication before that wiring is tested. Metadata now supports indexing, coverUrl and authorDisplay. SEO discovery requires explicit published indexing=index; old records default to no sitemap inclusion.

## Verification

Focused integration tests: permission denial, owned-card bounds, immutable public metadata, hidden publication exclusion, answer-key omission, effective verified roles and banned-profile exclusion. Four tests passed; scoped ESLint passed. Backend tsc initially passed after the reader module was added; the final rerun encountered concurrent `learnPersonal.ts` missing-schema errors. No error was reported in this module. No deployment or live browser verification was performed for this scoped handoff.

## Current delivery boundary

Backend bindings and scoped e2e delivery are handled by Sol; Opus can wire the contracts above. Existing device-local lessons must be imported as validated drafts with explicit review, not silently overwritten. Provider-account setup/live verification follow-ups: GitHub issues #1, #2 and #3. Paid checkout and organization seat accounting remain unavailable.
