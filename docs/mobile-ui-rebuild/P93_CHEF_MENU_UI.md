# P93 — Chef Menu UI Evidence

**Phase:** P93 — Chef Menu  
**Guide reference:** Screen 44 — Chef Menu  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Start HEAD:** `1cb4dc046c587e73e92d8357b91ddf090150b169`  
**Implementation commit:** `b9b36f36a36984f97e782fd746432347940a7cc3`  
**Result:** PARTIAL at full Guide scope; implemented to the exact currently approved P92 backend/mobile boundary.

## What P93 implements

- Replaces the Chef Menu tab boundary with a real Chef Menu screen while preserving the existing Chef shell/header/bottom navigation.
- Renders summary cards from canonical P92 menu data only.
- Provides 250 ms debounced search over the current loaded list.
- Provides local category chips derived from returned `category` values.
- Provides local status filtering using only backend-backed state:
  - Available = `status=ACTIVE && available=true`
  - Unavailable = `status=ACTIVE && available=false`
  - Draft = `status=DRAFT`
  - Inactive = `status=INACTIVE`
- Provides skeleton/loading, error/retry, empty, filtered-empty, pull-to-refresh, mutation-busy, success, and rollback/error feedback.
- Uses a virtualized `FlatList` and does not fabricate pagination when the service exposes no paging contract.
- Wires the exact availability PATCH with optimistic updates and rollback.
- Mirrors optimistic/server-authoritative availability into the existing Chef Dashboard menu cache so Dashboard menu counts stay synchronized.
- Adds typed read-only `ChefMenuItemDetail` navigation. Detail resolves through the list query because no Chef-owned item-detail GET route exists.
- Shows only fields returned by the exact P92 response model.

## Exact server boundary used

P93 consumes the P92 canonical Chef Menu API and writes only through:

- `GET /api/v1/kitchens/me/menu-items`
- `PATCH /api/v1/kitchens/me/menu-items/{menuItemId}/availability`

P93 does not call create/replace/image-upload routes because those UI workflows belong to the separately sequenced P94 Add/Edit phase.

Customer catalog correctness follows the existing server rule established in P92: an item is customer-live only when it is both `ACTIVE` and `available=true`.

## Deliberately not invented

- server pagination, cursor, page, or load-more parameters;
- server search/filter/category/summary parameters;
- category/subcategory metadata;
- a separate `Hidden` or Out-of-Stock backend enum/mutation;
- rating or order-count metrics absent from the Chef Menu response;
- delete/duplicate operations;
- Chef-owned item-detail GET;
- explicit catalog-sync acknowledgement;
- P94 Add/Edit item UI;
- media delete/reorder/set-primary-after-upload behavior.

## Files changed

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuPresentation.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuPresentation.test.ts`
- `apps/mobile/src/features/chefMenu/state/chefMenuQuery.ts`
- `apps/mobile/src/features/chefMenu/state/useChefMenuModel.ts`
- `apps/mobile/src/features/chefMenu/screens/ChefMenuScreen.tsx`
- `apps/mobile/src/features/chefMenu/screens/ChefMenuItemDetailScreen.tsx`

## Validation evidence

- The GitHub compare from the latest P92 ledger HEAD to the P93 implementation commit reports exactly the eight mobile files above and no backend/APIM/infrastructure files.
- No dependency/package file changed.
- Focused pure presentation test source covers status derivation, summaries, local search/category/status filters, category derivation, primary-image selection, and price formatting.
- Authored TS/TSX was syntax-parsed in an isolated scratch invocation using global `tsc --noResolve`. This is only a syntax check; it is **not** a repository TypeScript validation pass because module/type resolution was intentionally unavailable.
- GitHub Actions execution is not claimed because the user reported the account's monthly Actions capacity is exhausted and explicitly authorized continuing without Actions.
- Full `npm ci`, TypeScript, ESLint, Jest, Android bundle, emulator/device, and reference-image pixel comparison are not claimed as pass or fail.
- The Guide Screen 44 embedded reference image was not available as a separately inspectable repository asset through this connector flow, so pixel-perfect certification is intentionally withheld.

## Remaining P93 blockers

1. Pagination is part of the phase/Guide expectation, but the approved list route exposes no page/cursor/size contract. P93 uses virtualization and refuses to fabricate server paging.
2. The Guide expects rating/order metrics and richer visibility/stock distinctions, but those values/actions are absent from the exact P92 response/mutation model.
3. Exact visual certification requires the inspectable Screen 44 image plus Android device/emulator comparison.
4. CI/workspace execution is unavailable under the reported account/tooling constraints.

## Stop boundary

P94 — Chef Add New Menu Item is **not started** and **not authorized in this phase**. Stop after P93.
