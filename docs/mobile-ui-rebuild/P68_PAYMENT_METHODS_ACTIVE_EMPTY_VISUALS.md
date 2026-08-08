# P68 — Payment Methods Active/Empty Visuals

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide refs:** 27 and 28  
**Status:** **PARTIAL**  
**Validated implementation head:** `d044bf7bb545875302eb23d5ba5aa00fcbc18574`  
**CI:** `31281213495` / `93162733549` — **SUCCESS**

## Scope executed

P68 implements only the Payment Methods active-cart / empty-cart visual and route boundary defined in `phases.md`. P69 provider add/manage/tokenization mutations were not started.

Implemented:

- Shared typed `CustomerPaymentMethods` route registered in every customer tab stack so the route preserves the active customer stack.
- Profile → Payments now opens the real Payment Methods destination rather than the prior route blocker.
- One state-aware screen distinguishes empty-cart and active-cart presentation using the canonical cart domain.
- Cards, UPI, wallets, net banking, and COD capability groups are represented without fabricating provider instruments.
- Active-cart mode reuses `SharedViewCartOverlay`; empty-cart mode inherits its zero-item hiding behavior.
- The Payment Methods scroll participates in the existing customer bottom-nav hide/reveal controller.
- Cart snapshot loading/error/retry states are handled without treating stale/local cart state as payment eligibility.
- Existing Cashfree handoff/verification ownership is described truthfully: provider return alone is never accepted as payment success.
- Session payment-selection state is isolated in the payment feature and is cleared during logout.
- Focused P68 model tests cover empty-cart behavior, active-cart non-inference, and COD blocking.
- Existing customer Profile model test was updated because Payments is now a registered route in P68.

## Contract audit / no-fabrication boundary

The existing payment runtime provides Cashfree payment-order creation/read/verify infrastructure, but the inspected approved mobile contract does **not** expose:

1. customer tokenized payment-method list data;
2. cart/provider payment-method eligibility;
3. COD eligibility for the current cart/address/order context.

Therefore P68 does **not** synthesize saved cards/UPI/wallet identifiers, does not infer that online payment is eligible merely because a cart is active, and does not infer COD availability.

Explicit blockers retained in the P68 domain:

- `CUSTOMER_PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE`
- `CUSTOMER_PAYMENT_ELIGIBILITY_CONTRACT_UNAVAILABLE`
- `CUSTOMER_COD_ELIGIBILITY_CONTRACT_UNAVAILABLE`

All unverified payment choices are disabled and annotated. `selectedMethodId` remains null until an authoritative eligibility contract can support a real selectable method. This is deliberate compliance with the guide requirement that ineligible/unverified options be disabled rather than allowed to fail later.

## Why P68 is PARTIAL

The active/empty visuals, route integration, canonical cart behavior, capability grouping, accessibility state, and safe disabled boundaries are implemented and validated. P68 cannot truthfully render masked stored instruments or a real primary selectable method without the missing token-list and eligibility contracts above.

P69 owns provider add/manage/tokenization/delete/set-primary behavior. Those flows are **NOT STARTED** and were not fabricated in P68.

## Files owned/changed for P68

- `apps/mobile/src/features/payment/domain/paymentMethodTypes.ts`
- `apps/mobile/src/features/payment/state/paymentMethodSlice.ts`
- `apps/mobile/src/features/payment/screens/CustomerPaymentMethodsScreen.tsx`
- `apps/mobile/src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx`
- `apps/mobile/src/features/payment/paymentMethods.test.ts`
- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerProfile/presentation/customerProfileUiModel.ts`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx`
- `apps/mobile/src/features/customerProfile/customerProfileUiModel.test.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `docs/mobile-ui-rebuild/P68_PAYMENT_METHODS_ACTIVE_EMPTY_VISUALS.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P68.

## Validation

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated on implementation head `d044bf7bb545875302eb23d5ba5aa00fcbc18574`:

- dependency install — **SUCCESS**
- TypeScript strict check — **SUCCESS**
- ESLint — **SUCCESS**
- Jest — **SUCCESS**
- production Android JavaScript bundle — **SUCCESS**
- backend/APIM/infrastructure source guard — **SUCCESS**

The first P68 validation run correctly failed Jest because an existing Profile UI-model test still asserted that Payments was a blocked later route. Production behavior was not weakened; the test was updated to the new P68 route contract, and the full gate then passed.

No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## Handoff

```text
Executed phase: P68 — Payment Methods Active/Empty Visuals — PARTIAL
Validated implementation head: d044bf7bb545875302eb23d5ba5aa00fcbc18574
CI: 31281213495 / 93162733549 — SUCCESS
Implemented: shared Payment Methods route; empty/active cart states; payment capability groups; canonical active View Cart; empty-cart hiding; bottom-nav scroll behavior; explicit no-fabrication blockers; logout cleanup; focused tests
Blocked: no approved customer payment-method list contract; no cart/provider payment eligibility contract; no COD eligibility contract
Next phase: P69 — Payment Method Add/Manage Provider Flow — NOT STARTED
Authorization for P69: NONE
```
