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

Every request to `/forms/images/content` rechecks the image state, course access,
and the form/version reference. Released question and choice images are available
on open public forms, to signed-in respondents who meet the audience rules, and
to respondents with a valid form access grant. The grant is scoped to the form,
expires, and is not the raw access code. Authorized editors can preview images.
A valid edit link can load images from its completed response's version after close
when the form allows editing after close. Removed uploads and restricted owners
remain unavailable.

Grant and edit-token image URLs are bearer capabilities. Treat them as sensitive;
only the configured Convex site receives them. No signed R2 GET is exposed.

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
- Run an authenticated application upload and verification smoke test before enabling
  the uploader in production. The synthetic browser-to-R2 smoke test has passed.
- Removed and expired pending uploads are queued for deletion. Add quota accounting,
  unreferenced ready-image cleanup, size/volume monitoring, and rollback procedures.
- Verify timed-release semantics, accessibility previews in Arabic/English, and screenshot acceptance.

PR #383's separate legacy course source, MCP source, and direct quiz/form
authorization blockers are **not** cleared by this PR.
