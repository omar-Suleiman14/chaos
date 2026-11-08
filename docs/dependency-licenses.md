# Dependency licenses

`pnpm licenses:check` (`scripts/license-audit.ts`, run in CI) lists every runtime dependency and
fails when one uses a license that is not on its allowed list or was not reviewed. Chaos is
AGPL-3.0-or-later; the allowed licenses (MIT, ISC, Apache-2.0, BSD, 0BSD, Unlicense, CC0, MPL-2.0
and combinations of these) can be distributed with it.

Reviewed exceptions:

| Package | License | Why it is accepted |
| --- | --- | --- |
| khroma | none declared | MIT according to its LICENSE file. Used by Mermaid. |
| elkjs | EPL-2.0 | File-level copyleft. Used unmodified as a separate module (Mermaid's layout engine); its source is public. Changes to elkjs itself would have to be published under EPL-2.0. |
| caniuse-lite | CC-BY-4.0 | Browser support data used at build time; the package keeps its attribution. |

When the check fails, review the new license before adding it to `ALLOWED` or `REVIEWED` in the
script. This is not legal advice; ask a lawyer about anything unclear.
