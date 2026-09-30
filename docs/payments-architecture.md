# Payments architecture — roadmap 135

Status: provider-neutral design and executable pure policy. No billing tables, payment provider SDKs, checkout, webhooks or live accounts are installed by this change. Provider-account setup and live verification are deferred by user instruction and require GitHub follow-up issues at delivery.

## Existing compatibility boundary

`convex/quizFunctions.ts` creates a 30-day Pro trial. `convex/admin.ts` grants time-limited plans and schedules expiration. `convex/authz.ts:hasPro` uses explicit `plan === "pro"` with a nonempty `planExpiresAt`, enforcing its deadline when a clock is supplied; records without an explicit plan fall back to `isElevated`. Forms, Live and MCP already consume that boundary.

Billing must project onto this existing boundary without putting provider IDs, refund logic or payment calls into forms/lessons. No existing records or permissions change here. The future migration must represent existing trials/admin grants independently before billing starts writing the projection; never reinterpret every existing Pro user as a paid subscriber. Preserve legacy grants until explicitly migrated. Continue scheduled expiry and exact-clock checks for sensitive mutations.

## Durable records to implement

These are proposed records, not deployed schema:

| Record | Identity and purpose |
| --- | --- |
| Provider account | Nonsecret `accountKey`, adapter kind, environment, currency/price allowlists, secret-reference names; immutable environment/account binding |
| Customer binding | Server-established account/customer → internal subject; uniqueness enforced transactionally; never trust a webhook's arbitrary user metadata |
| Event inbox | Unique `(accountKey,eventId)`, canonical payload digest, received timestamp, authentication outcome, processing state, retry count and sanitized error |
| Subscription snapshot | Unique `(accountKey,subscriptionId)`, subject, locally ordered revision, paid period, status, cumulative paid/refunded minor units and dispute state |
| Monetary journal | Append-only payment/refund/dispute entries with provider operation IDs, amount/currency, parent payment and reconciliation evidence; corrections are new entries |
| Entitlement grant | Independent trial/admin/paid grant, origin reference, interval and revocation; immutable history plus current projection |
| Operation outbox | Refund/checkout operation ID, stable provider idempotency key, pending/succeeded/failed state; retries reuse the same key |

Amounts use safe integer minor units and an explicit currency. Never net unrelated currencies or subscriptions. Provider fee, tax and accounting treatment belong to the monetary journal; the entitlement policy receives normalized access facts only. Keep sensitive webhook payloads encrypted with short retention if required for debugging; store canonical digests and minimal normalized facts durably. Never store card data.

## Ingestion, idempotency and reconciliation

1. Adapter authenticates the raw webhook before parsing into policy inputs. Resolve the account and existing subject binding server-side. Unknown bindings enter quarantine and cannot grant access.
2. Deduplicate atomically by account plus event ID. A matching digest is a no-op; reuse with a different digest enters quarantine. The digest is SHA-256 over a canonical normalized payload, including all access-affecting facts. The pure helper trusts the adapter to compute it; it does not verify signatures or hashes.
3. Treat notifications as reconciliation hints. Serialize reconciliation per account/subscription; fetch authoritative state and normalize it. Provider timestamps alone are not ordering guarantees. The adapter must provide an ordering/fencing strategy: a local monotonic revision under a reconciliation lease, with stale worker results rejected. Never assign a newer local revision to an older webhook body merely because it arrived later.
4. `reconcileBillingEvent` ignores older revisions, accepts identical equal revisions and quarantines contradictory equal revisions or subject/account changes. It accepts a complete newer snapshot even after missed intermediate events.
5. Commit inbox outcome, snapshot, monetary references, grant projection and expiry scheduling in one database transaction. A durable outbox handles external operations after commit. Never acknowledge an accepted event before its inbox record is durable; retry transient failures with bounded backoff and an operator queue.
6. Periodic reconciliation fetches known active/past-due/disputed subscriptions and unsettled refund operations, using the same reducer and transaction. Compare provider state, journal and projection; record discrepancies and corrections. Replaying or reconciling never inserts duplicate monetary entries.

