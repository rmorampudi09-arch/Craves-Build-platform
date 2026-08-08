# P34 — Nearby Chef Discovery Contract

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P34 only  
**Status:** **PARTIAL — exact nearby-kitchen/location/pagination contract implemented and CI-validated; delivery serviceability and several guide-required chef-summary capabilities are not present in the current backend contract**  
**Started from branch head:** `bdc157f09b4294b8de67436eeb16e0320ff8d006`  
**Validated implementation commit:** `02b17243ff9845825068d3dae4b01c05f5e3ac72`  
**Guide refs:** 7, 8 — Discover Home Chefs empty/active-cart states

---

## 1. Authority Reviewed

P34 was executed after reviewing the current branch authority files and the complete 183-page master implementation guide:

- `agent.md`
- `build.md`
- `phases.md`
- `plan.md`
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`

Repository/APIM/backend reality remains authoritative for concrete integration. P34 therefore maps only fields and parameters that actually exist and records missing guide capabilities instead of fabricating transport models.

---

## 2. P34 Scope From `phases.md`

P34 owns:

- exact nearby chef/kitchen summary contract mapping,
- serviceability dependency mapping where an exact contract exists,
- pagination,
- location dependencies.

Acceptance forbids substituting customer-profile lists or fake chef data for a real nearby-chef contract.

P35 Discover Home Chefs UI is outside P34 and was not started.

---

## 3. Exact Backend/APIM Contract Confirmed

### 3.1 Nearby kitchen discovery

The current Catalog Service exposes:

```http
GET /api/v1/discovery/kitchens
```

Authoritative sources:

- `services/catalog-service/src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java`
- `services/catalog-service/src/main/java/in/craves/catalog/service/NearbyDiscoveryService.java`
- `services/catalog-service/src/main/java/in/craves/catalog/web/DiscoveryDtos.java`
- `services/catalog-service/src/main/java/in/craves/catalog/config/CatalogDiscoveryProperties.java`
- `scripts/configure-catalog-discovery-apim.sh`
- `docs/handover/2026-07-16-catalog-discovery-apim.md`

Exact query parameters:

- `latitude`
- `longitude`
- `radiusMeters`
- `page`
- `size`

Exact validation represented by the mobile boundary:

- latitude: `-90..90`
- longitude: `-180..180`
- `radiusMeters`: `1..50000`
- `page`: `>= 0`
- `size`: `1..100`

Exact response page metadata:

- `page`
- `size`
- `totalElements`
- `totalPages`
- `hasNext`

Exact kitchen summary fields:

- `id`
- `kitchenName`
- `displayName`
- `description`
- `areaName`
- `city`
- `state`
- `latitude`
- `longitude`
- `distanceMeters`
- `activeMenuItemCount`

### 3.2 Server-side availability semantics

The Catalog query returns only kitchens that:

- have kitchen status `ACTIVE`,
- have a geocoded location,
- are within the requested discovery radius,
- have at least one menu item that is `ACTIVE` and available and contains the required delivery package metadata.

Results are ordered by distance and then kitchen ID.

This is a concrete nearby-availability filter. It is **not** treated as a full delivery-serviceability or delivery-ETA contract.

### 3.3 APIM mapping

The existing APIM configuration defines:

- API ID: `craves-catalog-discovery-v1`
- public path: `api/v1/discovery`
- operation: `discover-nearby-kitchens`
- operation path: `/kitchens`
- method: `GET`
- subscription required: `false`

The APIM handover explicitly states that this discovery configuration does not define delivery serviceability, delivery fees, provider assignment radius, pricing zones, commissions, or compliance rules.

---

## 4. Exact Mobile Boundary Implemented

### Transport

`nearbyChefDiscoveryApi.listNearbyKitchens()`:

- calls only `GET /api/v1/discovery/kitchens`,
- sends only the five supported query parameters,
- validates request ranges before transport,
- validates response structure with Zod,
- rejects a response whose location/radius/page context does not match the request,
- uses the established shared HTTP client and request-dedupe mechanism,
- does not add guessed rating, ETA, favorite, cuisine, verification, media, search, sort, or serviceability fields.

### Query/cache model

`useNearbyChefDiscoveryQuery()`:

- uses the established TanStack Query architecture,
- requires an authenticated customer identity and selected saved browsing location,
- passes the exact saved location coordinates to discovery,
- uses infinite pagination driven by authoritative `hasNext` metadata,
- scopes the private cache by customer, role, saved-address ID, exact latitude/longitude, radius, and page size,
- changes the cache key if coordinates change even when the saved address ID remains the same,
- exposes a bounded invalidation helper for nearby-chef discovery variants.

No customer profile list, static chef list, or fake production entity is used.

---

## 5. Contract Gaps / Blockers

The 183-page guide requires a richer Discover Home Chefs experience than the current `GET /api/v1/discovery/kitchens` contract supplies. Reasonable repository searches did not find an authoritative current-branch contract for:

- delivery serviceability eligibility for a kitchen/customer location,
- delivery ETA/estimate,
- chef/kitchen rating and review summary,
- cuisine taxonomy or cuisine filtering,
- chef/kitchen favorite state and favorite/unfavorite mutation,
- verification badge/status for the public discovery summary,
- chef avatar/kitchen image/sample-dish media in the nearby-kitchen response,
- chef search query parameter,
- rating/distance/availability/sort filter parameters.

These are not invented in P34. They remain explicit dependencies for later UI acceptance where required.

Because `phases.md` includes exact serviceability mapping in P34 scope and no concrete delivery-serviceability contract is present, P34 remains **PARTIAL**, not DONE.

---

## 6. Changed Files

Implementation:

- `apps/mobile/src/features/chefDiscovery/api/nearbyChefDiscoveryApi.ts`
- `apps/mobile/src/features/chefDiscovery/query/nearbyChefDiscoveryQueries.ts`

Tests:

- `apps/mobile/src/features/chefDiscovery/nearbyChefDiscoveryApi.test.ts`
- `apps/mobile/src/features/chefDiscovery/nearbyChefDiscoveryQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P34_NEARBY_CHEF_DISCOVERY_CONTRACT.md`

No backend, APIM, OpenAPI, infrastructure, database, Android native build configuration, P35 UI, Cart/Checkout, or Chef-owner operational feature was changed.

---

## 7. Validation Evidence

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`

