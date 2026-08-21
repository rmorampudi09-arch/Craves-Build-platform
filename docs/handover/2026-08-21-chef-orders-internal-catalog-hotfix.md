# Craves Chef Orders Internal Catalog Hotfix Handover

**Date:** 21 August 2026  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Branch:** `hotfix/chef-orders-internal-catalog-20260821`  
**Base:** `main` at `7520f89c64cffc51e625f8a8d637b9faa624d128`  
**Scope:** Order Service + existing Catalog internal API + additive APIM operation only

## 1. Executive summary

Production verification found a reproducible Chef Orders failure caused by an API-boundary mismatch, not by corrupt database data.

Catalog public privacy enforcement is correctly active in production and intentionally removes private home-chef fields from the public kitchen response, including `identityId`. The production Order Service still used the public Catalog kitchen endpoint for an internal chef-ownership lookup. `OrderService.listChefOrders` subsequently dereferenced the redacted `identityId`, resulting in a `NullPointerException`.

Catalog already exposes a secure internal kitchen endpoint protected by `X-Craves-Internal-Key`, and both Catalog and Order already possess the same internal-service credential through Azure Key Vault-backed Container App secret references. The missing pieces were:

1. Order Service had not migrated its kitchen read to the internal endpoint.
2. Production APIM had no registered operation for that internal endpoint even though Order's Catalog base URL points to APIM.

This hotfix corrects those two pieces without disabling privacy, changing database data, rotating secrets, creating new Azure resources, or introducing new business rules.

## 2. Production evidence collected before the hotfix

### 2.1 Runtime health

The currently deployed core service revisions were healthy and carrying 100% traffic. The affected Order revision was:

```text
ca-craves-order-service-prodlow--0000063
image: cravesprodlowacr82121.azurecr.io/craves/order-service:36151
health: Healthy
traffic: 100%
```

The relevant Catalog revision was:

```text
ca-craves-catalog-service-prodlo--0000026
image: cravesprodlowacr82121.azurecr.io/craves/catalog-service:36071
health: Healthy
traffic: 100%
```

### 2.2 Production error

Order logs showed the Chef Orders path failing with a null kitchen identity during ownership comparison:

```text
Cannot invoke "java.util.UUID.equals(Object)" because the return value of
"in.craves.order.service.CatalogClient$CatalogKitchen.identityId()" is null
```

The stack localized the failure to `OrderService.listChefOrders` / the chef orders controller path.

### 2.3 Database validation

The production Catalog database was queried read-only. Results:

```text
catalog_schema.kitchen_profile.identity_id  uuid  NOT NULL
total kitchens: 4
null identity IDs: 0
```

All four ACTIVE kitchen rows had valid UUID identity IDs. This ruled out data corruption and schema drift as the source of the null.

### 2.4 Public versus internal Catalog response

Direct public Catalog response for kitchen `8990a560-5720-4273-be46-5a8e9fba1169` contained:

```json
{
  "id": "8990a560-5720-4273-be46-5a8e9fba1169",
  "identityId": null,
  "status": "ACTIVE"
}
```

Runtime configuration confirmed:

```text
CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=true
```

This is expected privacy behavior.

The direct internal Catalog endpoint, called with the existing internal key, returned:

```json
{
  "id": "8990a560-5720-4273-be46-5a8e9fba1169",
  "identityId": "cedc27bd-9cd2-46d4-8dcb-ca79acc9802d",
  "status": "ACTIVE"
}
```

This proved Catalog data and internal mapping were correct.

### 2.5 Secret wiring validation

Catalog runtime:

```text
CRAVES_INTERNAL_SERVICE_SECRET -> secretRef=craves-internal-service-secret
```

Order runtime:

```text
CRAVES_INTERNAL_SERVICE_KEY    -> secretRef=kv-internal-service-key
CRAVES_INTERNAL_SERVICE_SECRET -> secretRef=craves-internal-service-secret
```

Both referenced Key Vault secrets were compared in-memory without printing either value and returned:

```text
INTERNAL_CREDENTIALS=MATCH
```

No secret change is required.

### 2.6 APIM validation

Production Catalog API:

```text
API ID: craves-catalog-v1
Path:   api/v1/catalog
Backend: https://ca-craves-catalog-service-prodlo.../api/v1/catalog
```

Registered operations before this hotfix:

```text
GET /kitchens
GET /kitchens/{kitchenId}
GET /kitchens/{kitchenId}/menu-items
GET /menu-items/{menuItemId}
```

The internal Catalog operation was absent. A request through APIM to:

```text
GET /api/v1/catalog/internal/kitchens/{kitchenId}
```

returned HTTP 404 `Resource not found`, while the same endpoint worked directly against Catalog.

### 2.7 Exact production source validation

