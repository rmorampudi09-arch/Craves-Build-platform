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

**Current executed phase:** **P91 — Chef Realtime/Near-Realtime Order Event Reconciliation**.

**P91 phase start commit:** `88ef519bf6da4d3ab33d935dc658a285b6262cde`  
**P91 implementation/code end:** `024a01902e443fb3bed8018f843d4b563499b3ef`  
**P91 evidence commit:** `cd725a1225806ff03d34ca9f40a213264712e0b7`

### P91 implemented boundary

- Preserved `ChefOperationalProvider` as the single shared owner of Chef operational orders, Dashboard/order counters, New/Preparing/Ready/Completed projections, and server-derived preparation timers.
- Reused the exact existing `GET /api/v1/chef/orders` read path; no second API client, query client, store, lifecycle model, WebSocket/SSE/socket.io/FCM event channel, or backend route was created.
- Added a 30-second automatic order refresh cadence only while an authenticated Chef session is active and the React Native app is in the foreground.
- Automatic refresh stops while signed out or backgrounded. Leaving the foreground cancels the exact active orders query; returning to the foreground immediately invalidates/revalidates that query.
- Read failures exponentially back off from the 30-second baseline and cap at five minutes, preventing an aggressive fixed-frequency failure loop.
- Existing manual/pull refresh remains unchanged.
- Added timestamp-aware bounded-snapshot reconciliation before fetched orders replace cache state.
- Incoming rows older than a newer cached `updatedAt` cannot regress lifecycle state after a mutation or overlapping request.
- Duplicate incoming IDs collapse to the newest timestamped representation.
- Conflicting equal-timestamp or timestamp-less status rows fail closed to the current cached lifecycle rather than guessing order progression.
- Genuinely newer rows and new order IDs are accepted normally.
- Rows absent from the incoming authoritative bounded snapshot are removed so the client does not accumulate an unbounded synthetic history.
- Because tab counts and Dashboard operational counters continue deriving from the same reconciled snapshot, lifecycle moves update the existing shared surfaces through one ownership path rather than per-screen copies.

### P91 exact contract / authority review

Exact read contract used:

- `GET /api/v1/chef/orders`

The current mobile/backend surface inspected for P91 exposes no approved Chef WebSocket topic, SSE endpoint, socket.io/Pusher transport, or Firebase Messaging event-subscription contract for order lifecycle events. The phase definition explicitly allows a project-supported event/**refetch** mechanism, so P91 uses the existing typed query/refetch path instead of fabricating a realtime protocol.

No backend, APIM, OpenAPI, infrastructure, controller, or server-pipeline source was changed.

### P91 changed code files

- `apps/mobile/src/features/chefOrders/domain/chefOrderEventReconciliation.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderEventReconciliation.test.ts`
- `apps/mobile/src/features/chefShell/state/ChefOperationalProvider.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P91_CHEF_REALTIME_ORDER_RECONCILIATION.md`
- `build.md`

### P91 focused test source

`chefOrderEventReconciliation.test.ts` covers:

- no automatic refresh while signed out/backgrounded;
- foreground baseline cadence;
- bounded exponential failure backoff;
- rejection of older lifecycle snapshots;
- acceptance of newer lifecycle snapshots;
- duplicate incoming-order collapse;
- fail-closed equal/missing timestamp conflicts;
- insertion of new orders and removal of rows missing from the authoritative bounded snapshot.

### P91 validation / guard state

- Phase-start → code-end compare is exactly one commit ahead and contains exactly the three `apps/mobile` paths listed above.
- No `services/`, `openapi/`, `infra/`, `apps/api/`, backend/APIM, or server pipeline source changed in the P91 implementation commit.
- No new package/dependency was added for sockets, push messaging, or another realtime stack.
- Focused Jest test **source** was added and reviewed, but test execution is not claimed.
- The user explicitly reported that the account's monthly GitHub Actions limit is exhausted and authorized continuing without Actions. GitHub Actions was therefore not treated as a phase pass/fail signal.
- Repository `npm ci`, TypeScript, ESLint, Jest execution, Android JavaScript bundle generation, and backend guard commands are **not recorded as passing or failing for P91**.
- The current connector environment does not expose an executable private-workspace checkout/emulator, so local repository/device certification is not claimed.

### P91 retained boundary instead of fabricated behavior

1. **No true server-push event transport:** the exact current repository surface does not expose an approved Chef WebSocket/SSE/FCM order-event subscription contract. P91 therefore implements near-real-time bounded refetch/reconciliation only.
2. **Existing newest-100 list ceiling remains:** `GET /api/v1/chef/orders` still owns the bounded server snapshot and does not become a history/event stream in this phase.
3. **No invented event payload ordering/version:** reconciliation uses the existing authoritative `updatedAt` field. Equal/missing ordering metadata with conflicting statuses fails closed rather than inferring lifecycle progression.
4. **No background polling:** app-background order polling is intentionally disabled; foreground resume revalidates immediately.
5. **CI/device certification:** GitHub Actions capacity is exhausted and no emulator/device execution occurred in this phase.

**Next phase in sequence:** **P92 — Chef Menu Contract Model — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P91. Do not pre-implement P92 without explicit user direction.

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
| P92 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P92 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, and the recent Chef evidence including P86–P91. Preserve the shared Chef operational/query ownership established through P81/P86/P91. Do not add backend/APIM changes or begin Chef Menu work without separate authorization.
