# Craves Customer + Home-Chef Backend Experience v2 — Production Release Runbook

**Date:** 2026-08-19  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Release branch:** `chatgpt/backend-customer-chef-journey-20260819`  
**Scope:** backend, PostgreSQL/Flyway, APIM, OpenAPI and Azure DevOps only. Web/mobile frontend remains unchanged.

The detailed engineering handover is:

```text
docs/handover/2026-08-19-customer-chef-production-backend-master-handover.md
```

---

## 1. Release capabilities

This release contains:

```text
Universal X-Correlation-ID propagation across all seven Java services
Standard code/error/message/details/path/correlationId error contract
Standard invalid-JWT / missing-auth / access-denied JSON behavior
Catalog Telugu/English lexical search + filters + indexes
Kitchen weekly schedule, pause and date override
Optional fail-open Redis discovery cache
Atomic chef bulk menu availability
Staged public home-chef privacy hardening
Key-protected internal Catalog kitchen/menu resolution API
Customer/chef cursor-paged order history
Legacy customer/chef order lists moved to the indexed/batched history read model
Customer cart preflight
Retry-safe ready-for-pickup transition
Paged Notification inbox + unread count + read-all
Customer/Chef Support Cases + support-admin workflow + durable outbox notifications
Read-only chef earnings APIM exposure
Normalized Integration/provider errors
APIM correlation/security fragments, JSON body guard and discovery abuse-ceiling tooling
Production prerequisite, privacy activation and rollback pipelines
```

No pricing, commission, cancellation/refund, delivery-radius, GST, FSSAI/KYC, ratings/reviews, substitutions, one-time scheduled-order policy or personalization rules are introduced.

---

## 2. Pipelines to register

Pipeline display names must exactly equal YAML filenames.

New/updated release pipelines:

```text
azure-pipelines-customer-chef-backend-experience-v2-ci.yml
azure-pipelines-customer-chef-production-prerequisites.yml
azure-pipelines-catalog-public-privacy-activation.yml
```

Existing service deployment pipelines used by this release:

```text
azure-pipelines-auth-service.yml
azure-pipelines-notification-service.yml
azure-pipelines-user-chef-service.yml
azure-pipelines-catalog-service.yml
azure-pipelines-order-service.yml
azure-pipelines-subscription-service.yml
azure-pipelines-integration-service.yml
```

Required existing variable/service connection:

```text
AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection
```

---

## 3. Phase 0 — unified release validation

Run:

```text
azure-pipelines-customer-chef-backend-experience-v2-ci.yml
```

Required result: **every job green**.

The pipeline validates:

```text
Auth Maven clean verify — Java 21
User-Chef Maven clean verify — Java 21
Catalog Maven clean verify — Java 21
Order Maven clean verify — Java 21
Subscription Maven clean verify — Java 21
Integration Maven clean verify — Java 21
Notification Maven clean verify — Java 21
backend-only diff guard
Flyway version uniqueness
APIM/release Bash syntax
APIM policy/fragment XML parsing
Authorization/correlation/no-store assertions
bulk menu 1 MiB request body guard
APIM platform-baseline safety markers
internal Catalog secret configuration
staged privacy activation/rollback artifacts
OpenAPI path/security assertions
```

Do not deploy any service until this gate passes.

---

## 4. Phase 1 — production prerequisites

Run:

```text
azure-pipelines-customer-chef-production-prerequisites.yml
```

This is a read-only Azure check. It verifies Catalog and Order both have:

```text
CRAVES_INTERNAL_SERVICE_SECRET
```

bound by `secretRef` to the **same Key Vault secret URI**, with managed identity, without reading the secret value.

If the pipeline fails because the binding is missing, manually configure both Container Apps to use the existing approved internal-service Key Vault secret. Do not paste or recreate the secret value in source/YAML/chat.

The privacy release must not proceed until this prerequisite passes.

---

## 5. Phase 2 — Auth Service

Run:

```text
azure-pipelines-auth-service.yml
```

Post-deploy:

```text
latest revision == latest ready revision
running status == Running
/actuator/health == UP
valid login/token flow still works
invalid token returns 401 structured JSON
protected auth/admin failures include X-Correlation-ID
```

