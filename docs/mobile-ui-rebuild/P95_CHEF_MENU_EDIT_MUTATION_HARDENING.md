# P95 — Chef Menu Edit / Mutation Hardening

**Phase:** P95  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Status:** **PARTIAL at full Guide scope; exact current backend edit boundary implemented**

## Authorized boundary

P95 is limited to Chef Menu editing and mutation hardening. It does not start P96 Analytics and does not change backend, APIM, infrastructure, deployment, or dependencies.

The authoritative P92 contract exposes:

- `PUT /api/v1/kitchens/me/menu-items/{menuItemId}` as a **full `MenuItemRequest` replacement**;
- `PATCH /api/v1/kitchens/me/menu-items/{menuItemId}/availability`;
- image **upload** only via `POST /api/v1/kitchens/me/menu-items/{menuItemId}/images?primary={boolean}`.

There is no chef-owned detail GET, media replace/delete/reorder contract, structured field-error contract, idempotency-key contract, or delete/duplicate item route in the approved evidence.

## Implemented

1. Added typed `ChefEditMenuItem` navigation from the existing Chef menu-item detail screen.
2. Added an edit form prefilled only from the canonical Chef menu list response. If the item is not present, the screen fails closed instead of inventing a detail request.
3. Added exact full-replacement request construction:
   - all writable form fields are populated;
   - existing `currency` is preserved;
   - existing backend `status` is preserved so editing does not implicitly publish/unpublish;
   - availability remains an explicit approved `MenuItemRequest` field and can be edited.
4. Added local duplicate-submission protection in the edit mutation model and disables the save action while the request is in flight.
5. Updates the canonical Chef Menu and Chef Dashboard menu caches only with the parsed server-returned item, then invalidates both for authoritative revalidation.
6. Added unsaved-change protection using React Navigation removal prevention. Dirty forms prompt before leaving; the edit route also disables the native swipe-back gesture.
7. Server-safe `AppApiError.message` and sanitized `details[]` are surfaced. The client intentionally does **not** guess field bindings because the error contract supplies only unstructured strings.
8. Added focused domain tests for edit prefill and full-replacement mapping while retaining the P94 create tests.
9. Existing images are displayed read-only. No fake image-replacement button is exposed.

## Exact full-replacement behavior

`buildChefMenuReplacementRequest(values, existingItem)` validates the same form schema used by create and sends the complete current request shape:

- `itemName`
- `description`
- `category`
- `foodType`
- `price`
- `currency` preserved from the current item
- `servesCount`
- `preparationTimeMinutes`
- `spiceLevel`
- `unitPackageWeightGrams`
- `thermoboxRequired`
- `available`
- `status` preserved from the current item

No PATCH-like partial object is sent to the PUT route.

## Retained blockers instead of fabricated behavior

1. **Image replacement remains blocked.** The exact backend exposes upload, but no replace/delete/reorder/set-primary-after-upload management contract, and the mobile app still has no approved image-picker dependency. Existing media is therefore read-only in P95.
2. **Field-level server binding remains blocked.** `AppApiError.details` is a sanitized `readonly string[]`; no machine-readable field key/path convention is defined. P95 shows the server details but does not guess which input should receive each message.
3. **Backend idempotency remains unavailable.** The Guide discusses idempotency, but the exact current menu contract exposes no idempotency key/header semantics. P95 uses only an in-flight client guard and does not invent a server guarantee.
4. No chef-owned menu-item detail GET exists; edit source data remains the canonical list response.
5. Delete/duplicate item mutations remain unavailable because no exact routes exist.
6. Category taxonomy, incomplete-draft rules, duplicate-name checks, media limits, and catalog-publication acknowledgement remain the P92/P94 contract gaps.

## Changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.ts`
- `apps/mobile/src/features/chefMenu/domain/chefMenuForm.test.ts`
- `apps/mobile/src/features/chefMenu/state/useChefEditMenuItemModel.ts`
- `apps/mobile/src/features/chefMenu/screens/ChefEditMenuItemScreen.tsx`
- `apps/mobile/src/features/chefMenu/screens/ChefMenuItemDetailScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P95_CHEF_MENU_EDIT_MUTATION_HARDENING.md`
- `build.md`

## Validation state

- No backend/APIM/dependency files are changed by P95.
- Focused Jest source is authored, but repository Jest execution is not claimed from the GitHub connector environment.
- Full TypeScript, ESLint, Android build/bundle, emulator/device, gesture/keyboard, and pixel-perfect validation are not claimed.
- GitHub Actions are intentionally not used as a P95 pass/fail signal because the account Actions limit is exhausted per the user’s instruction.

## Stop boundary

P95 is the only implemented phase in this handoff. **P96 — Chef Analytics Contract Model remains NOT STARTED.**
