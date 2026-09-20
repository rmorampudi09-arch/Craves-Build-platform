# Referral backend integration status

Backend continuation of PR #358. Frontend implementation remains deferred. This document describes implemented behavior, not evidence of a production launch. The user's engineering authorization includes the integration and verification work; outstanding business evidence is actual configuration data, not an additional permission request.

## Implemented owner boundaries

| Owner | Behavior | Failure boundary |
|---|---|---|
| Auth | New-account enrollment, immutable parent attribution, current terms, keyed contact evidence, transactional registration/status outbox | Existing logins never re-parent an account; no reward on signup |
| Order | Original financial snapshots, enrolled-participant lookup, durable binding, delivery and food-refund evidence, first qualifying checkout | Existing tax, gross totals, chef payable and cart rollback remain authoritative |
| Order checkout | Optional `referralBenefits` in the existing checkout request; durable atomic reservation, consumption, pre-payment cancellation and reviewed retry | A missing/disabled benefit runtime rejects opted-in payment or fulfilment; it cannot silently collect the gross amount |
| Integration payments | Frozen gross/wallet/discount/gateway funding, deterministic child allocations, durable provider creation receipt, recovery of the original provider order | Unknown creation cannot automatically issue another Razorpay order |
| Integration refunds | Gateway portion uses the existing hardened provider refund worker; wallet and discount funding restore cumulatively through the referral engine | Gross customer success is deferred until every tender is restored; no discount is paid out as customer cash |
| Finance | Balanced referral journal projection, gross funding capture, original earning snapshots, observed refund/capture/commission evidence | Chef payable is not a referral funding source |
| Finance reviews | Immutable recipient/bank-ownership/KYC/tax and marketing-funding evidence drafts; a different operator approves the exact content hash | No self-declared customer KYC or placeholder business approval is generated |
| Finance payouts | Persisted original attempt/destination/net/withholding, RazorpayX execution, verified receipt, unknown-result reconciliation and audited retry | No new transfer identity after an uncertain submission; unknown funds remain reserved |
| Operations | Independent referral schedulers; database leases, bounded retries, immutable recovery audit, operator queue counts and original-work replay APIs | Existing non-referral scheduled jobs retain their default scheduler |

## Authoritative Auth verification

Azure's observed Auth revision has its Redis revocation publisher disabled. The additive `GET /api/v1/auth/referrals/access` endpoint therefore supports direct, uncached verification by the referral engine. Auth's existing JWT and admin-session filters still run. The endpoint checks the current identity row, requires ACTIVE status and an exact token-version match, and returns only the intersection of current and token roles. It exposes no contact or bank information and makes no account writes.

Set `CRAVES_REFERRALS_AUTH_VERIFICATION_MODE=AUTH_HTTP` and `CRAVES_REFERRALS_AUTH_BASE_URL` to the actual trusted Auth HTTPS origin after deploying the endpoint with its source flag. The client forwards the original verified bearer token only to that fixed origin, disables redirects, bounds response size and concurrent calls, and uses two-second connection/read timeouts. Removed roles are stripped before referral authorization. Missing accounts, stale tokens, transport failures and malformed responses fail closed; there is no fallback to an empty Redis projection or cached positive result.

The deployment template supports this mode without Redis credentials; set `MANAGEMENT_HEALTH_REDIS_ENABLED=false` and readiness to `readinessState,db`. Request-level Auth verification remains mandatory even when the readiness probe is green. The prior `REDIS` mode remains available only with its validated publisher/TTL/absence contract. This change does not enable or modify the existing login revocation publisher.

Administrative routes use Craves' issued roles: `PLATFORM_ADMIN` and `PAYMENTS_ADMIN` may write; `AUDIT_ADMIN` may read only. Generic `ADMIN`, support and customer roles grant no administrative access. Administrative routes require `AUTH_HTTP`, so Auth verifies the existing bounded administrator session as well as current account/role state. Redis projection alone cannot authorize administrator sessions.

## Checkout API

The existing `POST /api/v1/checkout` accepts an optional field:

```json
{
  "deliveryAddressId": "<existing customer address UUID>",
  "note": "",
  "referralBenefits": {
    "walletPaise": "30000",
    "inviteeDiscount": true
  }
}
```

Money in the referral contract is an exact paise string. The amount is a customer preference; Order verifies the checkout and the engine independently enforces eligibility, wallet availability, active policy and discount funding. A failed combined reservation rolls back both legs. The response retains the original `grandTotal`, tax and per-chef totals and includes `referralBenefitsRequested=true`.

