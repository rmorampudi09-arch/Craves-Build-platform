# P123 — Critical E2E Journeys

## Status

PARTIAL at full environment/device E2E scope. The deterministic mobile critical-journey regression layer is implemented and CI-validated for every P123 capability that is truthfully supportable by the current branch. Environment- and contract-dependent gaps remain explicit and are not converted into fake success paths.

## Starting point

- Branch: `mobile-ui-rebuild-from-scratch`
- Starting HEAD: `5384d0a462efe12001e22a3377560e260b001ab2`
- Initial P123 implementation head: `87aedabf3a10c3c69b337aad82b3be8a5d02e061`
- Corrected and validated P123 implementation head: `fd654db1cee7f8f2ca226fa980757cda5b893ad7`
- P122 was already DONE at integration-test/CI scope before P123 started.
- P124 visual certification is not part of this phase and was not started.

## Guide / phase scope

`phases.md` defines P123 as critical E2E coverage for:

- auth,
- discovery/cart/checkout/payment outcomes,
- orders,
- reviews where supported,
- Chef order lifecycle,
- Chef menu,
- payout/subscription where supported.

Acceptance explicitly requires environment-dependent blockers to be documented rather than masked.

## Implemented deterministic journey coverage

`apps/mobile/__tests__/e2e/P123CriticalE2EJourneys.test.ts` exercises the existing production mobile boundaries without creating alternate stores, API clients, route contracts, or mock-only production code:

1. **Auth restoration** — authenticated Customer account resolution restores the intended Orders destination through the existing process-restoration contract.
2. **Discovery → cart → checkout → payment outcome** — an authoritative sellable dish passes pre-cart revalidation, the server cart snapshot is restored, checkout is created through the existing coordinator, the Cashfree handoff is prepared from the authoritative checkout/payment-order amount, and backend verification + checkout reconciliation produces a paid outcome.
3. **Customer orders / reviews** — unsupported cancellation remains fail-closed and the existing public catalog `REVIEWS` contract gap is asserted instead of fabricating review data or mutations.
4. **Chef order lifecycle** — a Chef accept decision advances through Preparing → Ready for Pickup → Delivered while stale operational snapshots cannot regress the lifecycle.
5. **Chef menu** — the supported Add Item journey is validated through the real Chef menu form/request builder.
6. **Payout / subscription / payment blockers** — unsupported server/native capabilities are asserted explicitly so a passing E2E suite cannot silently imply unsupported behavior is live.

A dedicated command is available as:

```bash
npm run test:e2e
```

from `apps/mobile`.

## Explicit blockers — not masked

### Native/device E2E harness

The current mobile workspace has Jest/integration coverage but no Detox/Appium/native E2E runner configured in `apps/mobile/package.json`. P123 therefore does not claim real-device automation, OTP entry, system permission dialogs, Cashfree SDK UI, process-kill behavior, or OS-level callbacks. P124–P126 remain the device/emulator visual-certification phases; P123 does not pre-implement them.

### Checkout server idempotency

`checkoutSessionCapability.serverIdempotencySupported` is `false` with blocker `CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_UNAVAILABLE`. The client coalesces duplicate taps but cannot truthfully claim server idempotency or automatic retry after an uncertain create outcome.

### Cashfree native launch / callback

`paymentHandoffCapability.nativeCashfreeLaunchSupported` is `false` with blocker `CASHFREE_NATIVE_PROVIDER_SDK_UNAVAILABLE`.

`paymentRecoveryCapability.nativeCashfreeCallbackAdapterSupported` is `false` with blocker `CASHFREE_NATIVE_PROVIDER_CALLBACK_UNAVAILABLE`.

The deterministic journey validates backend-owned payment-order creation, amount/checkout cross-checking, verification and checkout reconciliation. It does **not** simulate a native Cashfree authorization UI or callback as if the provider SDK were integrated.

### Reviews

The current public dish-detail contract explicitly records `REVIEWS` as unavailable: there is no authoritative customer dish review or aggregate-rating contract on the branch. P123 therefore asserts the gap and does not invent review endpoints, ratings or mutations.

### Customer order mutations

The Customer order domain intentionally keeps reorder/cancel/refund actions fail-closed where exact eligibility/mutation contracts are absent. P123 validates that boundary; it does not manufacture successful order mutations.

### Chef payout

The current Chef payout contract model is blocked. The Chef-owned earning ledger is a source-only reconciliation read and does not define withdrawable balance, payout transactions, bank destination, withdrawal eligibility or withdrawal initiation. P123 therefore validates the fail-closed withdrawal boundary rather than simulating a payout.

### Chef platform subscription

The current Chef platform-subscription contract is blocked. Existing customer meal-plan subscription routes are explicitly excluded because they are semantically different from a Chef buying/managing a CRAVES platform membership. P123 validates the fail-closed plan-mutation boundary and does not reuse those unrelated endpoints.

## Production/runtime changes

None. P123 is a test/evidence phase. No backend, APIM, OpenAPI, infrastructure, navigation, auth/session, persistence, payment provider, product API, UI or visual-reference implementation was changed.

## Validation

The first P123 CI attempt, run #472 / ID `31381310784`, failed during TypeScript because the initial package edit accidentally omitted the pre-existing `@react-navigation/native-stack` dependency from `apps/mobile/package.json`. The failure was deterministic (`npm ci` installed 1175 packages instead of the previous 1176) and was caused by the P123 package edit rather than a pre-existing source defect. P123 corrected only that package regression by restoring the exact existing dependency; no runtime feature code was changed.

**CRAVES Mobile Implementation CI** run **#473** / ID `31381639215` completed successfully for corrected implementation commit `fd654db1cee7f8f2ca226fa980757cda5b893ad7`.

Validation passed:

- `npm ci` installed the expected 1176 packages,
- TypeScript strict check,
- ESLint with zero warnings,
- full Jest: **133 suites / 604 tests passed**,
- `PASS __tests__/e2e/P123CriticalE2EJourneys.test.ts`,
- production Android JavaScript bundle generation,
- backend/APIM/infrastructure source guard.

The repository's previously recorded Jest post-run open-handle delay remains after all 604 tests pass, and existing non-failing React `act(...)` console warnings remain in lifecycle tests. P123 does not hide either condition or expand into unrelated cleanup.

## Phase boundary

P123 stops here. P124 — Customer Visual QA Refs 1–18 is not authorized or started by this change.
