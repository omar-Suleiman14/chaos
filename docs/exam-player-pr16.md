# PR 16/32 — Responsive Student Exam Player & Question Navigation

## Boundary
UI-only student preview. **Not an exam attempt.** Real exam questions, answer keys, clinical R2 media and submission endpoints must not be loaded. The preview uses only four clearly labeled, synthetic fixture questions and a static SVG drawn for this interface. Local practice selections, bookmarks and review flags are intentionally ephemeral and never stored or transmitted.

## Delivered
- Eligible, consented students can reach a sample player from their preflight. The preview route repeats `api.examPreflight.get` authorization, so suspended students, invalid course memberships, revoked audience assignments and stale policy versions do not obtain a preview through a direct link.
- Fluid, responsive question pane and navigator for phones, tablets and desktops; Arabic RTL and English LTR labels; semantic status grid, review flags/bookmarks, answered count and progress indicator.
- Single-choice, multiple-choice, true/false and written controls; plain-text clinical case rendering; illustrative accessible image with Radix Dialog zoom; native keyboard-focusable controls and accessible navigation labels.
- Permanently disabled real-exam submit button. No start, save, attempt or submit mutation; no change to production exam and quiz flows.
- Unit/component regression tests for navigation, state precedence, Arabic, disabled submission, image zoom and written-answer whitespace behavior.

## Hard release blockers
Genuine mobile/tablet/desktop EN/AR screenshots and accessibility audit; verified doctor-role authorization; protected student-only snapshot question delivery excluding keys; private R2 exam-media access, retention and revocation audits; authoritative attempt timers; quotas, durable answer writes and idempotent submission; full course/MCP access regression audit. PR #392's screenshot failure must be resolved independently.

## Next PR 17/32
Durable autosave, unsaved-answer warnings, versioned/conflict-safe writes and reconnection behavior built on a server-authorized attempt. Never introduce client-only persistence as proof of a saved exam answer or enable live entry before the runtime gates are complete.
