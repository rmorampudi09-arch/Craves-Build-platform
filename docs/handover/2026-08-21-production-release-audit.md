# Craves production release audit and deployment handover — 2026-08-21

## Outcome

The eligible production queue was completed without deploying draft feature branches or duplicating already-proven service/APIM runs. Corrective PRs #272 and #277 were reconciled into `main`. The automatic Admin Dashboard deployment completed successfully in Azure run 36166. A deterministic defect in the read-only production-stabilization gate was corrected in PR #280, proven on its branch in run 36168, merged, and proven again from `main` in run 36169.

This is not a claim that every source-only Craves feature is production ready. Backend Experience v2, Razorpay production-scale/auto-refund, and the Favorites/Saved/Order Like Last Time stack remain unmerged. Authenticated role-based smoke tests, vendor prerequisites, and the 48-hour consecutive stabilization window also remain open.

## Starting state

- Repository: `rmorampudi09-arch/Craves-Build-platform`
- Starting `main`: `677eefa317d80b25526b14ef8dbe7195829329ed`
- `main` after corrective PRs #272 and #277: `483ac7854f9f13f8a62e7cedb49b60c8271d0dab`
- Runtime-relevant `main` after stabilization fix PR #280: `66d3aecd04d10c9380c809607d139a1944d5fccd`
- Azure DevOps project actually used: `ravitejamorampudi7777/Craves`
- Production resource group: `rg-craves-prodlow-centralindia`
- Existing service connection: `Craves-Dev-Service-Connection`

The repository contained 215 `azure-pipelines*.yml` definitions. They were not treated as a deployment checklist; eligibility was determined by changed paths, PR state, successful-run provenance, and live runtime evidence.

## Git and pull-request reconciliation

### Merged during this audit

- PR #272, `fix(integration): restore production Flyway history and constructor wiring`
  - Proven head: `4f694c81a614b778f5f0270ed74a908d09145296`
  - Merge commit: `a9214e4076b8eb76e5676205357d924076afe315`
  - No reviews, unresolved review threads, or failing GitHub checks were present.
  - Exact affected Integration source was already proven by Azure run 36158.
- PR #277, `fix(flyway): restore immutable service migration versions`
  - Proven head: `be26eb1f30870ecdf1daf595e638ab9e10347739`
  - Merge commit: `483ac7854f9f13f8a62e7cedb49b60c8271d0dab`
  - The draft was marked ready after confirming mergeability and Azure evidence.
  - Exact affected User/Chef, Order, and Admin Directory source was already proven by runs 36150, 36151, and 36160.
- PR #280, `fix(stabilization): validate the Front Door production edge`
  - Proven head: `a5c79c886fb59b692e85667f3ce64324727b7660`
  - Merge commit: `66d3aecd04d10c9380c809607d139a1944d5fccd`
  - Branch verification: Azure run 36168 succeeded.
  - Main verification: Azure run 36169 succeeded.

### Open production blockers

- PR #258, Backend Experience v2 — draft, head `b28d8903...`; production activation deferred.
- PR #260, Razorpay production-scale/auto-refund — draft, head `eca39515...`; activation prerequisites not satisfied.
- Favorites stack — all draft/source-only:
  - #265 P0 reliability/APIM, head `5d29d866...`
  - #267 P1A mobile, head `2dff3fba...`
  - #270 P1B catalog, head `89107182...`
  - #271 P1B mobile, head `e9953e4c...`
  - #273 P2 home relationships, head `c846ba95...`
  - #274 P2 catalog feed, head `4bea762d...`
  - #275 P2 mobile, head `921ad268...`
  - #276 P3 repeat order, head `e39010b8...`

PRs #261 and #262 were verified as merged before the release decision.

## Dependency and deduplication decisions

The seven previously green Customer 360 service/APIM pipelines were preserved. PRs #272 and #277 did not introduce source different from the exact branch heads already deployed: after merge, relevant service and APIM paths were byte-identical to the proven heads. Rebuilding those same paths under a new merge SHA would only create duplicate immutable images and revisions.

Therefore:

- User/Chef, Order, Integration, and Admin Directory were not rerun after merge.
- Chef Application APIM, Operational Investigations APIM, and APIM status verification were not rerun because their relevant inputs did not change.
- The Admin Dashboard automatic PR validation was allowed to finish; no duplicate manual run was created.
- The automatic Admin Dashboard `main` run was approved at its environment gate and monitored to success.
- Draft/backend/payment/favorites activations were not queued.
- Vendor integrations were not activated without contracts, credentials, and explicit readiness evidence.

## Pipeline audit and final action table

