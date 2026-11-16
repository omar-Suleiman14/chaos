# PR 30/34 — Operational platform administration

**Draft only. Stacked on PR #406. Not merged or deployed. No billing or payment processing.**

## Surface

`/admin` → **Operations** uses the existing admin-only shell and current account-based server authorization. It adds six sections:

| Section | Data | Limit / authority |
| --- | --- | --- |
| Enrollment | Course join requests, course label, student and doctor account IDs, status, requested/updated timestamps | All or server-filtered status, 1–25 per query; **no approval mutation** |
| Exams | Course/release IDs, version, configuration, student-entry status, schedule, assignment flag | 1–25 per query; **never returns frozen questions, keys or essays** |
| Grading | Assisted grading job lifecycle, revisions, retries, lease expiry | All or server-filtered status, 1–25; **cannot claim jobs or approve marks here** |
| Usage | Existing completed hourly `adminAnalytics` snapshot and refresh action | Totals only after scan completes; not live counters |
| Support | Case intake, priority, open/in-progress/resolved status and optional existing account ID | Admin-only. Transitions require 8–500-character reason and matching revision. Each state change is audited transactionally |
| Audit | Existing append-only `adminAudit` event stream | Recent-to-old pages of at most 25; no bulk fetch |

The operations view does not give administrators new access to student essays, marking rubrics, draft question content, answer keys, or unpublished student grades. Administrative visibility is metadata-only. Owner-only course admission, instructor grade review/release, and public student visibility rules remain unchanged.

## Backend contracts

- `adminOperations.admissions`, `exams`, `grading`, `cases` and `audit` are bounded Convex paginated queries.
- Queries call `requireAdminForActor` at invocation time, not only in the UI. The HTTP client never passes an arbitrary actor ID.
- `courseJoinRequests.by_status_updated` allows bounded global admission-state filtering. `examGradingJobs.by_status_updated` is reused.
- Support cases live in `platformSupportCases` with a status/update index and no billing fields. The optional linked account must exist by stable account ID.
- Support write operations enforce current admin role, text limits, optimistic revision, and atomic insertion into `adminAudit`. State changes cannot use a stale revision or a blank reason.
- Existing dashboard overview and legacy activity endpoints remain intact to avoid accidental backward-incompatible changes.
- Pagination limits on each operations query are **25 records / 1 MB**. There are no unbounded `collect()` or cross-course counts in new endpoints.
- Course names are read internally only to label the row; unpublished content is never sent to the client.

## Verification and release gates

New integration tests cover anonymous and non-admin rejection, role revocation, paged reads, support create/transition/conflict/audit, and redaction of private exam content. The existing admin and exam suites must remain green.

Before merge:
1. Run TypeScript, oxlint, ESLint, integration/unit tests, production build and performance budgets in GitHub CI.
2. Test screen readers and keyboard navigation, Arabic/English labels, RTL layout and mobile tables with genuine browser screenshots (not mock screenshots).
3. Verify real admin OAuth, revoked roles, suspended administrators, data shape against non-trivial live cohorts, and protected course/media/MCP boundaries.
4. Verify Vercel preview when build-rate constraints permit. This is not a deployment authorization.

## Explicit limitations

This PR is an operational view, not an incident management service desk. Support cases are opened by admins, not end users; no incoming email, SLA scheduling, attachment uploads, automated ticket assignment, or outbound alerts. User-request support intake can be a separate follow-up.

Enrollment and grading sections show **paged records, not exhaustive counts**. Usage totals reflect the existing completed analytics scan and may be stale. No new global statistics are implied by loaded rows.

This change does not modify billing, subscriptions, fees, checkout, course permissions, exam grading policies, or push notification delivery (reserved for PR 34).
