# Chaos plans

**Personal** is free on the hosted Chaos service, for study, teaching and individual use. It has every feature and no monthly caps: unlimited forms, surveys, quizzes and responses, Live games up to the 500-player platform maximum, the Chaos app in ChatGPT and branding removal. Rate limits, security checks and platform object limits still apply; this is not unlimited storage or traffic. This hosted-service policy does not change AGPL self-hosting rights.

**Business** is planned at **50 EGP per active creator seat per month** for the same product, licensed for business use. Respondents, students answering assignments and Live participants are not paid seats. An active seat is a named member enabled to create or administer business content during the billing month; sharing logins is not a seat substitute. Businesses request seats through Support. Organization seat metering and business-use eligibility are not enforced, and business usage is not inferred or billed automatically.

## Uploads and billing status

Every account has a 10 MiB maximum per respondent form upload and a 25 MiB maximum per teaching source file. These are per-file limits; no total storage quota is enforced, so none should be advertised.

No checkout or automatic charge is active. Taxes, invoicing and seat proration must be defined before billing launches.

The catalog is `lib/planCatalog.ts` (`null` means no cap). Feature checks call `hasPro` in `convex/authz.ts`, which grants every feature to every account; `isPaidPlan` still reports paid or admin-granted plans for admin screens. Creation counting is in `convex/plans.ts`, response caps in `convex/respond.ts` (a form's own response limit still applies) and Live player caps in `convex/liveLogic.ts`.
