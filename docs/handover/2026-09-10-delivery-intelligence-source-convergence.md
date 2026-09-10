# Craves Delivery Intelligence — Canonical Source Convergence Handover

Date: 2026-09-10  
Status: **source convergence only; production runtime unchanged**

## Purpose

This change brings the already-built Delivery Intelligence administration surface out of the long-diverged backend consolidation branch and into a clean branch based on the current canonical `main` history.

The objective is to remove a serious operational risk: a production-facing administration surface must not exist only on an old, conflicted feature branch. Canonical source needs to contain the application, its bounded read API, the append-only database indexes and the controlled APIM/Front Door configuration scripts before future releases can be reviewed safely.

This is not a new delivery product, provider activation or delivery-routing change. It does not alter Borzo, Shadowfax, Delhivery, Shiprocket, payment, refund, pricing, commissions, delivery radius, tax or compliance behavior.

## Clean source strategy

The source branch is created directly from current `main`:

```text
feature/delivery-intelligence-source-convergence-20260910
```

Only the dashboard-specific assets are copied from:

```text
feature/backend-open-pr-consolidation-20260905
```

The 262-file backend consolidation PR is not merged wholesale. That PR is both long-diverged and conflicted, and mixing all of its unrelated auth, catalog, order, notification, payment, refund, support and provider changes into this dashboard recovery would create unacceptable deployment and migration risk.

## Files converged

### Next.js administration application

```text
apps/delivery-intelligence-admin/
```

The app is a separate Next.js/TypeScript administration surface. It uses the existing Craves admin session, calls only same-origin BFF routes from the browser and forwards the bearer token server-to-server to APIM.

The surface contains:

- a bounded delivery overview;
- observed provider-selection share;
- delivery activity and recovery health;
- an attention queue;
- exact order/delivery-reference investigation;
- command, assignment, candidate, job, event and webhook-processing evidence;
- no provider activation, retry, dispatch, cancellation or state mutation controls.

### Integration Service read API

```text
services/integration-service/src/main/java/in/craves/integration/admin/deliveryintelligence/
```

The API exposes only:

```text
GET /api/v1/admin/operations/delivery-intelligence/overview
GET /api/v1/admin/operations/delivery-intelligence/orders/{reference}
```

The implementation performs bounded SQL reads over existing delivery evidence. Order investigations append an audit record, but they do not mutate order, payment, refund, provider or delivery state.

### Narrow authorization amendment

```text
services/integration-service/src/main/java/in/craves/integration/config/WebSecurityConfiguration.java
```

The current `main` file is preserved and receives only one more-specific request matcher for the Delivery Intelligence path. The new matcher permits the established Craves administrator role set:

```text
ADMIN
PLATFORM_ADMIN
SUPPORT_ADMIN
PAYMENTS_ADMIN
OPERATIONS_ADMIN
AUDIT_ADMIN
```

The generic `/api/v1/admin/**` policy remains unchanged for all other endpoints.

## Migration history preservation

Two exact migrations are included.

### V115 — Razorpay webhook delivery guard

```text
services/integration-service/src/main/resources/db/migration/
V115__razorpay_webhook_delivery_guard.sql
```

This migration is not a dashboard feature. It is included because the previously deployed Delivery Intelligence branch placed V115 immediately before V116. If production has already applied V115, removing it from canonical source would cause a future Flyway validation failure because an applied migration would no longer be resolved locally.

The migration is copied byte-for-byte and its SHA-256 checksum is pinned by the Integration Flyway verification script. No Razorpay configuration, credential, live transaction or webhook activation is changed by this source convergence.

### V116 — Delivery Intelligence read indexes

```text
services/integration-service/src/main/resources/db/migration/
V116__delivery_intelligence_admin_read_indexes.sql
V116__delivery_intelligence_admin_read_indexes.sql.conf
```

