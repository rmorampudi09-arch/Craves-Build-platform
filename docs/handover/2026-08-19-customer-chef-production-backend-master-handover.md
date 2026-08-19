# Craves Customer + Home-Chef Production Backend Master Handover

**Date:** 2026-08-19  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Release branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Pull request:** #258 — `backend: customer + chef production experience v2`  
**Scope:** Spring Boot backend services, PostgreSQL/Flyway, APIM, OpenAPI, release scripts and Azure DevOps YAML.  
**Explicitly excluded:** customer web, chef web, mobile UI changes.

---

## 1. Executive summary

This release closes the backend and gateway engineering gaps that can be implemented safely under the current Craves HLD/functional authority without inventing product policy. It prepares a production-scale backend foundation for a Hyderabad/Telugu home-chef marketplace and is designed so the existing web/mobile clients continue to work while later UX work adopts richer endpoints.

The release spans all seven Java services and the APIM boundary:

| Area | Capability |
|---|---|
| Auth/platform | universal correlation IDs and standard error envelope |
| Catalog | Telugu/English lexical discovery search, filters and indexes |
| Catalog | weekly kitchen schedule, pause state and date overrides |
| Catalog | optional fail-open Redis discovery cache |
| Catalog | staged home-chef public privacy hardening |
| Catalog | key-protected internal kitchen/menu resolution API |
| Catalog | atomic bulk menu availability |
| Order | scalable customer and chef order history |
| Order | legacy order list routes moved to indexed/batched history read model |
| Order | cart preflight before checkout |
| Order | retry-safe ready-for-pickup transition |
| Notification | cursor-paged in-app inbox, unread count and read-all |
| User-Chef | customer/chef support cases with support-admin workflow |
| Integration | read-only chef earnings APIM exposure |
| Integration | normalized provider error contract |
| APIM | correlation, no-cache stateful routes, body guard and discovery abuse ceiling tooling |
| Release | seven-service CI, production prerequisites, staged privacy activation/rollback |

No commercial, regulatory or disputed product behavior is invented in this release.

---

## 2. Architecture alignment

The implementation remains within the approved architecture:

```text
Client / future frontend
        |
        v
Azure API Management
        |
        +--> Auth Service
        +--> User-Chef Service
        +--> Catalog Service
        +--> Order Service
        +--> Subscription Service
        +--> Integration Service
        +--> Notification Service

Business PostgreSQL / PostGIS
Optional Redis acceleration
Service Bus / existing async paths
Azure Container Apps
```

Key architectural rules preserved:

- Spring Boot 3 / Java 21 / Maven.
- PostgreSQL/PostGIS remains authoritative for business and geographic data.
- Redis is optional acceleration only; cache failure does not block ordering/discovery correctness.
- Provider integration remains owned by Integration Service.
- Customer/chef identity remains authenticated through the existing Craves JWT/Firebase model.
- Public home-chef APIs must not expose private pickup/home details after staged privacy activation.
- No new Azure resource is provisioned by this code.
- Existing Container App deployment pipelines retain image-only/runtime-preserving behavior.

---

## 3. Universal request integrity and error contract

### 3.1 Problem addressed

Different services previously returned different error JSON shapes. Authentication failures could occur before controller advice and therefore return Spring/container defaults. Cross-service debugging also lacked one stable request identifier.

### 3.2 Standard envelope

New/normalized service errors use:

```json
{
  "timestamp": "2026-08-19T...Z",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "error": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": [],
  "path": "/api/v1/...",
  "correlationId": "..."
}
```

`error` is retained as a compatibility alias for clients that already consume that field.

### 3.3 Correlation behavior

Header:

```text
X-Correlation-ID
```

Rules:

- safe incoming values matching `[A-Za-z0-9._:-]{1,128}` are preserved;
- unsafe/missing values are replaced with a generated UUID;
- response returns the same ID;
- MDC uses `correlationId` for logs;
- Spring `RestClient` requests propagate the current correlation ID downstream;
- APIM operation policies also create/preserve the header.

