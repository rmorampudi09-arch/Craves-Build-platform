# P39 — Dish Detail Data Contract

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide reference:** 13  
**Phase:** P39 only  
**Status:** **PARTIAL**

---

## 1. Authorization and Boundary

The user explicitly authorized exactly the next single phase after P38. P38 remains correctly recorded as **PARTIAL**; that status does not block beginning the next sequential phase.

P39 is a data-contract/model/cache phase only. It does **not** implement the P40 Dish Detail screen, navigation composition, Add to Cart/Buy Now UI behavior, or any later phase.

Started from branch head:

- `11aa9c4226d653bc387e68b61cb418ac3a68e267`

Validated implementation commit:

- `97f5bc10509cbfba17cf9f0a56ed15cdbefdcb94`

Validation:

- GitHub Actions run: `31252552058`
- Job: `93091033108`
- Conclusion: **SUCCESS**
- Passed: dependency install, strict TypeScript, ESLint zero-warning gate, Jest, production Android JavaScript bundle, backend/APIM/infrastructure source-change guard.

---

## 2. Authoritative Current-Branch Contract Evidence

P39 uses only concrete current-branch public Catalog Service behavior.

### Public menu-item detail

`services/catalog-service/src/main/java/in/craves/catalog/web/PublicCatalogController.java` defines:

```text
GET /api/v1/catalog/menu-items/{menuItemId}
```

The response is `ApiDtos.MenuItemResponse`. The accepted response fields include:

- stable menu-item `id`,
- stable `kitchenId`,
- item name/description/category,
- food type,
- current price and currency,
- serves count,
- preparation time,
- spice level,
- packaged weight,
- thermobox requirement,
- current availability,
- menu-item status,
- `images` metadata.

`CatalogService.getPublicMenuItem(...)` returns the public item only when the item is `ACTIVE`, currently available, and belongs to an `ACTIVE` kitchen. P39 therefore treats the detail response as the authoritative current price/availability read and does not fall back to an older discovery-card value when validation fails.

### Public kitchen detail

`PublicCatalogController.java` also defines:

```text
GET /api/v1/catalog/kitchens/{kitchenId}
```

P39 uses this read to obtain the kitchen identity/display context required by Reference 13.

The raw backend `KitchenProfileResponse` contains fields that must not be leaked into the customer Dish Detail model, including identity/contact/pickup-address information. The mobile mapper therefore uses an explicit public allowlist only:

- kitchen ID,
- kitchen name,
- display name,
- public description,
- area,
- city,
- state.

### Media

`MenuItemResponse.images` contains the full image metadata returned for the item. `CatalogService.listImages(...)` orders those rows in the backend before returning them:

```text
is_primary DESC, sort_order ASC, created_at ASC
```

The P39 mobile model preserves backend-returned image order and keeps only usable HTTPS public image URLs. It does not select only one primary image and does not introduce a second client-side ordering rule.

### Public access

Catalog Service `SecurityConfig` permits `/api/v1/catalog/**` and `/api/v1/discovery/**` as public endpoints. No customer-only authorization requirement was invented for these two P39 catalog reads.

---

## 3. Implemented Mobile Data Boundary

Added:

- `apps/mobile/src/features/dishDetail/api/dishDetailApi.ts`
- `apps/mobile/src/features/dishDetail/query/dishDetailQueries.ts`
- `apps/mobile/src/features/dishDetail/dishDetailApi.test.ts`
- `apps/mobile/src/features/dishDetail/dishDetailQueries.test.ts`

Implemented behavior:

