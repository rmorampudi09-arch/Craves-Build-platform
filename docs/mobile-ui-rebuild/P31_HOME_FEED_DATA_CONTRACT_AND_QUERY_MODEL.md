# P31 — Home Feed Data Contract and Query Model

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P31 only  
**Status:** **PARTIAL — exact nearby/location/pagination/cache boundary implemented and validated; category/cuisine/full-home contract remains blocked**  
**Started from accepted P30 ledger head:** `58ad6ffd46f09992d1ad1098dd4df7cc2c246bd0`  
**Validated implementation commit:** `641ef5321a886185e5956f966f1710e231ee2ad4`  
**Guide refs:** 5, 6

---

## 1. Authority Reviewed

P31 was executed only after reviewing the current branch authority files and master implementation guide:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`

The governing rule is unchanged: repository/APIM/backend reality is authoritative for concrete API details. Missing category/cuisine/home-feed operations must not be invented from logical guide names or visual requirements.

---

## 2. P31 Scope From `phases.md`

P31 owns:

- exact home-feed/category/cuisine/location query mapping,
- pagination,
- cache keys.

Acceptance requires:

- no hardcoded production feed,
- location changes invalidate correctly.

P32 product-screen/UI work is outside P31 and was not started.

---

## 3. Exact Contract Evidence Found

### 3.1 Nearby menu-item discovery

The current backend exposes:

- `GET /api/v1/discovery/menu-items`

Authoritative sources:

- `services/catalog-service/src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java`
- `services/catalog-service/src/main/java/in/craves/catalog/service/NearbyDiscoveryService.java`
- `services/catalog-service/src/main/java/in/craves/catalog/web/DiscoveryDtos.java`
- `scripts/configure-catalog-discovery-apim.sh`

Exact query parameters used by the mobile P31 adapter:

- `latitude`
- `longitude`
- `radiusMeters`
- `page`
- `size`

Backend validation confirmed by repository source:

- latitude: `-90..90`
- longitude: `-180..180`
- `radiusMeters`: `1..50000`
- page: `>= 0`
- size: `1..100`

The response provides authoritative page metadata:

- `page`
- `size`
- `totalElements`
- `totalPages`
- `hasNext`

and nearby menu-item fields including menu/kitchen IDs, kitchen location, distance, item/category, food type, price/currency, preparation metadata, and primary image URL.

### 3.2 Saved customer location coordinates

The customer address contract includes exact `latitude` and `longitude` values in `CustomerAddressResponse`:

- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`

P31 therefore carries validated saved-address coordinates into the shared customer browsing-location state instead of fabricating coordinates from display text.

---

## 4. Contract Gaps Found

The current branch does **not** provide an authoritative concrete contract for the remaining P31 logical capabilities:

1. no exact home-feed aggregation endpoint was found,
2. no exact cuisine taxonomy endpoint was found,
3. no exact `category` query parameter is defined on nearby discovery,
4. no exact `cuisine` query parameter is defined on nearby discovery,
5. no authoritative cuisine field exists in the current nearby menu-item response,
6. no exact home recommendation endpoint/response contract was found for the guide's full home-feed composition.

Repository searches for a concrete discovery-home route and server `category` request parameter did not produce an approved current-branch operation.

Per `agent.md`, P31 does not invent those operations or silently convert guide-level logical API names into concrete mobile URLs.

---

## 5. Behavior Implemented

### Saved location → exact discovery coordinates

`CustomerBrowsingLocation` now contains validated `latitude` and `longitude`. The customer-shell address parser:

- accepts only valid coordinates,
- maps the backend `addressLabel` contract,
- preserves the selected address ID/display name,
- exposes the exact coordinates needed by discovery.

### Strict nearby-feed transport

`homeFeedApi.listNearbyDishes()`:

- calls only `GET /api/v1/discovery/menu-items`,
- sends only the exact supported query parameters,
- validates request ranges before transport,
- validates the response with Zod,
- rejects response context whose coordinates/radius/page/size do not match the request,
- uses the shared HTTP client's request dedupe/correlation/auth behavior.

