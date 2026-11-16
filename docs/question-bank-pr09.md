# PR 09 — Reusable Question Bank and Lecture Tagging

This PR adds a private, creator-owned reusable question library, separate from existing classic quiz questions and course publications. It does not publish exams or make answer keys visible to learners.

## Server API (`convex/questionBank.ts`)

- `create`, `get`, `listMine`, `update`, `archive`: bounded private authoring, pagination, optimistic revisions, and soft archive.
- `addScope`, `listScopes`, `removeScope`: idempotent links to an owned course, optional module and optional lecture. Questions may be linked to multiple courses without being copied.
- `selectForExam`: owner-only, ready-only selection by course, modules, lectures, topics, terms, and learning outcomes. Returns `hasMore`; maximum 100 results per call.
- Supports single choice, multiple choice, true/false and written responses. Answer keys and written grading references are stored privately.

## Security and operational requirements

- Bank reads, including answer keys and scope listings, require the question owner. Enrollment or course approval never grants bank access.
- Course/lecture/module associations are revalidated on write; scope links are categorization only and never confer access.
- Never include `questionBankItems` in public course payloads or student MCP tools.
- Question edits increment a revision. Before any exam is assigned, its builder must create an immutable question-and-answer-key snapshot to prevent historical exams from changing.
- Current selection scans at most 1,001 indexed course links and rejects overflow. This is an explicit limit, not permission to return incomplete selections.
- The current repository has no dedicated verified doctor role. Ownership is enforced by signed-in registered account and by owned course; formal teacher-role policy remains a release decision.
- No exam scheduling, assignment, grading, UI, imported question conversion, bulk tooling, or published assessment pathway is included here.

## Regression coverage

`tests/integration/questionBank.test.ts` covers private answer keys, unauthorized edits, owner-only course scope, idempotent multi-course reuse, invalid module/lecture filters, input validation, optimistic editing, archive and restore.
