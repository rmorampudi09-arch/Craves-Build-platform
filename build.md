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
- **P104 — Chef Payout History UI/Withdraw Flow:** PARTIAL at full Guide Reference-50 scope; the real typed/routed payout-history surface, Overview/Transactions local state, Profile/shared-Chef-menu entry paths, explicit unavailable financial states, and disabled fail-closed Withdraw Now action are implemented at the exact P103 contract boundary without fabricated money data or payout mutation. Evidence: `docs/mobile-ui-rebuild/P104_CHEF_PAYOUT_HISTORY_UI_WITHDRAW_FLOW.md`.
- **P105 — Chef Subscription Contract:** BLOCKED at full Guide/product-contract scope; a strict Guide-51 fail-closed Chef platform-subscription boundary is implemented, and the repository's customer meal-subscription routes are explicitly excluded from reuse. Evidence: `docs/mobile-ui-rebuild/P105_CHEF_SUBSCRIPTION_CONTRACT.md`.

**Current executed phase:** **P105 — Chef Subscription Contract**.

**P105 phase start commit:** `e4bac0a0e36160c74f47030a9e7d519e358e8279`  
**P105 implementation/code end:** `564bcdf72bc662b1ca260da75c6bf259fcd69f96`  
**P105 evidence commit:** `af9287e65bb340fb4d4c6037e0814e0d987037a7`

### P105 implemented boundary

- Re-read `agent.md`, `build.md`, `phases.md`, `plan.md`, and full Guide Reference 51 and implemented only P105; no P106 UI/navigation work was started.
- Audited the current Subscription Service controller, DTOs, service authorization/business rules, APIM configuration, and customer mobile subscription handover.
- Confirmed the existing `/api/v1/subscriptions*` and `/api/v1/admin/subscription*` contracts model customer meal-plan subscriptions and chef/admin maintenance of sellable meal plans, not a Chef purchasing/managing a CRAVES platform plan.
- Added a typed Guide-51 capability model for plan catalogue, current plan, eligibility, pricing, feature entitlements, change/cancel/renew, effective dates, and billing-provider integration.
- Every required Chef platform-subscription capability remains explicit `BACKEND_CONTRACT_UNAVAILABLE`; the contract model status is `blocked`.
- Added explicit excluded-source metadata for the customer/admin meal-subscription routes to prevent accidental semantic reuse in future P106 work.
- Added fail-closed mutation boundaries for change/cancel/renew with `allowed: false`.
- No HTTP wrapper was added because no exact Chef platform-subscription APIM/backend contract exists.
- No Basic/Premium/Pro tier values, price, tax, benefit, eligibility, proration, effective date, provider state, or subscription mutation route was fabricated.
- No navigation, screen, profile-row, customer-screen, backend, APIM, OpenAPI, database, infrastructure, dependency, provider, or secret change was made.

### P105 changed code files

- `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionContract.ts`
- `apps/mobile/src/features/chefSubscription/domain/chefSubscriptionContract.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P105_CHEF_SUBSCRIPTION_CONTRACT.md`
- `build.md`

### P105 exact sources / contract distinction

- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, full 183-page authority, Guide Reference 51 / source page 43 / `image51.jpeg`.
- `services/subscription-service/src/main/java/in/craves/subscription/web/SubscriptionController.java`.
- `services/subscription-service/src/main/java/in/craves/subscription/web/ApiDtos.java`.
- `services/subscription-service/src/main/java/in/craves/subscription/service/SubscriptionService.java`.
- `scripts/configure-subscription-apim.sh`.
- `docs/handover/2026-07-30-customer-mobile-subscription-plans.md`.

The audited service uses weekly/monthly sellable meal plans and customer subscriptions with service dates/delivery-address semantics. Those contracts are not the Guide-51 Chef platform-membership contract and are not reclassified for mobile.

### P105 validation / guard state

- `GitHub.compare_commits` from phase-start HEAD `e4bac0a0e36160c74f47030a9e7d519e358e8279` through code end `564bcdf72bc662b1ca260da75c6bf259fcd69f96` is fast-forward by two commits and contains exactly the two P105 code/test files listed above.
- Source review confirms all ten Guide-51 contract capabilities fail closed and no fabricated Chef subscription route is present.
- Focused test source covers blocked capabilities, excluded customer meal-subscription routes, disabled change/cancel/renew, and absence of fabricated tier/endpoint values.
- Focused Jest execution is not claimed from this connector-only run.
- GitHub Actions are intentionally not claimed as a P105 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Full workspace dependency installation, strict TypeScript, ESLint, Jest execution, production Android bundle/build, emulator/device behavior, and Reference-51 visual validation are **not recorded as passing or failing for P105** from this connector-only contract phase.
- P105 is **BLOCKED at full Guide/product-contract scope** because the exact Chef platform-subscription API/entitlement/billing contract does not exist in the audited repository surface. The mobile boundary is intentionally non-runnable rather than deceptive.

### P105 retained blockers instead of fabricated Guide capabilities

1. No approved Chef platform plan catalogue contract.
2. No current Chef platform subscription contract.
3. No Chef plan eligibility contract.
4. No authoritative pricing/currency/tax/billing-cycle contract.
5. No feature-entitlement contract.
6. No upgrade/downgrade/proration/idempotency contract.
7. No Chef platform cancellation contract.
8. No renewal/reactivation contract.
9. No effective-date/pending/grace-period/cancel-date state model.
10. No mobile billing-provider integration contract for Chef platform subscription.

**Next phase in sequence:** **P106 — Chef Subscription Plan UI — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P105. Do not pre-implement P106 without explicit user direction.

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
| P104 | PARTIAL at full Guide Reference-50 scope; real fail-closed payout-history UI/withdraw boundary implemented | `docs/mobile-ui-rebuild/P104_CHEF_PAYOUT_HISTORY_UI_WITHDRAW_FLOW.md` |
| P105 | BLOCKED at full Guide/product-contract scope; fail-closed Chef platform-subscription boundary implemented | `docs/mobile-ui-rebuild/P105_CHEF_SUBSCRIPTION_CONTRACT.md` |
| P106 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P106 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, and P105 evidence. Preserve the P105 ownership boundary: the existing `/api/v1/subscriptions*` and `/api/v1/admin/subscription*` contracts are customer meal-plan/sellable-plan contracts and must not be presented as the Chef's CRAVES platform membership. Do not invent current plan, Basic/Premium/Pro pricing/benefits, entitlements, eligibility, proration, effective dates, billing-provider behavior, or change/cancel/renew routes. Do not alter backend/APIM without explicit authority, and do not advance beyond the single explicitly authorized phase.
