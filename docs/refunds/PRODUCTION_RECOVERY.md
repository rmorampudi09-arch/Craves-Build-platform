# Customer Razorpay refund production recovery

This module concerns customer-payment refunds. It does not use RazorpayX, Fund
Account Validation or chef payouts. No live refund is required for its technical
acceptance. Keep existing customer payment credentials and all non-refund runtime
configuration unchanged.

## Observed release starting point

The 14 September 2026 read-only production audit found 25 historical refund rows:
19 DEAD_LETTER, one ONHOLD and five PENDING. Subsequent saved-key provenance showed
all 18 Razorpay missing-ID attempts used recorded `rzp_test_` checkout keys and
had HTTP 400 failures. Seven Cashfree rows remain a separate historical cohort;
the saved records do not establish Cashfree environment. Nineteen failure events
had already been published for missing-ID attempts. These are observations of
that audit, not a current activation approval. Refresh before every change.

Legacy execution and reconciliation flags were both enabled in the audited
runtime. The old reconciliation worker could POST when a PENDING/ONHOLD row lacked
a provider refund ID. Turning only execution off was insufficient. The `pause`
stage below disables both worker actions and their production approvals while
preserving request consumers and status publishers. It does not remove work.

## Dispatch protocol

`RAZORPAY_REFUND_IDEMPOTENCY_V1` durably records the exact request body, its SHA-256
and first dispatch timestamp before any POST. V136 prevents changing that body,
key or financial context, resetting reconciliation attempts, replacing a bound
refund ID, or deleting dispatch/recovery history.

The documented header is `X-Refund-Idempotency`. The former
`X-Razorpay-Idempotency-Key` header is not the documented refund contract.
Historical attempts cannot acquire a new protocol and be resent as if their old
attempt had been idempotent. New-protocol retries use the same body and key.
Normal refund speed is explicit. Amounts are integer paise, never binary floats.

Batch reservation is not a provider dispatch attempt. The monotonic dispatch
counter advances with durable preparation, before POST. Each retry rechecks the
exact PROCESSING claim token, unchanged persisted body/hash and attempt counter,
then renews its lease. A stale claim never authorizes a POST. New unknown exposure
is checked before every CREATE in a batch; definitely unsent reservations are
deferred with append-only observations, without decrementing attempt history.

Official references checked during implementation:

- [Normal refund idempotency](https://hdfcbank-collectnow-docs.razorpay.com/api/refunds/normal-refunds-idempotent/)
- [Payment-scoped refund collection](https://hdfcbank-collectnow-docs.razorpay.com/api/refunds/fetch-multiple-refund-payment/)
- [Payment-scoped individual refund](https://razorpay.com/docs/api/refunds/fetch-specific-refund-payment/)

Razorpay's primary documentation returned a Markdown content type unsupported by
the browser fetcher; the readable idempotency/collection pages above are hosted
on its official domain. Do not substitute a payout idempotency header.

## Worker eligibility

Every claim has an explicit CREATE, GET or LOOKUP action. SQL selection and the
worker independently enforce the action's enabled gate. Reconciliation never
creates a refund just because the ID is absent.

- CREATE requires a fresh never-attempted request or this protocol's durably
  prepared retry, enabled execution and production approval, matching payment
  identity/currency/amount, the expected saved key mode and a paid payment.
- GET requires reconciliation enabled and a known refund ID. It retrieves through
  the exact payment-scoped endpoint and verifies the returned ID as well.
- LOOKUP is GET-only for historical or unknown missing-ID work, including old
  DEAD_LETTER rows. A lookup that finds no match does not authorize creation.
- A production worker never sends a saved test-mode Razorpay record using live
  credentials. Those histories remain intact and separately counted.
- Unclassified historical providers, inconsistent source-payment links, live
  unknown outcomes and actionable dead letters stop new creation even when an
  older runtime's execution flag remains true. No Cashfree API is activated to
  make Razorpay readiness appear successful.

HTTP connect/read timeouts, response size, page count, batch size and attempt
budgets are bounded. Redirects are disabled. Known-ID GET remains possible when
customer-payment creation is disabled, provided merchant read credentials and
refund reconciliation approval remain valid.

The lifetime reconciliation count remains monotonic audit history. Only consecutive
failed observations consume the failure budget; verified PENDING results reset
that separate counter and continue at the bounded five-minute polling interval.
Eight successful pending polls do not strand a later completed refund. Exhausted
consecutive failures retain the hold, emit a recovery-limit observation and appear
as `reconciliationExhaustedCount` in readiness. No failure count is a provider
terminal outcome.

## Verifying a provider result

A result must match refund entity, payment ID, exact integer amount, INR currency,
receipt, supported state and the previously bound refund ID when present. Missing
ID recovery also matches the Craves refund note. Duplicate candidates, repeated
pages, incomplete/malformed collections, conflicting dimensions and exhausted
pagination are held for review. Raw provider notes, acquirer data, bodies,
headers, credentials and exception causes are not logged or copied into evidence.

Only validated dimensions are persisted. A transport failure, incomplete response,
no match or exhausted retry is not evidence of a failed refund. It retains the
financial reservation and a recovery-required state. No fabricated REFUND_FAILED
outbox event is emitted.

## Immutable historical recovery and correction

V136 is additive. It does not rewrite historical refunds or previously published
events during migration. Recovery observations preserve prior status, attempt
count, prior provider ID and original-error digest. An existing DEAD_LETTER error
is retained even when a later verified observation resolves its current status.
Observations cannot be updated, deleted or truncated.

An applied result must still own the exact PROCESSING claim token. The result,
observation and new status outbox entry commit together. A stale or already-used
claim cannot apply. A verified recovery produces a distinct, deterministic event
key derived from verified evidence; original failure events remain published and
unchanged. Order's normal idempotent inbox and monotonic REFUNDED transition are
retained. Inspect its actual projection and history after an approved correction.
Do not replay an old outbox message, manufacture an updated timestamp on it, or
release a chef hold automatically. Refund responsibility/accounting treatment is
an independent finance decision.

For each historical cohort, first establish original provider environment,
merchant ownership, payment identity, amount and existing external refund. A live
404 from an unrelated/current account does not prove an old refund never
existed. The application must not infer Cashfree environment from current routing,
ID appearance or the database's production hostname. Preserve unclassified rows
until actual historical evidence or authorized provider reconciliation resolves
them. Do not reset attempts, mark them SUCCESS/FAILED or synthesize provider IDs.

## Guarded configuration release

Use the existing `azure-pipelines-refund-production-activation.yml` definition
with `Craves-Dev-Service-Connection` and its existing approval controls. This is
only the existing Integration app; it creates no resource and preserves exactly
one replica. Review the PR and CI first.

1. Refresh main, release SHA, image/digest, healthy revision, traffic and current
   exposure. Keep one reviewed SHA across build/configuration.
2. Set `applyConfiguration=false`, an explicit stage, `expectedReleaseSha`, exact
   current image and healthy revision, and all eight current exposure counts in
   `expectedExposureJson`. The default stage is `pause`.
3. Review the resulting `refund-runtime-plan.json`. It contains only redacted
   readiness and gate changes plus hashes of preserved configuration.
4. Run the same reviewed source with the same inputs, `applyConfiguration=true`
   and `reviewedPlanRunId` pointing to that definition's successful plan run.
   Current runtime/plan drift causes refusal before mutation.
   Healthy active revision, full traffic and exactly one actual replica are checked
   during planning and immediately before mutation, as well as after apply.
5. Record the new healthy revision, actual one replica, full traffic, unchanged
   image and non-refund configuration digest, enabled flags and readiness.
   A successful CLI update alone is insufficient.

For non-pause stages the runtime image tag must be the exact release SHA and the
readiness endpoint must report the repaired protocol. The sequence is downstream
request/status processing, GET-only reconciliation, then provider execution.
Creation requires clean/understood exposure, downstream and reconciliation
readiness, and source-certified execution eligibility. Do not bypass a failed
guard by changing expected counts or enabling Cashfree.

The internal readiness credential comes from the application's existing secure
`CRAVES_INTERNAL_SERVICE_KEY` reference, or the already approved protected pipeline
secret. Values are resolved only in memory and are never included in the plan.
No key is pasted into chat or rotated.

## Rollback

Pause new unsafe refund work first. Preserve request/status processing and all
ledger/refund/outbox history. Keep independently safe GET reconciliation available
through reviewed tooling if rolling back to legacy code; its built-in
reconciliation flag cannot be treated as GET-only. Reverting to an older image
does not revert V136 or delete its observations. Do not run Flyway repair or
rewrite applied migrations. Restore image/configuration only through the reviewed
existing release procedure, preserving one replica and the previous healthy
revision as the rollback reference.

## Required tests and evidence

`Refund Safety CI` creates its own disposable PostgreSQL 16 database named
`craves_refund_test`. Database tests refuse another database name or an absent
explicit disposable-test marker. They test V135-to-V136 upgrade/history retention,
clean/replayed migrations, eighteen missing-ID dead letters, GET-only claims,
concurrent claims, stale claims, immutable dispatch, preserved reservations and
append-only correction evidence. Never point these tests at production or a
localhost tunnel to production.

The required XML gate refuses absent suites, missing cases, any failure/error or
any skipped refund test. Artifacts contain actual Surefire XML and a structured
summary. Local mocks/compilation are not PostgreSQL acceptance, real provider
certification or approval to issue a live refund. Root release evidence must
include final SHA/run IDs, exact runtime state and the historical cohort decision.