### Pagination

The Home query model uses TanStack Query infinite pagination and trusts the backend `hasNext`/`page` metadata for the next page. It does not calculate a fake production feed or hardcode production dishes.

### Cache keys

The private Home discovery cache key includes:

- authenticated customer identity,
- CUSTOMER role,
- selected saved-address ID,
- normalized category/cuisine filter intent,
- discovery radius,
- page size.

Page numbers remain part of TanStack Query's infinite-page state rather than spawning unrelated top-level caches.

### Location invalidation

When the shared customer browsing location changes, all P31 Home discovery variants under the Home query prefix are invalidated. Unrelated private domains are not invalidated by that helper.

### Unsupported category/cuisine requests fail closed

The query model exposes a `contractBlocker` and disables transport when category or cuisine filtering is requested. This is deliberate: the current server contract does not define those query parameters, so P31 does not send guessed parameters or perform a hardcoded production mapping.

---

## 6. Changed Files

Implementation:

- `apps/mobile/src/features/customerShell/state/customerShellSlice.ts`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/home/api/homeFeedApi.ts`
- `apps/mobile/src/features/home/query/homeFeedQueries.ts`

Tests:

- `apps/mobile/src/features/customerShell/customerShell.test.ts`
- `apps/mobile/src/features/home/homeFeedApi.test.ts`
- `apps/mobile/src/features/home/homeFeedQueries.test.ts`

No backend, APIM, OpenAPI, infrastructure, database, native Android build configuration, P32 screen, checkout, payment, or Chef product behavior was changed.

---

## 7. Validation Evidence

Workflow:

- `.github/workflows/mobile-phase1-ci.yml`

Successful final run:

- run ID: `31243903844`
- job ID: `93069234068`
- head SHA: `641ef5321a886185e5956f966f1710e231ee2ad4`
- conclusion: **SUCCESS**

Passed gates:

1. Node `22.13.0` setup + `npm ci`,
2. strict TypeScript: **PASS**,
3. ESLint with zero warnings: **PASS**,
4. Jest: **36/36 suites, 175/175 tests passed**,
5. production Android JavaScript bundle: **PASS**,
6. backend/APIM/infrastructure source guard: **PASS**.

A preceding run exposed one `no-void` lint warning; that P31-local issue was corrected before the final accepted run. The cache-invalidation unit test also uses an infinite test-only query GC time so Jest exits deterministically.

---

## 8. Acceptance Assessment

| P31 requirement | Result |
|---|---|
| Exact location mapping | **IMPLEMENTED / VALIDATED** |
| Exact nearby feed mapping | **IMPLEMENTED / VALIDATED** |
| Pagination | **IMPLEMENTED / VALIDATED** |
| Cache keys | **IMPLEMENTED / VALIDATED** |
| Location-change invalidation | **IMPLEMENTED / VALIDATED** |
| No hardcoded production feed | **PASS** |
| Exact category mapping | **BLOCKED — server query/taxonomy contract absent** |
| Exact cuisine mapping | **BLOCKED — server query/taxonomy/response contract absent** |
| Full logical Home aggregation/recommendations mapping | **BLOCKED — no authoritative concrete current-branch endpoint** |

Because required scope remains contract-blocked, P31 is **PARTIAL**, not DONE.

---

## 9. Visual / Runtime QA

- No P32 Home product screen was built in P31.
- No physical-device visual certification is claimed.
- No live APIM/runtime traffic certification is claimed by this static implementation phase.
- Production APK/AAB generation remains deferred according to the build policy.

---

## 10. Blocker / Stop State

To complete P31, an authoritative current-branch backend/APIM contract is required for the missing category/cuisine/full-home capability, or the phase definition must be explicitly changed by project authority.

**P32 was not started.**

**Next phase authorization:** **NONE — stop after P31 and wait for user direction.**
