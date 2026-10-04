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

Every registered tool exposes `chaos/permission` metadata. `createChaosMcpServer` accepts an optional permission allow-list and checks both single calls and each step in a composed workflow. Identity OAuth scopes currently remain provider-standard; the hosted connection currently grants the full supported set. These categories are the enforcement boundary for future granular provider grants, not a claim of separate OAuth scopes already being issued.

Convex remains responsible for owner, collaborator, publication and moderation checks. Sensitive response tools are separate from aggregate summaries and require explicit user intent in assistant instructions. Destructive tools have review annotations and describe consequences. Permissions never replace backend authorization.