V116 adds only read-path indexes for existing delivery tables. It uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` and the adjacent Flyway configuration requires:

```text
executeInTransaction=false
```

This avoids placing the concurrent index statements inside a transaction and reduces blocking on the live delivery write path.

## Controlled gateway and route source

The following scripts are preserved as source but are not executed by this change:

```text
scripts/apim/configure-delivery-intelligence-admin-apim.sh
scripts/frontdoor/configure-delivery-intelligence-admin-route.sh
```

The APIM script adds only the two GET operations under the existing admin operations API and requires:

```text
CONFIRM_APIM_WRITE=true
```

The Front Door script maps only:

```text
/delivery-intelligence
/delivery-intelligence/*
```

on the existing `admin.craves.in` hostname and requires:

```text
CONFIRM_FRONTDOOR_WRITE=true
```

Neither script runs in the source-convergence workflow.

## Deliberately excluded deployment pipeline

The old branch contains:

```text
azure-pipelines-delivery-intelligence-admin.yml
```

That pipeline is not copied into this clean source slice because it builds and deploys a complete Integration Service image from the long-diverged consolidation branch, applies Flyway, writes APIM, can create a separately billed Container App and updates Front Door.

Running that old pipeline before the remaining Integration Service source drift is reconciled could replace currently working production code with a source combination that has not been reviewed against current `main`.

A clean runtime deployment pipeline must be produced only after the canonical Integration Service source is proven to match the currently deployed production revision. Until then, this module is source-only.

## Automated validation

Workflow:

```text
.github/workflows/delivery-intelligence-source-convergence-ci.yml
```

The workflow performs:

1. exact candidate checkout;
2. strict path-scope comparison against current `main`;
3. deterministic dashboard lockfile generation when absent;
4. locked dashboard dependency installation;
5. ESLint with zero warnings;
6. strict TypeScript validation;
7. dashboard tests;
8. production Next.js build;
9. Java 21 Integration Service `mvn clean verify`;
10. Flyway uniqueness and exact migration checksum verification;
11. shell syntax validation for APIM and Front Door scripts;
12. read-only endpoint checks;
13. authorization matcher checks;
14. frontend scans blocking raw payload, signature, tracking URL, provider metadata, tokens and secrets;
15. browser-storage and sensitive debug-log checks;
16. build/lockfile evidence artifact upload.

After a successful branch push, a separate tightly scoped job persists only the generated dashboard `package-lock.json`. This eliminates a manual lockfile-copy step. The job has write permission only on the exact source-convergence branch and only after all validation succeeds.

## Privacy and security boundary

The dashboard may display persisted operational facts required to understand delivery behavior, but it must not expose:

- raw provider request or response payloads;
- webhook signatures;
- access tokens or credentials;
- provider tracking URLs;
- full customer address data;
- payment secrets;
- unbounded event history;
- controls that retry, reassign, cancel or dispatch a delivery.

The browser uses no `localStorage` or `sessionStorage` for the admin session. The server response remains `no-store`.

## Runtime status boundary

This source convergence does not assert or modify the current Azure runtime. In particular, it does not:

- build or push a Container image;
- deploy Integration Service;
- create or update a Container App;
- run Flyway against Azure PostgreSQL;
- write APIM;
- write Front Door;
- change DNS or TLS;
- read or change a secret;
- call a delivery provider;
- create a delivery;
- alter the working Borzo Standard production path.

The owner has separately reported that the dashboard is currently working. That observation remains runtime evidence, while this PR establishes canonical source ownership.

## Required evidence before any future dashboard deployment

1. Read the currently deployed Integration Service image and revision from Azure.
2. map that image to its exact Git commit/source branch;
3. compare all Integration Service runtime files against canonical `main`;
4. preserve every applied Flyway migration and checksum;
5. run the complete Integration Service and backend completion CI on the reconciled candidate;
6. run a read-only Azure preflight;
7. build immutable images from the exact reviewed commit;
8. deploy Integration Service without changing delivery/payment/provider flags;
9. verify latest revision equals ready revision and `/actuator/health` succeeds;
10. verify the two APIM operations return 401 without a token and succeed for an authorized admin;
11. verify the existing admin surface still works;
12. verify the Delivery Intelligence dashboard and order investigation against known non-sensitive test evidence;
13. preserve the previous images and rollback route before any traffic change.

## Manual work remaining for this module

No manual action is required to create or validate the source PR. The GitHub workflow performs source validation and lockfile persistence.

A human is required only before a future production deployment to:

- review the Azure runtime/source parity report;
- approve any billable Container App creation if the dedicated app does not already exist;
- authorize the explicit APIM and Front Door writes;
- perform an authenticated admin smoke test without sharing tokens in chat;
- accept the final rollback evidence.

## Azure service connection

The established Azure DevOps service connection remains:

```text
Craves-Dev-Service-Connection
```

No new service connection is needed and no credential value belongs in source control or chat.

## Rollback

Before merge, close the source PR; production is unaffected.

After a source-only merge, revert the merge commit. No Azure or provider rollback is necessary because this convergence performs no runtime write.

After a future deployment, use the exact previous Integration Service and dashboard image references, and remove only the named APIM/Front Door operations or route when rollback evidence requires it. Do not delete shared APIs, domains or the existing admin application.
