# Learn roadmap: 170-item implementation checklist

Source inventory updated: 2026-10-01, Documents/chaos working tree. Checked entries describe inspected/tested backend implementation, not full production/UI acceptance. The full roadmap is **not complete**.

Source implementation count: **105/170 implemented; 65 remain unchecked**. Bounded follow-ups promote items 31, 32, 123, 5 and 52 from inspected code and local regression evidence; item 116 includes verified MCP response propagation. Items 43, 45 and 85 retain the other agent's updates. Counts describe source implementation only, not live acceptance.

Chaos owns durable models, permissions, versions, sources, learning state and contracts. UI, MCP, Max and external providers are clients of those systems.

## Status definitions and verification boundary

- **Implemented**: the requested bounded backend/model behavior is present in inspected source. This is not a claim of live availability or complete product acceptance.
- **Partial**: some required behavior exists, but a material completion condition is missing or unconfirmed.
- **Pending**: no sufficient implementation was found in the inspected surface.
- **Deferred**: explicitly later or conditional in the roadmap; still unfinished, not counted as done.
- **External verification**: requires a real client, provider account, operator evidence or formal audit beyond source inspection. This also remains unfinished.

Unchecked items remain incomplete. Checked items indicate source implementation only. For the bounded follow-up on items 31, 32, 116 and 123, seven targeted integration suites ran locally: 28 tests passed (publication audit, source moderation, near duplicates, typed hidden parameters, advanced form MCP, form management MCP and homework). The subsequent item 5/52 review also ran two durable-client/frontend backend suites (13 tests passed) and durable conversion unit tests (6 passed). No browser journeys, deployments, provider calls or load tests ran for these follow-ups. Earlier reported test totals and development checks are historical evidence, not live acceptance of every requirement. Production and Max behavior cannot be inferred from local tests. Existing audit documents contain stale statements; source evidence below takes precedence for this snapshot.

Evidence links are relative repository paths. Test links indicate coverage exists; only the explicitly reported bounded follow-up suites ran during this review. Absence claims are bounded to the inspected repository, not a claim about external projects. AI-related work remains outstanding. The current user-supplied AI-free product direction forbids expanding AI services; provider-account setup and live provider verification are explicitly skipped and will be tracked in GitHub issues.

## Durable Learn domain (1–23)

