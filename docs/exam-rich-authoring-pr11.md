# Chaos PR 11/32 — Rich Question Authoring & Clinical Cases

Stacked on #387. This is owner-only private authoring, not a deployable exam engine.

## Implemented
- Dedicated Arabic/English question authoring at `/dashboard/courses/[id]/questions` linked from the doctor exam builder.
- Single-choice, multi-choice, true/false and written-answer editing with correct keys, model answers, explanations, marks and topic/term/outcome tags.
- Clinical vignette (up to 6,000 characters) and up to four attached PNG/JPEG/WebP clinical images with alt text. Case images use new **private R2** namespace `question-images/`, five MiB per image. Owner-scoped reservation, short-lived single-use PUT, HEAD/ETag/size/content-type validation, byte-signature verification and authenticated GET proxy. Direct public GET and arbitrary external URLs are not used.
- Server-side validation checks media readiness and owner on each create/update; archived/non-ready media cannot be assigned.
- Course-scoped owner-only question list/edit and atomic course link for new questions.
- Atomic JSON bulk import (1–50 questions per transaction), always creating **drafts**; export has 50-item pages and can cover up to 1,000 per course. The portable JSON envelope is `{format:"chaos-question-bank",version:1,questions:[...]}`. Images are omitted from export and must be re-uploaded after import; internal media IDs and R2 keys are not portable.
- No modification of existing published quizzes or exams. No student access to question keys or private media. Owner-only JSON exports include keys by design.

## Security and release limitations
- All routes recheck authenticated owner on read/write. Read image route requires Bearer auth; R2 downloads are proxied rather than handed to browsers.
- The browser R2 PUT requires CORS for `Content-Type` and `If-None-Match`. The media proxy must be verified against the installed Clerk/Convex token template before release.
- Course question scans are capped at 1,000 scope links; UI shows pages of 30. Import 50 per batch. A future indexed bulk pipeline is required for larger pools.
- Upload reservations/orphan images need a retention cleanup procedure before general availability.
- A formal doctor role, immutable exam/answer-key snapshot, student-safe delivery, timed exam engine, image inclusion in exam snapshots, grading, course/R2 audits and genuine UI screenshots remain release blockers.