Order image `36151` came from Azure DevOps run `36151`, branch:

```text
refs/heads/fix/flyway-migration-version-collisions-20260820
commit 69c12c2ef47d9c00bd3db8ec8eec1526d8533193
```

That exact `CatalogClient.getKitchen()` called:

```java
.uri("/kitchens/{kitchenId}", kitchenId)
```

with no internal key header and did not require `identityId` to be non-null.

Current `main` had the same legacy behavior, so simply redeploying `main` would not resolve the defect.

## 3. Architecture alignment

The approved Craves backend design requires domain ownership rather than cross-service table reads. Catalog owns kitchen/private pickup data; Order owns cart/order lifecycle and stores authorized immutable snapshots. Public home-chef data must remain privacy-safe. Server-to-server private reads use an internal authenticated boundary.

A newer Backend Experience v2 engineering branch had already implemented this intended design: Order used Catalog's `/internal/kitchens/{kitchenId}` route with the shared internal-service key and failed closed on incomplete private data. This hotfix ports only that approved boundary into current `main`; it does not merge the unrelated draft release.

## 4. Source changes in this hotfix

### Order Service

`services/order-service/src/main/java/in/craves/order/service/CatalogClient.java`

- Adds `X-Craves-Internal-Key`.
- Loads an internal access value from configuration.
- Changes kitchen reads from `/kitchens/{kitchenId}` to `/internal/kitchens/{kitchenId}`.
- Sends the shared internal key.
- Fails with `503 Service Unavailable` when internal access is not configured.
- Fails with `502 Bad Gateway` when the internal response lacks `id` or `identityId`.
- Keeps public menu-item reads unchanged.

`services/order-service/src/main/java/in/craves/order/config/CatalogClientProperties.java`

- Adds `internalAccessValue` property.

`services/order-service/src/main/resources/application.yml`

- Adds:

```yaml
craves:
  catalog:
    internal-access-value: ${CRAVES_INTERNAL_SERVICE_SECRET:}
```

No secret value is committed.

### Order tests

`services/order-service/src/test/java/in/craves/order/service/CatalogClientInternalAccessTest.java`

Covers:

- correct internal route;
- correct internal header;
- valid identity parsing;
- missing credential fail-closed behavior;
- sanitized/incomplete internal response rejection.

### APIM

`infra/apim/catalog-internal/catalog-internal-kitchen-policy.xml`

- Requires the presence of `X-Craves-Internal-Key` before forwarding.
- Does not duplicate or validate the secret value in APIM; Catalog remains the authoritative key validator.
- Adds `Cache-Control: no-store`.

`scripts/apim/configure-catalog-internal-kitchen-apim.sh`

- Requires a healthy, latest-ready Catalog Container App.
- Requires exactly one APIM API to own `api/v1/catalog`.
- Verifies API backend matches the healthy Catalog origin.
- Creates only operation ID `get-internal-kitchen`:

```text
GET /internal/kitchens/{kitchenId}
```

- Refuses to overwrite an operation ID owned by a different method/path.
- Applies the guarded policy.
- Performs operation and policy readback verification.

`scripts/apim/rollback-catalog-internal-kitchen-apim.sh`

- Removes only `get-internal-kitchen`.
- Refuses deletion if the existing method/path no longer matches this module.

`azure-pipelines-catalog-internal-kitchen-apim.yml`

- Manual pipeline only (`trigger: none`, `pr: none`).
- Requires explicit boolean confirmation.
- Supports `CONFIGURE` and `ROLLBACK`.
- Uses the established `Craves-Dev-Service-Connection`.
- Runs Bash syntax and XML validation before Azure mutation.

## 5. Why privacy must remain enabled

The public kitchen response contains home-chef data that should not be exposed to public callers. Turning off `CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED` would make Chef Orders appear to work by restoring `identityId`, but would also reopen exposure of private contact/address/coordinate fields.

That is not an acceptable permanent correction. The correct solution is for authorized server-to-server traffic to use the internal Catalog boundary while the public contract remains sanitized.

## 6. Deployment sequence

Production order is intentionally dependency-first:

1. Merge the focused hotfix only after GitHub backend CI is green.
2. Re-run/confirm the existing Catalog/Order internal secret prerequisite if desired; runtime verification already showed the credentials match.
3. Register `azure-pipelines-catalog-internal-kitchen-apim.yml` in Azure DevOps if it is not already registered. The display name should exactly match the YAML filename.
4. Run the pipeline with:

```text
action=CONFIGURE
confirmCatalogInternalKitchen=true
```

5. Verify APIM readback shows:

```text
GET /internal/kitchens/{kitchenId}
```

