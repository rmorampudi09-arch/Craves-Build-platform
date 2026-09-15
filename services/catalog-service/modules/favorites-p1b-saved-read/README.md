# Favorites 2.0 P1B — Catalog Saved Read

## Purpose

This module supplies the Catalog-owned enrichment needed by the customer Saved screen without moving customer favorite ownership out of User/Chef Service.

The existing favorite relationship remains authoritative at:

- `GET /api/v1/customer/favorites`
- `PUT /api/v1/customer/favorites/{menuItemId}`
- `DELETE /api/v1/customer/favorites/{menuItemId}`

Catalog owns current menu, kitchen and kitchen-schedule truth, so P1B adds a bounded batch read:

`POST /api/v1/discovery/saved/menu-items/resolve`

The customer app first reads its private favorite IDs from User/Chef Service and then resolves those IDs in chunks of at most 100 through Catalog. This avoids direct cross-service database access and replaces the old mobile pattern that performed menu + kitchen HTTP calls for every saved item.

## Architecture decisions

- User/Chef Service remains the owner of which dishes a customer saved.
- Catalog Service remains the owner of menu/kitchen/current availability facts.
- No Catalog table is queried from User/Chef Service.
- No customer identity or favorite relationship is persisted by this Catalog endpoint.
- No Order Service fields are invented here. Last-order count, prior customizations and reorder metadata remain an Order-owned follow-on.
- No rating/review value is emitted because review policy is not authoritative yet.
- No delivery serviceability value is emitted because that must come from the authoritative serviceability path.
- The resolver returns tombstone-style states for missing/retired/unavailable items so Saved does not silently hide a customer's remembered dish.

## Request

```json
{
  "menuItemIds": [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222"
  ]
}
```

Rules:

- At least one ID is required.
- At most 100 request entries are accepted.
- `null` IDs are rejected.
- Duplicate IDs are collapsed while preserving first-seen order.

The customer favorite cap is currently 200, so mobile can cover the full current Saved set in at most two Catalog resolver calls.

## Response states

`AVAILABLE_NOW`
: Dish is ACTIVE, item availability is true, kitchen is ACTIVE, the kitchen accepts orders, is not paused and its authoritative schedule is open now.

`COOKING_LATER_TODAY`
: Dish is otherwise sellable and the next authoritative kitchen opening is later on the same local calendar day.

`NOT_TODAY`
: Dish is otherwise sellable but the kitchen is closed now and the next deterministic opening is not later today. `nextAvailabilityAt` may point to a later day when one is deterministically found within the seven-day lookup horizon.

`PAUSED`
: Kitchen has an explicit future `paused_until`. A next opening is returned only when it can be derived from pause + schedule truth.

`KITCHEN_NOT_ACCEPTING`
: Kitchen explicitly has `accepting_orders=false`. No future reopening is guessed.

`ITEM_UNAVAILABLE`
: The menu item is still present/ACTIVE but `is_available=false`. P1B deliberately does **not** label this as `SOLD_OUT`; the current schema does not prove why the item is unavailable.

`RETIRED`
: Menu item exists but is no longer ACTIVE.

`KITCHEN_INACTIVE`
: Menu item exists but its kitchen is missing from the active marketplace state.

`MISSING`
: Requested menu item no longer exists in Catalog. The caller can keep a graceful Saved tombstone and offer Remove rather than silently losing the customer's memory.

## Schedule semantics

The resolver is based on the same V7 Catalog schedule tables used by the live kitchen-availability API:

- `catalog_schema.kitchen_schedule_config`
- `catalog_schema.kitchen_weekly_service_window`
- `catalog_schema.kitchen_schedule_date_override`
- `catalog_schema.kitchen_schedule_override_window`

It preserves the current schedule service's backward-compatible behavior: when a kitchen has no weekly schedule and no date override for the evaluated day, schedule is treated as open.

Date overrides replace weekly windows for that date. A closed override is closed all day. An open override uses only its override windows.

All schedule calculations are performed in the kitchen timezone, with `Asia/Kolkata` as the safe default currently used by the schedule domain.

