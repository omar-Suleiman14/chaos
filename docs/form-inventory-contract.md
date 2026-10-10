# Bounded form inventory

`convex/formInventory.ts` enumerates owned forms followed by qualifying collaborator
rows. Owned forms retain descending `updatedAt` order. Account-index memberships
precede verified-email memberships; the first qualifying row for a form wins.
Declined or otherwise unauthorized rows cannot suppress a later valid grant.
Missing forms are skipped. Caller projections and response-counter reads stay
outside this helper.

| Caller | Owned limit | Membership limit per index | Invitation access | Archived forms |
| --- | --- | --- | --- | --- |
| `forms.listMyForms` | 500 | 200 | Verified email for pending/unbound grants; pending rows become invitations | Included |
| `forms.searchIndex` | 300 | 100 | Verified pending/unbound email rows remain searchable | Included |
| `mcp.searchForms` | 500 | 200 | Accepted/legacy explicit account-ID grants only | Excluded unless requested |

Native callers require a positive provider `emailVerified` claim before querying
the email index. A stored profile email, an old pending account prebinding, or an
accepted grant belonging to another account cannot grant access. MCP receives an
account ID, not a verified-email identity, so it never queries email memberships.
Clerk and Better Auth retain their existing identity resolution and ownership IDs.

The native list excludes all self-owned forms from its shared/invitation results.
Search and MCP deduplicate against their bounded owned result, preserving their
historical behavior for a self-owned form outside that window. No new moderation,
team-membership, or publication rules are inferred by this enumeration refactor.

These are existing bounded snapshots, not complete pagination. Their differing
ceilings are intentionally preserved here; #175 tracks a compatible pagination
transition. No persisted forms, definitions, responses, scores or connector
provenance are rewritten. Regression fixtures cover both authentication paths,
invitation verification, duplicate roles, missing records, archived filtering,
ordering, anonymous shapes and owned/collaborator limits.
