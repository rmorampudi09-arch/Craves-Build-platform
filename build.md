# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, 52 embedded reference images.  
**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

**Historical preservation:** The complete ledger through P12 is preserved at `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md`. P13 onward uses dedicated evidence under `docs/mobile-ui-rebuild/`; this living ledger intentionally stays compact while those records preserve phase detail.

---

## 1. Current Control State

- **P00–P30: DONE** at the implementation/static-contract level recorded by their accepted ledger/evidence records. Device/reference certification remains deferred where those records say so.
- **P31–P55:** retain the exact DONE/PARTIAL status, ownership boundaries, blockers and validated CI recorded in their dedicated evidence documents and in the phase summary table below. Do not reinterpret a PARTIAL phase as DONE.
- **P52 — Customer Orders Contract and Pagination: PARTIAL.** Exact `GET /api/v1/orders` newest-first customer order window, strict customer-safe response allowlisting, authoritative amount/status preservation, private customer-scoped query cache, raw-status window counts, conservative history-completeness signaling, cancellation, and invalidation remain authoritative. Full P52 acceptance is still blocked because the current server/APIM contract is fixed to the newest 50 orders and exposes no page/cursor parameters, global counts, or authoritative lifecycle-bucket mapping.
- **P53 — My Orders — Empty Cart: PARTIAL.** The Orders tab root renders the supportable Reference 09 experience over the exact P52 window with shared header state, title/tabs, virtualized order cards, authoritative raw-status/total presentation, pull-to-refresh, loading/empty/error/offline behavior, fixed-window warning, per-tab scroll restoration, scroll-aware bottom navigation, and explicit fail-closed unsupported states.
- **P54 — My Orders — Active Cart: PARTIAL.** The same Orders route renders the supportable Reference 10 active-cart state through the shared cart domain and `SharedViewCartOverlay`. Full P54 acceptance remains blocked because the exact reorder/cart merge-or-replacement validation capability is still unavailable.
- **P55 — Order Detail, Timeline, and Tracking: PARTIAL.** Typed owned-order detail and provider-neutral delivery-tracking child routes are implemented using the existing customer-safe Order Service/APIM contracts. Verified delivery history is rendered as the delivery timeline, with 30-second foreground-only controlled refresh for non-terminal delivery states, pull-to-refresh, HTTPS-only external tracking, private identity/order cache scope, list/detail reconciliation, and stale/offline/invalid/403/404 handling. Full P55 acceptance remains blocked because no customer/API contract currently exposes the order-status lifecycle event history required for a complete order timeline.

**Current executed phase:** **P55 — Order Detail, Timeline, and Tracking** is **PARTIAL**. Every safe/supportable P55 behavior available through the current customer order/detail/delivery contracts is implemented and passed required mobile CI.

**Next phase in sequence:** **P56 — Reorder, Cancellation, and Refund Eligibility** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P56. Wait for explicit user direction.

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
| P56 onward | **NOT STARTED / not accepted** | — | — | — |

### P55 evidence

