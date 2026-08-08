# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** Full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.  
**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13 onward uses dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger intentionally stays compact while those records preserve phase detail.

---

## 1. Current Control State

- **P00–P30: DONE** at the implementation/static-contract level recorded by their accepted ledger/evidence records. Device/reference certification remains deferred where those records say so.
- **P31–P56:** retain the exact DONE/PARTIAL status, ownership boundaries, blockers, and validated CI recorded in their dedicated evidence documents and the phase summary table below. Do not reinterpret a PARTIAL phase as DONE.
- **P52 — Customer Orders Contract and Pagination: PARTIAL.** The server/APIM contract remains fixed to the newest 50 orders and exposes no page/cursor parameters, global counts, or authoritative lifecycle-bucket mapping.
- **P53 — My Orders — Empty Cart: PARTIAL.** The supported Reference 09 Orders state is implemented over the exact P52 window with explicit unsupported/fail-closed behavior for missing contract capabilities.
- **P54 — My Orders — Active Cart: PARTIAL.** Active-cart composition is implemented; exact reorder/cart merge-or-replacement validation remains unavailable.
- **P55 — Order Detail, Timeline, and Tracking: PARTIAL.** Customer-safe detail/tracking is implemented; the backend still exposes no complete order-status lifecycle event history.
- **P56 — Reorder, Cancellation, and Refund Eligibility: PARTIAL.** The client mutation-authority and revalidation boundary is implemented; exact customer reorder/cancel/refund eligibility and mutation contracts remain unavailable.
- **P57 — Customer Profile/Rewards Contract: DONE.** The approved `GET /api/v1/customer/profile` fields map into a strict mobile profile-hub contract. Rewards, reward history, order aggregate counters, profile notification unread count, and chef-role summary remain explicitly `unsupported` because those semantics are not exposed by the accepted backend/profile contract.
- **P58 — Customer Profile — Empty Cart: DONE.** Reference 11 profile composition replaces the prior Profile placeholder, renders only approved P57 identity fields, capability-gates unsupported data, provides deterministic rows with real navigation or explicit blockers, uses the guarded P24 logout coordinator, and supports loading/empty/error/unsupported/refresh states.
- **P59 — Customer Profile — Active Cart: DONE.** Reference 12 uses the same P58 Profile route with the shared authoritative View Cart overlay. Live cart count/subtotal, real Cart navigation, dynamic bottom clearance, and zero-item return to the P58 layout are implemented without copying or resetting cart state.
- **P60 — Favorites — Empty Cart: PARTIAL.** Reference 19's real `CustomerFavorites` destination, Profile navigation, shared detail-route ownership, heart primitive, and fail-closed unsupported state are implemented. The current branch exposes no approved Favorites APIM/backend contract, so paginated favorites, search/counts, remove/toggle, cross-surface heart synchronization, and favorite-row Add to Cart remain explicitly unavailable rather than fabricated.
- **P61 — Favorites — Active Cart: PARTIAL.** Reference 20 uses the same P60 `CustomerFavorites` route through a state-driven active-cart wrapper. The shared authoritative View Cart overlay, live cart item count/food subtotal, real `CustomerCart` navigation, dynamic bottom clearance, and zero-item return are implemented without creating a second Favorites screen/store. Populated favorite-row Add/quantity/conflict/synchronization behavior remains blocked by the unchanged missing Favorites contract.
- **P62 — Notifications — Empty Cart: PARTIAL.** Reference 21 has a real `CustomerNotifications` destination, shared bounded notification query/badge state, category chips, Today/Earlier grouping, strict read-on-open synchronization, pull-to-refresh/lifecycle states, and an ORDER/DELIVERY destination allowlist. True cursor pagination, authoritative global unread/category aggregates, aggregate mark-all-read, and dedicated current Notifications APIM provenance are not exposed by the accepted repository contract, so those capabilities remain explicitly unavailable rather than fabricated.
- **P63 — Notifications — Active Cart: PARTIAL.** Reference 22 reuses the same P62 `CustomerNotifications` inbox through a state-driven route wrapper with the shared authoritative View Cart overlay. Live cart item count/food subtotal, real `CustomerCart` navigation, dynamic bottom clearance, zero-item fallback, and existing notification read/deep-link actions preserve the shared cart and Profile-tab state. P63 remains PARTIAL because the unchanged P62 Notifications contract gaps and physical reference/device certification remain unresolved.

**Current executed phase:** **P63 — Notifications — Active Cart** is **PARTIAL** at its defined implementation/static-contract scope.

