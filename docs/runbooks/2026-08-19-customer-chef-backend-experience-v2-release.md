# Craves Customer & Chef Backend Experience v2 — Production Release Runbook

Date: 2026-08-19
Repository: `rmorampudi09-arch/Craves-Build-platform`
Release branch: `chatgpt/backend-customer-chef-journey-20260819`
Scope: Backend, PostgreSQL/Flyway, APIM and CI only. Customer/chef web and mobile frontend are excluded.

## Release contents

This release contains four deployable service slices plus gateway configuration:

1. Catalog Service
   - Discovery Query v2
   - Kitchen Schedule & Live Availability v1
2. Notification Service
   - In-App Notification Inbox v2
3. User-Chef Service
   - Support Cases v1
4. Order Service
   - Customer & Chef Order History v2

Existing favorites and reorder capabilities were reviewed and retained rather than duplicated.

## Product rules intentionally unchanged

Do not use this release to introduce or infer:

```text
ratings/review eligibility or moderation
pricing or commission changes
delivery radius or fee rules
FSSAI/KYC policy changes
GST/tax changes
cancellation/refund policy changes
delivery-provider priority changes
automatic support compensation
```

## Phase 0 — unified pre-production CI gate

Create/register an Azure DevOps pipeline whose pipeline name exactly matches its YAML file name:

```text
azure-pipelines-customer-chef-backend-experience-v2-ci.yml
```

Run it against the release branch.

Required result: every job green.

The gate performs:

```text
Catalog Maven clean verify on Java 21
Notification Maven clean verify on Java 21
Order Maven clean verify on Java 21
User-Chef Maven clean verify on Java 21
backend-only diff guard
Flyway version collision detection
new APIM Bash syntax checks
new APIM XML parse checks
Authorization/no-store policy assertions
```

Do not deploy any service until this gate passes.

## Phase 1 — Catalog Service

Run existing deployment pipeline:

```text
azure-pipelines-catalog-service.yml
```

The existing pipeline/service connection is expected to use:

```text
AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection
```

Expected Flyway additions:

```text
V6__discovery_search_filter_indexes.sql
V7__kitchen_schedule_availability.sql
```

After deploy verify:

```text
latest revision == latest ready revision
running status == Running
/actuator/health == UP
legacy unfiltered /api/v1/discovery/kitchens still works
legacy unfiltered /api/v1/discovery/menu-items still works
new filtered query works
existing kitchen without schedule still evaluates schedule-open
```

Then configure schedule APIM:

```bash
bash scripts/apim/configure-kitchen-schedule-v1-apim.sh
```

Smoke test:

```text
chef schedule GET requires valid Bearer token
chef schedule PUT requires CHEF role
weekly schedule can be written/read
date override can be written/read/deleted
public discovery availability endpoint is no-store
inactive kitchen returns availableNow=false
```

Rollback gateway only if needed:

```bash
bash scripts/apim/rollback-kitchen-schedule-v1-apim.sh
```

Discovery search/filtering uses the existing discovery operations; no new APIM operation is required for its optional query parameters.

## Phase 2 — Notification Service

Run:

```text
azure-pipelines-notification-service.yml
```

Expected Flyway addition:

```text
V5__in_app_notification_inbox_indexes.sql
```

Verify health/readiness, then configure:

```bash
bash scripts/apim/configure-notification-inbox-v2-apim.sh
```

Smoke test:

```text
GET /api/v1/notifications/in-app remains backward compatible
GET /api/v1/notifications/in-app/page returns deterministic page
nextCursor loads next page
unreadOnly=true excludes read notices
unread-count matches DB state
read-all is idempotent
responses are no-store
```

Rollback gateway only:

```bash
bash scripts/apim/rollback-notification-inbox-v2-apim.sh
```

## Phase 3 — User-Chef Service / Support Cases

Run:

```text
azure-pipelines-user-chef-service.yml
```

Expected Flyway addition:

```text
V7__support_case_domain.sql
```

Important migration dependency:

```text
V2 notification_outbox must already exist
```

V7 reuses it for durable support reply/status notifications.

After deploy verify:

```text
health/readiness UP
CUSTOMER can create and read only own case
CHEF can create and read only own case
other identity receives not-found/denied behavior
SUPPORT_ADMIN can use admin case workflow
CUSTOMER cannot use admin workflow
internal notes never appear in requester view
support agent UUID/assignment UUID not exposed to requester
public support reply creates one notification_outbox row
internal support note creates no requester notification_outbox row
admin status change creates notification_outbox row
```

Configure APIM:

```bash
bash scripts/apim/configure-support-cases-v1-apim.sh
```

Rollback gateway only:

```bash
bash scripts/apim/rollback-support-cases-v1-apim.sh
```

## Phase 4 — Order Service / History v2

Run:

```text
azure-pipelines-order-service.yml
```

Expected Flyway addition:

```text
V16__order_history_cursor_indexes.sql
```

V16 performs:

```text
adds customer_order.chef_identity_id
backfills historical chef ownership from Catalog kitchen ownership
installs new-order ownership snapshot trigger
adds customer/chef cursor indexes
```

Pre-deploy database check:

```text
catalog_schema.kitchen_profile exists and has ownership for every historical customer_order.kitchen_id
```

Post-migration check:

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

Then configure:

```bash
bash scripts/apim/configure-order-history-v2-apim.sh
```

Smoke test:

```text
customer /api/v1/orders remains unchanged
chef /api/v1/chef/orders remains unchanged
customer /api/v1/orders/page scopes only caller orders
chef /api/v1/chef/orders/page scopes only caller chef identity
status filter works
cursor page 1/page 2 deterministic
new order inserted between pages does not duplicate/skip older rows
order items included from one batched page query
```

Rollback gateway only:

```bash
bash scripts/apim/rollback-order-history-v2-apim.sh
```

## Phase 5 — full journey smoke test

### Customer journey

Test as a real CUSTOMER token:

```text
location-based discovery
Telugu search term
English search term
VEG/NON_VEG/EGG filter
category/price/preparation/spice filters
kitchen availability read
favorite existing dish
reorder existing historical order
paged order history
notification inbox page/unread count/read-all
create support case linked to an order
receive durable in-app support reply/status notification
```

Do not modify frontend in this test. Use API/APIM clients or the existing test dashboard where it already supports the route.

### Chef journey

Test as a real CHEF token:

```text
read/replace weekly schedule
pause/unpause using acceptingOrders/pausedUntil
set closed date override
set special-hours override
confirm public availability decision
paged chef order history
create CHEF-context support case
receive support reply notification
```

## Phase 6 — production observability checks

For each affected Container App verify:

```text
latest revision Ready/Healthy
no restart loop
HTTP 5xx not elevated
PostgreSQL connection pool healthy
Flyway completed exactly once
p95 latency not materially regressed
no sustained DB CPU/IO spike from new indexes
notification outbox backlog not growing unexpectedly
```

For APIM verify:

```text
new operations resolve to intended backend FQDN
Bearer guard present on authenticated operations
no-store headers present on user-specific/stateful reads
no duplicate API path ownership
existing APIs/operations remain present
```

## Rollback strategy

The new APIs are additive. Existing endpoints are preserved.

First rollback option is gateway exposure only using the provided operation-only rollback scripts. This removes new public APIM operations while retaining legacy traffic.

If a service revision must be rolled back, use the existing deployment pipeline/runtime-preserving rollback behavior and restore the previous healthy Container App revision/image. Database migrations are additive; do not manually delete schema objects during an incident unless a separate reviewed DB rollback is approved.

## Manual intervention required

This ChatGPT session can commit GitHub changes but cannot execute Azure DevOps or Azure Portal actions. The following are therefore manual/external execution steps:

```text
register/run azure-pipelines-customer-chef-backend-experience-v2-ci.yml
run Catalog deployment pipeline
run Notification deployment pipeline
run User-Chef deployment pipeline
run Order deployment pipeline
execute APIM configuration scripts in authenticated Azure CLI pipeline/session
perform post-deploy API smoke tests with real test JWTs
```

No new secrets or paid Azure resources are required by this release.
