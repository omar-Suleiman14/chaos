# Learn and connected apps: the Max flow

How a connected notes app (Max is the first) and Chaos Learn work together, and
which steps exist today. Chaos and Max stay usable on their own; they meet only
through the product-neutral integration API ([Learn, version 2](integration-api-v1.md#learn-version-2)),
with the owner choosing what is shared and what each connection may do.

Status labels used below (2026-10-01):

- **Live**: implemented in the backend and covered by contract tests. No live
  Max client has exercised it yet.
- **Connecting**: the backend exists; the Chaos Learn screens are being
  switched from the per-browser store to it.
- **Not built**: neither side exists.

## The flow

| # | Step | Status |
| --- | --- | --- |
| 1 | Connect Max to Chaos | Live |
| 2 | Choose what Max may reach | Live for forms, quizzes and lessons; collection and curriculum picks are not saved yet |
| 3 | Max notes become a Chaos lesson draft | Live (`POST /drafts`) |
| 4 | Review the draft and later updates in Chaos | Connecting; no approval queue for updates |
| 5 | Publish the lesson | Owner only, in Chaos (never through the API) |
| 6 | Attach a quiz | Backend live; Connecting in the lesson editor |
| 7 | Study in Chaos | Backend live; Connecting in the reader |
| 8 | Max shows progress | Live (`GET /progress/lesson_{id}`) |

### 1. Connect

The owner opens **Dashboard → Connections → New connection**, names it (for
example "Max"), picks permissions and creates a token. The token is shown once
and pasted into Max. The screen explains every permission as a sentence, such
as "Max can create lesson drafts for you to review. It cannot publish them."
and "Max cannot publish, close or share anything for you." The wording uses
the connection's name; nothing says "Max" unless the connection is named so.

### 2. Choose what to share

The share picker has tabs for **Forms & quizzes**, **Lessons**,
**Collections** and **Curricula**. Forms, quizzes and lessons are saved with
the connection (lessons as `lesson_<id>` references). An existing connection
with access to "all" forms and quizzes does not gain any lessons. Collection
and curriculum picks are marked **Not saved yet**: the backend has no grant
for them, so they share nothing. To share a module's lessons today, pick them on
the Lessons tab.

With `folders:read` a connection sees the names and layout of all folders,
but a folder's contents list only assets the connection may already reach.
The Connections screen says so in its "What … can and cannot do" list.

This picker is also the Chaos side of "link existing": to let Max link an
existing lesson, the owner shares it here and Max reads it by reference.

### 3. Notes to a lesson draft

In Max the person selects a page ("GIT Notes") and chooses to send it to
Chaos. Max sends only that page's blocks with `POST /drafts`, `kind: "lesson"`,
plus a `source` naming the page. Nothing is sent without that explicit action.
Chaos creates a **private draft** and records where it came from
(`externalOrigin`, kept even if the connection is later unlinked). The draft is
never published automatically.

### 4. Review

The draft opens in the Chaos lesson editor. The provenance line reads
"Created from Max page: GIT Notes" with **Open in Max** when Max supplied an
https address; other apps read "Created from {app} {kind}: {title}". The Learn
editor renders this from the lesson's external reference
(`components/learn/ui.tsx`, `ExternalRefLine`).

When Max sends an update (`PATCH /lessons/{ref}` or `/blocks`), it must name
the revision it last read. If the owner changed the lesson since, the update is
refused with `409` and nothing is overwritten. Accepted updates go straight to
the draft, which the owner can inspect, restore from history or discard before
publishing. There is no queue that holds updates for approval yet;
`components/connections/ChangePreview.tsx` (block-level "Keep mine / Take
theirs / Merge") is built and tested for when one exists.

The Connections screen's activity list turns events into sentences such as
"Max created draft “Portal Hypertension”" and collapses repeats ("Max updated
draft “Portal Hypertension” (3 times)").

### 5. Publish

The owner publishes from the lesson editor. The API has no publish endpoint:
publishing, visibility and deletion stay with the owner.

### 6. Attach a quiz

The owner attaches one or more published Chaos quizzes to the lesson (Quick
review, Past exam style, …). Max can create a quiz draft through v1; the owner
reviews, publishes and attaches it. Respondent answers never leave Chaos.

### 7. Study

Reading progress, highlights, notes and saved blocks belong to the reader.
Progress is stored per lesson version; highlights and notes are private and
are never returned to a connection.

### 8. Max shows progress

With `progress:read`, Max reads the owner's own progress on selected lessons
and can show it next to the source page. Only the owner's own study state is
returned; other readers' progress, notes and highlights are never shared.

## What stays private

- Personal notes, highlights and saved blocks.
- Other people's answers, names, emails and progress.
- Anything the owner did not select for the connection.
- Max content the person did not explicitly send.

## Still missing

1. Grants for collections and curriculum modules (picks are shown as not saved).
2. An approval queue for connected-app updates, feeding `ChangePreview`.
3. Listing a connection's reachable lessons (today Max reads by reference).
4. A live Max client run of steps 1–8.