1. [x] **Implemented — Learn domain model.** [schema](../convex/schema.ts), [Learn models](../convex/learnModel.ts), asset/curriculum/community/practice tables represent separate assets and relationships without copying quiz data.
2. [x] **Implemented — First-class lessons.** [lessons](../convex/lessons.ts) and [permissions](../convex/lessonPermissions.ts) provide identity, owner, draft, lifecycle, metadata and published pointer.
3. [x] **Implemented — Public block schema.** [model](../convex/learnModel.ts) and [validation](../convex/learnValidation.ts) define version-1 Chaos blocks, including media, equations, tables, sources and quiz references.
4. [x] **Implemented — BlockNote translation.** [adapter](../lib/lessonBlockAdapter.ts), [round-trip tests](../tests/unit/lessonBlockAdapter.test.ts); durable editor wiring is separately unconfirmed.
5. [x] **Implemented — Durable draft/autosave wiring.** [Hooks](../lib/learn/data.ts) use Convex lesson reads/writes through [DurableLessonClient](../lib/learn/durableClient.ts); the [editor page](../app/dashboard/learn/lessons/[id]/page.tsx) debounces saves, retains unsaved browser recovery and exposes explicit server reload/recovery. Serialized revision baselines freeze conflicting writes rather than overwrite another device. [Client integration tests](../tests/integration/learnDurableClient.test.ts) verify queued autosave/metadata/publication, conflict freezes and recovery. [Conversion tests](../tests/unit/learnDurableConversion.test.ts) preserve supported rich blocks and explicitly reject unsupported content before writes; not every block can be edited. Signed-in browser/cross-device acceptance remains unverified.
6. [x] **Implemented — Immutable publications.** [lessonVersions](../convex/learnModel.ts), [publish](../convex/lessons.ts) and [lifecycle tests](../tests/integration/learnLessons.test.ts) separate snapshots from drafts.
7. [ ] **Partial — Publication validation.** [lessons](../convex/lessons.ts) validates references, access, blocks and mappings; remote media existence/playability is not verified merely by URL/video-ID validation.
8. [x] **Implemented — Restore versions.** [restoreVersion](../convex/lessons.ts) creates a revisioned draft and recovery snapshot while preserving history.
9. [x] **Implemented — Revision conflicts.** [lessons](../convex/lessons.ts) returns expected/current revision and comparison state; [tests](../tests/integration/learnLessons.test.ts).
10. [x] **Implemented — Source model.** [learnSources](../convex/learnSources.ts), [source schema](../convex/learnModel.ts) cover uploads, URLs, videos and references with stable ownership/access/provenance.
11. [x] **Implemented — Source locations.** [citation validators](../convex/learnModel.ts) support page, slide, time range and section references.
12. [x] **Implemented — Metadata/content separation.** [learnSources](../convex/learnSources.ts) independently checks metadata and content grants; [tests](../tests/integration/learnSources.test.ts).
13. [ ] **Partial — Secure file lifecycle.** [learnSources](../convex/learnSources.ts) validates bounded uploads/signatures, storage ownership, revocable downloads and failed-upload cleanup; complete retention/purge operations and live upload acceptance remain unconfirmed.
14. [x] **Implemented — Source provenance.** [learnSources](../convex/learnSources.ts) retains uploader, upload time and origin independently of editable display metadata.
15. [x] **Implemented — Folder schema.** [folderModel](../convex/folderModel.ts), [folders](../convex/folders.ts) persist generic organization server-side; UI sync wiring is separate.
16. [x] **Implemented — Safe nested folders.** [folderServices](../convex/folderServices.ts), [tests](../tests/integration/learnFolders.test.ts) enforce cycles/depth/bounded moves.
17. [x] **Implemented — Generic membership.** [folderModel](../convex/folderModel.ts) supports form, quiz, lesson, source and collection references through one membership system.
18. [x] **Implemented — Collections.** [learnCollections](../convex/learnCollections.ts), [asset tests](../tests/integration/learnAssets.test.ts) implement ordered drafts and immutable public snapshots distinct from folders.
19. [x] **Implemented — Flexible curriculum graph.** [curriculumModel](../convex/curriculumModel.ts), [curricula](../convex/curricula.ts) separate institution/program/version and typed/custom nodes.
20. [x] **Implemented — Curriculum versions.** [curricula](../convex/curricula.ts) keeps distinct version identities and historical lesson mappings.
21. [x] **Implemented — Many-to-many mappings.** [curricula](../convex/curricula.ts) links lessons to nodes rather than assigning curriculum ownership.
22. [x] **Implemented — Coverage mappings.** [curricula](../convex/curricula.ts) records block/concept coverage; publication validates mapping references.
23. [x] **Implemented — Canonical administration.** [curricula](../convex/curricula.ts) has administrator writes and alias resolution; actual directory curation is an operational task.

## Community, lineage and discovery (24–47)

