# Durable study UI handoff

Workspace: `C:/Users/Lenovo/Documents/chaos`. Study UI owns `lib/learn/studyClient.ts`; `lib/learn/data.ts` remains Beauvoir's file.

Exports: `StudyClient(client).forkQuiz(formId): Promise<string>` returns the newly created form draft id. It resolves an immutable publication and calls `quizForks.fork`, which writes lineage atomically. `useStudyActions()` exposes this and `claimIdentity(role, institution)`. `useIdentityClaims()` uses the authenticated `getMyClaims` backend. `useStudyEvidence(conceptIds)` exposes `{ states, practice, refresh }`; at most 10 ids per query. `effectiveClaimStatus` handles expired and revoked claims.

Read glue lives in isolated `convex/learnStudyReads.ts`; no schema expansion. `forkSource` is needed because existing attached quiz reads omit immutable publication identifiers. `myConcepts` is needed because conceptStates requires ids and no account concept catalog exists. It discovers names from up to 200 account-owned evidence rows, explicitly nonexhaustive. `practiceLink` resolves owned selected form references to ordinary respondent links without answer keys or access grants. Typed references avoid changing generated files another agent owns.

Parent coordination: no parent agent id was provided; `send_input(target="parent")` was rejected as an invalid id. Data-hook owner can re-export these hooks and delegate existing forkQuiz to StudyClient. Existing legacy `useWeakAreas` cannot faithfully represent the explainable server evidence shape. Prefer `components/learn/WeakAreas.tsx` or link `/dashboard/learn/weak-areas` from Learn home/sidebar. PracticeTab handles fork navigation directly; its deprecated optional onForkQuiz prop remains source-compatible but is no longer used.

No AI, evidence uploads, document collection or invented verification badges. Public ProfileView badges use only current `publicProfile.verifiedRoles`. Backend claim submission includes only institution and role; pending is not verified.

No deployment, commits or push performed by this worker. New read functions require deployment by the coordinating parent before signed-in browser acceptance.