Successful implementation run:

- run ID: `31248762726`
- job ID: `93081608217`
- head SHA: `02b17243ff9845825068d3dae4b01c05f5e3ac72`
- conclusion: **SUCCESS**

Passed gates:

1. checkout of `mobile-ui-rebuild-from-scratch`,
2. Node setup and `npm ci`,
3. strict TypeScript: **PASS**,
4. ESLint: **PASS**,
5. Jest: **PASS**,
6. production Android JavaScript bundle generation: **PASS**,
7. backend/APIM/infrastructure source guard: **PASS**.

No Gradle/APK packaging was performed, consistent with the phase build policy.

---

## 8. Acceptance Assessment

| P34 requirement | Result |
|---|---|
| Exact nearby kitchen contract | **IMPLEMENTED / VALIDATED** |
| Exact kitchen summary model | **IMPLEMENTED / VALIDATED** |
| Pagination | **IMPLEMENTED / VALIDATED** |
| Saved-location dependency | **IMPLEMENTED / VALIDATED** |
| Location-sensitive cache identity/invalidation | **IMPLEMENTED / VALIDATED** |
| No customer-profile/fake-chef substitution | **PASS** |
| Exact delivery serviceability mapping | **BLOCKED — no authoritative contract found** |
| Guide-required ETA/rating/cuisine/favorite/verification/media/search/filter/sort summary data | **BLOCKED where required — no authoritative contract found** |

Therefore P34 is **PARTIAL**.

---

## 9. Stop State

**P35 — Discover Home Chefs — Empty Cart was not started.**

**Next phase authorization:** **NONE — stop after P34 and wait for explicit user direction.**