`GET /api/v1/checkout/{id}/referral-benefits` requires the checkout owner. State is `RESERVING`, `RESERVED`, `CONSUMING`, `CONSUMED`, `RELEASING`, `RELEASED` or `REVIEW`; a checkout without benefits returns `NONE`. Once reserved, `funding` contains gross, wallet, discount and gateway paise, reservation IDs and policy context.

The existing payment creation endpoint reads that owner response server-side. It never accepts a browser-supplied net total. Finance checks the immutable quote and issued child snapshots and freezes the tender plan before contacting the payment provider. Each child receives an exact deterministic allocation bounded by its original price. The allocation survives every retry and is reused for refunds.

A zero-gateway checkout uses explicit `REFERRAL_WALLET` tender with amount zero and null provider payment/order identities. It initially remains pending. Finance confirms consumption with Order, which requires the engine's durable receipt, before recording funded payment. No fabricated Razorpay payment is created.

Customer cancellation uses `POST /api/v1/payments/referral-checkouts/{id}/cancel`. It is permitted only before provider creation starts and before any payment row exists. Finance first persists a cancellation interlock, then Order releases the original reservations and records checkout/child cancellation history. If provider creation has started or is uncertain, cancellation cannot release those reservations.

## Refund behavior

The existing authoritative refund-request contract supports full child refunds for chef decline and acceptance timeout. Referral integration requires the exact frozen child gross; an unallocated partial amount is rejected for review. This is the existing source contract's limit, not evidence that arbitrary partial or post-delivery refunds are implemented.

The source inbox retains its original payload and tracing IDs. The existing provider refund row contains only that child's gateway allocation. Zero-gateway portions enter `BENEFITS_PENDING` and cannot dispatch a provider refund. Recognized internal tender is excluded from the legacy gateway-unknown exposure check only when its original funding and allocation match.

After gateway success, the referral refund worker sends one durable cumulative operation per checkout version. Wallet credit returns to the buyer's wallet; discount funding returns to the marketing budget, without re-enabling the customer's one-use discount. If the response is lost, the original operation ID/body is replayed. The customer receives the original gross refund status only after both restorations succeed and Finance posts a balanced journal. An unresolved child cannot cause another checkout's refund queue to stall.

## Finance review APIs

All endpoints below require `PAYMENTS_ADMIN` or `PLATFORM_ADMIN`; read endpoints also allow `AUDIT_ADMIN`.

- `POST /api/v1/admin/finance/referrals/reviews`: immutable draft with `kind`, `payload`, `fundAccountId`, `contactId`, `evidenceRef` and `reason`.
- `GET /api/v1/admin/finance/referrals/reviews?limit=50`: bounded review inventory.
- `POST /api/v1/admin/finance/referrals/reviews/{id}/approve`: `expectedHash` and `reason`; the approving operator must differ from the draft author.
- `GET /api/v1/admin/finance/referrals/payouts?limit=50`: instructions and execution state.

`RECIPIENT` payload is the existing `recipient.assessed` contract: assessment/user IDs, Indian financial year, verified KYC and expiry, opaque destination reference, tax-assessment reference/handling, cashout permission, annual limit, assessment time and optional annual-threshold review reference. Bank ownership/KYC/tax evidence must be actual reviewed records. RazorpayX fund-account/contact identity is independently fetched before draft and approval. Draft and approval reasons and reviewed hashes are audited.

`FUNDING` payload is the existing `budget.funded` contract: funding UUID, `CUSTOMER` or `DISCOUNT` track, exact positive amount and actual funding evidence reference. Approval publishes a source-owned durable event; it does not invent a bank transfer or authorize unreviewed budget.

## Payout execution and recovery

Execution requires `CRAVES_REFERRAL_PAYOUT_EXECUTION_ENABLED=true`, the existing separate RazorpayX payout credentials and `craves.razorpayx.production-approved=true`. Customer collection credentials are not reused.

Before network submission, Finance freezes the core's original attempt ID, approved assessment/destination and exact net/withholding. The provider idempotency key and reference use that attempt ID. The referral narration is separate; the existing chef payout method retains its original narration and behavior.

A processed result requires a transfer reference. Finance posts net clearing and sends original-amount payout evidence to the engine, which releases reserved liability and records any withholding. A timeout or response mismatch becomes `UNKNOWN`; it cannot create another transfer. If no provider ID was obtained, an operator identifies the original payout and supplies it to:

`POST /api/v1/admin/finance/referrals/payouts/{attemptId}/reconcile`

The request includes `providerId`, `evidenceRef` and `reason`. A read-only provider lookup verifies original reference, beneficiary, amount and currency before reconciliation resumes. Known IDs are fetched; they are never POSTed again. A failed submission response requires a subsequent verified GET before funds are released as proven failed. Reversed or ambiguous results remain unresolved. Every operator retry records the previous attempt count and original identity.

Unknown customer payment creation has a corresponding read-only recovery endpoint:

`POST /api/v1/admin/finance/referrals/checkouts/{id}/recover-provider-order`

It accepts `providerOrderId`, `evidenceRef` and `reason` and verifies the original receipt, amount and currency. It does not create a replacement order.

## Operational replay and isolation

`GET /api/v1/admin/finance/referrals/operations` reports bounded status counts for source outbox, consumer inbox, checkout funding, split refunds and payouts.

`POST /api/v1/admin/finance/referrals/operations/{kind}/{id}/retry` requeues blocked `checkouts`, `refunds`, `cancellations`, `inbox` or `outbox` using a repair reason and evidence reference. Economic IDs, bodies, allocations and provider identities remain immutable. It cannot submit a payout.

Order's counterpart is `POST /api/v1/checkout/referral-operations/{id}/retry`, restricted to Finance administrators. Its audit is append-only and its retry resumes the original reserve/consume/release operation.

Referral work has named schedulers separate from existing jobs: two threads in Auth and Order, four in Integration. Database claims use leases and `SKIP LOCKED`. Expired workers cannot acknowledge another worker's lease. Unknown external payment/payout creation is handled more conservatively than retryable internal operations.

Production alert delivery, observed throughput, capacity limits, backup restore and full network acceptance remain deployment gates. Queue durability and a count endpoint are not substitutes for those checks.

## Release flags and migrations

Owners retain `CRAVES_REFERRAL_SOURCE_ENABLED=false` by default. Order and Integration add `CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED=false`. Integration adds `CRAVES_REFERRAL_PAYOUT_EXECUTION_ENABLED=false`. Enable the owner/source dependencies together only on the tested release. Preserve recovery workers until outstanding financial work is drained; disabling new benefit selection must not erase outstanding reservations.

The engine's seven public/execution switches remain false by default. Its cashout minimum, annual KYC threshold and lifetime-review threshold remain zero until actual reviewed positive values are supplied. The engine's policy still requires actual legal, terms, tax, privacy, funding, multi-chef and payout references and two different approving administrators. This implementation does not supply or fabricate those facts.

Additive continuation migrations are Order V31/V32, Integration V140–V143 and isolated Referral V8. Prior integration migrations remain required. Historical migration contents are unchanged. Owner migrations run under their existing schema ownership; the referral engine has its separate migrator/history and restricted runtime role.

## Verification and production status

Run `bash scripts/referrals/test-backend.sh` with the explicitly disposable PostgreSQL environment documented by `.github/workflows/referral-backend-ci.yml`. The script runs all four affected services, preserves a failing exit status, validates the executable referral JAR/SBOM and all nine packaged migration resources, and rejects absent/failed/skipped required suites.

Tests cover atomic combined benefits, earned wallet fixtures, cross-source authorization, exact paise allocation, multi-chef cumulative refunds, no-provider wallet payment/refund, original provider identity on retry, lost outer commits, immutable evidence, worker leases, distinct review actors, zero-tender legacy exposure, pre-payment cancellation, runtime-disable protection and existing service regressions. Provider results and customer/finance evidence in these tests are explicitly synthetic.

The source PR remains separate from production. Azure observations before this continuation showed 11 existing apps Succeeded/Running and no referral app. Auth/Order deploy from `release/admin-explorer-consumption-v1`; Integration deploys a main-based release. Current main contains unrelated Auth/Order changes, so a deployment must use a reconciled, tested owner baseline rather than replacing their images with arbitrary main builds.

Do not label this production-complete from the presence of code or a green build. Archive the exact final source SHA and CI evidence, verify restricted-role and live private-network behavior, deploy the bounded candidate, check all existing service revisions/health, and complete authenticated end-to-end acceptance. Programme activation additionally requires the actual business evidence and thresholds described above.
