# CRAVES Mobile Build / Implementation Ledger

**Purpose:** Authoritative living record for the current mobile rebuild. Read this before changing code. Do not infer completion from old APKs, old branches, screenshots, historical documents, or prior chat claims.

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Authoritative rebuild branch:** `mobile-ui-rebuild-from-scratch`  
**Mobile workspace:** `apps/mobile`  
**Backend/APIM guard baseline:** `8a2444cde508ea2fb20cb9822397e55c29bd8c5f`  
**Implementation guide:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.  
**Build policy:** Code-level validation during implementation. **No APK per phase.** Final Android APK/AAB only after all implementation/QA gates in `phases.md` are complete.

Historical implementation detail is preserved under `docs/mobile-ui-rebuild/`. `docs/mobile-ui-rebuild/BUILD_LEDGER_THROUGH_P12.md` preserves the early ledger; P13 onward uses dedicated phase evidence documents. This living ledger intentionally keeps the current control state, recent evidence, and active handoff compact.

---

## 1. Current Control State

- **P00–P30: DONE** at their recorded implementation/static-contract scope. Device/reference certification remains deferred where the phase evidence says so.
- **P31–P56:** retain the exact DONE/PARTIAL status, ownership boundary, blockers, and validated CI from their dedicated evidence records. Do not reinterpret a PARTIAL phase as DONE.
- **P57 — Customer Profile/Rewards Contract: DONE.**
- **P58 — Customer Profile — Empty Cart: DONE.**
- **P59 — Customer Profile — Active Cart: DONE.**
- **P60 — Favorites — Empty Cart: PARTIAL.** Missing approved Favorites backend/APIM capability still blocks real populated favorite synchronization/mutations.
- **P61 — Favorites — Active Cart: PARTIAL.** Active-cart wrapper is implemented; inherited Favorites contract gaps remain.
- **P62 — Notifications — Empty Cart: PARTIAL.** Bounded current notification list/read behavior is implemented; true pagination/global aggregates/mark-all/current APIM provenance remain unavailable.
- **P63 — Notifications — Active Cart: PARTIAL.** Shared active-cart wrapper is implemented; inherited P62 contract gaps and physical reference certification remain.
- **P64 — Edit Customer Profile Domain/Form: PARTIAL.** Supported form/update behavior is implemented; unsupported profile capabilities remain explicitly blocked.
- **P65 — Edit Customer Profile Active/Empty Visuals: PARTIAL.** One shared edit route/form and authoritative cart overlay behavior are implemented; full reference/device certification and missing profile capabilities remain.
- **P66 — My Addresses Active/Empty Visuals: PARTIAL.** Saved-address list/default/delete, Deliver Here, available cart refresh, active View Cart, and zero-item hiding are implemented. Address-aware delivery quote/reprice remains unavailable.
- **P67 — Add/Edit Address and Location Permission: PARTIAL.** Shared manual editor, existing-address full-PUT edit, validation/duplicate/default rules, unsaved-change protection, and controlled fallbacks are implemented. New-address persistence, pincode/geocode lookup, and native current-location integration remain unavailable.
- **P68 — Payment Methods Active/Empty Visuals: PARTIAL.** Shared Payments route and active/empty visuals are implemented. Saved token-list data and authoritative online/COD eligibility remain unavailable.
- **P69 — Payment Method Add/Manage Provider Flow: BLOCKED.** No tokenized customer-method setup/list/delete/set-primary contract or wired native Cashfree provider SDK is available.
- **P70 — Coupons/Offers — Empty Cart: BLOCKED.** No executable offers/category/bank-offer/terms/eligibility contract exists.
- **P71 — Coupons/Offers — Active Cart: BLOCKED.** No approved apply/remove/replace mutation or authoritative repriced-cart response exists.
- **P72 — My Reviews — Empty Cart: BLOCKED.** No executable customer review list/readiness/summary/write contract exists.
- **P73 — My Reviews — Active Cart and Review Actions: BLOCKED.** Canonical active-cart capability exists, but required review contracts/actions remain absent.
- **P74 — Customer Settings Active/Empty Visuals: DONE at authorized code/CI scope.** Shared Settings route, account summary, established saved-location selection, notification/cart badges, active/empty cart states, legal/about/support surfaces, P24 logout, and focused hidden bottom-tab treatment were implemented and validated. Its temporary local-only preference affordances were intentionally superseded by P75.
- **P75 — Customer Settings Child Flows: PARTIAL.** Eleven typed Settings child routes are registered. Real Firebase re-authenticated password change, current-device logout, native Share, parent location integration, validation/error/disabled states, and focused tab treatment are implemented. Notification preference mutation, app-wide language/theme application, other-device session management, referral, membership, trusted legal content destinations, and runtime build metadata remain unavailable exact-contract blockers.
- **P76 — Help and Support — Empty Cart: PARTIAL.** Screen 35 is implemented at the exact mobile-contract boundary. Exact support configuration/content/availability/chat/ticket contracts are absent, and runtime Android comparison remains outstanding.
- **P77 — Help and Support — Active Cart: PARTIAL.** Screen 36 reuses the P76 composition with canonical active-cart chrome. Exact support contracts remain absent and runtime Android comparison remains outstanding.
- **P78 — Customer Empty/Search/Offline/No-Data System: PARTIAL.** One configurable eight-state model/component plus context adapters is implemented on supported live surfaces. Live approved connectivity event sourcing, runtime Guide Ref 37 Android comparison, and contract-blocked Favorites/Reviews/Coupons host activation remain outstanding.
- **P79 — Customer Cross-Screen Reconciliation Audit: PARTIAL.** Contract-backed cart, notification, profile, order, search/query/scroll and navigation ownership was audited; stale saved-address/location reconciliation was fixed. Favorites, rewards/profile aggregate order counters, offers/reviews, and address-aware delivery quote/reprice remain unavailable exact-contract boundaries.
- **P80 — Chef Root Shell and Role Isolation: DONE at authorized code/CI scope.** Approved Chef accounts enter a separate typed five-tab shell with Dashboard, Orders, Menu, Analytics, and Profile. Customer-private query/Redux state is cleared before entry; the shell fails closed if isolation fails; no customer cart UI is registered in the Chef domain.
- **P81 — Chef Shared Header/Badge/Operational Counters: DONE at authorized code/CI scope.** All five Chef route boundaries use one shared Chef header/menu and one Chef-scoped TanStack Query operational-state owner. Notification and Orders counters derive from authoritative Chef order/in-app notification contracts; no copied per-screen counter state or polling loop was introduced.
- **P82 — Chef Dashboard Contract Model: DONE at authorized code/CI scope.** A typed, role-scoped dashboard data/query boundary reuses P81 orders/notifications and maps the exact existing Chef earnings and Chef-owned menu contracts. Missing dashboard aggregation, wallet/withdraw eligibility, sales analytics, Chef reviews, and business insights remain explicit typed unavailable capabilities rather than fabricated values.
- **P83 — Chef Dashboard UI: DONE at authorized code/CI scope.** Guide Reference 38 renders the Chef dashboard with shared header/greeting, contract-backed order KPIs, pull-to-refresh, quick actions, active-order lifecycle states, and Chef bottom navigation. Wallet/Withdraw, sales series, reviews, and business insights remain explicit unavailable/disabled UI because P82 established that their exact contracts do not exist.
- **P84 — Chef Order Detail Contract: DONE at authorized code/CI scope.** Guide Reference 39 now has a strict Chef order-detail read/accept/reject contract boundary, server-authorized customer delivery/contact snapshot parsing, Chef-scoped detail query ownership, server-status decision candidates that always require revalidation, and typed unavailable boundaries for the missing acceptance deadline, timeline, customer note, payment-method detail, and separate contact/chat authorization contracts.

