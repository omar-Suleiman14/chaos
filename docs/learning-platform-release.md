# Learning platform integration

This document describes the integrated result of PRs #378 through #411. The
individual PR documents describe their original slices and may list blockers
that later slices resolve.

## Deployment order

Configure the private R2 bucket and its four server environment variables before
enabling uploads. Keep public bucket access disabled. Allow browser PUT requests
only from the application's origins, with Content-Type and If-None-Match headers.
Never put R2 credentials in public environment variables.

After deploying the additive schema and functions, run these internal operations
against the intended deployment:

```sh
pnpm exec convex run businessTeams:backfillCourseMemberships '{}'
pnpm exec convex run courseSourceAccess:backfill '{}'
pnpm exec convex run r2MediaCleanup:backfillStorage '{}'
```

The operations schedule bounded pages. Wait for the `v2` courseMembershipState
row and courseSourceAccessState row to report `complete: true`. Existing course
content fails closed while its access projection is incomplete. Run the access
backfills during the deployment window before opening student traffic.

The membership projection retains draft and last published lesson associations,
including an unpublished course's last snapshot. Archived, unpublished and
moderated courses do not expose attached lessons, owned sources or assessments
through their standalone links. Independently owned sources retain their own
permission policy. Approval does not bypass a source's existing restrictions.

Storage accounting includes reserved course, form and question images in the
shared teaching quota. Expired pending uploads and explicitly removed media are
deleted after upload capabilities expire. The quota is released only after a
successful storage deletion. Ready images remain counted until removed; there
is no automatic deletion of images that historical versions may still use.
Source migration keeps its verified legacy copy and counts a logical source
once. See `source-r2-migration.md` for the physical storage implications.

## Verification

`scripts/r2-smoke.ts` checks real browser CORS, signed upload length, overwrite
rejection, metadata, conditional ranges, PNG decoding, private reads and cleanup.
`scripts/r2-app-smoke.ts` additionally checks deployed form image handlers,
published question and choice images, and explanation access after submission.
The latter uses a development-only synthetic identity override. It does not
certify real OAuth login or every device's push notification behavior.

Better Auth upgrades are excluded from this integration.