24. [x] **Implemented — Separate community state.** [learnModel](../convex/learnModel.ts), [community moderation](../convex/learnCommunity.ts) separate visibility/review restrictions from immutable lesson content.
25. [ ] **Partial — Student verification.** [identity claims](../convex/learnCommunity.ts) store reviewed affiliation claims; real verification procedure/evidence-minimization acceptance is not established by the record model.
26. [ ] **Partial — Educator verification.** [identity claims](../convex/learnCommunity.ts) distinguish educator/student roles and reviews; operational provenance, renewal and expiry policy need verification.
27. [x] **Implemented — Identity versus quality.** [community model](../convex/learnCommunityModel.ts), [reviewIdentity/reviewQuality](../convex/learnCommunity.ts) use separate records.
28. [x] **Implemented — Moderation reports.** [learnCommunity](../convex/learnCommunity.ts), [source moderation](../convex/learnSourceModeration.ts) provide structured queues and histories.
29. [ ] **Partial — Moderation actions.** [learnCommunity](../convex/learnCommunity.ts) supports content restrictions/restoration; [admin](../convex/admin.ts) handles account restrictions. Complete integrated warning/ban/content-action workflow is not confirmed.
30. [ ] **Partial — Takedowns.** [learnSourceModeration](../convex/learnSourceModeration.ts), [tests](../tests/integration/learnSourceModeration.test.ts) implement disable/reason/appeal/audit; legal intake, notice and operator workflow remain external requirements.
31. [x] **Implemented — Community audit history backend.** [publication audit](../convex/learnPublicationAudit.ts) records lesson create/publish/restore/lifecycle/fork actions transactionally through [shared lesson services](../convex/lessons.ts), with actor, revision/version, visibility and reason. Collection creation/publication and flashcard lifecycle history supplement [community moderation](../convex/learnCommunity.ts) and [source audit](../convex/learnSourceModeration.ts). [Audit tests](../tests/integration/learnPublicationAudit.test.ts) cover conflict rollback, owner/admin-only reads and fork isolation. This is asset history, not an organization-wide audit or live operator acceptance.
32. [x] **Implemented — Bounded duplicate-source detection.** [learnSources](../convex/learnSources.ts) retains exact same-owner private SHA-256 deduplication and adds server-computed [byte fingerprints](../convex/sourceFingerprint.ts), linking one qualifying same-owner active candidate for review without merging or copying grants. [Tests](../tests/integration/sourceNearDuplicates.test.ts) cover near/exact/unrelated matches, cross-owner isolation and MCP/API/context redaction. [Contract](source-near-duplicates.md) documents sampling, thresholds and false-positive/false-negative limits; semantic/re-encoded equivalence and live PDF/slide effectiveness are unverified.
33. [x] **Implemented — Lesson forks.** [lessons.fork](../convex/lessons.ts) preserves parent asset/version and origin.
34. [x] **Implemented - Quiz fork model.** Immutable form versions and classic quiz snapshots retain creator/version lineage in convex/quizForks.ts; focused fork tests pass.
35. [x] **Implemented - Multigeneration lineage.** Lesson and quiz fork records preserve parent and root identities with bounded lineage checks; quizForks tests cover repeated forks.
36. [x] **Implemented — Lesson fork copy/reference rules.** [lessons](../convex/lessons.ts) copies an immutable document while citations/quiz IDs remain independently permissioned references; parent draft edits do not mutate the copy.
37. [x] **Implemented — Lesson assessments.** [attachAssessment/listAssessments](../convex/learnCollections.ts), [asset model](../convex/learnAssetModel.ts) reference existing assessment identities without duplicating data.
38. [ ] **Partial — Learn-to-Live compatibility.** [live](../convex/live.ts) retains existing eligibility/snapshot logic; a complete lesson-to-game journey and compatibility acceptance are unverified.
39. [x] **Implemented** - Independent flashcard assets, version-pinned study evidence/review schedules and lesson attachment lifecycle are implemented in flashcards.ts and flashcardStudy.ts; 10 backend tests pass. Frontend review wiring remains separate.
40. [ ] **Partial — Meaningful views.** [recordView](../convex/learnCommunity.ts) deduplicates authenticated views; engagement duration is self-reported, and automation/attention abuse acceptance remains outstanding.
41. [x] **Implemented — Saves.** [setSignals/getMySignals](../convex/learnCommunity.ts) persists idempotent per-user saves.
42. [x] **Implemented — Helpful feedback.** [setSignals](../convex/learnCommunity.ts) updates per-user signals and transactional aggregates rather than unlimited votes.
43. [x] **Implemented - Explainable bounded ranking.** Published curriculum relevance, current-version quality reviews and capped open-report caution supplement engagement/freshness/exploration. Identity verification deliberately adds no quality points. See [contract and verification](learn-discovery-contract.md); global coverage and production ranking quality remain unverified.
44. [x] **Implemented — Anti-entrenchment ranking.** [rank](../convex/learnCommunity.ts) includes freshness/exploration; real-world ranking quality is unverified.
45. [x] **Implemented - Public multi-entity discovery.** Indexed institution/program/module/subject names, creator username prefixes/display names, and published tags are available in [learnDiscovery](../convex/learnDiscovery.ts). Bounded candidate coverage and matching semantics are explicit in the [contract](learn-discovery-contract.md).
46. [x] **Implemented — Indexed lesson text.** [learnSearch](../convex/learnSearch.ts), [search tests](../tests/integration/learnSearch.test.ts) use published content and bounded matching snippets, excluding private drafts.
47. [ ] **Deferred — Semantic search.** No permission-aware embedding/index pipeline found; explicitly later.

## Learning intelligence and optional AI (48–67)

