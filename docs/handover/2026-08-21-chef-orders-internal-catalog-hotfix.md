# Craves Chef Orders Internal Catalog Hotfix Handover

**Date:** 21 August 2026  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Production branch:** `main`  
**Hotfix branch:** `hotfix/chef-orders-internal-catalog-20260821`  
**Original base:** `7520f89c64cffc51e625f8a8d637b9faa624d128`  
**Merged production commit:** `2bb63749e88505e2330abd6b44af3a9a9167ee06`  
**Scope:** Order Service + existing Catalog internal API + additive APIM operation only  
**Final status:** **PRODUCTION DEPLOYED, FUNCTIONALLY VERIFIED, SECURITY REGRESSION VERIFIED, HOTFIX CLOSED**

---

## 1. Executive summary

Production verification found a reproducible Chef Orders failure caused by an API-boundary mismatch, not by corrupt database data.

Catalog public privacy enforcement was correctly active in production and intentionally removed private home-chef fields from the public kitchen response, including `identityId`. The production Order Service was still using the public Catalog kitchen endpoint for an internal chef-ownership lookup. `OrderService.listChefOrders` later dereferenced the redacted `identityId`, producing a `NullPointerException` and an HTTP 500 on the Chef Orders path.

Catalog already exposed a secure internal kitchen endpoint protected by `X-Craves-Internal-Key`, and the Order and Catalog Container Apps were already wired to the same Key Vault-backed internal-service secret version. The missing pieces were:

1. Order Service had not migrated its private kitchen lookup to the internal Catalog route.
2. Production APIM did not expose the existing internal Catalog operation even though Order's Catalog base URL points to APIM.

The focused hotfix corrected only those two pieces. It did **not** disable public Catalog privacy, mutate database data, rotate secrets, create a new Azure resource, change payment or delivery-provider configuration, or introduce new business rules.

The hotfix was merged to `main`, APIM was configured successfully in Azure DevOps run `36175`, Order Service was built/tested/deployed successfully in run `36176`, and the live Order Container App revision `ca-craves-order-service-prodlow--0000064` became healthy and received 100% traffic.

The final authenticated production smoke test returned:

```text
GET /api/v1/chef/orders
HTTP_STATUS=200
JSON_TYPE=array
```

A targeted log scan found no recurrence of the original `CatalogKitchen.identityId()` null dereference, a broader recent-error scan found no Order Service errors/5xx indicators, and a final public Catalog regression test confirmed that `identityId` remains `null` for public callers.

This hotfix is therefore closed as a successful production remediation.

---

## 2. Final production closure record

### 2.1 Source-control closure

Focused pull request:

```text
PR: #282
Title: fix(order): restore Chef Orders through private Catalog boundary
Merged commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
Target: main
```

Immediately before production deployment, GitHub `main` was independently checked with `git ls-remote` and returned the exact expected merge SHA:

```text
2bb63749e88505e2330abd6b44af3a9a9167ee06  refs/heads/main
```

No unrelated draft backend release was merged as part of this hotfix.

### 2.2 APIM production closure

Azure DevOps pipeline:

```text
Pipeline ID: 104
Pipeline: azure-pipelines-catalog-internal-kitchen-apim.yml
Branch: refs/heads/main
Run: 36175
Result: succeeded
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
```

The configured production APIM operation is:

```text
API ID: craves-catalog-v1
Operation ID: get-internal-kitchen
Method: GET
URL template: /internal/kitchens/{kitchenId}
Effective route: /api/v1/catalog/internal/kitchens/{kitchenId}
```

The operation policy requires the `X-Craves-Internal-Key` header before forwarding and sets `Cache-Control: no-store`.

Runtime negative testing without the header returned:

```text
HTTP_STATUS=401
{"code":"INTERNAL_ACCESS_REQUIRED","message":"Internal service credential is required"}
```

Runtime positive testing using the existing Key Vault secret returned:

```text
HTTP_STATUS=200
IDENTITY_PRESENT=YES
CODE=NONE
```

This proved that the APIM route exists, is protected, forwards authorized traffic correctly, and reaches the internal Catalog contract.

### 2.3 Order Service production closure

Azure DevOps pipeline:

```text
Pipeline ID: 6
Pipeline: azure-pipelines-order-service.yml
Branch: refs/heads/main
Run: 36176
Result: succeeded
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
```

Final production runtime:

```text
Container App: ca-craves-order-service-prodlow
Revision: ca-craves-order-service-prodlow--0000064
Image: cravesprodlowacr82121.azurecr.io/craves/order-service:36176
LatestRevision: ca-craves-order-service-prodlow--0000064
LatestReadyRevision: ca-craves-order-service-prodlow--0000064
ProvisioningState: Succeeded
Revision Active: true
HealthState: Healthy
Revision ProvisioningState: Provisioned
Replicas observed: 1
Traffic: 100% to latest revision
```

### 2.4 Functional closure

An authenticated, non-destructive Chef smoke test was executed against production APIM using a token entered only into Cloud Shell hidden input and never pasted into documentation or chat output.

Result:

```text
GET /api/v1/chef/orders
HTTP_STATUS=200
JSON_TYPE=array
```

This is the direct functional confirmation that the Chef Orders path no longer fails with the original HTTP 500 condition.

### 2.5 Error-regression closure

Targeted scan of the new production Order revision:

```text
Patterns:
- CatalogKitchen.identityId
- NullPointerException
- Catalog internal kitchen response is incomplete

Result:
NO_CHEF_ORDERS_IDENTITY_ERRORS_FOUND
```

General recent Order Service scan:

```text
Patterns:
- ERROR
- Exception
- HTTP 5xx
- status=5xx

Result:
NO_RECENT_ORDER_SERVICE_ERRORS_FOUND
```

### 2.6 Privacy-regression closure

Public Catalog remained privacy-safe after the hotfix.

Final production read:

```json
{
  "id": "8990a560-5720-4273-be46-5a8e9fba1169",
  "identityId": null,
  "status": "ACTIVE"
}
```

The fix therefore restored internal functionality **without exposing private chef identity through the public Catalog contract**.

### 2.7 Temporary-data cleanup

Temporary Cloud Shell files created for smoke testing were removed after verification:

```text
/tmp/craves-chef-orders-smoke.json
/tmp/craves-apim-no-key.txt
```

Cleanup result:

```text
TEMP_TEST_FILES_REMOVED
```

---

## 3. Original incident and production evidence

### 3.1 Affected runtime before remediation

Before this hotfix, Order Service was serving production from:

```text
ca-craves-order-service-prodlow--0000063
image: cravesprodlowacr82121.azurecr.io/craves/order-service:36151
health: Healthy
traffic: 100%
```

Catalog was serving from:

```text
ca-craves-catalog-service-prodlo--0000026
image: cravesprodlowacr82121.azurecr.io/craves/catalog-service:36071
health: Healthy
traffic: 100%
```

The service containers themselves were healthy; the defect was in a specific cross-service data contract used by Chef Orders.

### 3.2 Production error

Order logs showed:

```text
Cannot invoke "java.util.UUID.equals(Object)" because the return value of
"in.craves.order.service.CatalogClient$CatalogKitchen.identityId()" is null
```

The stack localized the failure to `OrderService.listChefOrders` / the Chef Orders controller path.

### 3.3 Database validation

The production Catalog database was queried read-only.

Observed schema/data state:

```text
catalog_schema.kitchen_profile.identity_id  uuid  NOT NULL
total kitchens: 4
null identity IDs: 0
```

All active kitchen rows had non-null UUID identity ownership values. Database corruption and schema drift were therefore ruled out as the source of the null response field.

### 3.4 Public versus internal Catalog behavior

The public Catalog endpoint intentionally returned:

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

This was expected and correct privacy behavior.

The direct protected internal Catalog route returned a non-null identity value when called with the existing internal credential. The exact private identity value is intentionally not repeated in this closure document; only the fact that it was present was required to prove the contract.

### 3.5 Secret wiring evidence

Order runtime:

```text
CRAVES_INTERNAL_SERVICE_KEY     -> secretRef=kv-internal-service-key
CRAVES_INTERNAL_SERVICE_SECRET  -> secretRef=craves-internal-service-secret
```

Catalog runtime:

```text
CRAVES_INTERNAL_SERVICE_SECRET  -> secretRef=craves-internal-service-secret
```

Both Container Apps were then inspected at the secret-configuration layer. Each `craves-internal-service-secret` reference pointed to the same Key Vault, same secret name, same exact version, and system-managed identity:

```text
Vault: kvcravesprodlowl3ing6
Secret: craves-internal-service-secret
Version: 56f146f0be784ac89c3003c15d4f0c99
Identity: system
```

