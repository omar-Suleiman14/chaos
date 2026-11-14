# PR 07/32: Images in Forms & Quizzes

**Status:** Draft only. Stacked on #383. No production rollout.

## Authoring and presentation

Question images, individual choice/answer images, and explanation images accept
HTTPS image addresses and alternative text. The form builder includes a
browser-side **Upload image to R2** control for each position. The client
reserves a form-specific image, uploads the file with its one-shot signed R2
PUT URL, and calls the server to verify its size, type, ETag and image signature.
Only PNG, JPEG, or WebP files up to 5 MiB are accepted. Never use a public
Cloudflare bucket or expose read credentials to browsers.

Question/choice images are in the published form definition, and quiz
explanation images are in the private answer key. Quiz explanations and their
image URLs appear only after submission when **Show answers** is enabled.
This change does not make pre-submission answer keys readable.

## Read authorization boundaries

Every request to `/forms/images/content` rechecks the image state and current
form/version reference. Only a published, live, public-access form that is
inside its schedule serves question/choice images, and only for released
questions. Unknown IDs, drafts, closed forms, removed uploads, blocked authors,
and private or code-gated forms fail closed.

**Limited functionality:** image references in forms requiring sign-in,
access codes, or responses after manual closure will not load through the new
anonymous image proxy. Those access models need a separate, scoped media-token
design. Never solve this by exposing presigned GETs, leaking an access code in
an image URL, or weakening form authorization.

An explanation-image read requires a completed response ID and matching
receipt code as a bearer proof, and the image must belong to that immutable
response version. Receipt URLs can be shared, so treat them as sensitive.
A future design should use expiring scoped capabilities, not permanent URLs.

External HTTPS URL images remain supported for compatibility but are **not**
stored in private R2 and can expose a browser's request metadata to a third
party. Production courses and examinations should avoid external image links.

## R2 setup (not yet completed)

- Configure the private R2 bucket and scoped credentials documented in
  `docs/course-r2-media.md`. Keep all secrets in server environment variables.
- Configure bucket CORS for trusted form-builder origins allowing PUT and
  request headers `Content-Type` and `If-None-Match`; do not allow public reads.
- Run an authenticated browser upload and verification smoke test using a
  real private R2 bucket before enabling the uploader in production.
- Add garbage collection for removed/unreferenced image objects, upload quota
  accounting, size/volume monitoring, and incident rollback procedures.
- Confirm signed-in/code-gated media strategy, timed-release semantics,
  accessibility previews in Arabic/English, and screenshot acceptance.

PR #383's separate legacy course source, MCP source, and direct quiz/form
authorization blockers are **not** cleared by this PR.
