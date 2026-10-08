# Complete study lessons

Chaos 1.3 packages `skills/create-study-lesson/SKILL.md` and two references in the existing Claude and ChatGPT/Codex ZIP downloads. The downloads retain existing host manifests and add portable Agent Plugins 1.0 `plugin.json`/`mcp.json` discovery. Compatible MCP clients can read the same instructions with `get_study_lesson_skill`, the `create-study-lesson` prompt, or `chaos://skills/create-study-lesson/SKILL.md` and its reference resources. The server instructions and `build_study_lesson` tool advertise when to use the workflow.

## Implementation

The assistant in the connected MCP client reads sources, inspects visuals, reasons about teaching, independently solves questions and verifies supporting media. Chaos has no backend AI provider, document extractor, browser or Medics 44 adapter. This implementation deliberately uses the client's existing capabilities; it does not imply those integrations exist. A client with no source or web access must report that missing capability and pause the affected work. Source-reading and media-verification checkpoints are client attestations, not server-certified extraction or scientific verification.

`convex/studyLessons.ts` is the shared service used by native authenticated UI mutations and actor-verified MCP wrappers. `/dashboard/learn/study` reuses the existing Learn media client to upload sources, starts the same durable job, displays its current state, and provides a continuation request for the learner's connected assistant. It does not label an upload as a generated lesson.

Jobs and checkpoints persist in Convex. The stages are source reading, original question retrieval, teaching sections, checkpoints, cards, glossary, review, draft assembly, and publication. They are cooperative resumable jobs: client reasoning pauses when the client disconnects; it does not run an unattended background AI worker. Bounded calls preserve completed work and explicit progress counters. Revision checks prevent stale clients replacing work. Stable keys and canonical JSON equality make retries safe; equivalent course/module/title/source work reuses its job even with another key. The file-transfer job retains resumable chunks for 24 hours and uses a scheduled cleanup.

Finalization validates all source units and visual inspection receipts, citations for each taught source, concept coverage in sections/review/cards, original question text/options/attribution/source order, answer explanations and citations, checkpoint placement, media review, card duplicates, valid native block relationships and unchanged course structure. Assets commit atomically using existing Learn, Forms, Flashcards and Glossary helpers. Failed transactions roll back newly created assets, retain teaching checkpoints and record an actionable failure through `studyLessonJobs`. Publication preflights source and block validity before making quizzes/cards live, uses existing publication checks, and preserves completed drafts if blocked.

Existing decks are reused when matching card content (ignoring generated card IDs), or selected explicitly. Existing quiz forms can be reused when their reviewed questions/answers match; their original theme and sound are preserved. New checkpoints use the stored profile's existing Chaos theme and sound. Original question snapshots and evidence remain in owner-only job checkpoints; question provenance appears in the native quiz descriptions. Supplementary questions are labeled separately.

## Tools and schema

- `build_study_lesson`: start/resume with `{request:{key,title,sources,courseId?,courseTitle?,moduleId?,moduleTitle?,afterLessonId?,quizSource?,preferences?}}`.
- `checkpoint_study_lesson`: `{jobId,expectedRevision,key,value}`. `value.kind` is reading, question_source, section, checkpoint, flashcards, glossary or review. The generated MCP schemas define every native field; see the skill workflow for examples.
- `get_study_lesson_job`: current status, revision, progress, preferences, resolved placement, counts, problems, saved keys and final URL.
- `get_study_lesson_checkpoint`: one owner-only saved part, wrapped in `{value}`; null means no such key.
- `finalize_study_lesson`: atomic draft assembly; `{jobId,expectedRevision}`.
- `publish_study_lesson`: authorized publication with the same revision fields. It is categorized as publish_content; creation cannot bypass that permission.
- `set_study_teaching_profile`: a complete default or course-specific profile. Includes language, lookup language, style, level, theme, sound, publish, visibility and optional teamId. MCP resolves theme names from existing preset definitions; native callers pass the corresponding validated themeDesign. Course profiles override defaults; job preferences override both. Only explicitly requested standing publication preferences should be stored.
- `upload_study_source`: base64 chunks, each at most 128 KiB decoded bytes, stable key, zero-based index, totalChunks and unchanged MIME/metadata. Files are at most 25 MB/200 chunks and start private.
- `publish_study_source`: explicit publish_content-gated citation metadata publication; file bytes retain their visibility. includeImage can publish owned image bytes for authorized embedding, and is rejected for PDFs/slides/files.
- `get_study_source_content`: independently authorized 128 KiB file reads with offset/nextOffset, or reference metadata with null bytes. Metadata access alone is insufficient.
- `register_study_reference`: URL/video/reference metadata actually selected/consulted by the client. No backend fetch. Metadata is private unless public metadata is explicitly requested; existing sharing is never changed.
- `get_study_lesson_skill`: static complete instructions for clients without skill/resource support.

