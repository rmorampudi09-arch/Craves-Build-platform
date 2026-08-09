# P91 — Chef Realtime/Near-Realtime Order Event Reconciliation

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase start commit:** `88ef519bf6da4d3ab33d935dc658a285b6262cde`  
**Implementation/code end:** `024a01902e443fb3bed8018f843d4b563499b3ef`  
**Phase status:** DONE at authorized code scope; repository CI is not claimed because the account's GitHub Actions monthly capacity is exhausted.  
**Next phase:** P92 is not authorized and is not implemented here.

## Authority and bounded scope

P91 follows the exact phase requirement to use a project-supported **event/refetch mechanism** for Chef new-order/status changes without inventing a transport. The full 183-page master guide requires real-time or near-real-time refresh where supported, synchronized Chef order counters/surfaces, preservation of order-list state, and no polling loop without backoff.

The current mobile/runtime repository provides TanStack Query and the existing shared Chef operational query, but it does not provide an approved Chef WebSocket/SSE/socket.io/FCM messaging subscription transport. P91 therefore implements bounded near-real-time reconciliation through the existing exact read contract rather than fabricating a push-event API or adding a parallel realtime stack.

## Exact contract used

- `GET /api/v1/chef/orders`

The existing `chefOperationalApi.listOrders` parser remains authoritative for the supported response shape and keeps only the bounded non-sensitive order fields already accepted by P81/P86, including lifecycle `status`, `prepTimeMinutes`, `createdAt`, and `updatedAt`.

No endpoint, request parameter, event payload, WebSocket topic, SSE stream, push-notification contract, or backend mutation was invented for P91.

## Implementation

### Existing ownership preserved

`ChefOperationalProvider` remains the single shared owner of the Chef operational order snapshot. P91 does not create another store, query client, API client, lifecycle model, or per-screen polling mechanism. Dashboard counters and New/Preparing/Ready/Completed tab counts continue deriving from that same shared reconciled snapshot.

### Foreground-only near-real-time refresh

- Signed-in Chef order reads refresh on a 30-second foreground cadence.
- Automatic order refresh is disabled when signed out or when the app is not active.
- React Native `AppState` transitions cancel the active orders query when the app leaves the foreground.
- Returning to the foreground invalidates/revalidates the existing orders query immediately instead of waiting for the next interval.
- Existing manual/pull refresh behavior remains available and unchanged.

### Failure backoff

Repeated read failures increase the automatic refresh interval exponentially from the 30-second baseline and cap it at five minutes. This prevents a failed backend/network condition from becoming an aggressive fixed-frequency retry loop.

### Duplicate/out-of-order protection

Every fetched bounded server snapshot is reconciled against the current cache before it replaces shared state:

- incoming and cached rows are compared by authoritative `updatedAt` when available;
- an older incoming row cannot regress a newer cached lifecycle status;
- duplicate incoming IDs collapse to the newest timestamped representation;
- equal-timestamp or timestamp-less conflicting statuses fail closed to the current cached lifecycle instead of guessing progression;
- genuinely newer timestamped states replace older cached states;
- new IDs enter the snapshot normally;
- orders absent from the incoming authoritative bounded list are removed, preserving the existing newest-100 contract boundary rather than growing an unbounded client history.

This protection is especially important because existing Chef mutation hooks already reconcile authoritative mutation responses into the shared cache. A slower overlapping list request can no longer overwrite a newer mutation response when its `updatedAt` proves it is older.

## Changed code files

- `apps/mobile/src/features/chefOrders/domain/chefOrderEventReconciliation.ts`
- `apps/mobile/src/features/chefOrders/domain/chefOrderEventReconciliation.test.ts`
- `apps/mobile/src/features/chefShell/state/ChefOperationalProvider.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P91_CHEF_REALTIME_ORDER_RECONCILIATION.md`
- `build.md`

## Focused test source added

`chefOrderEventReconciliation.test.ts` covers:

- automatic refresh disabled while signed out/backgrounded;
- baseline cadence and bounded exponential failure backoff;
- older lifecycle snapshot rejection;
- newer lifecycle acceptance;
- duplicate incoming order collapse;
- fail-closed behavior for conflicting equal/missing timestamp ordering metadata;
- new-order insertion and authoritative bounded-snapshot removal.

## Validation / guard truth

- Phase-start → code-end compare is exactly one commit ahead.
- The implementation commit contains exactly the three `apps/mobile` paths listed above.
- No `services/`, `openapi/`, `infra/`, `apps/api/`, backend controller, APIM, or server pipeline source changed.
- No socket/push dependency was added to `package.json`.
- GitHub Actions was intentionally not treated as a gate result for this phase because the user reported the account's monthly Actions limit is exhausted. No CI pass/fail claim is made.
- The current connector session does not expose an executable private checkout/emulator, so `npm ci`, TypeScript, ESLint, Jest execution, Android JS bundle generation, and device/runtime certification are not claimed as locally executed.
- Focused test **source** was added and statically reviewed; it is not represented as executed evidence.

## Retained boundary

P91 delivers the phase-approved near-real-time **refetch/reconciliation** mechanism. A true server-push WebSocket/SSE/FCM event channel remains unavailable from the exact current mobile/backend contract surface inspected for this phase. If the product later supplies an approved event transport, it can feed the same shared reconciliation ownership instead of creating a competing state path.

## Explicit stop

P91 stops here. **P92 — Chef Menu Contract Model is NOT STARTED and is not authorized in this phase.**