48. [x] **Implemented — Stable concepts.** [learnCommunityModel](../convex/learnCommunityModel.ts), [createConcept](../convex/learnCommunity.ts) define lesson-independent concepts.
49. [x] **Implemented — Block concepts.** [mapConcept/getConceptMappings](../convex/learnCommunity.ts) and block concept IDs locate relevant sections.
50. [x] **Implemented — Question concepts.** [learnPractice.mapField](../convex/learnPractice.ts), [practice model](../convex/learnPracticeModel.ts) map immutable form-version fields to concepts; classic-question records also have community mappings.
51. [x] **Implemented — Evidence-based state.** [learnPractice](../convex/learnPractice.ts), [learnCommunity](../convex/learnCommunity.ts) distinguish exposure, graded evidence, accuracy, confidence and recency.
52. [x] **Implemented — Durable lesson progress wiring.** [useProgress/setProgress hooks](../lib/learn/data.ts) read shared Convex progress and write through [DurableProgressClient](../lib/learn/durableClient.ts) to [getProgress/startSession/completeBlocks](../convex/learnCommunity.ts). Targets are pinned to published versions, writes are queued and a client refuses to borrow another device's newer session. [Integration tests](../tests/integration/learnDurableClient.test.ts) verify percentage completion and repeated stale-session refusal. Reset is explicitly unsupported and preserves prior evidence. This is shared stored reading progress, not offline merge/mastery inference; signed-in multi-device/browser acceptance remains unverified.
53. [ ] **Partial — Conservative mastery inference.** [conceptStates/ingestResponse](../convex/learnPractice.ts) derives explainable weakness from server grading; ingestion is explicit opt-in, not an automatic complete study-history pipeline.
54. [x] **Implemented - Review scheduling backend.** learnPractice.reviewSchedule uses recency and verified grading, bounded conservative intervals and explanations; practice tests pass.
55. [x] **Implemented — Targeted practice selection.** [selectPractice](../convex/learnPractice.ts), [tests](../tests/integration/learnPractice.test.ts) select permitted form-version question references using weak concepts/history; scheduled/code-gated assessments are excluded from this bounded implementation.
56. [x] **Implemented** - Controlled context includes explicitly selected source excerpts with independent content authorization and immutable curriculum mapping context. learnContextBoundaries tests cover omitted, unrelated and revoked content.
57. [ ] **Pending — Tutor pedagogy policy.** Local prompt/handoff text is not a complete enforced teaching policy.
58. [ ] **Pending — Source-grounded answers.** Context selection exists, but no statement-level grounding/answer attribution system is delivered.
59. [ ] **Partial — Outside-knowledge separation.** [context boundaries](../convex/learnContext.ts) exclude outside knowledge from input; answer-side separation cannot be guaranteed without a Tutor implementation.
60. [ ] **Pending — Multimodal Tutor.** Image/diagram lesson blocks exist; authorized multimodal model input/video context is not implemented.
61. [ ] **Pending — Provider abstraction.** No Learn provider-neutral Tutor service found; retired legacy AI files do not satisfy this requirement.
62. [ ] **Partial — External AI packages.** [handoff](../lib/learn/handoff.ts) provides editable selected text; durable authorized context assembly is not fully connected to that client flow.
63. [ ] **Partial — AI data boundaries.** [learnContext](../convex/learnContext.ts), [boundary tests](../tests/integration/learnContext.test.ts) exclude unrelated/private context; complete provider/export boundary coverage remains pending.
64. [ ] **Pending — Lesson-generation jobs.** No Learn source-to-draft generation/retry/progress pipeline found.
65. [ ] **Pending — Selection-to-quiz generation.** No durable selected-block generation service producing normal quiz drafts with provenance found.
66. [ ] **Pending — Lesson-to-quiz generation.** Assessment attachment exists; full lesson generation is not implemented.
67. [ ] **Deferred — Selection-to-flashcards.** Independent card assets exist; generation is explicitly later and absent.

## MCP (68–97)