No secret rotation or replacement was required.

### 3.6 Important diagnostic correction during verification

An early shell test attempted to obtain the secret value through `az containerapp secret list`. That command returned no usable secret value in the current CLI/runtime context, so the request carried an empty internal-key value and produced 401/403 behavior.

This was **not** evidence that Order and Catalog held different secrets.

The investigation corrected the method by reading only the Key Vault reference metadata first and then, for the authorized runtime test, loading the exact referenced secret version directly from Key Vault into a temporary shell variable. The secret itself was never printed.

That corrected APIM test returned HTTP 200 with `IDENTITY_PRESENT=YES`, proving the credential path was healthy.

### 3.7 APIM state before remediation

Production Catalog APIM configuration:

```text
API ID: craves-catalog-v1
Path: api/v1/catalog
Backend: Catalog Container App /api/v1/catalog
```

Operations before this hotfix:

```text
GET /kitchens
GET /kitchens/{kitchenId}
GET /kitchens/{kitchenId}/menu-items
GET /menu-items/{menuItemId}
```

The internal kitchen operation was absent. Before remediation:

```text
GET /api/v1/catalog/internal/kitchens/{kitchenId}
```

returned APIM HTTP 404 while the corresponding protected route existed and worked directly on Catalog.

### 3.8 Exact deployed source before remediation

The prior Order production image `36151` came from Azure DevOps run `36151` and was not built from current `main`:

```text
branch: refs/heads/fix/flyway-migration-version-collisions-20260820
commit: 69c12c2ef47d9c00bd3db8ec8eec1526d8533193
```

Its `CatalogClient.getKitchen()` called the public route:

```java
.uri("/kitchens/{kitchenId}", kitchenId)
```

without the internal-service header and without requiring `identityId` to be present.

At the time of diagnosis, `main` still contained equivalent legacy behavior, so merely redeploying `main` before applying the focused hotfix would not have corrected the problem.

---

## 4. Root cause

The root cause was an **API boundary mismatch** between Catalog privacy behavior and Order's internal ownership lookup.

Catalog correctly enforced privacy on public kitchen responses. Order incorrectly used that public response for a private server-side authorization/ownership decision. Once privacy enforcement redacted `identityId`, the legacy Order path received `null` and subsequently dereferenced it.

The correct architectural pattern is:

```text
External/public client
    -> APIM public Catalog operation
    -> privacy-sanitized kitchen response

Order Service
    -> APIM protected internal Catalog operation
    -> X-Craves-Internal-Key
    -> Catalog internal authorization
    -> private kitchen ownership response
```

The hotfix restores that separation.

---

## 5. Architecture alignment

Craves service ownership requires Catalog to remain authoritative for kitchen/private pickup data while Order owns order lifecycle data. Internal service-to-service reads of private Catalog fields must cross an authenticated internal boundary rather than bypassing privacy or reading Catalog tables directly.

A newer Backend Experience v2 engineering branch already demonstrated the intended private Catalog pattern, but that branch contained broader unrelated work and remained unsuitable for wholesale production deployment during this incident.

This hotfix therefore ported only the minimum architecture-aligned boundary needed to restore Chef Orders:

1. private Order kitchen read uses Catalog internal endpoint;
2. shared internal credential travels in `X-Craves-Internal-Key`;
3. APIM exposes the internal operation but rejects missing credential headers;
4. Catalog remains the authoritative validator of the actual credential value;
5. public Catalog privacy stays enabled;
6. no cross-service database access is introduced.

---

## 6. Source changes delivered

### 6.1 Order Service

`services/order-service/src/main/java/in/craves/order/service/CatalogClient.java`

Changes:

- Adds `X-Craves-Internal-Key`.
- Loads an internal access value from configuration.
- Changes private kitchen reads from `/kitchens/{kitchenId}` to `/internal/kitchens/{kitchenId}`.
- Sends the internal-service credential.
- Fails closed with `503 Service Unavailable` when internal access is not configured.
- Fails with `502 Bad Gateway` when an internal response lacks required `id` or `identityId` data.
- Keeps public menu-item reads unchanged.

`services/order-service/src/main/java/in/craves/order/config/CatalogClientProperties.java`

- Adds `internalAccessValue` getter/setter.

`services/order-service/src/main/resources/application.yml`

Adds the environment-backed binding:

```yaml
craves:
  catalog:
    internal-access-value: ${CRAVES_INTERNAL_SERVICE_SECRET:}
```

No secret value is committed to source control.

### 6.2 Order regression tests

`services/order-service/src/test/java/in/craves/order/service/CatalogClientInternalAccessTest.java`

Coverage includes:

- correct internal route;
- correct internal header;
- valid identity parsing;
- missing credential fail-closed behavior;
- incomplete internal response rejection.

### 6.3 APIM policy

`infra/apim/catalog-internal/catalog-internal-kitchen-policy.xml`

Behavior:

- requires the presence of `X-Craves-Internal-Key` before forwarding;
- returns `401 INTERNAL_ACCESS_REQUIRED` when missing;
- does not duplicate the secret value in APIM;
- leaves Catalog as authoritative credential validator;
- sets `Cache-Control: no-store` for the private response.

### 6.4 APIM configure script

`scripts/apim/configure-catalog-internal-kitchen-apim.sh`

Safety behavior:

- validates required tools and XML;
- validates subscription context;
- requires Catalog latest revision to be ready/running;
- verifies Catalog health;
- requires exactly one APIM API to own `api/v1/catalog`;
- requires that API to be `craves-catalog-v1`;
- validates the APIM backend against the healthy Catalog Container App;
- creates only operation ID `get-internal-kitchen`;
- refuses to overwrite that operation ID if method/path ownership differs;
- applies policy;
- reads back and verifies operation and policy.

### 6.5 APIM rollback script

`scripts/apim/rollback-catalog-internal-kitchen-apim.sh`

- removes only operation ID `get-internal-kitchen`;
- verifies method/path ownership before deletion;
- refuses destructive rollback if the operation no longer matches this module.

### 6.6 Azure DevOps APIM pipeline

`azure-pipelines-catalog-internal-kitchen-apim.yml`

- `trigger: none`;
- `pr: none`;
- supports `CONFIGURE` and `ROLLBACK`;
- requires explicit `confirmCatalogInternalKitchen=true`;
- uses `Craves-Dev-Service-Connection`;
- validates Bash syntax and XML before Azure mutation.

### 6.7 Module README

`services/order-service/modules/chef-orders-internal-catalog-hotfix/README.md`

Contains module purpose, root cause, configuration, testing, deployment, rollback, and manual-step notes.

---

## 7. CI and merge evidence

Focused PR #282 was validated before merge.

GitHub Actions backend completion run:

```text
Run number: 452
Run ID: 32478413333
Result: SUCCESS
```

Successful jobs included:

```text
Backend source integrity
Maven verify - auth
Maven verify - notification
Maven verify - user-chef
Maven verify - catalog
Maven verify - integration
Maven verify - subscription
Maven verify - order
```

Admin Dashboard CI also completed successfully:

```text
Run number: 607
Run ID: 32478413328
Result: SUCCESS
```

Successful jobs included integration/admin financial checks, User/Chef admin checks, Order admin checks, Admin APIM syntax, and Next.js lint/typecheck/test/build.

PR #282 was squash-merged to `main` as:

```text
2bb63749e88505e2330abd6b44af3a9a9167ee06
fix(order): restore Chef Orders through private Catalog boundary (#282)
```

---

## 8. Production execution chronology

This section records the controlled production walkthrough after source merge.

### Step 40 - APIM pipeline registration check

Querying Azure DevOps for `azure-pipelines-catalog-internal-kitchen-apim.yml` returned no pipeline, proving the YAML existed in source but was not yet registered as an Azure DevOps pipeline definition.

Result:

```text
NOT REGISTERED
```

No production resource changed.

### Step 41 - reference existing Order pipeline

Existing Order pipeline registration was inspected to avoid guessing repository metadata.

Observed:

```text
Id: 6
Name: azure-pipelines-order-service.yml
Repository: rmorampudi09-arch/Craves-Build-platform
RepositoryType: GitHub
Branch: refs/heads/main
YamlPath: azure-pipelines-order-service.yml
```

### Step 42 - reuse existing GitHub connection

Order pipeline metadata showed:

```text
ConnectedServiceId: 15d12b34-3bb4-47e6-be76-2d5e96abe412
DefaultBranch: refs/heads/main
```

This existing connection was reused instead of creating another GitHub integration.

### Step 43 - register APIM pipeline definition

The new pipeline was created with `--skip-first-run true`, so registration itself did not touch production APIM.

