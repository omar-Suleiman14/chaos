# Chaos webhooks, payload version 1

Chaos can POST a signed JSON message to an https endpoint when something
happens to a creator's forms and quizzes. Webhooks are optional: every other
feature, including the integration API, works without them.

A creator manages webhooks in **Dashboard → Connections → Webhooks**. A
connected app (for example Max) can register its own through the integration
API with the `webhooks:manage` scope; see
[integration-api-v1.md](./integration-api-v1.md#webhooks). There is one delivery
path for both: nothing is specific to any product.

## Deployment setup

| Variable | Purpose |
| --- | --- |
| `CHAOS_WEBHOOK_KEY` | Required. 32+ random characters. Encrypts signing secrets at rest (AES-256-GCM). Without it, creating a webhook fails with `WEBHOOKS_NOT_CONFIGURED` and nothing is sent. Changing it makes existing secrets unreadable: rotate every webhook afterwards. |
| `CHAOS_WEBHOOK_ALLOW_LOCALHOST` | Development only. `1` allows `http://localhost` and `http://127.0.0.1` destinations. Never set it in production. |

Set them with `npx convex env set NAME value`.

`CHAOS_WEBHOOK_KEY` is a secret you generate, not a key issued by another
service. In PowerShell, generate 32 random bytes (64 hexadecimal characters)
and send the result directly to the Convex CLI so it stays out of shell history:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | npx convex env set CHAOS_WEBHOOK_KEY --prod
```

Use `--prod` for the project's production deployment, or replace it with
`--deployment <name>` to select a specific deployment. Store the key in the
Convex deployment, not only in Vercel or `.env.local`. Alternatively, generate
the value and paste it into that deployment's **Settings → Environment
Variables** in the Convex dashboard. Keep a secure backup of the value.

Once configured, open **Dashboard → Connections → Webhooks**, create a webhook
with an HTTPS destination, then choose **Send test** and inspect the delivery
result. Each webhook has its own signing secret; the deployment key above
encrypts those secrets and is not the secret shared with receivers. If the
deployment already has a key, retain it: replacing it requires rotating every
existing webhook secret.

## Events

| Type | When | Items |
| --- | --- | --- |
| `response.completed` | A respondent submits a form (not spam) | form |
| `response.graded` | Not emitted yet (see below) | form |
| `form.published` | A form version is published | form |
| `form.closed` | A live form is closed or archived | form |
| `form.reopened` | A closed form is made live again | form |
| `webhook.test` | Only when someone presses **Send test** or calls `POST /webhooks/{id}/test` | — |

Not emitted: edits to a submitted response, partial saves, draft edits, and
state that changes only with time (a form's scheduled open and close times are
checked when someone opens the form, so there is no moment to emit at). Forms
do not have manual grading yet;
when it exists it will emit `response.graded` with the same shape.

## Payload

The body is UTF-8 JSON, at most a few kilobytes without answers.

```json
{
  "id": "evt_9f1c2a…",
  "type": "response.completed",
  "version": "1",
  "createdAt": 1790000000000,
  "data": { }
}
```

- `id` identifies the event. When several webhooks receive the same event they
  get the same `id`.
- `version` is the payload schema version. Fields may be added within version
  1; anything that removes or changes a field gets a new version.
- Times are Unix milliseconds. Item and response ids are opaque strings.

### `data` for response events

```json
{
  "item": { "id": "form_…", "kind": "form", "title": "Event feedback", "status": "live", "version": 3, "sharePath": "/f/abc123" },
  "response": {
    "id": "response_…",
    "status": "completed",
    "formVersion": 3,
    "startedAt": 1789999940000,
    "submittedAt": 1790000000000,
    "durationMs": 60000,
    "language": "en",
    "answeredCount": 7,
    "score": 8,
    "maxScore": 10,
    "endingId": null
  }
}
```

- Quiz attempts use `"id": "attempt_…"`, `"formVersion": null`, `"language": null`.
- `score` and `maxScore` are `null` for forms without quiz mode.
- `response.graded` adds `"grading": { "fieldId", "points", "previousPoints", "gradedAt" }`;
  `response.score` is the new total.

**Answers are not included by default.** Only when the creator turns on
**Include answers and respondent names** for that webhook, `data` also contains:

```json
{
  "answers": [{ "fieldId": "q1", "label": "Email", "type": "email", "value": "person@example.org", "text": "person@example.org" }],
  "respondent": { "name": "Sam" }
}
```

`respondent` appears for quiz attempts only (the name typed at the start). For
quiz answers each entry also has `correct` and `points`. File-upload answers are
sent as `"value": null` with a count in `text`; file links never leave Chaos.
Webhooks created by a connected app can never include answers.

### `data` for item events

```json
{ "item": { "id": "form_…", "kind": "form", "title": "…", "status": "closed", "version": 3, "sharePath": "/f/abc123" }, "previousStatus": "live" }
```

`previousStatus` is sent for `form.closed` and `form.reopened`.
`sharePath` is relative to the Chaos app origin.

**Learn events.** `lesson.updated`, `lesson.published`, `lesson.forked`,
`lesson.archived`, `lesson.unpublished`, `collection.updated`,
`collection.published` and `curriculum.mapping_changed` carry ids and the
revision only, never lesson content, notes or reader data. They are sent only
for lessons the subscription selected explicitly: an `all` subscription stays
forms and quizzes only. A connection's subscription also needs `lessons:read`
and the lesson selected for that connection; collection events are not sent to
connections yet.

```json
{ "itemRef": "lesson_…", "lessonId": "…", "revision": 7, "versionId": "…" }
```

## Request

```
POST <your url>
Content-Type: application/json; charset=utf-8
User-Agent: Chaos-Webhooks/1
Chaos-Event: response.completed
Chaos-Delivery: <delivery id>
Chaos-Attempt: 1
Chaos-Signature: t=1790000000,v1=5257a869…[,v1=…]
```

- `Chaos-Delivery` is the same on every retry and on a manual resend of that
  delivery. Use it to ignore duplicates.
- Answer with any 2xx status within 10 seconds. Chaos reads at most 16 KiB of
  your response and never stores it. Do slow work after answering.

## Verifying the signature

Each webhook has its own secret (`whsec_` followed by 64 hex characters). It is
shown once when the webhook is created or rotated.

1. Split `Chaos-Signature` on `,`. Take `t` and every `v1` value.
2. Reject the request if `t` is more than 300 seconds away from your clock.
3. Compute `HMAC-SHA256(key = secret as UTF-8, message = t + "." + rawBody)` as
   lowercase hex. Use the raw request body bytes, before any JSON parsing.
4. Accept if it equals any `v1` value, comparing in constant time.
5. Optionally remember `Chaos-Delivery` ids for a day and ignore repeats.

```js
// Node 18+. Express example: app.post("/hooks/chaos", express.raw({ type: "application/json" }), handler)
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyChaosSignature(secret, header, rawBody, toleranceSeconds = 300) {
  let t = NaN;
  const signatures = [];
  for (const part of String(header ?? "").split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") t = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!Number.isInteger(t) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex"));
  return signatures.some((s) => {
    const given = Buffer.from(s);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// handler
// if (!verifyChaosSignature(process.env.CHAOS_WEBHOOK_SECRET, req.get("Chaos-Signature"), req.body)) return res.sendStatus(400);
// const event = JSON.parse(req.body.toString("utf8"));
```

To check your implementation without waiting for real events, press **Send
test** (or `POST /webhooks/{id}/test`). It sends a signed `webhook.test` event.

### Rotating the secret

**New secret** (or `POST /webhooks/{id}/rotate`) returns a new secret. For the
next 24 hours every delivery carries two `v1` values, one per secret, so
whichever secret your server has still verifies. Put the new secret in place
within that window; after it the old secret stops signing. Rotating again during
the window drops the oldest secret.

## Delivery semantics

- **At least once.** A delivery can arrive more than once (for example when your
  server answered after the timeout). Deduplicate on `Chaos-Delivery`.
- **No ordering guarantee.** Deliveries are independent and retries interleave.
  Use `createdAt` and the item's `status` to decide what is newest.
- **Retries.** A failed attempt (network error, timeout, non-2xx, or a 3xx
  redirect, which is never followed) is retried after about 30 s, 2 min, 8 min,
  32 min, 2 h 8 min, then 6 h, each ±10%, up to 8 attempts (about 15 hours).
  `410 Gone` stops retrying that delivery at once.
- **Switch-off.** After 25 failed attempts in a row, the webhook is switched off
  and the creator gets a notification. Resuming it resets the count. Deliveries
  still waiting when a webhook is paused, switched off or deleted are not sent.
- **Never blocking.** Emitting an event only records it and schedules the send;
  a slow or failing endpoint cannot slow down or fail the action that caused it.

## Destinations Chaos refuses (SSRF protection)

- Anything but `https://` (except the development flag above), URLs with a user
  name or password, ports below 1024 other than 443.
- IP literals in any notation, `localhost`, single-label names and internal
  suffixes such as `.local`, `.internal`, `.home.arpa`.
- Host names whose DNS answers include any private, loopback, link-local
  (including `169.254.169.254`), carrier-grade NAT, multicast, documentation,
  benchmarking or reserved address, in IPv4 or IPv6 (including IPv4-mapped,
  NAT64, 6to4, Teredo, unique-local and site-local). The connection is made to
  the address that was checked, so a second DNS answer cannot redirect it.

## History and retention

For each webhook the creator sees the latest 25 deliveries: event, time,
status, attempts, next retry, and per attempt the HTTP status, duration and a
classified outcome (`success`, `http_error`, `redirect`, `timeout`,
`network_error`, `dns_error`, `blocked_address`, `invalid_url`,
`internal_error`). Response bodies from your server are never stored or shown.

- Delivery bodies are erased after **24 hours** when they contain answers and
  after **7 days** otherwise. After that the delivery can no longer be resent.
- Delivery and attempt records are deleted after **30 days**.
- A manual **Resend** makes one attempt with the original body and
  `Chaos-Delivery`, and no automatic retries.
