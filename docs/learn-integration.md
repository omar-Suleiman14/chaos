# Learn and connected apps: the Max flow

How a connected notes app (Max is the first) and Chaos Learn work together, and
which steps exist today. Chaos and Max stay usable on their own; they meet only
through the product-neutral [integration API](integration-api-v1.md), with the
owner choosing what is shared and what each connection may do.

Status labels used below:

- **Live**: implemented and usable today.
- **UI ready**: the Chaos screen or component exists, but the backend it needs does not.
- **Proposed**: specified in [integration-api-v1.md, "Learn (proposed, pending backend)"](integration-api-v1.md#learn-proposed-pending-backend); not built.

## The flow

| # | Step | Status |
| --- | --- | --- |
| 1 | Connect Max to Chaos | Live |
| 2 | Choose what Max may reach (forms, quizzes, lessons, collections, curricula) | Live for forms and quizzes; UI ready for Learn |
| 3 | Max notes become a Chaos lesson draft | Proposed |
| 4 | Review the draft (and later updates) in Chaos | UI ready |
| 5 | Publish the lesson | Live in Chaos (owner only, never through the API) |
| 6 | Attach a quiz | Live in Chaos; quiz drafts from Max are Live |
| 7 | Study in Chaos | Live (local, per-device store until the Learn backend lands) |
| 8 | Max shows progress | Proposed |

### 1. Connect (Live)

The owner opens **Dashboard → Connections → New connection**, names it (for
example "Max"), picks permissions and creates a token. The token is shown once
and pasted into Max. The screen explains every permission as a sentence, such
as "Max can create new drafts. You review and publish them in Chaos." and
"Max cannot publish, close or share anything for you." The wording uses the
connection's name; nothing on the screen says "Max" unless the owner named the
connection that way.

### 2. Choose what to share (Live for forms and quizzes, UI ready for Learn)

The share picker has four tabs: **Forms & quizzes**, **Lessons**,
**Collections** and **Curricula**. Picking a curriculum module selects every
lesson mapped to it. Forms and quizzes are saved with the connection. Lesson,
collection and curriculum picks are marked **Not saved yet**: the backend
cannot store those grants, so nothing from Learn is shared and the picks are
dropped when the dialog closes. Each connection shows a "What … can and cannot
do" list with a Learn section flagged "Not available yet".

The same picker is the Chaos side of "link existing": to let Max link an
existing lesson or collection, the owner shares it here, and Max finds it with
`GET /items`. For forms and quizzes this works today.

### 3. Notes to a lesson draft (Proposed)

In Max the person selects a page ("GIT Notes") and chooses **Send to Chaos as a
lesson**. Max sends only that page's blocks with `POST /drafts` and
`kind: "lesson"`, plus a `source` naming the page. Nothing else in Max is sent,
and nothing is sent without that explicit action. Chaos creates a **private
draft**; it is never published automatically.

Today Max can already do this for quizzes and forms (`kind: "quiz" | "form"`),
which arrive as drafts with the same `source` handling.

### 4. Review (UI ready)

The draft opens in the Chaos lesson editor with a provenance line,
`components/connections/ExternalRefBadge.tsx`: "Created from Max page: GIT
Notes" and an **Open in Max** link when Max supplied an address (any other app
reads "Created from {app} {kind}: {title}"). The link is shown only for http(s)
addresses.

When Max later sends an update, or both sides changed the lesson,
`components/connections/ChangePreview.tsx` shows the changed details and each
added, changed or removed block, with **Keep mine**, **Take theirs** and
**Merge** actions. It follows the forms editor's conflict banner ("Load their
version" / "Keep mine"). The component is built and tested; it needs the Learn
backend to store external references and to deliver proposed updates.

The Connections screen's activity history turns rows into sentences such as
"Max created draft “Portal Hypertension”" and collapses repeats ("Max updated
draft “Portal Hypertension” (3 times)"). Lesson actions
(`lesson.draft_created`, `lesson.draft_updated`, `folder.created`) are already
phrased and will appear once the backend logs them.

### 5. Publish (Live in Chaos)

The owner publishes from the lesson editor. The API has no publish endpoint and
none is proposed: publishing, visibility and deletion stay with the owner.

### 6. Attach a quiz (Live)

The owner attaches an existing Chaos quiz to the lesson. Max can already create
a quiz draft through the API; the owner reviews it, publishes it, and attaches
it. Respondent answers never leave Chaos.

### 7. Study (Live, local)

Reading, highlights, notes and progress work in Chaos today. Until the Learn
backend lands they are kept in the browser (see `lib/learn/localStore.ts`), so
they do not follow the person across devices and cannot be read by a
connection.

### 8. Max shows progress (Proposed)

With the proposed `progress:read` scope, Max reads the owner's own progress and
best quiz scores on lessons it can reach, and shows them next to the source
page. Only the owner's own study state is returned; other readers' progress,
personal notes and highlights are never shared.

## What stays private

- Personal notes, highlights and saved blocks.
- Other people's answers, names, emails and progress.
- Anything the owner did not select for the connection.
- Max content that the person did not explicitly send.

## Backend work this flow needs

1. Store `lesson_<id>` and `folder_<id>` grants on connections, with a separate
   "all lessons" opt-in so existing `access: "all"` connections do not widen.
2. Lesson kind in `POST /drafts`, `PATCH /items/{id}`, `GET /items`, with
   plain-text blocks and `source` stored as the lesson's `externalRef`.
3. Proposed updates held for review, feeding `ChangePreview`, and
   `REVISION_CONFLICT` for lessons.
4. `GET /folders`, `GET /curriculum/modules/{id}` and `progress:read`.
5. Activity rows `lesson.draft_created`, `lesson.draft_updated`, `folder.created`.
