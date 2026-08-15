# Delivery provider environment and production readiness

This module defines the code and operational controls used to move delivery-provider integrations from a fail-closed runtime into simple sandbox, full sandbox and finally production.

It does not choose a provider commercially and it does not make an unimplemented provider operational merely by setting Azure environment variables.

## Current Spring implementation status

Borzo is implemented in the Spring Integration Service and remains the only delivery provider currently proven by repository source and sandbox evidence to have:

- provider adapter code;
- provider-specific Spring configuration;
- signed webhook handling;
- readiness checks;
- delivery command integration;
- production safety tests;
- successful Craves sandbox quote/create/tracking flow.

The architecture/blueprint core provider sequence is:

1. Shadowfax;
2. Borzo;
3. Porter;
4. Shiprocket Quick as supplementary/hold until vendor API and attribution requirements are confirmed.

Delhivery was added later as an additional guarded provider environment and is not treated as a substitute for the original Shadowfax/Porter rollout.

At present, Shadowfax, Porter and Shiprocket Quick do not have executable Spring provider adapters in the Integration Service. Their environment pipelines therefore support a safe `SIMPLE_SANDBOX` state only. Their `enableProvider=true` and `PRODUCTION` paths deliberately refuse to continue until a real provider-specific Spring adapter and runtime configuration are committed and the required secret exists.

Delhivery likewise remains non-executable until its Spring adapter/runtime configuration is implemented.

## Runtime modes

### SIMPLE_SANDBOX

```text
targetEnvironment=SANDBOX
enableProvider=false
```

Purpose:

- establish the provider environment explicitly as sandbox;
- keep provider execution disabled;
- require no provider credential;
- prevent accidental production activity;
- allow the Integration Service image and shared delivery infrastructure to be deployed safely;
- make each provider's intended environment visible in Azure before vendor onboarding is complete.

This is the required initial state for Shadowfax, Porter, Shiprocket Quick and Delhivery while their executable adapters are incomplete.

### FULL_SANDBOX

```text
targetEnvironment=SANDBOX
enableProvider=true
```

Purpose:

- run real provider sandbox API calls;
- require secret-backed provider credentials;
- require a real vendor-approved sandbox/test base URL;
- enable delivery reconciliation, webhook processing, tracking reconciliation and status publication as supported by the adapter;
- require the provider's Spring runtime configuration and Java adapter implementation to exist before activation.

Borzo full sandbox also enables the delivery-command worker because the current Spring delivery-command implementation is proven against the Borzo adapter.

For Shadowfax, Porter and Shiprocket Quick, `FULL_SANDBOX` remains intentionally blocked until vendor-issued API contracts/credentials are available and their adapters are implemented. Do not use a production endpoint as a substitute for a sandbox/test contract.

### PRODUCTION

```text
targetEnvironment=PRODUCTION
```

Production requires an explicit confirmation flag in every provider pipeline. Test/sandbox hosts are rejected. Provider credentials remain Azure Container App secret references and are never written into Git.

Borzo production activation remains two-stage:

1. `downstream`: configure production metadata and enable reconciliation/webhook/tracking/status publication while provider create remains disabled.
2. `provider_create`: enable Borzo and delivery commands only after downstream state and Service Bus queue counts are verified.

## Internal readiness API

```text
GET /internal/v1/delivery-provider-readiness
X-Craves-Internal-Secret: <shared internal secret>
```

The response contains only booleans and blocker codes. Credential values, callback secrets and provider payloads are never returned.

## Borzo production configuration guards

Production configuration requires:

- `BORZO_API_ENVIRONMENT=PRODUCTION`
- `BORZO_PRODUCTION_ACTIVATION_APPROVED=true`
- a non-test HTTPS provider base URL
- an HTTPS callback URL
- provider auth and callback secrets
- Service Bus configuration
- webhook processing, tracking reconciliation and delivery-status publication

Provider create additionally requires both:

```text
BORZO_API_ENABLED=true
CRAVES_DELIVERY_COMMAND_ENABLED=true
```

Both remain false by default in Spring configuration.

## Azure DevOps pipeline chain

The delivery safety/deployment chain is now:

```text
1. azure-pipelines-delivery-provider-production-ci.yml
2. azure-pipelines-integration-service.yml
3. azure-pipelines-delivery-provider-webhooks-apim.yml
4. azure-pipelines-delivery-provider-production-activation.yml       # Borzo
5. azure-pipelines-shadowfax-environment.yml
6. azure-pipelines-porter-environment.yml
7. azure-pipelines-shiprocket-production-activation.yml
8. azure-pipelines-delhivery-environment.yml
```

The approved Azure service connection is pinned in the deployment pipelines as:

```text
Craves-Dev-Service-Connection
```

### Safe multi-provider sandbox baseline

The safe Azure state before executable onboarding is:

```text
Borzo:
  targetEnvironment=SANDBOX
  enableProvider=true

Shadowfax:
  targetEnvironment=SANDBOX
  enableProvider=false

Porter:
  targetEnvironment=SANDBOX
  enableProvider=false

Shiprocket Quick:
  targetEnvironment=SANDBOX
  enableProvider=false

Delhivery:
  targetEnvironment=SANDBOX
  enableProvider=false
```

This means all planned providers are explicitly sandbox-scoped, while only Borzo can execute provider calls. The delivery-intelligence engine therefore currently receives Borzo as the only real provider quote candidate. `SIMPLE_SANDBOX` providers are configuration baselines, not fake routing candidates.

## Per-provider pipeline controls

### Shadowfax

```text
azure-pipelines-shadowfax-environment.yml
```

Default: `SANDBOX / enableProvider=false`.

`enableProvider=true` additionally requires:

- Java adapter files under `services/integration-service/src/main/java/in/craves/integration/delivery/shadowfax`;
- `SHADOWFAX_API_ENABLED` and `SHADOWFAX_API_ENVIRONMENT` Spring runtime configuration;
- vendor-approved HTTPS endpoint;
- secret-backed credential, default secret name `shadowfax-api-token`.

### Porter

```text
azure-pipelines-porter-environment.yml
```

Default: `SANDBOX / enableProvider=false`.

`enableProvider=true` additionally requires:

- Java adapter files under `services/integration-service/src/main/java/in/craves/integration/delivery/porter`;
- `PORTER_API_ENABLED` and `PORTER_API_ENVIRONMENT` Spring runtime configuration;
- vendor-approved HTTPS endpoint;
- secret-backed credential, default secret name `porter-api-token`.

### Shiprocket Quick

```text
azure-pipelines-shiprocket-production-activation.yml
```

Default: `SANDBOX / enableProvider=false`.

`enableProvider=true` additionally requires:

- Java adapter files under `services/integration-service/src/main/java/in/craves/integration/delivery/shiprocket`;
- `SHIPROCKET_API_ENABLED` and `SHIPROCKET_API_ENVIRONMENT` Spring runtime configuration;
- vendor-approved test/sandbox endpoint;
- secret-backed credential, default secret name `shiprocket-api-token`.

### Delhivery

```text
azure-pipelines-delhivery-environment.yml
```

Default: `SANDBOX / enableProvider=false`. Full sandbox remains blocked by the existing Spring runtime configuration guard until the adapter exists.

## APIM webhook exposure

The APIM pipeline validates that a provider webhook endpoint exists in Spring source before exposing it publicly.

The implemented Borzo callback is:

```text
POST /api/v1/webhooks/delivery/borzo
```

Shadowfax, Porter, Shiprocket and Delhivery webhook routes must remain disabled until matching Spring controllers and signature verification exist. The APIM policy must not transform raw provider webhook bodies when signatures depend on exact payload bytes.

## Secret handling

Provider pipelines use Azure Container App secret references only. Expected/default secret names include:

```text
borzo-api-auth-token
borzo-callback-token
shadowfax-api-token
porter-api-token
shiprocket-api-token
delhivery-api-token
```

Do not paste credential values into YAML, Git, pipeline parameters or chat. Secret names may be changed as pipeline parameters to match the final provider contract.

## Manual work before full sandbox or production

- Confirm the selected delivery-provider commercial/account onboarding state.
- Obtain authoritative provider sandbox/test documentation and credentials.
- Confirm the exact provider sandbox and production base URLs from the provider account/documentation.
- Confirm quote/serviceability, create, cancellation, tracking and webhook contracts.
- Confirm the webhook authentication/signature scheme and normalized status mapping.
- Create or rotate provider credentials in Azure Key Vault/Container App secret storage.
- Implement the provider-specific Spring adapter behind the canonical `DeliveryProviderAdapter` contract.
- Register the final APIM callback URL in the provider portal where callbacks are supported.
- Synchronize `delivery_schema.delivery_provider.is_active` only when executable full-sandbox activation is proven.
- Validate one quote, one booking, one callback, tracking and cancellation with an approved sandbox/test order before production.
- Keep exact operational evidence and return to fail-closed state after testing when required.

## Rollback

Borzo production rollback is handled by:

```text
azure-pipelines-delivery-provider-production-rollback.yml
```

For Shadowfax, Porter, Shiprocket and Delhivery, the immediate environment-level kill switch is:

```text
enableProvider=false
```

A provider-specific production rollback pipeline must be added when each Spring adapter is committed and its production execution contract is finalized.
