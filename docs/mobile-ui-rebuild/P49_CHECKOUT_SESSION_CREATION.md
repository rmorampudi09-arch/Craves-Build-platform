# P49 — Checkout Session Creation Evidence

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** **PARTIAL**  
**Authorized scope:** P49 only. P50 was not started.  
**Starting branch head:** `a08b70a2a9ac1f28435172abf70f11504512c224`  
**Validated implementation commit:** `f722df0382b5dbe70dd500aae6bf6bab17b7074e`

## 1. Authoritative phase scope

`phases.md` defines P49 as checkout session creation with the exact checkout intent/session contract, idempotency, and authoritative eligibility revalidation. Its acceptance criterion requires duplicate checkout CTA taps to be unable to create duplicate checkout/order side effects.

The implementation followed the contract-first and fail-closed rules in `agent.md`, `plan.md`, and the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`. No backend, APIM, OpenAPI, database, infrastructure, payment, or native-build source was changed.

## 2. Exact backend contract audited

Current Order Service source provides:

```text
POST /api/v1/checkout
GET  /api/v1/checkout/{checkoutId}
```

The exact create request is:

```text
CheckoutRequest(UUID deliveryAddressId, String note)
```

The checkout response includes the server-owned checkout ID/status/currency, food subtotal, platform fee, tax amount, delivery fee, grand total, charge policy ID, delivery address ID/snapshot, child orders, and creation timestamp.

The Order Service create operation itself performs authoritative revalidation before persistence:

- customer role/session ownership;
- required saved delivery address and address ownership;
- cart validation;
- active menu-item lookup;
- kitchen lookup/grouping;
- current charge-policy lookup;
- server-side charge calculation;
- checkout/order persistence;
- cart clearing after creation.

This is the authoritative creation/revalidation boundary. Mobile does not calculate checkout totals.

## 3. Server idempotency audit

The current checkout controller/service does **not** expose or persist an idempotency key, checkout-intent key, request key, or equivalent replay contract for `POST /api/v1/checkout`.

The create service generates a new random checkout ID and inserts checkout/order rows for each accepted invocation. There is also no exact read/recovery contract that resolves an uncertain create outcome from a client-owned intent key.

Therefore P49 does **not** invent an `Idempotency-Key` header or automatically retry checkout creation after a timeout/network/5xx/invalid-response outcome.

Explicit blocker:

```text
CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_UNAVAILABLE
```

## 4. Mobile implementation

Added a typed checkout feature boundary:

- `apps/mobile/src/features/checkout/domain/checkoutTypes.ts`
- `apps/mobile/src/features/checkout/api/checkoutApi.ts`
- `apps/mobile/src/features/checkout/domain/checkoutSessionCoordinator.ts`
- `apps/mobile/src/features/checkout/checkoutSession.test.ts`

### Typed create/read transport

`checkoutApi` now owns the exact supported checkout endpoints and validates untrusted response data before accepting it as a checkout session.

Create requires a valid saved-address UUID, sends only the exact supported request fields, validates authoritative server-owned totals/status/IDs/order linkage, and rejects a response whose returned delivery address does not match the request.

Read validates the checkout UUID, deduplicates safe GETs through the shared HTTP layer, validates the returned session, and rejects checkout-ID mismatches.

### Duplicate-tap protection

`createCheckoutSessionCoordinator` creates a stable intent identity from:

- authoritative cart ID;
- cart client revision;
- delivery address ID;
- optional note.

For the same runtime intent it:

- coalesces duplicate in-flight create calls onto one Promise;
- reuses the already-successful session rather than issuing the POST again;
- blocks a different checkout intent while creation is still in flight.

This prevents ordinary rapid duplicate CTA taps from producing multiple mobile POSTs.

### Uncertain-outcome fail closed

Because the server has no idempotency/recovery contract, an uncertain create failure is not safe to replay. After a transport/timeout/retriable-server/invalid-response style failure, the coordinator marks that exact intent outcome uncertain and refuses another create call for the same intent.

Only a definitive non-retriable client rejection (for example a 400 validation response) releases the same intent for a corrected retry.

The shared HTTP retry policy already excludes POST from automatic retries, so checkout creation is not replayed by generic transport retry logic.

## 5. Focused tests

`checkoutSession.test.ts` verifies:

- authoritative checkout session and server totals are parsed;
- child orders must belong to the returned checkout;
- duplicate create taps are single-flight;
- a successful same-intent result is reused without another POST;
- a different intent is blocked while creation is active;
- an uncertain transport outcome cannot be replayed for the same intent;
- a definitive 400 rejection can be retried after correction;
- the missing server idempotency contract remains explicit rather than fabricated.

## 6. Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run: `31262925706`
- Job: `93116408514`
- Head: `f722df0382b5dbe70dd500aae6bf6bab17b7074e`
- Conclusion: **SUCCESS**
- `npm ci`: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## 7. Why P49 is PARTIAL

The safe/supportable mobile foundation is complete for the contract that exists, including same-runtime duplicate-tap suppression and fail-closed uncertain-outcome behavior.

Full P49 acceptance cannot be claimed because true retry-safe idempotency must survive network uncertainty/process restart and be enforced at the authoritative create boundary. The current server contract has no idempotency key/replay result and no intent-based recovery lookup. Client memory alone cannot prove that a lost-response POST did or did not create checkout/order rows.

Required contract to finish P49: an authoritative server-owned idempotency/recovery mechanism for checkout creation, with an exact request/response contract that lets duplicate/replayed create attempts resolve to the same checkout result without duplicate order side effects.

## 8. Phase boundary

- P48 remains **PARTIAL** for its previously recorded missing pre-checkout address-aware quote/reprice contract.
- P49 is **PARTIAL** with all currently supportable mobile behavior implemented and validated.
- P50 — Payment Eligibility and Provider Handoff was **not started**.
- Stop after P49 and wait for explicit authorization before any P50 work.
