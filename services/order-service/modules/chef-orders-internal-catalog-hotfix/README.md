# Chef Orders Internal Catalog Hotfix

## Purpose

This hotfix corrects the Order Service dependency used for kitchen ownership and pickup-detail reads after public Catalog privacy enforcement was enabled.

The public Catalog endpoint intentionally redacts `identityId`, phone, email, address and precise coordinates. Order Service must therefore use Catalog's key-protected internal endpoint whenever it needs private kitchen data for an authorized server-side workflow.

## Root cause

Production Order Service called:

```http
GET /api/v1/catalog/kitchens/{kitchenId}
```

Public Catalog privacy returned `identityId: null` by design. The legacy chef-order list then dereferenced that value during chef ownership filtering and produced a `NullPointerException`.

Production PostgreSQL was verified separately and contains valid, non-null kitchen `identity_id` values. Catalog's direct internal route was also verified to return the expected identity.

## Correct request boundary

Order Service now calls:

```http
GET /api/v1/catalog/internal/kitchens/{kitchenId}
X-Craves-Internal-Key: <CRAVES_INTERNAL_SERVICE_SECRET>
```

The secret remains server-side only. It must never be sent by web/mobile clients, logged, committed, or pasted into documentation.

The existing `CRAVES_CATALOG_BASE_URL` remains the Catalog API base URL. When production points that variable at APIM, APIM must expose the additive internal kitchen operation before the new Order revision is deployed.

## Code paths

```text
services/order-service/src/main/java/in/craves/order/service/CatalogClient.java
services/order-service/src/main/java/in/craves/order/config/CatalogClientProperties.java
services/order-service/src/main/resources/application.yml
services/order-service/src/test/java/in/craves/order/service/CatalogClientInternalAccessTest.java
infra/apim/catalog-internal/catalog-internal-kitchen-policy.xml
scripts/apim/configure-catalog-internal-kitchen-apim.sh
scripts/apim/rollback-catalog-internal-kitchen-apim.sh
azure-pipelines-catalog-internal-kitchen-apim.yml
```

## Failure behavior

The client fails closed:

- Missing `CRAVES_INTERNAL_SERVICE_SECRET` -> HTTP 503 from Order Service dependency handling.
- Internal Catalog response missing `id` or `identityId` -> HTTP 502 dependency failure.
- Catalog reports kitchen not found -> existing HTTP 400 `Kitchen is not active` behavior is retained.

A sanitized public response can therefore no longer flow into Chef ownership comparison and become an NPE.

## Local test

```bash
cd services/order-service
mvn -B -ntp clean verify
```

The targeted test verifies:

- `/internal/kitchens/{kitchenId}` is used;
- `X-Craves-Internal-Key` is sent;
- valid `identityId` is parsed;
- missing internal credentials fail closed;
- a null identity in an internal response is rejected.

## Production deployment order

1. Require green backend CI for the exact hotfix commit.
2. Confirm Catalog and Order still reference the shared internal-service secret in Key Vault.
3. Run `azure-pipelines-catalog-internal-kitchen-apim.yml` with `action=CONFIGURE` and `confirmCatalogInternalKitchen=true`.
4. Read back the APIM operation and test the internal Catalog route using a secret loaded from Key Vault without printing the secret.
5. Deploy Order Service from the merged hotfix through `azure-pipelines-order-service.yml`.
6. Verify latest revision equals latest-ready, traffic is 100%, `/actuator/health` is healthy, and the image tag matches the new run.
7. Run authenticated non-destructive Chef `GET /api/v1/chef/orders` smoke.
8. Confirm no new Catalog identity NPE appears in Order logs.

Public Catalog privacy must remain enabled throughout the hotfix.

## Rollback

Application rollback and gateway rollback are independent.

If the new Order revision causes an unrelated regression, route traffic back through the normal controlled Container App rollback procedure. The previous Order revision is known to be incompatible with public Catalog privacy for Chef ownership reads, so rolling back the application does not restore this Chef Orders defect; it only removes a new regression if one appears.

The APIM internal operation is additive and safe to leave unused. If it must be removed, run `azure-pipelines-catalog-internal-kitchen-apim.yml` with `action=ROLLBACK` and explicit confirmation. The rollback script deletes only operation ID `get-internal-kitchen` after verifying that its method/path still belong to this module.

## Manual steps required

- Azure DevOps: register the pipeline if it does not already exist, using display name exactly `azure-pipelines-catalog-internal-kitchen-apim.yml`.
- Azure DevOps: run the APIM configuration pipeline only after the hotfix is merged and CI is green.
- Azure DevOps: run the existing Order Service deployment pipeline after APIM verification.
- Testing: use an authenticated Chef test session for the final non-destructive smoke. Do not paste access tokens into chat or source control.

No new Azure resource, Key Vault secret, DNS record, Firebase change, payment-provider change, or billable SKU is required.
