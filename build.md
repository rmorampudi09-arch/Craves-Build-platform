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
- **P85 — Chef New Order Detail UI/Actions:** DONE at authorized code scope. The target branch includes the real detail route/UI, server revalidation before accept/reject, idempotency keys, duplicate-action guard, cache reconciliation, and shared operational refresh. Evidence: `docs/mobile-ui-rebuild/P85_CHEF_NEW_ORDER_DETAIL_UI_ACTIONS.md`. CI validation remains externally blocked before runner startup by the recorded GitHub billing/spending-limit condition; do not claim a passing CI run.
- **P86 — Chef Order Tab Query Architecture:** PARTIAL at full product-contract scope; mobile architecture is implemented at the exact currently available backend boundary. Evidence: `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md`. The backend currently exposes only `GET /api/v1/chef/orders` as a newest-100 bounded list with no status/date/page/cursor parameters, so P86 uses deterministic status projections and bounded client pages without inventing unsupported API parameters. Full server-side Completed-history pagination remains blocked pending separately authorized backend/APIM work.

**Current executed phase:** **P86 — Chef Order Tab Query Architecture**.

**P86 implementation boundary:**

- role-scoped `NEW` / `PREPARING` / `READY` / `COMPLETED` query keys;
- deterministic status mapping and tab counts from the authoritative shared Chef order snapshot;
- bounded page model (20 default, 50 maximum) with reconciliation-safe page clamping;
- independent per-status page and scroll state persisted in the root-mounted Chef operational provider;
- preparation timers derived from server `updatedAt + prepTimeMinutes` and fresh wall-clock samples, never a locally incremented drift model;
- no backend/APIM changes and no P87 screen implementation.

**Validation:** focused tests were added/updated. Record CI result only after the resulting commit has an actual runner result; a workflow blocked before runner startup is not a pass.

**Next phase in sequence:** **P87 — Chef Preparing Orders UI — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P86. Do not pre-implement P87 without explicit user direction.

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
| P86 | PARTIAL at full product-contract scope; mobile architecture implemented | `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md` |
| P87 onward | NOT STARTED / not accepted | — |

---

## 3. P86 Exact Backend Boundary

Target-branch inspection confirms:

- `ChefOrderController.listChefOrders` accepts no query parameters and returns `List<OrderResponse>`.
- `OrderService.listChefOrders` reads the newest 100 orders before Chef ownership filtering.
- `OrderResponse` includes `status`, `prepTimeMinutes`, `createdAt`, and `updatedAt` required for P86 classification/timer derivation.
- Backend/APIM changes are outside this phase authorization.

Therefore the mobile layer consumes the existing bounded server snapshot once and derives tab pages locally. This avoids duplicate network requests and avoids fabricating unsupported server paging. It does **not** remove the product-level need for true server-side status/date pagination for long Completed histories.

---

## 4. Handoff

Before any P87 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, and `docs/mobile-ui-rebuild/P86_CHEF_ORDER_TAB_QUERY_ARCHITECTURE.md`. Preserve the P86 query/state/timer ownership instead of creating copied per-screen state.
