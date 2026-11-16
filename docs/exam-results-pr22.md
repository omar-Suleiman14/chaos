# Chaos PR22 — Student My Results, controlled release and transcripts

Draft stacked on PR #398. Do not merge or deploy until all release checks pass.

## Security contract
- Only authenticated students may read their own completed attempt results. IDs are never access tokens.
- Before release: only status, exam title, course and completion metadata. No score, percentage, answer key, prompts, rubric, explanations or written answers.
- After release: final earned/maximum points, percentage, and pass/fail transcript. No question-level data or answer key.
- Immediate: only final grades. After-close: only final grades after frozen UTC close. Manual: only final grades after doctor-authorized snapshot publication.
- Visibility and passing threshold are frozen into the private grade ledger at submission; legacy grades without frozen policy fail closed.
- Manual publication is versioned and audited, with explicit revocation. Publishing never makes pending essay grades visible.
- Student UI: /dashboard/learn/exams/results. Teacher UI: /dashboard/courses/[id]/exams/results?draft=<draftId>.
- Full student exam entry remains disabled. No changes to candidate access, MCP, answer keys or grading algorithms.

## Before merge
Full static analysis, lint, typecheck, unit, integration, browser tests, production build, Arabic/English desktop/mobile screenshots, cross-account IDOR checks and Vercel preview must be verified.

Next PR23: Human Grading Queue, Rubric Scoring and Moderation.
