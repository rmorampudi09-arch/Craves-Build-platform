# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living control record for the current mobile rebuild. Detailed historical evidence remains under `docs/mobile-ui-rebuild/`; this compact ledger does not reclassify earlier phase evidence.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**Build policy:** code-level validation during phases; no APK per phase.

---

## 1. Current Control State

- **P00–P56:** retain the exact DONE/PARTIAL/BLOCKED state recorded in their dedicated evidence. Do not reinterpret historical partial phases as DONE.
- **P57–P59:** DONE.
- **P60–P73:** retain their recorded PARTIAL/BLOCKED exact-contract boundaries in dedicated evidence.
- **P74:** DONE at authorized code/CI scope.
- **P75–P79:** retain recorded PARTIAL states and blockers.
- **P80 — Chef Root Shell and Role Isolation:** DONE at authorized code/CI scope.
- **P81 — Chef Shared Header/Badge/Operational Counters:** DONE at authorized code/CI scope.
- **P82 — Chef Dashboard Contract Model:** DONE at authorized code/CI scope.
- **P83 — Chef Dashboard UI:** DONE at authorized code/CI scope.
- **P84 — Chef Order Detail Contract:** DONE at authorized code/CI scope. Evidence: `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md`.
- **P85 — Chef New Order Detail UI/Actions:** DONE at authorized code scope. Evidence: `docs/mobile-ui-rebuild/P85_CHEF_NEW_ORDER_DETAIL_UI_ACTIONS.md`. CI remains externally blocked before runner startup by the recorded GitHub runner/account condition.
- **P86 — Chef Order Tab Query Architecture:** PARTIAL at full product-contract scope; mobile architecture is implemented at the exact currently available backend boundary. Evidence: `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md`.
- **P87 — Chef Preparing Orders:** PARTIAL at full Guide completion scope; implemented and correctness-hardened to the exact currently authorized mobile/backend boundary. Evidence: `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md`.
- **P88 — Chef Orders — New:** PARTIAL at full Guide completion scope; implemented to the exact currently available mobile/backend contract boundary. Evidence: `docs/mobile-ui-rebuild/P88_CHEF_ORDERS_NEW.md`.
- **P89 — Chef Ready for Pickup:** PARTIAL at full Guide completion scope; Ready UI/read/revalidation/reconciliation and cross-tab Ready entry are implemented to the exact current Chef/backend boundary. Evidence: `docs/mobile-ui-rebuild/P89_CHEF_READY_FOR_PICKUP.md`.
- **P90 — Chef Completed Orders:** PARTIAL at full Guide completion scope; bounded read-only Completed history/detail and all-tab Completed entry are implemented to the exact current Chef/backend boundary. Evidence: `docs/mobile-ui-rebuild/P90_CHEF_COMPLETED_ORDERS.md`.
- **P91 — Chef Realtime/Near-Realtime Order Event Reconciliation:** DONE at authorized code scope; near-real-time refetch/reconciliation is implemented through the existing exact Chef orders contract without inventing a push transport. Evidence: `docs/mobile-ui-rebuild/P91_CHEF_REALTIME_ORDER_RECONCILIATION.md`. GitHub Actions validation is not claimed because the account's monthly Actions capacity is exhausted.
- **P92 — Chef Menu Contract Model:** PARTIAL at full Guide/product-contract scope; the complete currently approved five-route Chef Menu contract is typed, fail-closed parsed, source-tested, and centralized for mobile without inventing missing Guide capabilities. Evidence: `docs/mobile-ui-rebuild/P92_CHEF_MENU_CONTRACT_MODEL.md`. GitHub Actions validation is not claimed because the account's monthly Actions capacity is exhausted.
- **P93 — Chef Menu:** PARTIAL at full Guide scope; the real Chef Menu screen, client-side loaded-list search/filtering, availability mutation with rollback, Dashboard cache synchronization, and read-only item navigation are implemented at the exact P92 contract boundary. Evidence: `docs/mobile-ui-rebuild/P93_CHEF_MENU_UI.md`.
- **P94 — Chef Add New Menu Item:** PARTIAL at full Guide scope; the focused create form, exact server-backed Save Draft/Add Item mutations, client validation, duplicate-tap guard, and Chef Menu/Dashboard cache synchronization are implemented at the current P92 contract boundary. Media/category metadata/incomplete-draft gaps remain explicit. Evidence: `docs/mobile-ui-rebuild/P94_CHEF_ADD_NEW_MENU_ITEM.md`.
- **P95 — Chef Menu Edit/Mutation Hardening:** PARTIAL at full Guide scope; exact current-contract full replacement editing, server-returned cache reconciliation, duplicate-submit guarding, and unsaved-change protection are implemented. Image replacement and structured field-level server binding remain blocked by missing exact contracts/dependencies. Evidence: `docs/mobile-ui-rebuild/P95_CHEF_MENU_EDIT_MUTATION_HARDENING.md`.
- **P96 — Chef Analytics Contract Model:** PARTIAL at full Guide/product-contract scope; Guide-46 analytics capabilities are modeled fail-closed and the existing Orders/Earnings/Menu reads are classified only as reconciliation sources, not fabricated analytics. Evidence: `docs/mobile-ui-rebuild/P96_CHEF_ANALYTICS_CONTRACT_MODEL.md`.
- **P97 — Chef Analytics UI:** PARTIAL at full Guide scope; the real Analytics tab structure, KPI/chart/item/report unavailable states, reference-range presentation, and accessibility semantics are implemented at the exact fail-closed P96 analytics boundary. Evidence: `docs/mobile-ui-rebuild/P97_CHEF_ANALYTICS_UI.md`.
- **P98 — Chef Account Profile:** PARTIAL at full Guide scope; the real `ChefProfileHome` hub, exact kitchen/business-status read, synchronized operational summary, safe role switch/logout, and explicit child-contract blockers are implemented at the exact current mobile/backend boundary. Evidence: `docs/mobile-ui-rebuild/P98_CHEF_ACCOUNT_PROFILE.md`.
- **P99 — Chef Edit Profile Domain/Form:** PARTIAL at full Guide/product-contract scope; exact current kitchen GET/PUT replacement form domain, draft persistence, validation, suspended read-only safety, duplicate-safe/abortable save model, and canonical Chef identity cache synchronization are implemented without inventing missing photo/cuisine/service-area/business-validation contracts. Evidence: `docs/mobile-ui-rebuild/P99_CHEF_EDIT_PROFILE_DOMAIN_FORM.md`.
- **P100 — Chef Edit Profile UI:** PARTIAL at full Guide completion scope; the typed `ChefEditProfile` route, focused reference-aligned form UI, exact P99 field editing/save integration, dirty-back protection, suspended read-only state, loading/retry/error/mutation states, and explicit capability blockers are implemented without fabricating missing Guide contracts. Evidence: `docs/mobile-ui-rebuild/P100_CHEF_EDIT_PROFILE_UI.md`.
- **P101 — Chef Business Information Contract:** PARTIAL at full Guide/product-contract scope; exact current kitchen/application/proof-document sources are modeled fail-closed for mobile, sensitive storage/reviewer identifiers are excluded from the Business Information model, and missing approved-Chef document-maintenance/service-area/cuisine/payout contracts remain explicit. Evidence: `docs/mobile-ui-rebuild/P101_CHEF_BUSINESS_INFORMATION_CONTRACT.md`.
- **P102 — Chef Business Information UI/Document Flow:** PARTIAL at full Guide Reference-49 scope; the registered real Business Information screen, verification/document metadata presentation, supported kitchen edit navigation, independent loading/refresh/error states, and explicit fail-closed unsupported document/service-area/cuisine/payout actions are implemented at the exact P101 backend boundary. Evidence: `docs/mobile-ui-rebuild/P102_CHEF_BUSINESS_INFORMATION_UI_DOCUMENT_FLOW.md`.
- **P103 — Chef Payout Contract and Eligibility:** PARTIAL at full Guide/product-contract scope; the exact Chef earning-ledger response is typed/validated as a non-runnable source boundary, while missing payout summary/balance/series/transactions/bank/eligibility/initiation/detail capabilities remain fail-closed. Evidence: `docs/mobile-ui-rebuild/P103_CHEF_PAYOUT_CONTRACT_ELIGIBILITY.md`.

