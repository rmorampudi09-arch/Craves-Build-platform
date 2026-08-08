# P59 — Customer Profile — Active Cart

## Status

**DONE** at the implementation/static-contract scope defined by `phases.md`.

This evidence records only P59. P60 — Favorites — Empty Cart was not implemented.

## Authorization and authoritative inputs

The user authorized exactly one next phase on `mobile-ui-rebuild-from-scratch` after asking to verify the current state. `build.md` already recorded P58 as DONE, so the authorized next phase was P59.

Inputs checked before implementation:

- `agent.md`
- `build.md`
- `phases.md`
- `plan.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 12 — Customer Profile — Active Cart
- `docs/mobile-ui-rebuild/P57_CUSTOMER_PROFILE_REWARDS_CONTRACT.md`
- `docs/mobile-ui-rebuild/P58_CUSTOMER_PROFILE_EMPTY_CART.md`
- the accepted customer cart domain, route-chrome policy, `SharedViewCartOverlay`, and existing Customer Cart route

The implementation follows the guide's active-cart state while preserving the repository's established navigation, state, query, and backend-contract ownership.

## Starting and validated revisions

- Branch starting SHA before P59 work: `cf4553fe7d37d2048ca76c9a851cb65ecb6c0ab7`
- Final validated implementation SHA: `0361027495ab2759f970a58d832fd151b5888bf4`

## P59 acceptance implemented

`phases.md` requires the Reference 12 active-cart variant to use the shared Profile route and preserve the customer cart while visiting profile subroutes.

Implemented:

- P58 `CustomerProfileScreen` remains the single Profile hub implementation; no duplicate active-cart Profile screen was created.
- A thin `CustomerProfileRouteScreen` now owns only the Profile root's state-driven cart chrome.
- The existing authoritative cart selectors provide live item count and the currently supported cart food subtotal; Profile does not copy cart state locally.
- The existing shared `SharedViewCartOverlay` renders automatically for an active cart, uses the accepted Espresso Brown cart treatment, and stays synchronized with the shared cart domain.
- View Cart opens the existing real `CustomerCart` destination inside the Profile stack, preserving the originating Profile route rather than resetting customer tab state.
- Dynamic bottom clearance keeps Profile content reachable above the floating View Cart control and customer bottom navigation.
- When the authoritative cart reaches zero items, the overlay and extra clearance disappear immediately and the same route returns to the P58 empty-cart layout.
- Existing Profile loading/error/unsupported/refresh behavior, customer header, bottom-nav scroll controller, Orders navigation, route blockers, and logout behavior remain unchanged.
- Focused tests cover Profile View Cart eligibility, active-cart content clearance, and automatic return to the empty-cart state.

No second cart store, Profile store, navigation container, API wrapper, or static state variant was introduced.

## Contract truthfulness and retained blockers

P59 does not widen the accepted P57 profile contract. The approved customer profile source remains:

```text
GET /api/v1/customer/profile
```

The following P57 capabilities remain explicitly unsupported because the accepted backend/profile contract does not expose them:

- rewards balance/tier/history;
- order aggregate counters;
- profile notification unread count;
- chef role/eligibility summary.

P58 route blockers also remain explicit for Edit Profile, Favorites, Payments, and Contact us. P59 does not pre-implement their later phases or fabricate routes.

Reference 12 also describes role-switch/cart-retention behavior. The current accepted profile/account contract does not expose an authoritative chef-role/eligibility summary for this Profile surface, so P59 does not invent a Switch to Chef action or assume cart-retention semantics. That capability remains fail-closed under the existing P57/P58 contract posture.

The shared View Cart overlay currently displays the authoritative cart domain's supported food subtotal. P59 does not fabricate taxes, fees, delivery quote, coupon-adjusted totals, or checkout totals outside that shared contract.

## Files changed

Implementation/test:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerProfile/customerProfileActiveCart.ts`
- `apps/mobile/src/features/customerProfile/customerProfileActiveCart.test.ts`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileRouteScreen.tsx`

Documentation:

- `docs/mobile-ui-rebuild/P59_CUSTOMER_PROFILE_ACTIVE_CART.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration changed.

## Validation

Required workflow: `.github/workflows/mobile-phase1-ci.yml`

Final validated run:

- Run ID: `31271923654`
- Job ID: `93139241176`
- Head SHA: `0361027495ab2759f970a58d832fd151b5888bf4`
- Conclusion: **SUCCESS**

Successful gates:

- dependency install;
- TypeScript strict check;
- ESLint zero-warning gate;
- Jest;
- production Android JavaScript bundle;
- backend/APIM/infrastructure source guard.

The implementation diff from the P58 documentation head through the validated P59 implementation contains only the intended mobile P59 source/test changes. No per-phase APK was generated, consistent with the rebuild policy.

## Acceptance result

P59 is **DONE** at its defined implementation/static-contract scope.

The supportable Reference 12 active-cart behavior is implemented through the shared Profile route: View Cart is live and synchronized with the authoritative cart, opens the real Cart route, preserves Profile/customer cart state, provides content clearance, and returns to the existing empty-cart layout at zero items. Unsupported chef-role/profile capabilities remain explicit rather than being fabricated.

Physical-device/reference-image certification remains deferred to the later visual QA/release phases.

## Exit / handoff

Stop here. **P60 — Favorites — Empty Cart remains NOT STARTED and is not authorized by this P59 task.**