68. [ ] **Partial — Asset-oriented MCP.** [Learn](../lib/mcp/learn.ts) and [organization tools](../lib/mcp/organization.ts) broaden the surface; not every asset/capability uses a unified complete contract.
69. [x] **Implemented — search_lessons.** [tool](../lib/mcp/learn.ts), [backend](../convex/mcpLearn.ts) provide owned/public cursor pagination and permission checks.
70. [x] **Implemented — get_lesson.** [mcpLearn](../convex/mcpLearn.ts) supports bounded draft/published reads with access checks.
71. [x] **Implemented — get_lesson_outline.** [tool](../lib/mcp/learn.ts) returns lightweight paginated structure.
72. [x] **Implemented — get_lesson_sources.** [tool/backend](../convex/mcpLearn.ts) independently authorizes metadata and excludes source bytes.
73. [x] **Implemented — create_lesson.** [tool](../lib/mcp/learn.ts) creates private manual drafts without AI or publication.
74. [x] **Implemented — add_lesson_blocks.** [tool](../lib/mcp/learn.ts) appends validated blocks with revision protection; positioning is via move or atomic edit batch.
75. [x] **Implemented — update_lesson_blocks.** [mcpLearn](../convex/mcpLearn.ts) updates specific stable IDs with revision checks.
76. [x] **Implemented — move_lesson_blocks.** [mcpLearn](../convex/mcpLearn.ts) reorders with mandatory revision guards against stale retries.
77. [x] **Implemented — delete_lesson_blocks.** [tool](../lib/mcp/learn.ts) has explicit destructive annotation and revision-protected semantics.
78. [ ] **Partial — MCP media operations.** [block tools](../lib/mcp/learn.ts) accept media/diagrams/YouTube/source references; source upload/content registration through MCP is not delivered.
79. [x] **Implemented — publish_lesson.** [tool](../lib/mcp/learn.ts) is explicit, owner-only and separate from edits.
80. [x] **Implemented — Archive/unpublish.** [set_lesson_lifecycle](../lib/mcp/learn.ts) is revision-protected and annotated destructive/open-world.
81. [x] **Implemented - Version inspection/restore MCP.** list_lesson_versions and get_lesson_version enforce bounded reads and historical audience checks; restoration remains revision protected.
82. [x] **Implemented — Folder tools.** [organization](../lib/mcp/organization.ts), [mcpOrganization](../convex/mcpOrganization.ts) list/create/move/list contents and validate actor ownership.
83. [ ] **Partial — Curriculum tools.** [organization](../lib/mcp/organization.ts) browses institutions/programs/versions/nodes; complete mapping reads and natural module lookup remain incomplete.
84. [x] **Implemented — Curriculum mapping writes.** [mcpOrganization](../convex/mcpOrganization.ts) delegates owned lesson writes to shared curriculum validation.
85. [x] **Implemented - Community directory MCP/API.** `search_learn_directory` and the version-2 community directory endpoint reuse native discovery with trusted actor/token checks; local transport tests cover active-account and scope boundaries. See [contract](learn-discovery-contract.md); deployment acceptance remains unverified.
86. [x] **Implemented** - save_lesson is registered in lib/mcp/community.ts and dispatched through the shared idempotent community signal service; no duplicate vote/save rows.
87. [x] **Implemented — Fork lesson MCP.** [fork_lesson](../lib/mcp/learn.ts) copies permitted published versions with lineage and independent source access.
88. [x] **Implemented - Fork quiz MCP.** quizForks:mcpFork preserves immutable source snapshots and lineage; registration and backend tests pass.
89. [ ] **Partial ? Lesson quiz operations.** Shared assessment links and linked Live preparation are implemented and tested; AI assessment generation remains unfinished.
90. [x] **Implemented** - Revision-checked set_form_branching edits native draft rules, preserves other content and refuses invalid references; mcpAdvancedForms tests cover conflicts and unauthorized calls.
91. [x] **Implemented** - upsert_form_file_question exposes existing upload-question policy and bounded file counts through MCP, preserving branching/order and refusing replacement of another field type.
92. [x] **Implemented - Response-control MCP.** Shared native settings policy enforces access, dates, caps, one-per-person, retention, editing, email restrictions and branding entitlement with revision conflicts.
93. [x] **Implemented - Advanced analytics MCP.** Native shared calculations return bounded aggregates without individual written responses or answer keys; management tests pass.
94. [x] **Implemented - Export MCP.** Bounded CSV/XLSX/JSON artifacts expire after 24 hours; sensitive bearer downloads and non-snapshot pagination are explicit.
95. [x] **Implemented - Collaboration MCP.** Owner-only recipient/role changes require a membership snapshot and carry destructive/open-world annotations; stale and unauthorized tests pass.
96. [ ] **Partial — MCP parity audit.** [capability matrix](capability-matrix.md) exists but has stale sections and outstanding gaps; systematic closure is incomplete.
97. [ ] **External verification — Deployed MCP/docs alignment.** Source registrations/tests do not verify production discovery, ChatGPT submission or all published documentation.

## Integrations (98–115)

