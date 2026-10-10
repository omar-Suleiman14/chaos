# MCP publication-default audit

Issue #141 audits the behavior after merged #126. The older claim that ordinary creation automatically publishes is obsolete. Current registered descriptions, server instructions and generated tool inventory agree with the private-draft default; no runtime/default change is justified.

| Creation workflow | Publication gate | Draft behavior |
| --- | --- | --- |
| `create_form` | `publish === true`, then readiness check, then `publish_form` | Returns edit link, `published: false`, no public share link. Readiness alone does not authorize publication. |
| `create_game_draft` | Same gate via `createThenPublish` | Creates quiz draft; never hosts a room. Hosting remains separate. |
| `create_lesson` | `publish !== true` returns before `publish_lesson` | Creates private draft; validation problems preserve draft and report blockers. |
| `create_full_course` | `publish !== true` returns before `publish_course` | Creates course and lesson drafts; explicit course publication publishes the lessons together. Partial failure reports created IDs rather than recreating them automatically. |
| `create_flashcard_set` | `publish !== true` returns before `publish_flashcard_set` | Creates private set and returns `published: false`. |

Selecting `visibility: public` alone does not authorize publication. Draft edits, imports, forks, folder organization and adding a course lesson do not publish. Explicit publication retains revision, ownership, Business/team audience, moderation, citation and source-sharing checks. Review instruction text in `lib/mcp/server.ts` alongside registrations in `server.ts`, `learn.ts`, `courses.ts`, `flashcards.ts` and `studyLessons.ts`; `pnpm mcp:inventory:check` verifies the committed generated inventory/schema correspondence.

## Separate existing contracts

`save_documentation` is an administrator-only authoring tool. Its description explicitly says that it publishes by default unless `publish: false`; existing tests pin this behavior. It is outside the ordinary creator default changed by #126. Changing it here would change a public contract.

Study profiles default `publish` to false. The preference tool documents that storing `publish: true` requires explicit authorization for future study-job publication. The publication tool documents that authorization must come from the current request or that saved preference. Its separate publication step retains source/assessment checks and rejects publishing other unreviewed course drafts. This audit does not convert a description into an additional backend permission or alter those semantics.

## Regression evidence

`tests/unit/mcpPublishDefaults.test.ts` invokes the real registered SDK tools with both omitted and explicit-false `publish` for all five creation workflows, including public visibility and a forged actor argument. Exact backend call sequences contain creation/edit operations only, and results report `published: false`. Publication flags do not leak into form definitions; supplied actors are stripped. Existing MCP unit/integration tests cover explicit publication, validation blockers, underlying private drafts, source access, course atomicity and administrator documentation behavior.

No UI, tool schema, permissions, stored content or generated inventory changed. Automated synthetic SDK workflow checks replace neither a live assistant session nor production provider/deployment verification, which were not performed.
