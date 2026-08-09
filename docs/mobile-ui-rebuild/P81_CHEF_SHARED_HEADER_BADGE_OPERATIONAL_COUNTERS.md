# P81 — Chef Shared Header / Badge / Operational Counters

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P81 only  
**Guide source:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**Phase acceptance:** Chef header/menu/notification badge and shared operational counts use authoritative sources and one shared state boundary rather than copied per-screen counters.  
**Start commit:** `b10ed3e250cfcb18799b7c37d693ab63d5e21ee9`  
**Validated mobile code head:** `fa3009c975fddb683760485c1482183e14ef0cf4`  
**CI:** run `31302720042` / job `93217987955` — **SUCCESS**

## 1. Implemented shared Chef operational state

P81 adds one Chef-shell server-state owner above the five P80 tabs. It does not introduce duplicate screen-owned counts.

- `ChefOperationalProvider` uses the existing TanStack Query client and existing role-scoped private query-key architecture with `role: CHEF`.
- Chef orders are read from the existing authenticated Chef order contract: `GET /api/v1/chef/orders`.
- Chef in-app notices are read from the existing notification-service inbox contract: `GET /api/v1/notifications/in-app?limit=100`.
- Notification read state uses the existing bounded mutation contract: `PATCH /api/v1/notifications/in-app/{noticeId}/read`.
- No polling loop or new background transport was invented. Normal query freshness/refetch behavior remains authoritative.
- Parsers fail closed on unsupported payloads/status values instead of silently producing a falsely low badge/count.
- The order counter parser intentionally retains only order ID/status for this phase; unrelated customer/private/order-detail fields are not copied into Chef shell state.

Shared derived counters are:

- **Pending acceptance:** `CHEF_ACCEPTANCE_PENDING`.
- **Active orders:** `CHEF_ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`.
- **Ready for pickup:** `READY_FOR_PICKUP`.
- **Unread notifications:** notification records whose authoritative `readAt` is `null`.

The visual badge label caps at `99+` while the underlying count remains unchanged.

## 2. Implemented shared Chef header/menu/badges

All five P80 Chef route boundaries now render the same `ChefHeader` composition:

- accessible Chef menu control;
- current Chef section title;
- notification bell with the shared unread-notification badge;
- menu sheet exposing the existing five typed Chef destinations: Dashboard, Orders, Menu, Analytics, Profile;
- compact shared operational summary in the Chef menu;
- real navigation handlers for menu destinations;
- notification sheet with loading, empty, recoverable error/retry, populated, read, and mark-read behavior;
- the existing Orders bottom-tab now shows the shared pending-acceptance badge and accessible new-order count.

A successful mark-read mutation updates the existing Chef notification query cache, so the header badge changes from the same authoritative shared state without maintaining a second counter copy.

## 3. Exact-contract boundary

P81 reused only contracts already present in the repository:

- order-service `ChefOrderController` exposes the principal-scoped `GET /api/v1/chef/orders` route;
- the existing APIM Chef order read configuration exposes that route to the mobile client;
- notification-service owns the in-app inbox for customer and Chef applications;
- the existing mobile notification implementation already uses the bounded inbox list/read endpoints.

No backend, APIM, infrastructure, database, authentication, Redux-store, or second query-client implementation was added or changed by P81.

## 4. Explicit P82+ exclusion

P81 does **not** implement P82 — Chef Dashboard Contract Model or any later Chef screen/domain.

The five tab bodies intentionally remain the structural boundaries created by P80. P81 does not fabricate:

- dashboard metrics, earnings, reviews, availability, or dashboard cards;
- complete Chef Orders list/detail/action UI;
- menu CRUD, availability, scheduling, pricing, inventory, or image flows;
- analytics charts or analytics contracts;
- Chef profile/kitchen/settings/payout/subscription/support screens.

Those remain owned by P82 onward and require separate authorization.

## 5. Files changed

P81 code/test scope:

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/features/chefShell/api/chefOperationalApi.ts`
- `apps/mobile/src/features/chefShell/api/chefOperationalApi.test.ts`
- `apps/mobile/src/features/chefShell/components/ChefHeader.tsx`
- `apps/mobile/src/features/chefShell/domain/chefOperationalCounters.ts`
- `apps/mobile/src/features/chefShell/domain/chefOperationalCounters.test.ts`
- `apps/mobile/src/features/chefShell/state/ChefOperationalProvider.tsx`

Phase evidence/ledger:

- `docs/mobile-ui-rebuild/P81_CHEF_SHARED_HEADER_BADGE_OPERATIONAL_COUNTERS.md`
- `build.md`

## 6. Validation coverage

Focused P81 tests verify:

- accepted Chef order response envelopes are reduced to the exact counter fields;
- unknown/unsupported order statuses fail closed instead of corrupting counts;
- bounded notification records are validated before contributing to unread state;
- malformed notification records fail closed;
- pending-acceptance, active-order, ready-for-pickup, and unread-notification derivation;
- terminal orders do not contribute to active counts;
- zero, normal, and `99+` badge labels.

Validated mobile code head `fa3009c975fddb683760485c1482183e14ef0cf4` passed workflow run `31302720042`, job `93217987955`: dependency install, strict TypeScript, ESLint, Jest, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all succeeded.

The first validation run exposed only React hook dependency lint findings in the provider; the data arrays were stabilized with `useMemo` and the corrected head passed the complete workflow.

No APK/AAB was built, consistent with the implementation-phase policy. Physical Android/reference-image certification is not claimed from source/CI alone.

## 7. Phase boundary

**P81 is DONE at the authorized code/CI scope.** The Chef shared header/menu, notification badge/read flow, Orders pending badge, and shared authoritative operational-counter state are implemented and validated.

**P82 — Chef Dashboard Contract Model is NOT STARTED and was not authorized in this turn.**
