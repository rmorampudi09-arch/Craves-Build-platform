# P51 — Payment Success/Failure/Cancel Recovery Evidence

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** **PARTIAL**  
**Authorized scope:** P51 only. P52 was not started.  
**Starting branch head:** `d6dcf639836644b29e0a304333450a0891c84002`  
**Validated implementation commit:** `ce2a72cbf950b9a21389a55bcde748c60abbb4fd`

## 1. Authoritative phase scope

`phases.md` defines P51 as payment success/failure/cancel recovery: provider callback/deep-link result handling, authoritative backend verification, cancellation, and retry/recovery. The key acceptance boundary is that the client must never declare payment success from a provider callback alone and must reconcile current cart/order/checkout state safely.

The implementation follows `agent.md`, `plan.md`, and the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`: payments require authoritative confirmation, cancellation/failure recovery must be explicit, duplicate asynchronous work must be guarded, and unsupported contracts/native provider capability must fail closed rather than be fabricated.

## 2. Exact backend/APIM contracts audited

P51 uses the existing owned customer payment verification operation:

```text
POST /api/v1/payments/orders/{paymentOrderId}/verify
```

Request:

- Bearer-authenticated customer request;
- path UUID `paymentOrderId`;
- no request body.

Response:

```text
{
  paymentOrderId,
  status,
  providerStatus
}
```

where payment status is one of the existing server enum values:

```text
CREATED | PAYMENT_PENDING | PAID | FAILED | CANCELLED
```

P51 then reuses the exact owned checkout read operation for reconciliation:

```text
GET /api/v1/checkout/{checkoutId}
```

No endpoint, field, enum, callback payload, retry key, or provider status was invented.

## 3. Backend-authoritative verification behavior

Current Integration Service verification:

1. loads the owned payment order under the authenticated customer;
2. queries Cashfree server-to-server for the provider order;
3. records the returned provider `order_status`;
4. moves the Craves payment order to `PAID` only when the provider status is authoritatively `PAID`;
5. when paid, synchronously invokes the internal Order Service paid callback.

Order Service then marks the checkout paid and advances eligible checkout orders to `CHEF_ACCEPTANCE_PENDING`.

This means a Cashfree SDK callback, provider-return navigation event, error callback, cancellation signal, or app-resume event is only a reason to verify. It is never proof of payment success.

## 4. Mobile implementation

P51 extends the focused payment feature boundary:

- `apps/mobile/src/features/payment/domain/paymentTypes.ts`
- `apps/mobile/src/features/payment/api/paymentApi.ts`
- `apps/mobile/src/features/payment/domain/paymentHandoffCoordinator.ts`
- `apps/mobile/src/features/payment/domain/paymentRecoveryCoordinator.ts`
- `apps/mobile/src/features/payment/paymentRecovery.test.ts`

### Typed backend verification

`paymentApi.verifyOrder(...)` calls only the exact verify route. It validates the payment-order UUID before transport, validates the untrusted response shape/status/provider status, and rejects a returned payment-order ID that does not match the requested payment.

### Provider signal validation

The recovery coordinator models provider/application signals as triggers only:

- Cashfree verify callback;
- provider error;
- provider cancellation;
- app resume;
- explicit manual retry.

For a Cashfree verify callback, the returned Cashfree order ID must equal the server-issued order ID retained in the active handoff. A mismatch is rejected before a verification request is made.

### Authoritative success rule

P51 reports `SUCCEEDED` only when all of the following agree:

- backend verification reports payment `PAID`;
- the re-read owned checkout reports `PAID`;
- verification refers to the expected payment-order ID;
- checkout refers to the expected checkout ID;
- checkout authoritative grand total/currency still matches the handoff amount/currency.

Any contradictory authoritative state becomes `RECONCILING`, not success.

### Failure and cancellation recovery

A provider error or cancellation signal never directly marks the payment failed/cancelled. P51 still verifies with the backend and re-reads checkout state.

If the current backend remains `PAYMENT_PENDING`, the mobile recovery result remains `PENDING` and permits an explicit later verification retry. There is no unbounded polling loop.

`FAILED` or `CANCELLED` is surfaced only if the authoritative backend payment status itself carries that terminal value. A new payment attempt after a terminal failure/cancel is deliberately not enabled because the current create-payment behavior reuses the latest checkout payment order and no exact server new-attempt/reset contract exists.

### Duplicate recovery protection

Concurrent verification attempts for the same payment order are single-flighted. A second different payment cannot start recovery while another payment verification is active.

## 5. Missing native/retry capabilities

### Cashfree callback/deep-link adapter

The rebuild still lacks the reviewed Cashfree React Native SDK/native configuration recorded as missing in P50. Therefore P51 provides the typed recovery coordinator expected by a future native adapter but does not fabricate native callback registration or deep-link payload semantics.

Explicit blocker:

```text
CASHFREE_NATIVE_PROVIDER_CALLBACK_UNAVAILABLE
```

### New payment attempt after terminal failure/cancel

No exact current customer contract exists to create/reset a fresh provider payment order after a terminal failed/cancelled attempt. The current server create operation reuses the latest payment order for the checkout.

Explicit blocker:

```text
PAYMENT_TERMINAL_RETRY_CONTRACT_UNAVAILABLE
```

Additionally, current backend verification maps provider `PAID` to `PAID` but otherwise preserves the existing Craves payment status. Ordinary provider cancellation/failure therefore does not currently guarantee a terminal `FAILED`/`CANCELLED` status through this verify endpoint alone.

## 6. Security and correctness boundary

P51 does not:

- trust provider callbacks as payment success;
- mark checkout/order paid locally;
- collect or persist raw card, UPI PIN, or banking credentials;
- log payment-session IDs or provider credentials;
- invent callback/deep-link fields;
- invent a terminal-retry/new-attempt operation;
- retry verification in an uncontrolled polling loop;
- modify backend, APIM, OpenAPI, database, infrastructure, or native payment configuration.

## 7. Focused tests

`paymentRecovery.test.ts` verifies:

- exact backend verification response parsing;
- malformed provider status is rejected;
- success requires verified payment plus reconciled paid checkout;
- provider error cannot override authoritative paid state;
- provider cancellation with backend still pending remains recoverable/pending;
- terminal failure is accepted only from authoritative backend state;
- contradictory payment/checkout states become reconciliation state;
- mismatched Cashfree callback order IDs are rejected before verify;
- concurrent same-payment verification is coalesced;
- native callback wiring and terminal new-attempt behavior remain explicitly fail-closed.

## 8. Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Final run: `31264513219`
- Final job: `93120381991`
- Head: `ce2a72cbf950b9a21389a55bcde748c60abbb4fd`
- Conclusion: **SUCCESS**
- `npm ci`: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

An earlier P51 CI attempt (`31264432972`) reached TypeScript and ESLint successfully but failed one focused Jest assertion that checked the blocker error message instead of its typed error code. The assertion was corrected without changing the recovery behavior, and the final run above passed every required gate.

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## 9. Why P51 is PARTIAL

All currently supportable mobile recovery behavior through the existing authoritative contracts is implemented and CI-validated: exact backend verification, strict result validation, provider-return trigger safety, backend/checkout reconciliation, duplicate verification suppression, explicit pending/reconciling states, and manual verification retry.

Full P51 acceptance cannot be claimed because:

1. the reviewed Cashfree native SDK/callback/deep-link adapter is not installed/configured in the rebuild;
2. no exact server contract exists for starting a fresh provider payment attempt after a terminal failed/cancelled attempt; and
3. the current verify endpoint does not itself guarantee terminal FAILED/CANCELLED transitions for ordinary non-paid provider statuses.

These capabilities must be supplied/reviewed at their owning layer rather than fabricated by mobile.

## 10. Phase boundary

- P49 remains **PARTIAL** for its previously recorded missing checkout server idempotency/recovery contract.
- P50 remains **PARTIAL** for its tokenized-method and native provider-launch blockers.
- P51 is **PARTIAL** with all currently supportable mobile recovery behavior implemented and validated.
- P52 — Customer Orders Contract and Pagination was **not started**.
- No backend, APIM, OpenAPI, database, infrastructure, or Android native payment source was changed.
- Stop after P51 and wait for explicit authorization before any P52 work.
