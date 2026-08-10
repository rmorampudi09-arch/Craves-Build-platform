# CRAVES Mobile Rebuild — Partial Completion Backlog

**Purpose:** Permanent release-closure checklist for every mobile rebuild phase that is recorded as `PARTIAL` or `BLOCKED` while sequential implementation continues.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Created:** 2026-08-08  
**Release rule:** The application must not be described as fully implemented / production-complete while any required item in this backlog remains open, unless the product authority explicitly removes that requirement.

---

## 1. Maintenance Rule

This file is cumulative. It must not be cleared merely because implementation advances to later phases.

Whenever a phase finishes as `PARTIAL` or `BLOCKED`:

1. keep the phase status honest in `build.md` and its dedicated evidence document,
2. add every unresolved acceptance item to this backlog,
3. record the later owning phase when one exists,
4. distinguish a missing backend/APIM contract from a deliberately later mobile route/UI,
5. close an item only after implementation plus the required validation/evidence exists,
6. run a final backlog closure review before final Android APK/AAB and production-readiness sign-off.

A later phase may legitimately satisfy an earlier phase's open item. When that happens, mark the earlier item complete here and cite the completing phase/evidence.

---

## 2. Current Open Partial Phases

| Phase | Current status | Why it remains open |
|---|---|---|
| P31 — Home Feed Data Contract and Query Model | **PARTIAL** | Exact nearby discovery/location/pagination/cache subset is complete, but full Home/category/cuisine/recommendation contracts are not authoritative yet. |
| P32 — Customer Home — Empty Cart | **PARTIAL** | Supported Home UI and real nearby/Add/lifecycle behavior are complete, but some acceptance actions depend on missing backend contracts or later product routes/phases. |
| P127 — Final Regression and Production Readiness Review | **BLOCKED / NOT RELEASE-READY** | Code-level regression is broadly green, but visual/device certification, release signing, production-only dependency audit, complete native release validation, fresh final-candidate backend guard, and prior-phase external/device blockers remain open. |

Current authoritative evidence remains:

- `docs/mobile-ui-rebuild/P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md`
- `docs/mobile-ui-rebuild/P32_CUSTOMER_HOME_EMPTY_CART.md`
- `docs/mobile-ui-rebuild/P127_FINAL_REGRESSION_PRODUCTION_READINESS_REVIEW.md`
- `build.md`

---

# 3. P31 Closure Checklist

## P31-A — Server-side category discovery/filtering

- [ ] Define/approve authoritative category filter semantics for discovery/search.
- [ ] Add or confirm the exact backend/APIM query contract.
- [ ] Map it in the mobile query layer without inventing parameters.
- [ ] Add tests for category + location + pagination/cache-key behavior.

**Current backend reality:** `/api/v1/discovery/menu-items` supports location/radius/pagination, but the accepted current contract does not expose a `category` query parameter.

**Expected later ownership:** P37/P38 search/filter work can close this when the backend contract exists.

---

## P31-B — Cuisine taxonomy and cuisine filtering

- [ ] Define authoritative cuisine taxonomy/model.
- [ ] Add/confirm cuisine data in the appropriate public catalog/discovery response.
- [ ] Add/confirm server-side cuisine filtering/search semantics.
- [ ] Integrate mobile cuisine chips/filter behavior against the approved contract.

**Current backend reality:** No authoritative cuisine taxonomy endpoint, cuisine response field, or accepted discovery `cuisine` query parameter is present.

**Expected later ownership:** P38 — Filter and Sort, with backend/catalog work before or during that phase.

---

## P31-C — Full Home aggregation / recommendations

- [ ] Decide whether Home recommendations are returned by a dedicated aggregation/recommendation API or composed from approved domain endpoints.
- [ ] Define exact response/ranking/pagination/cache behavior.
- [ ] Implement the backend/APIM contract if required.
- [ ] Connect the Home recommendation/promotional sections to authoritative data.

**Current backend reality:** No authoritative personalized/sponsored recommendation aggregation contract was found; Catalog Service documentation deliberately excludes personalized and sponsored ranking from its current scope.

**Expected later ownership:** Must be resolved in an appropriate later discovery/Home contract phase before final release certification. Do not hardcode production recommendations as a substitute.

---

# 4. P32 Closure Checklist

P32's implemented/validated subset remains preserved in `P32_CUSTOMER_HOME_EMPTY_CART.md`. The following items are intentionally deferred and must be revisited.

## P32-A — Full catalog search

- [ ] Provide an authoritative dish/chef search route and request/response models.
- [ ] Support query pagination and stale-result protection.
- [ ] Replace the P32 bounded loaded-result-only search with the approved full-search behavior where product design requires it.
- [ ] Verify query restoration through detail/back navigation.

**Later phase:** **P37 — Search Query Orchestration**.

**Backend status checked 2026-08-08:** **MISSING FOR FULL SEARCH.** Current public/discovery catalog endpoints provide discovery/detail operations but no authoritative full text dish/chef search contract was found.