Each checkpoint is at most 210 KB, all parts together at most 700 KB and 200 checkpoints; native lesson/card/quiz limits also apply. This fits the existing 256 KiB MCP HTTP envelope. Split overly large educational material into logical lessons; do not silently truncate it. Source counts and question orders must remain complete within each job. Original source questions require unique global order positions across multiple sources. Search/reuse is bounded; larger libraries require explicit course/deck references rather than guessing or silently creating duplicates.

Course and module titles must identify a unique exact owned match. Placement appends after the selected existing lesson or the module's final lesson; all other course/module ordering is preserved. Finalization checks the course revision and structural snapshot. Publishing a course job refuses to publish other unpublished/changed lesson drafts; review them separately. Existing course publication semantics and Business visibility requirements remain authoritative.

## Deployment, permissions and limitations

Deploy the Convex schema/functions and the Next.js application together through the repository's normal process. No new dependencies, AI API keys, extractor configuration or CI job are required. The normal Chaos MCP OAuth/Pro setup, CHAOS_MCP_SECRET, app/Convex URL configuration and native file-upload authentication are still needed. Update/reinstall downloadable plugin packages after deployment; web-only clients can use the static instruction tool/resources without installing a ZIP. This change does not publish a plugin marketplace release or deploy production by itself.

MCP client uploads are not backend files. The explicit transfer tool supports client-readable bytes; opaque ChatGPT/Claude upload IDs, sandbox paths, ephemeral client URLs and resources inaccessible to Chaos cannot be passed as backend storage references. If the client cannot read bytes, upload through the Chaos UI and use its returned source ID. Native UI uploads reuse the existing signature checks, deduplication and private file storage.

Medics 44 and other external banks require an actually available authorized connector or a user-provided export. None is hardcoded. Reliable references/video access similarly use the MCP client's authorized tools. Missing sources/integrations are reported; they are not reconstructed from memory.

Existing lesson embeds require live owned quiz forms and publicly published flashcard decks. Draft assets are saved but do not play as public embeds. This public-asset requirement also applies to private/restricted lessons; disclose it before such publication. Source metadata must be public for published citations, and embedded images require public source content. The workflow never silently changes source sharing. The native UI has a separate explicit public-citation-details option while file bytes remain private.

Tests verify the native embedded metadata endpoints, editor round trips, quiz scoring/explanations, flashcard review persistence, relationships and publication. A production browser and authorized ChatGPT/Claude/Codex accounts are still needed to verify the live installed-host experience; backend and component tests cannot certify that deployment.

## Verification

Run the focused tests with the existing configurations:

```sh
pnpm exec vitest run --config vitest.integration.config.mts tests/integration/studyLessons.test.ts tests/integration/studySourceUploads.test.ts
pnpm exec vitest run --config vitest.unit.config.mts tests/unit/studyLessonMcp.test.ts tests/unit/lessonQuizRoundtrip.test.ts tests/unit/lessonFlashcardsRoundtrip.test.ts tests/unit/flashcardStudyNavigation.test.tsx
pnpm typecheck
pnpm mcp:inventory:check
```

The integration workflow publishes a native lesson in an existing course, retrieves native embeds, submits a correct quiz answer, checks the answer explanation, persists a flashcard review and asserts single relationships/assets across retries. Failure tests cover incomplete source/visual reading, changed originals, missing evidence, duplicate cards, revision conflicts, unauthorized access, changed course structures, private source metadata, rolled-back asset creation, invalid file signatures and altered file retries.

If finalization detects a changed course structure, read `get_course` and call `refresh_study_lesson_placement` with the returned revision, ordered lesson IDs and modules. This updates only the job snapshot and preserves every saved teaching checkpoint; it never replaces the course outline. A removed module/anchor requires choosing a new valid placement.
