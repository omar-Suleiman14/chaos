# PR 17/33 — Durable Exam Answer Autosave & Reconnection Recovery

Stacked on PR #393 (student preview). The live exam start API remains **hard-disabled**. No real question delivery or student submission is introduced.

## Implementation
- One authoritative Convex row per attempt/question, keyed by attempt and question index. Mutations are scoped to the authenticated candidate; repeated approval, release, snapshot, schedule and consent checks fail closed.
- Answer validation uses the sealed question's kind and permitted choice IDs without returning correct answers, private clinical images, or snapshot content.
- Compare-and-swap per-question revisions reject stale-tab writes. Stable mutation IDs allow safely retrying a request whose acknowledgment was lost; token reuse for different content is rejected. A server acknowledgment, never local state, defines "saved".
- Reads return only this candidate's versioned answers and save timestamps, with no question bank or marking keys.
- Client autosave hook provides debounced writes, truthful pending/saving/offline/conflict statuses, same-tab recovery from bounded sessionStorage drafts, and automatic retry on reconnect. The pending draft is always explicitly *unsaved* until server ACK.
- No new answer data is exposed through MCP; existing synthetic preview continues to be ephemeral.

## Safety and remaining release gates
Live attempt creation, timed attempt quotas, submission/finalization, protected question/R2 delivery, full doctor-role verification and inherited course/MCP authorization audits remain blocked. The hook is intentionally not mounted on the synthetic preview. A real attempt player should bind the hook only after secure question delivery and authorized attempt entry exist. SessionStorage drafts are transient and are not authoritative; access to the local browser profile must be protected. No merges or deployments.

## Next: PR 18/33
Server-authoritative timing and one-time protected submission: enforced window/deadline, minimum submit, timeout finalization, double-confirmation and durable receipts. Do not enable the runtime without the remaining security/release gates.