98. [x] **Implemented** - Versioned Learn integration routes cover lessons, selected source metadata, folders, curricula, community and controlled progress/context through shared backend permissions.
99. [x] **Implemented — Editor-independent API.** [v2](../convex/learnIntegrations.ts) validates Chaos blocks, not raw BlockNote internals.
100. [x] **Implemented — API v2 strategy.** [HTTP registration](../convex/http.ts) mounts separate v1/v2 routes and retains old contracts.
101. [x] **Implemented — Lesson reads.** [getLesson](../convex/learnIntegrations.ts) returns selected metadata/definition/outline under token and asset permissions.
102. [x] **Implemented — Draft creation.** [createDraft](../convex/learnIntegrations.ts) creates private manual/content-seeded drafts with idempotency.
103. [x] **Implemented — Block updates.** [updateDraft](../convex/learnIntegrations.ts) supports block operations with If-Match and idempotency checks.
104. [x] **Implemented** - learnOrganizationIntegrations exposes scoped folder listing/create/move/membership operations with retry and ownership tests.
105. [x] **Implemented** - learnOrganizationIntegrations exposes curriculum browsing and owned lesson mappings with version/reference validation and least-privilege scope tests.
106. [x] **Implemented** - learnCommunityIntegrations exposes permitted public search, idempotent saves and provenance-preserving forks with token revocation/selection checks.
107. [x] **Implemented** - learnStudyIntegrations reads/writes sequenced version-aware progress using the same native identity key and stale-device conflict rules.
108. [x] **Implemented** - learnStudyIntegrations assembles selected context with explicit content boundaries; curriculum/excerpt opt-ins preserve independent source and scope checks.
109. [x] **Implemented — Draft-only publishing boundary.** [v2](../convex/learnIntegrations.ts) has no publish operation; lessons:update cannot publish.
110. [x] **Implemented** - Learn scopes are independently enforced and negotiated for lessons, sources, folders, curricula, community, progress and controlled context. Legacy all-assets grants do not inherit Learn access.
111. [x] **Implemented** - API v2 advertises actual operations, schema version, selected access, scopes and shared enforced limits; MCP and API limit-parity test passes.
112. [ ] **Partial ? Learn webhooks.** Metadata-only lesson/collection/mapping events share signed retry transport with selection/revocation checks; draft commit hook tested. Connection collection scope and newly forked asset subscriptions remain limited.
113. [x] **Implemented — Persistent external provenance.** [lessons.externalOrigin](../convex/learnModel.ts), [createDraft](../convex/learnIntegrations.ts) retain connection/source origin after unlink.
114. [x] **Implemented — Unlink without deletion.** [unlinkLesson](../convex/learnIntegrations.ts), [contract tests](../tests/integration/learnIntegrations.test.ts) remove linkage rather than asset content.
115. [x] **Implemented — No generic hard delete.** [v2 router](../convex/learnIntegrations.ts) exposes unlink, not asset deletion.

## Forms, Live and provider integrations (116–134)

116. [x] **Implemented — Typed hidden URL parameters backend.** Bounded string/number/boolean metadata is strictly validated and preserved through submission/branching, exports, scoped webhooks, segment analytics and MCP response controls/response reads. [Regression tests](../tests/integration/typedHiddenParameters.test.ts) cover legacy compatibility, typed persistence and unauthorized MCP access. Signed-in browser acceptance remains separate.
117. [x] **Implemented — Verified address/domain access.** [form settings](../convex/formModel.ts), [respondent policy](../convex/formRespondent.ts), [respond](../convex/respond.ts) enforce server-side email restrictions; live identity-provider behavior needs acceptance.
118. [x] **Implemented - Question import parser/backend.** CSV/XLSX imports return precise row/column errors, enforce size limits and create or revision-update normal quiz drafts atomically; nine tests pass.
119. [x] **Implemented — Branding entitlement.** [respond](../convex/respond.ts) checks current owner Pro entitlement before honoring hide-branding settings.
120. [x] **Implemented - Cross-tab backend.** Fixed bounded response cohort, single-choice/numeric/status/language comparisons and complementary small-cell suppression; five segment/funnel tests pass.
121. [x] **Implemented - Funnel backend.** Branch eligibility and completed/partial answer paths are inferred from immutable versions and saved answers; response navigation impressions are not measured.
122. [x] **Implemented - Live team backend.** Host-only teams, authenticated membership/reconnects, frozen membership and authoritative score/tie aggregates; five tests pass. UI acceptance remains separate.
123. [x] **Implemented — Pinned homework backend.** [homework](../convex/homework.ts) delivers the assignment's pinned version through an owned pending attempt, strips answer keys/explanations/option scores and enforces enrollment, opening/deadline, attempt limits, field release and moderation. Atomic submission grades the pinned version once and preserves retry evidence after republishing. [Tests](../tests/integration/homework.test.ts) verify pinned delivery, unauthorized/revoked/closed/late reads, release filtering, grading and retries. Student UI and live delivery acceptance remain unverified.
124. [x] **Implemented** - Scheduled section/question release. Optional releasesAt timestamps are enforced using the server clock for public reads, submissions, edits, resume and uploads; published history remains immutable. Focused release tests passed.
125. [ ] **Pending — Google Sheets live sync.** No provider OAuth/mapping/retry/revocation service found; external app registration, credentials and real sheet acceptance required.
126. [ ] **Pending — Excel live sync.** No Microsoft Graph sync lifecycle found; external tenant/app consent and real workbook acceptance required.
127. [ ] **Pending — Zapier integration.** Generic API/webhooks exist; Zapier triggers/actions/package and provider validation are not established.
128. [ ] **Pending — Make integration.** Generic API/webhooks exist; a productized Make connector and live scenarios are absent.
129. [ ] **Deferred — HubSpot.** Explicitly later; needs CRM mapping, credentials and real contact/lead acceptance.
130. [ ] **Deferred — Mailchimp.** Explicitly later; needs consent/field mapping and provider account verification.
131. [ ] **Deferred — Notion.** Explicitly later; needs explicit sync/conflict semantics and real workspace verification.
132. [ ] **Deferred — Google Classroom.** Explicitly later; needs OAuth course ownership, assignment and grade-sync verification.
133. [ ] **Deferred — Teams Education.** Explicitly later; needs Microsoft education permissions and tenant acceptance.
134. [ ] **Deferred — LTI/LMS evaluation.** Adoption-gated; no completed Moodle/Canvas/Blackboard feasibility/acceptance evidence found.

