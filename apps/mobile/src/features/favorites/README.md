# Craves Favorites P1A — Mobile Saved Reliability

## Purpose

P1A makes the existing customer dish-Favorites interaction responsive and resilient on mobile without changing the backend API contract or inventing availability/commercial behavior.

The implementation preserves the existing server endpoints:

- `GET /api/v1/customer/favorites`
- `PUT /api/v1/customer/favorites/{menuItemId}`
- `DELETE /api/v1/customer/favorites/{menuItemId}`

P1A is intentionally mobile-only. P0 backend/APIM reliability remains a separate release gate and must be runtime-certified before this mobile behavior is promoted to production.

## What P1A adds

1. Immediate optimistic heart state through the shared identity-scoped React Query cache.
2. Rollback when a non-retriable save/remove fails.
3. Identity-bound offline/retriable mutation persistence using AsyncStorage.
4. Collapsing repeated offline toggles for the same dish to the latest customer intent.
5. Sequential idempotent replay on identity hydration, app resume, and a conservative retry interval.
6. Protection against replaying one account's pending mutations with another account's credentials.
7. Logout/account-switch cleanup of pending queue and old Favorites query state.
8. Cleanup of stale queued intent after a newer online mutation succeeds.
9. Race-safe queue clearing so in-flight hydration/replay cannot resurrect private pending state after logout.
10. Visible `Saving when online` / `Waiting to sync` feedback in the Saved screen.
11. Focused Jest coverage and a dedicated GitHub Actions CI gate.

## Exact code paths

### New

- `src/features/favorites/offline/customerFavoritesOfflineQueue.ts`
- `src/features/favorites/offline/CustomerFavoritesSyncCoordinator.tsx`
- `src/features/favorites/offline/customerFavoritesOfflineQueue.test.ts`
- `src/features/favorites/query/customerFavoritesOptimisticState.test.ts`
- `.github/workflows/mobile-favorites-p1a-ci.yml` at repository root

### Modified

- `src/features/favorites/query/customerFavoritesQueries.ts`
- `src/features/favorites/screens/CustomerFavoritesScreen.tsx`
- `src/app/providers/AppProviders.tsx`

## State model

### Server truth

The User/Chef Service + PostgreSQL remains authoritative. P1A does not introduce a second business database.

### React Query

The current customer identity is part of the private query key. A heart tap updates this cache immediately so Home, Dish Detail, and Saved consumers of the same query observe one state.

### Pending offline state

Only mutations that could not be confirmed because of a retriable/no-response failure are stored locally. Storage keys are identity-scoped:

`@craves/customer-favorites/pending/v1/{identityId}`

The local queue is a recovery mechanism, not an authoritative copy of Favorites.

## Mutation lifecycle

### Online success

1. Snapshot current Favorites cache.
2. Optimistically apply target state immediately.
3. Send idempotent PUT or DELETE.
4. On server acknowledgement, normalize the cache with the confirmed result.
5. Remove any older queued mutation for the same dish.

If AsyncStorage cleanup fails after server acknowledgement, the acknowledged server state remains authoritative. A storage cleanup problem does not convert a confirmed save into a false network failure.

### Permanent failure

Examples include role/validation/not-found conflicts that the HTTP layer classifies as non-retriable.

1. Optimistic state is rolled back to the pre-mutation snapshot.
2. The failed action is not kept in the replay queue.
3. Existing API error handling remains responsible for user-visible recovery messaging at the calling screen/component.

### Retriable/no-response failure

1. Optimistic target state remains visible.
2. Latest intent for the dish is persisted to the identity-scoped queue.
3. Saved screen indicates that one or more changes are waiting to sync.
4. Replay is attempted later using the same idempotent endpoint.
5. After successful replay, server state is refetched/reconciled.

## Queue safety rules

- Maximum pending mutations: 200 per identity.
- One pending mutation per dish after normalization.
- Malformed rows are discarded during hydration.
- Rows whose `identityId` does not match the storage owner are discarded.
- HTTP 401 stops replay and preserves remaining work until authentication is restored.
- Retriable failure stops the current replay pass and preserves remaining work.
- Permanent failures are dropped so one invalid/retired item cannot poison the queue forever; the coordinator invalidates the server query so UI truth is corrected.
- Account switch/logout removes the previous identity's pending local state and exact Favorites cache.
- An identity-generation guard prevents an older in-flight replay/hydration from restoring a queue that has already been cleared.

## Security and privacy

P1A never accepts a customer identity from a screen/request payload for server ownership. Authentication still determines server-side ownership.

AsyncStorage is not treated as a secure long-lived cross-account mailbox. Pending writes are therefore cleared when the active identity changes. No authentication token, phone number, payment data, address, or menu payload is written into the Favorites queue; only identity ID, menu item UUID, target boolean, timestamp, attempt count, and safe error code are persisted.

