# Learn frontend contract

Status 2026-10-01, current working-tree source. Learn routes exist under app/dashboard/learn and app/learn. Screens use lib/learn/data.ts, which now mixes durable Convex lesson/progress bindings with device-local hooks. Replacing hook bodies remains the intended boundary, but lesson wiring is already present. Ongoing durableclient work and source implementation do not establish production or cross-browser acceptance.

`useLearnCapabilities()` enables shared publishing and version restore. AI, verification, device sync, weak areas, curriculum directory, quiz forks, discussions and reports remain off.

Draft writes use a serialized revision queue and snapshot arguments at enqueue. Revision conflicts freeze writes until explicit server reload. Browser drafts stay available for review and require an explicit save after opening; server recovery restores exact documents and metadata as new revision-checked drafts. Publication notes are optional. Reading progress owns a version-specific study session, queues writes, and stops on stale sessions. Reset is unsupported and preserves existing evidence.

## Hook → backend mapping

| Hook / action (lib/learn/data.ts) | Current source target | Boundary |
|---|---|---|
| useMyLessons / useArchivedLessons | lessons.listOwned + published-version reads | Durable, bounded dashboard loading; compact learnFrontend.listOwned also exists. |
| useLesson / useCanEditLesson | learnFrontend.editableLesson/publicLesson; lessons.getPublished | Owner/editor drafts and independent public snapshot projection. |
| create/save/publish/restore/archive/fork | lessons.* through DurableLessonClient | Revision-checked queues; publish validation; explicit reload/recovery after failures. Permanent deletion is unavailable in these actions. |
| useLessonVersions / useLessonRecovery | lessons.listVersions/listRecovery | Durable immutable history and bounded draft recovery. |
| usePublicLessons | learnCommunity.rank / learnSearch.searchPublic | Durable bounded public candidates; not a global exhaustive catalog. |
| useProgress / setProgress | learnCommunity.getProgress/startSession/completeBlocks via DurableProgressClient | Version/session/write sequences; no automatic mastery inference or progress reset. |
| Sources / uploads | learnSources.* and source upload/content routes exist | setSources currently throws an explicit unwired error; editor-local file references must not be silently persisted as durable sources. |
| Folders / collections | folders.* / learnCollections.* exist | Current folder/collection hooks remain local; createLesson rejects folder membership until durable wiring exists. |
| Curriculum / follows | curricula.* / learnPersonal.followModule/listModuleFollows exist | Course hooks remain local. Directory backend exists independently of the disabled client flag. |
| Assessment attachments / quiz forks | learnCollections.attachAssessment; learnFrontend.attachedQuizzes; quizForks.* exist | setQuizzes explicitly rejects unwired edits; reader summaries omit answer keys. |
| Views/votes/saves/notes/highlights/reports/discussions/profile | Local hooks remain | Community signals/reports, learnPersonal and publicProfile backends exist; anchored discussion service is still absent. |
| Flashcards / reviews | flashcards.* / flashcardStudy.* exist | Current set/review hooks remain local; backend scheduling is not proof of integrated study UX. |
| Tutor/Assist | No model service | AI remains off; context assembly is a selected export, not generation. |
| fetchPublicLesson / listIndexableLessons | Anonymous learnFrontend.publicLesson/listIndexableLessons | Published metadata only; explicit indexing=index, preview suppression, bounded sitemap scan. |
## Document conversion and durable writes

The additive Chaos schemaVersion=1 contract now supports rich inline marks/links, callout, code, quote, divider, toggle, image attribution and bounded hotspots. lib/lessonBlockAdapter.ts carries the typed backend/editor representation. The older conversion/loss-report helpers still exist in lib/learn/chaosDocument.ts; the durable path uses toDurableDocument/fromDurableDocument and rejects unsupported conversion before a save.

Inline citation/table-merge limitations remain actionable errors; do not accept silent loss. DurableLessonClient serializes content and metadata against one revision baseline. Non-preflight failures freeze affected writes until explicit reload/recovery; a newer server row does not silently overwrite the frozen baseline. Curriculum metadata must use the curriculum API; durableMetadata rejects nonempty editor curricula. Current client publishing accepts private/public only and rejects unlisted; backend restricted access still requires explicit named grants.

DurableProgressClient owns its session sequence and refuses to borrow a newer device's session. These implementations are ongoing work, not proof of complete device synchronization, offline migration or live multi-user acceptance.



## Ongoing contracts and evidence

Publication audit, source fingerprint/retention, typed hidden parameters, homework, selected context/excerpts and multi-entity discovery are present in backend source and test files. Refer to learn-backend-handoff.md and capability-matrix.md for boundaries. This documentation refresh inspected source and test presence; it did not rerun these workstreams or perform browser/deployment acceptance. Changes by concurrent workers require revalidation.
