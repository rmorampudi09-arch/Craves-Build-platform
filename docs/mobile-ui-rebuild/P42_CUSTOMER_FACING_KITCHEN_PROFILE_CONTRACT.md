# P42 — Customer-Facing Kitchen Profile Contract

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P42 only  
**Guide reference:** 15 — Customer Kitchen Profile  
**Status:** **PARTIAL — exact current public kitchen/profile and sellable-menu contract subset is implemented and CI-validated; guide-required verification, rating/reviews, order-count, final serviceability/ETA, favorite, featured/top-dish ranking, and kitchen-media contracts are absent**  
**Started from branch head:** `68314bffe0db36d720dd5892dcd088da72fe5eb8`  
**Validated implementation commit:** `30faa2d2a6d0f7ef4c860f1e166f23d764841c4d`  

---

## 1. Authorization and Phase Boundary

The user explicitly authorized exactly the next single phase after P41. P41 remains correctly recorded as **PARTIAL** because its remaining ingredient/allergen gap is an unavailable backend contract, not unfinished supportable mobile work.

P42 is a **data-contract/model/query/cache phase only**. It does not implement P43 Customer-Facing Kitchen Profile UI, P44 Kitchen All Dishes, favorites, checkout, or any later phase.

The full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` is authoritative. Reference 15 requires customer-facing kitchen identity, verification/trust context, biography, rating/order/tenure metrics, top dishes, favorite state, serviceability context, and navigation to the complete menu. Repository/backend reality remains authoritative for concrete integration, so unsupported capabilities are blocked explicitly rather than fabricated.

---

## 2. Exact Current-Branch Public Contracts

### 2.1 Public kitchen detail

Authoritative controller:

- `services/catalog-service/src/main/java/in/craves/catalog/web/PublicCatalogController.java`

Exact route:

```http
GET /api/v1/catalog/kitchens/{kitchenId}
```

Response model:

- `ApiDtos.KitchenProfileResponse`

Authoritative service behavior:

- `CatalogService.getPublicKitchen(UUID kitchenId)` returns only a kitchen whose status is `ACTIVE`.
- An unavailable/nonexistent/non-active kitchen fails with the backend not-found behavior rather than becoming a synthetic customer profile.

The raw response contains owner/private fields that are not required for a customer-facing profile. P42 therefore applies an explicit customer-safe allowlist and exposes only:

- `id`,
- `kitchenName`,
- `displayName`,
- public `description` as biography,
- `areaName`,
- `city`,
- `state`,
- `createdAt` as the only available factual account-tenure timestamp.

P42 does **not** expose the raw response's:

- `identityId`,
- phone number,
- email,
- pickup address lines,
- landmark,
- postal code,
- exact latitude/longitude,
- owner-oriented update metadata.

### 2.2 Public kitchen sellable menu

Exact route:

```http
GET /api/v1/catalog/kitchens/{kitchenId}/menu-items
```

Response model:

- `List<ApiDtos.MenuItemResponse>`

Authoritative service behavior:

- requires the kitchen itself to be public/`ACTIVE`,
- returns only menu items with status `ACTIVE` and `is_available = true`,
- backend order is `category, item_name`,
- includes menu-item image metadata.

P42 maps the exact supported sellable menu summary fields and keeps usable HTTPS public image URLs in backend-returned order. It validates menu-item-to-kitchen identity and image-to-menu-item identity and fails closed on contradictory data.

Important limitation: this compatibility endpoint is **not paginated** and does **not** define an authoritative featured/top-dish ranking. P42 records that gap; it does not reinterpret category/name ordering as popularity or “Top Dishes.” P44 owns the later complete-menu UI/scale acceptance boundary.

### 2.3 Public access boundary

`services/catalog-service/src/main/java/in/craves/catalog/security/SecurityConfig.java` currently permits `/api/v1/catalog/**` and `/api/v1/discovery/**` publicly.

No Chef-owner private route such as `/api/v1/kitchens/me` is used by P42. No new backend or APIM route is introduced or inferred.

---

## 3. Implemented Mobile Boundary

### API/model

Added `apps/mobile/src/features/kitchenProfile/api/kitchenProfileApi.ts`.

Implemented behavior:

- validates `kitchenId` as a stable backend UUID before transport,
- calls only the exact public Catalog kitchen and kitchen-menu paths,
- validates returned structures with Zod,
- verifies response kitchen identity matches the request,
- requires an `ACTIVE` public kitchen,
- strips raw private owner/contact/pickup-address/coordinate fields from the customer model,
- maps supported biography/location/created-at context,
- maps only `ACTIVE` + available public menu rows,
- validates every menu row belongs to the requested kitchen,
- validates image ownership,
- keeps only usable HTTPS public media,
- preserves backend-returned ordering,
- does not manufacture verification, ratings, review counts, order counts, delivery eligibility/ETA, favorite state, featured ranking, or kitchen hero media.

### Query/cache ownership

Added `apps/mobile/src/features/kitchenProfile/query/kitchenProfileQueries.ts`.

Implemented behavior:

- one customer-scoped TanStack Query entity key per authenticated customer + stable backend kitchen ID,
- disabled state when customer identity or valid kitchen ID is absent,
- request cancellation flows through the established query/HTTP stack,
- no duplicate Redux/global copy of server kitchen profile data,
- future authoritative kitchen-favorite reconciliation boundary invalidates only:
  - the affected customer's exact kitchen profile, and
  - that same customer's nearby-chef discovery caches.

P42 deliberately does not define or call a kitchen-favorite mutation endpoint because no authoritative current-branch contract exists.

---

## 4. Explicit Contract Gaps / Acceptance Blockers

Reasonable current-branch contract searches found no authoritative customer-facing contract for:

1. **Verification/trust badge/status** for the public kitchen profile.
2. **Kitchen rating, review aggregate, or review count**.
3. **Customer-facing fulfilled order count** used by the reference metric row.
4. **Final delivery serviceability or ETA** from a selected customer address to the kitchen. Nearby discovery radius/distance is explicitly only browsing data and must not be treated as final delivery eligibility.
5. **Kitchen favorite read/mutation**.
6. **Featured/Top Dishes ranking**. The current public menu is ordered by category/name, not by a supported ranking signal.
7. **Kitchen/chef hero media or public profile portrait**.
8. **Paginated public kitchen-menu contract** suitable for the later complete-menu experience.

The guide requires several of these capabilities for full Reference 15 acceptance. P42 therefore remains **PARTIAL**, not DONE.

No placeholder values such as fake ratings, “verified,” invented order counts, made-up tenure text, guessed ETA, or static favorite state are introduced.

---

## 5. Changed Files

Implementation:

- `apps/mobile/src/features/kitchenProfile/api/kitchenProfileApi.ts`
- `apps/mobile/src/features/kitchenProfile/query/kitchenProfileQueries.ts`

Tests:

- `apps/mobile/src/features/kitchenProfile/kitchenProfileApi.test.ts`
- `apps/mobile/src/features/kitchenProfile/kitchenProfileQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P42_CUSTOMER_FACING_KITCHEN_PROFILE_CONTRACT.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P43 UI/navigation implementation, P44 All Dishes UI, checkout/payment, or Chef-owner operational feature was changed.

---

## 6. Focused Test Coverage

P42 tests verify:

- exact public Catalog kitchen-detail and kitchen-menu request paths,
- stable UUID validation before transport,
- returned kitchen identity validation,
- active-kitchen fail-closed behavior,
- customer-safe allowlisting that excludes raw identity/contact/private pickup-address/coordinate data,
- sellable menu-item mapping and backend order preservation,
- HTTPS-only image mapping,
- menu-item/kitchen and image/menu-item identity mismatch rejection,
- inactive/unavailable menu row rejection,
- explicit null/gap representation for unsupported guide capabilities,
- customer + kitchen scoped query identity,
- synthetic kitchen IDs rejected,
- future favorite invalidation cannot invalidate another customer's profile/discovery data.

---

## 7. CI Validation

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`

Validated implementation:

- Commit: `30faa2d2a6d0f7ef4c860f1e166f23d764841c4d`
- GitHub Actions run ID: `31255118989`
- Job ID: `93097257711`
- Conclusion: **SUCCESS**

Passed gates:

1. dependency install from lockfile,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint zero-warning gate,
4. Jest,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

No Gradle/APK packaging was performed, consistent with the phase build policy.

---

## 8. Visual QA

P42 is a contract/data phase. It does not claim Reference 15 pixel fidelity or device certification. The actual Customer-Facing Kitchen Profile composition and visual/reference verification belong to P43 and later QA phases.

---

## 9. Stop State

**P42 — Customer-Facing Kitchen Profile Contract: PARTIAL.**

Every safe, supportable current-branch P42 contract/query/cache boundary implemented in this phase is CI-validated. Full acceptance remains blocked by the explicit missing contracts above.

**P43 — Customer-Facing Kitchen Profile UI was not started.**

**Next phase authorization: NONE — stop after P42 and wait for explicit user direction.**
