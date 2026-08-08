# P60 — Favorites — Empty Cart

## Status

**PARTIAL** at the implementation/static-contract scope defined by `phases.md`.

This evidence records only P60. **P61 — Favorites — Active Cart was not implemented.**

## Authorization and authoritative inputs

The user authorized exactly one next phase on `mobile-ui-rebuild-from-scratch` after asking to verify the current state. `build.md` already recorded P59 as DONE, so the authorized next phase was P60.

Inputs checked before implementation:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 19 — Favorites — Empty Cart
- current customer navigation/profile/cart/discovery/detail owners under `apps/mobile/src/**`
- current backend route ownership under `apps/api/**`
- current APIM ownership under `infra/apim/**`
- the prior P02 APIM/OpenAPI contract inventory
- the existing customer-web wishlist implementation only as repository evidence, not as a mobile/server contract

## Starting and validated revisions

- Branch starting SHA before P60 work: `ccc12612eb976684360cac40cee0e1988a0c9ee7`
- Validated P60 implementation SHA: `b98dcfc79c99680487e27363dc5172884cdf6e07`

## Reference 19 requirements reviewed

Reference 19 describes a shared logical `CustomerFavorites` route for the empty-cart state with:

- server-backed paginated favorites;
- search and category filtering/counts;
- synchronized favorite heart state and remove behavior;
- opening Dish Detail;
- Add to Cart while preserving list/search/filter/scroll state;
- location/notification header and customer bottom navigation;
- View Cart hidden at zero items and transition to active-cart behavior after the first successful add;
- loading, empty, error/offline, mutation, and recovery states.

`phases.md` additionally requires the favorite heart to stay synchronized across all surfaces.

## Exact contract audit

P60 re-audited the current branch before adding any Favorites network code.

### Findings

1. `infra/apim/**` has no Favorites/customer-favorites APIM domain or exact Favorites operation mapping.
2. `apps/api/**` exposes no approved Favorites list/search/count/remove/toggle route.
3. The earlier P02 inventory records the authoritative full OpenAPI as absent and requires later feature phases to re-establish exact contracts before implementing new wrappers.
4. The current mobile source has no existing server-backed Favorites API/query owner to extend.
5. `apps/customer-web-next/src/services/api/cravesWishlist.ts` is a browser `localStorage` wishlist. It is explicitly **not** treated as account/server truth for the mobile rebuild and is not copied into mobile state.

Therefore P60 cannot safely infer any Favorites endpoint path, HTTP method, pagination shape, query parameters, response schema, category-count semantics, remove/toggle mutation, optimistic concurrency rule, or cache invalidation contract.

### Fail-closed capability boundary

P60 adds a typed capability record under:

- `apps/mobile/src/features/favorites/domain/customerFavoritesContract.ts`

The following remain explicitly `unsupported` until an exact approved backend/APIM contract exists:

- paginated Favorites list;
- Favorites search;
- category counts;
- remove favorite;
- cross-surface favorite-membership synchronization.

No fake endpoint, static favorite fixture, AsyncStorage/local-only account truth, or copied customer-web wishlist behavior was introduced.

## P60 implementation completed

The safe, contract-independent portion of Reference 19 is implemented:

- `CustomerFavorites` is now a typed route inside the existing Customer Profile stack.
- The Profile `Favorites` row now performs real navigation to that route instead of showing the prior generic route blocker.
- The Profile stack registers the already-owned Dish Detail / Ingredients / Kitchen Profile / Kitchen Dishes child routes so future server-backed favorite rows can reuse the accepted detail journey without a second navigation contract.
- The shared icon set now includes a Favorites heart icon, and the Profile row uses it.
- `CustomerFavoritesScreen` renders the accepted customer header, location selector, bottom-nav scroll behavior, Favorites identity, a truthful unsupported lifecycle state, and a real `Browse meals` recovery action back to the Home tab.
- The unsupported state clearly avoids implying that an empty server list was returned; unavailable contract capability is not misrepresented as "no favorites".
- The P60 empty-cart route does not add a duplicate cart store, copied cart state, fake View Cart amount, or local Favorites cache.
- Focused unit coverage verifies the explicit unsupported capability boundary and the updated Profile menu action mapping.

## Why P60 remains PARTIAL

The core P60 data acceptance cannot be completed without an approved Favorites server contract. The following Reference 19 behaviors are **not implemented/accepted**:

- paginated favorite rows;
- server-backed search and category counts;
- heart remove/toggle mutation;
- optimistic remove animation/undo/rollback;
- favorite synchronization across Home, Chefs, Dish Detail, Kitchen, and Favorites;
- availability-aware Add to Cart from a favorite row;
- preserving Favorites search/filter/scroll through an Add to Cart transition;
- authoritative loading/empty/offline/error pagination states for the missing Favorites request;
- exact visual/reference certification for the populated Favorites list.

Because no authoritative favorite row can be loaded, P60 also cannot truthfully exercise the Reference 19 "first add reveals View Cart" transition. **P61 — Favorites — Active Cart remains NOT STARTED.** If a user enters the P60 route while a cart is already active, the P61 active-cart Favorites chrome is not claimed by this phase.

The `phases.md` acceptance statement "Favorite heart synchronized across all surfaces" is therefore **not passed**.

## Files changed

Implementation/test:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/shared/components/Icon.tsx`
- `apps/mobile/src/features/customerProfile/presentation/customerProfileUiModel.ts`
- `apps/mobile/src/features/customerProfile/customerProfileUiModel.test.ts`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx`
- `apps/mobile/src/features/favorites/domain/customerFavoritesContract.ts`
- `apps/mobile/src/features/favorites/customerFavoritesContract.test.ts`
- `apps/mobile/src/features/favorites/screens/CustomerFavoritesScreen.tsx`

Documentation:

- `docs/mobile-ui-rebuild/P60_FAVORITES_EMPTY_CART.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration changed.

## Validation

Required workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated run:

- Run ID: `31272588586`
- Job ID: `93140939951`
- Head SHA: `b98dcfc79c99680487e27363dc5172884cdf6e07`
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

P60 is **PARTIAL**.

The real Favorites destination, Profile navigation, shared detail-route ownership, heart visual primitive, truthful unsupported lifecycle state, and focused tests are implemented and validated. The server-backed list/search/filter/remove/synchronization/Add-to-Cart behaviors cannot be completed without an exact approved Favorites backend/APIM contract and were not fabricated.

Physical-device/reference-image certification remains deferred to the later visual QA/release phases.

## Exit / handoff

Stop here. **P61 — Favorites — Active Cart remains NOT STARTED and is not authorized by this P60 task.**
