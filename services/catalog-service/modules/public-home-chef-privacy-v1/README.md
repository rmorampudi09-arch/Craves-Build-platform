# Craves Public Home-Chef Privacy v1

## Objective

Prevent public Catalog/discovery APIs from exposing a home chef's private pickup/home address, phone/email, exact coordinates, internal identity UUID, postal code, or Blob Storage object coordinates while preserving the private pickup snapshot required by Order and delivery workflows.

## Zero-downtime design

Privacy enforcement is staged with:

```text
CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=false
```

Default false preserves the legacy public response shape while new Catalog and Order revisions are deployed. After Order is confirmed using the protected internal Catalog endpoint, run the dedicated activation pipeline to set the flag true.

## Public behavior after activation

Public kitchen detail keeps display-safe fields such as kitchen name, display name, description, area, city, state and status. The following become null/hidden:

```text
identityId
phoneNumber
email
addressLine1
addressLine2
landmark
postalCode
latitude
longitude
internal created/updated timestamps
Blob container/blob name on public menu images
```

Nearby discovery retains user-request coordinates, distance-to-kitchen and broad area/city context, but exact kitchen coordinates are redacted.

## Internal Order boundary

Catalog exposes key-protected server-to-server routes:

```http
GET  /api/v1/catalog/internal/kitchens/{kitchenId}
POST /api/v1/catalog/internal/menu-items/resolve
```

Header:

```text
X-Craves-Internal-Key
```

Both Catalog and Order bind the existing `CRAVES_INTERNAL_SERVICE_SECRET`. The internal authorizer performs constant-time comparison and fails closed if the secret is not configured.

## Files

Catalog:

```text
src/main/java/in/craves/catalog/config/PublicCatalogPrivacyProperties.java
src/main/java/in/craves/catalog/config/InternalCatalogAccessProperties.java
src/main/java/in/craves/catalog/security/InternalCatalogAuthorizer.java
src/main/java/in/craves/catalog/web/InternalCatalogController.java
src/main/java/in/craves/catalog/web/PublicCatalogController.java
src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java
src/main/resources/application.yml
```

Order:

```text
src/main/java/in/craves/order/config/CatalogClientProperties.java
src/main/java/in/craves/order/service/CatalogClient.java
src/main/resources/application.yml
```

Release tooling:

```text
scripts/release/verify-catalog-order-internal-secret-binding.sh
scripts/release/activate-catalog-public-privacy.sh
scripts/release/rollback-catalog-public-privacy.sh
azure-pipelines-customer-chef-production-prerequisites.yml
azure-pipelines-catalog-public-privacy-activation.yml
```

## Required production sequence

1. Ensure Catalog and Order both secret-bind `CRAVES_INTERNAL_SERVICE_SECRET` to the same Key Vault secret URI.
2. Deploy Catalog with privacy flag false.
3. Verify internal kitchen and menu-resolve routes with the Order service credential.
4. Deploy Order using the new internal Catalog client.
5. Smoke-test cart, checkout, order detail and delivery pickup snapshots.
6. Run `azure-pipelines-catalog-public-privacy-activation.yml` with `action=ACTIVATE`.
7. Verify public kitchen/detail/discovery responses no longer expose the private fields.
8. If any compatibility issue appears, run the same pipeline with `action=ROLLBACK`; this changes only the flag and keeps the new image.

## No new secret value

This module reuses the already approved internal service secret. Never paste the secret value into chat, source control, pipeline YAML, logs or documentation.

## Tests

```text
PublicCatalogControllerPrivacyTest
InternalCatalogAuthorizerTest
```

Run:

```bash
cd services/catalog-service
mvn -B -ntp clean verify
cd ../order-service
mvn -B -ntp clean verify
```