Receipt lookup and transaction uniqueness are persistence responsibilities, not supplied by `lib/billingPolicy.ts`. Retain event deduplication tombstones through the configured provider replay horizon; removing them earlier makes old notifications replayable. Lease duration, provider consistency guarantees and reconciliation frequency require adapter-specific verification.

## Entitlement policy

`projectBillingEntitlement` accepts unique current subscription snapshots for one subject, independently authorized grants and an explicit server clock. Its finite expiry projection matches the existing plan model.

- Active paid subscriptions grant access during the paid interval. Cancellation scheduled for period end preserves that interval; canceled and past-due states grant no implicit grace. Any future grace policy requires an explicit bounded grant.
- Partial refunds retain the paid interval. A cumulative full refund revokes that subscription's grant. This is the selected product policy, not a statement about provider or legal requirements.
- Open or lost disputes suspend the implicated paid grant. A won dispute may restore access within the remaining paid interval. Restoration requires a newer authoritative snapshot; an old active notification cannot restore it.
- Other paid subscriptions, trials and admin grants survive a refund/dispute. Revoking one origin never overwrites every grant. The projection uses the latest active expiry across surviving grants.
- Expiry is exclusive; no grant is active at its exact deadline. No free-standing zero-value payment grants access; promotions must create an explicit authorized grant.
- Revocation changes future entitlement only. It does not delete forms, lessons, submissions, quizzes or scores. Existing product limits apply through their current entitlement checks.

## Adapter and account configuration

`BillingProviderAdapter` specifies authenticated webhook normalization, authoritative snapshot retrieval and idempotent refund requests. Stripe and a later regional provider implement the same contract; domain code does not switch on provider SDK objects. Checkout must additionally validate a server-owned price allowlist, bind the authenticated subject, use an operation outbox key and return a bounded redirect URL. A successful client redirect never proves payment.

Proposed **nonsecret configuration locations**, not existing configured accounts:

| Location/key | Example or role |
| --- | --- |
| `billing/providerAccounts` future deployment configuration | Adapter registry and enabled accounts |
| `accountKey` | `stripe:test:primary` or `regional:sandbox:primary`; never an API credential |
| `environment` | `test` or `live`; prevent cross-environment event/customer reuse |
| `priceCatalog` | Internal plan/currency/interval → approved provider price IDs |
| `credentialRef`, `webhookSecretRef` | Names of deployment-managed secret entries, never values |
| `reconciliationPolicy` | Adapter lease/fencing rules, retry bounds, retention and health thresholds |

A regional adapter must document its currency minor-unit normalization, notification authenticity, unique operation IDs, refund/dispute semantics, authoritative read consistency and idempotency support. If the provider lacks safe retries, operations require reconciliation before retry; never pretend an unsupported idempotency key provides exactly-once payment behavior.

## Rollout and remaining live checks

Add inbox/journal/grants additively, migrate current entitlement origins, then run a shadow projection without changing access. Compare shadow and current plans with sanitized diagnostics. Enable one test account, prove signed-event rejection, duplicate/out-of-order delivery, worker crashes, renewal, cancellation, partial/full refund, chargeback recovery and independent trial/admin preservation. Verify provider dashboard totals against the journal. Enable production only after that evidence and explicit production authorization. Roll back projection writes without deleting the ledger or current content.

Operational alerts must cover failed inbox processing, reconciliation lag, quarantined binding changes, outbox retries and projection disagreement. Refund controls require authorized operators and audit reasons; secrets must never enter public capabilities, exports, logs or chat. Provider accounts, live billing, tax/legal requirements and production operational verification remain unconfirmed.

## Verification

`tests/unit/billingPolicy.test.ts` exercises duplicate and contradictory event replay, stale refund recovery prevention, missed-event reconciliation, account/subject isolation, monetary validation, partial/full refunds, disputes, exact expiry and independent grants. These tests prove policy behavior only; they do not prove webhook authenticity, transactional persistence or provider interoperability.
