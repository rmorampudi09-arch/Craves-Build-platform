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
- **P57 — Customer Profile/Rewards Contract: DONE.** The approved `GET /api/v1/customer/profile` fields now map into a strict mobile profile-hub contract with private query integration, registered-phone readiness fields, full/partial/empty/error/unsupported state handling, and fixtures/tests. Rewards, reward history, order aggregate counters, profile notification unread count, and chef-role summary are explicitly `unsupported` because those semantics are not exposed by the accepted backend/profile contract. No fake balance, counters, role state, fields, or endpoint was introduced.

**Current executed phase:** **P57 — Customer Profile/Rewards Contract** is **DONE** at its defined contract/integration scope.

**Next phase in sequence:** **P58 — Customer Profile UI** — **NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop. Do not pre-implement P58. Wait for explicit user direction.

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
| P58 onward | **NOT STARTED / not accepted** | — | — | — |

---

## 3. Latest Validated CI Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

- GitHub Actions run ID: `31270356726`
- Job ID: `93135116492`
- Head SHA: `9983592fc87e603a95fa4eace5b6fbf71225057b`
- Phase: **P57 — Customer Profile/Rewards Contract**
- Conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

---

## 4. P57 Implemented Contract Boundary

P57 audited the accepted profile API before defining mobile rewards/profile semantics.

Authoritative profile source:

```text
GET /api/v1/customer/profile
```

Accepted server-owned response fields used by mobile:

```text
id
identityId
registeredPhoneNumber
firstName
lastName
email
createdAt
updatedAt
```

The normalized mobile contract provides profile/account metadata and registered-phone readiness. `registeredPhoneNumber`, `last4`, and `isRegistered` are derived only from the server-owned registered phone. P57 does not reinterpret registration as a separate backend `verified` state.

The contract also includes the profile-hub capability surfaces required for P58, but marks unsupported server semantics explicitly instead of inventing values:

- reward balance/tier: `unsupported`, value `null`;
- reward history: `unsupported`, empty entries;
- order aggregate counters: `unsupported`, empty counters;
- profile notification unread count: `unsupported`, value `null`;
- chef role/eligibility summary: `unsupported`, value `null`.

All use the stable fail-closed reason `not-exposed-by-approved-contract`.

P57 exposes discriminated `loading`, `ready`, `empty`, `unsupported`, and `error` states and distinguishes full versus partial profile readiness.

A private customer identity-scoped TanStack Query key, cancellation-aware GET, dedupe key, stale-time policy, and invalidation helper integrate the contract into the existing mobile architecture without duplicating full server profile data into a new global store.

---

## 5. P57 Validation and Exit

Focused fixtures exist for:

- full profile;
- partial profile;
- empty profile;
- unsupported profile source posture.

Focused tests cover approved field mapping, server-owned identity validation, phone readiness/last-four derivation, missing-profile behavior, unsupported rewards/history/count/notification/role semantics, exact route usage, malformed response rejection, and query loading/ready/empty/error mapping.

P57 is **DONE** because its phase acceptance explicitly requires a truthful contract that handles missing/unsupported rewards data rather than requiring the unavailable backend capability to be invented.

P58 may now render only supported profile data and capability-gate unsupported rewards/counters/notification/role surfaces until exact backend contracts exist.

---

## 6. P57 Changed Files

Implementation/test:

- `apps/mobile/src/features/customerProfile/domain/customerProfileContract.ts`
- `apps/mobile/src/features/customerProfile/api/customerProfileApi.ts`
- `apps/mobile/src/features/customerProfile/query/customerProfileQueries.ts`
- `apps/mobile/src/features/customerProfile/fixtures/customerProfileFixtures.ts`
- `apps/mobile/src/features/customerProfile/customerProfileContract.test.ts`
- `apps/mobile/src/features/customerProfile/customerProfileApi.test.ts`
- `apps/mobile/src/features/customerProfile/customerProfileQueries.test.ts`

Evidence:

- `docs/mobile-ui-rebuild/P57_CUSTOMER_PROFILE_REWARDS_CONTRACT.md`

Ledger:

- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was changed.

---

## 7. Architecture Ownership After P57

- P19–P24 remain authoritative for authentication/session/onboarding/logout/private-cache cleanup.
- P25–P30 remain authoritative for Customer shell/header/shared cart foundations, View Cart behavior, and cart mutation reconciliation.
- P31–P38 remain authoritative for their recorded discovery/search/filter boundaries.
- P39–P41 remain authoritative for Dish Detail/ingredients boundaries.
- P42–P44 remain authoritative for customer-facing Kitchen Profile and Kitchen All Dishes boundaries.
- P45–P51 remain authoritative for their recorded Cart/checkout/payment/address orchestration boundaries and blockers.
- P52 remains authoritative for customer Orders list contract/window/cache semantics.
- P53–P56 retain their recorded Orders UI/detail/mutation-boundary ownership and blockers.
- **P57 owns the normalized customer profile hub contract, registered-phone readiness mapping, profile capability availability posture, private customer-profile query key/invalidation boundary, explicit profile load/error/empty/unsupported states, and P58-ready fixtures.**
- **P58 — Customer Profile UI has not started.**

---

## 8. Explicitly Not Complete After P57

Do not describe any of the following as complete:

- outstanding blockers recorded for P31–P56 that P57 did not explicitly supersede;
- P52 true server pagination/cursor navigation beyond the newest 50 orders;
- P52 global order totals or authoritative lifecycle-tab counts;
- customer-authoritative reorder/cancellation/refund eligibility or mutations;
- complete customer order-status lifecycle event history;
- reward balance/tier/history backend support;
- customer profile order-status aggregate-count backend support;
- profile notification unread-count backend support through the P57 accepted contract;
- chef role/eligibility summary backend support through the P57 accepted contract;
- P58 Customer Profile UI;
- live provider sandbox/device certification unless a later evidence record explicitly says so;
- Chef operational/product screens;
- full lifecycle/accessibility/performance/security audits;
- final physical-device visual certification;
- final Android APK/AAB.

---

## 9. Required Handoff State

```text
Current branch: mobile-ui-rebuild-from-scratch
Current implemented phase: P57 — DONE
Validated implementation SHA: 9983592fc87e603a95fa4eace5b6fbf71225057b
CI: 31270356726 / 93135116492 — SUCCESS
Evidence: docs/mobile-ui-rebuild/P57_CUSTOMER_PROFILE_REWARDS_CONTRACT.md
P57 unsupported capabilities: rewards balance/tier/history; order aggregate counters; profile notification unread count; chef role/eligibility summary — all fail closed as not-exposed-by-approved-contract
Inherited blockers: retain all P31–P56 blockers not explicitly superseded
Next phase: P58 — Customer Profile UI — NOT STARTED
Next phase authorization: NONE AUTHORIZED — waiting for user
```