1. Validates the route/menu-item identity as an actual backend UUID rather than accepting a synthetic card index or mutable display value.
2. Reads the exact public menu-item detail endpoint.
3. Validates that the returned item ID matches the requested item ID.
4. Requires an `ACTIVE` and currently available item with a positive current price.
5. Reads the exact public kitchen endpoint using the returned `kitchenId`.
6. Requires the returned kitchen identity to match the item's `kitchenId` and requires an `ACTIVE` kitchen.
7. Maps only the public kitchen allowlist; private identity/contact/pickup-address fields are not part of the mobile customer detail model.
8. Maps all usable public media URLs while preserving backend response order.
9. Keeps optional backend values nullable; it does not fabricate descriptions, prep times, serves counts, package data, or media.
10. Models the currently supported Reference 13 detail fields: item identity/display data, kitchen summary, price/currency, food type, category, serves/preparation/spice/package facts, availability, and media.
11. Represents unsupported contract capabilities explicitly as `null` plus a fixed contract-gap descriptor rather than fake values.
12. Defines one TanStack Query entity key owned by customer identity + stable backend menu-item ID.
13. Defines the cache invalidation boundary required by a future authoritative favorite mutation so the affected detail and same-customer Home dish-list caches can be reconciled together.
14. Does not define or invoke a favorite endpoint because no accepted current-branch favorite contract exists.
15. Does not copy the detail server entity into Redux/global arrays.

---

## 4. Exact P39 Contract Gaps

The current branch does not provide authoritative backend/APIM contracts for the following Reference 13 capabilities:

### Cuisine

The public menu-item detail contract has `category` and `foodType`, but no authoritative cuisine ID/value/taxonomy.

### Ingredients

No customer-facing dish ingredient field or ingredient-detail endpoint/model is present in the accepted current Catalog Service contract.

### Allergens

No customer-facing allergen metadata contract is present.

### Reviews / aggregate rating

No authoritative dish review-list, review-summary, aggregate-rating, or review-count contract was found for this customer detail flow. P39 does not reuse mock/web presentation values such as `rating: 0` as production data.

### Favorite state / mutation

No authoritative customer dish favorite read or mutation route/model exists in the accepted current branch contract. P39 therefore does not create a guessed `favorites`, `wishlist`, `like`, or similar endpoint.

Media is **not** blocked: the current public menu-item response already contains the image list required for the P39 media model.

Because P39's declared scope includes cuisine/ingredients/reviews/favorite-related detail capabilities and those contracts are missing, P39 remains **PARTIAL**, not DONE. The available exact contract subset and its cache/entity ownership are implemented and validated, and the missing capabilities are explicitly blocked as required by `phases.md`.

---

## 5. Tests and Safety Checks

P39 tests verify:

- exact public menu-item and kitchen request paths,
- exact request identity and dedupe ownership,
- current price and availability mapping,
- private kitchen fields are excluded from the customer model,
- every usable image URL is retained in backend-returned order,
- nullable optional fields remain nullable,
- unsupported cuisine/ingredients/allergens/reviews/favorite capabilities remain explicit blockers,
- unavailable/inactive/invalid-price detail fails closed instead of using stale discovery data,
- menu-item/image/kitchen identity mismatches fail validation,
- detail query keys vary by customer and stable backend menu-item ID,
- synthetic/non-backend dish IDs are rejected,
- the future favorite cache-reconciliation boundary invalidates only the affected customer's detail and existing Home dish-list caches.

CI run `31252552058` / job `93091033108` completed successfully for implementation commit `97f5bc10509cbfba17cf9f0a56ed15cdbefdcb94`.

---

## 6. Explicitly Not Implemented

P39 did **not** implement:

- P40 Dish Detail UI,
- a Dish Detail navigation destination,
- gallery/carousel UI,
- favorite mutation UI,
- share UI,
- ingredients screen,
- reviews screen,
- Add to Cart or Buy Now behavior,
- public Kitchen Profile UI,
- backend/APIM/database changes,
- guessed cuisine/ingredient/allergen/review/favorite contracts,
- APK/AAB packaging.

The next sequential phase is **P40 — Dish Detail UI and Interactions**, but it is **not authorized** by this P39 execution and must not be started without a new user instruction.
