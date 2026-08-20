# Favorites 2.0 P2 — Home Relationships

## Purpose

P2 adds customer-owned relationships to approved home chefs and kitchens plus explicit availability-watch preferences. It does **not** make a dish heart implicitly opt a customer into notifications.

Authoritative ownership remains in User/Chef Service. Catalog remains authoritative for kitchen/menu/schedule state. The mobile/Catalog P2 slices enrich these IDs into `Your favorites are cooking today` cards.

## API

- `GET /api/v1/customer/favorite-chefs?limit=50&cursor=...`
- `PUT /api/v1/customer/favorite-chefs/{chefIdentityId}`
- `DELETE /api/v1/customer/favorite-chefs/{chefIdentityId}`
- `GET /api/v1/customer/favorite-kitchens?limit=50&cursor=...`
- `PUT /api/v1/customer/favorite-kitchens/{kitchenId}`
- `DELETE /api/v1/customer/favorite-kitchens/{kitchenId}`
- `GET /api/v1/customer/favorite-watches?entityType=CHEF|KITCHEN|MENU_ITEM&limit=50`
- `PUT /api/v1/customer/favorite-watches/{entityType}/{entityId}` body `{ "channel": "IN_APP"|"PUSH", "enabled": true|false }`
- `DELETE /api/v1/customer/favorite-watches/{entityType}/{entityId}?channel=IN_APP|PUSH`

## Data model

Migration `V9__customer_home_relationship_favorites.sql` creates three explicit tables rather than a generic polymorphic favorite table:

- `customer_favorite_chef`
- `customer_favorite_kitchen`
- `customer_favorite_watch`

Chef relationships are validated against an APPROVED `chef_application` when created. The database intentionally does not cascade chef lifecycle changes because the blueprint requires relationship history to survive pause/offboard states.

Kitchen IDs are stored as customer-owned references without cross-service database access. Catalog P2 resolves them and can render a missing/inactive tombstone if the kitchen lifecycle changes.

## Notification safety

This slice persists preference only. It does not send a push or create an in-app message. Actual availability delivery must respect serviceability, OS/channel preference, quiet hours, event deduplication, one-notification-per-entity-window behavior and an explicit global daily cap. The blueprint does not approve a numeric global cap, so source must remain fail-closed until that policy is supplied.

## Scale

Chef and kitchen lists use bounded cursor pagination (default 50, maximum 100 per page). Relationship writes are idempotent through composite primary keys. Reads are indexed by customer identity and recency.

## Local test

```bash
cd services/user-chef-service
mvn -B -ntp clean verify
```

## Manual steps later

- Deploy User/Chef Service using the existing guarded service pipeline.
- Verify Flyway V9 applied successfully.
- Publish P2 customer APIM operations only after backend health is green.
- Do not enable any availability-notification dispatcher until the global cap and quiet-hour product policy is configured and runtime serviceability checks are available.

No new Azure resource, secret, DNS change, Firebase provider, payment setting or billable infrastructure is introduced by this source slice.