**Current executed phase:** **P103 — Chef Payout Contract and Eligibility**.

**P103 phase start commit:** `8d03d99bb365b3428c84311666fca1aaaa9dae75`  
**P103 implementation/code end:** `05b3d1cdcfa9de611bed3b0e51f4f12770714a26`  
**P103 evidence commit:** `aa6584431c5b70edebd80d135b82864a20fe4a19`

### P103 implemented boundary

- Re-read Guide Reference 50 and implemented only the authorized P103 contract/eligibility phase; no P104 payout UI/withdraw-flow work was started.
- Audited the exact Integration Service financial controller, response model, service authorization/limit rules, repository behavior, persisted financial schema, module README, and repository APIM exposure evidence.
- Added a typed Chef earning-ledger source model for the exact backend `EarningResponse` financial fields/statuses/order sources.
- Monetary values are normalized as canonical two-decimal strings for safe presentation/reconciliation; mobile does not derive accounting, aggregate earnings, available balance, or withdrawable balance.
- Added strict response validation for UUIDs, three-letter currency, exact statuses/order sources, timestamps, financial value shape, duplicate IDs, and the server-supported 1–500 limit range.
- The current backend `GET /api/v1/chef/earnings` is classified as **source-only**. No runnable mobile HTTP wrapper was added because the current branch does not contain an approved APIM operation for that Chef earnings path and the module README records APIM exposure as a later manual step.
- Added fail-closed Guide-50 capability boundaries for earnings summary, available balance, payout series, payout transactions, bank destination, withdrawal eligibility, withdrawal initiation, and transaction detail.
- Added an explicit withdrawal-eligibility boundary that remains `canWithdraw: false` until exact Chef-role eligibility and initiation contracts exist.
- No full bank identifier, routing data, UPI detail, payout-provider credential, settlement-admin endpoint, or invented payout route is represented in the mobile contract.
- Added focused tests for exact financial parsing, limit bounds, duplicate protection, unsupported status/money rejection, fail-closed capability state, and absence of fabricated payout/bank/withdraw/settlement routes.
- No navigation, screen, query-cache, dependency, customer-screen, backend, APIM, OpenAPI, database, infrastructure, or server-source change was made.

