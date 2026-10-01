# Chaos integration API, version 1

Product-neutral HTTP contract that lets a connected workspace (for example Max)
create Chaos drafts, link existing Chaos forms and quizzes, and read permitted
aggregate summaries. Chaos keeps ownership of every definition and response.

## Principles

- Chaos is the system of record for forms, quizzes and responses. The API never
  returns answer text, respondent names, emails, identifiers or per-response rows.
- Access is granted by a connection token that the Chaos owner issues in
  **Dashboard → Connections**. Tokens are shown once, stored only as SHA-256
  hashes, scoped, and revocable.
- A token reaches only the items the owner selected, plus drafts the token
  itself created. The owner may instead grant access to all of their items.
- Creation always produces a **draft**. Nothing is published through the API.
- No webhooks are required. Clients poll or refresh on demand; Chaos keeps
  collecting while the client is offline. A client that wants push updates may
  register a webhook with the optional `webhooks:manage` scope (see
  [Webhooks](#webhooks)); polling keeps working either way.
- Unlinking in the client never deletes Chaos content; there is no delete
  endpoint.

## Status, versioning and deprecation

**Status: v1 preview.** The v1 surface below is implemented and used by Max, but
it is not yet declared stable; that needs the design review recorded in the
release issue. Until then Chaos still follows the rules in this section, so a
v1 client written today keeps working when v1 is declared stable.

### What is stable within v1

- Paths, methods, scopes, request fields, response fields, error `code`
  values, HTTP status codes and the headers documented here.
- Field meanings and units (timestamps are milliseconds since 1970 UTC).
- Limits never get stricter within v1 (sizes, field counts, default rate limits
  per connection). Operators of a deployment may lower rate limits for their
  own deployment; clients must read the `RateLimit-*` headers, not assume the
  defaults.

Not stable, and free to change without notice: error `message` text,
`warnings` text, the order of keys in JSON, the format of opaque values
(`id`, `revision`, `nextCursor`, token hints), and anything under
`/api/mcp/` or Convex function names, which are internal.

### Changes allowed within v1 (non-breaking)

- New endpoints, new optional request fields, new response fields, new scopes,
  new error codes on new endpoints, new webhook event types. **Clients must
  ignore response fields they do not know.**
- New `fieldTypes` values, announced through `GET /capabilities`; clients
  should only send types listed there.

### Breaking changes

Removing or renaming anything above, changing a field's type or meaning,
making an optional request field required, or adding a value to `kind` or
`status` is breaking. Breaking changes ship only as a new major version at a
new path (`/v2`), served next to `/v1`.

### Deprecation policy

- A deprecated endpoint, field or version keeps working for **at least 6
  months** after the deprecation is announced, and never less than 3 months
  after its replacement is available.
- Announcements go in the release notes (CHANGELOG / GitHub release) and in
  this document, with the replacement and the sunset date.
- From the announcement until removal, responses of the deprecated endpoint
  carry `Deprecation: @<unix seconds>` (RFC 9745), `Sunset: <HTTP date>`
  (RFC 8594) and `Link: <replacement docs>; rel="deprecation"`. No v1 endpoint
  is deprecated today, so these headers are not sent yet.
- After the sunset date the endpoint returns `410 GONE` with an error body
  naming the replacement, for at least another 3 months.

## Transport

- Base URL: `{CHAOS_API_ORIGIN}/api/integrations/v1`, where `CHAOS_API_ORIGIN` is the
  Convex site URL of the Chaos deployment (hosted or self-hosted), for example
  `https://example-123.convex.site`.
- `Authorization: Bearer chaos_<64 lowercase hex>` on every request.
- Optional `Chaos-Api-Version: 1`. Any other value, or any path outside `/v1`,
  returns `400 UNSUPPORTED_VERSION`.
- JSON bodies, UTF-8, maximum 256 KiB.
- Errors: `{"error": {"code": string, "message": string, "details"?: unknown}}`
  on every endpoint. Branch on `code`, never on `message`.
- Pagination: list endpoints take an opaque `cursor` query parameter and return
  `nextCursor` (`null` on the last page). The same shape is used everywhere.
- Every authenticated response, including errors after authentication, carries
  the `RateLimit-*` headers described in [Rate limits](#rate-limits).

**Why Convex HTTP actions, not Next.js route handlers.** The API runs as Convex
HTTP actions (`convex/http.ts`) because every operation is a read or a
transactional write on Convex data: running in Convex lets authentication,
the rate-limit counter, the idempotency record and the write itself share one
serialisable mutation, so a retry can never race a duplicate into existence.
A Next.js route would add a network hop and a second auth system, and would
still have to call Convex for every step. The endpoint also works on
self-hosted deployments with no web app in front of it. The Next.js app only
hosts the MCP route, which needs Clerk OAuth.

## Not in v1

Left out on purpose, to keep the first version small enough to keep stable:
publishing, closing or deleting items; reading individual responses, answer
text or any respondent data; managing collaborators; theme, image and file
assets; authoring branching logic, translations, endings or calculations
(PATCH preserves them); rich text and math (plain text only); file-upload
questions; bulk endpoints; OAuth or any sign-in other than connection tokens;
AI generation of any kind. Lessons, folders and curricula are served by version 2; see
[Learn (version 2)](#learn-version-2).

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `UNSUPPORTED_VERSION` | Unknown API version or path |
| 400 | `VALIDATION_FAILED` | Body invalid; `details` lists problems |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Mutating request without `Idempotency-Key` |
| 401 | `UNAUTHORIZED` | Missing, malformed or unknown token (including an old token after its rotation grace period) |
| 401 | `TOKEN_REVOKED` | Token was revoked or has expired |
| 403 | `INSUFFICIENT_SCOPE` | Token lacks the scope for this request |
| 404 | `NOT_FOUND` | Item unknown, deleted or not shared with this token |
| 409 | `REVISION_CONFLICT` | `If-Match` revision is stale; `details.item` is current |
| 409 | `NOT_A_DRAFT` | Update targeted an item that is no longer editable through the API |
| 409 | `WEBHOOK_LIMIT` | The connection already has 5 webhooks |
| 409 | `WEBHOOK_INACTIVE` | The webhook is paused or switched off; the owner resumes it in Chaos |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key reused with a different request within 24 hours |
| 429 | `RATE_LIMITED` | Limit for this connection and class reached; retry after `Retry-After` seconds |
| 503 | `WEBHOOKS_NOT_CONFIGURED` | This deployment has not enabled webhooks (`CHAOS_WEBHOOK_KEY`) |

## Scopes

| Scope | Grants |
| --- | --- |
| `items:read` | `GET /items`, `GET /items/{id}` |
| `drafts:create` | `POST /drafts` |
| `drafts:update` | `PATCH /items/{id}` on API-created or shared drafts |
| `summaries:read` | `GET /items/{id}/summary` |
| `definitions:read` | `GET /items/{id}/definition` (explicit template copy) |
| `webhooks:manage` | `GET/POST /webhooks`, `DELETE /webhooks/{id}`, `POST /webhooks/{id}/rotate`, `POST /webhooks/{id}/test` (optional) |
| (any valid token) | `GET /capabilities`, `POST /connection/rotate` |

A token only ever reaches items owned by the Chaos user who issued it, and only
with the scopes they chose, so it can never do more than that user can.

## Tokens and rotation

- Tokens are 256-bit random secrets. Chaos stores only their SHA-256 hash and
  shows the token once, when it is created or rotated.
- **Rotation** replaces the token without breaking a running integration. The
  owner presses **New token** in Chaos, or the client calls
  `POST /connection/rotate`. The new token works at once; the old one keeps
  working for **24 hours** (the grace period) and then stops for good. The
  owner can end the grace period early. Revoking the connection stops both
  tokens immediately.
- While a client uses the old token, every response carries
  `Chaos-Token-Expires: <ISO 8601 time>` so it can tell it must switch.
- Rotating again during the grace period keeps the older token's deadline:
  if the client calls rotate with the old token (for example, because it lost
  the previous rotate response), Chaos replaces the unseen new token and
  leaves the old token's deadline unchanged. Rotating is therefore safe to
  retry and needs no `Idempotency-Key`.
- The connection keeps its id, scopes, shared items, created drafts, webhooks
  and history across rotations.

### `POST /connection/rotate`

Any valid token (current, or old within its grace period). No body.

```json
{ "token": "chaos_…", "previousTokenExpiresAt": 1790086400000 }
```

Store the new `token` now; it is never returned again.

## Rate limits

Limits apply per connection, per class, in fixed one-minute windows counted in
one indexed row per connection and class (no scans).

| Class | Requests | Default per minute |
| --- | --- | --- |
| `read` | every `GET` | 300 |
| `write` | every `POST`, `PATCH`, `DELETE` | 60 |

Operators change the limits without a code deployment: set
`integrationReadRatePerMinute` / `integrationWriteRatePerMinute` in the
`globalConfig` table (takes effect on the next request), or the deployment
environment variables `CHAOS_API_READ_RATE_PER_MINUTE` /
`CHAOS_API_WRITE_RATE_PER_MINUTE`. `globalConfig` wins over the environment;
values must be whole numbers from 1 to 100000.

Every authenticated response carries the limit for its class
([draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)):

| Header | Meaning |
| --- | --- |
| `RateLimit-Limit` | Requests allowed in the window for this class |
| `RateLimit-Remaining` | Requests left in the current window |
| `RateLimit-Reset` | Seconds until the window resets |
| `RateLimit-Policy` | `<limit>;w=60` |

Over the limit, Chaos returns `429 RATE_LIMITED` with `Retry-After: <seconds>`
and `RateLimit-Remaining: 0`, and does nothing else. Requests rejected before
authentication (bad or unknown token) are not counted. The API does not call
any AI service, so these limits are separate from, and never counted
against, any other usage limit in Chaos.

## Idempotency

- **Which requests:** `POST /drafts`, `PATCH /items/{id}` and
  `POST /webhooks` require `Idempotency-Key`. `POST /connection/rotate` is safe
  to retry without one (see above). `DELETE /webhooks/{id}` is idempotent by
  nature (the second call returns `404`). `POST /webhooks/{id}/rotate` and
  `/test` take no key: a retried rotate makes another secret and the previous
  one keeps signing for 24 hours; a retried test sends another test event.
- **Format:** 1–200 printable ASCII characters (`0x21`–`0x7E`). Use a UUID
  or another random value per user action; reuse it only for retries of that
  same action.
- **Scope:** per connection, shared by all endpoints. The same key sent by two
  different connections is two different keys.
- **What counts as the same request:** method, path, `If-Match` and the JSON
  body compared after parsing, so key order and whitespace do not matter.
- **Replay:** within 24 hours, the same key and request returns the stored
  original body with status `200` (instead of the original `201`) and the
  header `Idempotent-Replayed: true`. Nothing is created or changed again.
  Secrets (`webhook` creation) are not stored and come back as `null`.
- **Conflict:** the same key with a different request returns
  `422 IDEMPOTENCY_KEY_REUSED` and changes nothing.
- **Failures are not stored:** a request that failed (any `4xx`/`5xx`) may be
  corrected and retried with the same key.
- **Concurrency:** the key check and the write run in one serialisable Convex
  transaction, so concurrent requests with the same key produce exactly one
  item; the others get the replay.
- **Retention and expiry:** keys are kept for **24 hours** from the first
  successful request. After that the key is forgotten: sending it again is a
  new request and creates a new item. Do not retry an action for more than 24
  hours with the same key; check `GET /items` first.

## Resources

### Item

```json
{
  "id": "form_…" ,
  "kind": "form" | "quiz",
  "title": "string",
  "status": "draft" | "live" | "closed" | "archived",
  "revision": "string",
  "updatedAt": 1790000000000,
  "hasUnpublishedChanges": false,
  "editPath": "/dashboard/forms/…",
  "sharePath": "/f/…" | null,
  "resultsPath": "/dashboard/forms/…/responses",
  "editUrl": "https://chaos.example/…" | null,
  "shareUrl": "https://chaos.example/…" | null,
  "resultsUrl": "https://chaos.example/…" | null,
  "createdByThisConnection": true,
  "source": { "type": "page", "id": "pg_8f2c1a", "url": "https://…", "title": "string", "fetchedAt": 1790000000000 } | null
}
```

`source` is the validated source this connection sent when it created the
item (see [Source](#source)), or `null`. Other connections never see it.

`id` is opaque and stable across renames. Form ids start with `form_`, quiz ids
with `quiz_`. Quiz paths are `/dashboard/editor?id=…`, `/{username}/{slug}` and
`/dashboard/results?id=…`. URLs are absolute when the deployment sets `CHAOS_APP_URL`;
otherwise only paths are returned. `revision` changes whenever the draft changes,
from any source.

### Field (request and definition)

```json
{
  "id": "q1",
  "type": "text",
  "label": "string",
  "description": "string?",
  "required": false,
  "options": ["string"],
  "rows": ["string"],
  "min": 1,
  "max": 5,
  "correctAnswer": "string?",
  "correctAnswers": ["string"],
  "keywords": ["string"],
  "points": 1
}
```

- Form field types: `text`, `textarea`, `choice`, `dropdown`, `multi_choice`,
  `number`, `email`, `phone`, `url`, `date`, `time`, `rating`, `scale`,
  `ranking`, `matrix`, `statement`, `section`.
- Quiz field types: `mcq`, `true_false`, `multi_select`, `written`. The answer
  fields (`correctAnswer`, `correctAnswers`, `keywords`, `points`) apply only
  to quizzes. Answer keys may be omitted; the creator completes them before
  publishing.
- `id` must match `^[A-Za-z][A-Za-z0-9_-]{0,79}$` and be unique per request.
- Limits: 200-character titles, 200 fields, 500-character labels,
  5000-character descriptions, 50 options.

## Endpoints

### `GET /capabilities` (alias `GET /connection`)

Any valid token. Used for "test connection".

```json
{
  "apiVersion": "1",
  "supportedVersions": ["1"],
  "scopes": ["items:read"],
  "supportedKinds": ["form", "quiz"],
  "fieldTypes": { "form": ["text", "…"], "quiz": ["mcq", "…"] },
  "limits": { "maxFields": 200, "minimumGroupSize": 5 },
  "workspace": { "id": "string", "name": "string" },
  "connection": { "id": "string", "label": "string", "access": "selected" | "all", "createdAt": 0, "expiresAt": null }
}
```

### `GET /items?kind=form|quiz&cursor=…`

`items:read`. Returns `{ "items": Item[], "nextCursor": string | null }`, most
recently updated first, at most 50 per page.

### `GET /items/{id}`

`items:read`. Returns `Item`.

### `POST /drafts`

`drafts:create`. Requires `Idempotency-Key` (1–200 printable characters).

```json
{ "kind": "form" | "quiz", "title": "string", "description": "string?", "fields": [Field], "source": Source? }
```

Returns `201 { "item": Item, "warnings": string[] }`. Replays and conflicts
follow [Idempotency](#idempotency).

### Source

Optional provenance, so the sending application can reconcile later and the
creator knows where the draft came from.

```json
{
  "type": "page",
  "id": "pg_8f2c1a",
  "url": "https://notes.example.com/p/onboarding",
  "title": "Onboarding notes",
  "fetchedAt": "2026-09-29T09:30:00Z",
  "label": "Onboarding page"
}
```

| Field | Rule |
| --- | --- |
| `type` | Required when any of `id`, `url`, `title`, `fetchedAt` is sent. `^[a-z][a-z0-9_.-]{0,39}$`, e.g. `page`, `document`, `note`. |
| `id` | Opaque reference in the source system, up to 200 characters. Prefer this for reconciliation. |
| `url` | `http`/`https`, up to 2000 characters, no user name or password, not a private host (`localhost`, `*.local`, `*.internal`, private IP ranges). Query string and fragment are removed (with a warning), since they often carry session tokens. |
| `title` | Up to 200 characters. |
| `fetchedAt` | ISO 8601 date-time or milliseconds since 1970; not before 2000 and not in the future. Stored as milliseconds. |
| `label` | A plain name, up to 200 characters. Kept for older clients; `source: { "label": "…" }` alone still works. A label that looks like a web address, a file path or a link with a token (`https://…`, `/private/…`, `C:\…`, `…?token=…`) is refused: use `url` for addresses. |

Rejected with `400 VALIDATION_FAILED` (nothing is stored): any other key; any
`label`, `id` or `title` that looks like a local file path (`/Users/…`,
`/home/…`, `~/…`, `C:\…`, `\\server\…`, `file://`); control characters; a
`source` larger than 4 KiB in total.

Where it goes: the structured part is stored with the draft (on the form
record and on the connection's record of items it created) and shown to people
editing the item in the builder. It is returned only to the connection that
sent it (`Item.source`). It is never included in respondent pages, public
queries, published versions, exports, summaries, webhooks or other
connections' responses. Chaos also records which connection created the item
and when. Revoking the connection keeps the items and their provenance.
`source` on `PATCH` is validated but ignored: provenance is fixed at creation.

### How imported content is checked

Imported drafts pass the same validation as drafts made in the builder
(`checkDefinition`). The rules for content that does not fit:

- **Fails with `400 VALIDATION_FAILED`** (nothing is created): unknown field
  types, bad ids, duplicate ids, wrong value types, anything over a size limit,
  answer keys on a form, an invalid `source`.
- **Accepted with a warning** (the draft is created, the creator finishes it
  before publishing): missing or invalid quiz answer keys, empty question
  text, a form that would not yet pass the publish check (reported as
  `Before publishing: …`), branching cleared because its target question was
  removed by a `PATCH`, a stripped `source.url` query.
- **Not representable in v1:** rich text and math (send plain text), images,
  file-upload questions, logic, translations. There is no field for them, so
  they cannot be sent; `GET /definition` lists what it left out in
  `compatibility.dropped`.

### `PATCH /items/{id}`

`drafts:update`. Requires `Idempotency-Key` and `If-Match: <revision>`. Body is
the same as `POST /drafts` without `kind`. Replaces the **draft** definition only:
published versions and collected responses are never modified. A stale revision
returns `409 REVISION_CONFLICT` with the current item so the client can show a
change preview. Quizzes that are live or have responses return `409 NOT_A_DRAFT`.
Returns `{ "item": Item, "warnings": string[] }`.

### `GET /items/{id}/summary`

`summaries:read`. Aggregates only.

```json
{
  "itemId": "form_…",
  "kind": "form",
  "status": "live",
  "responseCount": 42,
  "suppressed": false,
  "minimumGroupSize": 5,
  "completedCount": 40,
  "averageScorePercent": null,
  "questions": [
    { "fieldId": "q1", "label": "string", "type": "choice", "answeredCount": 38,
      "distribution": [{ "option": "Yes", "count": 30 }, { "option": "No", "count": 8 }] }
  ],
  "updatedAt": 1790000000000
}
```

- When fewer than `minimumGroupSize` responses exist, `responseCount` is `null`,
  `suppressed` is `true` and `questions` is empty.
- Any option bucket smaller than `minimumGroupSize` is reported as
  `{ "option": "Other (fewer than 5)", "count": null }` merged together. When only
  one bucket would be merged, the smallest remaining bucket is merged too (the label
  stays the same), so a hidden count can never be worked out by subtracting the shown
  counts from `answeredCount`.
- Free-text, contact, file and date fields report only `answeredCount`.
- `averageScorePercent` is provided for quizzes when not suppressed.

### `GET /items/{id}/definition`

`definitions:read`. Returns the current **published** definition, or the draft if
never published, for explicit template copying: `{ "kind", "title",
"description", "fields": [Field], "compatibility": { "dropped": string[] } }`.
Quiz answer keys are included only for the owner's own items. Responses,
credentials and theme assets are never included.

## Webhooks

Optional push notifications through the generic webhook system described in
[webhooks-v1.md](./webhooks-v1.md) (events, payload schema, signature
verification, retries and retention). Nothing here is specific to one client:
Max uses exactly these endpoints, and a Max instance that cannot be reached
simply produces ordinary failed deliveries that are retried and shown to the
owner.

A connection's webhooks:

- receive events only for items the connection can reach at the time of the
  event (its shared items, all items if the owner chose that, and drafts it
  created);
- never include answers or respondent names;
- stop when the connection is revoked or expires, and are listed for the owner
  under **Connections → Webhooks**, where the owner can pause or delete them.

### `GET /webhooks`

`webhooks:manage`. Returns `{ "webhooks": Webhook[], "eventTypes": string[] }`,
only webhooks created by this connection.

```json
{
  "id": "string",
  "url": "https://max.example/hooks/chaos",
  "description": "Max",
  "events": ["response.completed", "form.published"],
  "status": "active" | "paused" | "disabled",
  "health": "new" | "healthy" | "failing" | "paused" | "disabled",
  "secretHint": "whsec_1a2b…",
  "previousSecretExpiresAt": null,
  "lastSuccessAt": null,
  "lastFailureAt": null,
  "createdAt": 1790000000000
}
```

### `POST /webhooks`

`webhooks:manage`. Requires `Idempotency-Key`.

```json
{ "url": "https://max.example/hooks/chaos", "events": ["response.completed", "form.published", "form.closed", "form.reopened", "response.graded"], "description": "string?" }
```

Returns `201 { "webhook": Webhook, "secret": "whsec_…" }`. **Store the secret
now**: it is never returned again. Replaying the same key and body returns
`200` with the same webhook and `"secret": null`. The URL must be a public
`https` address (see "Destinations Chaos refuses" in webhooks-v1.md); otherwise
`400 VALIDATION_FAILED`. At most 5 webhooks per connection.

### `DELETE /webhooks/{id}`

`webhooks:manage`. Deletes the webhook and its delivery history. Returns
`{ "deleted": true }`.

### `POST /webhooks/{id}/rotate`

`webhooks:manage`. Returns `{ "webhook": Webhook, "secret": "whsec_…",
"previousSecretExpiresAt": 1790086400000 }`. Until `previousSecretExpiresAt`
(24 hours) deliveries are signed with both secrets.

### `POST /webhooks/{id}/test`

`webhooks:manage`. Queues a signed `webhook.test` delivery and returns
`202 { "deliveryId": "string" }`. Limited to 10 per minute.

## Client guidance

- Store the token in OS-protected storage, never inside exported workspace data.
- When a response carries `Chaos-Token-Expires`, ask the user for the new
  token (or call `POST /connection/rotate`) before that time.
- Generate one `Idempotency-Key` per user action and reuse it on retries.
- Read `RateLimit-Remaining` and slow down before it reaches 0; on `429`, wait
  `Retry-After` seconds.
- Ignore response fields you do not know.
- Cache item metadata and summaries with the time they were fetched and display
  that time. Refresh on open and on demand.
- Treat `404` as "unavailable or access revoked" and keep the local link so the
  user can decide to unlink.
- Webhooks are a hint to refresh, not a replacement for reading: on an event,
  fetch the item or summary again. Keep polling on open so a missed or late
  delivery never leaves stale data.

## Learn (version 2)

Lessons, folders, curricula, study progress and community lessons are served
under `/api/integrations/v2/`, next to the unchanged v1 routes. The same
connection token works for both; v2 responses carry `Chaos-Api-Version: 2`
and `Cache-Control: no-store`. A request that sends any other
`Chaos-Api-Version` gets `400 UNSUPPORTED_VERSION`.

The principles are the same as v1. The owner chooses what a connection reaches.
Everything a connection writes is a **private draft**. Nothing is published,
made public or deleted through the API. Personal notes, highlights, other
people's progress and respondent data are never returned. The end-to-end user
flow is in [learn-integration.md](learn-integration.md).

Status: implemented with contract tests (`tests/integration/learn*`); not yet
exercised by a live Max client.

### Selection and scopes

| Scope | Allows |
| --- | --- |
| `lessons:read` | Read selected lessons: details, definition and outline. |
| `lessons:create` | Create lesson drafts (`POST /drafts`). A draft the connection created stays reachable by it. |
| `lessons:update` | Replace or edit blocks of selected drafts; unlink a lesson from the connection. |
| `sources:read` | Read metadata (title, kind, author, link) of selected sources. Never file bytes. |
| `folders:read` / `folders:update` | List folders and the selected assets inside them; create and move folders, add reachable assets. |
| `curricula:read` / `curricula:map` | Browse the curriculum directory; map reachable lessons to curriculum nodes. |
| `progress:read` / `progress:write` | The owner's own study progress on selected lessons. |
| `tutor:context` | Assemble bounded text of a selected lesson for studying elsewhere. |
| `community:read` / `community:save` / `community:fork` | Search public lessons; save one to the owner's library; fork one as a private copy. |

Lessons are selected one by one in **Connections** (stored as `lesson_<id>`
references next to `form_…` and `quiz_…`). `access: "all"` keeps meaning
all forms and quizzes; it never grants lessons. Folder listings show folder
names, but folder contents list only assets the connection may already reach.
An unselected or missing lesson returns `404 NOT_FOUND`, so a connection
cannot probe for ids.

### Lesson document

A lesson is `{ metadata, document }`. `metadata` has `title`, `description`,
`language`, `tags` and optional `license`, `coverUrl`, `authorDisplay`,
`indexing`. `document` is `{ "schemaVersion": 1, "blocks": [...] }`; every
block has a stable `id`, `citations` and `conceptIds`. Text blocks are
`paragraph`, `heading` (`level` 1–3), `list` (`bullet`/`number`/`check`),
`callout`, `code`, `quote` and `toggle`, with plain `text` and optional
`inline` runs (bold, italic, underline, strike, code, colours, links). Media
blocks (`image`, `youtube`) and citations refer to sources by id; those
sources must be selected for the connection and need `sources:read`. Limits:
500 blocks, 300 KB per document, 350 KB per request.

### Endpoints

| Method and path | Scope | Notes |
| --- | --- | --- |
| `GET /capabilities` (alias `/connection`) | none | Scopes, limits and supported kinds. |
| `GET /lessons/{ref}` (alias `/items/{ref}`) | `lessons:read` | Add `/definition` for blocks or `/outline` for headings; `offset`/`limit` page large documents. |
| `POST /drafts` | `lessons:create` | Body `{ "kind": "lesson", metadata, document?, source? }`. Requires `Idempotency-Key`. |
| `PATCH /lessons/{ref}` | `lessons:update` | Body `{ document, metadata? }`. Requires `If-Match` (lesson revision) and `Idempotency-Key`. |
| `PATCH /lessons/{ref}/blocks` | `lessons:update` | Body `{ operations: [...] }`, 1–100 of `append`, `update`, `move`, `delete`. Same headers. |
| `DELETE /lessons/{ref}/link` | `lessons:update` | Removes the connection's access and link. The lesson and its versions stay. |
| `GET /sources/{ref}` | `sources:read` | Metadata only. |
| `GET /folders?parentId=…`, `GET /folders/contents?folderId=…` | `folders:read` | `cursor`, `limit` (1–100). |
| `POST /folders`, `/folders/move`, `/folders/members` | `folders:update` | Requires `Idempotency-Key`. |
| `GET /curricula/{institutions,programs,versions,nodes,mappings}` | `curricula:read` | Filter by the parent id (`institutionId`, `programId`, `versionId`, `lessonId`). |
| `POST /curricula/mappings` | `curricula:map` | `{ lessonId, versionId, nodeId, conceptKeys, blockIds }`. |
| `GET /progress/lesson_{id}` | `progress:read` | Optional `versionId` or `revision`. |
| `POST /progress/lesson_{id}` | `progress:write` | `{ versionId?, revision?, operation }`; operation `start`, or `complete` with `sessionSeq`, `writeSeq`, `blockIds`. |
| `POST /context/assemble` | `tutor:context` | Bounded lesson text; curriculum and progress need their own scopes too. |
| `GET /community/search`, `/community/directory` | `community:read` | `text`, `limit`, `cursor`. |
| `POST /community/save`, `/community/fork` | `community:save` / `community:fork` | Fork requires `Idempotency-Key` and creates a private draft with attribution. |

Unknown query parameters or body fields are rejected with
`400 VALIDATION_FAILED`.

### Example: notes to a lesson draft

```http
POST /api/integrations/v2/drafts
Authorization: Bearer chaos_…
Idempotency-Key: max-page-8f2c-v1
Content-Type: application/json

{
  "kind": "lesson",
  "metadata": { "title": "Portal hypertension", "description": "", "language": "en", "tags": ["GIT", "liver"] },
  "document": { "schemaVersion": 1, "blocks": [
    { "id": "b1", "type": "heading", "level": 2, "text": "Causes", "citations": [], "conceptIds": [] },
    { "id": "b2", "type": "list", "style": "bullet", "text": "Cirrhosis", "citations": [], "conceptIds": [] }
  ] },
  "source": { "type": "max_page", "id": "8f2c", "title": "GIT Notes", "url": "https://max.example/p/8f2c" }
}
```

The response holds the new `lesson_…` item with its `revision`. The lesson is
private; the owner sees where it came from in Chaos and publishes it there.

### Example: edit blocks of a draft

```http
PATCH /api/integrations/v2/lessons/lesson_k57…/blocks
Authorization: Bearer chaos_…
If-Match: "4"
Idempotency-Key: max-page-8f2c-v2
Content-Type: application/json

{ "operations": [
  { "action": "update", "blockId": "b2", "block": { "id": "b2", "type": "list", "style": "bullet", "text": "Cirrhosis (most common)", "citations": [], "conceptIds": [] } },
  { "action": "append", "blocks": [ { "id": "b3", "type": "paragraph", "text": "See also: varices.", "citations": [], "conceptIds": [] } ] }
] }
```

If the lesson changed since revision 4, the request fails with `409` and
nothing is written; read the lesson again and resend. Archived or moderated
lessons return `409 NOT_A_DRAFT`.

### Activity

Each write is logged on the connection and shown on the Connections screen in
plain words, for example "Max created draft “Portal hypertension”" and "Max
updated draft “Portal hypertension” (3 times)". Logged actions include
`lesson.draft_created`, `lesson.draft_updated`, `lesson.unlinked` and
`lesson.selection_updated`.

### Not in v2 yet

Listing all lessons (only selected ones are reachable), publishing, changing
visibility, deleting, collections, held proposals that wait for the owner's
approval (updates save to the draft directly, with revision checks and draft
recovery in Chaos), raw editor JSON and anchored discussions.