---

## P32-B — Server category filters and cuisine filters

- [ ] Close P31-A category contract work.
- [ ] Close P31-B cuisine contract work.
- [ ] Implement draft/applied filters, Reset, Apply, and sort behavior against the approved server contract.

**Later phase:** **P38 — Filter and Sort**.

**Backend status checked 2026-08-08:** **PARTIAL/MISSING.** Category exists as menu-item data, but authoritative server `category` filtering is not accepted; cuisine taxonomy/filter contract is absent.

---

## P32-C — Dish Detail navigation and complete dish contract

- [ ] Register/use the real Dish Detail route.
- [ ] Map authoritative detail data and cache/entity keys.
- [ ] Resolve ingredients contract.
- [ ] Resolve reviews contract.
- [ ] Resolve favorite state/contract on dish detail.
- [ ] Validate availability/current-price/cart compatibility before Add/Buy actions as required.

**Later phases:** **P39 — Dish Detail Data Contract**, **P40 — Dish Detail UI and Interactions**, **P41 — Dish Ingredients**.

**Backend status checked 2026-08-08:** **PARTIALLY READY.** The current Catalog Service already exposes `GET /api/v1/catalog/menu-items/{menuItemId}` and the public menu-item model includes core item identity, description, category, food type, price/currency, serving/preparation/spice data, availability/status, and images. Ingredients/reviews/favorite capabilities are not yet fully authoritative.

---

## P32-D — Chef/Kitchen Detail navigation and complete public profile contract

- [ ] Register/use the real customer-facing Kitchen/Chef Profile route.
- [ ] Map exact public kitchen identity/profile data.
- [ ] Resolve verification/trust indicators.
- [ ] Resolve rating/review summary data.
- [ ] Resolve serviceability representation.
- [ ] Resolve favorite state where supported.
- [ ] Connect full menu/categories/add behavior.

**Later phases:** **P42 — Customer-Facing Kitchen Profile Contract**, **P43 — Customer-Facing Kitchen Profile UI**, **P44 — Kitchen All Dishes**.

**Backend status checked 2026-08-08:** **PARTIALLY READY.** Catalog Service already exposes `GET /api/v1/catalog/kitchens/{kitchenId}` and `GET /api/v1/catalog/kitchens/{kitchenId}/menu-items`. Core kitchen identity/description/location/status data exists. Richer verification/rating/serviceability/favorite capabilities still need authoritative contracts where the UI requires them.

---

## P32-E — Favorites

- [ ] Define authoritative customer favorites domain ownership.
- [ ] Add/confirm list favorites contract with pagination.
- [ ] Add/confirm favorite mutation contract.
- [ ] Add/confirm unfavorite/remove contract.
- [ ] Synchronize the favorite heart across Home, search, Dish Detail, Kitchen Profile, and Favorites list without duplicate stores.
- [ ] Support Add/open/remove behavior from Favorites.

**Later phases:** **P60 — Favorites — Empty Cart**, **P61 — Favorites — Active Cart**.

**Backend status checked 2026-08-08:** **MISSING.** No authoritative current-branch customer Favorites controller/API/domain contract was found. Do not invent endpoints in the mobile layer.

---

## P32-F — Notifications Center

- [ ] Register the real Notifications product route.
- [ ] Implement inbox list UI and lifecycle behavior.
- [ ] Implement read-state mutation and global unread synchronization.
- [ ] Confirm pagination/category-filter behavior required by the reference.
- [ ] Implement allowlisted/authorized deep-link destinations.
- [ ] Preserve active cart/tab state in the active-cart variant.

**Later phases:** **P62 — Notifications — Empty Cart**, **P63 — Notifications — Active Cart**.

**Backend status checked 2026-08-08:** **CORE BACKEND READY / LATER UI CONTRACT WORK REMAINS.** Notification Service exposes:

- `GET /api/v1/notifications/in-app`
- `PATCH /api/v1/notifications/in-app/{noticeId}/read`

The current mobile customer-shell layer already consumes the inbox for unread badge derivation. Pagination/category/deep-link behavior still must be verified/extended when P62 is implemented.

---

## P32-G — Home recommendation/promotional content

- [ ] Close P31-C recommendation/aggregation decision.
- [ ] Render only backend/approved content.
- [ ] Add loading/empty/error behavior for those sections.
- [ ] Validate ranking/cache/refresh behavior.

**Backend status checked 2026-08-08:** **MISSING AUTHORITATIVE RECOMMENDATION CONTRACT.**

---

## P32-H — Final visual/device certification

- [ ] Compare Customer Home Empty Cart against Reference Image 05 on emulator/device.
- [ ] Verify spacing, typography, image aspect ratios, card sizing, safe areas, bottom navigation, keyboard/search behavior, and accessibility.
- [ ] Verify loading/empty/error/offline states visually.
- [ ] Record visual evidence before changing P32 status to final `DONE` if the phase acceptance policy requires reference certification.

