# Business teams and team-only content

Personal accounts are for one user. A Business team lets members edit shared
content together and lets owners publish content that only the team can open.
Business is 50 EGP per active seat per month, discounted to 0 for a limited
time (`lib/planCatalog.ts`). Billing is off, so there is no checkout.

## Data model

`convex/businessModel.ts` defines the tables:

- `businessTeams` holds the team name and owner.
- `businessMembers` holds each member's role: `owner`, `admin` or `member`.
- `businessInvites` stores invitations as SHA-256 hashes. An invitation can be
  bound to an email address, is single-use and expires after seven days.
- `businessShares` records which forms, lessons, courses and folders are shared
  with which team.
- `businessActivity` is the team activity log.

## Shared editing

`canEditTeamAsset` (`convex/businessAccess.ts`) resolves team access when the
content is read, so removing a member revokes their access immediately. A
shared course includes its lessons. A shared folder includes its contents and
subfolders. Folders can only contain the folder owner's own content. Team
editors can edit shared content but can't publish, unpublish, archive or move
it into another owner's folder tree.

## Team-only (internal) visibility

Team-only content uses `visibility: "restricted"` together with
`audienceTeamId`. Lessons, courses (`learnCollections`) and flashcard sets
store `audienceTeamId` on the row. Forms and quizzes store
`settings.audienceTeamId`, which requires `access: "signed_in"`. Live games
copy the team from the quiz they're hosted from, or take it from the host's
`teamId`.

- **Publishing.** `resolveAudienceTeam` requires the publisher to be a member
  of the chosen team. Publishing with any other visibility clears the team.
  Publishing a course to a team republishes its lessons for the same team.
- **Reading.** `teamAudienceAllows` lets team members read content wherever
  public readers can: lesson, course, flashcard and library reads, study,
  progress and course enrollment. Discovery, search, sitemaps, IndexNow and
  forking still require `public`, so team-only content never leaves the team.
- **Responding and joining.** `teamOrEmailCheck` is applied before email rules
  when someone opens, submits or practises a form or quiz. `joinGame` requires
  a signed-in team member when the game has a team.

## MCP

`lib/mcp/teams.ts` registers these tools:

- `list_teams`, `create_team`, `rename_team`
- `list_team_members`, `invite_team_member`, `list_team_invitations`,
  `revoke_team_invitation`, `accept_team_invitation`
- `change_team_member_role`, `remove_team_member`
- `list_team_resources`, `share_with_team`, `unshare_from_team`

They call `convex/mcpBusiness.ts`, which reuses the same `…ForActor` functions
as the app. Member email addresses are never returned to assistants. Stored
invitation links are never listed; a link is only returned when it's created.
Tools that invite members, change roles, remove members or change sharing use
the `collaborators` permission category.

Team-only publishing is available on existing tools:

- `publish_lesson`, `publish_course` and `publish_flashcard_set` take
  `visibility: "restricted"` plus `teamId`.
- `set_form_response_controls` takes `audienceTeamId`.
- `host_game` takes `teamId`.

Tests are in `tests/integration/businessTeams.test.ts` and
`tests/integration/teamOnlyContent.test.ts`.

## Course membership lookup

Team inheritance and lesson publication use `courseLessonMemberships`, maintained
transactionally by the shared course writer. Associations are candidates only:
reads recheck the course's current owner/outline and current team/folder membership.
No copied editor grants survive revocation. Existing installations need the
[course membership backfill](migrations.md#course-membership-index-2026-10) before
lookup is complete beyond the historical 500-course window.

The 501-course synthetic regression uses two lesson associations. Before backfill,
the beyond-window lesson is unavailable and its read costs 502 documents / 133,482
bytes; after backfill it is available and costs 8 documents / 2,264 bytes (one
transaction each). These are `convex-test` read costs, not production latency.
Exact association and migration-state queries increase from 9 to 12 while avoiding
the broad scan. The standard reader budgets remain unchanged: the public lesson
read shares its creator-account lookup between moderation and display metadata.