**Current executed phase:** **P84 — Chef Order Detail Contract — DONE at authorized code/CI scope**.

**P84 start commit:** `b3f6f4a81db7a7c2a5df9c2a7f53688674c56660`.

**P84 validated mobile code head:** `270897f7e59950f88fcc38ed121cb21f5e1cd148`.

**P84 CI:** workflow run `31305596449`, job `93225354790` — **SUCCESS**. Dependency install, TypeScript strict check, ESLint, Jest, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all passed.

**P84 evidence:** `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md`.

**Next phase in sequence:** **P85 — Chef New Order Detail UI/Actions — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P84. Do not pre-implement P85 without explicit user direction.

---

## 2. Recent Phase Evidence Summary

| Phase | Status | Implementation / evidence | CI |
|---|---|---|---|
| P57 | **DONE** | `docs/mobile-ui-rebuild/P57_CUSTOMER_PROFILE_REWARDS_CONTRACT.md` | `31270356726` / `93135116492` — SUCCESS |
| P58 | **DONE** | `docs/mobile-ui-rebuild/P58_CUSTOMER_PROFILE_EMPTY_CART.md` | `31271539076` / `93138248796` — SUCCESS |
| P59 | **DONE** | `docs/mobile-ui-rebuild/P59_CUSTOMER_PROFILE_ACTIVE_CART.md` | `31271923654` / `93139241176` — SUCCESS |
| P60 | **PARTIAL** | `docs/mobile-ui-rebuild/P60_FAVORITES_EMPTY_CART.md` | `31272588586` / `93140939951` — SUCCESS |
| P61 | **PARTIAL** | `docs/mobile-ui-rebuild/P61_FAVORITES_ACTIVE_CART.md` | `31273123021` / `93142321916` — SUCCESS |
| P62 | **PARTIAL** | `docs/mobile-ui-rebuild/P62_NOTIFICATIONS_EMPTY_CART.md` | `31274137746` / `93144883129` — SUCCESS |
| P63 | **PARTIAL** | `docs/mobile-ui-rebuild/P63_NOTIFICATIONS_ACTIVE_CART.md` | `31274568039` / `93145968430` — SUCCESS |
| P64 | **PARTIAL** | Existing P64 form/domain/API/query implementation on branch | `31276696857` / `93151316827` — SUCCESS as part of P65 integrated state |
| P65 | **PARTIAL** | `docs/mobile-ui-rebuild/P65_EDIT_CUSTOMER_PROFILE_ACTIVE_EMPTY_VISUALS.md` | `31276696857` / `93151316827` — SUCCESS |
| P66 | **PARTIAL** | `docs/mobile-ui-rebuild/P66_MY_ADDRESSES_ACTIVE_EMPTY_VISUALS.md` | `31277654687` / `93153771794` — SUCCESS |
| P67 | **PARTIAL** | `docs/mobile-ui-rebuild/P67_ADD_EDIT_ADDRESS_LOCATION_PERMISSION.md` | `31279558033` / `93158570541` — SUCCESS |
| P68 | **PARTIAL** | `docs/mobile-ui-rebuild/P68_PAYMENT_METHODS_ACTIVE_EMPTY_VISUALS.md` | `31281213495` / `93162733549` — SUCCESS |
| P69 | **BLOCKED** | `docs/mobile-ui-rebuild/P69_PAYMENT_METHOD_ADD_MANAGE_PROVIDER_FLOW.md` | Not triggered — docs/ledger only |
| P70 | **BLOCKED** | `docs/mobile-ui-rebuild/P70_COUPONS_OFFERS_EMPTY_CART.md` | Not triggered — docs/ledger only |
| P71 | **BLOCKED** | `docs/mobile-ui-rebuild/P71_COUPONS_OFFERS_ACTIVE_CART.md` | Not triggered — docs/ledger only |
| P72 | **BLOCKED** | `docs/mobile-ui-rebuild/P72_MY_REVIEWS_EMPTY_CART.md` | Not triggered — docs/ledger only |
| P73 | **BLOCKED** | `docs/mobile-ui-rebuild/P73_MY_REVIEWS_ACTIVE_CART.md` | Not triggered — docs/ledger only |
| P74 | **DONE at code/CI scope** | `docs/mobile-ui-rebuild/P74_CUSTOMER_SETTINGS_ACTIVE_EMPTY_VISUALS.md`; validated mobile head `ae4de7be4e010fe621cf0516313991f5746ed4f4` | `31286578557` / `93176403664` — SUCCESS |
| P75 | **PARTIAL** | `docs/mobile-ui-rebuild/P75_CUSTOMER_SETTINGS_CHILD_FLOWS.md`; validated mobile head `f5be75bef913d33492dc872af325f9a51d692f39` | `31287591983` / `93179133618` — SUCCESS |
| P76 | **PARTIAL** | `docs/mobile-ui-rebuild/P76_HELP_SUPPORT_EMPTY_CART.md`; validated mobile head `71cd7d730b7bb526424640f36032862c5ec75413` | `31288445332` / `93181381234` — SUCCESS |
| P77 | **PARTIAL** | `docs/mobile-ui-rebuild/P77_HELP_SUPPORT_ACTIVE_CART.md`; validated mobile head `4d4d07208339d3b43cfc2c5d48acfbd495d6a022` | `31288996661` / `93182864111` — SUCCESS |
| P78 | **PARTIAL** | `docs/mobile-ui-rebuild/P78_CUSTOMER_EMPTY_SEARCH_OFFLINE_NO_DATA_SYSTEM.md`; validated mobile code head `3e3a1c9926c449473fc8bf96a64c731c2b7db025` | `31299091228` / `93208855335` — SUCCESS |
| P79 | **PARTIAL** | `docs/mobile-ui-rebuild/P79_CUSTOMER_CROSS_SCREEN_RECONCILIATION_AUDIT.md`; validated mobile code head `bbaa6c185863a72bff4733be832eda50f107afa9` | `31300386960` / `93212116865` — SUCCESS |
| P80 | **DONE at code/CI scope** | `docs/mobile-ui-rebuild/P80_CHEF_ROOT_SHELL_ROLE_ISOLATION.md`; validated mobile code head `92925304027e52884eca8efedf83a7090ec12d3d` | `31301169438` / `93214080252` — SUCCESS |
| P81 | **DONE at code/CI scope** | `docs/mobile-ui-rebuild/P81_CHEF_SHARED_HEADER_BADGE_OPERATIONAL_COUNTERS.md`; validated mobile code head `fa3009c975fddb683760485c1482183e14ef0cf4` | `31302720042` / `93217987955` — SUCCESS |
| P82 | **DONE at code/CI scope** | `docs/mobile-ui-rebuild/P82_CHEF_DASHBOARD_CONTRACT_MODEL.md`; validated mobile code head `dc2bbc4b574863db4d1e806598a4b75e5a2765c5` | `31303531996` / `93220074043` — SUCCESS |
| P83 | **DONE at code/CI scope** | `docs/mobile-ui-rebuild/P83_CHEF_DASHBOARD_UI.md`; validated mobile code head `36d5650cb7648f3f8eaf899ce796615da832e88b` | `31304732867` / `93223151270` — SUCCESS |
| P84 | **DONE at code/CI scope** | `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md`; validated mobile code head `270897f7e59950f88fcc38ed121cb21f5e1cd148` | `31305596449` / `93225354790` — SUCCESS |
| P85 onward | **NOT STARTED / not accepted** | — | — |

