# Chaos PR 29/34 — Platform Notifications, In-App Inbox, Preferences & MCP Parity

This is an isolated draft. No existing PR is merged or deployed.

## Shipped in branch
- Existing Notification Bell keeps form response, webhook and approval notifications and now shows course notices with deep links and EN/AR course-category toggles.
- Course announcements, calendar sessions, assignments, classroom messages, join requests, approved admissions and explicitly published/regraded results create notifications in the same Convex transaction as their source change.
- Dedupe per (recipient,eventKey), validated bounded text, default-on account-owned preferences, paginated bounded fan-out (25 recipients per transaction), and fresh course approval checks at send and read time.
- Grade notifications use generic text and never contain scores, answers, rubrics or withheld drafts.
- MCP exposes list_notifications, mark_notifications_read, get_notification_preferences and set_notification_preference, with existing account identity forwarding and granular read/edit permission categories.

## Delivery contract
In-app delivery is synchronous and atomic: if the source transaction fails, neither event nor notification persists, and retries of the same event key do not create duplicates. This avoids a separate retry queue for database-only delivery. An external channel with backoff, fan-out pagination and dead-letter recovery is **not** included. PR 34/34 adds opt-in push subscription, browser service worker, VAPID-encrypted scheduled delivery and bounded retries; see [PWA push acceptance](./pwa-push-pr34.md). It remains draft and is not production-validated.

## Required acceptance
- CI: build, lint, typecheck, unit/integration, browser and performance checks.
- Genuine screenshots and keyboard/reader accessibility on AR/EN, mobile/desktop, light/dark.
- Live OAuth, doctor/student approval and revocation, suspended account and grade privacy tests.
- Student and admin fan-out process 25 recipients per transaction and schedule continuation pages, so larger courses and admin rosters do not expand one source mutation beyond its write budget.
- Vercel preview and protected source/media/MCP review must pass before release.

## Expanded grading notices and review gates
- Submissions notify the owning doctor without exposing essay text, answers or grades.
- Explicit assisted-grading requests notify current active platform admins. Handoff to the doctor notifies the course owner; no marks are published by this event.
- Admin-only alerts recheck the current admin roster at inbox read time and are hidden after role revocation. Admin queue alerts use the existing secured `/admin` destination.
- Admin fanout uses the same 25-recipient continuation pages and rechecks admin status for each page.
- **Explicit performance-budget raise:** the four new public MCP notification tools increase registry count 132→136 (admin 150→154) and add roughly 4 KiB to each list-tools payload. Only those four registry metrics are raised and justified in `perf/baselines/surfaces.json`; all other gates remain unchanged.
