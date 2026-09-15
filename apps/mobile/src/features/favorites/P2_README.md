# Craves Favorites 2.0 P2 — Mobile Home Relationships

## Purpose

P2 extends the existing Saved destination from dishes into the home-food relationship model defined by the Favorites 2.0 blueprint.

The single `Saved` screen now contains three explicit tabs:

- Dishes
- Home Chefs
- Kitchens

This keeps the high-intent customer workspace together rather than creating separate hidden favorites pages.

## Runtime contracts

User/Chef relationship ownership:

- `GET /api/v1/customer/favorite-chefs`
- `PUT /api/v1/customer/favorite-chefs/{chefIdentityId}`
- `DELETE /api/v1/customer/favorite-chefs/{chefIdentityId}`
- `GET /api/v1/customer/favorite-kitchens`
- `PUT /api/v1/customer/favorite-kitchens/{kitchenId}`
- `DELETE /api/v1/customer/favorite-kitchens/{kitchenId}`
- `GET /api/v1/customer/favorite-watches`
- `PUT /api/v1/customer/favorite-watches/{entityType}/{entityId}`

Catalog current-truth enrichment:

- `POST /api/v1/discovery/favorites/home/resolve`

P1A/P1B dish Favorites remain unchanged and continue to use the existing private membership plus Catalog Saved resolver.

## UX behavior

### Dishes

P1B availability/tombstone behavior is preserved. A saved dish that has a current kitchen ID additionally exposes an explicit `Save kitchen` relationship action.

### Home Chefs

Favorite home-chef IDs are private account data from User/Chef Service. Catalog resolves current kitchen facts in batches. A customer can:

- see current cooking state;
- open current menu when a kitchen still exists;
- remove the home-chef relationship;
- explicitly enable/disable an **in-app** Notify preference;
- save the associated kitchen separately.

### Kitchens

Favorite kitchen IDs are private account data from User/Chef Service. Cards show only privacy-reduced Catalog facts. A customer can:

- see current cooking state;
- open today's current menu;
- remove the kitchen relationship;
- explicitly enable/disable an **in-app** Notify preference;
- follow the home chef when Catalog supplies the matching chef identity.

## `Your favorites are cooking today`

The signature section appears only when Catalog returns `COOKING_NOW` or `COOKING_LATER_TODAY`.

The mobile client never derives these states from time-of-day assumptions, local popularity, order history or stale cache labels. It also does not present Catalog schedule state as proof of delivery serviceability.

## Notify Me boundary

P2 mobile exposes explicit `Notify in app` preference controls. Pressing a heart or saving a kitchen does **not** enable a notification channel.

This mobile slice does not claim that push delivery is active. Push requires OS permission plus the Notification-Service policy/dispatcher gate. The approved project material does not define the numeric global daily cap or exact quiet-hour window, so those values must not be invented by the client.

## Scale

- Chef and kitchen relationship lists use cursor pagination.
- The first page size is 50 per relationship type.
- Catalog home-feed enrichment is automatically chunked into batches of at most 100 relationships.
- Current menu previews are bounded by the Catalog contract to at most three dishes per kitchen.
- No per-chef or per-kitchen HTTP fan-out is performed by the Saved screen.

## Privacy

Private relationship/query cache keys include the active Craves identity. The Catalog resolver receives only relationship entity IDs; it does not receive customer identity, phone, address, payment or taste history.

The home feed does not expose kitchen phone/email/exact address/coordinates.

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
  src/features/favorites/presentation/savedCatalogPresentation.test.ts \
  src/features/favorites/api/favoriteHomeFeedApi.test.ts \
  src/features/favorites/presentation/favoriteHomePresentation.test.ts
```

Production Android bundle:

```bash
mkdir -p build/favorites-p2-bundle
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/favorites-p2-bundle/index.android.bundle \
  --assets-dest build/favorites-p2-bundle/assets
```

## Manual certification later

After the user intentionally runs the backend/APIM deployment sequence:

1. Favorite a kitchen from a saved dish and verify persistence after restart.
2. Remove/re-add and verify no duplicate relationship.
3. Follow a home chef from a kitchen card and verify account isolation.
4. Verify missing/inactive kitchens remain removable tombstones.
5. Create known schedule cases and prove Cooking now / Later today / Not today / Paused copy matches Catalog truth.
6. Toggle `Notify in app`; verify the preference persists but does not implicitly grant push permission.
7. Switch accounts and prove no Saved relationship/cache leakage.
8. Validate TalkBack, large text, all three tabs and minimum touch targets.

## No deployment side effects

This source slice creates no Azure resource, APIM operation, secret, Firebase configuration, DNS record, payment setting, signing key or store release.
