# Craves Support Assistant — Canonical Source Convergence Handover

Date: 2026-09-10  
Status: **source candidate only; AI and production runtime remain disabled/unprovisioned**

## Purpose

This module recovers the isolated Craves Support Assistant from the long-diverged backend consolidation branch and places it on a clean branch based directly on current `main`.

The old backend PR contains hundreds of unrelated service, payment, delivery and administration changes. It is not merged wholesale. Only the standalone Support Assistant service is imported, reviewed and hardened in this candidate.

The result is a Java 21 / Spring Boot 3 service that can give authenticated customers and approved chefs privacy-reduced, read-only help from curated Craves knowledge and caller-owned account context. It cannot change orders, payments, refunds, deliveries, chef state or administrator state.

## Source provenance

Clean base:

```text
main
38ba7d5ebd176dc10de010b2e5f27c26f19c65be
```

Source branch:

```text
feature/support-assistant-source-convergence-20260910
```

Recovered source path:

```text
services/support-assistant-service/
```

Original isolated module source came from:

```text
feature/backend-open-pr-consolidation-20260905
```

No unrelated file from that branch is imported.

## Capabilities included

- authenticated `POST /api/v1/support-assistant/ask`;
- separate `CUSTOMER` and `CHEF` audiences;
- enforced `CHEF` role for chef support;
- curated PostgreSQL full-text retrieval from an isolated schema;
- optional caller-owned order context;
- optional caller-owned support-case context;
- allowlisted context fields only;
- deterministic fallback when AI is disabled or unavailable;
- Microsoft Entra managed-identity model authentication;
- Azure OpenAI / Microsoft Foundry Responses API support;
- bounded model output and request timeouts;
- input secret/contact/payment redaction;
- output redaction;
- prompt-injection resistance instructions;
- no model tools/actions;
- no prompt/answer persistence;
- privacy-minimized audit containing the user identity, question SHA-256, outcome, context type and correlation ID;
- health, metrics and Prometheus support.

## Safety corrections applied during convergence

### 1. Correct and bounded Microsoft Entra token scopes

The recovered code hard-coded a single Foundry token scope. The canonical candidate now:

- defaults to `https://cognitiveservices.azure.com/.default` for Azure OpenAI v1;
- permits `https://ai.azure.com/.default` for the matching Foundry resource type;
- rejects every other scope;
- exposes the selected scope only through `CRAVES_SUPPORT_AI_TOKEN_SCOPE`;
- remains disabled when the scope is not allowlisted.

### 2. Model endpoint exfiltration protection

The service acquires a managed-identity bearer token, so it must never send that token to an arbitrary configured HTTPS host. The candidate accepts only:

```text
*.openai.azure.com
*.services.ai.azure.com
```

It also requires HTTPS, port 443/default, no user-info, no query, no fragment and only the root or `/openai/v1` path. HTTP redirects remain disabled.

### 3. Customer bearer-token forwarding protection

The service may forward the caller's Craves JWT to Order Service or User/Chef Service for normal ownership checks. The candidate now:

- forwards only to exact hosts in `CRAVES_SUPPORT_DOWNSTREAM_ALLOWED_HOSTS`;
- defaults the allowlist to `api.craves.in`;
- requires HTTPS outside loopback local development;
- rejects user-info, query strings, fragments, non-root base paths and non-standard production ports;
- disables redirects;
- applies bounded connect/read timeouts;
- bounds and rejects newline-bearing Authorization values;
- returns context-unavailable rather than forwarding to an unsafe destination.

For the initial production design, both owning-service base URLs can use:

```text
https://api.craves.in
```

This avoids new internal host allowlist work while preserving each owning service's authorization checks.

### 4. CI integration

The service is added to the Java 21 backend-completion Maven matrix. A dedicated source workflow also validates the module's stronger AI/privacy rules.

## Database ownership

The service owns only:

```text
support_assistant_schema
```

Migrations:

```text
V1__support_assistant_foundation.sql
V2__seed_support_knowledge.sql
```

V1 creates:

- curated knowledge documents with audience/source/hash constraints;
- generated PostgreSQL search vectors and indexes;
- a privacy-minimized conversation audit.

V2 inserts only minimal safe support guidance. It does not create pricing, commission, refund, delivery-radius, FSSAI, tax, cancellation or SLA policy.

Raw prompts, raw model answers, bearer tokens, OTPs, payment data and provider credentials have no database column in this module.

## Model boundary

The model receives only:

- the declared customer/chef audience;
- a redacted support question;
- a reduced, ownership-checked order/support-case summary when requested;
- bounded curated support documents.

The model does not receive:

- a Craves JWT;
- Firebase credentials;
- customer phone/email/address;
- payment credentials;
- raw webhook/provider payloads;
- source code;
- database credentials;
- Azure secrets;
- admin data;
- tools, functions, web access, file access or mutation authority.

Every model request sends:

```text
store=false
```

## Automated validation

Dedicated workflow:

```text
.github/workflows/support-assistant-source-ci.yml
```

Backend matrix:

```text
.github/workflows/backend-completion-ci.yml
```

The dedicated workflow performs:

1. exact clean-branch scope comparison against `main`;
2. Java 21 Maven `clean verify`;
3. repository secret scan;
4. Dockerfile hardening validation;
5. repository Flyway naming/order validation;
6. fail-closed AI default verification;
7. exact model host and token-scope allowlist verification;
8. model/downstream redirect blocking verification;
9. model `store=false` and output-bound verification;
10. downstream bearer-host allowlist verification;
11. no-tool/action source scan;
12. no raw prompt/answer schema scan;
13. raw prompt/answer/Authorization logging scan;
14. tested JAR and Surefire report artifact upload.

Focused unit tests cover:

- supported and rejected Azure model endpoints;
- supported and rejected Microsoft Entra scopes;
- AI configuration gating;
- exact downstream host allowlisting;
- lookalike-host, user-info, query, path, HTTP and port rejection;
- loopback-only HTTP development behavior;
- input secret/OTP/payment/contact redaction;
- restricted request handling;
- deterministic fallback, audience authorization and privacy-minimized auditing.

## Deployment status boundary

This source module does not:

- provision Microsoft Foundry or Azure OpenAI;
- select or deploy a model;
- provision a Container App;
- create an ACR repository;
- run Flyway in Azure;
- add an APIM operation;
- add a Front Door route;
- configure DNS;
- assign Azure RBAC;
- read or write Key Vault;
- enable AI;
- expose a customer/mobile/web UI;
- make a model request;
- change any current production service.

AI remains fail-closed:

```text
CRAVES_SUPPORT_AI_ENABLED=false
```

## Required architecture confirmation before runtime work

Before designing the production deployment, Krishna must upload or paste the relevant sections from:

```text
CRV-ARCH-HLD-002 v2.0
CRV-FUNC-001 v1.0
```

The sections must confirm:

- whether Support Assistant is a separate service;
- its API ownership and APIM path;
- supported customer/chef surfaces;
- data-retention and audit requirements;
- escalation behavior;
- approved support content sources;
- whether Android-first deployment is acceptable;
- expected availability/SLA and regional constraints.

No conflicting architecture decision is made in this source convergence.

## Manual work required before production activation

### Product/content approval

- approve the exact customer and chef support topics;
- approve the end-user wording in the seed/curated knowledge;
- define escalation destinations and service-hours copy;
- approve retention for hashed conversation audit records;
- decide whether model answers must display an AI disclosure.

### Azure Portal / Foundry — billable

- create or select the Foundry/Azure OpenAI resource;
- deploy an approved model in the approved region;
- create/select the Support Assistant Container App only after cost approval;
- enable managed identity;
- grant only the model-user RBAC role;
- configure private networking if required;
- confirm logging/retention does not capture prompts or answers.

### Secrets and configuration

Set secret references/environment values without pasting values into chat:

```text
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
CRAVES_JWT_VERIFICATION_PEM_BASE64
CRAVES_JWT_ISSUER
CRAVES_JWT_AUDIENCE
CRAVES_ORDER_SERVICE_BASE_URL
CRAVES_USER_CHEF_SERVICE_BASE_URL
CRAVES_SUPPORT_DOWNSTREAM_ALLOWED_HOSTS
CRAVES_SUPPORT_AI_ENDPOINT
CRAVES_SUPPORT_AI_DEPLOYMENT
CRAVES_SUPPORT_AI_TOKEN_SCOPE
```

Keep:

```text
CRAVES_SUPPORT_AI_ENABLED=false
```

until runtime certification passes.

### Runtime certification

- apply V1/V2 to the isolated schema and verify Flyway history;
- deploy with AI disabled;
- verify health/readiness and rollback image;
- publish only the authenticated APIM operation;
- prove customer A cannot access customer B's order/case;
- prove a customer cannot request chef audience;
- prove an approved chef can access only their own context;
- test malicious prompt injection and secret strings;
- test invalid model/downstream endpoints and redirects;
- test model timeout, token failure, 4xx/5xx and safe fallback;
- configure APIM rate limits and abuse protection;
- verify dashboards/alerts without prompt content;
- run a controlled AI-enabled test only after all previous gates pass;
- enable broad traffic only after privacy/security evidence is accepted.

## Cost warning

Creating a model deployment, model throughput allocation, private endpoint or additional Container App can generate Azure charges. No IaC or pipeline in this source module creates those resources automatically.

## Azure service connection

The established service connection remains:

```text
Craves-Dev-Service-Connection
```

A future guarded deployment pipeline may reuse it after architecture and billing approval. No new connection or credential is required by this source work.

## Rollback

Before source merge, close the PR; production is unchanged.

After source merge but before runtime deployment, revert the merge commit.

After a future deployment:

1. set `CRAVES_SUPPORT_AI_ENABLED=false` first;
2. remove/disable only the named APIM operation if necessary;
3. route traffic away from the new revision;
4. restore the previous immutable image;
5. preserve the knowledge/audit schema for evidence;
6. do not remove shared identity, database or API resources.

## Next engineering step

After source validation and merge, the next step is **not deployment**. First review the architecture/functional-spec sections and create a production runtime plan that reuses existing Azure components wherever safe, contains explicit cost estimates, and keeps AI disabled through initial deployment and ownership-isolation testing.