- User authorized exactly one next phase after P54 while P54 remained correctly recorded as PARTIAL.
- Started from branch head: `8e16ac27e47b583b2b0f8fa5789913b1730a8925`.
- Initial P55 implementation commit: `cedb8e0b47b8ce2086f0d3157f867d39a22f5b18`.
- Final validated implementation/test commit after the lint-gate correction: `4bb32730c1cbae0556db686688cc4c088f7a415f`.
- Evidence: `docs/mobile-ui-rebuild/P55_ORDER_DETAIL_TIMELINE_TRACKING.md`.
- Final implementation CI run/job: `31268384221` / `93130106434` — **SUCCESS**.

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31268384221`
- Job ID: `93130106434`
- Head SHA: `4bb32730c1cbae0556db686688cc4c088f7a415f`
- Phase: **P55 — Order Detail, Timeline, and Tracking**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P55 Implemented Boundary

P55 uses only the already-existing customer-owned read contracts:

```text
GET /api/v1/orders/{orderId}
GET /api/v1/orders/{orderId}/delivery-status
```

The Orders stack now contains typed `CustomerOrderDetail` and `CustomerOrderTracking` child routes carrying only `orderId`. Card tap and `View Details` open the real detail route. The P53 supportable `Track Order` action opens the real delivery-tracking route. Back navigation remains inside the Orders stack so the Orders tab/list instance and prior scroll state are preserved.

Order detail:

- reuses the accepted P52 customer-safe allowlist rather than exposing backend-only identity/contact/location fields;
- validates UUID route IDs and verifies the returned order ID matches the requested ID;
- caches by authenticated customer + order ID using the existing private query-key model;
- reconciles refreshed detail into an already-present newest-50 list entry without inventing page insertion semantics;
- renders verified kitchen, raw order status presentation, timestamps, items, bill, customer-safe delivery address, chef note and prep estimate;
- handles invalid links, missing sessions, offline/stale state, 403 role denial, 404 missing/wrong-owner orders, retry and pull-to-refresh.

Delivery tracking:

- consumes only the current provider-neutral delivery-status endpoint;
- supports the exact 14 current delivery states and rejects unknown states;
- accepts the documented owned-order pre-delivery null projection;
- enforces at most 100 chronological delivery-history entries and renders those events as the real delivery timeline;
- strips raw/unapproved fields and makes only HTTPS tracking URLs externally openable;
- refreshes every 30 seconds only while the app is foreground-active and the delivery is non-terminal;
- stops automatic refresh for `DELIVERED`, `CANCELLED`, `RETURNED`, `FAILED` and non-retriable 4xx resource/access errors;
- keeps pull-to-refresh available;
- does not invent ETA, courier coordinates, a route map, cancellation result or refund result.

P55 deliberately leaves `Reorder` fail-closed because P56 owns reorder/cancellation/refund eligibility and the P54 cart merge-or-replacement blocker remains unresolved.

---

## 5. P55 Acceptance Blocker

P55 records:

```text
P55_ORDER_STATUS_TIMELINE_CONTRACT_UNAVAILABLE
```

The Order Service maintains internal order-status history, but the current customer Order Controller/APIM/OpenAPI surface does not expose an owned-customer order-status event timeline. `GET /api/v1/orders/{orderId}` exposes only the current order status with `createdAt`/`updatedAt`. P55 therefore shows only verified current order status/timestamps in Order Detail and does not fabricate lifecycle events.

The separate delivery-status contract does expose authoritative bounded event history, so its exact history is implemented as the delivery timeline. Because `phases.md`/the guide require order detail + timeline + tracking, the missing public order-status timeline keeps P55 **PARTIAL**, not DONE.

Existing upstream blockers still apply where not owned by P55:

```text
CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE
P53_REFERENCE_ORDER_CARD_METADATA_UNAVAILABLE
P53_NOTIFICATION_INBOX_ROUTE_UNAVAILABLE
P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE
P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE
```

The earlier P53 detail/tracking route blockers are no longer active blockers after P55 because the exact existing owned-customer detail and delivery-status contracts have now been implemented.

---

## 6. P55 Changed Files

Implementation/test:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerOrders/api/customerOrdersApi.ts`
- `apps/mobile/src/features/customerOrders/api/customerOrderTrackingApi.ts`
- `apps/mobile/src/features/customerOrders/components/CustomerOrderCard.tsx`
- `apps/mobile/src/features/customerOrders/domain/customerOrderTrackingTypes.ts`
- `apps/mobile/src/features/customerOrders/presentation/customerOrdersPresentation.ts`
- `apps/mobile/src/features/customerOrders/presentation/customerOrderTrackingPresentation.ts`
- `apps/mobile/src/features/customerOrders/query/customerOrdersQueries.ts`
- `apps/mobile/src/features/customerOrders/screens/CustomerOrderDetailScreen.tsx`
- `apps/mobile/src/features/customerOrders/screens/CustomerOrderTrackingScreen.tsx`
- `apps/mobile/src/features/customerOrders/customerOrderDetailApi.test.ts`
- `apps/mobile/src/features/customerOrders/customerOrderTrackingApi.test.ts`
- `apps/mobile/src/features/customerOrders/customerOrderTrackingPresentation.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P55_ORDER_DETAIL_TIMELINE_TRACKING.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was changed.

---

## 7. Architecture Ownership After P55

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations, View Cart behavior, and cart mutation reconciliation.
- P31–P38 remain authoritative for their recorded discovery/search/filter boundaries.
- P39–P41 remain authoritative for Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for customer-facing Kitchen Profile and Kitchen All Dishes boundaries.
- P45–P51 remain authoritative for their recorded Cart/checkout/payment/address orchestration boundaries and blockers.
- P52 remains authoritative for the exact current customer Orders list response allowlist, returned-window model, private cache, raw-status counts, history-completeness guard and invalidation boundary.
- P53 remains authoritative for My Orders composition, lifecycle states, tabs/scroll restoration and fail-closed actions not superseded by an exact later contract.
- P54 remains authoritative for Orders active-cart View Cart composition and its reorder/cart merge blocker.
- **P55 owns customer Order Detail navigation/query/presentation, provider-neutral Delivery Tracking navigation/query/presentation, exact delivery-history timeline rendering, and bounded foreground refresh.**
- **P56 — Reorder, Cancellation, and Refund Eligibility has not started.**

---

## 8. Explicitly Not Complete After P55

Do not describe any of the following as complete:

- outstanding blockers recorded for P31–P54 that P55 did not explicitly supersede;
- P52 true server pagination/cursor navigation beyond the newest 50 orders;
- P52 global order totals or global per-status/lifecycle-tab counts;
- authoritative mapping from backend statuses to `All`/`Upcoming`/`Completed`/`Cancelled`;
- exact reference thumbnails/ratings/cuisine/human-readable order number where the contract does not supply them;
- approved reorder/cart merge-or-replacement flow;
- a complete customer order-status lifecycle event timeline;
- P56 reorder/cancellation/refund eligibility;
- ETA/map/courier-location tracking not supplied by the accepted customer delivery contract;
- checkout/payment end-to-end flow;
- live provider sandbox/device certification unless a later evidence record explicitly says so;
- Chef operational/product screens;
- full lifecycle/accessibility/performance/security audits;
- final physical-device visual certification of all 52 references;
- final Android APK/AAB.

---

## 9. Required Handoff State

```text
Current branch: mobile-ui-rebuild-from-scratch
Current implemented phase: P55 — PARTIAL
Validated implementation SHA: 4bb32730c1cbae0556db686688cc4c088f7a415f
CI: 31268384221 / 93130106434 — SUCCESS
Evidence: docs/mobile-ui-rebuild/P55_ORDER_DETAIL_TIMELINE_TRACKING.md
P55 blocker: P55_ORDER_STATUS_TIMELINE_CONTRACT_UNAVAILABLE
Inherited Orders blockers: CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE; P53_REFERENCE_ORDER_CARD_METADATA_UNAVAILABLE; P53_NOTIFICATION_INBOX_ROUTE_UNAVAILABLE; P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE; P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE
Next phase: P56 — Reorder, Cancellation, and Refund Eligibility — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
