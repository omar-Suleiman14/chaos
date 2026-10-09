# State illustrations

Six original drawings for Chaos's empty, error and not-found states, used through
`components/StateIllustration.tsx`.

| File | Use it when |
| --- | --- |
| `create.svg` | nothing has been made yet (a first form, quiz, course or card set) |
| `learn.svg` | there is nothing to study or read yet (lessons, folders, saved items) |
| `search.svg` | a search or filter hides everything |
| `error.svg` | something broke |
| `not-found.svg` | the page or item does not exist |
| `offline.svg` | the connection or a service is unavailable |

## Provenance and licence

Drawn by hand for Chaos as plain SVG paths in a text editor. No stock art, icon
set, generated image or traced artwork was used. They are part of this
repository and licensed with it under AGPL-3.0-or-later.

## Style

- 240 × 180 view box; the drawing sits on a soft ground shadow.
- Ink outlines (2.25 units, round caps) over flat colour fills that are shifted a
  few units off the outline, like a slightly misregistered print.
- Colours are the `--ill-*` tokens defined in `app/globals.css`, each with its
  light value as a fallback, so the files also render on their own:
  ink, paper, shade, accent (soft blue), warm (soft apricot), leaf (soft sage)
  and pop (the workspace blue, for small marks only).
- No text, no letters, no arrows that depend on reading direction, so one file
  serves English and Arabic without mirroring.
- No scripts, external references or embedded images. Keep each file under 4 KB;
  `tests/unit/stateIllustration.test.tsx` checks all of this.

Add a drawing only when none of the six fits the meaning of a state. Reuse beats
a one-off picture for a single page.
