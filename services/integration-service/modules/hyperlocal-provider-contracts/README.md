# Craves hyperlocal provider contract integration

## Purpose

This module closes the repository-side work that can be completed safely before Craves receives the private transaction contracts for Shadowfax Hyperlocal, Porter Enterprise 2W and Delhivery Direct Intracity.

It does **not** pretend that a provider is executable merely because a Java package, environment variable or Azure DevOps pipeline exists. CRV-ARCH-HLD-002 v2.0 and CRV-FUNC-001 v1.0 require the provider request/response semantics to be verified before a live adapter is enabled.

Borzo and Shiprocket are outside this module because their executable adapters already exist in Integration Service.

## Provider targets

| Provider | Craves target product | Hyderabad intent | Executable adapter status |
|---|---|---|---|
| Shadowfax | Hyperlocal Marketplace / restaurant-store last mile | Required | Partner transaction contract still required |
| Porter | Enterprise intracity 2-wheeler | Required | Enterprise transaction contract still required |
| Delhivery | Direct Intracity | Required | Direct Intracity API contract and Hyderabad serviceability still required |

No Delhivery B2C parcel API may be substituted for Direct Intracity merely because a Delhivery API token exists.

## Existing provider-neutral delivery contract

All executable provider clients must implement:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/provider/DeliveryProviderAdapter.java
```

Required operations are:

```text
quote
create
cancel
track
reconcileCreate
```

Webhooks use the shared inbox/deduplication/status-normalization pipeline already implemented by Integration Service.

## Contract evidence required before an adapter is executable

Each partner-gated provider has ten independent evidence gates:

1. partner API contract verified;
2. contract version recorded;
3. credential/authentication model verified;
4. serviceability request/response schema verified;
5. quote schema and delivery-fee semantics verified;
6. create schema and deterministic client/idempotency reference verified;
7. cancellation schema verified;
8. tracking schema and canonical status mapping verified;
9. webhook payload plus authentication/signature scheme verified;
10. uncertain-create reconciliation method verified and Hyderabad serviceability confirmed.

Craves does not infer a delivery fee from a generic `charge`, infer weight units, invent status codes, or guess a webhook signature algorithm.

## Runtime contract flags

All properties default to `false` in Java, so no YAML entry is required to obtain the safe state. When vendor evidence has been reviewed, Azure may set the following Container App environment variables.

### Shadowfax

```text
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_CONTRACT_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_CONTRACT_VERSION
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_CREDENTIAL_MODEL_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_SERVICEABILITY_SCHEMA_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_QUOTE_SCHEMA_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_CREATE_SCHEMA_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_CANCEL_SCHEMA_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_TRACK_SCHEMA_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_WEBHOOK_SCHEMA_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_CREATE_RECONCILIATION_VERIFIED
CRAVES_DELIVERY_PROVIDER_CONTRACTS_SHADOWFAX_HYDERABAD_SERVICEABILITY_VERIFIED
```

### Porter

Use the same suffixes under:

```text
CRAVES_DELIVERY_PROVIDER_CONTRACTS_PORTER_...
```

### Delhivery Direct Intracity

Use the same suffixes under:

```text
CRAVES_DELIVERY_PROVIDER_CONTRACTS_DELHIVERY_...
```

These values are evidence flags only. They do not create a provider adapter and do not activate a provider catalog row.

## Admin readiness endpoint

```text
GET /api/v1/admin/operations/delivery-provider-contracts/readiness
```

The endpoint is admin-only through the existing `/api/v1/admin/**` security boundary and returns no credential values.

For each provider it reports:

- product family;
- recorded contract version;
- whether vendor contract evidence is complete;
- whether a real `DeliveryProviderAdapter` is deployed;
- whether the provider database catalog row is active;
- final `routingEligible` state;
- exact blocker codes.

`routingEligible=true` requires **all three** independent gates:

```text
verified vendor contract
        +
real deployed adapter
        +
explicit provider catalog activation
```

## Database migration

```text
V111__hyperlocal_provider_contract_profiles.sql
```

The migration refines provider metadata only. It records the intended product family and required capabilities while leaving `service_areas=[]` until Hyderabad is actually verified.

Migrations do not activate providers.

## Exact future adapter paths

Once the corresponding vendor contract is issued and reviewed, implement the real HTTP clients at:

```text
services/integration-service/src/main/java/in/craves/integration/delivery/shadowfax/ShadowfaxApiClient.java
services/integration-service/src/main/java/in/craves/integration/delivery/porter/PorterApiClient.java
services/integration-service/src/main/java/in/craves/integration/delivery/delhivery/DelhiveryDirectIntracityApiClient.java
```

Each must implement `DeliveryProviderAdapter` and must include provider-specific tests using sanitized vendor-approved fixtures.

Also add the matching webhook authentication + normalizer/controller only after the vendor webhook contract is known. Do not expose an APIM webhook route before the backend validates the real authentication/signature scheme.

## Required vendor artifacts

For each vendor, obtain without pasting credentials into chat:

- current sandbox/test and production base URLs;
- authentication scheme and credential issuance process;
- serviceability endpoint and exact coordinate/address semantics;
- quote endpoint with amount/currency/ETA/availability semantics;
- create endpoint and idempotency/client-reference rules;
- cancel endpoint and terminal-state behavior;
- tracking endpoint and rider/location fields;
- webhook URL registration procedure;
- webhook authentication/signature specification;
- complete provider status catalogue;
- deterministic method to reconcile an uncertain create;
- rate limits and retry guidance;
- written Hyderabad product/serviceability confirmation.

## Existing pipelines

The current provider-specific Azure DevOps pipelines remain intentionally fail-closed until the real adapter and runtime contract exist:

```text
azure-pipelines-shadowfax-environment.yml
azure-pipelines-porter-environment.yml
azure-pipelines-delhivery-environment.yml
```

Run them later only after the adapter-specific implementation has been completed from the vendor-issued documents. Until then use `enableProvider=false`.

## Local validation

From repository root:

```bash
cd services/integration-service
mvn -B -ntp clean verify
```

The contract-readiness tests prove that:

- default configuration is fail-closed;
- a verified paper contract alone cannot make a provider routable;
- an adapter alone cannot make a provider routable;
- a DB row alone cannot make a provider routable;
- routing eligibility appears only when verified contract + executable adapter + catalog activation all exist.

## Manual steps required

- Shadowfax: obtain Hyperlocal Marketplace partner API bundle, sandbox credentials, webhook/auth contract and Hyderabad coverage confirmation.
- Porter: complete Enterprise API onboarding for intracity 2-wheeler and obtain the transaction/webhook contract plus Hyderabad coverage confirmation.
- Delhivery: obtain Direct Intracity API/product activation and written Hyderabad serviceability confirmation. Existing B2B/B2C credentials are not treated as Direct Intracity credentials.
- Azure Key Vault: store vendor-issued credentials only after the exact credential model is known. Never put secret values in Git, YAML parameters, docs or chat.
- Azure DevOps: run build/CI first, then provider-specific environment/activation pipelines only when the readiness endpoint has no contract/adapter blockers.
