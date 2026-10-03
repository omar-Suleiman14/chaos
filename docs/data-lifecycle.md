# Data lifecycle

## Question deletion

Deleting a question is a soft delete. Chaos sets `questions.deletedAt` so the question disappears from the editor, live player payload, quiz counts, and forward-looking analytics while historical session answers can still resolve the original question text and grading data.

The question row is permanently removed only when its entire quiz is deleted.

## Quiz deletion

Deletion is permanent. The confirmation names the form or quiz and states how many recorded responses will be destroyed (for old quizzes it is counted on the server by `getQuizDeletionImpact`). Native Learn folders exist. Folder deletion has separate nonempty-folder checks and does not cascade into assets (see below).

Deleting a quiz:

- permanently deletes all of its questions, including soft-deleted questions;
- permanently deletes all quiz sessions and therefore the results and analytics derived from them;
- clears that quiz's `quizId` from related legacy AI jobs while retaining the jobs for historical compatibility (generation services are retired; ordinary quizzes and historical records remain);
- permanently deletes the quiz document;
- immediately retires `/{username}/{slug}`. There is no tombstone, and the slug can later be reused by the creator.

Creator deletion and administrator deletion use the same cascade implementation so both paths have identical data behavior.

## Account-level changes

Banning or elevating an account does not delete content. Changing a username updates the creator's cached quiz username through the existing username flow, so public links follow the current username. No account-wide destructive migration runs automatically.

## Native Learn lifecycle (2026-10-01 source snapshot)

Lesson archive/unpublish/reactivate change lifecycle or visibility while retaining immutable versions, lineage and study records. Restoring a version writes an editable draft and does not silently republish it. Current durable client actions reject permanent lesson deletion. Collection and flashcard publication similarly keeps version snapshots; flashcard lifecycle and fork actions retain history. These source behaviors are not a general account-wide erasure or recovery guarantee.

Publication metadata audit entries are written in the state-change transaction and read through learnPublicationAudit.list/listAsset by owners/admins. Audit entries contain identifiers, revisions, transitions and reasons; they are not stored copies of all lesson/source bytes or proof of tamper-proof compliance.

### Folders and membership

folders.remove requires an owned folder with no child folder and no member; otherwise it throws FOLDER_NOT_EMPTY. folders.removeMember deletes the membership row, not the referenced lesson, quiz, source or other asset. Moving/removing folders must not be described as asset deletion.

### Sources, moderation and file retention

learnSources.remove marks the source removed; it does not immediately erase file bytes or published citation provenance. Metadata grants and content grants remain independent; citation presence never grants download. Source takedown/restore/report/appeal records have a separate moderation path.

learnSourceRetention.requestPurge is explicit owner consent for an already removed source. It schedules a 30-day grace period; any source moderation audit creates a preservation hold. Cleanup checks ownership/status/storage linkage and scans immutable lesson and collection versions in bounded steps before deleting unreferenced bytes. The source row remains, with storageId cleared after successful purge. Restricted creators and referenced/ambiguous/moderated files can be held; this is not a promised universal deletion deadline. Tracked unlinked uploads have a one-day grace period; the worker does not sweep all storage. The hourly cron is source-registered, not evidence of production execution.

Source fingerprints support bounded owner-scoped near-byte-duplicate checks. They are a similarity heuristic, not a cryptographic identity guarantee or justification to remove another person's source.

### Private study and respondent data

learnPersonal stores revision-checked private saves/highlights/notes and followed modules independently of lesson publication. Progress and flashcard reviews are version/session or card-keyed study records, not inferred mastery. Homework pins a form version and maintains enrollment/attempt/progress records; its evolving submission/upload paths need final acceptance validation. Archiving a lesson is not evidence that these records are deleted.

Declared typed hidden URL parameters are validated as string/number/boolean and stored separately from answers as typedHidden; legacy hidden strings remain a separate compatible representation. Link metadata is respondent data, not trusted identity. Do not mirror it or raw attempts/responses into another product without explicit authorization.

Context assembly is a selected export, not an automatic external transfer: bounded blocks, source metadata, optional independently authorized stored excerpts/curriculum and the caller's progress. Private notes/raw source files are excluded, and owner-supplied excerpts are marked unverified. Revocation and deletion semantics must be checked independently by each consumer.

## Coverage and operational limits

[Quiz lifecycle tests](../tests/integration/quizLifecycle.test.ts), [legacy compatibility tests](../tests/integration/legacyData.test.ts), [source retention tests](../tests/integration/learnSourceRetention.test.ts) and [Learn lifecycle tests](../tests/integration/learnLifecycle.test.ts) exercise preservation and deletion boundaries. Local regressions do not prove deployed cleanup execution, full account erasure or compliance. Account-data and closure requests are handled manually through Support after identity and scope checks; no account-wide destructive migration runs automatically.
