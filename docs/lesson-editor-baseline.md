# Lesson editor redesign baseline

First foundation PR for [#341](https://github.com/omar-Suleiman14/chaos/issues/341).
Audited against `2cb02b5` on 2026-10-12. This records the existing editor and
adds a reproducible work baseline before changing its appearance or interactions.
It does not complete the epic or certify Notion parity.

## Evidence and reference status

The code audit covers `LessonEditor.tsx`, `blocks.tsx`, `learn.css`,
`PageHeader.tsx`, `EditorDialogs.tsx`, the lesson dashboard page,
`lessonBlockAdapter.ts`, and `learn/chaosDocument.ts`. There were no open PRs
when the baseline started. Recheck that list before subsequent implementation.

[Notion's editing guide](https://www.notion.com/help/writing-and-editing-basics)
documents insertion from the gutter, handle actions and dragging, slash commands,
and selection formatting. These are interaction references, not pixel measurements.
[BlockNote's side menu](https://www.blocknotejs.org/docs/react/components/side-menu)
and [suggestion menu](https://www.blocknotejs.org/docs/react/components/suggestion-menus)
guides describe supported customization points. Verify details against the pinned
0.55.0 source before implementing them; live documentation can describe newer versions.

**Live visual comparison remains pending.** Browser reference capture timed out
twice. No live Notion editor, mobile keyboard, drag recording, or matching Chaos
screenshots were measured in this PR. Do not treat the values below as Notion
dimensions or claim visual parity from the deterministic tests.

## Audit matrix

Every row needs a matched Chaos/Notion capture before the corresponding visual
change is accepted. Use synthetic content and retain only the necessary editor
area; exclude account details and unrelated workspace content.

| State          | Existing Chaos implementation / risk                                                                                                                  | Next verification                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Empty lesson   | BlockNote supplies initial content; clicking blank canvas uses `focusLessonEnd`, which can append a paragraph after media.                            | Placeholder, title/body alignment, click-to-write, no unintended extra block.                                        |
| Long lesson    | Every change reads `editor.document`; YouTube normalization walks the document; the page clones content and retains recovery data.                    | Measure the complete page at 50/200/500 blocks, including save and reopen. Use 1,000 only as an unsaved stress case. |
| Block hover    | Real `SideMenuController` owns visibility and positioning; Chaos uses `SideMenu` with a custom action menu.                                           | Gutter-to-handle pointer travel, multiline text, heading first line, media and nested blocks.                        |
| One-block drag | Dragging belongs to BlockNote; no Chaos-specific preview or drop animation is configured.                                                             | Preview, source opacity, indicator, cancellation, exact destination, undo/redo.                                      |
| Nested drag    | Native editor tree has `children`; durable storage uses flat `parentId` relationships.                                                                | Move parent and children together; compare IDs and nesting after save/reopen.                                        |
| Slash menu     | Default schema-aware items plus educational commands; audio/file filtered out; `filterSuggestionItems` does search.                                   | Gutter insertion, Arabic aliases, empty result, arrows/Enter/Escape, preserve all supported commands.                |
| Text selection | `FormattingToolbarController` plus image details and assistant handoff.                                                                               | Preserve selection while clicking; viewport edges, active styles, links, colors and keyboard shortcuts.              |
| Block menu     | Delete, recursive duplicate with fresh IDs, move up/down, colors, table headers.                                                                      | Keyboard access, menu dismissal, boundaries, undo, educational references after duplicate.                           |
| Image/video    | Image schema extends native file props; YouTube has a dedicated block; pasted YouTube file-video blocks are replaced asynchronously.                  | Upload failure and lock, caption/alt/credit, annotations, resize, pasted URL, persistence after rearrangement.       |
| Mobile         | Toolbar scrolls horizontally below 640px; cover actions become visible without hover. No dedicated touch editor toolbar is configured here.           | 390px and 320px, real keyboard resize, reachable block actions, touch selection, overflow.                           |
| Dark mode      | Editor watches the root `dark` class; popups use shared workspace glass and reduced-transparency fallbacks.                                           | Contrast in popups and drag previews, transparent editor surface, focus indication.                                  |
| RTL            | Document direction comes from `language`; BlockNote dictionary comes from interface locale. A more specific RTL padding rule overrides later gutters. | Arabic UI/English document and English UI/Arabic document separately; mixed text and mirrored handles.               |

## Current geometry and token ownership

These are **source-derived CSS values**, not rendered measurements. Capture
computed style and bounding rectangles before replacing them. Keep title,
description and first body text on one logical content edge.

| Property            | Current source value                                                                            | Owner / consolidation direction                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page width          | Editor shell max 1,180px; document max 820px                                                    | `learn.css`: `.lx-edit`, `.lx-edit__doc`; retain one document-width token.                                                                                                   |
| Body text           | 16px, line-height 1.7 (27.2px nominal), workspace font                                          | `.lx-editor .bn-editor`; retain workspace font and one body-size/leading pair.                                                                                               |
| Title               | `clamp(26px, 4vw, 34px)`, weight 750, leading 1.2                                               | `.lx-title-input`; align its container with body content.                                                                                                                    |
| Description         | 16px, leading 1.5, bottom margin 18px                                                           | `.lx-desc-input`; make title/description/body spacing explicit.                                                                                                              |
| Gutter, LTR         | Last desktop rule 52px start / 16px end; last <=640px rule 38px / 8px                           | Earlier 44px/8px and 20px/0 rules also exist. Consolidate rather than append another override.                                                                               |
| Gutter, RTL         | `[dir="rtl"]` rule 44px/8px has higher specificity than the later desktop and mobile rules      | Inferred cascade defect: Arabic gutter does not follow the same responsive sizes. Verify in Chromium before changing.                                                        |
| Cover               | Height `clamp(160px, 30vh, 280px)`; top margin 12px                                             | `LessonCover`; saved default URL and position belong together.                                                                                                               |
| Cover controls      | 28px tall, 14px icons, opacity transition 150ms                                                 | `.lx-cover__actions`; desktop sizing is not a touch target specification.                                                                                                    |
| Popup surface       | 10px radius, 1px border, shadow `0 12px 32px -8px rgba(0,0,0,.3)`                               | Shared `.bn-*` rules also affect portals. Check other editor consumers before scoping or changing.                                                                           |
| Popup transparency  | Workspace opacity defaults to .85; blur depends on opacity; solid reduced-transparency fallback | Preserve contrast/fallback while evaluating a quieter document surface.                                                                                                      |
| Menu icons          | Educational slash icons 18px; custom block action icons 14px                                    | `LessonEditor.tsx`; decide one icon scale per menu kind after capture.                                                                                                       |
| Side menu alignment | Pinned controller applies per-block vertical offsets; heading levels use 39/27/18.5px offsets   | `node_modules/@blocknote/react/src/components/SideMenu/SideMenuController.tsx`; retain supported controller positioning, do not hard-code all block types to one top offset. |

For new controls, use logical inset/padding and visible keyboard focus. Start
drop settling at 150ms (within the epic's proposed range), using transform and
opacity with a reduced-motion alternative. This is a **proposed Chaos target**,
not a measured Notion animation. Actual menu width, row height, gutter handle
size, spacing and touch placement stay undecided until live captures are available.

## Reproducible editor work baseline

Run from the repository root:

```sh
pnpm exec vitest run --config vitest.perf.config.mts perf/client/lessonEditor.perf.test.tsx
pnpm perf:check -- --suites lessonEditor
```

The existing performance reporter writes `perf/results/lessonEditor.json`.
`perf/baselines/lessonEditor.json` contains the measured count budgets; the manual
deterministic Performance workflow discovers this suite through `pnpm perf`.
Do not raise or remove budgets to accommodate a cosmetic regression.

The test mounts the real `LessonEditor`, BlockNote schema, menus and custom block
renderers. Only Convex is replaced with the existing reactive test service.
The fixture repeats headings, paragraphs, lists, callouts, equations, images,
YouTube, sources, diagrams, tables, quizzes, flashcards, styled/link/citation text,
nested toggles, dividers, quotes and code. Counts include children.

Each size runs in English and Arabic. It checks the initial content survives
BlockNote normalization, inserts one character through the editor API, compares
every untouched block exactly, verifies the change notification's document,
and checks that subscriptions return to zero on unmount. The recorded metrics
cover mount commits/elements/subscriptions and edit commits, DOM changes,
notifications, URL resolutions and mutations.

Limitations: this is a component-level **inline transaction**, not a native
keystroke-to-paint measurement. It does not mount the dashboard's autosave,
recovery, publication or conflict UI. Synthetic asset references are preserved
but are not fetched from a deployment; images/iframes do not load in jsdom.
IntersectionObserver is controlled to keep diagram previews offscreen, avoiding
asynchronous Mermaid work in these counts. Theme is light. Browser drag timing,
mobile geometry, real asset rendering, startup time, p95 input latency and frame
rate are still pending. A 1,000-block component fixture does not increase the
500-block persisted document limit.

Before performance claims, run the existing browser render, idle, memory and
journey suites on a dedicated E2E deployment (see `perf/README.md`). Add native
typing and drag samples at each supported size, record viewport/device/browser,
warm/cold startup, at least 30 edit samples, p50/p95, frame intervals and request
counts. Keep the epic's <50ms p95 and 60FPS goals as targets until observed.

## Persistence and regression boundaries

The page calls `saveDraftContent`; `DurableLearnClient.saveContent` converts with
`toDurableDocument`, preserves revision sequencing, and saves through Convex.
The separate `toChaosDocument` converter returns `lost` for formatting and other
features it cannot represent. Do not substitute it into the durable save path.
`LessonContent`'s frontend block-array type is not proof that the backend stores
every possible BlockNote block unchanged.

The durable adapter must preserve IDs, parent relationships, concepts, citations,
presentation and educational asset references, or reject unsupported state before
writing. Preserve the page's 600ms delayed saves, serialized flushes, account/lesson
recovery key, conflict stop, media lock, upload guard and publication boundary.
Hover and drag previews must never call document-change callbacks solely to animate.

Existing coverage to retain: `learnDurableConversion`, `lessonBlockAdapter`,
`lessonBlockMappings`, quiz/flashcard roundtrips, `learnDurableClient`,
`largeLessons`, `learnLessons`, publication boundaries, and MCP regression tests.
The new baseline checks local editor preservation; it does not replace those tests.

For each later interaction PR, record Enter/Backspace, Tab/Shift+Tab, arrows,
selection/copy/cut/paste (plain text, Markdown and HTML), undo/redo, cancellation,
dialog focus return and keyboard-only reordering. For moves and duplicates,
compare IDs, nesting, image metadata, citations and asset references before and
after save/reopen, including an MCP-created lesson. Add browser tests for the
specific changed interaction rather than testing only a mocked drag callback.

## Next reviewable changes

1. Complete matched live references at 1440x900 and 390x844, plus 320px overflow
   checks, light/dark, RTL and reduced motion. Record hover, slash, selection and
   drag states with viewport and zoom; measure CSS pixels, not scaled image pixels.
2. Page layout/typography: consolidate competing padding rules first; verify
   title/body alignment and responsive RTL gutters with the shipped CSS.
3. Handle/menu and drag PRs: customize the pinned controllers and extension APIs;
   require browser move/cancel/undo tests with nested and selected blocks before
   claiming drag parity.

Later visual PRs must include before/after evidence and explicit pending checks.
No merge or deployment is part of this baseline.
