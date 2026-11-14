# PR 19/33 — Browser-only integrity telemetry & privacy safeguards

Draft stacked on PR #395. Nothing is merged or deployed. Live exam entry remains deliberately disabled by `examRuntime.startAttempt`.

## Privacy and capability boundary

- No camera, microphone, screen/OS recording, screenshots, keyboard capture, clipboard capture, visited URL logging, IP/device fingerprinting or third-party proctoring.
- The browser may **report**, but never conclusively prove, `hidden/visible`, `blur/focus`, `online/offline`, `fullscreen_exit/fullscreen_enter` and `pagehide`.
- The client sends only an opaque attempt ID, per-event retry ID and finite event kind. The Convex mutation assigns the **server** timestamp; client-supplied duration or timestamp fields are not accepted.
- Events cannot automatically submit, expire, grade, suspend or punish a candidate. Warning and `review_required` are **advisory**. Human adjudication, student explanations, appeals, accommodations and teacher controls belong in PR 20.
- The browser hook is disabled unless given a real attempt, `enabled=true`, and `consented=true`. It is not wired to the synthetic preview. The future real-start transaction MUST freeze the chosen policy, and exam preflight MUST clearly disclose monitoring before consent.
- The default frozen policy is **off**. Even in `review` mode, human review is needed: a background event may be an incoming iPhone call, accessibility action, network interruption or browser limitation. Fullscreen is not universally supported (notably mobile Safari).
- Away and blur are coalesced as a **single** interval so they do not double-count strikes. Server-observed returns within a configurable 3–120 second grace are marked `grace`. Connection reconnection never counts as a strike. Missing returns are `observed`, not automatic violations.
- Server enforcement reuses the same student/approved-course, assignment, release, current preflight policy consent and frozen attempt deadline checks as private autosave. No client-provided student or course permission is trusted. Historical, untimed or unconfigured attempts fail closed.

## Data and reliability

- Records contain only attempt reference, random retry ID, event class, server-observed timestamp, coarse decision, optional elapsed milliseconds and expiration. No question/answer data, personally entered explanations or authorizing credentials.
- Maximum 20 events/minute and 200 events/attempt; replayed event IDs return the same classification, mismatched replay is rejected. A 7-day expiry is enforced on student reads, with per-event Convex scheduled cleanup.
- Student-private timeline uses account subject, not untrusted attempt ID, for authorization. No teacher/admin event read endpoint or punitive automation is exposed in this PR.
- Offline delivery, `pagehide`, app force-quit and tab close are not guaranteed. No claims that a plain website can detect other phones, prevent screenshots or disallow OS shortcuts. Delivery errors are visible via the hook status; events aren't silently reported as delivered.
- The future live player needs disclosed policy UI, accessible/translatable warnings, review/appeal workflows, anti-cheat settings, mobile Safari/Android/RTL testing and an explicit hook mount. PR20 covers reviewer workflow, device/active-session lease and human decisions.

## Verification and release gates

Unit tests cover policy bounds, grace, repeated warnings and connection exceptions. Integration tests cover authenticated student isolation, doctor/other-user denial, consent and release gating, duplicate events, server-trusted durations, coalesced browser signals, terminal attempts and expiry cleanup.

Remaining: real exam start, protected question/clinical-media delivery, attempt quotas, scheduler hookup for timed starts, review UI, image/screenshots/accessibility/RTL/mobile verification, permission audits and production preview/deployment checks. Nothing in this PR lifts those gates.
