# Block editor checklist: status and evidence

Status of every "To do" task in the Notion **Block — Task Tracker** (sections 2–15, 205 tasks)
against the Chaos lesson editor, as of this change. Packaging (sections 1 and 16) is marked
"Coming next / not ready" in the tracker and Max is deferred; neither is covered here.

| Status       | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Done**     | Implemented in this change, with the test named.                                              |
| **Existing** | Already implemented before this change; verified in code and, where named, by tests.          |
| **Partial**  | Some of it exists; the remainder is stated.                                                   |
| **Device**   | Code is in place, but acceptance needs real devices, browsers or assistive tech not available in CI. |
| **Deferred** | Not done, with the reason (usually: needs a schema change or the packaging phase).            |

New in this change:

- `lib/learn/editorPolicy.ts`: link, upload and clipboard rules matching the server's validation.
- `lib/learn/saveState.ts`: one save-state model (saved, unsaved, saving, retrying, offline, failed, conflict), transient-error detection, retry backoff.
- `lib/learn/portable.ts`: versioned portable lesson file with migrations.
- `components/learn/editor/transfer.ts`: Markdown/HTML/text/JSON export (and print to PDF) and import, each reporting what it lost.
- `components/learn/editor/extensions.ts`: extension API (slash commands, toolbar actions, shortcuts, export converters) with version checks and failure isolation.
- `components/learn/editor/EditorErrorBoundary.tsx`: editor-level and per-block error boundaries.
- Lesson page: offline handling, automatic retries, unload guard, duplicate-write skip, localized save and upload states, Import/Export menu.
- `scripts/license-audit.ts` (`pnpm licenses:check`), and a CI job running the Chromium editor suite (`pnpm test:editor`).

Tests added: `tests/unit/lessonEditorPolicy.test.ts`, `lessonSaveState.test.ts`, `lessonPortable.test.ts`,
`lessonEditorExtensions.test.ts`, `lessonTransfer.test.tsx`, `tests/editor/safety.spec.ts`.

## 2. Visual design

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Benchmark Notion canvas references | Device | Live capture still pending (see `docs/lesson-editor-baseline.md`); needs a signed-in Notion session. |
| Perfect page width and gutters | Existing | Single document width and logical gutters; `tests/editor/interactions.spec.ts` "title, description and body share one text edge" (LTR/RTL). |
| Perfect title icon cover layout | Existing | `PageHeader.tsx` `LessonCover`; `tests/unit/lessonPageHeader.test.tsx`. |
| Refine heading hierarchy | Existing | Levels 1–3 only (matches storage); first-line handle alignment test in `interactions.spec.ts`. |
| Refine paragraph and list typography | Existing | `learn.css` `.lx-editor .bn-editor`; now also tokenized (`--lx-editor-size/-leading`). |
| Polish quotes and callouts | Existing | Callout block with tones (`blocks.tsx`), styles in `learn.css`. |
| Polish tables and dividers | Existing | Header row/column controls; plain-text cells (storage). |
| Polish code blocks | Existing | Shiki highlighting via `@blocknote/code-block`, stored languages preserved (`lessonCodeLanguages.test.tsx`). |
| Polish empty document appearance | Existing | Placeholder and click-to-write (`focusEnd.ts`, `lessonEditorFocus.test.ts`). |
| Remove unnecessary borders and glow | Existing | Transparent editor surface; popups only carry a surface. |
| Create OKLCH neutral design tokens | Done | `--lx-neutral-*` OKLCH tokens (light and dark) on `.lx-editor` in `learn.css`. |
| Support light and dark themes | Existing | `useDarkMode` in `LessonEditor.tsx`; dark-menu opacity test in `interactions.spec.ts`. |
| Standardize iconography | Existing | One family (lucide) for all editor menus; sizes per menu kind. |
| Support configurable fonts and density | Done | `density` and `font` props → `data-density`/`data-font` tokens. |
| Create visual regression baselines | Partial | `tests/visual/app.spec.ts` covers app pages; no editor-specific snapshot yet (needs committed baselines from the visual workflow). |