---

## 6. Phase 3 — Notification Service

Run:

```text
azure-pipelines-notification-service.yml
```

Expected Flyway:

```text
V5__in_app_notification_inbox_indexes.sql
```

Verify:

```text
legacy /api/v1/notifications/in-app works
/api/v1/notifications/in-app/page works
cursor page 1/page 2 deterministic
unreadOnly=true works
unread-count works
read-all idempotent
401/403/error payloads are correlated
```

Then configure:

```bash
bash scripts/apim/configure-notification-inbox-v2-apim.sh
```

Rollback gateway only:

```bash
bash scripts/apim/rollback-notification-inbox-v2-apim.sh
```

---

## 7. Phase 4 — User-Chef Service

Run:

```text
azure-pipelines-user-chef-service.yml
```

Expected Flyway:

```text
V7__support_case_domain.sql
```

Verify:

```text
CUSTOMER creates/reads/messages only own cases
CHEF creates/reads/messages only own cases
SUPPORT_ADMIN/PLATFORM_ADMIN can use admin case workflow
ordinary customer cannot use admin case workflow
internal notes never appear in requester view
support staff UUID/assignment UUID not exposed to requester
public support reply creates exactly one durable notification_outbox event
internal support note creates no requester notification event
support status change creates one notification event
```

Then configure:

```bash
bash scripts/apim/configure-support-cases-v1-apim.sh
```

Rollback:

```bash
bash scripts/apim/rollback-support-cases-v1-apim.sh
```

---

## 8. Phase 5 — Catalog Service initial deployment, privacy OFF

Run:

```text
azure-pipelines-catalog-service.yml
```

Expected Flyway additions:

```text
V6__discovery_search_filter_indexes.sql
V7__kitchen_schedule_availability.sql
```

**Important:** the Catalog runtime must initially keep:

```text
CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=false
```

This is the default. Do not activate privacy before the new Order revision is running.

Verify:

```text
health/readiness UP
legacy public kitchen response still works while privacy flag=false
GET /api/v1/catalog/internal/kitchens/{id} works only with X-Craves-Internal-Key
POST /api/v1/catalog/internal/menu-items/resolve works only with X-Craves-Internal-Key
wrong/missing internal key fails closed
Telugu search works
English search works
food/category/price/prep/spice filters work
weekly schedule read/write works
date overrides work
public availability works
bulk menu availability is atomic
```

Configure schedule and bulk availability:

```bash
bash scripts/apim/configure-kitchen-schedule-v1-apim.sh
bash scripts/apim/configure-chef-menu-bulk-availability-v1-apim.sh
```

Configure APIM platform baseline:

```bash
bash scripts/apim/configure-apim-platform-baseline.sh
```

The platform script refuses unknown discovery operation policies unless an explicit reviewed override is supplied. It automatically skips `rate-limit-by-key` on unsupported Consumption tier.

Do **not** enable Redis discovery cache unless the production Redis runtime is already approved and configured. The default remains:

```text
CRAVES_DISCOVERY_CACHE_ENABLED=false
```

---

## 9. Phase 6 — Order Service

### 9.1 Pre-migration data check

Flyway V16 backfills `chef_identity_id` from Catalog kitchen ownership. Verify historical order kitchen references are resolvable before deployment.

### 9.2 Deploy

Run:

```text
azure-pipelines-order-service.yml
```

Expected Flyway:

```text
V16__order_history_cursor_indexes.sql
```

After migration run:

```sql
SELECT COUNT(*) AS missing_chef_identity
FROM order_schema.customer_order
WHERE chef_identity_id IS NULL;
```

Required result:

```text
0
```

Verify a newly created order also receives non-null `chef_identity_id`.

### 9.3 Internal Catalog compatibility

The new Order revision must use:

```http
GET  /api/v1/catalog/internal/kitchens/{kitchenId}
POST /api/v1/catalog/internal/menu-items/resolve
X-Craves-Internal-Key: <secret-bound value>
```

Smoke-test checkout **before** activating public Catalog privacy:

```text
cart read/add/update/remove
GET /api/v1/cart/preflight
POST /api/v1/cart/validate
checkout with saved address
private pickup phone/address/coordinates correctly snapshotted into Order
legacy customer order list
legacy chef order list
customer /page history
chef /page history
```

### 9.4 Ready-for-pickup idempotency

Call:

```http
POST /api/v1/chef/orders/{orderId}/ready-for-pickup
```

Twice for the same ready order. Required behavior:

```text
both requests succeed
only one READY_FOR_PICKUP transition/history record exists
```

### 9.5 APIM

Configure:

```bash
bash scripts/apim/configure-order-history-v2-apim.sh
bash scripts/apim/configure-customer-cart-apim.sh
```

Rollback only the new preflight operation if needed:

```bash
bash scripts/apim/rollback-customer-cart-preflight-v1-apim.sh
```

---

## 10. Phase 7 — activate public home-chef privacy

Only after Catalog and Order are both healthy and checkout has been proven through the internal Catalog route, run:

```text
azure-pipelines-catalog-public-privacy-activation.yml
```

Parameter:

```text
action=ACTIVATE
```

The activation script re-runs the Catalog↔Order shared-secret prerequisite and changes only:

```text
CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=true
```

It verifies the image remains unchanged, a new ready revision exists, service health is UP and the flag is true.

Post-activation public validation:

```text
public kitchen detail does not expose identityId
public kitchen detail does not expose chef phone/email
public kitchen detail does not expose private address/landmark/postal code
public kitchen detail does not expose exact kitchen latitude/longitude
nearby discovery keeps distance/area/city but not exact kitchen coordinates
public menu images do not expose blob container/blob object name
checkout still obtains private pickup snapshot internally
```

If any compatibility problem appears, immediately run the same pipeline with:

```text
action=ROLLBACK
```

This sets the privacy flag false without changing the deployed image.

---

## 11. Phase 8 — Subscription Service

Run the existing Subscription deployment pipeline.

Verify:

```text
health/readiness
existing public plan list/detail
purchase/lifecycle operations
occurrence workers/callback paths
standard correlated errors
```

This release deliberately does not add one-time scheduled-order/capacity policy because those product rules are not yet approved.

---

## 12. Phase 9 — Integration Service

Run:

```text
azure-pipelines-integration-service.yml
```

Verify:

```text
health/readiness
existing provider internal/admin routes
provider failures return normalized public error shape
provider diagnostics remain in correlated server logs
existing delivery-provider settings unchanged
```

Then configure read-only chef earnings:

```bash
bash scripts/apim/configure-chef-financial-v1-apim.sh
```

Rollback:

```bash
bash scripts/apim/rollback-chef-financial-v1-apim.sh
```

No earning/settlement/commission calculations are changed by this APIM exposure.

---

## 13. Phase 10 — complete customer journey smoke

Use a controlled production test CUSTOMER identity.

Validate:

```text
1. Authenticate.
2. Search a Telugu dish/home-kitchen term.
3. Search an English term.
4. Apply VEG/NON_VEG/EGG and structured filters.
5. Read kitchen live availability.
6. Add items to cart.
7. GET /api/v1/cart/preflight.
8. Confirm unchanged cart reports ready.
9. Confirm an unavailable test item reports blocking issue.
10. Confirm a changed-price test reports review-only change and cart is not silently mutated.
11. Validate cart.
12. Checkout using saved address.
13. Confirm private chef pickup data is not visible through public Catalog but is preserved in authorized Order fulfillment snapshot.
14. Read legacy order list.
15. Read cursor-paged order history.
16. Read paged notification inbox and unread count.
17. Mark all notifications read.
18. Create support case linked to test order.
19. Receive support public reply/status notification.
20. Confirm correlation ID can be followed through client/APIM/service logs.
```

---

## 14. Phase 11 — complete chef journey smoke

Use a controlled production test CHEF identity.

Validate:

```text
1. Authenticate as CHEF.
2. Read/update weekly kitchen schedule.
3. Pause/unpause accepting orders.
4. Add/remove date override.
5. Bulk mark several dishes unavailable.
6. Bulk mark them available again.
7. Confirm discovery reflects the change after invalidation.
8. Read existing GET /api/v1/chef/orders and confirm chef-scoped results.
9. Read cursor-paged chef order history.
10. Accept a test order.
11. Mark ready-for-pickup.
12. Repeat ready-for-pickup and confirm no duplicate transition.
13. Read /api/v1/chef/earnings.
14. Create CHEF-context support case.
15. Receive support response notification.
16. Confirm public APIs do not reveal the chef's private home/pickup details.
```

---

## 15. Production observability gate

For every affected Container App:

```text
latestRevisionName == latestReadyRevisionName
runningStatus == Running
health == UP
no restart loop
5xx not elevated
p95/p99 not materially regressed
PostgreSQL pool healthy
Flyway completed exactly once
```

Catalog:

```text
search/query-plan performance
privacy flag state
discovery cache disabled unless intentionally enabled
cache hit/miss/error/invalidation metrics if enabled
```

Order:

```text
internal Catalog failure rate
cart preflight latency
checkout success rate
chef_identity_id integrity
order history p95
```

Notification/Support:

```text
notification outbox backlog
support public-reply delivery
unread-count/page latency
```

APIM:

```text
2xx/4xx/5xx
429 count
backend latency
X-Correlation-ID presence
unexpected policy errors
no duplicate API path ownership
```

---

## 16. Rollback order

Use the smallest rollback first.

Gateway-only rollback scripts:

```text
scripts/apim/rollback-order-history-v2-apim.sh
scripts/apim/rollback-notification-inbox-v2-apim.sh
scripts/apim/rollback-kitchen-schedule-v1-apim.sh
scripts/apim/rollback-support-cases-v1-apim.sh
scripts/apim/rollback-chef-financial-v1-apim.sh
scripts/apim/rollback-chef-menu-bulk-availability-v1-apim.sh
scripts/apim/rollback-customer-cart-preflight-v1-apim.sh
scripts/apim/rollback-apim-platform-baseline.sh
```

Public privacy rollback:

```text
azure-pipelines-catalog-public-privacy-activation.yml
action=ROLLBACK
```

Discovery cache rollback:

```text
CRAVES_DISCOVERY_CACHE_ENABLED=false
```

Service revision rollback:

Use the existing runtime-preserving Container App deployment/revision process to return to the previous healthy image. Additive Flyway schema objects normally remain; do not manually drop production schema objects during an incident without a reviewed DB rollback.

---

## 17. Manual interventions

### Required only if prerequisite reports missing configuration

Catalog and Order Container Apps must both have:

```text
CRAVES_INTERNAL_SERVICE_SECRET
```

as a Key Vault-backed secretRef pointing to the same approved secret.

### No new secret values required

Do not create new Firebase, Cashfree, delivery-provider or database credentials for this release.

### No new paid Azure resource required

Redis cache remains disabled by default. APIM scripts only configure the existing APIM service.

### No frontend/store action

No DNS, Apple/Google signing, mobile store or frontend build action is introduced here.

---

## 18. Product-policy gaps intentionally left pending

Engineering must not implement these until approved contracts exist:

```text
ratings/reviews eligibility, moderation and aggregation
one-time scheduled-order window/capacity/cutoff/cancellation policy
chef Need More Time semantics
item substitution consent and price/refund handling
personalized ranking and consent
semantic/AI/voice ordering behavior
refund/cancellation policy changes
pricing/commission/tax/GST changes
delivery radius/fee rules
FSSAI/KYC policy
```

The existing backend now provides the engineering foundation for later frontend/product work without fabricating these rules.

---

## 19. Definition of release completion

This release may be called **deployed and active** only when all of the following are true:

```text
current-head repository CI green
unified Azure DevOps CI green
production prerequisite pipeline green
all seven affected service revisions healthy
required Flyway migrations complete
APIM operations configured and smoke-tested
Catalog privacy activation completed after Order migration
customer journey smoke passed
chef journey smoke passed
observability checked
production evidence captured
```

Until then, use the term **implemented / ready to run pipelines**, not “production deployed”.
