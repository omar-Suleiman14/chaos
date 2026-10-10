# Error/loading presentation audit — issue #191

Reviewed main `43cc040` and route-level callers on 2026-10-10. This is an evidence-backed **no-code-change** decision rather than introducing a cosmetic abstraction that changes behavior.

| Component | Important distinct behavior |
|---|---|
| `components/LoadingState.tsx` | Displays a simple loading line, then after 8 seconds an offline illustration and a **full-page reload** action; its retry label is `RETRY` / `أعد المحاولة` |
| `components/forms/QueryErrorBoundary.tsx` | React child-subtree error boundary, accessible alert, resets **only its subtree**; retry `Try again` / `حاول مجددًا` |
| `components/site/ErrorScreen.tsx` | Shared visual composition, can render a link or callback, optional support digest and status URL |
| `app/[lang]/(app)/dashboard/error.tsx` | Next route-segment error, reports to PostHog and calls `reset`; retry `Try again` / `حاول مرة أخرى` |
| `app/[lang]/(app)/dashboard/loading.tsx` | Suspense/prefetch boundary uses a skeleton inside workspace; not the stalled loader |

**Evidence against collapse:** even the apparently identical English retry labels have different Arabic text. Route reset, subtree reset, browser reload and prefetch skeletons are not interchangeable and must not be merged. No identical visual/copy pair was confirmed in this scope after comparing all route variants. `ErrorScreen` is already reused where its contract fits.

**Change made:** unit characterization tests for the query boundary's recovery, Arabic alert/button and loading state's exact 8-second transition. No component styles, prose, accessibility, permission or runtime behavior changed. Re-run browser EN/AR, dark/light, mobile/desktop error flows against synthetic nonproduction failures when validating this audit.
