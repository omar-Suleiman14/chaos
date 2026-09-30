# Chaos plans

Free on the hosted Chaos service is intended for personal study and individual use. It includes 5 new forms or quizzes per UTC calendar month, 1,000 responses per form and 100 players per Live game. Deleting a form does not refund a creation. This hosted-service policy does not change AGPL self-hosting rights.

Pro / Business is proposed at **20 EGP per active creator seat per month**. Respondents, students answering assignments and Live participants are not paid seats. An active seat means a named member enabled to create or administer business content during the billing month; sharing logins is not a seat substitute. Businesses can request seat provisioning through Support. Current entitlements belong to individual user accounts; organization seat metering and business-use eligibility enforcement are not implemented yet. Business usage is not automatically inferred or billed.

Pro includes 100 new forms or quizzes per UTC calendar month, 10,000 responses per form and 500 Live players, including during the trial. Creation and response enforcement use the shared catalog. A deployment can impose a lower Free response cap through its existing configuration. Rate limits, security checks and platform object limits still apply. This is not unlimited storage or unlimited traffic. The allowance implementation does not activate the proposed paid subscription.

## Uploads and billing status

Both plans currently have a 10 MiB maximum per respondent form upload and a 25 MiB maximum per teaching source file. These are per-file limits. No plan-specific total storage allowance or pooled business storage quota is enforced; do not advertise one until accounting and server-side enforcement exist.

No checkout or automatic charge is active. New accounts currently receive a 30-day Pro trial, then use Free unless another entitlement is granted. The 20 EGP price is proposed, not a purchasable subscription. Taxes, invoicing and seat proration must be defined before billing launches.

The public catalog is `lib/planCatalog.ts`. Current enforcement remains in `convex/plans.ts`, `convex/respond.ts`, `convex/liveLogic.ts` and `convex/learnModel.ts`. This documentation does not change backend entitlements.