| # | Workstream | Pipeline | YAML | Source SHA | Run ID | Result | Runtime verified | Action |
|---|---|---|---|---|---|---|---|---|
| 1 | User/Chef service | User/Chef Service | `/azure-pipelines-user-chef-service.yml` | `be26eb1f...` | 36150 | Succeeded | Revision `0000035`, image `36150`, running, 100% traffic | DONE |
| 2 | Order service | Order Service | `/azure-pipelines-order-service.yml` | `be26eb1f...` | 36151 | Succeeded | Revision `0000063`, image `36151`, running, 100% traffic | DONE |
| 3 | Integration service | Integration Service | `/azure-pipelines-integration-service.yml` | `4f694c81...` | 36158 | Succeeded | Revision `0000103`, image `36158`, running, 100% traffic | DONE |
| 4 | Admin directory APIM | Admin Directory APIM | `/azure-pipelines-admin-directory-apim.yml` | `be26eb1f...` | 36160 | Succeeded | APIM mutation and verification succeeded | DONE |
| 5 | Chef application APIM | Chef Application APIM | `/azure-pipelines-chef-application-apim.yml` | `677eefa3...` | 36154 | Succeeded | Guarded APIM write succeeded | DONE |
| 6 | Operational investigations APIM | Admin Operational Investigations APIM | `/azure-pipelines-admin-operational-investigations-apim.yml` | `677eefa3...` | 36161 | Succeeded | Guarded APIM write succeeded | DONE |
| 7 | APIM status | Operational Investigations APIM Status | `/azure-pipelines-admin-operational-investigations-apim-status.yml` | `677eefa3...` | 36162 | Succeeded | Read-only APIM verification succeeded | DONE |
| 8 | Admin Dashboard PR validation | Admin Dashboard | `/azure-pipelines-admin-dashboard.yml` | `9519cb23...` | 36165 | Succeeded | Validation succeeded; deploy stages correctly skipped for PR | NOT REQUIRED |
| 9 | Admin Dashboard production | Admin Dashboard | `/azure-pipelines-admin-dashboard.yml` | `483ac785...` | 36166 | Succeeded | Revision `0000003`, image `36166`, 100% traffic; scale-to-zero state normal | RAN NOW |
| 10 | Production edge verification | Production Stabilization | `/azure-pipelines-production-stabilization.yml` | `66d3aecd...` | 36169 | Succeeded | Origin, Front Door, DNS, TLS, APIM, certificate, rollback target verified | RAN NOW |
| 11 | Backend Experience v2 | Backend production activation set | PR #258 YAML set | `b28d8903...` | — | Not run | No production runtime expected | BLOCKED — SOURCE NOT MERGED |
| 12 | Razorpay scale/refund | Razorpay production activation set | PR #260 YAML set | `eca39515...` | — | Not run | Existing approved payment scope left unchanged | BLOCKED — SOURCE NOT MERGED |
| 13 | Favorites/Saved/Repeat Order | Favorites P0–P3 activation set | PRs #265–#276 YAML set | Multiple draft heads | — | Not run | No production runtime expected | BLOCKED — SOURCE NOT MERGED |
| 14 | Additional delivery providers | Shadowfax/Porter/Delhivery activation | Provider-specific YAMLs | Current `main` | — | Not run | Fail-closed behavior preserved | BLOCKED — MANUAL PREREQUISITE |
| 15 | Privileged functional smoke | Authenticated admin/customer/chef smoke | Manual | `66d3aecd...` | — | Not run | Requires authorized test identities and controlled data mutations | BLOCKED — MANUAL PREREQUISITE |

## Runs executed or completed during this session

- 36165 — automatic Admin Dashboard pull-request validation; succeeded; build/deploy correctly skipped.
- 36166 — automatic Admin Dashboard main run; validation, immutable image build, approved environment gate, and deployment succeeded.
- 36167 — first read-only stabilization correction test; failed with two authoritative-DNS assertions. It proved the Front Door, live HTTP/TLS, and corrected APIM checks while exposing the hardcoded former nameserver.
- 36168 — corrected stabilization branch run; succeeded on `a5c79c886fb59b692e85667f3ce64324727b7660`.
- 36169 — final corrected stabilization run from `main`; succeeded on `66d3aecd04d10c9380c809607d139a1944d5fccd`.

## Superseded failures

These red runs remain audit history and were not blindly rerun:

- User/Chef 36139 → superseded by 36150.
- Order 36140 → superseded by 36151.
- Integration 36141 → superseded by 36158.
- Admin Directory 36143/36153/36159 → superseded by 36160.
- Stabilization 36164 → root cause fixed by PR #280; superseded by 36168 and final main run 36169.
- Stabilization correction test 36167 → superseded by 36168/36169.

## Stabilization failure root cause and fix

The old gate assumed `craves.in` and `www.craves.in` were served directly from the Container Apps environment static IP `4.187.245.188`. Production is now served through Azure Front Door Premium, so public anycast addresses such as `13.107.*` or `150.171.*` are expected and must not be compared to the origin IP. It also expected `api.craves.in` to self-CNAME and hardcoded the former GoDaddy nameserver.

PR #280 changed only the read-only verification source:

- validates the active Front Door endpoint and its provisioning state;
- validates both Front Door custom domains are provisioned and approved;
- discovers the currently delegated authoritative nameserver;
- confirms `www` points to the configured Front Door endpoint;
- confirms live customer responses contain the Azure Front Door reference header;
- compares the APIM CNAME to `apim-craves-prodlow-l3ing6.azure-api.net`;
- retains Container App origin, certificate, domain ownership, ACME delegation, TLS, APIM, and rollback checks.

