<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Working agreement

- Define the requested outcome and concrete completion checks before substantial work; infer routine details from the request and repository.
- Keep taking the next safe, authorized step when no user input is needed. Pair brief progress notes with the next action; do not stop merely to offer to continue.
- Ask when a necessary decision or missing access prevents progress, or before destructive or out-of-scope actions that the user has not authorized. Never disable permission safeguards.
- Incorporate follow-up instructions into the current task without restarting completed work. Revisit settled decisions only when asked or when new evidence shows a problem.
- For long tasks, maintain a concise checklist in TASKS.md with completed work, remaining work, verification and blockers. Preserve existing entries; this is a working checklist, not a replacement for the GitHub roadmap.
- Parallelize independent audits or migrations with subagents when available. Give each a bounded scope and verify its evidence before accepting its result.
- Inspect current code before treating an open issue or old document as proof of a defect. Distinguish implemented, verified, proposed and unconfirmed work.
- Review the final diff and run checks appropriate to the change. Report actionable defects with file/line, impact and a reproduction or test; do not claim checks passed unless they ran.
- State what could not be confirmed and where you looked. Put decisions or blockers needing the user first in the final report, followed by changes, findings and verification.
- Ask for concise explanations of decisions and evidence, not private internal reasoning. Avoid boilerplate instructions to "think hard" or "think step by step."
- For visual work, honor concrete design constraints and use supplied screenshots or reference files directly. Do not treat an article's example style exclusions as this project's design requirements.
- Deliver requested finished files, and check documents for inconsistent numbers, dates and names.

## Product direction

- Chaos is moving to an AI-free product. Do not add or expand AI generation, AI editing, model providers or AI quotas unless the user changes this direction.
- AI removal is planned, not completed. Preserve existing quizzes, questions, responses and scores when implementing it; remove obsolete AI surfaces and services through a deliberate migration.
- Chaos and Max remain independently usable products. Integrate through versioned, product-neutral contracts, with explicit selection of shared content and scoped permissions.
- Create imported content as drafts for review. Do not silently send private source material or mirror respondent data into Max.
- A request for a feature/fix list authorizes planning and requested documentation edits, not product implementation or GitHub issue mutations.

Workflow guidance adapted from the user-supplied text of [Getting the most out of Opus 5.5](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/) (September 22, 2026). Model availability, pricing and application-setting claims are not project rules.

## Engineering guardrails

- **Outbound fetches & SSRF:** Enforce public-only destinations at connection time on every redirect hop (previews, webhooks, external fetches); never rely solely on an initial hostname check or automatic redirects. Rate-limit public endpoints.
- **Storage & asset ownership:** Never register, serve, or delete a storage blob from an unverified caller-supplied ID. Bind uploads to a single-use, owner-scoped server record and check ownership + references before deletion.
- **Membership & truthful security controls:** Require active org/workspace membership before any creator/owner shortcut, and unify offboarding cleanup. Never expose or persist security enforcement switches (e.g. MFA/SSO) until server-side session claim checks are wired.
- **Target-scoped auth & visibility filtering:** Authorize elevated mutations on the resolved target resource (never an independently supplied scope). Filter related/cross-entity data by viewer visibility *before* computing rollups, filters, sorts, or aggregates. Bind OAuth callbacks to the initiating browser session and authenticated account.
- **Atomic commits, drafts & pagination:** Share one in-flight init promise; never let a failed disk/write poison a queue or leave memory ahead of disk; defer file deletion post-commit. Scope client recovery drafts per session/workspace, surface storage failures, and pin unmount saves to the originating workspace. Use cursor pagination with bounded page sizes instead of growing `limit`.
- **Scaling & reactive hygiene:** Avoid full-table `.collect()` scans in hot paths (backlinks, search, graph, pagination, bulk inserts). Keep ephemeral presence/cursor state off durable persistence and global invalidations. Keep high-churn metadata out of always-mounted navigation subscriptions, split UI state from data contexts, and defer heavy bundles/templates until needed.
- **Code hygiene & boundary tests:** Remove dead code, unused deps, duplicates, and stale phase/PR milestone comments; keep experiments out of root typecheck/lint. Test HTTP route boundaries directly (auth parsing, error codes, webhook signatures, SSRF/upload checks), avoid fixed sleeps and mega-tests, and verify adapter parity with behavioral contracts.
