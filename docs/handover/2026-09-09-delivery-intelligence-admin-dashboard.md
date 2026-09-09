# Craves Delivery Intelligence Admin Dashboard — Handover

Date: 2026-09-09

## Scope delivered

A separate read-only Delivery Intelligence administration surface was added without replacing the existing Craves admin application. It is designed to run as a separate Azure Container App while sharing the existing `admin.craves.in` hostname and the existing Craves admin authentication session.

## Primary paths

- `apps/delivery-intelligence-admin/` — Next.js 16 / TypeScript / Tailwind dashboard
- `services/integration-service/src/main/java/in/craves/integration/admin/deliveryintelligence/` — Spring Boot read API
- `services/integration-service/src/main/resources/db/migration/V117__delivery_intelligence_admin_read_indexes.sql` — startup-safe migration marker; V116 is already occupied in production by the Shadowfax Hyperlocal contract migration
- `scripts/apim/configure-delivery-intelligence-admin-apim.sh` — controlled APIM operation registration
- `azure-pipelines-delivery-intelligence-admin.yml` — single validate/build/deploy/smoke pipeline

## Runtime flow

1. Administrator opens `https://admin.craves.in/delivery-intelligence`.
2. Azure Front Door sends only the `/delivery-intelligence` path family to the dedicated Delivery Intelligence Container App.
3. Next.js verifies the existing Craves admin session using the HTTP-only access cookie.
4. Browser calls only same-origin Next.js BFF endpoints.
5. BFF forwards the bearer token server-to-server to APIM.
6. APIM routes the two Delivery Intelligence operations to Integration Service.
7. Spring Security enforces the existing `/api/v1/admin/**` admin-role boundary.
8. The repository performs bounded read-only SQL queries over existing `delivery_schema` data.
9. Order investigations append an entry to the existing admin investigation audit table.

## Data shown

The dashboard derives status only from persisted Craves delivery evidence: `delivery_command`, `delivery_assignment`, `delivery_assignment_candidate`, `delivery_job`, `delivery_event`, and `delivery_webhook_inbox`. Provider-selection charts describe observed selections; they are not production-readiness claims.

## Deliberate exclusions

- no provider activation/deactivation
- no retry/reassign/cancel/dispatch controls
- no raw webhook payload display
- no webhook signatures
- no provider credentials or access tokens
- no tracking URL disclosure
- no pricing, commission, delivery-radius, or compliance rule changes

## Azure resources reused

- resource group `rg-craves-prodlow-centralindia`
- ACR `cravesprodlowacr82121`
- Integration Service Container App `ca-craves-integration-service-pr`
- existing admin Container App only as the source for the Container Apps environment
- APIM `apim-craves-prodlow-l3ing6`
- Front Door profile `afd-craves-prodlow`
- admin hostname `admin.craves.in`
- Azure DevOps service connection `Craves-Dev-Service-Connection`

## New billable resource

The production pipeline can create `ca-craves-delivery-intel-prodlow` if it does not exist. The run is gated by the explicit `confirmProductionDeploy=true` pipeline parameter.

## V117 startup-safety correction

The initial deployment placed `CREATE INDEX CONCURRENTLY` statements in Flyway
V117. PostgreSQL may wait for existing transactions during a concurrent build,
so running those statements inside Container App startup exhausted the revision
activation window even though application and migration-history validation had
passed. V117 is now a fast marker (`ONLINE_INDEX_BUILD_DEFERRED`). The dashboard's
bounded queries remain functional on the current schema, while optional indexes
are reserved for a separately monitored database-maintenance operation.

## Manual action after merge

No Azure Portal creation is required. Create/run the Azure DevOps pipeline from `azure-pipelines-delivery-intelligence-admin.yml` on the approved repository branch with `confirmProductionDeploy=true`, then allow the pipeline smoke tests to finish.

## Figma

Design file: `Craves — Delivery Intelligence Admin Dashboard`.

The implementation follows the overview and order-investigation structure prepared in that design file and the existing Craves brand token system.
