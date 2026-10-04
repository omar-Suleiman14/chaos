# Chaos plans

**Personal** is free for one user on the hosted Chaos service, for study, teaching and individual use. It includes unlimited forms, surveys, quizzes, lessons, courses and responses, Live games up to the 500-player platform maximum, the Chaos app in ChatGPT and branding removal. Personal has no team sharing or collaboration. Create or join a Business workspace to collaborate. Rate limits, security checks and platform object limits still apply. This hosted-service policy does not change AGPL self-hosting rights.

**Business / Teams** is **50 EGP per active seat per month**, with a **limited-time 100% discount to 0 EGP**. Anyone can create a team free at `/dashboard/teams`. No checkout, card collection, charges or automatic renewal exists. The promotion is controlled by `planCatalog.pro.promotion.active`; no end date has been announced. Respondents, students and Live participants are free.

Business teams have owner, admin and member roles. Owners can appoint admins and transfer ownership; admins manage member invitations and removals. Every member can edit shared forms, lessons, courses and supported content in shared folders. Only resource owners can share their content. Course and lesson publishing remains owner-only; forms reuse their existing editor/approval policy. Team membership is checked on every access, including folder and course inheritance. Removing a member also removes that person's shares from the team.

Email invitations appear in Chaos after the invited address is verified. Chaos does not send email: share the provided link yourself. Links are hashed at rest, single-use, revocable and expire after seven days. Raw invitation tokens use the URL fragment and are cleared when the join page loads.

An active seat is a named team member able to create or manage Business content. The UI reports current membership, not an invented monthly billing metric. No monthly seat usage is measured or charged. Safety bounds are 20 teams per account, 100 members, pending invitations and directly shared resources per team, and 20 teams per resource. Resource pickers show the latest 200 owned resources of each type; folder contents are paginated. Existing course-to-lesson discovery uses the existing 500-course owner scope.

## Uploads and billing status

Every account has a 10 MiB maximum per respondent form upload and a 25 MiB maximum per teaching source file. These are per-file limits; no total storage quota is enforced, so none should be advertised.

No checkout or automatic charge is active. Taxes, invoicing and seat proration must be defined before billing launches.

The catalog is `lib/planCatalog.ts` (`null` means no usage cap). General feature checks still call `hasPro`; collaboration creation checks Business membership separately. `isPaidPlan` still reports legacy paid or admin-granted plans for admin screens. Existing direct form and lesson grants remain readable for backward compatibility; creating or assigning new direct grants requires a Business workspace. Creation counting is in `convex/plans.ts`, response caps in `convex/respond.ts` (a form's own response limit still applies) and Live player caps in `convex/liveLogic.ts`.
