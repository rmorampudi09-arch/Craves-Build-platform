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

**Current executed phase:** **P92 — Chef Menu Contract Model**.

**P92 phase start commit:** `ec78b211fb52cc46b66200de012195c446c90ed7`  
**P92 final implementation/code end:** `2b59e2c96e8835562b34a1ebf83b5c275b50ea1e`  
**P92 refreshed evidence commit:** `66f998088e9f5c3d058d678c3ec34c2cd5e47386`

### P92 implemented boundary

- Created one canonical mobile Chef Menu contract/API model under `features/chefMenu`.
- Typed the exact server enums: `DRAFT|ACTIVE|INACTIVE`, `VEG|NON_VEG|EGG`, and `MILD|MEDIUM|SPICY`.
- Modeled the complete current menu-item and image responses, including `kitchenId`, media ownership/storage fields, availability, status, and server timestamps.
- Modeled exact `MenuItemRequest` and `AvailabilityRequest` request shapes and explicit backend validation primitives, including the `0.01` minimum price and positive integer delivery metadata.
- Modeled the exact image MIME allowlist: JPEG, PNG, WebP.
- Hardened unknown-response parsing so numeric strings are not silently coerced and image records must belong to their containing menu item.
- Exposed exact create/replace service defaults for later consumers: `INR`, `DRAFT`, and unavailable/false when the corresponding optional inputs are omitted/null/blank according to server behavior.
- Added wrappers over the existing central `httpClient` for the exact five approved routes only: list, create, PUT replace, availability patch, and image upload.
- Image upload uses multipart `file` with the exact `primary` request parameter and does not manually set a multipart Content-Type boundary.
- Added typed `BACKEND_CONTRACT_UNAVAILABLE` records for Guide-required behavior whose server contract is absent.
- Removed the earlier Dashboard-specific duplicate Chef menu transport model. Dashboard retains compatibility aliases but now delegates menu reads/parsing to P92's canonical contract.
- P93 Chef Menu UI and P94 Add/Edit UI were not started.

### P92 exact contracts / authority review

Exact routes present in the current Catalog Service + Chef Menu APIM configuration:

1. `GET /api/v1/kitchens/me/menu-items`
2. `POST /api/v1/kitchens/me/menu-items`
3. `PUT /api/v1/kitchens/me/menu-items/{menuItemId}`
4. `PATCH /api/v1/kitchens/me/menu-items/{menuItemId}/availability`
5. `POST /api/v1/kitchens/me/menu-items/{menuItemId}/images?primary={boolean}` with multipart `file`

Important current semantics:

- PUT is a full replacement using `MenuItemRequest`, not a partial patch.
- Backend defaults currency to `INR`, status to `DRAFT`, and null/omitted availability to false for create/replace.
- Public catalog visibility currently requires both `status=ACTIVE` and `is_available=true`.
- The dedicated availability request is only `{available, reason?}`; P92 does not invent a visibility field or synthetic stock enum.
- Media type is contractually JPEG/PNG/WebP; max media bytes are runtime configuration and no client-readable capability endpoint exposes the deployed value.

No backend, APIM, OpenAPI, infrastructure, controller, deployment, or server-pipeline source was changed.

### P92 changed code files

- `apps/mobile/src/features/chefMenu/api/chefMenuApi.ts`
- `apps/mobile/src/features/chefMenu/api/chefMenuApi.test.ts`
- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.ts`
- `apps/mobile/src/features/chefDashboard/api/chefDashboardApi.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P92_CHEF_MENU_CONTRACT_MODEL.md`
- `build.md`

### P92 focused test source

The focused source covers:

- exhaustive menu/food/spice enum values, image MIME types, and server defaults;
- full response parsing including media ownership fields;
- fail-closed malformed IDs, timestamps, booleans, numeric strings, prices, and unsupported enum/media values;
- cross-item image ownership rejection;
- exact `0.01` price minimum and positive delivery metadata;
- exact list/create/PUT replace/availability/image-upload routes and bodies;
- malformed menu-item ID rejection before writes;
- typed missing-contract metadata;
- P82 Dashboard compatibility against the canonical full Chef Menu response shape.

### P92 validation / guard state

- P92 source-code changes are confined to the four `apps/mobile` paths listed above; evidence/ledger changes are confined to the P92 evidence file and `build.md`.
- No `services/`, `openapi/`, `infra/`, `apps/api/`, backend/APIM, controller, deployment, or server-pipeline source changed during P92.
- No package/dependency was added.
- Focused Jest test **source** was added/updated and reviewed against current controller/DTO/service/APIM source; execution is not claimed.
- The user explicitly reported that the account's monthly GitHub Actions limit is exhausted and authorized continuing without Actions. Actions are therefore not treated as a P92 pass/fail signal.
- Repository `npm ci`, TypeScript, ESLint, Jest execution, Android JavaScript bundle generation, and device/emulator validation are **not recorded as passing or failing for P92**.
- The current connector environment does not expose an executable private-workspace checkout, so local command execution is not claimed.

### P92 retained blockers instead of fabricated behavior

1. No Chef-owned menu-item detail GET route.
2. No server search/filter/category/summary/pagination parameters on the menu list.
3. No category/subcategory metadata endpoint.
4. No separately named visibility field/mutation or authoritative `Hidden` mapping beyond existing status/availability state.
5. No delete or duplicate mutation.
6. No incomplete/partial draft-save contract; current `MenuItemRequest` still requires core fields even for `status=DRAFT`.
7. No duplicate/name-check endpoint.
8. No image delete/reorder/post-upload set-primary mutations.
9. No explicit catalog publication/sync acknowledgement mutation; customer catalog derives from persisted menu state.
10. No client-readable configured media-size/image-count capability.
11. GitHub Actions/device certification remains unavailable for this phase because of the reported account limit and connector execution boundary.

**Next phase in sequence:** **P93 — Chef Menu UI — NOT STARTED**.

**Next phase authorization:** **NONE AUTHORIZED**.

**Required action:** Stop after P92. Do not pre-implement P93 without explicit user direction.

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
| P93 onward | NOT STARTED / not accepted | — |

---

## 3. Handoff

Before any P93 work, read `plan.md`, `phases.md`, `agent.md`, this ledger, the full 183-page implementation guide, P92 evidence, and the canonical `features/chefMenu/api/chefMenuApi.ts`. Preserve the single Chef Menu contract established in P92 and the shared Chef operational ownership established through P81/P86/P91. Do not add backend/APIM changes or invent missing menu capabilities without separate authorization.
