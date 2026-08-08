# P61 — Favorites — Active Cart

## Status

**PARTIAL** at the implementation/static-contract scope defined by `phases.md`.

This evidence records only P61. **P62 — Notifications — Empty Cart was not implemented.**

## Authorization and authoritative inputs

The user authorized exactly one next phase on `mobile-ui-rebuild-from-scratch` after asking to verify the current state. `build.md` recorded P60 as PARTIAL and P61 as the next phase, so the authorized phase was P61.

Inputs checked before implementation:

- `agent.md`
- `build.md`
- applicable P61 section of `phases.md`
- `plan.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 20 — Favorites — Active Cart
- current Favorites route/screen ownership under `apps/mobile/src/features/favorites/**`
- existing shared cart selectors, View Cart overlay, route chrome policy, Profile stack ownership, and P59 active-cart pattern
- the P60 Favorites contract audit and explicit backend/APIM blocker
- branch HEAD immediately before the implementation write

## Starting and validated revisions

- Branch starting SHA before P61 work: `68f43a7c4a21fa3b26f7eaefb493ad562d237160`
- Validated P61 implementation SHA: `38016775de4301e39ef6b2f6ea9c1bb4fdb5cd3b`

## Reference 20 requirements reviewed

Reference 20 defines the active-cart state as the same logical `CustomerFavorites` route with:

- the Favorites composition plus active View Cart control;
- live cart line/count/total state;
- View Cart navigation to Cart;
- synchronized quantity changes and add-to-cart behavior;
- approved cart-conflict handling rather than silent failure;
- dynamic bottom inset so the final favorite remains reachable;
- no separate duplicate Favorites implementation or store.

The global guide rules also require View Cart to derive from shared cart state, disappear immediately at zero items, and avoid obscuring content.

## Contract boundary retained from P60

P61 does not widen the P60 Favorites API boundary. The current repository still exposes no approved Favorites APIM/backend contract for the server-backed list, search/counts, favorite remove/toggle, cross-surface heart membership, or favorite-row Add to Cart behavior.

P61 therefore does **not** invent:

- Favorites endpoints or response models;
- favorite rows or local-only account truth;
- Favorites pagination/search/category semantics;
- favorite mutation or optimistic synchronization behavior;
- a second Favorites store;
- cart compatibility rules that are not already authoritative in the accepted cart domain.

The P60 `CustomerFavoritesScreen` remains the one Favorites composition and continues to fail closed for unavailable server-backed Favorites data.

## P61 implementation completed

P61 implements the contract-independent active-cart boundary for Reference 20:

- `CustomerFavoritesRouteScreen` now owns state-driven active-cart chrome around the existing P60 `CustomerFavoritesScreen`; no duplicate Favorites screen was created.
- The wrapper reads the existing authoritative cart item count and food subtotal selectors; it does not copy cart state into Favorites.
- The existing shared `SharedViewCartOverlay` renders automatically on `CustomerFavorites` when the cart is active and remains absent at zero items.
- View Cart opens the already-registered real `CustomerCart` route in the same Profile stack, preserving the Favorites/Profile navigation origin.
- Live item count/subtotal display and overlay animation continue to come from the shared cart component rather than a Favorites-specific implementation.
- A Favorites-specific presentation helper adds bottom clearance only while View Cart is visible, preventing the floating control from covering the final Favorites content.
- When the authoritative cart returns to zero items, the overlay and added clearance disappear and the same route immediately returns to the P60 empty-cart presentation.
- Focused tests cover active-cart visibility, bottom-clearance switching, and zero-item return to the P60 state.

## Why P61 remains PARTIAL

The active cart shell is implemented, but the missing Favorites server contract prevents the populated Reference 20 interactions from being completed or truthfully tested. The following remain unavailable:

- server-backed favorite rows;
- favorite-row Add to Cart;
- favorite-row quantity selector changes;
- Favorites-to-cart compatibility/conflict decisions initiated from a favorite row;
- synchronization between favorite hearts and other customer surfaces;
- preserving populated Favorites list/search/filter/scroll state through favorite-row cart mutations;
- visual/reference certification of the populated active-cart Favorites state.

The P61 `phases.md` acceptance condition **"No duplicate favorite store" is satisfied**: P61 introduced no Favorites store at all and reused the P60 route plus the existing shared cart domain. The overall phase remains PARTIAL because the data-backed portion of the Reference 20 scope is blocked by the same exact-contract absence recorded in P60.

## Files changed

Implementation/test:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/favorites/customerFavoritesActiveCart.ts`
- `apps/mobile/src/features/favorites/customerFavoritesActiveCart.test.ts`
- `apps/mobile/src/features/favorites/screens/CustomerFavoritesRouteScreen.tsx`

Documentation:

- `docs/mobile-ui-rebuild/P61_FAVORITES_ACTIVE_CART.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration changed.

## Validation

Required workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated run:

- Run ID: `31273123021`
- Job ID: `93142321916`
- Head SHA: `38016775de4301e39ef6b2f6ea9c1bb4fdb5cd3b`
- Conclusion: **SUCCESS**

Successful gates:

- dependency install;
- TypeScript strict check;
- ESLint zero-warning gate;
- Jest;
- production Android JavaScript bundle;
- backend/APIM/infrastructure source guard.

No per-phase APK was generated, consistent with the rebuild policy.

## Acceptance result

P61 is **PARTIAL**.

The shared active View Cart state, live authoritative cart count/subtotal, real Cart navigation, dynamic content clearance, zero-item return, and no-duplicate-store rule are implemented and validated. Populated favorite-row quantity/Add-to-Cart/conflict/synchronization behavior remains blocked by the missing approved Favorites backend/APIM contract and was not fabricated.

Physical-device/reference-image certification remains deferred to the later visual QA/release phases.

## Exit / handoff

Stop here. **P62 — Notifications — Empty Cart remains NOT STARTED and is not authorized by this P61 task.**
