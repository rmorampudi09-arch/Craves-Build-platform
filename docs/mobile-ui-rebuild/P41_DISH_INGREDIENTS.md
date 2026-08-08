# P41 — Dish Ingredients

**Status:** PARTIAL  
**Guide reference:** Screen 14 — Dish Ingredients  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Started from:** `6d7d182fe70413465d5ebb9f661040b14cb4d91b`  
**Validated implementation commit:** `455d19bcc567e23496f33cc570922b91cee03841`  
**CI run/job:** `31254643084` / `93096130239` — **SUCCESS**

## Authorization boundary

The user explicitly authorized exactly the next single phase after P40 while P40 remained correctly recorded as PARTIAL. This evidence covers P41 only. P42/P43 Kitchen Profile work was not started.

## Guide requirements applied

Screen 14 requires a focused `CustomerDishIngredients` route reached from Dish Detail, back navigation that preserves the exact Dish Detail state, safe-area header/back/title, scrollable ingredient content, authoritative allergen/dietary warnings only, lifecycle states, and hidden bottom navigation/View Cart chrome for the focused child route.

The guide also requires that a missing backend capability be represented as an explicit typed integration boundary rather than fabricated production data.

## Contract audit

P41 reuses the already accepted P39/P40 detail query boundary only:

- `GET /api/v1/catalog/menu-items/{menuItemId}`
- `GET /api/v1/catalog/kitchens/{kitchenId}`

No new endpoint, APIM route, backend model, infrastructure change, or guessed transport was introduced.

The accepted current mobile detail model explicitly exposes:

- `ingredients: null`,
- `allergens: null`,
- an `INGREDIENTS` contract gap stating that the current public catalog menu-item contract does not expose ingredients,
- an `ALLERGENS` contract gap stating that the current public catalog menu-item contract does not expose allergen metadata.

Repository contract/code search found no authoritative alternative current-branch ingredient/allergen route or typed response model. P41 therefore fails closed and does not infer ingredient names, allergen flags, dietary warnings, descriptions, icons/images, or nutrition claims from dish names, descriptions, categories, or media.

## Implemented P41 behavior

- Added typed `CustomerDishIngredients` route params using the authoritative `menuItemId` UUID.
- Registered the child route in both Customer Home and Chefs detail stacks without adding a second navigation container.
- Added the real Dish Detail `View ingredients` navigation action.
- Kept the Ingredients route immersive through the shared navigation chrome policy, so bottom navigation and shared View Cart chrome remain hidden while focused.
- Uses normal native-stack push/back behavior. Dish Detail remains mounted beneath the child route; returning does not change its `menuItemId`, gallery index, description expansion, cart state, or other local state, so the prior Dish Detail state is preserved.
- Reuses the customer-scoped P39/P40 TanStack Query detail entity instead of duplicating transport/cache ownership.
- Added initial loading skeleton geometry, invalid-link state, session-required state, offline/error terminal state with retry/back, background stale-data banner behavior, pull-to-refresh, and an explicit refresh control.
- Added a typed P41 capability gate that detects the authoritative `INGREDIENTS` and `ALLERGENS` contract blockers.
- Presents an explicit customer-safe unavailable state explaining that Craves will not infer ingredient/allergen/dietary claims when the contract is missing.
- Added focused unit coverage for the capability gate and extended route-chrome policy coverage for `CustomerDishIngredients`.

## Why P41 is PARTIAL rather than DONE

The guide/reference requires the complete authoritative ingredient list, ingredient-row content, and allergen/dietary warnings. The current branch cannot supply those values. Because the product rules prohibit fabricated or inferred production data, the populated reference-state UI and related ingredient/allergen interactions cannot be truthfully implemented yet.

Outstanding blockers:

- no authoritative dish ingredient list/row contract,
- no authoritative ingredient description/media contract,
- no authoritative allergen flags or dietary-warning contract,
- populated reference visual/device certification cannot be completed without real contract-backed data.

The supported route/navigation/lifecycle/fail-closed boundary is implemented and CI-validated, but P41 remains **PARTIAL** until those backend contracts exist.

## Changed files

Implementation:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/features/dishDetail/screens/CustomerDishDetailScreen.tsx`
- `apps/mobile/src/features/dishDetail/screens/CustomerDishIngredientsScreen.tsx`
- `apps/mobile/src/features/dishDetail/dishIngredientsCapability.ts`

Tests:

- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/features/dishDetail/dishIngredientsCapability.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P41_DISH_INGREDIENTS.md`
- `build.md`

## Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31254643084`, job `93096130239`, head `455d19bcc567e23496f33cc570922b91cee03841` completed **SUCCESS**.

Passed gates:

1. dependency install from lockfile,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint with zero-warning gate,
4. Jest,
5. production Android JavaScript bundle,
6. backend/APIM/infrastructure source-change guard.

Per rebuild policy, this implementation workflow does not package a Java/Gradle APK per phase.

## Next-phase state

**P42 — Kitchen Profile Data Contract: NOT STARTED.**  
**Next phase authorization: NONE.**  
Stop after recording P41 and wait for explicit user authorization.