---

## 3. P84 Implemented Boundary

**Phase:** Chef Order Detail Contract.  
**Guide reference:** 39 — Chef New Order Detail.

P84 establishes the Reference-39 mobile contract/data/query boundary only. It does not register or render the P85 detail UI.

### Exact read/action contracts

P84 maps the existing authenticated Chef contracts:

- `GET /api/v1/chef/orders/{orderId}`;
- `POST /api/v1/chef/orders/{orderId}/accept` with `{ prepTimeMinutes, note }` and optional `Idempotency-Key`;
- `POST /api/v1/chef/orders/{orderId}/reject` with `{ reason }` and optional `Idempotency-Key`.

The shared mobile HTTP transport remains the single bearer/correlation/error boundary. The server verifies Chef role and kitchen ownership before returning order detail or allowing a decision.

### Authorized detail model

The strict P84 parser exposes only Chef-detail data required by the future screen:

- order/checkout/kitchen identifiers and kitchen name;
- authoritative order status;
- currency plus food/platform/tax/delivery/grand totals;
- Chef response note and preparation time when present;
- immutable customer delivery/contact snapshot authorized by server-side Chef order ownership;
- full delivery address plus latitude/longitude;
- order item names, categories/food types, prices, quantities, and line totals;
- server creation/update timestamps.

