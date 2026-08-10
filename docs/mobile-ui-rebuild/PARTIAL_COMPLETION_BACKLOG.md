# CRAVES Mobile Rebuild — Partial Completion / Release-Hold Backlog

**Purpose:** Permanent release-closure checklist for mobile rebuild phases and external release holds that remain unresolved while sequential implementation continues.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Created:** 2026-08-08  
**Last P127 reconciliation:** 2026-08-10  
**Release rule:** The application must not be described as fully implemented / production-ready while a required item in this backlog remains open unless the appropriate product/release/security authority explicitly removes or accepts that requirement.

---

## 1. Maintenance Rule

This file is cumulative. Advancing phases does not erase earlier partials or external release holds.

1. Keep phase status honest in `build.md` and dedicated evidence.
2. Track every unresolved acceptance/release item here.
3. Distinguish missing backend/APIM contracts, device/provider evidence, and deliberately later release work.
4. Close an item only after implementation plus required validation/evidence, or explicit authoritative acceptance where the phase definition permits an external blocker.
5. Run this backlog again before any final Android release approval.

---

## 2. Current Open Partial Phases

| Phase | Current status | Why it remains open |
|---|---|---|
| P31 — Home Feed Data Contract and Query Model | **PARTIAL** | Exact nearby discovery/location/pagination/cache subset is complete, but full Home/category/cuisine/recommendation contracts are not authoritative yet. |
| P32 — Customer Home — Empty Cart | **PARTIAL** | Supported Home UI and real nearby/Add/lifecycle behavior are complete, but some acceptance actions depend on missing backend contracts or later product routes/phases. |

**P127 is no longer an open partial phase.** P127 is **DONE at review scope / RELEASE HOLD**; its unresolved external release items are tracked in Section 5 below and do not rewrite prior partial/QA-pending phases as DONE.

---

## 3. P31 Closure Checklist

### P31-A — Server-side category discovery/filtering

- [ ] Define/approve authoritative category filter semantics for discovery/search.
- [ ] Add or confirm the exact backend/APIM query contract.
- [ ] Map it in the mobile query layer without inventing parameters.
- [ ] Add tests for category + location + pagination/cache-key behavior.

**Recorded backend reality:** `/api/v1/discovery/menu-items` supports location/radius/pagination, but the accepted contract recorded by P31 did not expose a `category` query parameter.

### P31-B — Cuisine taxonomy and cuisine filtering

- [ ] Define authoritative cuisine taxonomy/model.
- [ ] Add/confirm cuisine data in the appropriate public catalog/discovery response.
- [ ] Add/confirm server-side cuisine filtering/search semantics.
- [ ] Integrate mobile cuisine chips/filter behavior against the approved contract.

### P31-C — Full Home aggregation / recommendations

- [ ] Decide whether Home recommendations use a dedicated aggregation/recommendation API or approved domain endpoint composition.
- [ ] Define exact response/ranking/pagination/cache behavior.
- [ ] Implement the backend/APIM contract if required.
- [ ] Connect Home recommendation/promotional sections to authoritative data.

**Rule:** do not hardcode production recommendations as a substitute for an authoritative contract.

---

## 4. P32 Closure Checklist

### P32-A — Full catalog search

- [ ] Provide an authoritative dish/chef search route and request/response models.
- [ ] Support query pagination and stale-result protection.
- [ ] Replace bounded loaded-result-only search where product design requires authoritative full search.
- [ ] Verify query restoration through detail/back navigation.

### P32-B — Server category and cuisine filters

- [ ] Close P31-A category contract work.
- [ ] Close P31-B cuisine contract work.
- [ ] Implement draft/applied filters, Reset, Apply, and sort behavior against approved server contracts.

### P32-C — Dish Detail complete contract

- [ ] Register/use the real Dish Detail route.
- [ ] Map authoritative detail data and cache/entity keys.
- [ ] Resolve ingredients contract.
- [ ] Resolve reviews contract.
- [ ] Resolve favorite state/contract on dish detail.
- [ ] Validate availability/current-price/cart compatibility before purchase actions as required.

### P32-D — Chef/Kitchen Detail complete public profile contract

- [ ] Register/use the real customer-facing Kitchen/Chef Profile route.
- [ ] Map authoritative public kitchen identity/profile data.
- [ ] Resolve verification/trust indicators.
- [ ] Resolve rating/review summary data.
- [ ] Resolve serviceability representation.
- [ ] Resolve favorite state where supported.
- [ ] Connect full menu/categories/add behavior.

### P32-E — Favorites

- [ ] Define authoritative customer favorites domain ownership.
- [ ] Add/confirm list favorites contract with pagination.
- [ ] Add/confirm favorite mutation contract.
- [ ] Add/confirm unfavorite/remove contract.
- [ ] Synchronize favorite state across Home, search, Dish Detail, Kitchen Profile, and Favorites without duplicate stores.
- [ ] Support Add/open/remove behavior from Favorites.

### P32-F — Notifications Center