## 3. Drag and drop

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Align plus and drag handles | Existing | `sideMenu.tsx` first-line alignment; `interactions.spec.ts` geometry tests. |
| Support multiline and nested handles | Existing | Same, measured per rendered block. |
| Support touch and keyboard handles | Existing | `mobile.spec.ts` "tapping a block shows a large handle"; Ctrl+Shift+↑/↓ move. |
| Build drag preview | Existing | `dragFeedback.ts` preview width/theme. |
| Support multi-block drag | Existing | `dragDrop.spec.ts` "moves several selected blocks together". |
| Show insertion indicators | Existing | `dragDrop.spec.ts` "the indicator shows where". |
| Support nested drop targets | Existing | `dragDrop.spec.ts` "nests a block as the first child". |
| Support edge autoscroll | Existing | `autoScrollVelocity`; `lessonDragAutoScroll.test.ts`. |
| Prevent accidental selection | Existing | `[data-dragging]` disables selection. |
| Handle invalid drop cancellation | Existing | `dragDrop.spec.ts` "Escape cancels a drag", "cannot drop a block into its own children". |
| Preserve block IDs and content | Existing | `dragDrop.spec.ts` "keeps its id", `lessonEditorPersistence.test.tsx`. |
| Make drag operations undoable | Existing | `dragDrop.spec.ts` "is one undo step". |
| Prevent layout shifts | Existing | Transform/opacity-only settle; "drops without the settle animation" test. |
| Support RTL handle placement | Existing | Start-side placement; geometry test (rtl). |
| Test custom blocks during moves | Existing | `dragDrop.spec.ts` "moves an image and an educational block without losing their references". |

## 4. Slash and commands

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Open slash menu from keyboard | Existing | `/` trigger; `interactions.spec.ts`. |
| Open insert menu from plus handle | Existing | `interactions.spec.ts` "+ opens the menu on a new line below". |
| Position menu near caret | Existing | Same test checks placement. |
| Categorize commands | Existing | Groups in `slashMenu.tsx`; `lessonSlashMenu.test.tsx` "keeps each group together". |
| Implement fuzzy search and aliases | Existing | `searchSlashItems` ranking; tests in `lessonSlashMenu.test.tsx`. |
| Support Arabic command search | Existing | `normalizeSearch` (diacritics, alef/yaa/taa marbuta); test. |
| Support arrow Enter Escape navigation | Existing | BlockNote suggestion menu; `interactions.spec.ts`. |
| Handle empty results | Existing | "returns nothing for a query nothing matches (the menu shows its empty state)". |
| Preserve focus and selection | Existing | Insert tests keep caret in the new block. |
| Prevent duplicate insertion | Existing | "choosing inserts exactly one block there". |
| Expose command registration API | Done | `LessonEditorExtension.slashCommands`; `lessonEditorExtensions.test.ts`. |
| Allow host command filtering | Done | `commandFilter` prop and `permissions`; `lessonTransfer.test.tsx` "hides commands the host does not allow". |

