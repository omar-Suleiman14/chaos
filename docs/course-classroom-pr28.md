# PR28 — course announcements, private messages and class calendar

Draft-only implementation stacked on PR27 (#404). No merge, deploy, or live student permission changes.

## Scope
- Doctor-created announcements (draft, publish, unpublish, archive) and scheduled classroom events (draft, publish, unpublish, archive), using revision checks and audit records.
- Approved enrolled learners can read published announcements and events for their own course. Suspended/removed students and historical self-enrollments cannot read them.
- Doctor/student private 1:1 course conversations; the teacher must identify an approved enrolled learner. Each query revalidates current course approval. Never expose one student's conversation to another student.
- The classroom UI combines teacher-planned events with PR27 published assignment dates and surfaces existing PR04 roster/groups for class management. Group membership alone grants no message access.
- Arabic/English UX; server validation and bounded reads. Published content never includes private exam answer keys, grades or rubrics.
- No automatic email/push/WhatsApp alerts, unread notifications, bulk messaging, attachments, parent access or administrative snooping (PR29 or future work).

## Release blockers
Genuine Arabic/English desktop and mobile screenshots (light/dark); verify live doctor/student identity, enrollment approval and revocation; adversarial cross-course tests; media/R2/source/MCP authorization audit; Vercel preview, accessibility check and production integration tests. Live exam entry remains disabled. Preserve existing grading release holds.
