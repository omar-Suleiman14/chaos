# Chaos PR 34/34 — PWA/browser push, privacy and cross-platform acceptance

**Draft implementation on top of PR #410. Not merged, not deployed, not production-verified.**

## Events and permissions

Push extends the existing transactionally committed in-app notifications from PR 29. Students can receive published course announcements, assignments, calendar changes, approved enrollment, released results and course-message notices; doctors can receive student submissions, assisted grading handoffs and course updates; current administrators can receive grading queue notices. No grades, essays, answer keys, course text, student names, patient data or rubric excerpts appear in a push payload or lock-screen notification. The payload contains only `{ "lang": "en" | "ar" }`; the service worker shows a fixed localized "You have a new notification in Chaos" message and opens the authenticated dashboard.

Permissions are checked again before push delivery: active account, current admin role, course publication/moderation, teacher approval and current enrollment, notification-read state and category preferences. Push delivery uses the already-persisted notice; it does not create a second event or grant a new permission. Do not assume the notification can be seen if the account is later revoked.

## Browser and operating-system acceptance matrix

| Device | Expected route | Important limitation |
|---|---|---|
| Android | Chrome/Edge/Firefox where Push API and notifications are enabled; installed PWA or browser | Google services, browser notification settings, vendor battery controls and offline connectivity can delay delivery |
| Windows | Chrome/Edge/Firefox installed PWA or browser | Browser service/background delivery and OS notification settings must permit notifications |
| macOS | Safari 16+/Chromium/Firefox as supported; Safari webpages on macOS 13+ | Browser and OS policy apply; installation is optional for Safari/macOS |
| Linux | Chromium/Firefox and supported desktop notification service | No universal PWA install support in Firefox; browser background services and desktop notification daemon required |
| iPhone/iPad | iOS/iPadOS 16.4+ **installed Home Screen web app** | Browser tab alone cannot request PWA Web Push; open installed app and tap Enable |

No implementation can guarantee every delivery on every browser and OS. Browsers may block permission, push services may be unavailable, devices may be offline, and delivery is best effort. Always retain the in-app inbox.

## Setup

1. Set `CHAOS_WEB_PUSH_PUBLIC_KEY` (base64url 65-byte uncompressed P-256 public), `CHAOS_WEB_PUSH_PRIVATE_KEY` (base64url 32-byte private), and `CHAOS_WEB_PUSH_SUBJECT` (`mailto:` contact or HTTPS URL) **only in Convex**. Derive a corresponding keypair using P-256 ECDH; verify they match.
2. Set `NEXT_PUBLIC_CHAOS_VAPID_PUBLIC_KEY` to the same public key in Next.js. Never expose the private key or encrypt notifications client-side.
3. Deploy the PWA manifest and root-scoped `/push-sw.js` on HTTPS. Grant the worker its scope, ensure deployment proxies do not intercept this URL, and keep `Cache-Control` suitable for worker updates.
4. Signed-in users open the notification bell → preferences → **Enable push**. A real click requests OS/browser permission. Each device is opt-in; no permission is requested on page load.
5. Disable from the same control and remove OS/browser permission if desired. On iOS, install from Share → Add to Home Screen **before** enabling.

## Security, lifecycle and limits

- Signed-in, active-user subscriptions only, maximum eight devices; transfer of a push endpoint between signed-in accounts atomically replaces the old owner.
- Server-side delivery allowlist for known Apple, Mozilla, Google and Microsoft push-provider endpoints; no arbitrary URL calls/SSRF. HTTPS only.
- AES-128-GCM content encryption and VAPID ES256 signed claims; encrypted endpoint secrets never enter MCP or analytics.
- In-app transaction schedules external delivery; HTTP 404/410 removes dead subscriptions; transient errors retry with bounded exponential delays. A 50-ID bounded per-device receipt history suppresses replay after partial sends (exactly-once is not guaranteed across process crashes).
- Endpoints and auth key material are retained for push delivery and deleted on user disable, provider expiry, or after **90 days without subscription renewal**. The hourly retention sweep deletes up to 30 stale rows per batch.
- All notification category preferences remain respected; no new default-on push subscriptions. Account logout on a shared computer does not automatically unregister a browser permission: users must disable push for that device. Generic-only lock-screen text prevents exposing private course content in that case.
- No raw browser push endpoint, auth key, private grade content, individual answers or private MCP content is logged or shared with the assistant provider.
- PR 29's 80-student fanout and 50-admin fanout caps still apply. Larger cohorts need a paginated fanout implementation before launch.

## Acceptance checklist before merging or deploying

- Unit/integration tests, lint/typecheck, manifest and worker load, VAPID cryptographic round trip, consent, reauthorization, revocation and retry/deduplication scenarios.
- Real-device smoke runs on Android Chrome, Windows Chrome/Edge, Linux Chromium/Firefox, macOS Safari/Chrome and iOS 16.4+ installed PWA. Capture permission/grant/revoke/delivery screenshots, both Arabic and English, light and dark, keyboard and screen reader.
- Confirm background/offline-and-reconnect, OS notification settings, denied permission, endpoint expiry (404/410), 429/5xx backoff, disconnect/account transfer, 8-device limit, and no sensitive text in notifications or logs.
- Before production: live VAPID secrets, worker response headers, valid HTTPS, Vercel preview, production push provider receipts, real OAuth/revocation tests and all earlier release blockers.
- Gemini Apps custom MCP is presently limited to eligible US accounts (English-only); Gemini CLI can use the remote HTTP MCP server with OAuth. Verify actual OAuth registration compatibility for both supported clients before marking them GA.
