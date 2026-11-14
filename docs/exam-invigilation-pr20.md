# Chaos Exam Mode — PR 20/33

## Teacher live monitor, incident adjudication, accommodations and interventions

Stacked on PR #396. **Draft only. No merge, deployment or live student entry.**

### Authorization and data minimization

- Convex validates the authenticated course owner, active account, owned exam draft and
  current sealed release for every teacher dashboard/report/write. IDs never grant permission.
- Candidate explanations and cases are accessible only to the candidate and instructor.
  No exam questions, marking keys, answers, browser screenshots, camera, audio,
  clipboard content or raw client timestamps enter these queries.
- Teacher overview is limited to 50 attempts per request. Reports are bounded to
  200 coarse events/cases and 120 audit entries per attempt. Further pagination is
  **not yet implemented**; the UI discloses the limitation.
- Candidate event explanations are short (10–500 characters), versioned, and can
  reopen human review; a teacher's review uses a compare-and-swap revision.
- Dispositions are `needs_review`, `no_action`, `follow_up` or `policy_issue`.
  **No automated misconduct finding or adverse action** is implemented.

### Manual interventions and accommodations

- The instructor may log a connectivity incident or candidate contact, with reason
  and time recorded by the server.
- An active timed attempt may receive an explicit 1–120 minute extension only if:
  it is not past deadline, the attempt revision still matches, the frozen maximum
  of 480 minutes from start is respected, and scheduled exam closing time is not
  exceeded. Pending double-submit confirmation is invalidated.
- A new deadline job is scheduled atomically; the former deadline job recognizes
  that it is stale and does nothing. Expired attempts cannot be reopened.
- Pre-start accommodations are per assigned, approved course candidate. Types:
  extra time, breaks permitted and reduced monitoring. Updates require compare-and-
  swap, are audit-recorded, and are visible to that student in preflight.
- **Important:** pre-start accommodation storage does not apply additional minutes
  or relaxed monitoring to an actual attempt yet: the authorized live-start transaction
  must freeze and apply the accommodation in a later PR. Attempts already active
  cannot be retroactively modified through this path.

### Privacy and appeals

- Raw telemetry expires in seven days (PR #396). Cases and intervention audit rows
  expire after 30 days, with scheduled cleanup and expiry-filtered reads. Accommodation
  configuration is retained with its assigned exam; its change audit expires in 30 days.
- Student explanations are displayed to the owner; the student can review their case
  disposition. The currently staged UI does not yet expose the student explanation
  form within the synthetic player; the secured real-attempt screen must wire it.
- This is review evidence only, not proof of intent or cheating. No hidden penalties,
  exam cancellation, auto-submission, grades or verdicts are triggered by the monitor.

### Rollout and verification gates

- Secure live entry, protected delivery, attempt quotas, student review UI and
  teacher monitor pagination are **not** enabled by this PR.
- Screenshot/accessibility and mobile keyboard checks still need real browser review.
- Verify static analysis, typecheck, unused-code checks, integration/unit suite,
  Chromium editor E2E, production build, screenshot workflow, and preview separately.
- Never interpret a blocked Vercel preview as a successful deployment.
