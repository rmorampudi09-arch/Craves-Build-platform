# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the canonical branch inventory for the repository. It groups all currently listed branches by product or engineering domain and gives merge guidance based on the branch name, known codebase architecture, and branch intent inferred from naming.

## Branch naming convention

Observed naming patterns in this repository:

- `agent/*` — autonomous or assisted implementation/fix branches, often infra, frontend integration, release hardening, or tactical production fixes.
- `feature/*` — feature delivery branches, usually backend, admin, ops, platform, or customer-facing functionality.
- `feat/*` — UI/UX or frontend-oriented feature branches.
- `backend-*` — backend capability branches without the `feature/` prefix.
- `backup/*` — branch snapshots intended for recovery/reference, not normal merge targets.
- `build/*` — build artifacts or QA packaging branches.
- `ci/*` — pipeline and deployment safety branches.
- `docs/*` — documentation and audit branches.
- `dispatch-*` — automation dispatch/control branches.
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation branches.
- one-off branches such as `android-build`, `do-not-use`, `accidental-ignore-7` — special handling required.

## Merge policy

### Priority legend
- **P0** — production safety, release blocker, or critical platform readiness
- **P1** — high-value business or operational capability
- **P2** — important UX/product enhancement
- **P3** — optional, exploratory, or support work
- **Archive** — should generally not merge; retain only for reference/backups

### Merge readiness legend
- **Ready after review** — appears mergeable with standard code review and CI
- **Needs validation** — requires service-level verification, integration tests, or smoke testing
- **Needs conflict check** — likely overlaps nearby branches; assess diff before merge
- **Hold / selective cherry-pick** — do not merge wholesale; cherry-pick only needed commits
- **Do not merge** — backup, obsolete, or explicitly unsafe branch