- [ ] Register the real Notifications product route.
- [ ] Implement inbox list UI and lifecycle behavior.
- [ ] Implement read-state mutation and global unread synchronization.
- [ ] Confirm pagination/category-filter behavior required by the reference.
- [ ] Implement allowlisted/authorized deep-link destinations.
- [ ] Preserve active cart/tab state in the active-cart variant.

**Recorded core backend endpoints:** `GET /api/v1/notifications/in-app` and `PATCH /api/v1/notifications/in-app/{noticeId}/read`.

### P32-G — Home recommendation/promotional content

- [ ] Close P31-C recommendation/aggregation decision.
- [ ] Render only backend/approved content.
- [ ] Add loading/empty/error behavior.
- [ ] Validate ranking/cache/refresh behavior.

### P32-H — Final visual/device certification

- [ ] Compare Customer Home Empty Cart against Reference Image 05 on emulator/device.
- [ ] Verify spacing, typography, image aspect ratios, card sizing, safe areas, bottom navigation, keyboard/search behavior, and accessibility.
- [ ] Verify loading/empty/error/offline states visually.
- [ ] Record visual evidence before final visual completion is claimed.

---

## 5. P127 External Release Holds After Review Completion

P127's dedicated final workflow `31404009634` / job `93505762066` is green. The following remain release holds, not P127 in-repository implementation failures:

- [ ] **P127-R1 — Live visual certification:** complete device/emulator comparison for P124 refs 1–18, P125 refs 19–37, and P126 refs 2, 4, 38–52; fix/recapture deviations or obtain authoritative acceptance. **Owner:** Mobile QA / Design QA.
- [ ] **P127-R2 — Native accessibility/responsive/motion validation:** complete real-device TalkBack/font scaling, keyboard/safe-area/responsive, and OS reduced-motion checks recorded by P113–P115. **Owner:** Mobile QA / Accessibility.
- [ ] **P127-R3 — Runtime performance closure:** complete P116 native profiler/image-cache validation and server-contract-dependent pagination/performance boundaries without inventing client behavior. **Owner:** Mobile Platform + Backend/APIM.
- [ ] **P127-R4 — Native/provider E2E and product-contract boundaries:** close or explicitly accept P123/P125 launch blockers, including provider handoff/device coverage and recorded product/backend contract gaps. **Owner:** Backend/APIM + Payments + Product + Mobile.
- [ ] **P127-R5 — Production observability:** approve and verify staged/production telemetry, monitoring, alerting, and operational posture. **Owner:** Ops / Mobile Platform.
- [ ] **P127-R6 — Production signing material:** P127 removed the debug-signing fallback and prepared secure external `CRAVES_ANDROID_*` inputs, but real production keystore/alias/password injection remains P128/release-engineering work. **Owner:** Release Engineering / Security. **Later phase:** P128.
- [ ] **P127-R7 — Toolchain dependency-security disposition:** the production audit now runs and P127 explicitly classifies only the known high-severity `image-size` React Native/Metro advisory set for review closure. Security/Release Engineering must remediate or explicitly accept it for production release; any critical/new/unaccepted high finding fails P127 classification. **Owner:** Mobile Platform / Security.
- [x] **P127-R8 — Test-harness hygiene:** Jest open-handle behavior and LifecyclePrimitives React `act(...)` warnings were corrected; full/integration suites pass the explicit hygiene gates in run `31404009634`. **Closed by:** P127 completion.
- [x] **P127-R9 — Fresh backend-source guard:** backend/APIM/infrastructure unchanged guard passed at final validated P127 code head `bf332ac9ae6ba1c5171a6ab6b6910161e4a939fe`. **Closed by:** P127 completion.
- [ ] **P127-R10 — Final native release artifact validation:** build/sign/install/smoke/checksum/release-notes/rollback work remains P128 only. P127 intentionally validates configuration without constructing the final artifact. **Owner:** Mobile Platform / Release Engineering. **Later phase:** P128.
- [ ] **P127-R11 — Cross-functional release sign-off:** obtain the master-guide-required product/design/engineering/QA/security/operations and applicable legal/privacy/payment/data-retention approvals. **Owner:** Release authorities.

---

## 6. Final Full-Application Closure Gate

Before the rebuild is called **full-fledged / fully implemented / production-ready**:

- [ ] Search this document for every unchecked item.
- [ ] Search `build.md` and phase evidence for every remaining PARTIAL/BLOCKED/QA-PENDING status.
- [ ] Close required backend/APIM contract gaps using authoritative implementations/contracts.
- [ ] Complete emulator/physical-device visual certification for required references.
- [ ] Complete accessibility, performance, native/provider E2E, security, and operations checks.
- [ ] Confirm production telemetry/monitoring/alerting posture.
- [ ] Resolve or explicitly accept dependency-security release holds.
- [ ] Obtain required cross-functional release sign-off.
- [ ] Only then authorize P128 secure signing and final APK/AAB artifact work.

**Important:** P127 review completion does not erase earlier partials and does not authorize a production release by itself.