No DNS, certificate, Front Door, APIM, or Container App configuration was modified by the stabilization pipeline.

## Final runtime evidence

| Container App | Immutable image | Active revision | Runtime state |
|---|---|---|---|
| `ca-craves-user-chef-service-prod` | `cravesprodlowacr82121.azurecr.io/craves/user-chef-service:36150` | `ca-craves-user-chef-service-prod--0000035` | Running, one replica, 100% traffic |
| `ca-craves-order-service-prodlow` | `cravesprodlowacr82121.azurecr.io/craves/order-service:36151` | `ca-craves-order-service-prodlow--0000063` | Running, one replica, 100% traffic |
| `ca-craves-integration-service-pr` | `cravesprodlowacr82121.azurecr.io/craves/integration-service:36158` | `ca-craves-integration-service-pr--0000103` | Running, one replica, 100% traffic |
| `ca-craves-admin-web-prodlow` | `cravesprodlowacr82121.azurecr.io/craves/admin-web:36166` | `ca-craves-admin-web-prodlow--0000003` | Active, 100% traffic, currently scaled to zero |

Integration run 36158 explicitly recorded runtime-template, configuration, identity, and secret-metadata hashes and verified 11 active Key Vault-backed secret references. The service deployment pipelines deliberately preserved existing runtime configuration rather than replacing it.

Successful startup/readiness of the corrected service revisions is evidence that Flyway accepted the deployed migration history. A separate privileged database query of `flyway_schema_history` was not performed during this browser audit.

## APIM and edge verification evidence

- Admin Directory APIM run 36160 succeeded with its guarded confirmation parameter.
- Chef Application APIM run 36154 succeeded with its guarded confirmation parameter.
- Operational Investigations APIM run 36161 succeeded with its guarded confirmation parameter.
- APIM Status run 36162 succeeded as read-only verification.
- Stabilization run 36169 confirmed:
  - `api.craves.in` CNAME is `apim-craves-prodlow-l3ing6.azure-api.net`;
  - APIM TLS verification result is zero;
  - APIM root returns acceptable HTTP 404;
  - `craves.in` and `www.craves.in` return HTTP 200 with valid TLS through Front Door;
  - Front Door profile `afd-craves-prodlow` is Premium and active;
  - endpoint `craves-prodlow-4f897b61-d4e6bvhscdbzbgbv.z01.azurefd.net` is enabled and provisioned;
  - both customer custom domains are provisioned and validation-approved.

## Rollback evidence

- Previous service revisions were preserved by the deployments; no rollback pipeline was invoked.
- The legacy Static Web App target `lemon-bay-06f924610.7.azurestaticapps.net` returned valid TLS and an acceptable reachable HTTP response in stabilization run 36169.
- The current Container Apps origin remains healthy behind Front Door.
- DNS was not modified during this audit.

## Manual dependencies and current readiness gaps

1. Complete authenticated, non-destructive functional smoke with authorized test accounts:
   - Admin login, Control Center, customer/Chef lookup, Customer 360, addresses, orders, payments, refunds, evidence, KYC/document review, non-ADMIN denial, and audit/correlation IDs.
   - Customer/Chef authentication, discovery, menu/detail, checkout preflight without live money, order histories, notifications, and support paths.
2. Confirm dead-letter/backlog telemetry directly in the authorized monitoring workspace; deployment health alone does not prove absence of a backlog regression.
3. Accumulate eight consecutive six-hour green stabilization runs (approximately 48 hours) before retiring the legacy rollback target.
4. Complete security/performance/observability release gates associated with Backend Experience v2 after PR #258 is ready and merged.
5. Satisfy Razorpay production-scale and auto-refund prerequisites before merging/activating PR #260; do not perform a real payment/refund merely to produce a green check.
6. Merge the Favorites dependency stack in order and complete backend, APIM, mobile, and runtime certification before any activation.
7. Keep Shadowfax, Porter, and Delhivery fail-closed until authoritative vendor contracts, APIs, and credentials are available.
8. Review the documented Front Door origin-bypass risk; private origin protection is a separate cost/topology decision.

## Current production-ready scope

- Corrected User/Chef, Order, and Integration service revisions listed above.
- Admin Directory, Chef Application, and Operational Investigations APIM surface verified by the successful guarded runs and read-only status run.
- Admin Control Center / Customer 360 dashboard image 36166 on the active Admin Container App revision.
- Customer website served through active Front Door Premium with valid public TLS and healthy Container Apps origin.

Production-ready scope excludes all draft/source-only work and any capability whose manual/vendor gate remains incomplete.

## Next release batch

1. Finish review and release prerequisites for Backend Experience v2 PR #258; rebuild its dependency order from the final merged diff.
2. Finish Razorpay PR #260 with controlled sandbox/production-readiness evidence and explicit auto-refund activation approval.
3. Reconcile Favorites PRs #265–#276 in dependency order; merge and deploy only after backend/APIM/mobile gates are green.
4. Complete the authenticated smoke and telemetry/backlog checks for the currently deployed scope.
5. Keep monitoring the six-hour stabilization schedule until the 48-hour gate is satisfied.