## Platform operations and governance (135–156)

135. [x] **Implemented** - Payments architecture design. Provider-neutral billing reconciliation and refund/dispute entitlement policy are tested in lib/billingPolicy.ts; docs/payments-architecture.md records persistence/provider boundaries. Accounts and live billing are deferred to GitHub issue #2.
136. [ ] **Pending — Custom domains.** Existing host/link configuration is not customer DNS verification, SSL provisioning, routing and abuse controls; external DNS/operator setup required.
137. [ ] **Deferred — True offline merge.** [local Learn storage](../lib/learn/data.ts) and recovery are not multi-device offline reconciliation.
138. [ ] **Deferred — Self-hosted auth abstraction.** [auth configuration](../convex/auth.config.ts) remains Clerk-based; no supported alternate-provider identity contract found.
139. [ ] **Deferred — Workspaces/organizations.** Demand-gated; per-form collaboration is not organization ownership/billing boundaries.
140. [ ] **Pending — Organization audit log.** Asset/admin histories exist, but no organization-wide security-event model/service found.
141. [ ] **External verification — Formal accessibility audit.** Accessibility tests exist; no completed WCAG audit/remediation evidence and defensible statement established by this inspection.
142. [ ] **Partial — GDPR lifecycle.** [data lifecycle](data-lifecycle.md), existing deletion/retention/export services cover subsets; account-wide request handling, Learn/source lifecycle and legal-commitment alignment are not proven.
143. [ ] **Deferred — Data residency.** Conditional on demand; technically enforced location guarantees/operator evidence absent.
144. [ ] **Deferred — SOC 2 readiness.** Explicitly later; requires an operational/security program and external evidence, not feature tests.
145. [ ] **Partial — Observability/SLOs.** Admin analytics and liveness exist; service-level metrics, alerting and measurable objectives across Learn/MCP/API/jobs are not established.
146. [x] **Implemented** - GET /api/status/v1 exposes bounded observed health and explicit expiring incidents from observability.ts, without private counts/reasons/identities.
147. [ ] **External verification — Forms load test.** No sustained/burst capacity report or production-like load harness found; ordinary correctness tests do not establish limits.
148. [ ] **External verification — Live load test.** [Live tests](../tests/integration/live.test.ts) exercise correctness; realistic room/player/timer concurrency and capacity report remain outstanding.
149. [ ] **Partial ? Learn read load test.** Real development indexed search baseline: 100 successful requests at concurrency five, p95 201 ms. Representative published lesson corpus and sustained capacity tests remain unfinished.
150. [ ] **External verification — MCP/API load.** Rate-limit code is not measured burst/backpressure/failure behavior; dedicated load evidence missing.
151. [ ] **Partial — Large lessons.** [validation/search tests](../tests/integration/learnSearch.test.ts) cover limits; hundreds-of-blocks editor/render/API performance acceptance is absent.
152. [ ] **Partial — Large sources.** [upload policy/tests](../tests/integration/learnSources.test.ts) cover bounded validation; real near-limit PDF/slide processing and throughput acceptance remain outstanding.
153. [ ] **Partial — Learn abuse protection.** Ownership, upload bounds, moderation and deduplicated signals exist; comprehensive publishing/scraping/bot protections and abuse verification remain incomplete.
154. [ ] **Pending — AI cost/abuse controls.** No Learn Tutor/generation quota, cost telemetry or provider failure policy implemented; legacy retired AI controls do not satisfy this item.
155. [ ] **Partial — MCP hardening.** [mcp](../convex/mcp.ts), [Learn tools](../lib/mcp/learn.ts), [MCP tests](../tests/integration/learnMcp.test.ts) cover actor/ownership/revisions/annotations; full expanded parity and deployed confirmation boundaries remain unverified.
156. [ ] **Partial — Integration security.** [v2](../convex/learnIntegrations.ts), [tests](../tests/integration/learnIntegrations.test.ts) cover token/asset/scopes/conflicts; source-content endpoints and complete expanded API security do not exist yet.