Result:

```text
Id: 104
Name: azure-pipelines-catalog-internal-kitchen-apim.yml
Repository: rmorampudi09-arch/Craves-Build-platform
Branch: main
YamlPath: azure-pipelines-catalog-internal-kitchen-apim.yml
```

### Step 44 - run APIM CONFIGURE

Pipeline 104 was run from `main` with:

```text
action=CONFIGURE
confirmCatalogInternalKitchen=true
```

Queued run:

```text
RunId: 36175
```

### Steps 45-47 - APIM run completion

Final Azure DevOps result:

```text
RunId: 36175
Result: succeeded
Branch: refs/heads/main
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
StartTime: 2026-08-21T13:18:23.432782+00:00
FinishTime: 2026-08-21T13:19:07.052508+00:00
```

### Step 48 - APIM operation readback

Production readback returned:

```text
Name: get-internal-kitchen
DisplayName: Internal get kitchen
Method: GET
UrlTemplate: /internal/kitchens/{kitchenId}
```

### Step 49 - APIM policy readback

The installed policy showed:

```xml
<when condition="@(!context.Request.Headers.ContainsKey(&quot;X-Craves-Internal-Key&quot;))">
```

with a 401 response for missing internal access and `Cache-Control: no-store` on protected responses.

The first CLI attempt using an unsupported `az apim api operation policy show` subcommand failed locally and changed nothing. The read-only management API fallback successfully retrieved the policy.

### Step 50 - negative runtime security test

Calling the internal APIM endpoint without the internal credential returned:

```text
HTTP_STATUS=401
{"code":"INTERNAL_ACCESS_REQUIRED","message":"Internal service credential is required"}
```

This confirmed APIM's missing-header guard was active.

### Steps 51-59 - credential-path investigation

Order was confirmed to reference:

```text
CRAVES_INTERNAL_SERVICE_SECRET -> craves-internal-service-secret
```

Order and Catalog runtime references were then compared.

Order:

```text
CRAVES_INTERNAL_SERVICE_KEY     -> kv-internal-service-key
CRAVES_INTERNAL_SERVICE_SECRET  -> craves-internal-service-secret
```

Catalog:

```text
CRAVES_INTERNAL_SERVICE_SECRET  -> craves-internal-service-secret
```

An intermediate test using `az containerapp secret list` produced empty secret variables and therefore 401/403 results. This was correctly classified as inconclusive rather than as proof of a secret mismatch.

Container App configuration then proved both services referenced the exact same Key Vault secret version:

```text
https://kvcravesprodlowl3ing6.vault.azure.net/secrets/
craves-internal-service-secret/
56f146f0be784ac89c3003c15d4f0c99
```

### Step 60 - positive runtime security test

The exact secret version was loaded directly from Key Vault into a temporary shell variable and sent through APIM without printing the value.

Result:

```text
HTTP_STATUS=200
IDENTITY_PRESENT=YES
CODE=NONE
```

At this point the protected internal Catalog route was proven end-to-end and Order deployment became safe to proceed.

### Step 61 - source provenance check

Immediately before Order deployment:

```text
2bb63749e88505e2330abd6b44af3a9a9167ee06  refs/heads/main
```

### Step 62 - Order pipeline wiring check

Azure DevOps pipeline 6 returned:

```text
Name: azure-pipelines-order-service.yml
Branch: refs/heads/main
YamlPath: azure-pipelines-order-service.yml
AzureServiceConnection: Craves-Dev-Service-Connection
```

### Step 63 - Order production deployment

Order pipeline 6 was queued explicitly from `main`.

Result:

```text
RunId: 36176
Branch: refs/heads/main
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
```

### Steps 64-66 - Order run completion

The pipeline advanced through the deployment task and completed successfully:

```text
RunId: 36176
Result: succeeded
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
StartTime: 2026-08-21T14:43:09.544584+00:00
FinishTime: 2026-08-21T14:47:07.786346+00:00
```

### Step 67 - production revision/image readback

Production state:

```text
Image: cravesprodlowacr82121.azurecr.io/craves/order-service:36176
LatestReadyRevision: ca-craves-order-service-prodlow--0000064
LatestRevision: ca-craves-order-service-prodlow--0000064
ProvisioningState: Succeeded
Traffic: 100% latest revision
```

### Step 68 - revision health