6. Call the APIM internal endpoint with the internal key loaded directly from Key Vault into a shell variable. Print only non-sensitive response fields (`id`, `identityId`, `status`).
7. Run `azure-pipelines-order-service.yml` against merged `main`.
8. Verify the new Order latest revision equals latest-ready, is Healthy/Provisioned, carries 100% traffic and uses the new run image tag.
9. Run authenticated non-destructive Chef smoke:

```text
GET /api/v1/chef/orders
```

10. Confirm the endpoint no longer returns HTTP 500 and Order logs show no new `CatalogKitchen.identityId()` NPE.

## 7. Rollback

### APIM rollback

The new internal operation is additive. It may safely remain if Order is temporarily rolled back because external clients do not possess the internal service credential.

If removal is required, run:

```text
azure-pipelines-catalog-internal-kitchen-apim.yml
action=ROLLBACK
confirmCatalogInternalKitchen=true
```

The rollback script verifies ownership before deletion.

### Order rollback

Use the existing controlled Container App revision/image rollback procedure if the new Order build introduces a separate regression.

Important limitation: the previous Order revision is the revision that contains the Chef Orders/public-Catalog incompatibility. Rolling back Order does not fix this original Chef Orders problem; it only backs out a new regression. Do not disable Catalog privacy as a routine rollback shortcut.

## 8. Manual steps required

### Azure DevOps

- Register `azure-pipelines-catalog-internal-kitchen-apim.yml` if absent.
- Run APIM configure after merge/green CI.
- Run the existing Order Service pipeline after APIM route verification.

### Secrets and credentials

No new secret is needed. Existing keys are already Key Vault-backed and were verified to match. Do not paste internal keys, JWTs or Key Vault values into chat, GitHub, pipeline YAML or screenshots.

### Azure Portal

No new resource creation is required. Portal interaction should not be needed unless troubleshooting an existing resource.

### Billing

No new paid Azure resource or SKU is provisioned by this hotfix.

### DNS / Firebase / payment / delivery providers

No DNS, Firebase, Cashfree/Razorpay, delivery-provider, mobile-store or signing change is part of this hotfix.

## 9. Validation gates

Before production deployment:

```text
[ ] Focused PR created from current main
[ ] Backend source-integrity CI green
[ ] Maven verify - Order green
[ ] Other backend Maven jobs remain green
[ ] APIM Bash syntax validation passes
[ ] APIM policy XML parses
[ ] Secret values absent from diff
```

After APIM configuration:

```text
[ ] craves-catalog-v1 has exactly one GET /internal/kitchens/{kitchenId} operation
[ ] Missing internal header fails before backend
[ ] Valid internal key returns real identityId through APIM
[ ] Public /kitchens/{id} still returns sanitized identityId=null
```

After Order deployment:

```text
[ ] latestRevision == latestReadyRevision
[ ] running status healthy
[ ] traffic 100% to new revision
[ ] /actuator/health healthy
[ ] authenticated Chef GET /api/v1/chef/orders non-500
[ ] no new identityId NPE in logs
[ ] customer cart/checkout Catalog reads remain functional
```

## 10. Risks and follow-up

This hotfix repairs the immediate production compatibility fault. It does not claim that the broader Backend Experience v2 draft release is production-ready or deployed.

The current legacy Chef Orders implementation still scans up to 100 recent marketplace orders and calls Catalog for ownership filtering. The broader v2 work introduces `chef_identity_id` ownership snapshots/indexed history to remove this scaling pattern. That optimization remains a separate release and should not be silently mixed into this production hotfix.

For the ~1M concurrency target, the hotfix is correctness/security work, not a scale certification. Production-scale Chef history should ultimately use indexed Order-owned ownership snapshots rather than per-order synchronous Catalog calls.

## 11. Source-control record

Hotfix branch created from production `main`:

```text
hotfix/chef-orders-internal-catalog-20260821
base: 7520f89c64cffc51e625f8a8d637b9faa624d128
```

Initial implementation commits created during this remediation:

```text
fc17c780ca4c19ef94450793d78f5f3338d4e58d  Order CatalogClient private route
12d6710f9051f1a96d9a7533ae190fb4a127e7e2  CatalogClient internal property
d0a6d2427495c3721b27e18e8f76b52e6f5e8a77  application.yml secret binding
746f4a6351967ef258882a77c2aa1e0ca5f2833b  targeted Order test
0fd81d87e985b70bf133d89fed37b36c1a1c22b9  APIM internal policy
e34c30412b1c0dbe0953fb74221459b5c380bf6b  APIM configure script
b1a8863abac65aa6466c645172c247108549c621  APIM rollback script
c923c1bdf18ecac7a36f94fd111ad25bc9ae2eba  APIM Azure DevOps pipeline
7d7bacf85d2d7c81ac8a8b5887bfcc2d4bd653c8  module README
```

The final PR/merge/deployment SHAs should be appended after validation and production execution.
