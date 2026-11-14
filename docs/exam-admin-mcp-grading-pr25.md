# PR 25 — Administrator ChatGPT MCP review and rubric-grounded grading proposals

Stacked directly on draft PR 24/#401. Unmerged, undeployed, no autonomous AI execution.

## MCP workflows
1. Administrator lists metadata-only consented jobs via `list_admin_grading_jobs`, claims one through `claim_admin_grading_job` with revision guard.
2. Under the same authenticated admin account and an unexpired 15-minute claim, `get_admin_grading_bundle` returns only that attempt's pending written answers, frozen question/rubric and existing admin draft. Each read is audited.
3. In ChatGPT, administrator examines original answer and frozen criteria. `save_admin_grading_proposal` records **proposed** rubric scores, literal quote evidence (validated against exact student response text), rationale, uncertainty and optional model/prompt provenance. Proposals are revision-checked and never written into `examGrades` or `examEssayMarks`.
4. After every pending essay has one complete proposal, `submit_admin_grading_review` seals drafts and changes job state to `doctor_review`. **This does not approve or release grades.** Teacher approval/regrades/appeals are PR 26.
5. Stale claims can be requeued through the bounded `retry_admin_grading_job` tool. Every sensitive step checks the actual bound MCP admin account and active exam/grade relationships.

## Security and limits
- Admin permission scope `admin_operations`; private tools not advertised to students or non-admins; client `userId` is ignored by trusted transport.
- No unsupported external citations: evidence quotes must occur verbatim in the exam answer. Confidence is a human-entered label, not calibrated.
- No automatic prompts/model inference, no student-facing score, no auto-finalize and no auto-publish.
- No mobile/desktop admin UI or notifications in this slice; doctor approval and visible review packages require PR 26, notification delivery PR 29.
- Maximum response length 10,000 characters; otherwise fail closed. At most 100 pending questions per request.

## Acceptance before merge
Verify GitHub lint, static, type, unit, integration, Chromium, build, unchanged 268 performance budgets, MCP inventory/schema snapshots, admin identity spoof/claim race/expiry cases, real Arabic/English light/dark desktop/mobile screenshots and Vercel preview. Run a live OAuth admin MCP smoke test and security audit for course/R2/media/legacy source paths. No PR in this stack is approved for production yet.
