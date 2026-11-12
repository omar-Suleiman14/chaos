# MCP permission categories

| Category | Access | Consequence |
| --- | --- | --- |
| read_content | Read accessible content and own progress | No other student evidence |
| edit_content | Create and change drafts, references and settings | Changes persist; omitted draft fields remain unchanged |
| publish_content | Publish or open a live lobby | Content becomes available according to its access settings |
| aggregate_analytics | Summary statistics | Does not grant individual answer access |
| individual_responses | Read or export individual responses | Personal answers are sent to the connected assistant; request explicitly |
| collaborators | List and change collaborators | Separate from ordinary content reads; writes change access |
| destructive | Remove blocks, restart reading, unpublish, archive or end a game | Descriptions explain retained history and lost access |
| admin_crm | Read and edit private CRM contacts, scheduled follow-ups and notes | Available only to verified administrator connections; backend checks active admin membership on every call |
| admin_operations | Read platform inventories, metrics and audit; moderate accounts/content; author documentation | Advertised only to verified administrator connections; each call rechecks current admin membership and active account state. Does not grant CRM access |

Every registered tool exposes `chaos/permission` metadata. `lib/mcp/permissions.ts` explicitly classifies each public and administrator tool; names do not imply permission. Unclassified operations are rejected at registration and when called, even without a granular allow-list. When adding a tool, review its category, add it to that map, and run `pnpm mcp:inventory` to update the generated contract. `pnpm mcp:inventory:check` rejects unclassified registrations and schema drift; permission tests compare every category with the reviewed schema snapshot.

`createChaosMcpServer` accepts an optional permission allow-list and checks both single calls and each step in a composed workflow. Identity OAuth scopes currently remain provider-standard; the hosted connection currently grants the full supported set. These categories are the enforcement boundary for future granular provider grants, not a claim of separate OAuth scopes already being issued.

Convex remains responsible for owner, collaborator, publication and moderation checks. Sensitive response tools are separate from aggregate summaries and require explicit user intent in assistant instructions. Destructive tools have review annotations and describe consequences. Permissions never replace backend authorization.

Administrator connections expose platform account, form/quiz, learning-content and Business-team inventories, aggregate metrics refresh, account/content moderation, audit activity and documentation authoring under `admin_operations`. CRM tools use the separate `admin_crm` category: `list_crm_contacts`, `get_crm_contact`, `save_crm_contact`, `add_crm_note`, `get_crm_activity`, `set_crm_contact_stages` and `complete_crm_follow_up`. Neither category implies the other. This is tool permission metadata, not a new OAuth identity scope.

Platform operations reuse the native UI service handlers, including self-restriction protection, suspension expiry and audit actor attribution. Private answers, lesson blocks and card answers are excluded from inventory queries. Admin membership grants/revocations and legacy plan operations are not exposed. CRM writes share validation and audit logging with the native admin UI. Read the existing contact before saving its full editable fields; omitted follow-up dates and linked accounts are cleared. CRM tools never send messages.

The server instructions follow the same rule: the paragraph that describes administrator and CRM tools is added only for verified administrator connections, so regular connections, including ones installed from the Claude or ChatGPT plugin packages, never see admin tool names or descriptions. See [AI integrations](ai-integrations.md#security).


## Account-controlled OAuth client grants (draft rollout)

Chaos now records an explicit permission set for each verified **OAuth client ID + signed-in account**, not one global grant for every assistant. A connection appears under **Dashboard → Connections → AI assistant permissions** after its first authenticated request. An account owner can allow or revoke categories separately for ChatGPT, Claude, Codex or other approved OAuth clients. The page is available in English and Arabic.

Grants are **Chaos authorization**, not separate Clerk or Better Auth OAuth identity scopes. Users do not paste tokens into the page. The Next.js MCP route verifies the OAuth token and passes its provider-attested client ID to the shared-secret Convex transport. The transport registers the connection and re-checks the current persisted grant **for each tool** before dispatch; MCP `tools/list` also omits categories not granted. Even an assistant caching its old tool list cannot continue to execute a revoked action. Publication via a composed create-and-publish operation is preflight checked on the MCP side.

This does **not** replace existing item ownership, collaborator role, plan limits, approval gates, admin membership or moderation checks; all still apply. Granting `admin_operations` or `admin_crm` is not sufficient without active backend admin membership, and only existing admins can select those categories in the UI.

### Compatibility and safe rollout

- There is no automatic OAuth reauthorization when editing a Chaos grant; clients may need to refresh tool discovery to see the changed list.
- To preserve the currently connected assistant workflows, a newly observed OAuth client initially receives all **seven ordinary** categories on an existing deployment. It does **not** receive administrator categories. This is a staged compatibility default, not least-privilege onboarding.
- For stricter read-only onboarding, set the Convex backend variable `CHAOS_MCP_NEW_CLIENT_DEFAULT=read_only`. **Only newly observed OAuth client IDs** then begin with `read_content` and `aggregate_analytics`. Owners grant additional categories on Connections. Existing grants never silently reset on reconnect or on deploy.
- If the user removes all categories, the connection remains signed in but cannot call any MCP tools. Restore access on the Connections page. To revoke the OAuth identity token itself, use the identity-provider connected-app controls as well.
- Connections identified by the old transport without an OAuth client ID are outside this migration path. The production Next.js adapter rejects verified OAuth tokens missing client IDs; any legacy **secret-authorized direct HTTP clients** must migrate to a verified client ID before a strict transport-only-client-ID enforcement follow-up. Do not give the shared MCP server secret to third parties.
- Roll back safely by reverting the deployment; grant records remain stored and can be re-enabled without changing the OAuth token. Do not delete existing grant rows or expose them to unauthenticated users.

Before enabling read-only onboarding globally, test **both** Clerk and Better Auth authorization, reconnect/revocation, every composed publish flow, the admin capability boundary, and both language variants on an authenticated browser. Keep this as a draft PR until that verification is complete.