## 5. Rich text and keyboard

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Support bold italic underline strike | Existing | Formatting toolbar; "applies bold" test; storage keeps all four marks. |
| Support links and inline code | Done | Links now limited to storable web/email links (`isLessonLinkAllowed`); bare addresses get https; `safety.spec.ts`. |
| Support highlights and colors | Existing | Text/background colours stored (`safeColor` server check). |
| Support block conversion | Existing | "Turn into" menu (`sideMenu.tsx`). |
| Support nesting and indentation | Existing | Tab/Shift+Tab; nested storage via `parentId`. |
| Support split and merge | Existing | BlockNote Enter/Backspace; keyboard tests. |
| Support multi-block selection | Existing | Multi-block actions and drag. |
| Support copy cut paste | Existing | Block "Copy" action writes HTML + text; paste tests. |
| Support undo and redo | Existing | All actions are single transactions; import is one undo step (test). |
| Support keyboard shortcuts | Existing | Ctrl+D duplicate, Ctrl+Shift+↑/↓ move, formatting keys; extensions can add more (Done). |
| Support keyboard block reorder | Existing | Ctrl+Shift+↑/↓. |
| Preserve caret during edits | Existing | Actions refocus the document (`refocus`). |
| Support Markdown paste | Existing | `interactions.spec.ts` "pastes Markdown text as blocks". |
| Sanitize HTML and Word paste | Done | `sanitizeClipboardHtml` + `pasteHandler`; `lessonEditorPolicy.test.ts`, `safety.spec.ts`. |
| Support IME and Unicode | Existing | Title Enter respects `isComposing`; Arabic/Unicode round trips in tests. Real IME needs a Device check. |

## 6. Core blocks and media

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Perfect headings lists checklists | Existing | Stored types and round trips (`lessonBlockAdapter.test.ts`). |
| Perfect toggles and nested content | Existing | Toggle with children round trip (`lessonEditorPersistence.test.tsx`). |
| Perfect callouts and quotes | Existing | Callout tones, quote block. |
| Support tables and row/column controls | Existing | BlockNote tables with header rows/columns. |
| Support code syntax highlighting | Existing | Shiki, lazy-loaded. |
| Support image upload paste and drop | Done | Upload now checks type (PNG/JPEG/WebP), size (25 MB) and emptiness before any request, with file-named messages; test in `lessonTransfer.test.tsx`. |
| Support image resizing and captions | Existing | `ResizableFileBlockWrapper`, caption prop. |
| Support image alt text and metadata | Existing | Alt, credit, figure kind; server requires alt. |
| Support video and YouTube embeds | Partial | YouTube with time range exists; uploaded video files are not storable (schema). |
| Support safe generic embeds | Deferred | Needs a new stored block type and an embed allowlist on the server. |
| Support math equations | Existing | KaTeX equation block with `trust: false`. |
| Support Mermaid diagrams | Existing | `securityLevel: "strict"`, lazy-loaded. |
| Support bookmarks and citations | Partial | Citations exist; no bookmark block (needs schema). |
| Support table of contents | Partial | Reader outline exists (`outline()` in `doc.ts`); no in-editor TOC block. |
| Support custom block rendering | Existing | Custom React blocks; now each is isolated by an error boundary (Done). |
| Keep quizzes and flashcards optional | Done | `permissions.educational = false` hides quizzes, flashcards, sources and citations. |

## 7. Menus and actions

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Perfect floating formatting toolbar | Existing | `FormattingToolbarController` with Chaos buttons. |
| Show active formatting state | Existing | BlockNote toolbar state. |
| Preserve selection on toolbar click | Existing | `interactions.spec.ts` "keeps the selection and applies bold". |
| Support duplicate copy delete move | Existing | Block menu actions; persistence tests. |
| Support block color and type menus | Existing | Colours and "Turn into". |
| Support nested accessible menus | Existing | Radix submenus (Turn into). |
| Restore focus after dismissal | Existing | `refocus()` after actions; dialog focus return in `learnAccessibility.test.tsx`. |
| Support contextual actions per permissions | Done | `permissions` prop; uploads refused when off (test). |
| Support plugin toolbar actions | Done | `toolbarActions` rendered in the formatting toolbar, isolated. |
| Support touch-friendly menus | Existing | `mobile.spec.ts` menus fit 320px. |