## Migration, compatibility and proof (157–170)

157. [ ] **Partial — Learn rollout migration.** [additive schema](../convex/schema.ts), [migration guidance](migrations.md) preserve old tables; Learn launch/backfill/rollback rehearsal and production-scale preservation remain outstanding.
158. [x] **Implemented — Classic quiz compatibility.** [quizFunctions](../convex/quizFunctions.ts), [legacy tests](../tests/integration/legacyData.test.ts) retain old records/read fallbacks; production acceptance is separate.
159. [ ] **Partial ? Schema migration strategy.** Read-copy migration registry validates adjacent transforms, rejects mutation/unsupported paths and retains v1 readers. Future schema migration and deployment rehearsal must accompany each new schema version.
160. [x] **Implemented — Integration v1 compatibility.** Separate [v1](../convex/integrations.ts)/[v2](../convex/learnIntegrations.ts) handlers preserve existing forms semantics; actual older Max-client acceptance remains external.
161. [x] **Implemented — MCP compatibility.** [server registration](../lib/mcp/server.ts) adds Learn/organization tools without replacing old form tools; [server tests](../tests/unit/mcpServer.test.ts) cover registrations, not deployed client acceptance.
162. [ ] **Partial — Cross-surface matrix.** [capability matrix](capability-matrix.md) exists but is stale and actual Max surface remains unaudited; no fully current shared source of truth yet.
163. [ ] **Partial — Cross-surface contracts.** [MCP contract tests](../tests/unit/mcpContract.test.ts), [Learn API tests](../tests/integration/learnIntegrations.test.ts), [adapter tests](../tests/unit/lessonBlockAdapter.test.ts) cover subsets; UI still uses local data and full schema parity is not verified.
164. [x] **Implemented** - Complete backend lifecycle test. tests/integration/learnLifecycle.test.ts drives draft/edit/publish/fork/assessment/curriculum mapping, validates lineage and parent immutability and rejects cross-owner writes.
165. [x] **Implemented** - learnIntegrationLifecycle.test.ts verifies token creation, draft creation/update/conflict, external provenance, synchronized progress and unlink-without-delete independently of Max UI.
166. [x] **Implemented — Learn MCP tests.** [learnMcp](../tests/integration/learnMcp.test.ts), [organization](../tests/integration/learnOrganizationMcp.test.ts) cover actor/ownership/revisions/publication/forks and organization policies; live transport is separate.
167. [x] **Implemented — Moderation tests.** [community](../tests/integration/learnCommunity.test.ts), [source moderation](../tests/integration/learnSourceModeration.test.ts) cover restrictions/takedowns/appeals/restores without deleting history.
168. [ ] **Partial — Tutor grounding tests.** [learnContext tests](../tests/integration/learnContext.test.ts) exercise private-context boundaries; unsupported answer claims cannot be tested until grounded Tutor output exists.
169. [ ] **Partial — Platform limits.** [Learn](../convex/learnModel.ts), [folder](../convex/folderModel.ts), sources/curricula/practice services enforce many bounds; every object/fork/operation limit and realistic capacity rationale are not complete.
170. [ ] **Partial — Discoverable limits.** [v2 capabilities](../convex/learnIntegrations.ts) exposes blocks/document bytes/sources and tools declare per-call bounds; full folder/file/mapping/fork/progress limit discovery through MCP/API is incomplete.

## Requirements outside this documentation task

The implementation owner must finish pending/partial items, resolve conditional and AI scope decisions, and separately collect external evidence. In particular: real Max access and cross-product journeys; provider app registrations, secrets, consent and test accounts; customer DNS/certificates; operator verification/moderation/legal processes; production-like load infrastructure; accessibility/privacy/security audits; rollout/rollback rehearsals; and deployed MCP discovery/ChatGPT submission checks. None are marked done merely because a schema, mock test or document exists.

This bounded follow-up changed only this roadmap and source similarity/context documentation. It made no code changes, commits, pushes or deployments. Re-audit changed implementations before promoting any status or declaring all 170 complete.

## Combined local/development verification (2026-10-01)
The combined e2e-parent snapshot passes 641 unit tests, 630 integration tests (one TODO), app/backend typechecks and whole-tree lint. The production webpack build passed before the final async caller/descriptor fixes, which subsequently passed focused regressions and typechecks. Deployment to personal development superb-zebra-196 succeeded; anonymous invalid lesson reads return null. Vercel preview requires login, so signed-in browser and production acceptance remain unverified. The current inventory is 105 source-implemented items and 65 unfinished; provider setup remains GitHub issues #1–#3 and AI expansion remains excluded.
