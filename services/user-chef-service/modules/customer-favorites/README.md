# Customer Favorites — P0 Reliability

## Purpose

This module is the production-reliability gate for Craves Favorites 2.0. It deliberately stabilizes the existing dish-favorite contract before adding enriched Saved cards, chef/kitchen favorites, availability watches, lists, or habit features.

## Authoritative contracts

- `CRV-ARCH-HLD-002 v2.0`: User/Chef Service owns favorites where currently implemented; public transactional traffic enters through Azure API Management; PostgreSQL is the transactional store.
- `CRV-FUNC-001 v1.0`: CUSTOMER may save/remove favorite dishes and owns only their own data.
- `Craves_Favorites_2_0_Implementation_Operations_Blueprint.docx`: P0 requires the existing GET/PUT/DELETE path to be proven end-to-end before expansion.

## Existing API preserved

```text
GET    /api/v1/customer/favorites
PUT    /api/v1/customer/favorites/{menuItemId}
DELETE /api/v1/customer/favorites/{menuItemId}
```

No v1 response contract is replaced in this package.

## Reliability hardening

`CustomerFavoriteService.save` now takes a PostgreSQL transaction-scoped advisory lock keyed by customer identity before enforcing the 200-dish cap. The request re-checks the target favorite after acquiring the lock. This makes the cap concurrency-safe across multiple User/Chef Service replicas while preserving idempotent PUT behavior.

The lock is scoped to the database transaction and therefore does not require Redis, Service Bus, a new table, or a new Azure resource. A rare PostgreSQL hash collision can only serialize unrelated saves temporarily; it cannot let the cap be exceeded.

## APIM publication

`configure-customer-favorites-apim.sh` adds or safely reuses these operations on the existing `api/v1/customer` API owner:

- `list-customer-favorites`
- `save-customer-favorite`
- `remove-customer-favorite`

The operation policy:

- rejects requests without a Bearer token at the gateway;
- forwards the request to the current User/Chef Service Container App;
- forwards or creates `X-Correlation-Id`;
- returns `X-Correlation-Id` to the client;
- applies `no-store`/`no-cache` headers;
- does not weaken backend CUSTOMER-role validation.

The script fails closed if multiple APIM APIs own the same customer path or if an inherited `backend-id` policy makes safe operation-level backend selection ambiguous.

## Rollback

`rollback-customer-favorites-apim.sh` removes only the three Favorites APIM operations. It preserves the shared customer API, User/Chef Service, database, other customer routes, and all Azure resources.

Required confirmation:

```text
CONFIRM_FAVORITES_APIM_ROLLBACK=true
```

## Azure DevOps

Pipeline file:

```text
azure-pipelines-customer-favorites-apim.yml
```

Use the existing service connection:

```text
Craves-Dev-Service-Connection
```

The pipeline is intentionally manual/guarded and defaults to no APIM write. It first validates Bash/XML assets and runs `mvn clean verify` for User/Chef Service. APIM mutation requires:

```text
confirmConfigureCustomerFavorites=true
```

After configuration it performs unauthenticated GET/PUT/DELETE probes and requires HTTP 401 plus an `X-Correlation-Id` response header.

## Local test

From repository root:

```bash
mvn -B -ntp -f services/user-chef-service/pom.xml clean verify
bash -n scripts/apim/configure-customer-favorites-apim.sh
bash -n scripts/apim/rollback-customer-favorites-apim.sh
python - <<'PY'
import xml.etree.ElementTree as ET
ET.parse('infra/apim/customer-favorites/customer-favorites-policy.xml')
print('policy OK')
PY
```

The APIM script itself requires Azure CLI authentication and must not be run as a local unit test against production.

## Runtime certification still required

Source completion does **not** prove that the live APIM instance, deployed User/Chef revision, production Flyway history, or the installed Android APK are correct. Production P0 closes only after all of these are evidenced on the same release:

1. Verify the Android build uses the active Craves public gateway and capture the real favorite request/status/correlation ID.
2. Verify GET/PUT/DELETE exist in the live APIM API and forward Authorization + correlation metadata.
3. Verify the deployed User/Chef revision contains `CustomerFavoriteController` and the concurrency-safe service implementation.
4. Verify Flyway V6 is successful and `customer_favorite_menu_item` has its composite primary key and identity/created-at index.
5. Authenticated CUSTOMER: PUT a valid menu item, GET confirms it, restart confirms persistence, DELETE removes it, restart confirms removal.
6. Confirm non-CUSTOMER access is rejected and cross-account favorite state cannot leak.

## Manual steps required

- **Azure DevOps:** register/use the YAML with display name exactly `azure-pipelines-customer-favorites-apim.yml`; use `Craves-Dev-Service-Connection`; set the guarded APIM confirmation only during the approved rollout.
- **Azure Portal:** no new resource creation is required for this P0 package. Existing Container Apps, APIM and PostgreSQL are reused.
- **Secrets:** no new secret is introduced. Do not paste tokens or database credentials into pipeline YAML or chat.
- **Mobile:** run the exact Android release candidate on a real/test device and capture request/correlation evidence.

## Explicitly not included yet

- enriched Saved Dish cards;
- favorite chefs or kitchens;
- availability notifications;
- offline mutation queue;
- Saved Lists;
- personalized ranking;
- meal plans/subscriptions.

Those belong to later Favorites 2.0 packages after this P0 route/persistence gate is runtime-certified.
