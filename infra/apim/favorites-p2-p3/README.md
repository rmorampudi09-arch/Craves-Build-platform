# Favorites 2.0 P2/P3 — APIM Publication

## Purpose

This module publishes only the private gateway operations required by Favorites 2.0 P2 and P3. It does not deploy any backend service, apply a database migration, enable notification dispatch, provision Azure resources or modify unrelated APIM routes.

## Published routes

### User/Chef Service — `api/v1/customer`

- `GET /favorite-chefs`
- `PUT /favorite-chefs/{chefIdentityId}`
- `DELETE /favorite-chefs/{chefIdentityId}`
- `GET /favorite-kitchens`
- `PUT /favorite-kitchens/{kitchenId}`
- `DELETE /favorite-kitchens/{kitchenId}`
- `GET /favorite-watches`
- `PUT /favorite-watches/{entityType}/{entityId}`
- `DELETE /favorite-watches/{entityType}/{entityId}`

### Catalog Service — `api/v1/discovery`

- `POST /favorites/home/resolve`

### Order Service — `api/v1/orders`

- `GET /repeat-candidates`

### Order Service cart API — `api/v1/cart`

- `POST /reorder/{orderId}`

The cart reorder operation already exists in Spring Boot. This module publishes that existing atomic write path instead of creating a second reorder implementation.

## Security behavior

Every new operation policy:

- rejects requests without a Bearer Authorization header with HTTP 401;
- forwards or creates `X-Correlation-Id`;
- overrides the backend at operation scope using the verified Container App FQDN;
- emits `Cache-Control: no-store, no-cache, must-revalidate` for private customer data;
- emits `Pragma: no-cache` and `X-Content-Type-Options: nosniff`;
- preserves correlation IDs on APIM errors.

Backend services remain responsible for validating the Firebase/customer principal and enforcing role/data ownership. The Catalog resolver intentionally receives only bounded chef/kitchen UUIDs and returns Catalog-owned, privacy-reduced schedule/menu facts.

## Fail-closed configuration

`scripts/apim/configure-favorites-p2-p3-apim.sh` refuses to write when:

- a required Container App is not the latest ready/running revision;
- a backend health probe fails;
- zero or multiple APIM APIs own an expected path;
- an existing API unexpectedly requires a subscription key;
- an inherited APIM `backend-id` policy makes operation-level routing ambiguous;
- an operation ID collides with a different route;
- route/policy verification fails after publication.

The script does not create new APIM APIs or relax existing subscription settings.

## Guarded Azure DevOps pipeline

`azure-pipelines-favorites-p2-p3-apim.yml` defaults to validation-only mode. Azure writes occur only when one of these explicit parameters is true:

- `confirmConfigureFavoritesP2P3=true`
- `confirmRollbackFavoritesP2P3=true`

They cannot both be true in the same run. The pipeline uses the existing service connection `Craves-Dev-Service-Connection` and does not require a new secret.

After configuration it probes representative routes without authentication and requires HTTP 401, proving the operations are not accidentally public.

## Rollback

`scripts/apim/rollback-favorites-p2-p3-apim.sh` requires:

```bash
CONFIRM_FAVORITES_P2_P3_APIM_ROLLBACK=true
```

It deletes only the named P2/P3 operation IDs after confirming each operation still has its expected method and route template. It never deletes an APIM API and never deletes unrelated operations.

## Required deployment order

1. P0 Favorites runtime certification.
2. Deploy P2 User/Chef source and verify Flyway V9.
3. Deploy P1B/P2 Catalog source and verify healthy schedule/catalog dependencies.
4. Deploy P3 Order Service source and verify the repeat-candidate endpoint plus existing reorder contract.
5. Run this APIM pipeline with `confirmConfigureFavoritesP2P3=true`.
6. Run authenticated mobile smoke/device certification.
7. Keep automatic favorite-availability notification dispatch disabled until the approved global cap, quiet-hour values, serviceability gate and deduplication policy are configured.

## Local source validation

```bash
bash -n scripts/apim/configure-favorites-p2-p3-apim.sh
bash -n scripts/apim/rollback-favorites-p2-p3-apim.sh
python3 - <<'PY'
import xml.etree.ElementTree as ET
ET.parse('infra/apim/favorites-p2-p3/favorites-private-operation-policy.xml')
print('policy XML valid')
PY
```

No Azure resource is provisioned by these files. Running the configure pipeline changes existing APIM configuration, so it is a manual release action and must occur only after backend revisions are healthy.