```text
Revision: ca-craves-order-service-prodlow--0000064
Active: True
HealthState: Healthy
ProvisioningState: Provisioned
Replicas: 1
```

### Step 69 - authenticated Chef Orders smoke

The chef access token was entered with hidden shell input and was not printed.

Result:

```text
HTTP_STATUS=200
JSON_TYPE=array
```

### Step 70 - original error regression scan

Result:

```text
NO_CHEF_ORDERS_IDENTITY_ERRORS_FOUND
```

### Step 71 - general error scan

Result:

```text
NO_RECENT_ORDER_SERVICE_ERRORS_FOUND
```

### Step 72 - public privacy regression test

Result:

```json
{
  "id": "8990a560-5720-4273-be46-5a8e9fba1169",
  "identityId": null,
  "status": "ACTIVE"
}
```

### Step 73 - final runtime evidence capture

```text
=== ORDER PRODUCTION STATE ===
Revision: ca-craves-order-service-prodlow--0000064
Image: cravesprodlowacr82121.azurecr.io/craves/order-service:36176
ProvisioningState: Succeeded
Traffic: 100

=== APIM HOTFIX RUN ===
RunId: 36175
Result: succeeded
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06

=== ORDER DEPLOYMENT RUN ===
RunId: 36176
Result: succeeded
Commit: 2bb63749e88505e2330abd6b44af3a9a9167ee06
```

### Step 74 - temporary-file cleanup

Result:

```text
TEMP_TEST_FILES_REMOVED
```

---

## 9. Final validation matrix

| Gate | Final result | Evidence |
|---|---|---|
| Focused source change only | PASS | PR #282 |
| Merge to `main` | PASS | `2bb63749...` |
| Backend CI | PASS | GitHub run 452 |
| Admin CI regression | PASS | GitHub run 607 |
| APIM pipeline registered | PASS | Pipeline 104 |
| APIM production configure | PASS | Run 36175 succeeded |
| APIM route readback | PASS | GET `/internal/kitchens/{kitchenId}` |
| Missing internal header rejected | PASS | HTTP 401 |
| Existing Key Vault credential accepted | PASS | HTTP 200, identity present |
| Public Catalog privacy remains enabled | PASS | public `identityId:null` |
| Order pipeline uses `main` | PASS | Pipeline 6 / refs/heads/main |
| Order source provenance | PASS | exact merge SHA |
| Order production deployment | PASS | Run 36176 succeeded |
| Latest revision equals latest-ready | PASS | both `--0000064` |
| Revision health | PASS | Healthy / Provisioned |
| Production traffic | PASS | 100% latest revision |
| Chef Orders functional smoke | PASS | HTTP 200 / JSON array |
| Original identity NPE recurrence | PASS | none found |
| General recent Order errors | PASS | none found |
| Database mutation | NOT PERFORMED | none required |
| Secret rotation | NOT PERFORMED | none required |
| Privacy disable | NOT PERFORMED | remained enabled |
| New Azure billable resource | NOT CREATED | existing resources only |
| Temporary smoke files removed | PASS | Step 74 |

---

## 10. Security posture after the fix

### 10.1 Public privacy

Public Catalog privacy remains enabled and verified. This is a required invariant.

Do not use the following as a future workaround for Chef Orders defects:

```text
CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=false
```

Disabling privacy would widen the public data contract and is not an acceptable routine remediation.

### 10.2 Internal service credential

The credential remains in Azure Key Vault and is referenced by Container Apps. No credential was pasted into source control, pipeline YAML, the handover document, or shell output.

The runtime test loaded the exact Key Vault version only into a temporary local shell variable, used it for a single request, and then unset it.

### 10.3 APIM versus Catalog responsibility

APIM checks for the presence of the internal header and prevents obvious unauthenticated access. Catalog validates the actual credential value.

This is intentional: the credential value is not duplicated into the APIM policy.

### 10.4 Caching

The protected operation applies:

```text
Cache-Control: no-store
```

Private kitchen ownership data must not be treated as public cacheable Catalog data.

---

## 11. Rollback

### 11.1 APIM rollback

Pipeline:

```text
azure-pipelines-catalog-internal-kitchen-apim.yml
```

Parameters:

```text
action=ROLLBACK
confirmCatalogInternalKitchen=true
```

The rollback script removes only `get-internal-kitchen` and refuses deletion if the live operation no longer matches the expected method/path.

### 11.2 Order rollback