**Next phase in sequence:** **P64 — Edit Customer Profile Domain/Form** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P64. Wait for explicit user direction.

---

## 2. Phase Evidence Summary

| Phase | Status | Validated implementation | Evidence | CI run/job |
|---|---|---|---|---|
| P00–P30 | **DONE** | See historical/dedicated records | `docs/mobile-ui-rebuild/` | See phase evidence |
| P31 | **PARTIAL** | `641ef5321a886185e5956f966f1710e231ee2ad4` | `P31_HOME_FEED_DATA_CONTRACT_AND_QUERY_MODEL.md` | `31243903844` / `93069234068` |
| P32 | **PARTIAL** | `9227a56fb8caf3213d3900bed9e3b4eb7514f543` | `P32_CUSTOMER_HOME_EMPTY_CART.md` | `31245957014` / `93074471641` |
| P33 | **PARTIAL** | `bcb25866df664a77c8b83fa50c029f967d72a9be` | `P33_CUSTOMER_HOME_ACTIVE_CART.md` | `31248405375` / `93080699835` |
| P34 | **PARTIAL** | `02b17243ff9845825068d3dae4b01c05f5e3ac72` | `P34_NEARBY_CHEF_DISCOVERY_CONTRACT.md` | `31248762726` / `93081608217` |
| P35 | **PARTIAL** | `5fd2dfa0b36de13f38db16f45fed374d7f295724` | `P35_DISCOVER_HOME_CHEFS_EMPTY_CART.md` | `31249264023` / `93082900325` |
| P36 | **PARTIAL** | `f86d4e29041330eb768ac53f64848729446c6415` | `P36_DISCOVER_HOME_CHEFS_ACTIVE_CART.md` | `31249712277` / `93083997312` |
| P37 | **PARTIAL** | `1d9e084c8825faab7d2578e481c9fdd4cc6ae865` | `P37_SEARCH_QUERY_ORCHESTRATION.md` | `31250802472` / `93086759138` |
| P38 | **PARTIAL** | `4465618e64908c48e535de7d8fe83cd03a3b9bcd` | `P38_FILTER_AND_SORT.md` | `31251797224` / `93089169496` |
| P39 | **PARTIAL** | `97f5bc10509cbfba17cf9f0a56ed15cdbefdcb94` | `P39_DISH_DETAIL_DATA_CONTRACT.md` | `31252552058` / `93091033108` |
| P40 | **PARTIAL** | `2c0219ca9dd526dad6a162cf09a6c33f02aa8dbb` | `P40_DISH_DETAIL_UI_AND_INTERACTIONS.md` | `31253969455` / `93094455601` |
| P41 | **PARTIAL** | `455d19bcc567e23496f33cc570922b91cee03841` | `P41_DISH_INGREDIENTS.md` | `31254643084` / `93096130239` |
| P42 | **PARTIAL** | `30faa2d2a6d0f7ef4c860f1e166f23d764841c4d` | `P42_CUSTOMER_FACING_KITCHEN_PROFILE_CONTRACT.md` | `31255118989` / `93097257711` |
| P43 | **PARTIAL** | `1925e4c2df9b8601308c4694d31bc39e09171723` | `P43_CUSTOMER_FACING_KITCHEN_PROFILE_UI.md` | `31255924625` / `93099137715` |
| P44 | **PARTIAL** | `4aec92a750929f403e5e94bea1756a8bdbea62b7` | `P44_KITCHEN_ALL_DISHES.md` | `31256729097` / `93101120486` |
| P45 | **PARTIAL** | `f4e71b370c1607e8df6572d0634dc5282da515f0` | `P45_CART_SCREEN_DATA_AND_PRICING_MODEL.md` | `31258338717` / `93105128626` |
| P46 | **PARTIAL** | `8de414d1b70635433b4ac9f7f1164da0c29a6790` | `P46_CART_AND_BILL_SUMMARY_UI.md` | `31259171300` / `93107162275` |
| P47 | **PARTIAL** | `921bdc0af0e307a8e0c99d90a3f57e7d9d6aed41` | `P47_ADDRESS_SELECTION_FOR_COMMERCE.md` | `31260111878` / `93109503409` |
| P48 | **PARTIAL** | `2bd26edbb687a5baaf104c3d4b73d47978c1b122` | `P48_DELIVERY_QUOTE_REPRICE_ORCHESTRATION.md` | `31260767948` / `93111102045` |
| P49 | **PARTIAL** | `f722df0382b5dbe70dd500aae6bf6bab17b7074e` | `P49_CHECKOUT_SESSION_CREATION.md` | `31262925706` / `93116408514` |
| P50 | **PARTIAL** | `3af5efb9caa46d13523858c4e65ac31c7cb776bf` | `P50_PAYMENT_ELIGIBILITY_AND_PROVIDER_HANDOFF.md` | `31263886724` / `93118801738` |
| P51 | **PARTIAL** | `ce2a72cbf950b9a21389a55bcde748c60abbb4fd` | `P51_PAYMENT_SUCCESS_FAILURE_CANCEL_RECOVERY.md` | `31264513219` / `93120381991` |
| P52 | **PARTIAL** | `8222927c4556896c2d686b078b6eb5ec6465b60f` | `P52_CUSTOMER_ORDERS_CONTRACT_AND_PAGINATION.md` | `31265306860` / `93122377531` |
| P53 | **PARTIAL** | `a89d67a14cb32195eb9e69739961be7450808285` | `P53_MY_ORDERS_EMPTY_CART.md` | `31266249367` / `93124744636` |
| P54 | **PARTIAL** | `6320289f9c51dd866dc440c951a5a566ce7c081e` | `P54_MY_ORDERS_ACTIVE_CART.md` | `31266801670` / `93126154241` |
| P55 | **PARTIAL** | `4bb32730c1cbae0556db686688cc4c088f7a415f` | `P55_ORDER_DETAIL_TIMELINE_TRACKING.md` | `31268384221` / `93130106434` |
| P56 | **PARTIAL** | `20081ccef8abb89a25b47c6a8bb278ec42ec45d5` | `P56_REORDER_CANCELLATION_REFUND_ELIGIBILITY.md` | `31269398555` / `93132711235` |
| P57 | **DONE** | `9983592fc87e603a95fa4eace5b6fbf71225057b` | `P57_CUSTOMER_PROFILE_REWARDS_CONTRACT.md` | `31270356726` / `93135116492` |
| P58 | **DONE** | `467b5a71c5b208a151d14b5aeae3d87b5baccd07` | `P58_CUSTOMER_PROFILE_EMPTY_CART.md` | `31271539076` / `93138248796` |
| P59 | **DONE** | `0361027495ab2759f970a58d832fd151b5888bf4` | `P59_CUSTOMER_PROFILE_ACTIVE_CART.md` | `31271923654` / `93139241176` |
| P60 | **PARTIAL** | `b98dcfc79c99680487e27363dc5172884cdf6e07` | `P60_FAVORITES_EMPTY_CART.md` | `31272588586` / `93140939951` |
| P61 | **PARTIAL** | `38016775de4301e39ef6b2f6ea9c1bb4fdb5cd3b` | `P61_FAVORITES_ACTIVE_CART.md` | `31273123021` / `93142321916` |
| P62 | **PARTIAL** | `992376808144b1fe8669982e4f204b1379158e25` | `P62_NOTIFICATIONS_EMPTY_CART.md` | `31274137746` / `93144883129` |
| P63 | **PARTIAL** | `c22b216e36d8fe3b35f9480768d58789ec197b7d` | `P63_NOTIFICATIONS_ACTIVE_CART.md` | `31274568039` / `93145968430` |
| P64 onward | **NOT STARTED / not accepted** | — | — | — |

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31274568039`
- Job ID: `93145968430`
- Head SHA: `c22b216e36d8fe3b35f9480768d58789ec197b7d`
- Phase: **P63 — Notifications — Active Cart**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P62 Notifications Contract Boundary

P62 re-audited the current mobile/backend/APIM repository evidence before widening the existing header-notification foundation.

Accepted exact operations found:

- backend controller: `services/notification-service/src/main/java/in/craves/notification/api/AppNotificationController.java`;
- response model: `services/notification-service/src/main/java/in/craves/notification/api/AppNoticeResponse.java`;
- `GET /api/v1/notifications/in-app` with a bounded `limit`;
- `PATCH /api/v1/notifications/in-app/{noticeId}/read` for a UUID notification ID;
- response fields: `id`, `title`, `body`, `noticeType`, `targetType`, `targetId`, `readAt`, `createdAt`.

Current missing contract capabilities:

- no cursor/page-token/offset pagination contract;
- no authoritative global unread-count endpoint;
- no authoritative category-count endpoint;
- no aggregate mark-all-read operation;
- no client-trusted arbitrary route/URL deep-link field;
- no dedicated current Notifications APIM policy/source was found under `infra/apim/**` during the audit.

P62 therefore does not invent a cursor, aggregate response, mark-all mutation, gateway policy, destination URL, or synthetic server count. Category/unread values are explicitly bounded to the currently loaded latest-list window.

---

## 5. P62 Implemented Empty-Cart Boundary

P62 implements the supported portion of Reference 21:

- `CustomerNotifications` is a typed destination in the existing Profile stack;
- the shared customer header bell opens Notifications instead of acting as refresh-only UI;
- a single private TanStack Query cache owns both inbox data and header-badge source data;
- current strict response parsing remains fail-closed for malformed IDs/timestamps/target IDs;
- the supported latest-100 window is stable-ID deduplicated and newest-first sorted;
- category chips/counts are derived from only that loaded window;
- Today/Earlier grouping and unread/read row presentation are implemented;
- pull-to-refresh, skeleton, sign-in-required, empty, empty-category, error and retry states are implemented;
- per-row read-on-open uses the exact PATCH, de-duplicates concurrent attempts, updates shared cache after success, and does not fake success on failure;
- globally mounted customer headers observe the same cached read state without a duplicate notification store;
- destination metadata is allowlisted to `ORDER -> CustomerOrderDetail` and `DELIVERY -> CustomerOrderTracking` only after validated UUID target IDs;
- unknown/untrusted target types remain readable but do not navigate;
- order detail/tracking routes are reused inside the Profile stack so Back returns to Notifications;
- hitting the supported 100-record bound displays an explicit older-notifications limitation;
- aggregate Mark All is visibly unavailable because the exact server capability does not exist;
- the P62 empty-cart composition is retained as the one Notifications screen used by P63.

Acceptance posture:

- **Notification destination allowlisted/authorized: PASSED.**
- **Unread badge synchronization mechanism: PASSED** through the shared private query cache; the number remains bounded rather than misrepresented as an authoritative all-history unread total.
- **Overall P62: PARTIAL** because true pagination and required aggregate capabilities are not available from the accepted contract.

---

## 6. P62 Changed Files

Implementation/test:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/notifications/domain/customerNotificationsModel.ts`
- `apps/mobile/src/features/notifications/query/customerNotificationQueries.ts`
- `apps/mobile/src/features/notifications/screens/CustomerNotificationsScreen.tsx`
- `apps/mobile/src/features/notifications/customerNotificationsModel.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P62_NOTIFICATIONS_EMPTY_CART.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration changed.

---

## 7. Architecture Ownership After P63

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations, View Cart behavior, and cart mutation reconciliation.
- P31–P38 remain authoritative for their recorded discovery/search/filter boundaries.
- P39–P41 remain authoritative for Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for customer-facing Kitchen Profile and Kitchen All Dishes boundaries.
- P45–P51 remain authoritative for their recorded Cart/checkout/payment/address orchestration boundaries and blockers.
- P52 remains authoritative for customer Orders list contract/window/cache semantics.
- P53–P56 retain their recorded Orders UI/detail/mutation-boundary ownership and blockers.
- P57 owns the normalized customer profile contract and capability availability posture.
- P58 owns the shared Profile hub composition and supported menu/lifecycle behavior.
- P59 owns the Profile-root active-cart wrapper and shared View Cart integration.
- P60 owns the `CustomerFavorites` route registration, Profile-to-Favorites navigation, Favorites heart visual primitive, and explicit fail-closed Favorites capability boundary.
- P61 owns the Favorites-route active-cart wrapper, shared View Cart integration, real Cart navigation, and dynamic active-cart content clearance.
- P62 owns the `CustomerNotifications` inbox destination, shared notification query/badge synchronization, bounded category/list presentation, per-row read synchronization, and strict ORDER/DELIVERY destination allowlist.
- **P63 owns the Notifications-route active-cart wrapper, shared View Cart integration, real `CustomerCart` navigation, dynamic active-cart content clearance, and zero-item fallback to the unchanged P62 composition.**
- **P64 — Edit Customer Profile Domain/Form has not started.**

---

## 8. P63 Notifications Active-Cart Boundary

- **Guide reference:** Reference 22 — Notifications — Active Cart.
- **Starting branch SHA:** `fd5bde0502b4d59209ed380484ceb00fef4002c9`.
- **Validated implementation SHA:** `c22b216e36d8fe3b35f9480768d58789ec197b7d`.
- **Contract boundary:** unchanged from P62; no new endpoint, model, APIM policy, or backend behavior was introduced.
- **Implementation:** `CustomerNotificationsRouteScreen` wraps the existing P62 inbox, reads shared cart count/subtotal selectors, derives route-policy eligibility, mounts `SharedViewCartOverlay`, opens the existing `CustomerCart` route, adds/removes bottom clearance with overlay visibility, and leaves notification read/deep-link behavior inside the existing inbox.
- **State preservation:** notification read-on-open touches only the notification query cache; ORDER/DELIVERY destinations push existing child routes in the Profile stack; no cart reset, tab reset, root replace, duplicate cart store, or duplicate Notifications screen was introduced.
- **Focused test:** `customerNotificationsActiveCart.test.ts` verifies active View Cart visibility, dynamic clearance, and zero-item fallback.
- **CI:** `31274568039` / `93145968430` — SUCCESS for dependency install, strict TypeScript, ESLint, Jest, production Android JS bundle, and backend/APIM source guard.
- **Visual QA:** source/reference composition was implemented from Reference 22, but physical-device/pixel certification is intentionally deferred to the later visual QA phases.
- **Status:** **PARTIAL** because P62 still lacks true notification pagination, authoritative global unread/category aggregates, aggregate mark-all-read, and dedicated current Notifications APIM provenance.
- **Evidence:** `docs/mobile-ui-rebuild/P63_NOTIFICATIONS_ACTIVE_CART.md`.

Changed implementation/test files:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/notifications/customerNotificationsActiveCart.ts`
- `apps/mobile/src/features/notifications/customerNotificationsActiveCart.test.ts`
- `apps/mobile/src/features/notifications/screens/CustomerNotificationsRouteScreen.tsx`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration changed.

---

## 9. Explicitly Not Complete After P63

Do not describe any of the following as complete:

- outstanding blockers recorded for P31–P56 that P63 did not explicitly supersede;
- P52 true server pagination/cursor navigation beyond the newest 50 orders;
- P52 global order totals or authoritative lifecycle-tab counts;
- customer-authoritative reorder/cancellation/refund eligibility or mutations;
- complete customer order-status lifecycle event history;
- reward balance/tier/history backend support;
- customer profile order-status aggregate-count backend support;
- chef role/eligibility summary or Profile role-switch/cart-retention contract support;
- registered Edit Profile, Payments, or Contact us destination routes;
- server-backed Favorites list/search/category counts;
- favorite remove/toggle mutation or synchronized heart state across customer surfaces;
- Favorites optimistic remove animation/undo/rollback;
- favorite-row Add to Cart, quantity changes, cart-conflict flow, and Favorites scroll/filter preservation through those mutations;
- P60 `phases.md` acceptance statement "Favorite heart synchronized across all surfaces";
- populated/reference-certified P61 Favorites active-cart state;
- Notifications cursor/page-token pagination beyond the latest supported 100-record bounded list;
- authoritative global Notifications unread/category aggregate counts;
- aggregate Notifications mark-all-read;
- dedicated current Notifications APIM policy provenance not present in the audited `infra/apim/**` tree;
- physical-device/reference-certified P63 Notifications active-cart state;
- P64 Edit Customer Profile Domain/Form or any later phase;
- live provider sandbox/device certification unless a later evidence record explicitly says so;
- Chef operational/product screens;
- full lifecycle/accessibility/performance/security audits;
- final physical-device visual certification;
- final Android APK/AAB.

---

## 10. Required Handoff State

```text
Current branch: mobile-ui-rebuild-from-scratch
Current implemented phase: P63 — Notifications — Active Cart — PARTIAL
Starting branch SHA: fd5bde0502b4d59209ed380484ceb00fef4002c9
Validated implementation SHA: c22b216e36d8fe3b35f9480768d58789ec197b7d
CI: 31274568039 / 93145968430 — SUCCESS
Evidence: docs/mobile-ui-rebuild/P63_NOTIFICATIONS_ACTIVE_CART.md
P63 implemented: same P62 CustomerNotifications inbox wrapped with shared authoritative View Cart state; live cart count/subtotal; real CustomerCart navigation; dynamic bottom clearance; zero-item fallback; notification read/deep-link actions preserve cart and Profile-tab state
P63 acceptance passed: notification actions do not silently reset cart/tab state at the implemented client scope
P63 remains PARTIAL: inherited P62 gaps remain for true server pagination, authoritative global unread/category aggregates, aggregate mark-all-read, and dedicated current Notifications APIM provenance; physical reference/device certification remains deferred
Inherited blockers: retain all P31–P62 blockers not explicitly superseded
Next phase: P64 — Edit Customer Profile Domain/Form — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
