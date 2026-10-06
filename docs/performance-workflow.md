# Performance workflow

Chaos gets faster through measurements, issues and people choosing what to
fix. No model watches production or decides on its own.

## The loop

1. **Measure.** Budgets gate every pull request (`perf.yml`), the nightly run
   covers the slow suites and Chromium (`perf-nightly.yml`), and scheduled
   checks watch production: MCP every 6 hours (`mcp-synthetic.yml`), real users
   daily (`production-health.yml`), flags weekly (`flags.yml`). See
   [production monitoring](production-monitoring.md).
2. **Open an issue, not an alert.** A regression opens or updates one issue per
   journey (label `perf-regression`) with the benchmark, the old and new value,
   the commit, the run's traces and artifacts, and the affected page. A
   production threshold opens a `production-health` issue. Green runs close
   them.
3. **Hand it over when you want it fixed.** Give the issue to an agent (Opus,
   Astra, Sol). The issue already holds the target and how to reproduce it.
4. **Review the evidence.** Run "Performance budgets" (`perf.yml`, manual) on the branch; its comment on the pull request shows headline changes,
   for example "lesson load −18%", "dashboard payload +7%" or "React commits
   unchanged", together with the correctness verdict. The guard keeps the
   harness and budgets out of the same change.

## One optimisation issue per journey

`perf-targets.yml` (run it from the Actions tab) keeps one `Optimise: <journey>`
issue per journey (label `perf-target`) with the current budgets and the
real-user p75/p95 target from `perf/production-thresholds.json`. That gives an
agent a measurable target instead of a vague "make Chaos faster". Rerunning it
comments fresh numbers on the open issue.

## Keep climbing, by hand

When a fix lands and another round looks worth it, open the "Keep climbing"
issue template (or say it directly): find the next bottleneck, propose three
options, include one unconventional approach. This costs nothing between
rounds. Nothing keeps a model running in the background.

## Correctness before speed

A faster form editor that loses answers is a failure. So is a faster
publication that exposes drafts, or a faster cache that shows deleted content.
`pnpm test:correctness` runs before every measurement, and a failure fails the
perf run whatever the numbers say (perf/README.md).

## Human taste stays human

Automation measures movement, jank, payloads and waits. It does not decide
whether a design is good. These stay with a person:

- Flow and the quiz experience, `/card`, the course UI, loading states and the
  Forms UX;
- what a skeleton, transition or animation should feel like;
- whether a visual change is an improvement (`visual.yml` reports pixel
  differences; a person accepts or rejects them).

An agent may report "the card fan drops 12 frames at 120 Hz". It must not
decide on its own to remove the fan, shorten an animation or simplify a
layout to pass a budget. Propose it in the issue and let a person choose.