### 3.4 Services changed

Auth:

```text
services/auth-service/src/main/java/in/craves/auth/observability/RequestCorrelationFilter.java
services/auth-service/src/main/java/in/craves/auth/observability/CorrelationRestClientCustomizer.java
services/auth-service/src/main/java/in/craves/auth/exception/ApiErrorResponse.java
services/auth-service/src/main/java/in/craves/auth/exception/RestExceptionHandler.java
services/auth-service/src/main/java/in/craves/auth/security/CravesJwtAuthenticationFilter.java
```

Catalog:

```text
services/catalog-service/src/main/java/in/craves/catalog/observability/RequestCorrelationFilter.java
services/catalog-service/src/main/java/in/craves/catalog/observability/CorrelationRestClientCustomizer.java
services/catalog-service/src/main/java/in/craves/catalog/exception/AppErrorHandler.java
services/catalog-service/src/main/java/in/craves/catalog/security/CravesJwtAuthenticationFilter.java
services/catalog-service/src/main/java/in/craves/catalog/security/SecurityConfig.java
```

User-Chef:

```text
services/user-chef-service/src/main/java/in/craves/userchef/observability/RequestCorrelationFilter.java
services/user-chef-service/src/main/java/in/craves/userchef/observability/CorrelationRestClientCustomizer.java
services/user-chef-service/src/main/java/in/craves/userchef/exception/AppErrorHandler.java
services/user-chef-service/src/main/java/in/craves/userchef/security/CravesJwtAuthenticationFilter.java
services/user-chef-service/src/main/java/in/craves/userchef/config/SecurityConfig.java
```

Order:

```text
services/order-service/src/main/java/in/craves/order/observability/RequestCorrelationFilter.java
services/order-service/src/main/java/in/craves/order/observability/CorrelationRestClientCustomizer.java
services/order-service/src/main/java/in/craves/order/web/StandardApiErrorResponse.java
services/order-service/src/main/java/in/craves/order/web/OrderApiExceptionHandler.java
services/order-service/src/main/java/in/craves/order/security/CravesJwtAuthenticationFilter.java
services/order-service/src/main/java/in/craves/order/security/SecurityConfig.java
```

Notification:

```text
services/notification-service/src/main/java/in/craves/notification/observability/RequestCorrelationFilter.java
services/notification-service/src/main/java/in/craves/notification/observability/CorrelationRestClientCustomizer.java
services/notification-service/src/main/java/in/craves/notification/api/ApiErrorHandler.java
services/notification-service/src/main/java/in/craves/notification/security/CravesJwtAuthenticationFilter.java
services/notification-service/src/main/java/in/craves/notification/config/WebAccessConfig.java
```

Subscription:

```text
services/subscription-service/src/main/java/in/craves/subscription/observability/RequestCorrelationFilter.java
services/subscription-service/src/main/java/in/craves/subscription/observability/CorrelationRestClientCustomizer.java
services/subscription-service/src/main/java/in/craves/subscription/exception/GlobalExceptionHandler.java
services/subscription-service/src/main/java/in/craves/subscription/security/CravesJwtAuthenticationFilter.java
services/subscription-service/src/main/java/in/craves/subscription/config/SecurityConfig.java
```

Integration:

```text
services/integration-service/src/main/java/in/craves/integration/observability/RequestCorrelationFilter.java
services/integration-service/src/main/java/in/craves/integration/observability/CorrelationRestClientCustomizer.java
services/integration-service/src/main/java/in/craves/integration/web/IntegrationApiErrorResponse.java
services/integration-service/src/main/java/in/craves/integration/web/IntegrationApiErrorHandler.java
services/integration-service/src/main/java/in/craves/integration/web/BorzoControllerAdvice.java
services/integration-service/src/main/java/in/craves/integration/security/CravesJwtAuthenticationFilter.java
services/integration-service/src/main/java/in/craves/integration/config/WebSecurityConfiguration.java
```

### 3.5 Security behavior

JWT verifier failures are routed through each service's normal exception resolver. Spring Security authentication-entry-point and access-denied callbacks also use the same error path. This standardizes:

