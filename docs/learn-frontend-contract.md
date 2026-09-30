# Learn frontend contract

Status 2026-10-01. The Learn screens (`app/dashboard/learn/**`, `app/learn/**`, `components/learn/**`) reach data only through the hooks in `lib/learn/data.ts`. Those hooks run on a per-device local store (`lib/learn/localStore.ts`) today, so every screen works but nothing is shared between browsers. Wiring Learn to the backend means replacing hook bodies, not screens.

`useLearnCapabilities()` tells screens what the backend supports. Screens hide or explain features whose capability is off instead of showing dead controls. Local values: `sharedPublishing`, `ai`, `verification`, `deviceSync`, `weakAreas`, `curriculumDirectory`, `quizForks` are **off**; `versionRestore`, `discussions`, `reports` are **on (device-only)**.

## Hook → backend mapping

| Hook / action (lib/learn/data.ts) | Backend (convex/…) | Notes |
|---|---|---|
| `useMyLessons`, `useLesson`, `createLesson`, `saveDraftContent`, `saveDraftMeta` | `lessons.listOwned/getDraft/create/saveDraft` | Pass `expectedRevision`; on conflict show the existing recovery list (`lessons.listRecovery`). See document gap below. |
| `publish`, `unpublish`, `restoreVersion`, `archiveLesson`, `useLessonVersions` | `lessons.publish/setLifecycle/restoreVersion/listVersions` | `publish` returns `problems`; show them in `PublishDialog`. |
| `forkLesson` | `lessons.fork` | UI shows `Provenance` from `parentLessonId/parentVersionId/originLessonId`. |
| `setSources`, uploads (`uploadLearnFile`, `resolveLearnFileUrl`) | `learnSources.create/update/remove`, `POST /learn/sources/upload`, `GET /learn/sources/content` | Image blocks need a `sourceId`; the editor currently stores `chaos-learn-file:` references. |
| `useFolders`, `useFolderItems`, folder actions | `folders.*` | `duplicateFolder` and pinning have no backend yet (pins can stay device-local). |
| `setCollection`, `useFolder`, `useCollectionLessons` | `learnCollections.*` | Collections are snapshots in the backend; the UI treats a folder as the draft. |
| `useCurriculumNodes`, curriculum browsing, `followCourse` | `curricula.list*`, `createLessonMapping` | Backend levels are institution → program → version → node(year/semester/module/subject/custom). My Courses (followed modules) needs a table. |
| `setQuizzes` / Practice | `learnCollections.attachAssessment` or `learnPractice.*` | Readers need `shareId` + title of attached quizzes without owner access. |
| `recordView`, `vote`, `useProgress`, `setProgress` | `learnCommunity.recordView/setSignals`, `startSession/completeBlocks/getProgress` | |
| `report`, discussion threads | `learnCommunity.report` | Anchored threads (lesson/block, resolve, reply) have no backend yet. |
| `usePerson`, verification | `learnCommunity.reviewIdentity/listIdentityClaims` | Needs a submit-claim mutation with evidence upload and a public profile query. |
| Flashcards | `flashcards.*` | Card review state (Leitner boxes) is local by design for now. |
| Saves, highlights, notes, tutor history | none yet | Private per person. Needed for `deviceSync`. |
| `learnAi.tutor/assist` (`lib/learn/ai.ts`) | none | AI stays off (product direction). Tutor/Assist fall back to the ChatGPT/Claude handoff. |
| `forkQuiz` | none | Must run on the server: readers never receive answer keys. |
| `fetchPublicLesson`, `listIndexableLessons` (`lib/learn/server.ts`) | `lessons.getPublished` via `ConvexHttpClient` | Enables server metadata, JSON-LD and sitemap entries. |

## Document gap (blocking the lesson wiring)

The editor saves BlockNote JSON. `LessonDocument` v1 and `lib/lessonBlockAdapter.ts` hold plain `text` and reject formatting, and name custom blocks `lessonImage`, `lessonYoutube`, … while the editor uses `image`, `youtube`, `equation`, `callout`, `source` and inline `citation`. Saving through v1 today would drop, on every save:

- bold/italic/underline/strike/code, text colours and links;
- callouts, code blocks, quotes, toggles and dividers (kept only as plain paragraphs);
- image credit, presentation (photo/diagram) and hotspot annotations;
- merged table cells.

`lib/learn/chaosDocument.ts` converts in both directions and returns a `lost` list, so nothing is dropped silently (`tests/unit/learnFrontend.test.ts`). Asks for the backend, in order:

1. Rich inline text in v2 (text runs with marks + link runs, or validated BlockNote inline JSON).
2. Block types `callout{tone}`, `code{language}`, `quote`, `divider`, `toggle` and image fields `credit`, `creditUrl`, `presentation`, `annotations` (versioned JSON string, `{ v: 1, items: [{ id, x, y, w?, h?, label, body? }] }` in 0–1 image coordinates).
3. One set of block names shared by `lessonBlockAdapter.ts` and the editor schema (`components/learn/editor/blocks.tsx`).

Until then, keep lesson content local, or accept a warning before a lossy save. Don't wire it silently.

## Other asks

- A reader-safe query for attached quizzes: title, `shareId`, question count and published state.
- Private per-person tables: saves (lesson/block), highlights (block id + quote + offset), notes (block id), followed modules, and anchored discussion threads with resolve/report.
- `/learn/<id>` is now a reserved path segment (`lib/embed.ts`, `proxy.ts`, `convex/links.ts`). Accounts that already use the username `learn` need a check before deploying.