### P103 exact sources / boundaries used

- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, full 183-page authority, Guide Reference 50 / source page 42.
- `plan.md`, `phases.md`, `agent.md`, `build.md`, and P102/P96 evidence.
- `services/integration-service/src/main/java/in/craves/integration/web/ChefFinancialController.java`.
- `services/integration-service/src/main/java/in/craves/integration/settlement/ChefFinancialModels.java`.
- `services/integration-service/src/main/java/in/craves/integration/settlement/ChefFinancialService.java`.
- `services/integration-service/src/main/java/in/craves/integration/settlement/ChefFinancialRepository.java`.
- `services/integration-service/src/main/resources/db/migration/V105__chef_financial_ledger.sql`.
- `services/integration-service/modules/chef-financial-ledger/README.md`.

### P103 changed code files

- `apps/mobile/src/features/chefPayout/api/chefPayoutApi.ts`
- `apps/mobile/src/features/chefPayout/api/chefPayoutApi.test.ts`
- `apps/mobile/src/features/chefPayout/domain/chefPayoutContract.ts`
- `apps/mobile/src/features/chefPayout/domain/chefPayoutContract.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P103_CHEF_PAYOUT_CONTRACT_ELIGIBILITY.md`
- `build.md`

### P103 validation / guard state

- `GitHub.compare_commits` from phase-start HEAD `8d03d99bb365b3428c84311666fca1aaaa9dae75` through code end shows five fast-forward code/test commits and exactly the four new P103 mobile files listed above.
- Source review confirms the final P103 code contains no runtime HTTP call, mutation, payout arithmetic, navigation/UI work, or new dependency.
- Repository-wide exact-path search found backend/web references for `/api/v1/chef/earnings` but no approved APIM operation; the financial-ledger README explicitly lists guarded APIM exposure as a later manual step.
- Focused Jest test source was added, but Jest execution is not claimed from this connector-only run.
- GitHub Actions are intentionally not claimed as a P103 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Full workspace dependency installation, strict TypeScript, ESLint, Jest execution, production Android bundle/build, emulator/device behavior, and Reference-50 pixel validation are **not recorded as passing or failing for P103** from this connector-only implementation run.
- P103 remains **PARTIAL at full Guide scope** because the required production payout capabilities do not have exact current Chef/APIM contracts and mobile does not fabricate them.

### P103 retained blockers instead of fabricated Guide capabilities

1. No approved APIM mobile exposure for the existing Chef earnings ledger read is present in the current branch.
2. No Chef aggregate earnings-summary contract or period semantics.
3. No authoritative available/withdrawable balance contract.
4. No payout trend/time-series/date-bucket contract.
5. No Chef payout/settlement transaction-history or transaction-detail contract.
6. No Chef bank destination/setup contract or approved masked-bank response model.
7. No withdrawal eligibility/minimum/verification contract.
8. No Chef withdrawal initiation endpoint, idempotency contract, confirmation/auth rule, or payout-provider flow.
9. No Chef-readable settlement batch contract; current settlement operations are finance/admin-only.
10. The current financial-ledger module explicitly performs no money movement.

**Next phase in sequence:** **P104 — Chef Payout History UI/Withdraw Flow — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P103. Do not pre-implement P104 without explicit user direction.

---

## 2. Recent Evidence Index

