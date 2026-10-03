# Server authorization boundaries

Authorization is enforced by the backend. Browser controls are not permission
checks. This document describes the boundaries; it is not an exhaustive audit
or a guarantee that every possible attack has been tested.

## Identity and administration

`convex/auth.config.ts` requires an explicit HTTPS Clerk issuer and the `convex`
JWT audience. Each installation configures its own issuer. Existing account
and ownership records use Clerk user IDs; changing those identity keys requires
a deliberate migration.

Admin membership lives in the `admins` table. Only internal `admin:grantAdmin`
and `admin:revokeAdmin` functions can change it. Neither a client-provided email
nor an editable profile field grants administrator access.

## Creator content

`convex/authz.ts` provides quiz, question, session and form authorization helpers.
Legacy quiz writes require ownership; administrator reads are permitted only
where the specific function requests them. Form access is scoped by owner,
editor and viewer roles. Sensitive settings and collaborator administration
require the appropriate role. Writes also check account moderation restrictions.

Email invitations require a positive `emailVerified` provider claim for pending
or unbound grants. Profile creation does not bind invitations using unverified
email addresses, and stored profile email alone cannot grant access. Accepted
and legacy explicit account grants retain their account ID authorization. The
same matching policy governs listing, accepting, declining and leaving forms.

Read functions may return `null` or an empty collection when access is denied,
where the existing client expects that behavior. Creator mutations reject an
unauthorized caller. Possessing a document ID does not grant creator access.

## Respondents and live games

Respondent endpoints intentionally allow anonymous callers for public content.
They enforce publication, availability and configured access rules on the server.
Quiz keys and private creator metadata are omitted from respondent projections;
results and answer reveals follow the configured settings.

Form response edits use a respondent receipt capability. Uploads use short-lived,
single-use tickets; the HTTP upload handler validates the ticket, size and type.
Live-game players authenticate with a private player token and server-side hash.
Question timing, grading and host permissions are enforced by Convex.

## Integrations

The HTTP integration API validates a connection token, its scopes and any explicit
content selection. It creates imports as drafts. Respondent data is available
only through the corresponding permission; it is not implicitly shared with
another product. See [integration-api-v1.md](./integration-api-v1.md).

The Next.js `/mcp` route verifies Clerk OAuth tokens and the optional client
allowlist before forwarding a verified account ID through the shared-secret
Convex endpoint. Backend tools recheck content permissions. Configure the same
`CHAOS_MCP_SECRET` in both processes.

Webhooks require management permission. Signing secrets are encrypted with
`CHAOS_WEBHOOK_KEY`. Delivery validates and pins DNS, refuses private and reserved
network destinations, and does not follow redirects. Localhost delivery is an
explicit development-only option. See [webhooks-v1.md](./webhooks-v1.md).

## No internal AI

Chaos runs no AI models and has no AI endpoints. ChatGPT and Claude reach Chaos only
through MCP, with the same permissions as the signed-in user. The old `aiJobs` table and
`quizzes.isAiGenerated` stay in the schema so historical rows remain valid; nothing reads
or writes them except quiz deletion, which detaches old jobs.

## Verification

Run `pnpm test:integration` for real Convex handlers against the in-memory test
backend, including unauthorized callers, scoped integration access, response
privacy, upload boundaries and live-game behavior. Unit tests also check selected
authorization wiring. Real Clerk/OAuth, webhook delivery and multi-device games
still require acceptance checks against your intended deployment.
