# Craves Support Assistant Service

Privacy-first, authenticated self-support backend for Craves customers and chefs.

## Current status

This module is **source-only and disabled by default**. It is not deployed, published through APIM, connected to a model, or enabled for production traffic by this source change.

The service can return deterministic answers from curated knowledge and caller-owned order/support-case context while AI is disabled. Model invocation requires a separate explicit production gate:

```text
CRAVES_SUPPORT_AI_ENABLED=true
```

## Why this is RAG, not source-code training

The assistant must not be fine-tuned on the Craves repository or receive raw frontend/backend source code. Source code can contain implementation details, internal endpoints, operational assumptions, and accidental secrets that should never be available to an end-user model.

Instead, this service uses retrieval-augmented generation (RAG):

1. The user authenticates with the normal Craves JWT.
2. The service removes obvious secrets and direct contact/payment data from the question.
3. It retrieves only approved support knowledge from `support_assistant_schema.knowledge_document`.
4. If the request contains an order/support-case ID, the service uses the caller's existing JWT to call the authoritative Craves service.
5. The downstream service performs its normal ownership check.
6. Only a field-allowlisted summary is made available to the model.
7. Azure OpenAI / Microsoft Foundry is called with Microsoft Entra ID through managed identity. No model API key is accepted by this module.
8. Every model request sends `store=false`.
9. The response is safety-filtered before it is returned.
10. Only a SHA-256 hash of the question and operational metadata are written to the assistant audit table; raw prompts and model answers are not persisted.

## Security invariants

- All assistant APIs except health probes require Craves authentication.
- `CHEF` audience requires the authenticated `CHEF` role.
- The model receives no bearer token, OTP, password, CVV, full card-like number, direct email/phone, API key, private key, webhook secret, database credential, or connection string.
- The model has no function tools, web browsing, file search, computer use, database connection, payment access, delivery-provider access, or admin access.
- Downstream reads are identity-scoped and read-only.
- Caller bearer tokens are forwarded only to an exact configured downstream host allowlist.
- Downstream HTTP redirects are disabled; HTTPS is mandatory outside loopback local development.
- The model endpoint must be an HTTPS Azure host ending in `.openai.azure.com` or `.services.ai.azure.com` and use only the `/openai/v1` base path.
- The Microsoft Entra token scope is restricted to the supported Cognitive Services or Foundry scope values.
- Model and downstream calls have bounded connect/read timeouts.
- Model output tokens are bounded.
- AI is disabled by default. The service can still provide deterministic, grounded fallbacks.
- Raw user prompts/responses must never be added to application logs.
- Support knowledge is data, never executable model instruction. Only reviewed support material should be ingested.

## Endpoint

```text
POST /api/v1/support-assistant/ask
```

Example request body:

```json
{
  "message": "Why is my order still preparing?",
  "audience": "CUSTOMER",
  "orderId": "00000000-0000-0000-0000-000000000000",
  "supportCaseId": null
}
```

