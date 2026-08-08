# P69 — Payment Method Add/Manage Provider Flow

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide refs:** payment-method provider/tokenization boundary following refs 27 and 28  
**Status:** **BLOCKED**  
**Execution type:** exact-contract/provider capability audit; no fabricated transport or credential collection

## Scope evaluated

P69 owns the exact tokenized payment-method setup/manage/delete/set-primary contract/provider flow defined in `phases.md`.

The phase was executed against the current branch contract and runtime boundaries. No production mutation flow was added because the required authoritative contract/provider capability is not present.

## Exact contract/provider audit

The inspected mobile payment runtime currently exposes only checkout-scoped payment-order operations:

- `POST /api/v1/payments/orders` using an authoritative `checkoutId`;
- `GET /api/v1/payments/orders/{paymentOrderId}`;
- `POST /api/v1/payments/orders/{paymentOrderId}/verify`.

These contracts create/read/verify a payment attempt for an existing checkout. They are not customer tokenized-method setup/list/delete/set-primary contracts and are not reused as if they were.

The existing `paymentHandoffCoordinator.ts` also records the runtime capability boundary explicitly:

- `tokenizedPaymentMethodContractSupported: false`;
- `nativeCashfreeLaunchSupported: false`;
- `PAYMENT_METHOD_TOKEN_CONTRACT_UNAVAILABLE`;
- `CASHFREE_NATIVE_PROVIDER_SDK_UNAVAILABLE`.

`requireNativeCashfreeProviderLaunch()` intentionally throws the native-provider blocker instead of pretending that provider authorization can launch.

The current `apps/mobile/package.json` has no Cashfree React Native/native provider SDK dependency. Therefore the branch cannot host a real provider-owned add/manage UI from this route today.

P68 additionally established that the approved mobile API does not expose an authoritative customer payment-method list/identity contract, cart/provider payment eligibility, or COD eligibility.

## Security/no-fabrication decision

P69 deliberately does **not**:

- add card-number, CVV, UPI PIN, net-banking credential, or similar sensitive inputs to React Native state;
- log or persist raw payment credentials;
- invent local saved-card/token rows;
- invent add/delete/set-primary API paths or request shapes;
- treat checkout payment-order creation as a saved-payment-method enrollment endpoint;
- mark a local method as primary when no backend primary-method mutation exists;
- allow removal of a primary method without an authoritative backend/product replacement rule.

This keeps the provider-tokenized security boundary from the master guide and satisfies the repository rule that missing exact contracts are blocked rather than guessed.

## Blockers

- `PAYMENT_METHOD_TOKEN_CONTRACT_UNAVAILABLE` — no exact customer tokenized method setup/list/delete/set-primary contract.
- `CASHFREE_NATIVE_PROVIDER_SDK_UNAVAILABLE` — no installed/wired native Cashfree provider SDK for provider-owned credential entry from the mobile runtime.
- Inherited P68 `CUSTOMER_PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE` — no authoritative masked stored-instrument list/identity response.

Because these blockers prevent every mutation required by P69's scope, the correct phase status is **BLOCKED**, not PARTIAL or DONE.

## Files changed for P69

- `docs/mobile-ui-rebuild/P69_PAYMENT_METHOD_ADD_MANAGE_PROVIDER_FLOW.md`
- `build.md`

No mobile production source, backend, APIM, OpenAPI, database, infrastructure, Android native source, Gradle/APK, or AAB configuration is intentionally changed for P69.

## Validation

Static contract/provider audit completed against the target branch:

- `apps/mobile/src/features/payment/api/paymentApi.ts` — verified checkout payment order create/read/verify only;
- `apps/mobile/src/features/payment/domain/paymentHandoffCoordinator.ts` — verified tokenized-method and native-provider launch blockers;
- `apps/mobile/package.json` — verified no Cashfree provider SDK dependency;
- `apps/mobile/src/features/payment/domain/paymentMethodTypes.ts` and P68 evidence — verified saved-method/eligibility contract gaps remain explicit.

The mobile implementation CI workflow triggers only for `apps/mobile/**` or workflow-file changes. P69 changes documentation/ledger only because production implementation is contract-blocked, so no new mobile CI run is expected from this checkpoint. The previously validated P68 mobile implementation remains unchanged.

## Handoff

```text
Executed phase: P69 — Payment Method Add/Manage Provider Flow — BLOCKED
Implemented production mutation flow: none; exact contracts/provider capability are absent
Verified available payment transport: checkout-scoped payment-order create/read/verify only
Blocked: tokenized method setup/list/delete/set-primary contract; native Cashfree provider launch/SDK; primary replacement rules
Security: no raw PAN/CVV/UPI PIN or other payment credentials added to app state/logs
P70 work: NOT STARTED
Next phase: P70 — NOT STARTED
Authorization for P70: NONE
```
