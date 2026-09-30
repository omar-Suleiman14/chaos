---
name: Task
about: Planned work with an outcome, acceptance criteria and verification (used by maintainers)
title: ""
labels: []
---

### Outcome

<!-- One or two sentences: what is true once this issue is done, stated as an
     observable result, not a list of steps. -->

### Current state

<!-- What exists at HEAD today, with real file/line references. This section
     is what makes an issue verifiable rather than aspirational — an
     assignee should be able to check every claim here against the code
     before writing anything. -->

### Work

<!-- The concrete things to build or change. -->

### Non-goals

<!-- What this issue deliberately does not do, especially anything a reader
     might otherwise assume is included. -->

### Acceptance criteria

<!-- A checklist of specific, verifiable conditions. -->

- [ ]

### Verification

**Automated**
<!-- What a test suite or CI check proves. -->

**Manual**
<!-- What a human needs to actually click through or run. -->

---
*Workflow:* inspect the current `main` before writing code, and open a pull
request that links this issue. If `main` already satisfies the issue or the
issue has become wrong, say so in a comment instead of writing duplicate code.
A maintainer reviews and merges.
