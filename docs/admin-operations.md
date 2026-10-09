# Admin operations and plans

Open `/admin` from the workspace sidebar. Admin access is authorized in Convex on every query and mutation from the `admins` table, which is keyed by the stable Chaos account ID (the legacy field is named `clerkId`). No admin email or ID lives in the code. Grant access with `npx convex run --prod admin:grantAdmin '{"email":"person@example.com"}'` (the person must have signed in to Chaos once) and remove it with `admin:revokeAdmin`. Both are internal functions that only the Convex CLI or dashboard can run, and both write to `adminAudit`. Editing a stored account email cannot grant admin access.

Set `NEXT_PUBLIC_SUPPORT_EMAIL` (frontend build) and `CHAOS_SUPPORT_EMAIL`
(Convex deployment) to your instance's support address.

## Moderation

Suspend an account for 1-365 days, ban until manually restored, or restore it. Restricted accounts retain read access to their records but cannot edit, create, collect responses on their content, or use integration tokens. A workspace notice links to support. Suspensions end through a scheduled mutation, with a five-minute recovery sweep for overdue jobs.

Forms (quizzes included) can be taken offline under an admin hold. Hold release permits the owner to publish again; it does not automatically publish content. Published definitions, responses and scores remain intact. New admin controls require a reason and record actor, target and timestamp in the activity log.

## Plans

- New accounts receive one 30-day Pro trial at first profile creation. Signing in again does not renew it.
- Granting or renewing Pro sets expiry to 30 days from the grant. Stale expiry jobs cannot revoke a later renewal.
- Free allows five creations per UTC calendar month, shared across forms and quizzes. Copies, imports and integration-created drafts count. Deleting content does not refund usage.
- Pro removes the monthly creation cap and the platform response caps. A creator's own per-form response limit still applies. Existing Free response limits remain (the configured per-form cap, default 1,000).
- Downgrades preserve all content. Creations made while on Pro count toward that month's Free allowance if the account is downgraded.
- Existing legacy elevated accounts retain their grant until an administrator explicitly sets a plan. Plan-based accounts ignore the legacy elevation flag, preventing permanent entitlement after expiry.
- Select loaded users (up to 100), individual users, or **Select all accounts**. Selected updates are atomic. All-account jobs process bounded batches and exclude accounts created after the job starts. Their progress appears in the admin page while it stays open.

This is manual plan administration, not checkout, recurring billing or automatic charging.

## Analytics

Platform totals scan all users, forms, quizzes and attempts in bounded transactions. Only completed reports are displayed. Refresh hourly or with Refresh analytics. The timestamp identifies the completed scan; activity while a scan runs may be reflected in the next refresh. Restricted owners' content is excluded from live counts.

The legacy `quizFunctions.getAdminUsers` and `getAdminQuizzes` queries now return the same metadata page shape as `admin.users` and `admin.content`, rather than entire tables with per-row aggregate scans. Pass `paginationOpts: { numItems, cursor }` (1–50 items; default 25) and follow `continueCursor` until `isDone`. Quiz rows use `id` and `held`; user rows include moderation and plan metadata. `getAdminStats` reads the completed analytics snapshot and includes `completedAt` and `refreshing`. Totals are `null` until the first completed refresh. `activeToday` counts published quizzes updated since the scan day's UTC midnight, and is `null` during refresh or when the snapshot belongs to an earlier day. It is not a count of active learners.

PostHog uses the EU region. Set the following public build-time variables in `.env.local` and the frontend hosting environment, then rebuild:

```dotenv
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<project public token>
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

The SDK stays disabled without both variables. `screen_viewed` records a screen
category. Page paths are sanitized by `lib/analyticsPath.ts` so private form,
quiz, response and live-game identifiers are removed; referrers and titles are
dropped. Autocapture, session replay and feature flags are disabled. Page views,
page leaves and exceptions are enabled. Signed-in accounts are identified by
Clerk account ID, never email or name, and sign-out resets that identity. Anonymous
identifiers persist in localStorage. Do Not Track is respected. Do not put a
PostHog personal API key in the frontend.

## Verification and rollout

Before rollout on your instance, verify the Clerk JWT template and issuer,
publish frontend environment variables and deploy the Convex schema/functions/crons
before serving a frontend that depends on them. Grant administrators on that
same deployment; development and production memberships are independent.

Tests cover verified-email authorization, new-user trials, stale expiry jobs, Free's shared monthly counter, deletion, month reset, duplication, suspension restoration, content holds, selected/all-user updates and multi-page analytics. UI tests cover selection, confirmation, access denial and mutation failures; analytics tests verify property stripping.
