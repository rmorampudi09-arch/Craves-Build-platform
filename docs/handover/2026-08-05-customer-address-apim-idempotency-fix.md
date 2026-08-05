# Craves Customer Address APIM Idempotency Fix

Date: 2026-08-05  
Branch: `fix/customer-address-apim-idempotency`  
Scope: existing customer-address APIM operations only

## Reported Azure DevOps failure

The customer-address APIM pipeline failed with:

```text
Operation with the same method and URL template already exists
```

Azure API Management had already stored one or more customer-address operations under operation IDs different from the IDs expected by the script. The previous script always attempted to write fixed operation IDs such as `list-customer-addresses`. APIM correctly rejected a second operation with the same HTTP method and URL template.

## Why this proves addresses existed earlier

This failure confirms that at least one matching address route was already present in the existing APIM API. It does not prove that every address operation or policy was correct, but it explains how an earlier frontend could have used address routes before the new pipeline run.

## Fix implemented

Updated:

```text
scripts/apim/configure-customer-addresses-apim.sh
apps/customer-web-next/src/lib/logo-address-runtime.test.ts
```

The script now:

1. Lists existing operations in the single APIM API that owns `api/v1/customer`.
2. Matches each required operation by HTTP method and normalized route shape.
3. Treats parameter-name variants such as `/addresses/{id}` and `/addresses/{addressId}` as the same APIM route.
4. Reuses the existing operation ID when a matching route already exists.
5. Creates the desired operation ID only when no matching route exists.
6. Fails closed when multiple matching routes are returned.
7. Fails closed when the desired operation ID already belongs to a different route.
8. Updates and verifies the operation policy without deleting any API or operation.
9. Verifies the final method, URL template, backend policy, Bearer-header requirement and no-store behavior.

## Safety boundaries

- No APIM API is deleted.
- No operation is deleted.
- No unrelated route is overwritten.
- No new Azure resource is created.
- No secret or credential is changed.
- No database migration is executed.
- Existing operation IDs are preserved when their method and route match.

## Required rerun

After the fix is merged to `main`, rerun:

```text
/azure-pipelines-customer-addresses-apim.yml
```

Parameters:

```text
confirmConfigureCustomerAddresses: true
resourceGroupName: rg-craves-prodlow-centralindia
apimServiceName: apim-craves-prodlow-l3ing6
userChefContainerAppName: ca-craves-user-chef-service-prod
```

Expected logs include one line per route, for example:

```text
INFO: Reusing existing APIM operation <existing-operation-id> for GET /addresses.
VERIFIED: GET /addresses uses APIM operation <existing-operation-id>.
```

Expected final result:

```text
SUCCESS: Customer address operations configured idempotently on APIM API <api-id>.
Unauthenticated address probes: GET=401 POST=401
SUCCESS: Customer address GET/POST routes exist in APIM and enforce Bearer authentication.
```

## Stop conditions

Stop and inspect without making manual deletions when the pipeline reports:

- multiple APIM APIs own `api/v1/customer`;
- multiple operations match one method and route shape;
- a desired operation ID already owns another route;
- inherited `backend-id` policy cannot be overridden safely;
- User/Chef Service is not Ready;
- final route or policy verification fails.

## Next step after success

Run the customer/chef web deployment pipeline to publish the approved logo:

```text
/azure-pipelines-customer-web-next-delivery-tracking.yml
```

Use:

```text
confirmReplaceCurrentCustomerWeb: true
cashfreeMode: sandbox
```