**Current status:** CI/code-level validation succeeded; pixel-perfect physical-device/emulator certification has not yet been claimed.

---

# 5. Backend Readiness Snapshot for Deferred P32 Capabilities

| Capability | Backend/API state as of 2026-08-08 | Later phase(s) |
|---|---|---|
| Full dish/chef search | **Missing authoritative full-search contract** | P37 |
| Server category filtering | **Partial: category data exists, filter contract missing** | P38 |
| Cuisine taxonomy/filtering | **Missing** | P38 |
| Recommendations/Home aggregation | **Missing authoritative recommendation contract** | Later Home/discovery closure |
| Dish Detail core data | **Available / partial for full reference needs** | P39–P41 |
| Kitchen/Chef core profile + menu | **Available / partial for full reference needs** | P42–P44 |
| Favorites | **Missing authoritative customer favorites API/domain** | P60–P61 |
| Notifications inbox/read | **Core endpoints available** | P62–P63 |

This snapshot is evidence for planning only. Each owning later phase must re-check current backend/APIM reality before implementation because contracts may evolve.

---

# 6. Final Full-Application Closure Gate

Before the rebuild is called **full-fledged / fully implemented / production-ready**:

- [ ] Search this document for every unchecked item.
- [ ] Search `build.md` for every `PARTIAL` and `BLOCKED` phase.
- [ ] Search all `docs/mobile-ui-rebuild/P*_*.md` evidence files for unresolved blockers/deferred validation.
- [ ] Close required backend/APIM contract gaps using authoritative implementation/contracts.
- [ ] Complete the owning later mobile phases.
- [ ] Re-run required CI/regression/security/performance/accessibility/visual checks.
- [ ] Complete emulator/physical-device reference certification.
- [ ] Confirm all 52 reference-image obligations and cross-screen shared behaviors.
- [ ] Only then proceed to final APK/AAB/signing/release readiness gates.

**Important:** advancing to a later phase does not erase a prior partial. A prior partial is closed only by explicit evidence recorded here and in the build ledger.

---

# 7. P127 Consolidated Production-Readiness Blockers — 2026-08-10

P127 executed the final regression/readiness review but remains **BLOCKED / NOT RELEASE-READY**. The detailed evidence is `docs/mobile-ui-rebuild/P127_FINAL_REGRESSION_PRODUCTION_READINESS_REVIEW.md`.

- [ ] **P127-R1 — Live visual certification:** complete device/emulator comparison for P124 refs 1–18, P125 refs 19–37, and P126 refs 2, 4, 38–52; fix/recapture confirmed deviations or obtain explicit acceptance. **Owner:** Mobile QA / Design QA.
- [ ] **P127-R2 — Native accessibility/responsive/motion validation:** complete real-device TalkBack/font-scaling, keyboard/safe-area/responsive, and OS reduced-motion checks recorded as pending in P113–P115. **Owner:** Mobile QA / Accessibility.
- [ ] **P127-R3 — Runtime performance closure:** complete P116 native profiler/image-cache validation and close server-contract-dependent list/pagination gaps without inventing client-only behavior. **Owner:** Mobile Platform + Backend/APIM.
- [ ] **P127-R4 — Native/provider E2E and contract boundaries:** close or explicitly accept P123/P125 launch blockers, including payment/provider handoff and the recorded customer/Chef product-contract gaps. **Owner:** Backend/APIM + Payments + Product + Mobile.
- [ ] **P127-R5 — Production observability:** approve and verify the production telemetry/monitoring/alerting posture; P120's static guard alone is not external production monitoring certification. **Owner:** Ops / Mobile Platform.
- [ ] **P127-R6 — Production signing:** replace Android `release` debug signing with securely supplied production signing only in the authorized release process; never commit signing secrets. **Owner:** Release Engineering / Security. **Later phase:** P128.
- [ ] **P127-R7 — Dependency-security gate:** run `npm audit --omit=dev --audit-level=high` at the final candidate and resolve or explicitly accept high-severity production findings. P127's install graph reported 15 moderate and 15 high findings, but the production-only audit was skipped after timeout. **Owner:** Mobile Platform / Security.
- [ ] **P127-R8 — Test-harness hygiene:** remove the Jest open-handle leak and React `act(...)` warnings, then rerun the affected full/integration regressions. **Owner:** Mobile Platform / QA.
- [ ] **P127-R9 — Fresh backend-source guard:** rerun the backend/APIM/infrastructure unchanged guard at the final candidate HEAD. Prior normal CI #479 passed, but P127's fresh guard was skipped after timeout. **Owner:** Mobile / Release Engineering.
- [ ] **P127-R10 — Native release validation:** complete release-native compilation and artifact validation only when P128 is authorized. P127 reached debug packaging but timed out during release CMake compilation and therefore certified no release artifact. **Owner:** Mobile Platform / Release Engineering. **Later phase:** P128.

**P128 boundary:** no final signed APK/AAB, artifact publication, install/smoke certification, checksum, release notes, or rollback artifact may be considered complete from P127 evidence.
