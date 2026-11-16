# Chaos PR 15/32 — Student exam preflight, consent and entry gate

**Base:** PR #391, `feat/exam-course-audiences-due-exams`. Draft only; not merged or deployed.

## Scope
- Students open the preflight from their **own approved course's Due Exams** card. A server-side check confirms a live, active identity, explicit assignment, course approval **and** matching enrollment, live audience/group membership, live course publication, current sealed snapshot and prepared settings.
- Bilingual RTL/LTR preflight displays **metadata and policies only**: opening/closing schedule, count, duration, attempts, answer requirement, early submission, timeout behavior, results and answer/explanation visibility.
- Scheduled exams can display a waiting state and accept rules ahead of opening; a closed window is refused by the server.
- Versioned, explicitly checked consent is stored per student and release. Consent is stamped with snapshot, settings revision, assignment revision, course publication, course approval/enrollment and matching group membership. All reads and writes revalidate authorization and policy state; concurrent or stale consent revisions fail.
- The student UI displays an acceptance receipt, **not a Start button**. `startAttempt` continues to fail closed. This PR never exposes frozen questions, private image metadata, rubrics, keys, or start/submit tokens.

## Required follow-on work and release blockers
- Secure question/image delivery, private R2 retention and image access audit, verified doctor-role authorization, server-authoritative timers/quotas and submissions, grade/release rules and inherited course/MCP access review.
- Genuine screenshots of both languages, light/dark themes and responsive desktop/phone layouts, RTL/accessibility review.
- Screenshots and downstream runtime security tests must pass before any merge or deployment. No existing forms, quizzes or production exam records are migrated.