`customerIdentityId` is deliberately discarded from the mobile presentation contract because P85 does not need it.

### Server-authoritative actionability

`CHEF_ACCEPTANCE_PENDING` from the latest detail read is treated only as an Accept/Reject **candidate** state. The derived model always sets `requiresServerRevalidation: true`.

Mobile does not implement a parallel order state machine. The Order Service remains authoritative for:

- current transition eligibility;
- database-time acceptance expiry;
- row locking/concurrency;
- idempotent repeat handling;
- conflict/error outcomes.

P85 must re-read immediately before a decision and treat the mutation response/error as final authority.

### Explicit Guide-39 contract gaps

P84 does not fabricate data absent from the current public Chef contract. Typed `BACKEND_CONTRACT_UNAVAILABLE` boundaries remain for:

- authoritative `acceptanceDeadline`/countdown — `chef_acceptance_expires_at` is stored internally but not returned in `OrderResponse`;
- status timeline — internal `order_status_history` has no approved public Chef read endpoint;
- customer checkout/order note — not returned in the current Chef `OrderResponse`;
- customer payment-method detail — only totals/currency/order status are available;
- separate contact authorization, chat, masking-policy payload, and support-event logging contracts.

The returned customer phone/name remain usable only as the server-authorized immutable order contact snapshot. P84 does **not** interpret that snapshot as a separate chat/contact-permission contract.

