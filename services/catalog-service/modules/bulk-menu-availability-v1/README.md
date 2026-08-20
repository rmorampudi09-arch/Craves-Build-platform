# Craves Bulk Menu Availability v1

## Purpose

Give a home chef one safe backend action for marking many owned dishes available/sold-out without sending one API call per dish.

## Endpoint

```http
PATCH /api/v1/kitchens/me/menu-items/availability
```

Maximum 100 changes per request. Every menu item must belong to the authenticated chef's kitchen. Duplicate IDs, foreign items, invalid delivery metadata, or malformed changes reject the whole transaction.

## Atomicity and audit

Rows are locked before update. The service validates the complete batch first, then writes availability changes and `menu_item_availability_audit` records inside one transaction. No partial success is returned.

Making an item available requires the existing delivery metadata (`unit_package_weight_grams` and `thermobox_required`) because downstream delivery booking depends on it.

## Files

```text
src/main/java/in/craves/catalog/web/BulkMenuAvailabilityDtos.java
src/main/java/in/craves/catalog/service/BulkMenuAvailabilityService.java
src/main/java/in/craves/catalog/web/KitchenController.java
openapi/chef-menu-bulk-availability-v1.yaml
infra/apim/chef-menu-bulk-availability-v1/bulk-availability-policy.xml
scripts/apim/configure-chef-menu-bulk-availability-v1-apim.sh
scripts/apim/rollback-chef-menu-bulk-availability-v1-apim.sh
```

## Cache behavior

A successful batch with at least one actual change advances the discovery-cache generation. This prevents stale sold-out/available state from being returned by future discovery requests.

## APIM behavior

The operation is added to the existing Chef Kitchen API. Its operation policy requires Bearer syntax, propagates `X-Correlation-ID`, rejects request bodies above 1 MiB, disables caching and adds `X-Content-Type-Options: nosniff`.

Backend JWT role/ownership validation remains authoritative.

## Test

```bash
cd services/catalog-service
mvn -B -ntp clean verify
```

Production smoke cases:

```text
single item AVAILABLE -> SOLD OUT
single item SOLD OUT -> AVAILABLE
100-item maximum batch
same menuItemId twice -> 400
item owned by another kitchen -> whole batch fails
making item available without delivery metadata -> whole batch fails
successful batch creates audit rows
successful change invalidates discovery generation
retrying already-equal availability returns changed=false for that item
```

## Product rules not introduced

This endpoint does not implement substitution, inventory quantity, scheduled stock, “need more time”, capacity policy, pricing, commissions or food-safety rules.