## 8. Premium UX principles

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Trust and legal subcopy | Existing | Handoff dialog shows exactly what is shared (`learnAccessibility.test.tsx`); upload label names private sources. |
| Escape from empty states | Existing | Empty-state tests in `learnAccessibility.test.tsx`. |
| Contextual helper text | Existing | Slash subtexts; editor tip line. |
| Success confirmation | Done | Save state "Saved" only after the server write; upload announces "Image uploaded"; import/export toasts. |
| Specific errors | Done | Upload, import, export and paste messages name the file/cause and the fix; editor crash notice. |
| Explain waiting | Done | Separate saving, retrying, offline and uploading states, localized. |
| Remember known values | Existing | Browser recovery copy of unsaved drafts (`retain`). |
| Cohesive icons | Existing | lucide throughout, labelled buttons. |
| Literal CTAs | Done | New actions say what they do ("Export as Markdown", "Reopen editor", "Import from file…"). |
| Ask permissions just in time | Existing | Clipboard/file access only on user action; no upfront prompts. |
| Reset filters | Existing | Escape closes the / menu and leaves the typed text. |
| Never truncate critical states | Done | Save state wraps instead of ellipsizing (`.lx-save`). |

## 9. Mobile, RTL and accessibility

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Build touch-first editor toolbar | Existing | Mobile toolbar with "+" (`MobileInsertButton`). |
| Support insertion without hover | Existing | Same. |
| Support touch block rearrangement | Existing | Tap handle → move actions (`mobile.spec.ts`). |
| Handle iOS virtual keyboard | Device | BlockNote mobile toolbar mode; needs a real iPhone. |
| Handle Android virtual keyboard | Device | Needs a real Android device (Pixel emulation passes layout tests only). |
| Respect safe areas | Device | Needs notched hardware. |
| Keep focused content visible | Existing | `scroll-margin-top` on blocks. |
| Prevent popover clipping | Existing | Menus fit 320px (`mobile.spec.ts`). |
| Use bottom sheets for complex mobile settings | Done | Lesson settings open as a bottom sheet under 640px, above the safe area (`EditorLayout.module.css`). |
| Preserve unsaved work on dismiss | Done | Unload guard while anything is unsaved; flush on unmount; browser recovery copy. |
| Support keyboard-only operation | Existing | Keyboard reorder, menus, dialogs. |
| Add screen reader roles and announcements | Existing | `announce.ts` live region; save state is a polite live `output`. |
| Respect reduced motion | Existing | `prefers-reduced-motion` rules in `learn.css` cover drag settle and menus. |
| Support 200 percent zoom and contrast | Device | Needs a manual zoom/contrast pass. |
| Support Arabic RTL and mixed LTR | Existing | Direction from lesson language; `learnAccessibility.test.tsx` mixed-direction tests. |
| Test tablet and small phones | Existing | `mobile.spec.ts` 320/390px; tablet is a Device check. |

## 10. Persistence and recovery

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Implement storage-agnostic load/save | Partial | Editor takes content and emits changes; storage is the host's (`DurableLearnClient`). Formal adapter contracts are packaging-phase. |
| Implement debounced autosave | Existing | 600 ms debounce with serialized flushes. |
| Expose saving saved failed and unsaved states | Done | `deriveSaveState` and `data-state` on the save label; `lessonSaveState.test.ts`. |
| Support local draft recovery | Existing | Retained draft panel. |
| Recover after crash or reload | Done | Retained draft (existing) plus editor error boundary that remounts from the last content. |
| Detect stale revisions | Existing | `REVISION_CONFLICT` handling. |
| Handle save conflicts | Existing | Writes stop; reload and recovery choices. |
| Retry transient failures | Done | `isTransientSaveError`, backoff 1–8 s, up to 4 retries. |
| Avoid duplicate writes | Done | Identical content is not written again after a successful save. |
| Preserve nested blocks and IDs | Existing | `lessonEditorPersistence.test.tsx`. |
| Preserve media references | Existing | Same, image/source/quiz/flashcard references. |
| Provide version history adapter | Existing | `VersionHistory.tsx` via host actions. |
| Provide restore-version adapter | Existing | `restoreVersion`, server recovery revisions. |
| Support read-only mode | Existing | `editable={false}`; blocks render reader views. |
| Handle offline and reconnecting | Done | Offline state, no attempts while offline, save on reconnect. |
| Prevent silent content loss | Done | Unstorable links become text with a notice; paste/import report what was left out; durable conversion still rejects instead of dropping. |

