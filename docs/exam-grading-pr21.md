# PR 21 — Deterministic grading, negative/partial marking and rubric metadata

Stacked on #397 (PR 20). Draft only; do not merge or deploy before the release gates.

## Implementation

- Exam builder can configure per-allocation **exact** or **partial** (multi-select only) marking and independent penalties for a wrong or blank response. Validate weights and penalties server-side in 0.01-point steps (0 to full question weight).
- Seal-time snapshot freezes each selected item's marking rule and its optional private written-rubric metadata. A later bank or draft edit cannot retroactively change an attempt's marking.
- Objective grading is deterministic on the Convex server using integer hundredths of a point, set-equivalent answer comparisons and bounded partial credit: correct selected / all correct minus wrong selected / all wrong options, floored at zero for partial items. A wholly wrong response uses the configured penalty; blank uses the separate blank penalty. Scores may be negative before result normalization.
- True/false answers now accept literal true/false values, not the empty display-choice array.
- Submitted attempts create exactly one private `examGrades` record **in the same transaction** as terminal state and key-free receipt. Replays do not create grades. Expired (non-submitted) attempts are not graded.
- Written responses containing text are **never auto-graded**. They remain `needs_manual`, with an optional teacher-authored rubric of 1–10 criterion labels and integer percentages summing to 100. A blank written response scores zero. No final exam percentage is computed while manual grading is outstanding.
- Grading ledger and rubric metadata are accessible only through `examGrading.getOwnerGrade`, which checks account identity, course ownership and snapshot consistency. Student receipt and status APIs return no scores, rubrics, keys, explanations or answer content.
- Unit and Convex integration tests exercise exact/partial scoring, rounding, penalties, blank/written status, malformed data, replay idempotence, student IDOR and expiry.

## Boundaries and follow-ups

1. **Actual exam entry remains hard-disabled** (until secure entry, attempt quota and safe question delivery are implemented).
2. No student scores, answer keys, rubrics, explanations or feedback are released. PR 22 implements result publication policy; PR 23 implements human essay marking and rubric scoring.
3. The question-bank API accepts owner-private rubric criteria and includes them in owner-only export; a dedicated criterion editor and rubric moderation workflow remain for PR 23.
4. Existing sealed snapshots without marking rules continue using strict exact-match, no-penalty grading. No historical grade backfill is performed.
5. Visual screenshot evidence for the new creator scoring controls is required before merge; inherited approval/media/MCP, privacy, accessibility and deployment gates remain.