The coordinator checks the currently active identity again before every replayed HTTP mutation. This blocks a queued mutation created under account A from being transmitted after account B becomes active.

## Accessibility and UX

The existing heart control keeps the project minimum touch target and accessible Saved/Not-saved semantics. P1A reduces perceived latency by moving local state before network acknowledgement rather than after it.

The Saved screen adds a polite live-region sync notice instead of showing a generic failure for a recoverable connection problem. This is intentionally different from claiming that the server has persisted the change; the copy says the change is waiting to sync.

## P1A CI

Workflow:

`.github/workflows/mobile-favorites-p1a-ci.yml`

It runs:

1. `npm ci`
2. `npx tsc --noEmit`
3. ESLint with zero warnings
4. Existing Favorites contract/cart tests plus new queue and optimistic-state tests
5. Production Android JavaScript bundle generation
6. Mobile-only source-scope guard

The workflow does not deploy Azure resources, publish an APK to a store, or require application secrets.

## Local setup

Prerequisites:

- Node.js `22.13.0` or newer matching `package.json`
- npm
- Android Studio/Android SDK for Android device/emulator runs
- JDK required by the existing React Native Android project
- A local `.env`/build configuration appropriate to the environment

Do not paste Firebase, signing, Azure, Razorpay, or other secrets into chat or commit them to Git.

From repository root:

```bash
cd apps/mobile
npm ci
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand --runTestsByPath \
  src/features/favorites/customerFavoritesActiveCart.test.ts \
  src/features/favorites/customerFavoritesContract.test.ts \
  src/features/favorites/offline/customerFavoritesOfflineQueue.test.ts \
  src/features/favorites/query/customerFavoritesOptimisticState.test.ts
```

For a broader regression pass:

```bash
npm test -- --runInBand
```

To validate that the release JavaScript bundles:

```bash
mkdir -p build/favorites-p1a-bundle
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/favorites-p1a-bundle/index.android.bundle \
  --assets-dest build/favorites-p1a-bundle/assets
```

## Manual device certification

Use non-production test customer identities and the exact release-candidate build.

- Fresh install + login: existing server Favorites load; no other account state appears.
- Online save: heart changes immediately and remains saved after restart/refetch.
- Online remove: heart clears immediately and remains removed after restart/refetch.
- Force connection failure during save: UI remains responsive, queue notice appears, and the change syncs after connectivity/retry.
- Toggle the same queued dish again before replay: only the latest desired state is replayed.
- Sign out while a replay is pending: old identity queue/cache is removed and no request is sent with the next account's credentials.
- Switch from account A to B: B never sees A's Favorites or pending state.
- Token expiry/401: queued work is preserved until session recovery; no duplicate server state is created.
- Slow network: repeat taps must not create contradictory persisted state.
- App background/foreground: replay resumes safely.
- Large text + TalkBack: heart and sync messaging remain understandable and reachable.

## Manual steps required

No new Azure resources, Key Vault secrets, Firebase providers, DNS records, payment credentials, mobile signing keys, or store-console configuration are introduced by P1A.

Required before promotion:

- Keep P0 PR/runtime certification separate and complete it first.
- Review and pass the P1A CI workflow on the feature PR.
- Run the exact Android release-candidate device matrix above.
- Capture safe correlation/status evidence for any failed server mutation.
- Merge to `mobile-ui-rebuild-from-scratch` only after CI and device certification are green.
- Use the established mobile release process after the mobile branch is otherwise approved for promotion; P1A itself does not change signing/publishing configuration.

## Rollback

P1A is mobile-only and has no migration or Azure rollback.

If P1A is found defective before promotion, do not merge its PR. If it has already been merged into the mobile integration branch, revert the P1A commit/PR and rebuild the prior known-good mobile revision. P0 backend/APIM state does not need to be rolled back merely because the optimistic/offline mobile layer is reverted.

## Known limitations / deferred P1B work

The existing Saved screen still resolves dish details through per-item detail calls. That fan-out is not the intended large-scale architecture for a rich Saved hub.

P1B should introduce a server-enriched, paginated Saved read contract after the required Catalog/Kitchen availability source is present in the production baseline. It should remove the client N-call pattern and expose truthful display/availability fields such as available now, cooking later, not today, or retired only when authoritative data supports them.

P1A deliberately does **not** add:

- favorite chefs/kitchens (P2)
- availability watches/notifications (P2)
- Saved lists/social sharing (later)
- recommendation/ML ranking
- meal plans/subscriptions
- fake scarcity or inferred kitchen capacity
- pricing, commissions, delivery-radius, cancellation/refund, FSSAI/KYC, tax, or provider-priority rules

## Scale note

Optimistic cache updates and bounded per-user queues are suitable client patterns at large user counts, but they do not certify the platform for one million simultaneous users. Platform-scale certification still requires measured APIM/service/PostgreSQL/Redis/Service Bus capacity, connection budgets, autoscaling, rate limits, provider quotas, and representative load tests.