| Phase | Status | Evidence |
|---|---|---|
| P80 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P80_CHEF_ROOT_SHELL_ROLE_ISOLATION.md` |
| P81 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P81_CHEF_SHARED_HEADER_BADGE_OPERATIONAL_COUNTERS.md` |
| P82 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P82_CHEF_DASHBOARD_CONTRACT_MODEL.md` |
| P83 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P83_CHEF_DASHBOARD_UI.md` |
| P84 | DONE at code/CI scope | `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md` |
| P85 | DONE at authorized code scope; CI runner blocked | `docs/mobile-ui-rebuild/P85_CHEF_NEW_ORDER_DETAIL_UI_ACTIONS.md` |
| P86 | PARTIAL at full product-contract scope; exact mobile boundary implemented | `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md` |
| P87 | PARTIAL at full Guide scope; exact authorized boundary implemented/hardened | `docs/mobile-ui-rebuild/P87_CHEF_PREPARING_ORDERS.md` |
| P88 | PARTIAL at full Guide scope; exact current contract boundary implemented | `docs/mobile-ui-rebuild/P88_CHEF_ORDERS_NEW.md` |
| P89 | PARTIAL at full Guide scope; Ready UI/revalidation/cross-tab entry boundary implemented | `docs/mobile-ui-rebuild/P89_CHEF_READY_FOR_PICKUP.md` |
| P90 | PARTIAL at full Guide scope; bounded read-only Completed history/detail boundary implemented | `docs/mobile-ui-rebuild/P90_CHEF_COMPLETED_ORDERS.md` |
| P91 | DONE at authorized code scope; near-real-time refetch/reconciliation implemented; Actions not claimed | `docs/mobile-ui-rebuild/P91_CHEF_REALTIME_ORDER_RECONCILIATION.md` |
| P92 | PARTIAL at full Guide/product-contract scope; exact current five-route menu contract centralized/hardened | `docs/mobile-ui-rebuild/P92_CHEF_MENU_CONTRACT_MODEL.md` |
| P93 | PARTIAL at full Guide scope; exact current Menu UI/availability/detail boundary implemented | `docs/mobile-ui-rebuild/P93_CHEF_MENU_UI.md` |
| P94 | PARTIAL at full Guide scope; exact create-form/server mutation boundary implemented | `docs/mobile-ui-rebuild/P94_CHEF_ADD_NEW_MENU_ITEM.md` |
| P95 | PARTIAL at full Guide scope; exact full-replacement edit/mutation hardening boundary implemented | `docs/mobile-ui-rebuild/P95_CHEF_MENU_EDIT_MUTATION_HARDENING.md` |
| P96 | PARTIAL at full Guide/product-contract scope; fail-closed Analytics contract boundary implemented | `docs/mobile-ui-rebuild/P96_CHEF_ANALYTICS_CONTRACT_MODEL.md` |
| P97 | PARTIAL at full Guide scope; fail-closed real Analytics tab UI boundary implemented | `docs/mobile-ui-rebuild/P97_CHEF_ANALYTICS_UI.md` |
| P98 | PARTIAL at full Guide scope; exact Chef Profile/kitchen/status/session boundary implemented | `docs/mobile-ui-rebuild/P98_CHEF_ACCOUNT_PROFILE.md` |
| P99 | PARTIAL at full Guide/product-contract scope; exact current Chef Edit Profile domain/form boundary implemented | `docs/mobile-ui-rebuild/P99_CHEF_EDIT_PROFILE_DOMAIN_FORM.md` |
| P100 | PARTIAL at full Guide scope; exact current Chef Edit Profile UI boundary implemented | `docs/mobile-ui-rebuild/P100_CHEF_EDIT_PROFILE_UI.md` |
| P101 | PARTIAL at full Guide/product-contract scope; exact current Chef Business Information contract boundary implemented | `docs/mobile-ui-rebuild/P101_CHEF_BUSINESS_INFORMATION_CONTRACT.md` |
| P102 | PARTIAL at full Guide scope; exact current Chef Business Information UI/document-flow boundary implemented | `docs/mobile-ui-rebuild/P102_CHEF_BUSINESS_INFORMATION_UI_DOCUMENT_FLOW.md` |
| P103 | PARTIAL at full Guide/product-contract scope; exact Chef financial source + fail-closed payout eligibility boundary implemented | `docs/mobile-ui-rebuild/P103_CHEF_PAYOUT_CONTRACT_ELIGIBILITY.md` |
| P104 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P104 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, P103 evidence, and the current Chef Profile/Analytics/Dashboard implementations. Preserve P103's fail-closed financial boundary: do not derive aggregate earnings or available/withdrawable balance from ledger rows; do not invent bank, payout-series, payout-transaction, eligibility, initiation, transaction-detail, or settlement routes; do not call the backend earnings path from mobile until an approved APIM operation exists; never expose full bank/payment identifiers; do not alter backend/APIM without explicit phase authority; and do not advance beyond the single explicitly authorized phase.