Use the established Container App revision/image rollback procedure if revision `--0000064` develops a new, unrelated regression.

Important limitation:

The previous Order revision `--0000063` contains the original public-Catalog compatibility defect. Rolling back to that revision restores the old Chef Orders failure. Therefore rollback should be used only to back out a new regression, not as a fix for this incident.

### 11.3 Dependency order during rollback

Because the APIM operation is additive, it can safely remain while Order is rolled back temporarily. Removing the APIM operation while the new Order revision is active would break the new private Catalog lookup.

Preferred rollback order if necessary:

1. move Order traffic away from the new revision under the controlled rollback procedure;
2. verify runtime stability;
3. only then remove the additive APIM operation if there is a separate reason to remove it.

### 11.4 Never use privacy disable as rollback

Do not roll back by exposing private Catalog fields publicly.

---

## 12. Manual intervention record

### Azure DevOps

Completed:

```text
[x] Registered azure-pipelines-catalog-internal-kitchen-apim.yml
[x] Ran APIM CONFIGURE
[x] Verified APIM run 36175 succeeded
[x] Ran Order Service pipeline from main
[x] Verified Order run 36176 succeeded
```

### Secrets and credentials

Completed without rotation:

```text
[x] Confirmed existing Key Vault-backed internal secret wiring
[x] Confirmed Order and Catalog reference the same secret version
[x] Proved valid credential through APIM
[x] Did not print or persist secret value
```

No further secret action is required for this hotfix.

### Azure Portal

No manual resource creation was required.

### Billing

No new paid Azure resource or SKU was provisioned.

### DNS

No DNS change was required.

### Firebase

No Firebase configuration change was required.

### Payments

No Razorpay or Cashfree configuration change was required.

### Delivery providers

No Borzo, Shiprocket, Delhivery, Shadowfax, or intelligent-assignment configuration change was required.

### Mobile stores/signing

No Apple/Google store or signing action was required.

---

## 13. What was deliberately not changed

The following were intentionally outside this production hotfix:

- public Catalog privacy behavior;
- kitchen database records;
- Order or Catalog database schema;
- pricing logic;
- commission logic;
- delivery radius logic;
- FSSAI/business compliance rules;
- payment-provider routing;
- delivery-provider routing;
- authentication design;
- Firebase provider settings;
- customer web release;
- chef web release;
- mobile application release;
- Admin dashboard release;
- broad Backend Experience v2 deployment;
- unrelated draft pull requests.

This narrow scope is important for production traceability.

---

## 14. Remaining work and pending items

The incident itself is closed, but several broader engineering items remain separate from this hotfix.

### 14.1 Chef Orders scalability

The current legacy `listChefOrders` implementation can scan up to 100 recent marketplace orders and perform Catalog ownership lookups. The hotfix repairs correctness/security but does not certify this pattern for the target of approximately one million concurrent users.

A future architecture-aligned release should use an Order-owned chef ownership snapshot/history field with an index, avoiding per-order synchronous Catalog calls for list filtering.

This should be implemented as a separate module/release with explicit migration, backfill, index, test, rollback and performance evidence.

### 14.2 Full stabilization window

The broader production readiness process still requires the previously defined stabilization evidence before legacy rollback retirement. This hotfix success does not replace that broader release gate.

### 14.3 Customer cart/checkout regression

The Chef Orders remediation preserved public menu-item reads in `CatalogClient`, and CI passed. However, this specific final command walkthrough did not execute a separate end-to-end customer cart/checkout transaction after Order run `36176`.

That is not a blocker for closing the specific Chef Orders incident because the changed private path was directly validated and the public menu-item code path was intentionally untouched, but customer checkout should remain part of the wider production regression suite.

### 14.4 Actuator endpoint

The final walkthrough verified Azure Container App revision health (`Healthy`, `Provisioned`) and successful traffic, but did not separately record a fresh direct `/actuator/health` response after run `36176` in this handover session. The deployment pipeline itself completed successfully.

For future release certification, capture the explicit actuator response as a standard post-deploy evidence item.

### 14.5 APIM internal boundary expansion

Only the internal kitchen GET needed for this incident was registered. Any future private Catalog operation must be added intentionally with its own APIM operation, policy, tests, security review and rollout evidence. Do not expose an unrestricted `/internal/*` wildcard.

---

## 15. Production operating guidance

### If Chef Orders returns 500 again

Check in this order:

1. current Order revision/image and traffic;
2. Order logs for `CatalogKitchen.identityId`, internal Catalog 401/403/404/5xx, or incomplete response errors;
3. APIM operation `get-internal-kitchen` still exists with the correct GET template;
4. APIM missing-header behavior remains 401;
5. Order `CRAVES_INTERNAL_SERVICE_SECRET` still references Key Vault;
6. Catalog secret reference still points to the expected Key Vault secret;
7. public Catalog privacy remains enabled;
8. Catalog internal endpoint returns a non-null identity for the relevant kitchen with authorized service credentials.

Do not start by changing database data or turning off privacy.

### If APIM returns 404

Verify the operation is still registered under:

```text
API ID: craves-catalog-v1
Operation ID: get-internal-kitchen
GET /internal/kitchens/{kitchenId}
```

### If APIM returns 401

A 401 `INTERNAL_ACCESS_REQUIRED` indicates APIM did not receive the required internal header.

Check Order configuration and request construction; do not assume the Key Vault value itself is wrong.

### If Catalog returns 403

If APIM has forwarded the request and Catalog returns `INTERNAL_ACCESS_DENIED`, verify the actual configured secret references/versions. Do not print the value while troubleshooting.

### If Catalog returns 502 through Order

The hotfix intentionally fails closed if the private Catalog response is incomplete. Investigate Catalog response integrity rather than allowing Order to continue with a null identity.

---

## 16. Source-control record

Hotfix branch:

```text
hotfix/chef-orders-internal-catalog-20260821
base: 7520f89c64cffc51e625f8a8d637b9faa624d128
```

Initial implementation commits created during remediation:

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

Focused PR:

```text
#282
fix(order): restore Chef Orders through private Catalog boundary
```

Final squash merge:

```text
2bb63749e88505e2330abd6b44af3a9a9167ee06
```

---

## 17. Final achieved-state checklist

```text
[x] Root cause reproduced and isolated
[x] Database corruption ruled out
[x] Public Catalog privacy behavior confirmed intentional
[x] Existing internal Catalog route identified
[x] Existing internal service credential wiring identified
[x] Focused hotfix implemented
[x] Regression tests added
[x] APIM configure/rollback automation added
[x] GitHub backend CI passed
[x] GitHub admin regression CI passed
[x] Focused PR merged to main
[x] Exact main SHA revalidated before production deployment
[x] APIM pipeline registered
[x] APIM production run succeeded
[x] APIM operation read back successfully
[x] Missing credential rejected at runtime
[x] Existing Key Vault credential accepted at runtime
[x] Order pipeline wiring verified
[x] Order production deployment succeeded
[x] New revision healthy and provisioned
[x] New image tag matches deployment run
[x] 100% traffic on new revision
[x] Authenticated Chef Orders GET returned HTTP 200
[x] Original identityId NPE absent from new revision logs
[x] No recent general Order 5xx/error evidence found
[x] Public Catalog identity remains sanitized
[x] No database mutation performed
[x] No secret rotation performed
[x] No privacy weakening performed
[x] No billable Azure resource created
[x] Temporary test files removed
[x] Hotfix documentation updated with final production evidence
```

---

## 18. Closure decision

**Decision: CLOSE the Chef Orders Internal Catalog hotfix as successfully remediated in production.**

The live environment now uses the intended private service-to-service Catalog boundary for Chef Orders ownership data while retaining the public privacy contract.

Final authoritative evidence:

```text
MERGE SHA
2bb63749e88505e2330abd6b44af3a9a9167ee06

APIM
pipeline: azure-pipelines-catalog-internal-kitchen-apim.yml
run: 36175
result: succeeded

ORDER
pipeline: azure-pipelines-order-service.yml
run: 36176
result: succeeded
revision: ca-craves-order-service-prodlow--0000064
image: cravesprodlowacr82121.azurecr.io/craves/order-service:36176
traffic: 100%
health: Healthy

FUNCTIONAL SMOKE
GET /api/v1/chef/orders
HTTP 200
JSON array

SECURITY REGRESSION
public Catalog identityId = null
internal APIM missing credential = HTTP 401
internal APIM valid credential = HTTP 200 / identity present

ERROR REGRESSION
NO_CHEF_ORDERS_IDENTITY_ERRORS_FOUND
NO_RECENT_ORDER_SERVICE_ERRORS_FOUND
```

No further production mutation is required for this incident.
