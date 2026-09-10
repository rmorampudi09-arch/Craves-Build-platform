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

## Deployment prerequisites

The dashboard Container App needs a system-assigned managed identity with
registry-scoped `AcrPull`. An infrastructure owner provisions this permission;
the Contributor deployment connection verifies and reuses it without attempting
RBAC writes. This assignment was confirmed in Azure Portal on 2026-09-10.

Run the Azure DevOps pipeline from `azure-pipelines-delivery-intelligence-admin.yml`
on the reviewed repository branch with `confirmProductionDeploy=true`, then
allow the pipeline smoke tests to finish.

After an external DNS/certificate correction, `verificationOnly=true` runs the
same public smoke checks without rebuilding images, changing runtime revisions,
writing APIM policies or updating Front Door. Its result proves those smoke
checks only; reference the original deployment run separately for build/tests
and image provenance.

## Resumed deployment — 2026-09-10

- Preserved the owner's commit `78d4d0e7`, including the read-only registry
  permission prerequisite check.
- Run `36492` passed frontend/backend validation, immutable image build and
  Integration Service rollout. APIM operation/policy read-back completed, but
  the final gateway authentication probe timed out (curl exit 28). Dashboard
  rollout, Front Door routing and public smoke tests were skipped.
- Published `39ac1671` to add bounded retries and visible connection errors to
  that probe. HTTP 401 remains mandatory; a timeout or unexpected response does
  not pass the deployment gate.
- Run `36495 / 20260910.1` passed application/backend validation, both image
  builds, Integration Service rollout, APIM registration, dashboard rollout
  and Front Door route publication. Public smoke tests failed because
  `admin.craves.in` could not be resolved. Azure also reported the admin
  custom-domain validation as timed out and its certificate as needing domain
  validation. This is a DNS/domain-validation blocker, not a passed public
  launch.
- The owner confirmed that the domain's authoritative nameservers are Azure
  DNS. Admin CNAME and validation TXT changes belong in that Azure zone.
- Added and read back `admin` CNAME pointing to the existing Front Door endpoint
  and `_dnsauth.admin` TXT with the regenerated Azure verification value in
  the `craves.in` Azure DNS zone, both with a 300-second TTL. Azure subsequently
  reported domain validation `Approved` and its managed certificate `Deployed`
  (181 days to expiry). Public HTTPS propagation is checked independently.
- Azure Container Apps confirms dashboard revision `0000001` uses
  `craves/delivery-intelligence-admin:36495` with managed-identity registry
  authentication.
- Published verification-only pipeline support in `0601560c`. Run `36497 /
  20260910.2` uses that mode to verify the existing deployment after DNS changes.

## Figma

Design file: `Craves — Delivery Intelligence Admin Dashboard`.

The implementation follows the overview and order-investigation structure prepared in that design file and the existing Craves brand token system.
