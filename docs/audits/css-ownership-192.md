# CSS ownership audit — #192 (October 2026)

Scope: `app/globals.css`, `app/workspace.css`, `components/learn/learn.css`, and `components/forms/formThemes.css` at main `43cc040`.

- Global styles establish theme tokens and motion defaults. Workspace rules describe creator pages. Learn rules style the reader/editor. Form themes style respondent-specific presentation.
- Reviewed repeated selector/declaration matches in those four files. Most matches were **different keyframe steps or contextual overrides**; identical declarations alone do not prove a dead rule because the enclosing at-rule and cascade order matter.
- One confirmed redundant block existed in `learn.css`: two consecutive identical `@media (hover: none) { .lx-cover__actions { opacity: 1; } }` rules, separated only by a comment. The first is removed; the descriptive comment and one effective rule remain. Expected display, specificity, cascade precedence and RTL behavior are unchanged.
- No global-to-route CSS moves or other selector deletion was justified by this source-only audit. Do not treat this as proof that browser CSS coverage is zero. Use `pnpm perf:css`, `pnpm build`, browser coverage and EN/AR light/dark phone/desktop visual diff before further removals.

This audit deliberately does **not** change performance budgets or unrelated animations.
