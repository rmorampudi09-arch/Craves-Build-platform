# Craves Favorites 2.0 P1B — Mobile Enriched Saved

## Purpose

P1B turns the customer Favorites page into a home-food memory and availability hub while keeping P1A's optimistic/offline reliability intact.

The screen still gets the customer's private saved relationship from User/Chef Service, then resolves current display and schedule facts through the Catalog-owned P1B batch route:

- `GET /api/v1/customer/favorites`
- `POST /api/v1/discovery/saved/menu-items/resolve`

The mobile client does not join service databases and does not infer unavailable reasons.

## What changed

- Removed `CustomerFavoritesScreen` per-item `dishDetailApi.getCustomerDishDetail()` fan-out.
- Added a bounded Catalog resolver client with chunks of 100 IDs.
- Current 200-favorite cap therefore uses at most two Catalog resolver requests.
- Preserves favorite order even when batch responses arrive in a different order.
- Fails closed if Catalog omits a requested item rather than silently dropping a customer's save.
- Keeps missing/retired/inactive/unavailable saves visible with graceful recovery copy and Remove control.
- Surfaces `Your favorites are cooking today` only for `AVAILABLE_NOW` and `COOKING_LATER_TODAY` states returned by Catalog.
- Never calls generic `is_available=false` “sold out”; no inventory reason is fabricated.
- Keeps Catalog enrichment query identity-scoped so one account's private Saved set is not reused for another account.
- Pull-to-refresh refreshes both private favorite membership and current Catalog enrichment.

## New code paths

- `src/features/favorites/api/savedCatalogApi.ts`
- `src/features/favorites/api/savedCatalogApi.test.ts`
- `src/features/favorites/query/savedCatalogQueries.ts`
- `src/features/favorites/presentation/savedCatalogPresentation.ts`
- `src/features/favorites/presentation/savedCatalogPresentation.test.ts`
- `.github/workflows/mobile-favorites-p1b-ci.yml`

## Modified code path

- `src/features/favorites/screens/CustomerFavoritesScreen.tsx`

P1A files are inherited from `feature/favorites-p1a-mobile-reliability-20260821` and are not reimplemented here.

## Availability UX

Catalog state -> mobile copy:

- `AVAILABLE_NOW` -> `Cooking now`
- `COOKING_LATER_TODAY` -> `Cooking later today`
- `NOT_TODAY` -> `Not cooking today`
- `PAUSED` -> `Kitchen paused`
- `KITCHEN_NOT_ACCEPTING` -> `Not taking orders`
- `ITEM_UNAVAILABLE` -> `Not available right now`
- `RETIRED` -> `No longer on the menu`
- `KITCHEN_INACTIVE` -> `Kitchen unavailable`
- `MISSING` -> `Dish no longer listed`

Missing/retired cards remain removable. They are not navigated into current Dish Detail because that route is for current catalog entities.

## Scale behavior

Previous Saved screen behavior was approximately:

`1 private Favorites list request + (2 x number of saved dishes)`

because each saved dish loaded a menu item and then its kitchen.

P1B behavior at the current 200-favorite server cap is:

`1 private Favorites list request + at most 2 Catalog batch resolver requests`

This is a major fan-out reduction and avoids a thundering herd of mobile HTTP calls for large Saved lists. It does not, by itself, certify the entire platform for one million concurrent users; that still requires load/capacity evidence across APIM, services, PostgreSQL, Redis/Service Bus where applicable, and provider dependencies.

## Local verification

```bash
cd apps/mobile
npm ci
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand --runTestsByPath \
  src/features/favorites/customerFavoritesActiveCart.test.ts \
  src/features/favorites/customerFavoritesContract.test.ts \
  src/features/favorites/offline/customerFavoritesOfflineQueue.test.ts \
  src/features/favorites/query/customerFavoritesOptimisticState.test.ts \
  src/features/favorites/api/savedCatalogApi.test.ts \
  src/features/favorites/presentation/savedCatalogPresentation.test.ts
```

Production Android bundle check:

```bash
rm -rf build/favorites-p1b-bundle
mkdir -p build/favorites-p1b-bundle
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/favorites-p1b-bundle/index.android.bundle \
  --assets-dest build/favorites-p1b-bundle/assets
```

## Release dependency order

Source can be reviewed independently, but runtime certification must happen in this order after the user intentionally begins pipelines:

1. P0 Favorites backend/APIM path deployed and certified.
2. Backend Experience Catalog V7 schedule/availability deployed and smoke-tested.
3. P1B Catalog Saved resolver deployed.
4. P1B Catalog APIM operation published with its explicit confirmation guard.
5. P1A/P1B mobile release candidate built against the target environment.
6. Android device matrix executed, including online/offline/account-switch/restart plus all P1B availability/tombstone states.

## Manual steps required later

No action now. This source slice creates no Azure resource, secret, Firebase provider, DNS record, payment configuration, signing key, or store release.

Later manual/environment gates:

- Run the approved backend and APIM pipelines in dependency order.
- Build the exact signed Android release candidate using the existing mobile release process.
- Use safe test identities and known Catalog schedule cases.
- Capture status/correlation evidence for the Saved list and resolver route.
- Validate TalkBack and large-font layout for availability badges and Remove controls.

## Explicitly not implemented in P1B mobile

- Favorite Chef/Kitchen persistence.
- Notify Me watches or push notifications.
- Order count/last-ordered metadata.
- `Order Like Last Time` reconstruction.
- Delivery serviceability badge.
- Ratings/reviews.
- Inventory quantity or scarcity claims.
- Pricing/commission/delivery-radius/refund/FSSAI/tax/provider-priority rules.

Those belong to later owning-service modules or explicit product policy.