### Recommended merge flow
1. Merge infrastructure and release-hardening branches before dependent product branches.
2. Merge backend contract branches before frontend integration branches.
3. Merge admin/API branches before admin-web branches.
4. For clusters with overlapping intent, pick a primary branch and cherry-pick from alternates.
5. Never merge `backup/*`, `do-not-use`, or accidental branches directly to `main`.

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Early internal admin RBAC implementation pass for protected operational access. | auth-service | Backend API, security, RBAC, Flyway | P1 | Needs conflict check |
| `feature/backend-internal-admin-rbac-v2` | Follow-up or replacement RBAC branch likely aligned to V6 internal admin role model. | auth-service | Backend API, security, RBAC, Flyway | P1 | Needs validation |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token revocation hardening across authenticated flows. | auth-service | Backend security, Redis, auth filters | P1 | Ready after review |
| `feature/backend-admin-account-intervention` | Account disable/enable operational controls backing admin intervention APIs. | auth-service | Backend API, admin ops, security | P1 | Needs validation |
| `feature/admin-account-intervention-apim` | API management layer support for account intervention endpoints. | auth-service / APIM | API gateway, routing, policy | P1 | Needs validation |
| `feature/admin-account-intervention-web` | Admin UI for account intervention workflow. | customer-web-next admin | Next.js, BFF routes, admin UI | P1 | Needs validation |
| `agent/fix-backend-connected-signed-in-flows` | Fixes signed-in frontend/backend session contract and auth continuity. | auth-service + customer-web-next | Backend auth, BFF, frontend session | P0 | Ready after review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Discovery-first nearby kitchens experience aligned to catalog geospatial APIs. | catalog-service + customer-web-next | Discovery API, geo filtering, frontend | P1 | Needs conflict check |
| `agent/nearby-kitchens-first-discovery-v2` | Second pass of nearby discovery; likely supersedes the first branch. | catalog-service + customer-web-next | Discovery API, geo filtering, frontend | P1 | Needs validation |
| `feature/advanced-search-smart-filters` | Enhanced search and filtering for kitchens/menu discovery. | catalog-service + customer-web-next | Catalog API, search UX, filters | P2 | Needs validation |
| `backend-customer-favorites-20260816` | Customer favorites backend support tied to catalog saved item resolution and home feed. | user-chef-service + catalog-service | Backend API, favorites data, internal resolution | P1 | Ready after review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Reorder capability built on repeat order/order history flows. | order-service | Backend API, reorder logic, cart reconstruction | P1 | Ready after review |
| `agent/order-flyway-v14-checksum` | Repair or stabilize Flyway V14 checksum for dynamic checkout pricing migration. | order-service | Flyway, DB migration, release ops | P0 | Ready after review |
| `feature/backend-launch-policy-enforcement` | Checkout/order launch policy enforcement using launch policy registry and AOP guardrails. | order-service | Backend API, policy, AOP | P1 | Needs validation |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment experience improvements over existing BFF flows. | customer-web-next + order-service | Next.js UI, BFF, checkout contracts | P1 | Needs validation |
| `feat/customer-orders-tracking-uiux` | Customer order history and tracking UI refresh. | customer-web-next + order-service | Next.js UI, BFF, tracking | P2 | Needs validation |
| `agent/fix-chef-registration-and-checkout-contract` | Fixes contract mismatches affecting checkout and chef registration pathways. | order-service + user-chef-service + web | Backend contracts, BFF, frontend | P0 | Ready after review |
| `agent/fix-chef-orders-and-customer-palette` | UX/flow corrections touching chef orders and customer ordering surfaces. | order-service + customer-web-next | Frontend UI, order views | P2 | Needs validation |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production-grade notification dispatch path hardening across providers. | notification-service | Backend workers, delivery adapters, ops | P1 | Ready after review |
| `feature/backend-notification-recovery-operations` | Recovery, retry, and operator tooling for failed notifications. | notification-service | Backend API, recovery workflow, ops | P1 | Ready after review |
| `feature/admin-notification-recovery-apim` | APIM exposure/configuration for admin notification recovery endpoints. | notification-service / APIM | API gateway, admin policy | P1 | Needs validation |
| `feature/admin-notification-recovery-web` | Admin web console for notification recovery management. | customer-web-next admin | Next.js, BFF, admin UI | P1 | Needs validation |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-chef-review` | Admin review workflow for chef applications and document decisions. | user-chef-service + admin web | Backend API, admin UI, document review | P1 | Ready after review |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and settlement visibility. | integration-service | Backend API, ledger, settlement | P1 | Ready after review |
| `feature/azure-maps-address-autofill` | Address search/autofill support using Azure Maps for customer or chef address entry. | user-chef-service + customer-web-next | Geocoding, API, UI | P2 | Needs validation |
| `feat/chef-complete-uiux` | Broad chef experience completion across chef app surfaces. | customer-web-next chef | Next.js UI, BFF, chef flows | P2 | Needs conflict check |
| `feat/customer-chef-uiux-foundation` | Shared UI foundation spanning customer and chef application surfaces. | customer-web-next | Next.js UI, design system, shared layout | P2 | Needs conflict check |
| `agent/fix-chef-entry-and-session-routing` | Fix chef area entry, auth/session continuity, and route guards. | customer-web-next chef + auth | Frontend routing, BFF, auth session | P1 | Ready after review |
| `agent/unify-chef-panel-customer-ui` | Harmonizes chef panel and customer UI structure/theme. | customer-web-next | Frontend architecture, UI system | P2 | Needs validation |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted branch spanning customer-chef journey integrations. | user-chef-service + order-service + web | Backend APIs, UX flow integration | P2 | Needs manual review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/address-final-work` | Finalization pass on customer address flows. | user-chef-service + customer-web-next | Backend API, BFF, address UI | P1 | Needs conflict check |
| `feature/address-final-work-2` | Iteration 2 of address finalization work. | user-chef-service + customer-web-next | Backend API, BFF, address UI | P1 | Needs conflict check |
| `feature/address-final-work-3` | Iteration 3 of address flow stabilization. | user-chef-service + customer-web-next | Backend API, BFF, address UI | P1 | Needs conflict check |
| `feature/address-final-work-4` | Latest visible address finalization branch; likely merge candidate among the set. | user-chef-service + customer-web-next | Backend API, BFF, address UI | P1 | Needs validation |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UX improvements. | customer-web-next | Landing UI, discovery UI, design | P2 | Needs conflict check |
| `feat/customer-landing-v2-clean-20260808` | Clean landing page V2 implementation snapshot. | customer-web-next | Landing UI, marketing pages | P2 | Needs conflict check |
| `feat/customer-web-semantic-reference-landing` | Semantic/reference landing implementation emphasizing structure/content quality. | customer-web-next | Marketing UI, semantic HTML, frontend | P3 | Hold / selective cherry-pick |
| `feat/landing-reference-20260811` | Landing reference branch for design comparison. | customer-web-next | UI reference, frontend | P3 | Hold / selective cherry-pick |
| `feat/landing-reference-refresh` | Updated reference landing iteration. | customer-web-next | UI reference, frontend | P3 | Hold / selective cherry-pick |
| `agent/customer-web-connected-ui` | Connects frontend UI to live backend/BFF integrations. | customer-web-next + backend services | Next.js, BFF, contract integration | P0 | Ready after review |
| `agent/fix-customer-web-proxy-origin` | Fixes proxy/origin behavior for customer web API communication. | customer-web-next | Next.js config, BFF, networking | P0 | Ready after review |
| `agent/fix-full-frontend-backend-integration` | End-to-end integration fixes across major customer journeys. | customer-web-next + backend services | Frontend, BFF, API contracts | P0 | Ready after review |
| `agent/landing-body-07cm-inset` | Landing layout spacing experiment. | customer-web-next | UI styling, layout | P3 | Hold / selective cherry-pick |
| `agent/landing-body-11cm-inset` | Alternate landing layout spacing experiment. | customer-web-next | UI styling, layout | P3 | Hold / selective cherry-pick |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fix custom domain handling at API management/gateway layer. | platform infra | APIM, DNS, gateway config | P0 | Ready after review |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to correct delivery behavior. | platform infra | Azure Front Door, CDN rules | P0 | Needs validation |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to address cold-start/static load issues. | platform infra | Front Door, origin config, caching | P0 | Needs validation |
| `agent/fix-cold-device-static-loading` | Targeted cold-device static asset loading fix. | platform infra + frontend delivery | CDN, caching, static delivery | P0 | Ready after review |
| `agent/fix-front-door-cache-validation-cli-288` | Resolve Front Door cache validation rule issue. | platform infra | Front Door, CLI, cache rules | P0 | Needs validation |
| `agent/fix-front-door-cli-288` | General Front Door CLI fix branch tied to issue 288. | platform infra | Front Door, CLI automation | P0 | Needs conflict check |
| `agent/fix-front-door-gzip-cache-bypass` | Fix gzip/cache bypass behavior in Front Door path. | platform infra | Front Door, caching, compression | P0 | Needs validation |
| `agent/fix-front-door-gzip-rule-validation` | Rule validation fix for Front Door gzip behavior. | platform infra | Front Door, rules engine | P0 | Needs validation |
| `agent/fix-front-door-secret-rest` | Secret or credential handling correction for Front Door automation. | platform infra | Secrets, Front Door, automation | P0 | Needs validation |
| `agent/fix-front-door-security-policy-cli-288` | Security policy automation fix at Front Door layer. | platform infra | Front Door, WAF/security policy | P0 | Needs validation |
| `agent/fix-static-gzip-cold-loading` | Static gzip and cold loading optimization/fix. | platform infra + frontend delivery | CDN, static assets, compression | P0 | Needs conflict check |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty cache configuration behavior in Front Door scripts. | platform infra | Front Door, CLI automation | P0 | Needs validation |
| `agent/parallel-front-door-domain-provisioning` | Parallelize domain provisioning workflow for Front Door. | platform infra | IaC/automation, Front Door, DNS | P1 | Ready after review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF associations while changing Front Door custom domains. | platform infra | Front Door, WAF, domain config | P0 | Ready after review |
| `agent/fix-chef-release-traffic-verification` | Release verification and traffic validation for chef-facing environment. | platform infra + release ops | Release validation, routing, smoke test | P0 | Ready after review |
| `android-build` | Android/mobile build line or packaging branch. | mobile/build | Build config, packaging | P3 | Needs manual review |
| `build/qa-mobile-apk-2026-08-20` | QA APK packaging branch for mobile validation. | mobile/build | CI/build, artifact packaging | P3 | Hold / selective cherry-pick |
| `ci/subscription-service-predeploy-gate` | Predeploy gate/checks for subscription service rollout. | CI/CD | Pipeline config, deploy safety | P1 | Ready after review |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree payment path. | integration-service | Payment backend, provider integration, ops | P0 | Ready after review |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider readiness and operational hardening. | integration-service | Delivery integrations, reconciliation, ops | P0 | Ready after review |
| `feature/backend-production-readiness-completion` | Final backend production readiness sweep across services. | multi-service backend | Hardening, ops, release checks | P0 | Needs validation |
| `feature/backend-refund-production-readiness` | Refund pipeline production readiness branch. | integration-service + order-service | Refund backend, reconciliation, ops | P0 | Ready after review |
| `feature/cashfree-production-closeout-20260815` | Closeout and cleanup for Cashfree production launch. | integration-service | Payment backend, release ops | P1 | Needs validation |
| `agent/razorpay-payment-switch` | Payment provider switch or routing transition to Razorpay. | integration-service + customer-web-next | Payment backend, frontend payment UI | P0 | Needs validation |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Accidental or temporary branch with no reliable product intent. | n/a | n/a | Archive | Do not merge |
| `backup/customer-web-before-landing-v2-20260808` | Recovery snapshot before landing V2 changes. | customer-web-next | Backup snapshot | Archive | Do not merge |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Recovery snapshot before mobile home refinement. | mobile/frontend | Backup snapshot | Archive | Do not merge |
| `copilot/research-task-repository-analysis` | AI research/documentation branch, not a direct product feature line. | docs/research | Documentation, analysis | P3 | Hold / selective cherry-pick |
| `craves-master-guide-v1` | Guide or baseline branch, likely documentation/reference oriented. | docs/platform | Docs, reference | P3 | Hold / selective cherry-pick |
| `craves-v5-patch-repack` | Patch repack/release support branch. | release ops | Packaging, release management | P2 | Needs manual review |
| `dispatch-craves-v4` | Automation dispatch control branch. | automation | Workflow automation | P3 | Hold / selective cherry-pick |
| `dispatch-craves-v4-issue-trigger` | Dispatch automation trigger for issue events. | automation | GitHub automation | P3 | Hold / selective cherry-pick |
| `dispatch-craves-v4-reopen-trigger` | Dispatch automation trigger for reopen events. | automation | GitHub automation | P3 | Hold / selective cherry-pick |
| `dispatch-craves-v4-run-2` | Iteration of dispatch automation run. | automation | GitHub automation | P3 | Hold / selective cherry-pick |
| `dispatch-craves-v4-run-3` | Iteration of dispatch automation run. | automation | GitHub automation | P3 | Hold / selective cherry-pick |
| `dispatch-craves-v4-schedule` | Scheduled automation dispatch branch. | automation | Scheduler, automation | P3 | Hold / selective cherry-pick |
| `do-not-use` | Explicitly unsafe or obsolete branch. | n/a | n/a | Archive | Do not merge |
| `docs/production-release-audit-20260821` | Production release audit documentation branch. | docs/release | Documentation, audit | P2 | Ready after review |
| `feature/admin-control-center-global-search` | Admin directory and global search capability. | user-chef-service + admin web | Backend API, search UI, admin ops | P1 | Ready after review |
| `feature/admin-customer-360-document-review` | Admin customer 360 and document review tooling. | user-chef-service + admin web | Backend API, admin UI, investigation | P1 | Needs validation |
| `feature/admin-dashboard-v2` | Enhanced admin dashboard summary and operational visibility. | order-service + admin web | Backend API, analytics UI, admin | P1 | Ready after review |
| `feature/admin-operational-investigations-apim` | APIM support for admin investigation APIs. | order-service / integration-service / APIM | API gateway, admin policy | P1 | Needs validation |
| `feature/admin-operational-investigations-web` | Admin investigations web console. | customer-web-next admin | Next.js, BFF, admin UI | P1 | Needs validation |
| `feature/admin-subscription-operations` | Admin operations workflows for subscriptions. | subscription-service + admin web | Backend API, admin UI, ops | P1 | Ready after review |
| `feature/admin-subscription-plans` | Admin plan review/management surfaces for subscriptions. | subscription-service + admin web | Backend API, admin UI | P1 | Ready after review |
| `feature/admin-web-operations-shell` | Admin web operational shell and navigation frame. | customer-web-next admin | Next.js shell, layout, navigation | P2 | Needs conflict check |
| `feature/admin-web-shell` | Base admin shell likely preceding operations shell. | customer-web-next admin | Next.js shell, shared UI | P2 | Needs conflict check |
| `feature/backend-admin-investigation-apis` | Backend investigation endpoints for admin operations. | order-service + integration-service | Backend API, admin ops, audit | P1 | Ready after review |
| `feature/backend-admin-operations-audit` | Operations audit trail support for admin actions. | multi-service backend | Audit logging, backend ops | P1 | Ready after review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle completion. | subscription-service | Billing backend, outbox, lifecycle | P1 | Ready after review |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generation worker/service. | subscription-service | Scheduler, occurrence engine, backend | P1 | Ready after review |
| `feature/backend-subscription-order-fulfillment` | Subscription occurrences into order fulfillment pipeline. | subscription-service + order-service | Backend API, orchestration, events | P1 | Ready after review |
| `feature/backend-subscription-payment-intents` | Subscription payment intent lifecycle. | integration-service + subscription-service | Payments backend, orchestration | P1 | Ready after review |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service | Event consumer, billing state | P1 | Ready after review |
| `feature/backend-subscription-plan-schedules` | Subscription plan schedule management. | subscription-service | Backend API, schedule logic, public/internal endpoints | P1 | Ready after review |

