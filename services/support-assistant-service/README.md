# Craves Support Assistant Service

Privacy-first, authenticated self-support backend for Craves customers and chefs.

## Why this is RAG, not source-code training

The assistant must not be fine-tuned on the Craves repository or receive raw frontend/backend source code. Source code can contain implementation details, internal endpoints, operational assumptions, and accidental secrets that should never be available to an end-user model.

Instead, this service uses retrieval-augmented generation (RAG):

1. The user authenticates with the normal Craves JWT.
2. The service removes obvious secrets and direct contact/payment data from the question.
3. It retrieves only approved support knowledge from `support_assistant_schema.knowledge_document`.
4. If the request contains an order/support-case ID, the service uses the caller's existing JWT to call the authoritative Craves service.
5. The downstream service performs the normal ownership check.
6. Only a field-allowlisted summary (status, kitchen name, prep-time estimate, case status) is sent to the model.
7. Azure OpenAI / Microsoft Foundry is called by Microsoft Entra ID using managed identity. No model API key is required.
8. `store=false` is sent with every model request.
9. The response is safety-filtered before it is returned.
10. Only a SHA-256 hash of the question and operational metadata are written to the assistant audit table; raw prompts and model answers are not persisted.

## Security invariants

- All assistant APIs except health probes require Craves authentication.
- `CHEF` audience requires the authenticated `CHEF` role.
- The model receives no bearer token, OTP, password, CVV, full card-like number, direct email/phone, API key, private key, webhook secret, database credential, or connection string.
- The model has no function tools, web browsing, file search, computer use, database connection, payment access, delivery-provider access, or admin access.
- Downstream reads are identity-scoped and read-only.
- Redirects are disabled on the model HTTP client.
- The configured model endpoint must use HTTPS.
- Model output tokens are bounded.
- AI is disabled by default. The service can still provide deterministic, grounded fallbacks.
- Raw user prompts/responses must never be added to application logs.
- Support knowledge is data, never executable model instruction. Only reviewed support material should be ingested.

## Endpoint

`POST /api/v1/support-assistant/ask`

Example request body:

```json
{
  "message": "Why is my order still preparing?",
  "audience": "CUSTOMER",
  "orderId": "00000000-0000-0000-0000-000000000000",
  "supportCaseId": null
}
```

The `orderId` and `supportCaseId` are optional. If supplied, the caller must already be authorized to see them through the corresponding Craves service.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SPRING_DATASOURCE_URL` | yes | PostgreSQL database containing the isolated assistant schema |
| `SPRING_DATASOURCE_USERNAME` | yes | PostgreSQL login / identity configuration |
| `SPRING_DATASOURCE_PASSWORD` | environment dependent | Database credential when password auth is used |
| `CRAVES_JWT_VERIFICATION_PEM_BASE64` | yes | Existing Craves JWT verification public key |
| `CRAVES_JWT_ISSUER` | defaults safely | Craves JWT issuer |
| `CRAVES_JWT_AUDIENCE` | defaults safely | Craves API audience |
| `CRAVES_ORDER_SERVICE_BASE_URL` | recommended | Internal/API URL for identity-scoped Order Service reads |
| `CRAVES_USER_CHEF_SERVICE_BASE_URL` | recommended | Internal/API URL for identity-scoped support-case reads |
| `CRAVES_SUPPORT_AI_ENABLED` | no, default `false` | Explicit production AI activation gate |
| `CRAVES_SUPPORT_AI_ENDPOINT` | when AI enabled | Azure OpenAI / Foundry endpoint; HTTPS only |
| `CRAVES_SUPPORT_AI_DEPLOYMENT` | when AI enabled | Model deployment name |
| `CRAVES_SUPPORT_AI_MAX_OUTPUT_TOKENS` | no | Bounded model output, default 500 |

There is intentionally no `AZURE_OPENAI_API_KEY` setting in this module.

## Azure manual steps (defer until deployment)

These steps require Azure access and are intentionally not performed by application code:

- Create or select the Azure OpenAI / Microsoft Foundry resource and deploy the chosen support model.
- Enable a managed identity on the Azure workload hosting this service.
- Assign that identity the least-privilege `Cognitive Services OpenAI User` role on the model resource.
- Prefer private networking/private endpoint before broad production traffic.
- Configure the model endpoint/deployment environment variables.
- Configure the existing Craves JWT public verification key and internal downstream service URLs.
- Keep `CRAVES_SUPPORT_AI_ENABLED=false` until the model deployment and security smoke tests are complete.

These items must also be repeated in the final Craves backend handover so there is one authoritative manual checklist.

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

From this directory:

```bash
mvn test
mvn spring-boot:run
```

For local model access, use a developer identity supported by `DefaultAzureCredential`. Do not add an API key to the repository.

With AI disabled, the service should still start and answer from the safe knowledge/order-context fallback path.
