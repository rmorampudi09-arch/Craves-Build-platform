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
- Superseded run `36497` with diagnostic verification run `36498 / 20260910.3`
  on `03803987`. It reports each public endpoint's HTTP status without changing
  application deployments. Dashboard health and page both returned HTTP 200
  on the first attempt; the existing `/admin` page returned HTTP 404.
- Found the existing `craves-admin-origin-group` had no associated route.
  Created and read back `craves-admin-route` (`Enabled`, `Succeeded`) for
  `admin.craves.in`, pattern `/*`, targeting
  that existing origin group with HTTPS redirect, HTTPS origin forwarding,
  caching disabled and `cravesadminsecurityheaders`. The more specific
  `/delivery-intelligence` route retains the dashboard origin. Customer-domain
  routes were inspected and left unchanged.
- Direct browser inspection of the existing admin origin at `/admin` renders
  `Craves administration` and the administrator sign-in guard. Its deployed
  image is `craves/admin-web:36288`, revision `0000007`; no image change was
  needed to restore its missing Front Door association.
- Run `36498` finished with the legacy `/admin` HTTP 404 gate failing. Run
  `36499` added fresh-response probes and was superseded by `36500` on
  `680febdb`, which captures bounded public error diagnostics. All validation
  and authentication expectations remain enforced.
- Final verification run `36500 / 20260910.5`, pinned to `680febdb`, **passed**
  in 48 seconds. It ran in verification-only mode against image `36495` and
  required successful dashboard health/page and existing admin responses,
  signed-out dashboard/API HTTP 401 guards, no-store identity responses,
  Front Door response evidence and HSTS. This complements the build/test and
  deployment stages passed by `36495`; no rebuild was needed for DNS/routing.
- The public dashboard browser reached the mobile OTP sign-in page at
  `admin.craves.in`. A fresh public-origin check also renders the administrator
  sign-in guard. The secure authentication handoff was interrupted before
  completion; authenticated dashboard data was unverified at that checkpoint. No credentials
  or customer data were published.
- Azure DevOps briefly displayed a service-unavailable page during inspection;
  subsequent fresh run-state read-back confirmed `36500` succeeded.

## Authenticated verification — 2026-09-10

- Completed administrator mobile OTP authentication through the secure sign-in
  flow, including the owner-approved CAPTCHA. No authentication values are
  included in this record.
- The authenticated public dashboard renders its live overview successfully.
  The displayed 24-hour window contains zero delivery commands, jobs and
  provider selections; this is an empty activity window, not sample data.
- Historical reference lookup successfully resolves a delivery unit to its
  parent order and renders persisted command, ranking and recovery evidence.
  The inspected historical Borzo command is dead-lettered after five attempts,
  with no provider booking reference or delivery job. Provider selection and a
  quote do not establish a successful production booking or rider assignment.
- Dashboard read-path acceptance is verified. The historical delivery failure
  still requires investigation; no old delivery was rebooked or mutated.

## Full-history filters — 2026-09-10

- Overview now defaults to all stored history, newest first. Presets cover the
  last 24 hours, 7 days and 30 days; custom dates include the entire final IST day.
- Activity supports newest/oldest ordering and 25/50/100 rows per page. Activity
  and attention queues have independent Previous/Next controls, with stable
  timestamp/type/ID ordering. Attention retains oldest-first operational priority.
- Charts aggregate the full selected range by hour, day, week or month; older
  buckets are no longer dropped. Full dates include years for historical rows.
- Metrics retain their original creation/receipt timestamp semantics; activity
  uses its displayed update/event timestamp. Both respect the selected bounds.
- Paging retains date bounds. Automatic refresh pauses on older pages, custom
  dates and oldest-first views; Refresh starts again from page one. Existing
  provider telemetry, recovery details and order investigation are preserved.
- Administrator authorization and no-store responses remain enforced. No
  delivery creation, cancellation, reassignment or provider activation changed.
- Local lint, TypeScript, five frontend tests and production build passed.
  Added backend authorization and date/pagination validation tests.
- Production run `36501 / 20260910.6`, source `6774d102`, passed frontend,
  Integration Service, authorization, migration-history and data-boundary
  validation. Both images built and both container deployments passed, followed
  by APIM, Front Door and public production smoke checks.
- The owner tested the deployed dashboard and confirmed it is working on
  2026-09-10. This is owner-confirmed live acceptance; the agent's previous
  administrator session had expired before a separate authenticated retest.
  Further sign-in was unnecessary after the owner's successful check.

## Figma

Design file: `Craves — Delivery Intelligence Admin Dashboard`.

The implementation follows the overview and order-investigation structure prepared in that design file and the existing Craves brand token system.