## Merge sequencing guidance

### Recommended first wave
- `agent/apim-gateway-domain-fix`
- `agent/fix-customer-web-proxy-origin`
- `agent/fix-full-frontend-backend-integration`
- `agent/order-flyway-v14-checksum`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-refund-production-readiness`
- `feature/backend-production-readiness-completion`

### Recommended second wave
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-admin-account-intervention`
- `feature/backend-notification-production-delivery`
- `feature/backend-notification-recovery-operations`
- `feature/backend-admin-investigation-apis`
- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`

### Recommended third wave
- `feature/admin-dashboard-v2`
- `feature/admin-control-center-global-search`
- `feature/admin-subscription-operations`
- `feature/admin-subscription-plans`
- `feature/admin-notification-recovery-web`
- `feature/admin-operational-investigations-web`
- `feature/admin-account-intervention-web`
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-orders-tracking-uiux`
- `feature/address-final-work-4`
- `feature/azure-maps-address-autofill`

### Branches to compare before choosing a winner
- `agent/nearby-kitchens-first-discovery` vs `agent/nearby-kitchens-first-discovery-v2`
- `feature/address-final-work` / `-2` / `-3` / `-4`
- `feature/admin-web-shell` vs `feature/admin-web-operations-shell`
- `feat/customer-landing-discovery-uiux` vs `feat/customer-landing-v2-clean-20260808`
- `agent/backend-internal-admin-rbac` vs `feature/backend-internal-admin-rbac-v2`

### Branches not intended for direct merge
- `backup/*`
- `dispatch-*`
- `do-not-use`
- `accidental-ignore-7`
- reference/design branches where the value is in selective cherry-picks rather than full merge
