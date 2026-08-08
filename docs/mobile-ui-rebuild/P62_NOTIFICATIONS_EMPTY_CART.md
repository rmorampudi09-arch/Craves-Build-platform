# P62 — Notifications — Empty Cart

## Status

**PARTIAL** at the implementation/static-contract scope defined by `phases.md`.

This evidence records only P62. **P63 — Notifications — Active Cart was not implemented.**

## Authorization and authoritative inputs

The user authorized exactly one next phase on `mobile-ui-rebuild-from-scratch` after asking to verify the current state. `build.md` recorded P61 as PARTIAL and P62 as the next phase, so the authorized phase was P62.

Inputs checked before implementation:

- `agent.md`
- `build.md`
- applicable P62/P63 sequence in `phases.md`
- `plan.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 21 — Notifications — Empty Cart
- current customer shell/header notification parser and badge query
- current Profile/Orders navigation ownership
- notification-service controller and response model
- historical mobile notification handover only as secondary evidence, not as an implementation branch to copy
- current backend/APIM repository evidence
- branch HEAD immediately before implementation

## Starting and validated revisions

- Branch starting SHA before P62 work: `748c10e561252164cc01716fae718ac7c09ba972`
- Initial P62 implementation SHA: `36753c3ccb29aa35203cd79a03d44a1e74594f6f`
- Validated P62 implementation SHA: `992376808144b1fe8669982e4f204b1379158e25`

## Reference 21 requirements reviewed

Reference 21 defines the Notifications empty-cart state with:

- one Notifications inbox with category chips/counts;
- Today/Earlier grouping;
- unread/read visual state;
- notification icon/content/timestamp and row navigation affordance;
- unread badge synchronization with shared app state;
- read-on-open behavior;
- validated/allowlisted destination metadata;
- mark-all-read semantics;
- pagination/pull-to-refresh and stable-ID deduplication;
- loading, empty, offline/error, timeout and retry behavior;
- empty-cart composition with no View Cart control.

`phases.md` P62 specifically requires paginated inbox, category chips, read state, deep-link routing, and the empty-cart variant. Its acceptance conditions are global unread-badge synchronization and allowlisted/authorized notification destinations.

## Exact notification contract found

Authoritative backend implementation inspected:

- `services/notification-service/src/main/java/in/craves/notification/api/AppNotificationController.java`
- `services/notification-service/src/main/java/in/craves/notification/api/AppNoticeResponse.java`

Supported operations:

- `GET /api/v1/notifications/in-app`
  - authenticated customer-scoped list;
  - bounded `limit` request, with the mobile client capped at 100;
- `PATCH /api/v1/notifications/in-app/{noticeId}/read`
  - authenticated per-notification read mutation;
  - UUID notification identifier;
  - successful response has no invented payload semantics.

Response fields used by the mobile parser:

- `id`
- `title`
- `body`
- `noticeType`
- `targetType`
- `targetId`
- `readAt`
- `createdAt`

The current repository does **not** expose an accepted Notifications contract for:

- cursor/page-token pagination or a continuation cursor;
- an authoritative global unread-count endpoint;
- authoritative category aggregate counts;
- aggregate mark-all-read;
- arbitrary client route names or URLs as trusted deep-link destinations.

A dedicated current `infra/apim/**` Notifications policy/source was not found during the P62 audit. P62 therefore does not claim new APIM provenance or invent gateway policy. It extends only the already-present mobile notification path plus the exact backend read route and records the missing gateway/aggregate capabilities as blockers.

## P62 implemented boundary

P62 adds the real `CustomerNotifications` destination in the existing Profile stack and keeps the active-cart variant out of scope.

Implemented behavior:

- the customer header bell now opens the typed `CustomerNotifications` route instead of only refreshing the header query;
- one shared TanStack Query cache owns the authenticated notification collection for the inbox and header badge;
- the existing strict notification parser remains authoritative and rejects invalid IDs/timestamps/target IDs;
- the list is bounded to the latest supported 100 records, deduplicated by stable notification ID, and sorted newest first;
- category chips render `All`, `Orders`, `Offers`, `Updates`, and `Other` with counts derived only from the loaded bounded list;
- notifications group into Today/Earlier sections;
- unread rows render a visible unread marker and the header badge derives from the same shared cached records;
- opening an unread row guards duplicate in-flight read requests, performs the exact PATCH once, updates the shared query cache only after success, then resolves navigation;
- already-read rows do not issue another read mutation;
- failed read mutation does not pretend success or silently navigate as if the state were synchronized;
- pull-to-refresh, skeleton, sign-in-required, empty-list, empty-category, error and retry states are present;
- when the bounded list reaches 100, the UI explicitly warns that older notifications may not be shown;
- mark-all-read is visibly unavailable rather than implemented with fabricated aggregate semantics;
- no `SharedViewCartOverlay`, active-cart clearance, or P63 wrapper was added.

## Destination security / allowlist

Notification content is treated as untrusted.

Only validated server metadata can produce an in-app destination:

- `targetType=ORDER` + validated UUID `targetId` -> existing `CustomerOrderDetail` route;
- `targetType=DELIVERY` + validated UUID `targetId` -> existing `CustomerOrderTracking` route.

Unknown target types, arbitrary route-like strings, missing IDs, and invalid target IDs do not navigate. ORDER/DELIVERY child routes are registered inside the Profile stack so Back returns to Notifications instead of resetting the customer tab state.

The P62 acceptance condition **“Notification destination allowlisted/authorized” passes** at the implemented route-contract scope.

## Global unread synchronization

The prior header-owned notification query was replaced by the same private query key used by the inbox. A successful read mutation updates that shared query cache, so every mounted customer header using `useCustomerHeaderState` observes the unread change without a duplicate notification store.

The synchronization mechanism therefore passes the P62 client acceptance requirement. However, the value is only authoritative for the server's bounded list because no separate global unread-count endpoint exists. P62 remains PARTIAL and does not label the bounded number as an all-history total.

## Why P62 is PARTIAL

The following Reference 21 / P62 capabilities cannot be completed truthfully with the accepted contract:

1. **True pagination:** the server exposes only bounded `limit`; there is no cursor/page token/offset contract.
2. **Authoritative global unread/category counts:** counts can only be derived from the current bounded list.
3. **Mark all read:** there is no accepted aggregate operation, and composing a fake global success from the current window would be misleading.
4. **Current APIM provenance:** no dedicated Notifications APIM policy/source was found in the current `infra/apim/**` tree during this audit.
5. **Physical-device/reference certification:** implementation/static CI passed, but no per-phase APK/device pixel certification is allowed by the rebuild policy.

No endpoint path, cursor field, aggregate response, mark-all mutation, route URL, or fake fixture was invented to satisfy these missing capabilities.

## Focused tests

`customerNotificationsModel.test.ts` covers:

- stable-ID deduplication and newest-first ordering;
- bounded category classification/count/filter behavior;
- Today/Earlier grouping;
- ORDER and DELIVERY destination allowlisting;
- rejection of arbitrary route-like target types and missing target IDs;
- idempotent read-state application.

## CI evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated run:

- Run ID: `31274137746`
- Job ID: `93144883129`
- Head SHA: `992376808144b1fe8669982e4f204b1379158e25`
- Conclusion: **SUCCESS**
- dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- production Android JavaScript bundle: **SUCCESS**
- backend/APIM/infrastructure source guard: **SUCCESS**

The first implementation run `31274041492 / 93144637064` failed only the ESLint hook-dependency gate; TypeScript had passed. P62 then stabilized the notices array dependency and the full replacement run above passed all required gates.

No Java/Gradle/APK/AAB packaging was performed.

## Changed files

Implementation/test:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerShell/api/customerShellApi.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/notifications/domain/customerNotificationsModel.ts`
- `apps/mobile/src/features/notifications/query/customerNotificationQueries.ts`
- `apps/mobile/src/features/notifications/screens/CustomerNotificationsScreen.tsx`
- `apps/mobile/src/features/notifications/customerNotificationsModel.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P62_NOTIFICATIONS_EMPTY_CART.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle, APK, or AAB file was changed.

## Stop boundary

P62 is the only phase implemented in this authorization.

**P63 — Notifications — Active Cart remains NOT STARTED.** Do not add View Cart behavior to Notifications until a later explicit authorization.
