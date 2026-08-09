# P94 — Chef Add New Menu Item

**Status:** PARTIAL at full Guide scope; exact current create-form/backend boundary implemented.  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase start:** `5675a3501a9cfab9368b9c139c21fc39ff7cca5f`  
**Implementation code end:** `d95c2156cd1aa6ce3bfe96f6d2f7e67370759fc1`

## Authorization / source authority

P94 was explicitly authorized as the single next phase after P93. The implementation was bounded by `plan.md`, `phases.md`, `agent.md`, `build.md`, the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` Screen 45 requirements, P92 menu contract evidence, P93 menu UI evidence, and the exact catalog-service source on this branch.

No P95 edit/mutation-hardening work was pre-implemented.

## Exact backend contract used

P94 uses the already-centralized P92 route:

`POST /api/v1/kitchens/me/menu-items`

The exact `MenuItemRequest` contract is:

- `itemName` — required non-blank string
- `description` — optional
- `category` — required non-blank string
- `foodType` — `VEG | NON_VEG | EGG`
- `price` — required, minimum `0.01`
- `currency` — optional; backend default remains `INR`
- `servesCount` — optional positive integer
- `preparationTimeMinutes` — optional positive integer
- `spiceLevel` — optional `MILD | MEDIUM | SPICY`
- `unitPackageWeightGrams` — required positive integer
- `thermoboxRequired` — required boolean
- `available` — optional boolean
- `status` — optional `DRAFT | ACTIVE | INACTIVE`

`Save as Draft` maps to the same exact create request with `status=DRAFT`. `Add Item` maps to `status=ACTIVE`. No publication endpoint or fake success state was invented.

## Implemented P94 boundary

- Registered typed `ChefAddMenuItem` as a focused Chef product-stack route, so the Chef bottom tabs are not rendered inside the form.
- Added a real `+ Add new item` entry action to the Chef Menu tab without rewriting the P93 list/search/filter implementation. Returning from the form preserves the mounted Menu tab state.
- Added a React Hook Form + Zod form using shared Craves tokens and the existing navigation/state architecture.
- Added required item name, category, description, food type, price, optional serves count, optional preparation time, optional spice level, required packaged weight, required thermobox choice, and availability controls.
- Added client validation matching the exact server floor/positive-integer requirements before submit.
- Added exact payload mapping with no invented request fields.
- Added both `Save as Draft` and `Add Item` CTAs. Both wait for the real backend response; navigation returns to Menu only after a valid server response is parsed.
- Added an in-flight submission guard and disabled submit controls while the create call is running, preventing duplicate taps within this P94 route.
- Added recoverable API error presentation using the existing safe `AppApiError` mapping. Unknown failures use fixed public copy rather than raw transport/server details.
- On successful create, prepends the server-authoritative created item into the canonical Chef Menu cache and the existing Chef Dashboard menu cache, then invalidates both for revalidation.
- Added explicit media-boundary UI showing the exact JPEG/PNG/WebP allow-list while refusing to fake upload behavior that cannot be safely wired with the current mobile/runtime policy boundary.
- Added focused domain tests for required-field rejection, DRAFT/ACTIVE payload mapping, optional null mapping, minimum price, and positive integer delivery metadata.

## Deliberately retained blockers

1. **Image picking/upload UI is not claimed complete.** The backend exposes the upload route, but this mobile workspace has no approved native image-picker dependency. More importantly, the server upload maximum is runtime-configured and there is no client-readable max-size or image-count policy. Hard-coding the observed server default would violate the exact-contract rule.
2. **No category/subcategory selector taxonomy is fabricated.** The backend exposes only a free-text `category` field and no category/subcategory metadata route. P94 therefore uses a validated category text field and explains the limitation.
3. **Incomplete draft saving is unavailable.** `status=DRAFT` still uses `MenuItemRequest`, whose core create fields remain required. The form does not pretend incomplete drafts can be persisted.
4. **No duplicate/name-check call is fabricated.** There is no approved endpoint for it. P94 only guards duplicate taps locally; authoritative duplicate/name hardening remains blocked/separately scoped.
5. **No cooking-time/packing-time/shelf-life request fields are invented.** They are Guide concepts but absent from the approved request contract.
6. **No catalog-publication acknowledgement is invented.** Customer visibility continues to derive from the existing authoritative `status=ACTIVE && available=true` backend behavior.
7. **No edit, image replacement, media reorder/delete, unsaved-change hardening, or edit mutation recovery was started.** Those remain P95/later-boundary work.

## Changed files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.test.ts`
- `apps/mobile/src/features/chefMenu/state/useChefAddMenuItemModel.ts`
- `apps/mobile/src/features/chefMenu/screens/ChefAddMenuItemScreen.tsx`
- `docs/mobile-ui-rebuild/P94_CHEF_ADD_NEW_MENU_ITEM.md`
- `build.md`

## Validation / guard state

- The implementation commit is a single fast-forward child of the P93 ledger HEAD.
- The implementation changes only six `apps/mobile` files. No `services/`, `openapi/`, `infra/`, backend/APIM, deployment, or pipeline source changed.
- No package/dependency was added.
- An isolated `tsc --noResolve` scratch parse reported zero TypeScript syntax/parser diagnostics in the authored P94 source. That scratch environment intentionally lacks repository dependencies, so unresolved-module/Jest ambient diagnostics are not treated as project type-check results.
- Focused Jest source was authored but repository Jest execution is not claimed.
- GitHub Actions are not used as a pass/fail signal because the user reported the account Actions limit is exhausted and explicitly authorized continuing without it.
- Full workspace TypeScript, ESLint, Jest execution, Android bundle/build, emulator/device behavior, keyboard layout, and pixel comparison are not claimed as passing or failing in this connector-only execution.

## Phase result

P94 is **PARTIAL at full Guide scope** but implements the exact, usable backend-backed Add New Menu Item form boundary available today. The remaining gaps are recorded rather than replaced with mocks, hard-coded media limits, synthetic category metadata, or fake success.

**Next phase:** P95 — Chef Menu Edit/Mutation Hardening — NOT STARTED.  
**Authorization after this phase:** NONE. Stop here.
