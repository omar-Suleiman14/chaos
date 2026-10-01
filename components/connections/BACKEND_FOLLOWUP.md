# Connections backend follow-up

2026-10-01 working-tree inspection. Source implementation is not production acceptance. No backend or shared-schema edits were made for this UI task.

## Supported UI now

Module selection reads the native public curriculum directory and the owner's current lesson mappings. It resolves only active owned lessons, reviews their titles, and persists concrete lesson IDs through `learnIntegrations.setLessonSelection`. No module/future-member grant is stored. It does not turn on scopes automatically; a connection needs `lessons:read` or `lessons:update` for these grants, and `curricula:read` for its own directory API reads. Resolution is bounded to 500 owned lessons, four mapping reads at a time and ten mapping pages per lesson; incomplete resolution fails closed rather than sharing a partial group. An indexed owner/module lookup would avoid this client fan-out.

Collection sharing remains disabled. Collections are not folders. The current backend has owner-only `learnCollections.getDraft`, but no selected collection-content connection API or collection selection mutation.

## Minimal collection contract

- Add a collection-read scope and owner-only selection mutation accepting bounded concrete collection IDs (and explicit snapshot/version semantics).
- Expose a scoped selected-collection read that returns ordered version references/metadata. Enforce owner, active token, current scope and explicit selection together; never inherit the v1 all-access grant.
- Require independent lesson/source permissions when dereferencing members. A collection must not grant source bytes, private respondent data or ownership of another creator's lesson. Define revocation/unlink behavior without deleting content.

Until that contract exists, individual/module lesson selection is the supported persisted flow. No collection-completion claim follows from the picker.

## 92/93: already-applied comparison versus pending proposals

`learnIntegrations.updateDraft` directly calls the revision-checked lesson draft/block write helper after validating If-Match and idempotency. It does not enqueue a proposal. The Connections UI now compares the current draft with the current published version or one of the latest 25 historical versions, clearly labeled **already applied** and read-only. It does not attribute all draft changes to the connected app or offer fake acceptance/rejection. Published content is not changed by the comparison.

Enforced review requires a bounded durable proposal contract: proposal ID, owner/connection/lesson IDs, base revision, proposed metadata/document or validated block operations, idempotency key and pending/accepted/rejected state; owner-only list/read/reject and accept mutations. Accept must recheck actor, resource permissions, base revision and document validation, then atomically write the draft and mark the proposal accepted. A conflicting revision must preserve both versions without an overwrite. Connection writes must stage proposals if review is mandatory; a UI-only dialog cannot enforce that. Keep versioning product-neutral and AI-free. 92/93 remain open until this backend and its real update flow exist.

## Validation boundary

Focused unit coverage exercises native module resolution, incomplete-result refusal, explicit lesson grant persistence and full typed-block differences. Batch results are reported by the UI owner. Browser/deployment acceptance and final concurrent source typechecks are separate checks.
