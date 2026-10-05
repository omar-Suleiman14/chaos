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

Every registered tool exposes `chaos/permission` metadata. `createChaosMcpServer` accepts an optional permission allow-list and checks both single calls and each step in a composed workflow. Identity OAuth scopes currently remain provider-standard; the hosted connection currently grants the full supported set. These categories are the enforcement boundary for future granular provider grants, not a claim of separate OAuth scopes already being issued.

Convex remains responsible for owner, collaborator, publication and moderation checks. Sensitive response tools are separate from aggregate summaries and require explicit user intent in assistant instructions. Destructive tools have review annotations and describe consequences. Permissions never replace backend authorization.

Administrator connections expose platform account, form/quiz, learning-content and Business-team inventories, aggregate metrics refresh, account/content moderation, audit activity and documentation authoring under `admin_operations`. CRM tools use the separate `admin_crm` category: `list_crm_contacts`, `get_crm_contact`, `save_crm_contact`, `add_crm_note`, `get_crm_activity`, `set_crm_contact_stages` and `complete_crm_follow_up`. Neither category implies the other. This is tool permission metadata, not a new OAuth identity scope.

Platform operations reuse the native UI service handlers, including self-restriction protection, suspension expiry and audit actor attribution. Private answers, lesson blocks and card answers are excluded from inventory queries. Admin membership grants/revocations and legacy plan operations are not exposed. CRM writes share validation and audit logging with the native admin UI. Read the existing contact before saving its full editable fields; omitted follow-up dates and linked accounts are cleared. CRM tools never send messages.