Critically, mobile does not calculate `createdAt + 30 minutes`; the Chef acceptance window begins after verified payment, so that would create a false SLA.

### Query ownership

`useChefOrderDetailContract(orderId)` provides a private Chef-scoped TanStack Query key containing authenticated user, `CHEF` role, and order ID; abortable reads; bounded staleness; explicit refresh; and no polling. P81 remains the shared list/counter owner, avoiding duplicate Chef operational state.

### Files changed

- `apps/mobile/src/features/chefOrders/api/chefOrderDetailApi.ts`
- `apps/mobile/src/features/chefOrders/api/chefOrderDetailApi.test.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderDetailModel.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderDetailModel.test.ts`
- `apps/mobile/src/features/chefOrders/state/useChefOrderDetailContract.ts`

**P84 validated mobile code head:** `270897f7e59950f88fcc38ed121cb21f5e1cd148`.  
**P84 CI:** `31305596449` / `93225354790` — SUCCESS.  
**P84 evidence:** `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md`.

### P85+ boundary

P84 does **not** add a Chef order-detail screen/route, sticky Accept/Reject UI, mutation orchestration, duplicate-tap UI guards, call/chat/map-deep-link UI, immersive bottom-nav treatment, or later preparing/ready/completed order screens. **P85 remains NOT STARTED.**

Physical Android/reference-image certification remains a later visual-QA gate; P84 is complete only at authorized code/CI scope.

---

## 4. Validation State

Implementation workflow: `.github/workflows/mobile-phase1-ci.yml`.

- P69/P70/P71/P72/P73 were docs/ledger-only checkpoints and did not trigger the mobile path-filtered workflow.
- P74 validated mobile head `ae4de7be4e010fe621cf0516313991f5746ed4f4` passed run `31286578557`, job `93176403664`.
- P75 validated mobile head `f5be75bef913d33492dc872af325f9a51d692f39` passed run `31287591983`, job `93179133618`.
- P76 validated mobile head `71cd7d730b7bb526424640f36032862c5ec75413` passed run `31288445332`, job `93181381234`.
- P77 validated mobile head `4d4d07208339d3b43cfc2c5d48acfbd495d6a022` passed run `31288996661`, job `93182864111`.
- P78 validated mobile code head `3e3a1c9926c449473fc8bf96a64c731c2b7db025` passed run `31299091228`, job `93208855335`.
- P79 validated mobile code head `bbaa6c185863a72bff4733be832eda50f107afa9` passed run `31300386960`, job `93212116865`.
- P80 validated mobile code head `92925304027e52884eca8efedf83a7090ec12d3d` passed run `31301169438`, job `93214080252`.
- P81 validated mobile code head `fa3009c975fddb683760485c1482183e14ef0cf4` passed run `31302720042`, job `93217987955`.
- P82 validated mobile code head `dc2bbc4b574863db4d1e806598a4b75e5a2765c5` passed run `31303531996`, job `93220074043`.
- P83 validated mobile code head `36d5650cb7648f3f8eaf899ce796615da832e88b` passed run `31304732867`, job `93223151270`.
- **P84 validated mobile code head `270897f7e59950f88fcc38ed121cb21f5e1cd148` passed run `31305596449`, job `93225354790`.**

P84 CI confirmed:

- dependency install from lockfile — success;
- TypeScript strict check — success;
- ESLint — success;
- Jest — success;
- production Android JavaScript bundle generation — success;
- backend/APIM/infrastructure source guard — success.

No per-phase APK/AAB was built, consistent with the project build policy.

---

## 5. Active Handoff / Authorization

**Accepted implementation state:** P84 Chef Order Detail Contract is complete at authorized code/CI scope.

**Authoritative code evidence:**

- P84 start: `b3f6f4a81db7a7c2a5df9c2a7f53688674c56660`;
- P84 validated mobile code: `270897f7e59950f88fcc38ed121cb21f5e1cd148`;
- P84 evidence: `docs/mobile-ui-rebuild/P84_CHEF_ORDER_DETAIL_CONTRACT.md`;
- P84 CI: `31305596449` / `93225354790` — SUCCESS.

**Next phase:** P85 — Chef New Order Detail UI/Actions — NOT STARTED.

**Authorization:** NONE. Do not begin P85 until the user explicitly authorizes the next phase.
