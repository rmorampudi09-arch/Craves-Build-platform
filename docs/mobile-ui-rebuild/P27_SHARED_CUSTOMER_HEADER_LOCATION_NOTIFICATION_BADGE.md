# P27 — Shared Customer Header / Location / Notification Badge

Status: **DONE** at implementation/static-contract level. Final physical-device/reference certification remains part of later visual QA.

## Control evidence

- Authoritative branch: `mobile-ui-rebuild-from-scratch`
- Started from P26 ledger head: `9751bc2efc64e5e17f2609bbe553a2044051f237`
- Validated implementation commit: `64fb707a8c0fc4d706f6ee97c05189c9449f5271`
- Successful CI run: `31229329651`
- Initial lint-only CI finding: run `31229225679`; strict TypeScript passed there and the `no-void` lint finding was corrected before final validation.

## Sources reviewed

P27 was implemented only after re-reading:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- `docs/handover/2026-07-30-customer-mobile-addresses.md`
- `docs/handover/2026-07-30-customer-mobile-notifications.md`
- `docs/handover/2026-07-15-customer-address-location.md`
- existing P02 query/API/security foundations

The guide's shared-state rule is preserved: location and notification badge state are shared customer-shell data, not per-screen copies.

## Exact contracts used

### Saved customer locations

- `GET /api/v1/customer/addresses`
- Bearer authentication remains centralized in the existing mobile HTTP/session client.
- Response data is reduced to the minimum customer-shell location fields needed for the selector.
- Address data is not placed in AsyncStorage.

### Notification badge

- `GET /api/v1/notifications/in-app`
- `limit` is clamped to the documented server range and P27 requests the maximum `100` items for the header count.
- Customer-visible notice parsing allow-lists only: `id`, `title`, `body`, `noticeType`, `targetType`, `targetId`, `readAt`, `createdAt`.
- Badge count is calculated only from `readAt === null`, matching the approved notification contract.
- The badge renders `99+` above 99 unread items.

P27 does **not** claim that the list route is an independent total-count endpoint. The header reflects the approved in-app list contract only.

## Implemented behavior

- Added one Redux-owned Customer browsing-location selection shared across customer surfaces.
- Registered the shared state in the application store.
- Added `CustomerHeader` with `default` and `compact` variants.
- Added accessible location and notification interactions with minimum 48dp touch targets.
- Added saved-location selector UI backed by the exact Customer addresses API.
- Selecting a saved location updates the one shared shell state immediately, so every consumer of `useCustomerHeaderState()` receives the same location.
- Added private TanStack Query keys scoped by authenticated identity and CUSTOMER role for saved locations and header notifications.
- Added the notification unread badge query and customer-safe parsing.
- Added location and bell icons to the existing shared icon primitive rather than introducing another icon system.
- Logout now resets Customer shell state in addition to the existing private-query/mutation cache cleanup.
- Added P27 tests for location propagation/reset, `readAt`-only unread calculation, and the 100-item notification contract cap.

## Deliberate boundaries

P27 does not invent or pre-implement later capabilities:

- No native GPS permission/runtime integration was added. The approved address handover explicitly says device GPS/native permission work is pending.
- No geocoding provider, maps SDK, delivery radius, or serviceability promise was introduced.
- No automatic first-address/default selection is invented when no browsing location has been explicitly selected.
- No Notifications Center route/screen, mark-read interaction, order notification navigation, or delivery notification navigation was added; those remain with their owning later notification/product phases.
- No Customer Home/Chefs/Orders/Profile product content was fabricated just to demonstrate the header.
- No cart domain or View Cart behavior was added.
- **P28 was not touched.**
- No backend, OpenAPI, APIM, infrastructure, database, or Android native build configuration file was changed.
- No APK/AAB was built, per implementation-phase policy.

## Changed files

- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`
- `apps/mobile/src/features/customerShell/components/CustomerHeader.tsx`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`
- `apps/mobile/src/features/customerShell/customerShell.test.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/customerShell/state/customerShellSlice.ts`
- `apps/mobile/src/shared/components/Icon.tsx`

## Validation

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

Run `31229329651` on implementation SHA `64fb707a8c0fc4d706f6ee97c05189c9449f5271`: **SUCCESS**.

Passed checks:

1. dependency install,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint,
4. Jest including P27 coverage and prior regressions,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

## Acceptance result

P27 acceptance is satisfied at implementation/static-contract level:

- saved-location changes are owned by one global customer-shell state and therefore propagate immediately to every customer header consumer;
- notification badge data is owned by one authenticated private query and therefore remains consistent across customer header consumers;
- shared header variants consume those shared sources instead of storing per-screen copies.

Final pixel/reference checks and real-device API/runtime behavior remain part of later QA gates and are not falsely claimed here.

## Stop point

**P27 is complete. P28 is not authorized by this record and was not started.**