```text
invalid token -> 401 structured JSON
missing authentication on protected route -> 401 structured JSON
valid user without required role -> 403 structured JSON
controller/business error -> service code + same envelope
unexpected error -> generic 500, detailed exception only in correlated server log
```

---

## 4. Catalog discovery query v2

### 4.1 Customer capability

Nearby discovery supports optional:

```text
free-text query
category
foodType
minPrice
maxPrice
maxPreparationTimeMinutes
spiceLevel
sort
page
size
```

Current implementation uses PostgreSQL full-text `simple` configuration to support Telugu and English lexical tokens without introducing an external search engine.

### 4.2 Indexes

Flyway:

```text
services/catalog-service/src/main/resources/db/migration/V6__discovery_search_filter_indexes.sql
```

Includes partial GIN search indexes and structured menu filters while retaining PostGIS proximity narrowing.

### 4.3 Main files

```text
services/catalog-service/src/main/java/in/craves/catalog/service/DiscoveryCriteria.java
services/catalog-service/src/main/java/in/craves/catalog/service/NearbyDiscoveryService.java
services/catalog-service/src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java
services/catalog-service/src/test/java/in/craves/catalog/service/NearbyDiscoveryServiceCriteriaValidationTest.java
services/catalog-service/modules/discovery-query-v2/README.md
```

---

## 5. Kitchen schedule and live availability

### 5.1 Chef capability

Chef can manage:

```text
weekly local service windows
acceptingOrders
pausedUntil
pause reason
closed-date override
special-hours override
multiple windows per date
```

Schedule evaluation uses `Asia/Kolkata` and also checks ACTIVE kitchen state.

### 5.2 Endpoints

```http
GET    /api/v1/kitchens/me/schedule
PUT    /api/v1/kitchens/me/schedule
GET    /api/v1/kitchens/me/schedule/overrides/{serviceDate}
PUT    /api/v1/kitchens/me/schedule/overrides/{serviceDate}
DELETE /api/v1/kitchens/me/schedule/overrides/{serviceDate}
GET    /api/v1/catalog/kitchens/{kitchenId}/availability
```

### 5.3 Flyway

```text
services/catalog-service/src/main/resources/db/migration/V7__kitchen_schedule_availability.sql
```

### 5.4 Defensive validation

Null window entries are rejected as clean 400 errors rather than producing server exceptions.

---

## 6. Optional Redis discovery cache

### 6.1 Default state

```text
CRAVES_DISCOVERY_CACHE_ENABLED=false
```

The release is safe without Redis.

### 6.2 Cache strategy

- cache-aside;
- short TTL;
- SHA-256 query key;
- generation-based invalidation;
- no key scans;
- fail-open to PostgreSQL;
- temporary failure backoff;
- mutation-driven invalidation;
- privacy flag included in cache key.

### 6.3 Metrics

```text
craves.discovery.cache.hit
craves.discovery.cache.miss
craves.discovery.cache.error
craves.discovery.cache.invalidation
```

### 6.4 Module

```text
services/catalog-service/modules/discovery-cache-v1/README.md
```

---

## 7. Home-chef public privacy v1

### 7.1 Problem

A home-chef marketplace must not publicly expose private pickup/home details merely because Catalog needs those details for fulfillment.

### 7.2 Fields redacted after activation

```text
internal identity UUID
phone
email
address lines
landmark
postal code
exact kitchen latitude/longitude
internal image blob container/blob object name
internal timestamps on public kitchen detail
```

Area/city/state, display identity and distance remain usable for discovery.

### 7.3 Zero-downtime feature flag

```text
CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=false
```

It remains false through initial Catalog + Order rollout.

### 7.4 Internal Catalog API

```http
GET  /api/v1/catalog/internal/kitchens/{kitchenId}
POST /api/v1/catalog/internal/menu-items/resolve
```

Both require:

```text
X-Craves-Internal-Key
```

Backed by existing:

```text
CRAVES_INTERNAL_SERVICE_SECRET
```