## 11. Import, export and interoperability

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Define portable JSON format | Done | `chaos.lesson` v1 (`portable.ts`). |
| Version schemas and migrations | Done | Migration chain from v0; newer files refused (`lessonPortable.test.ts`). |
| Import Markdown | Done | `parseImport` (test). |
| Export Markdown | Done | `exportLesson` (test). |
| Import sanitized HTML | Done | Same sanitizer as paste (test). |
| Export HTML | Done | Standalone, script-free page with lang/dir (test). |
| Import and export plain text | Done | Tests. |
| Provide optional PDF export | Done | "Print or save as PDF" opens the HTML export and the print dialog. |
| Support compatible Notion imports | Existing | `convex/notion.ts`, `lib/notionBlocks.ts`, `notionBlocks.test.ts`. |
| Report lossy conversion | Done | Every export/import lists what it left out. |
| Preserve citations and media | Partial | Lossless in JSON export; Markdown/HTML keep citations as text and images as alt text (reported). |
| Expose custom serializer hooks | Done | Extension `converters` (test). |
| Test block round trips | Existing | `lessonBlockAdapter.test.ts`, quiz/flashcard round trips; portable round trip (Done). |
| Test Chaos MCP-generated documents | Existing | `mcpLessonBlockInput.test.ts`, `lessonEditorPersistence.test.tsx` (MCP-shaped lesson). |

## 12. Extensibility and themes

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Expose theme tokens | Done | `--lx-editor-*` tokens. |
| Support system light dark themes | Existing | Follows the workspace `dark` class (system preference via ThemeProvider). |
| Allow font and density overrides | Done | Props and tokens. |
| Allow custom icons | Done | Extension commands and actions carry their own icons. |
| Register custom blocks | Deferred | Storage accepts only the fixed lesson schema; a registered block could not be saved. Packaging phase. |
| Register slash commands | Done | `slashCommands`. |
| Register toolbar actions | Done | `toolbarActions`. |
| Register keyboard shortcuts | Done | `shortcuts`, with editor-reserved keys protected. |
| Register converters | Done | `converters`. |
| Register storage adapters | Deferred | Packaging phase ("Define storage adapter contracts"); today the host passes save callbacks. |
| Register upload providers | Partial | `uploadFile`/`resolveFileUrl` props are the provider seam; no registry. |
| Support educational extensions | Existing | Quiz, flashcards, sources, citations, equations, diagrams. |
| Support host-specific menus | Done | `commandFilter`, `permissions`, extension actions. |
| Validate extension compatibility | Done | `apiVersion` and conflict checks; invalid extensions are not loaded. |

## 13. Performance

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Benchmark 50 200 500 1000 blocks | Existing | `perf/client/lessonEditor.perf.test.tsx`. |
| Measure typing latency | Partial | Inline transaction counts exist; native keystroke-to-paint needs the browser perf run. |
| Measure drag frame rate | Device | Needs the browser perf workflow on dedicated hardware. |
| Measure editor startup | Partial | Mount commit counts; wall-clock startup is in the manual perf workflow. |
| Measure bundle size | Partial | `pnpm perf:bundles` exists but is not gated (webpack build lacks stats). |
| Reduce unnecessary rerenders | Existing | Render-count budgets in `perf/baselines/lessonEditor.json`. |
| Avoid writes on hover | Existing | `dragDrop.spec.ts` "pointer movement and hover never emit document changes". |
| Lazy-load heavy blocks | Existing | Editor is `next/dynamic` with `ssr: false`. |
| Lazy-load syntax and diagrams | Existing | Mermaid `import()`; Shiki languages load on demand. |
| Optimize image loading | Existing | `ContentImage` with resolved URLs. |
| Minimize network requests | Done | Duplicate content writes skipped; no requests while offline. |
| Release memory on unmount | Existing | Perf test checks subscriptions return to zero. |
| Stress-test long scrolling | Partial | 1,000-block component fixture; scroll FPS needs browser perf. |
| Test low-powered mobile | Device | Needs throttled real hardware. |
| Enforce performance budgets | Existing | `pnpm perf:check` in CI. Note: the CSS budget already fails on `main` before this change. |

