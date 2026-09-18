# Server authorization audit

This audit covers every exported Convex query, mutation, action, and internal mutation in the application server. Creator-owned quiz, question, session, analytics, and AI-job access is centralized in `convex/authz.ts`.

Unauthorized read operations intentionally return `null` or `[]` where the existing UI expects an empty result. Unauthorized creator mutations throw. Public respondent operations remain anonymous, but only expose published quiz data and safe question projections.

## `convex/quizFunctions.ts`

| Function | Access / ownership rule | Unauthorized behavior |
| --- | --- | --- |
| `getOrCreateUser` | Authenticated caller; reads/writes only caller's Clerk user row and quizzes | Throws `Not authenticated` |
| `getCurrentUser` | Authenticated caller; caller's Clerk user row | Returns `null` |
| `setUsername` | Authenticated caller; caller's user row and quizzes | Throws |
| `getUserByUsername` | Public profile lookup | Public result or `null` |
| `getTeacherSettings` | Authenticated caller; caller's settings | Returns `null` |
| `updateTeacherSettings` | Authenticated caller; caller's settings | Throws |
| `createQuiz` | Authenticated caller; created quiz is assigned to caller | Throws |
| `updateQuiz` | Quiz owner via `requireQuizOwner` | Throws not found/unauthorized |
| `deleteQuiz` | Quiz owner via `requireQuizOwner` | Throws not found/unauthorized |
| `getMyQuizzes` | Authenticated caller; index is scoped to caller's `creatorId` | Returns `[]` |
| `getQuiz` | Quiz owner or configured admin via `getQuizIfOwnerOrAdmin` | Returns `null` |
| `getQuizForOwner` | Quiz owner via `getQuizIfOwner`; used by server actions | Returns `null` |
| `getQuizBySlug` | Public only for published quizzes; unpublished visible only to owner/admin via `canViewQuizAsRespondent` | Returns `null` |
| `getQuizByUsernameSlug` | Same as `getQuizBySlug`; returns safe routing metadata only | Returns `null` |
| `validateSlug` | Authenticated caller; checks slug only within caller's username namespace | Returns `false` |
| `addQuestion` | Parent quiz owner via `requireQuizOwner` | Throws not found/unauthorized |
| `updateQuestion` | Parent quiz owner via `requireQuestionOwner` | Throws not found/unauthorized |
| `deleteQuestion` | Parent quiz owner via `requireQuestionOwner` | Throws not found/unauthorized |
| `getQuestions` | Quiz owner or configured admin via `getQuizIfOwnerOrAdmin`; may include answers | Returns `[]` |
| `getQuizForPlayer` | Anonymous for published quiz; owner/admin may preview unpublished quiz | Returns `null`; answer fields are never returned |
| `startQuizSession` | Anonymous respondent capability for published quiz | Throws if quiz is missing/unpublished |
| `gradeAnswer` | Anonymous respondent capability using an in-progress session ID; question must belong to that session's quiz | Throws for invalid session/question or cross-quiz question |
| `completeQuizSession` | Anonymous respondent capability using a session ID | Throws if session is missing |
| `submitQuizSession` | Legacy anonymous respondent submission for published quiz; foreign question IDs are ignored and score zero | Throws if quiz is missing/unpublished |
| `getQuizSessions` | Quiz owner via `getQuizIfOwner` | Returns `[]` |
| `getSessionDetail` | Parent quiz owner or configured admin via `getSessionIfOwnerOrAdmin` | Returns `null` |
| `overrideScore` | Parent quiz owner via `requireSessionOwner` | Throws not found/unauthorized |
| `getQuizLeaderboard` | Anonymous for published quiz; owner/admin for unpublished preview | Returns `[]` |
| `getIsAdmin` | Authenticated identity checked against `CHAOS_ADMIN_USER_IDS`; returns a derived boolean only | Returns `false` |
| `getAdminStats` | Configured admin via `requireAdmin` | Throws |
| `getAdminUsers` | Configured admin via `requireAdmin` | Throws |
| `getAdminQuizzes` | Configured admin via `requireAdmin` | Throws |
| `adminToggleUserBan` | Configured admin via `requireAdmin` | Throws |
| `adminToggleUserElevation` | Configured admin via `requireAdmin` | Throws |
| `adminToggleQuizElevation` | Configured admin via `requireAdmin` | Throws |
| `adminToggleQuizBan` | Configured admin via `requireAdmin` | Throws |
| `adminDeleteQuiz` | Configured admin via `requireAdmin` | Throws |
| `getGlobalConfig` | Public application configuration | Public result or `null` |
| `updateGlobalConfig` | Configured admin via `requireAdmin` | Throws |
| `getPlayerPercentile` | Anonymous respondent capability using a completed session ID; returns aggregate percentile only | Returns `null` for missing/incomplete/insufficient data |
| `getQuizStatsEnhanced` | Quiz owner via `getQuizIfOwner` | Returns `null` |

The anonymous session functions intentionally remain callable without creator authentication because respondents do not sign in. Session IDs act as respondent capabilities. Creator-facing session reads and score mutation use parent-quiz ownership helpers.

## `convex/aiQuizMutations.ts`

| Function | Access / ownership rule | Unauthorized behavior |
| --- | --- | --- |
| `generateUploadUrl` | Authenticated caller | Throws |
| `createAIJob` | Authenticated caller; new job stores caller's Clerk ID | Throws |
| `cancelAIJob` | Job owner via `requireAIJobOwner` | Throws not found/unauthorized |
| `getAIJob` | Job owner via `getAIJobIfOwner` | Returns `null` |
| `updateAIJob` | Internal mutation only; invoked by trusted AI action after public ownership validation | Not publicly callable |
| `saveGeneratedQuiz` | Internal mutation only; receives caller Clerk ID from trusted AI action | Not publicly callable |

## `convex/aiQuiz.ts`

| Function | Access / ownership rule | Unauthorized behavior |
| --- | --- | --- |
| `runAIQuizGeneration` | Authenticated caller and job owner; validates through `getAIJob` before API-key/network work | Throws not found/unauthorized |

## `convex/aiEditorChat.ts`

| Function | Access / ownership rule | Unauthorized behavior |
| --- | --- | --- |
| `editQuizWithAI` | Quiz owner; validates through `getQuizForOwner` before API-key/network work | Throws not found/unauthorized |

## Shared authorization helpers

`convex/authz.ts` is the only place that compares creator/job ownership IDs or the configured admin user IDs with the authenticated identity. Admin membership comes from the Convex `CHAOS_ADMIN_USER_IDS` environment variable and is compared to Clerk `identity.subject`. It exports identity, admin, quiz-owner, question-owner, session-owner, AI-job-owner, and respondent-visibility helpers. The unit authorization guard verifies that creator ownership comparisons remain centralized and that every creator-scoped entry point continues to call the expected helper.
