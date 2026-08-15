# Delivery provider environment and production readiness

This module defines the code and operational controls used to move delivery-provider integrations from a fail-closed runtime into simple sandbox, full sandbox and finally production.

It does not choose a provider commercially and it does not make an unimplemented provider operational merely by setting Azure environment variables.

## Current Spring implementation status

Borzo is implemented in the Spring Integration Service and remains the only delivery provider currently proven by the repository source to have:

- provider adapter code;
- provider-specific Spring configuration;
- signed webhook handling;
- readiness checks;
- delivery command integration;
- production safety tests.

Shiprocket and Delhivery environment pipelines exist so Azure can maintain explicit fail-closed environment state and so the production switch is already governed. Their `enableProvider=true` and `PRODUCTION` paths deliberately refuse to continue unless corresponding Spring runtime configuration is present in `application.yml`.

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
- allow the Integration Service image and shared delivery infrastructure to be deployed safely.

This is the required initial state for Delhivery.

### FULL_SANDBOX

```text
targetEnvironment=SANDBOX
enableProvider=true
```

Purpose:

- run real provider sandbox API calls;
- require secret-backed provider credentials;
- require a real sandbox/test base URL;
- enable delivery reconciliation, webhook processing, tracking reconciliation and status publication;
- require the provider's Spring runtime configuration to exist before activation.

Borzo full sandbox also enables the delivery-command worker because the current Spring delivery-command implementation is proven against the Borzo adapter.

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

Run these in this order:

```text
1. azure-pipelines-delivery-provider-production-ci.yml
2. azure-pipelines-integration-service.yml
3. azure-pipelines-delivery-provider-webhooks-apim.yml
4. azure-pipelines-delivery-provider-production-activation.yml
5. azure-pipelines-shiprocket-production-activation.yml
6. azure-pipelines-delhivery-environment.yml
```

The approved Azure service connection is pinned in the deployment pipelines as:

```text
Craves-Dev-Service-Connection
```

### Safe initial run parameters

For the first controlled rollout:

```text
APIM:
  confirmApimWrite=true
  enableBorzoRoute=true
  enableShiprocketRoute=false
  enableDelhiveryRoute=false

Borzo:
  targetEnvironment=SANDBOX
  enableProvider=false

Shiprocket:
  targetEnvironment=SANDBOX
  enableProvider=false

Delhivery:
  targetEnvironment=SANDBOX
  enableProvider=false
```

This produces a simple-sandbox baseline without activating any new provider execution.

## APIM webhook exposure

The APIM pipeline validates that a provider webhook endpoint exists in Spring source before exposing it publicly.

The implemented Borzo callback is:

```text
POST /api/v1/webhooks/delivery/borzo
```

Shiprocket and Delhivery webhook routes remain disabled by default until matching Spring controllers exist. The APIM policy does not transform the raw webhook body so provider signature verification remains possible.

## Secret handling

Provider pipelines use Azure Container App secret references only. Examples of expected secret names are:

```text
borzo-api-auth-token
borzo-callback-token
shiprocket-api-token
delhivery-api-token
```

The Shiprocket and Delhivery secret names are pipeline defaults and may be changed as parameters to match the final Spring adapter contract. Do not paste credential values into YAML, Git, pipeline parameters or chat.

## Manual work before full sandbox or production

- Confirm the selected delivery-provider commercial contract and onboarding/KYC state.
- Create or rotate provider credentials in Azure Key Vault/Container Apps.
- Confirm the exact provider sandbox and production base URLs from the provider documentation/account.
- Register the final APIM callback URL in the provider portal where callbacks are supported.
- For Shiprocket and Delhivery, commit the Spring adapter/runtime configuration before setting `enableProvider=true`.
- Validate one quote, one booking, one callback, tracking and cancellation with an approved sandbox/test order before production.
- Keep exact operational evidence and return to fail-closed state after testing when required.

## Rollback

Borzo production rollback is handled by:

```text
azure-pipelines-delivery-provider-production-rollback.yml
```

For Shiprocket and Delhivery, the immediate provider-level kill switch is:

```text
enableProvider=false
```

A provider-specific production rollback pipeline should be added when its Spring adapter is committed and its production execution contract is finalized.