## Database access and scale

For one request of up to 100 menu IDs, the service uses bounded batch queries rather than one query per saved item:

1. Menu + kitchen + schedule-config + primary-image projection.
2. Weekly windows for all involved kitchens.
3. Date-override headers for the bounded lookahead range.
4. Override windows only when matching override headers exist.

That makes database round trips effectively constant with respect to the number of Saved cards in the request. It is materially safer than the previous mobile N-call fan-out, but it is **not** a claim that the complete Craves platform is certified for one million concurrent users. Production capacity still requires APIM/service/PostgreSQL/autoscaling/load-test evidence.

## APIM publication

Prepared source only; not executed by this module work:

- Policy: `infra/apim/favorites-p1b/catalog-saved-resolver-policy.xml`
- Configure: `scripts/apim/configure-favorites-p1b-catalog-apim.sh`
- Rollback: `scripts/apim/rollback-favorites-p1b-catalog-apim.sh`

The configure script is fail-closed and requires:

```bash
CONFIRM_FAVORITES_P1B_APIM=true
```

The rollback script requires:

```bash
CONFIRM_FAVORITES_P1B_APIM_ROLLBACK=true
```

The rollback removes only `resolve-saved-menu-items-p1b`; it does not delete or recreate the shared Discovery API.

## Local verification

```bash
cd services/catalog-service
mvn -B -ntp clean verify
```

Static APIM checks:

```bash
bash -n scripts/apim/configure-favorites-p1b-catalog-apim.sh
bash -n scripts/apim/rollback-favorites-p1b-catalog-apim.sh
python - <<'PY'
import xml.etree.ElementTree as ET
ET.parse('infra/apim/favorites-p1b/catalog-saved-resolver-policy.xml')
PY
```

## Deployment order later

Do not execute these steps until the release owner intentionally starts deployment:

1. Merge/reconcile the backend-experience branch that supplies Catalog V7 kitchen schedule capability.
2. Merge this P1B Catalog slice after CI/review.
3. Run the standard Catalog Service deployment pipeline so the new Java endpoint exists in the Container App.
4. Confirm the Catalog revision is healthy and Flyway V7 is present.
5. Run the guarded P1B APIM configuration with `CONFIRM_FAVORITES_P1B_APIM=true`.
6. Smoke the APIM POST with valid/invalid batches and capture correlation IDs.
7. Only then certify the P1B mobile Saved client against that runtime.

The existing `azure-pipelines-catalog-service.yml` already handles build, immutable image push, Container App deployment, environment/secret-preservation checks and health rollback. P1B does not create a new Azure resource.

## Manual intervention required

- **Azure Portal / Azure DevOps:** no action now. Later run the existing Catalog deployment pipeline and the guarded APIM publication in the approved release window.
- **Secrets:** none added. Do not paste credentials into chat or source.
- **Firebase:** none.
- **DNS:** none.
- **Mobile signing/store consoles:** none for this backend slice.
- **Billing-sensitive infrastructure:** none provisioned by P1B. The prepared scripts operate on existing resources only.

## Rollback

If the P1B route causes a runtime problem:

1. Stop mobile adoption of the resolver or feature-flag it off.
2. Set `CONFIRM_FAVORITES_P1B_APIM_ROLLBACK=true` and run `rollback-favorites-p1b-catalog-apim.sh` to remove only the new APIM operation.
3. Roll the Catalog Container App back using the existing Catalog deployment rollback process if the Java revision itself must be reverted.
4. Existing Favorites v1 save/remove/list APIs remain independent and continue to be the identity-owned persistence path.

## Explicitly deferred

- Customer-level `/api/v1/customer/saved-feed` composition.
- Order count / last ordered timestamp.
- `Order Like Last Time` prior-option metadata.
- Current delivery serviceability.
- Rating/review summary.
- Real inventory quantity or `SOLD_OUT` reason.
- Favorite chef/kitchen persistence and Notify Me.

Those require their owning services or explicit product policy and must not be fabricated inside Catalog.