### 7.5 Secret verification

Read-only script:

```text
scripts/release/verify-catalog-order-internal-secret-binding.sh
```

It checks that Catalog and Order:

- secret-bind the environment variable;
- point to the same Key Vault secret URI;
- use managed identity;
- have ready revisions;
- never read or print the secret value.

### 7.6 Activation

```text
scripts/release/activate-catalog-public-privacy.sh
scripts/release/rollback-catalog-public-privacy.sh
azure-pipelines-catalog-public-privacy-activation.yml
```

### 7.7 Required zero-downtime sequence

```text
1. Verify shared secret binding.
2. Deploy Catalog with privacy flag false.
3. Verify internal Catalog endpoints.
4. Deploy Order internal Catalog client.
5. Smoke-test cart + checkout + pickup snapshots.
6. Activate public privacy flag.
7. Verify public redaction.
8. Roll back flag only if needed.
```

---

## 8. Atomic bulk menu availability

Endpoint:

```http
PATCH /api/v1/kitchens/me/menu-items/availability
```

Features:

- up to 100 changes;
- all menu items must belong to the chef;
- duplicates rejected;
- full-batch validation before writes;
- row locking;
- audit rows;
- availability enablement requires delivery metadata;
- cache invalidation only when state changes;
- no partial success.

Artifacts:

```text
services/catalog-service/modules/bulk-menu-availability-v1/README.md
openapi/chef-menu-bulk-availability-v1.yaml
infra/apim/chef-menu-bulk-availability-v1/bulk-availability-policy.xml
scripts/apim/configure-chef-menu-bulk-availability-v1-apim.sh
scripts/apim/rollback-chef-menu-bulk-availability-v1-apim.sh
```

---

## 9. Order history v2 and immediate legacy-route improvement

### 9.1 Problem addressed

Legacy chef order listing scanned recent marketplace orders, then called Catalog per row and filtered in Java. At scale this was both expensive and potentially incomplete. Customer list also used per-order item loading.

### 9.2 New read model

Flyway V16 adds `chef_identity_id` to `order_schema.customer_order`, performs historical backfill from Catalog ownership and creates customer/chef cursor indexes.

```text
services/order-service/src/main/resources/db/migration/V16__order_history_cursor_indexes.sql
```

### 9.3 Cursor routes

```http
GET /api/v1/orders/page
GET /api/v1/chef/orders/page
```

Cursor ordering:

```text
created_at DESC, id DESC
```

### 9.4 Existing routes improved without frontend work

```http
GET /api/v1/orders
GET /api/v1/chef/orders
```

Both now use `OrderHistoryService` internally, so current clients gain the indexed/batched read path immediately.

### 9.5 V16 production precondition

Historical order rows must resolve kitchen ownership. The migration deliberately fails instead of silently leaving missing chef ownership.

Before Order deploy, validate production data and after migration require:

```sql
SELECT COUNT(*)
FROM order_schema.customer_order
WHERE chef_identity_id IS NULL;
```

Required result: `0`.

---

## 10. Customer cart preflight

Endpoint:

```http
GET /api/v1/cart/preflight
```

Read-only facts:

Blocking:

```text
MENU_ITEM_UNAVAILABLE
DELIVERY_METADATA_MISSING
```

Review-only:

```text
PRICE_CHANGED
KITCHEN_CHANGED
ITEM_NAME_CHANGED
```

The endpoint does not mutate the cart or automatically accept a new price.

To avoid Catalog N+1 calls, Order sends one bounded internal request:

```http
POST /api/v1/catalog/internal/menu-items/resolve
```

Artifacts:

```text
services/order-service/modules/cart-preflight-v1/README.md
openapi/customer-cart-preflight-v1.yaml
scripts/apim/rollback-customer-cart-preflight-v1-apim.sh
```

The existing `scripts/apim/configure-customer-cart-apim.sh` now adds the preflight operation.

---

## 11. Retry-safe chef ready-for-pickup

Existing endpoint retained:

```http
POST /api/v1/chef/orders/{orderId}/ready-for-pickup
```

Implementation:

- validates CHEF;
- locks order row;
- verifies `chef_identity_id` snapshot;
- valid source states: `CHEF_ACCEPTED`, `PREPARING`;
- already-ready retry is success;
- exactly one history transition;
- no Catalog/network call while DB row lock is held.

Module:

```text
services/order-service/modules/ready-for-pickup-idempotency-v1/README.md
```

---

## 12. Notification inbox v2

New capabilities:

```http
GET   /api/v1/notifications/in-app/page
GET   /api/v1/notifications/in-app/unread-count
PATCH /api/v1/notifications/in-app/read-all
```

Legacy notification list/read route remains.

Flyway:

```text
services/notification-service/src/main/resources/db/migration/V5__in_app_notification_inbox_indexes.sql
```

Features:

- deterministic cursor pagination;
- unread-only option;
- unread count;
- idempotent read-all;
- partial unread index;
- no-store APIM policy.

---

## 13. Support Cases v1

### 13.1 Requester routes

```http
POST /api/v1/support/cases
GET  /api/v1/support/cases
GET  /api/v1/support/cases/{caseId}
POST /api/v1/support/cases/{caseId}/messages
```

Requester must own CUSTOMER or CHEF context.

### 13.2 Admin routes

```http
GET   /api/v1/admin/support/cases
GET   /api/v1/admin/support/cases/{caseId}
POST  /api/v1/admin/support/cases/{caseId}/messages
PATCH /api/v1/admin/support/cases/{caseId}/status
POST  /api/v1/admin/support/cases/{caseId}/assign-to-me
```

Allowed roles:

```text
SUPPORT_ADMIN
PLATFORM_ADMIN
```

### 13.3 Privacy

Requester responses hide:

```text
internal notes
support-agent UUID
assigned-agent UUID
internal status notes
```

### 13.4 Durable notifications

Public support reply/status change writes a Notification Outbox record inside the same Spring transaction. Internal notes do not notify the requester.

Earlier duplicate database notification triggers were removed; application service is the single enqueue source.

Flyway:

```text
services/user-chef-service/src/main/resources/db/migration/V7__support_case_domain.sql
```

---

## 14. Chef earnings read API

Existing backend ledger remains authoritative. This release adds read-only gateway exposure:

```http
GET /api/v1/chef/earnings
```

Artifacts:

```text
openapi/chef-financial-v1.yaml
infra/apim/chef-financial-v1/chef-financial-policy.xml
scripts/apim/configure-chef-financial-v1-apim.sh
scripts/apim/rollback-chef-financial-v1-apim.sh
```

No payout, settlement, commission or earning calculation rules are added.

---

## 15. Integration/provider error hardening

Provider-specific failures are logged internally with correlation context while the caller receives a normalized service error. Raw Borzo provider exception details are no longer returned as a separate public error shape.

This does not change provider activation, priority, dispatch logic or credentials.

---

## 16. APIM platform baseline

### 16.1 Reusable fragments

```text
infra/apim/platform-baseline/craves-correlation-inbound.xml
infra/apim/platform-baseline/craves-security-outbound.xml
infra/apim/platform-baseline/craves-json-body-guard.xml
```

### 16.2 Behavior

Correlation fragment:

- preserves/creates `X-Correlation-ID`.

Outbound security fragment:

```text
X-Correlation-ID
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

JSON body guard:

- reusable 1 MiB request maximum for normal JSON operations;
- not intended for media upload routes.

### 16.3 Public discovery abuse ceiling

`scripts/apim/configure-apim-platform-baseline.sh` can apply `rate-limit-by-key` to exactly the two discovery operations.

Default configuration:

```text
6000 requests / 60 seconds / source IP / API
```

This is a conservative abuse ceiling, not a customer product quota. It is configurable and automatically skipped when the active APIM SKU does not support the policy.

### 16.4 Safe policy update behavior

The script:

- reads active APIM SKU;
- uses current policy-fragment management API;
- uses ETag / `If-Match` for fragment updates;
- refuses to replace unknown custom discovery operation policies unless an explicit override is supplied;
- modifies only the two intended discovery operations.

Rollback:

```text
scripts/apim/rollback-apim-platform-baseline.sh
```

It removes only a recognized Craves baseline operation policy and leaves unused fragments inert.

---

## 17. New and updated APIM artifacts

```text
infra/apim/kitchen-schedule-v1/public-availability-policy.xml
infra/apim/notification-inbox-v2/notification-inbox-policy.xml
infra/apim/order-history-v2/order-history-policy.xml
infra/apim/support-cases-v1/support-case-policy.xml
infra/apim/chef-financial-v1/chef-financial-policy.xml
infra/apim/chef-menu-bulk-availability-v1/bulk-availability-policy.xml
infra/apim/customer-cart/customer-cart-policy.xml
infra/apim/platform-baseline/*
```

All user-specific/stateful reads are no-store where appropriate. Correlation is propagated on the new/updated operation policies.

---

## 18. Unified validation pipeline

Register pipeline with exact name:

```text
azure-pipelines-customer-chef-backend-experience-v2-ci.yml
```

It validates:

```text
Auth Maven clean verify
User-Chef Maven clean verify
Catalog Maven clean verify
Order Maven clean verify
Subscription Maven clean verify
Integration Maven clean verify
Notification Maven clean verify
backend-only diff guard
APIM/release Bash syntax
APIM XML parse
Flyway version uniqueness
APIM Authorization/correlation/no-store assertions
bulk JSON body guard
platform rate-limit fragment/script presence
internal Catalog secret configuration
staged privacy activation artifacts
OpenAPI path/security assertions
```

Do not run service deployment pipelines until this gate is green.

---

## 19. Production prerequisite pipeline

Register exact name:

```text
azure-pipelines-customer-chef-production-prerequisites.yml
```

Required Azure DevOps variable:

```text
AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection
```

The pipeline is read-only and verifies the Catalog/Order internal secret binding.

If it fails because the environment variable is absent, manually bind `CRAVES_INTERNAL_SERVICE_SECRET` on both Container Apps to the same approved Key Vault secret. Do not paste the secret value into source, pipeline YAML or chat.

---

## 20. Recommended production deployment order

### Phase 0 — repository and CI

1. Keep PR #258 draft while validation runs.
2. Run `azure-pipelines-customer-chef-backend-experience-v2-ci.yml`.
3. Require every job green.
4. Run `azure-pipelines-customer-chef-production-prerequisites.yml`.
5. Resolve any missing shared internal-secret binding before deployment.

### Phase 1 — Auth

Run:

```text
azure-pipelines-auth-service.yml
```

Verify health, login/token flows and correlated errors.

### Phase 2 — Notification

Run:

```text
azure-pipelines-notification-service.yml
```

Configure Notification Inbox APIM after healthy revision.

### Phase 3 — User-Chef

Run:

```text
azure-pipelines-user-chef-service.yml
```

Verify Support V7 migration, support requester/admin isolation and outbox delivery. Configure Support APIM.

### Phase 4 — Catalog initial deployment, privacy OFF

Run:

```text
azure-pipelines-catalog-service.yml
```

**Do not activate public privacy yet.** Default flag must remain false.

Verify:

```text
health/readiness
V6/V7 Flyway
legacy public kitchen contract still works
internal kitchen endpoint works with service key
internal batch menu resolver works with service key
search/filter works
schedule works
bulk availability works
```

Configure:

```text
Kitchen Schedule APIM
Bulk Availability APIM
APIM platform baseline
```

Keep discovery cache disabled unless production Redis is already approved/configured.

### Phase 5 — Order

Before migration validate historical kitchen ownership required for V16.

Run:

```text
azure-pipelines-order-service.yml
```

Verify:

```text
V16 completed
chef_identity_id missing count = 0
legacy customer list works
legacy chef list works
/page routes work
cart preflight works
checkout obtains private pickup snapshot through internal Catalog route
ready-for-pickup retry is idempotent
```

Configure:

```text
Order History APIM
Customer Cart APIM/preflight
```

### Phase 6 — Activate public home-chef privacy

Run:

```text
azure-pipelines-catalog-public-privacy-activation.yml
action=ACTIVATE
```

Verify public kitchen/detail/discovery no longer exposes private contact/address/exact coordinates or Blob object coordinates.

If any compatibility issue appears:

```text
action=ROLLBACK
```

This reverts only the privacy flag and keeps the deployed code/image.

### Phase 7 — Subscription

Run existing Subscription deployment pipeline and verify no regression. No new product schedule rules are introduced by this release.

### Phase 8 — Integration

Run existing Integration deployment pipeline.

Then configure:

```text
Chef Financial Read APIM
```

Verify provider/admin internal routes and normalized provider error behavior.

### Phase 9 — full API journey smoke

Customer:

```text
authenticate
search Telugu term
search English term
filter discovery
read kitchen availability
add cart
preflight cart
validate cart
checkout using saved address
order history legacy + page
notification inbox/unread/read-all
create support case
receive support reply/status notification
```

Chef:

```text
authenticate
manage weekly schedule
pause/unpause
set date override
bulk mark dishes sold-out/available
read current orders
accept order
retry ready-for-pickup twice
read order history
read earnings
create CHEF-context support case
receive support response
```

---

## 21. Manual Azure actions

Only when required by prerequisite checks:

### Secrets / Key Vault

Exact environment name on Catalog and Order:

```text
CRAVES_INTERNAL_SERVICE_SECRET
```

Requirement:

- secretRef, not plain value;
- Key Vault-backed;
- same secret URI for Catalog and Order;
- managed identity access already working.

Do not create a new secret if the existing approved internal service secret can be reused.

### Redis

No action required for this release because discovery cache defaults disabled.

If enabling later, first confirm the approved Redis/Managed Redis resource/runtime settings exist, then enable only the cache flag and monitor metrics.

### APIM

Run configuration scripts from an authenticated Azure CLI/Azure DevOps context after the corresponding backend revision is healthy.

### No manual action required

This release does not require:

```text
new Firebase project/provider
new Cashfree credentials
DNS change
mobile signing
Apple/Google store setup
new paid Azure resource
new delivery-provider credentials
```

---

## 22. Rollback map

| Capability | First rollback action |
|---|---|
| new APIM operation | run its operation-only rollback script |
| APIM discovery baseline | `rollback-apim-platform-baseline.sh` |
| public home-chef privacy | privacy pipeline `action=ROLLBACK` |
| discovery cache | set `CRAVES_DISCOVERY_CACHE_ENABLED=false` |
| service code regression | restore previous healthy Container App image/revision using existing runtime-preserving pipeline process |
| additive Flyway objects | normally leave schema additive; do not manually drop objects during incident without reviewed DB rollback |

---

## 23. Test inventory introduced/updated

Representative tests:

```text
Auth RequestCorrelationFilterTest
Auth RestExceptionHandlerTest
Order OrderApiExceptionHandlerContractTest
Catalog PublicCatalogControllerPrivacyTest
Catalog InternalCatalogAuthorizerTest
Catalog DiscoveryCacheServiceTest
Catalog KitchenScheduleControllerValidationTest
Order CartPreflightServiceTest
Order OrderHistoryCursorCodecTest
Order OrderHistoryServiceValidationTest
Notification AppNoticeCursorCodecTest
Notification NotificationServiceInboxTest
User-Chef SupportCaseCursorCodecTest
User-Chef RequesterSupportViewTest
User-Chef SupportCaseServiceValidationTest
Catalog NearbyDiscoveryServiceCriteriaValidationTest
```

The GitHub `Backend completion CI` remains an independent all-service Maven/Flyway/source-integrity check on PR changes.

---

## 24. Production observability checklist

For each affected Container App:

```text
latest revision == latest ready revision
running status == Running
health endpoint UP
no restart loop
5xx rate not elevated
p95/p99 latency acceptable
DB connection pool stable
Flyway completed once
```

Catalog:

```text
discovery latency
PostGIS/FTS query plans
cache hit/miss/error if enabled
cache invalidation count
privacy flag state
```

Order:

```text
cart preflight latency
internal Catalog error rate
checkout success
V16 chef ownership integrity
order history latency
ready retry behavior
```

Support/Notification:

```text
notification outbox backlog
support reply delivery
unread-count latency
notification failure/retry counts
```

APIM:

```text
2xx/4xx/5xx
429 count
backend latency
correlation header presence
policy failures
unexpected path ownership
```

---

## 25. Engineering gaps intentionally NOT implemented because product authority is missing

These remain product/specification decisions, not engineering omissions to guess:

### Ratings and reviews

Pending:

```text
who may review
verified-order eligibility
one review per order/item/chef
edit window
moderation
abuse/reporting
aggregation formulas
chef vs dish vs delivery dimensions
```

### One-time scheduled orders / capacity

Pending:

```text
how far ahead
slot inventory
cutoff
capacity ownership
payment timing
reschedule/cancel semantics
interaction with chef schedule/meal plans
```

### “Need more time”

Pending:

```text
allowed extensions
number of extensions
customer consent/notification
courier dispatch effect
SLA consequences
```

### Item substitution

Pending:

```text
customer consent
price difference
refund/charge behavior
allergen/food-type constraints
who can propose/approve
```

### Vacation mode semantics

The existing schedule/closure primitives can represent closed dates, but a separate product-level vacation workflow/UX remains unspecified.

### Ratings-based/personalized ranking

Pending ranking formula, consent/privacy behavior and business constraints. Current discovery remains deterministic lexical/structured/geographic search.

### Semantic/AI/voice ordering

Not added to core ordering because relevance/fallback/consent/product interaction contracts are not approved.

### Cancellation/refunds/pricing/commission/delivery radius/FSSAI/GST

Existing approved behavior is preserved. No new rule was inferred.

---

## 26. Frontend backlog enabled by this backend release

No frontend was modified, but later frontend work can consume:

```text
cart preflight warnings
bulk menu sold-out controls
chef weekly schedule/pause controls
notification unread badge + paged inbox
support case UI/admin queue
paged order history
chef earnings read
kitchen live availability
search/filter/sort
public privacy-safe kitchen presentation
correlation ID on support/error screens
```

This should be handled as a separate frontend phase after production backend rollout.

---

## 27. Release status terminology

Use these terms precisely:

```text
IMPLEMENTED = code committed on release branch
CI GREEN = repository validation passed at the exact current head
PRODUCTION-READY-TO-RUN = code + CI + prerequisites + runbook are ready, but Azure pipelines not yet executed
DEPLOYED = Azure DevOps production pipeline actually completed and Container App revision verified
ACTIVE = APIM/feature-flag exposure actually enabled and smoke-tested
```

Do not call a capability deployed/active until the corresponding Azure action has actually run.

---

## 28. Final pending external actions

```text
1. Require current-head GitHub Backend Completion CI green.
2. Run unified Azure DevOps CI.
3. Run production prerequisite pipeline.
4. Bind existing internal service Key Vault secret to Catalog/Order only if prerequisite reports it missing.
5. Deploy services in zero-downtime order.
6. Configure additive APIM operations after each healthy backend revision.
7. Activate public Catalog privacy only after Order internal route is proven.
8. Run customer + chef production smoke tests.
9. Observe errors/latency/outbox/APIM metrics.
10. Merge/close release governance only after production evidence is captured.
```

---

## 29. Conclusion

The Craves backend is now materially closer to a high-quality production food marketplace experience while staying faithful to the Hyderabad/Telugu home-chef model. The release improves discovery, operational availability, order history, cart transparency, support, notifications, chef operations, privacy, request tracing, consistent errors and gateway controls without changing the business plan or fabricating commercial/regulatory rules.

The remaining meaningful feature gaps are primarily product-authority items listed above and future frontend adoption of the backend capabilities already built here.
