---
name: Keep climbing (next bottleneck)
about: After a performance fix lands, ask for the next one on the same journey
title: "Next bottleneck: <journey>"
labels: perf-target
---

Follow-up to #<!-- the issue or PR that just landed -->.

**Journey:** <!-- dashboard, form-editor, quiz, lesson, course, live, card, mcp -->

**Where it stands now** (from the PR performance comment or `perf/baselines`):

<!-- e.g. lesson load p75 1.9 s, reader payload 84 KB, 212 components on mount -->

## Ask

1. Find the next bottleneck on this journey. Measure it first (`pnpm perf`,
   the Chromium suites or a profile), and name the metric that shows it.
2. Propose three options, with expected gain, risk and effort for each.
3. Include one unconventional approach: something that changes the shape of
   the work, not only its speed.
4. Implement the option I pick in a separate pull request. Correctness checks
   (`pnpm test:correctness`) must pass, and the harness stays untouched
   (`pnpm perf:guard`).

Not in scope: how the page looks or feels. Design calls stay with a person
(docs/performance-workflow.md, "Human taste stays human").
