# P92 — Chef Menu Contract Model

**Status:** PARTIAL at full Guide/product-contract scope; exact current mobile/backend/APIM boundary implemented  
**Guide refs:** 44 — Chef Menu; 45 — Chef Add New Menu Item  
**Phase start commit:** `ec78b211fb52cc46b66200de012195c446c90ed7`  
**Implementation/code end:** `da396494a0d1d776d4869891a8a28e14596514a0`  
**GitHub Actions:** not claimed; the user reported the account's monthly Actions capacity is exhausted and explicitly authorized continuing without treating Actions as a blocker.

## Implemented boundary

P92 establishes one canonical mobile contract for the exact Chef Menu surface that exists today. It does **not** implement P93 Chef Menu presentation or P94 Add/Edit form UI.

- Added canonical exhaustive server enums:
  - menu status: `DRAFT | ACTIVE | INACTIVE`;
  - food type: `VEG | NON_VEG | EGG`;
  - spice level: `MILD | MEDIUM | SPICY`.
- Added the full current `MenuItemResponse` projection, including `kitchenId` and complete image ownership/storage metadata that the earlier Dashboard-only projection did not retain.
- Added the exact `MenuItemRequest` and `AvailabilityRequest` mobile request shapes.
- Added strict fail-closed parsers for menu items, image records, UUID identity, timestamps, booleans, integer delivery metadata, price minimum, and server enum values.
- Matched the backend request validation primitives that are explicit in `ApiDtos.MenuItemRequest`: required name/category/food type/price/package weight/thermobox flag, positive serving/preparation integers when supplied, and price minimum `0.01`.
- Added the exact currently allowed backend menu-image MIME types: JPEG, PNG, and WebP.
- Added exact wrappers over the existing shared `httpClient` for all five currently approved Chef Menu routes. No second transport client or hard-coded API base URL was introduced.
- Image upload passes the multipart `file` body and the exact `primary` request parameter without manually setting a multipart boundary.
- Added explicit typed contract-gap metadata for Guide capabilities that are not backed by an approved endpoint/semantics today, instead of fabricating routes or states.
- Removed the duplicate Dashboard-owned menu transport model. P82 Dashboard keeps compatibility aliases but now delegates menu parsing and list reads to the P92 canonical Chef Menu contract.

## Exact current Chef Menu routes

1. `GET /api/v1/kitchens/me/menu-items`
2. `POST /api/v1/kitchens/me/menu-items`
3. `PUT /api/v1/kitchens/me/menu-items/{menuItemId}`
4. `PATCH /api/v1/kitchens/me/menu-items/{menuItemId}/availability`
5. `POST /api/v1/kitchens/me/menu-items/{menuItemId}/images?primary={boolean}` with multipart `file`

These paths are present in the current Catalog Service controller and corresponding Chef Menu APIM configuration. P92 changes no backend, APIM, OpenAPI, infrastructure, controller, or deployment source.

## Important exact semantics retained

- `PUT /menu-items/{menuItemId}` is treated as a **replacement** using the complete `MenuItemRequest`, not as a fabricated partial patch.
- Backend defaults omitted/null currency to `INR`, omitted/null status to `DRAFT`, and treats omitted/null `available` as false on create/replace.
- The dedicated availability mutation accepts only `available` plus optional `reason`; no visibility field or synthetic stock enum is sent.
- Making an item available can be rejected by the backend when package weight or thermobox metadata is absent.
- The public catalog currently exposes only items whose status is `ACTIVE` and whose availability is true; there is no separate catalog-sync endpoint to call from mobile.
- Media storage accepts JPEG, PNG, and WebP. Its maximum upload size is runtime configuration (default in source is 8 MiB), so P92 does not freeze that configurable value into the mobile transport contract.
- The first uploaded image becomes primary when an item has no images; a caller can request primary on upload. No later image-primary/reorder/delete mutation exists in the current Chef contract.

## Guide capabilities blocked by missing exact contracts

The Master Guide asks for broader Chef Menu behavior than the current five-route backend surface supports. P92 records these as blockers rather than inventing them:

1. **Chef-owned item detail GET:** no exact Chef route exists; only the list response and write responses expose Chef-owned item detail.
2. **Server search/filter/category/summary/pagination:** the list route has no search, category, filter, summary, page, limit, or cursor parameters.
3. **Category/subcategory metadata:** no Chef menu category metadata endpoint exists.
4. **Separate visibility semantics/action:** the backend exposes `status` plus `available`, but no separately named visibility field/mutation or authoritative mapping for the Guide's `Hidden` label.
5. **Delete/duplicate:** no Chef delete or duplicate mutation exists.
6. **Incomplete draft saving:** `MenuItemRequest` still requires core fields even when `status=DRAFT`; there is no separate partial-draft contract that permits the Guide's incomplete draft behavior.
7. **Duplicate/name checks:** no validation/name-check endpoint exists.
8. **Media management beyond upload:** no image delete, reorder, or post-upload set-primary route exists.
9. **Explicit catalog synchronization mutation:** customer visibility is derived from the shared persisted menu state; there is no separate sync route.
10. **Configured media size discovery:** backend maximum image size is runtime configuration and no client-readable capability endpoint exposes it.

## Changed code files

- `apps/mobile/src/features/chefMenu/api/chefMenuApi.ts`
- `apps/mobile/src/features/chefMenu/api/chefMenuApi.test.ts`
- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.ts` — narrow deduplication/refactor to reuse the canonical P92 model.
- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.test.ts` — fixture updated to the complete canonical server response shape.

## Focused test source added/updated

The P92 test source covers:

- exhaustive status/food/spice enum values;
- exact backend image MIME types and multipart field name;
- complete item/image response parsing;
- fail-closed unsupported enum and malformed primitive handling;
- exact `0.01` request price minimum and positive integer delivery metadata;
- exact list/create/PUT replacement/availability/image-upload routes and request shapes;
- malformed menu-item ID rejection before writes;
- explicit contract gaps so later UI does not invent visibility/delete/detail/category behavior;
- P82 Dashboard compatibility against the canonical full response shape.

## Validation / guard state

- Phase-start → implementation-code-end compare is ahead only within four `apps/mobile` files listed above.
- No `services/`, `openapi/`, `infra/`, `apps/api/`, APIM, controller, or server-pipeline source changed in P92 implementation.
- No dependency/package was added.
- Focused Jest test **source** was added/updated and manually reviewed against the current controller/DTO/service/APIM source.
- GitHub Actions execution is intentionally not used as a phase pass/fail signal because the user reported the monthly Actions limit is exhausted.
- Repository-wide `npm ci`, TypeScript, ESLint, Jest execution, Android bundle generation, and device/emulator validation are therefore **not claimed** for P92.
- The current connector environment does not expose an executable private repository checkout, so local command execution is not claimed either.

## Phase boundary

P92 stops at the canonical contract/API model and compatibility refactor. **P93 — Chef Menu UI is NOT STARTED by this phase.** No menu screen, search UI, category chips, availability UI, add/edit form, or P94+ behavior was pre-implemented.