The `orderId` and `supportCaseId` are optional. If supplied, the caller must already be authorized to see them through the owning Craves service.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SPRING_DATASOURCE_URL` | yes | PostgreSQL database containing the isolated assistant schema |
| `SPRING_DATASOURCE_USERNAME` | yes | PostgreSQL login / identity configuration |
| `SPRING_DATASOURCE_PASSWORD` | environment dependent | Database credential when password auth is used; use a secret reference |
| `CRAVES_JWT_VERIFICATION_PEM_BASE64` | yes | Existing Craves JWT verification public key |
| `CRAVES_JWT_ISSUER` | defaults safely | Craves JWT issuer |
| `CRAVES_JWT_AUDIENCE` | defaults safely | Craves API audience |
| `CRAVES_ORDER_SERVICE_BASE_URL` | recommended | Root HTTPS URL for identity-scoped Order Service reads |
| `CRAVES_USER_CHEF_SERVICE_BASE_URL` | recommended | Root HTTPS URL for identity-scoped support-case reads |
| `CRAVES_SUPPORT_DOWNSTREAM_ALLOWED_HOSTS` | no | Comma-separated exact host allowlist; defaults to `api.craves.in` |
| `CRAVES_SUPPORT_DOWNSTREAM_REQUEST_TIMEOUT` | no | Bounded downstream timeout; default `5s` |
| `CRAVES_SUPPORT_AI_ENABLED` | no, default `false` | Explicit model invocation gate |
| `CRAVES_SUPPORT_AI_ENDPOINT` | when AI enabled | Azure OpenAI / Foundry HTTPS resource root or `/openai/v1` base |
| `CRAVES_SUPPORT_AI_DEPLOYMENT` | when AI enabled | Model deployment name |
| `CRAVES_SUPPORT_AI_TOKEN_SCOPE` | no | Defaults to `https://cognitiveservices.azure.com/.default`; `https://ai.azure.com/.default` is also allowlisted for the matching Foundry resource type |
| `CRAVES_SUPPORT_AI_MAX_OUTPUT_TOKENS` | no | Bounded model output, default 500 and hard maximum 1200 |
| `CRAVES_SUPPORT_AI_TOKEN_TIMEOUT` | no | Managed-identity token timeout, bounded to 1–15 seconds |
| `CRAVES_SUPPORT_AI_REQUEST_TIMEOUT` | no | Model request timeout, bounded to 2–45 seconds |

There is intentionally no `AZURE_OPENAI_API_KEY` setting in this module.

For the initial Craves deployment, both downstream base URLs can use the existing API root:

```text
https://api.craves.in
```

This works with the default exact host allowlist and avoids adding internal Container App hostnames until they are explicitly reviewed.

## Knowledge maintenance

The service begins with a minimal safe seed describing existing authenticated Craves support/order workflows. World-class quality requires an ongoing curated knowledge build from:

- approved customer help copy;
- approved chef help copy;
- reviewed OpenAPI summaries;
- reviewed feature handovers/runbooks stripped of implementation secrets;
- product-policy documents explicitly approved for end-user disclosure.

Do not ingest:

- source code;
- `.env` files;
- pipeline variable values;
- Key Vault content;
- database dumps;
- production logs;
- raw support conversations;
- admin-only runbooks containing operational secrets;
- payment or delivery-provider credentials/contracts that are not intended for users.

## Local verification

Requirements:

- Java 21
- Maven 3.9+
- a local PostgreSQL database when starting the application

From this directory:

```bash
mvn -B -ntp clean verify
mvn spring-boot:run
```

For local model access, use a developer identity supported by `DefaultAzureCredential`. Do not add an API key to the repository. Loopback `http://localhost` downstream URLs are accepted for local development; non-loopback HTTP and unapproved hosts fail closed.

With AI disabled, the service should answer from the curated knowledge/order-context fallback path and must never attempt to acquire a model token.

## Production deployment boundary

Do not create an Azure resource or deploy this service from this source-only module. Before production activation:

1. confirm the relevant sections of `CRV-ARCH-HLD-002 v2.0` and `CRV-FUNC-001 v1.0` still permit a separate support service and the proposed API path;
2. approve the customer/chef support copy that may be disclosed to end users;
3. create or select a Microsoft Foundry / Azure OpenAI resource and model deployment;
4. enable a managed identity on the chosen Azure workload;
5. assign only the least-privilege model-user role to that identity;
6. prefer private networking before broad traffic;
7. configure all credentials as Key Vault or Container App secret references, never normal variables or chat messages;
8. deploy with `CRAVES_SUPPORT_AI_ENABLED=false` first;
9. apply the isolated V1/V2 Flyway migrations and verify checksums;
10. publish the authenticated APIM operation only after service health succeeds;
11. test customer and chef ownership isolation, prompt injection, secret redaction, audit minimization, timeout/fallback behavior and rate limiting;
12. enable AI only through a separate explicit activation change after evidence is accepted.

Creating a Foundry/OpenAI resource or an additional Container App can be billable and requires owner approval.

## Rollback

Before runtime deployment, rollback is a source revert only. After a future deployment, disable `CRAVES_SUPPORT_AI_ENABLED` first, remove only the named APIM operation if required, and route traffic back before removing any workload. Do not drop the audit or knowledge schema during an operational rollback.
