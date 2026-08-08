# P50 — Payment Eligibility and Provider Handoff Evidence

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase status:** **PARTIAL**  
**Authorized scope:** P50 only. P51 was not started.  
**Starting branch head:** `8ca9677dfb28cfd01a1fca0399d9e32f02924bd5`  
**Validated implementation commit:** `3af5efb9caa46d13523858c4e65ac31c7cb776bf`

## 1. Authoritative phase scope

`phases.md` defines P50 as payment eligibility and provider handoff using the project-approved payment provider, with tokenized methods/provider launch where exact contracts and native capability exist. The acceptance boundary forbids raw card/UPI credentials in application state/logs and requires payment execution to remain an immersive transactional flow.

The implementation followed `agent.md`, `plan.md`, and the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`: exact repository contracts were audited first, unsupported payment capability was kept fail-closed, and no backend/APIM/infrastructure/native payment contract was invented.

## 2. Exact backend and APIM contract audited

Current Integration Service and APIM expose these owned customer payment operations:

```text
POST /api/v1/payments/orders
GET  /api/v1/payments/orders/{paymentOrderId}
POST /api/v1/payments/orders/{paymentOrderId}/verify
```

P50 implements only the create/read preparation boundary. The verify operation is intentionally reserved for P51 — Payment Success/Failure/Cancel Recovery.

The exact create request supports `checkoutId` plus optional customer/provider metadata. Mobile sends only the authoritative checkout ID because the server already owns checkout/customer identity and default provider metadata; no provider credential or payment instrument is fabricated by the client.

The create response supplies the server-owned payment-order ID, checkout ID, Craves provider reference, Cashfree order IDs, payment-session ID, authoritative amount/currency, payment status, and creation time. The read response is ownership-validated and intentionally does not expose the payment-session ID.

APIM operation IDs audited:

- `create-customer-payment-order`
- `get-customer-payment-order`
- `verify-customer-payment-order`

The APIM policy requires Bearer authorization and marks responses no-store/no-cache.

## 3. Authoritative eligibility and amount ownership

Integration Service `PaymentService.createPaymentOrder(...)`:

- requires an authenticated customer Bearer token;
- fetches the owned checkout from Order Service;
- rejects an invalid checkout lacking checkout ID, customer identity, or grand total;
- reuses the latest existing payment order found for the checkout under ordinary sequential execution;
- creates the provider order using the checkout's authoritative `grandTotal` and currency;
- keeps Cashfree credentials/server defaults on the server;
- returns the provider payment-session material needed for native/provider handoff.

Mobile therefore does not calculate a payable amount and does not collect or transmit raw card, UPI PIN, or banking credentials.

## 4. Missing provider capabilities audited

### Tokenized payment methods

No exact current customer API contract was found for listing/managing/selecting saved tokenized cards, UPI instruments, wallets, COD, or net-banking capabilities. P50 therefore does not fabricate a payment-method list or local eligibility model.

Explicit blocker:

```text
PAYMENT_METHOD_TOKEN_CONTRACT_UNAVAILABLE
```

### Cashfree native provider launch

The current rebuild `apps/mobile/package.json` does not contain the Cashfree React Native SDK. Historical payment handover documentation names `react-native-cashfree-pg-sdk` and explicitly records native dependency installation as pending. P50 therefore does not add an unreviewed native dependency or pretend that provider launch is available.

Explicit blocker:

```text
CASHFREE_NATIVE_PROVIDER_SDK_UNAVAILABLE
```

## 5. Mobile implementation

Added a focused payment feature boundary:

- `apps/mobile/src/features/payment/domain/paymentTypes.ts`
- `apps/mobile/src/features/payment/api/paymentApi.ts`
- `apps/mobile/src/features/payment/domain/paymentHandoffCoordinator.ts`
- `apps/mobile/src/features/payment/paymentHandoff.test.ts`

### Typed create/read transport

`paymentApi.ts` validates untrusted payment-order payloads before accepting them. It validates IDs, status, currency, non-negative decimal amount, provider references, payment-session presence for create, and timestamps.

Create uses only:

```json
{"checkoutId":"<authoritative checkout UUID>"}
```

Read uses the exact owned payment-order route and safe GET deduplication. Create/read ID mismatches fail closed.

### Checkout/payment cross-check

Before a Cashfree handoff descriptor can be prepared, mobile requires:

- checkout status `PAYMENT_PENDING`;
- payment-order checkout ID equal to the current checkout ID;
- provider payment amount/currency equal to the authoritative checkout grand total/currency;
- payment-order status `PAYMENT_PENDING`.

Amount comparison canonicalizes decimal strings rather than performing client-side business-price arithmetic.

### Duplicate-tap protection

`paymentHandoffCoordinator` single-flights repeated preparation taps for the same checkout so normal duplicate taps do not issue multiple mobile create-payment calls. A different checkout is blocked while a payment preparation is active.

The server's existing find-by-checkout behavior is reused but is not misrepresented as a formal concurrency-safe idempotency contract.

### Provider handoff capability gate

When the create response is valid, P50 can construct a typed Cashfree handoff descriptor containing only server-issued provider order/session identifiers and authoritative amount metadata.

Actual native provider launch remains deliberately unavailable until the project-approved Cashfree SDK is installed/configured and reviewed. Calling the launch gate fails closed with `CASHFREE_NATIVE_PROVIDER_SDK_UNAVAILABLE`; there is no fake success path.

## 6. Security boundary

P50 does not:

- collect or store raw card data;
- collect or store UPI PINs or banking credentials;
- embed Cashfree client secrets;
- log payment-session IDs or credentials;
- persist the provider payment-session ID in general-purpose storage;
- invent tokenized payment instruments;
- mark payment successful;
- call payment verification or process callbacks owned by P51.

## 7. Focused tests

`paymentHandoff.test.ts` verifies:

- exact create-payment response parsing;
- exact owned read-response parsing without exposing a payment-session field;
- checkout ID and authoritative amount/currency cross-checking;
- terminal checkout rejection;
- duplicate preparation tap coalescing;
- raw payment credential collection remains forbidden;
- tokenized-method and native-provider capabilities remain explicitly unavailable;
- native provider launch fails closed with the expected blocker code.

## 8. Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run: `31263886724`
- Job: `93118801738`
- Head: `3af5efb9caa46d13523858c4e65ac31c7cb776bf`
- Conclusion: **SUCCESS**
- `npm ci`: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## 9. Why P50 is PARTIAL

Every safe/supportable P50 behavior available through the current authoritative mobile/backend contract is implemented and CI-validated: owned payment-order creation/read, authoritative checkout/amount cross-checking, duplicate preparation suppression, secure provider-session modeling, and an explicit provider-launch boundary.

Full P50 acceptance cannot be claimed because the rebuild currently lacks:

1. an exact customer tokenized payment-method/eligibility contract; and
2. the project-approved Cashfree React Native SDK/native configuration required to actually launch provider authorization.

Those capabilities must be supplied/reviewed rather than fabricated by the mobile rebuild.

## 10. Phase boundary

- P49 remains **PARTIAL** for its previously recorded missing checkout server idempotency/recovery contract.
- P50 is **PARTIAL** with all currently supportable mobile behavior implemented and validated.
- P51 — Payment Success/Failure/Cancel Recovery was **not started**.
- No backend, APIM, OpenAPI, database, infrastructure, payment-provider server source, or native Android payment configuration was changed.
- Stop after P50 and wait for explicit authorization before any P51 work.