## 14. Security and reliability

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Sanitize clipboard HTML | Done | `sanitizeClipboardHtml`. |
| Validate embed URLs | Existing | YouTube IDs parsed and checked on the server; no generic embeds. |
| Reject unsafe link protocols | Done | Editor and server now agree: http, https, mailto only. |
| Validate file MIME and size | Done | Client check before upload; server still checks. |
| Prevent custom block injection | Existing | Durable conversion rejects unknown types and fields; KaTeX `trust: false`; Mermaid strict. |
| Keep secrets outside core | Existing | Editor receives callbacks only; no tokens in editor code. |
| Respect host-provided permissions | Done | `permissions` prop. |
| Require server-side host authorization | Existing | `convex/authz.ts`; `useCanEditLesson`. |
| Isolate extension failures | Done | `isolate()` around all extension calls; per-block boundaries. |
| Add error boundaries | Done | `LessonEditorBoundary`, `isolatedBlock`. |
| Protect unsaved edits on navigation | Done | `beforeunload` guard while unsaved; flush on unmount. |
| Handle offline and reconnecting | Done | See section 10. |
| Test malformed documents | Existing | Adapter validation tests; portable file validation (Done). |
| Audit dependency licenses | Done | `pnpm licenses:check`, `docs/dependency-licenses.md`. |
| Document security reporting | Existing | `SECURITY.md`, `public/.well-known/security.txt`. |

## 15. Tests and quality

| Task | Status | Evidence / remaining |
| --- | --- | --- |
| Unit-test editor commands | Existing | `lessonSlashMenu.test.tsx`, `lessonEditorPersistence.test.tsx`. |
| Test document transformations | Done | `lessonTransfer.test.tsx`, plus existing conversion tests. |
| Test schema migrations | Done | `lessonPortable.test.ts`. |
| Test standard blocks | Existing | Slash insertion test saves every command's block. |
| Test educational extensions | Existing | Quiz/flashcard editor and round-trip tests. |
| Playwright drag and drop | Existing | `tests/editor/dragDrop.spec.ts`; now run in CI (Done). |
| Test keyboard and clipboard | Done | `interactions.spec.ts` plus `safety.spec.ts`. |
| Test upload failures | Done | Type and permission refusals (`lessonTransfer.test.tsx`). |
| Test autosave conflicts | Partial | Save-state and retry logic unit-tested; page-level conflict flow is not mounted in tests. |
| Test mobile keyboard behavior | Device | Real device. |
| Test Arabic RTL | Existing | RTL geometry, Arabic search, mixed direction. |
| Test screen readers | Device | Needs VoiceOver/NVDA; axe checks exist. |
| Snapshot light and dark themes | Partial | Dark menu contrast test; no editor screenshot baseline. |
| Test Chrome Safari Firefox | Partial | Chromium in CI; Safari and Firefox need the cross-browser run. |
| Test Chaos and Max integrations | Partial | Chaos MCP lessons tested; Max is deferred. |
| Run lint typecheck build | Existing | CI static and build jobs. |
| Guard bundle and performance | Existing | Perf ratchet and guard. |
| Test historical lessons | Existing | Code-language and stored-document compatibility tests. |
| Verify no Chaos regressions | Done | Full unit suite and editor browser suite pass with this change. |
| Require release acceptance evidence | Done | This document, plus the CI editor job. |
