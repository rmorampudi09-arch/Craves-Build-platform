# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the source of truth for active, legacy, experimental, backup, release-support, and feature branches currently visible in the repository branch inventory.

## Branch naming convention

Observed naming patterns in this repository:

- `main` *(target merge branch; not present in the returned branch page but used as the integration target)*
- `agent/*` — autonomous or assisted implementation/fix branches
- `feat/*` — product/UI/UX focused feature branches
- `feature/*` — structured feature delivery branches, often backend/admin/platform scoped
- `backend-*` — backend-specific work streams
- `backup/*` — snapshot/rollback safety branches
- `build/*` — build artifact or QA packaging branches
- `ci/*` — CI/CD pipeline branches
- `docs/*` — documentation and audit branches
- `dispatch-*` — workflow/trigger orchestration branches
- `chatgpt/*`, `copilot/*` — AI-assisted research or delivery branches
- miscellaneous ad hoc branches like `android-build`, `do-not-use`, `accidental-ignore-7`

## Merge policy

Recommended merge sequencing for this repository:

1. **Infra/platform branches first**
   - Merge APIM, Front Door, cache, compression, CI, release hardening, and security-policy branches before product branches that depend on them.
2. **Backend contract branches second**
   - Merge auth, catalog, order, notification, subscription, integration, and admin API branches before corresponding web/UI branches.
3. **Frontend/BFF branches third**
   - Merge customer-web, chef-panel, admin-web, and landing/discovery UI branches after backend contracts are stable.
4. **Operational/admin branches next**
   - Merge admin operations, investigation, recovery, and dashboard branches when APIs and permissions are validated.
5. **Experimental/backup branches last or never**
   - Do not merge `backup/*`, `do-not-use`, `accidental-ignore-7`, and workflow trigger branches without explicit confirmation.

### Merge readiness scale used in this document

- **Ready** — appears purpose-built and likely mergeable after normal checks
- **Review** — likely valid but needs code review / integration verification
- **Validate** — needs QA, env, traffic, or contract validation first
- **Hold** — keep out of main unless explicitly requested

### Priority scale used in this document

- **P0** — production/platform/security critical
- **P1** — high-value product/backend capability
- **P2** — meaningful enhancement / UX or operations improvement
- **P3** — low priority, support, backup, or archival

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation or fix for secure privileged access flows. | auth-service | Spring Boot API, security, JDBC/Flyway, internal admin routes | P0 | Review |
| feature/backend-internal-admin-rbac-v2 | Second-pass internal admin RBAC hardening aligned to auth admin role controls. | auth-service | Spring Boot API, JWT/security, JDBC/Flyway, admin authorization | P0 | Review |
| feature/backend-admin-account-intervention | Backend account intervention APIs for enable, disable, and session revocation. | auth-service | Spring Boot API, admin endpoints, auth domain, JDBC/Flyway | P0 | Review |
| feature/admin-account-intervention-apim | APIM exposure/policy work for admin account intervention endpoints. | infra + auth-service | APIM config, gateway policy, admin API exposure | P1 | Validate |
| feature/admin-account-intervention-web | Admin web interface for account intervention actions. | customer-web-next / admin BFF | Next.js App Router, admin UI, BFF routes, auth integration | P1 | Validate |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token/session revocation hardening. | auth-service | Redis, security filters, JWT/session controls, Spring config | P0 | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchen discovery improvements for catalog discovery. | catalog-service | Discovery API, geospatial queries, JDBC/Flyway, BFF integration | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Follow-up discovery iteration refining nearby kitchens experience. | catalog-service | Discovery API, geospatial logic, customer-web BFF, UI contracts | P1 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX enhancements tied to catalog browsing. | customer-web-next + catalog-service | Next.js UI, BFF routes, catalog discovery, design system | P1 | Validate |
| feature/advanced-search-smart-filters | Search and smart-filter capability for richer food/kitchen discovery. | catalog-service + customer-web-next | Search UX, discovery API, filters, BFF, frontend state | P1 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fix chef order surfaces and related customer-facing visual treatment. | order-service + customer-web-next | Chef orders API, UI styling, BFF routes, order workflows | P1 | Validate |
| agent/fix-chef-registration-and-checkout-contract | Fix contract mismatches across chef registration and checkout flows. | order-service + user-chef-service + customer-web-next | API contracts, checkout BFF, validation, frontend integration | P0 | Review |
| agent/order-flyway-v14-checksum | Flyway checksum correction for order-service migration v14. | order-service | Flyway, schema migration, release repair | P0 | Ready |
| backend-customer-reorder-20260816 | Backend support for customer reorder / repeat-order flows. | order-service | Order APIs, repeat-order service, checkout/cart integration | P1 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX completion. | customer-web-next + order-service + integration-service | Next.js UI, BFF, checkout flow, payment integration | P1 | Validate |
| feat/customer-orders-tracking-uiux | Orders and order-tracking UI/UX enhancements. | customer-web-next + order-service | Order history UI, tracking views, BFF routes, status polling | P1 | Validate |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production delivery readiness for notification sending pipelines. | notification-service | Delivery workers, adapters, persistence, retry flows | P0 | Review |
| feature/backend-notification-recovery-operations | Backend recovery operations for failed or stuck notification delivery. | notification-service | Recovery APIs, worker operations, admin tooling | P1 | Review |
| feature/admin-notification-recovery-apim | APIM routing/policy exposure for admin notification recovery endpoints. | infra + notification-service | APIM config, admin gateway, recovery route policies | P1 | Validate |
| feature/admin-notification-recovery-web | Admin UI for notification recovery workflows. | customer-web-next / admin BFF | Admin UI, BFF routes, recovery views, retry controls | P1 | Validate |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry flow and authenticated session routing. | customer-web-next + auth-service + user-chef-service | Next.js routing, auth session handling, chef entry UX | P1 | Validate |
| agent/fix-chef-release-traffic-verification | Validate chef traffic after release or rollout changes. | chef web + platform edge | Traffic verification, routing, release checks, observability | P1 | Validate |
| feat/chef-complete-uiux | Chef experience UI/UX completion across chef-facing routes. | customer-web-next / chef panel | Next.js App Router, chef screens, BFF, UX polish | P1 | Validate |
| feature/admin-chef-review | Admin chef review workflow for application review and decisioning. | user-chef-service + admin web | Admin APIs, document review, web workflow, BFF | P1 | Review |
| feature/backend-chef-financial-ledger | Backend chef financial ledger and earnings support. | integration-service | Financial APIs, ledger persistence, admin/chef reporting | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live backend/BFF flows. | customer-web-next | Next.js UI, BFF routes, API integration, auth-aware flows | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in user flows end-to-end after backend hookup. | customer-web-next + auth-service + order-service | Auth, BFF, session refresh, signed-in UX | P0 | Review |
| agent/fix-full-frontend-backend-integration | End-to-end frontend/backend integration fixes across major customer journeys. | customer-web-next + platform services | Full-stack integration, contracts, BFF, UI routing | P0 | Review |
| agent/unify-chef-panel-customer-ui | Unify chef and customer UI foundations or shared shell patterns. | customer-web-next | Shared UI system, layouts, navigation, component reuse | P2 | Validate |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved items. | user-chef-service + catalog-service | Favorites API, JDBC/Flyway, BFF integration, customer profile | P1 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted backend work spanning customer and chef journey flows. | multiple backend services | APIs, contracts, journey orchestration, integration work | P2 | Review |
| feat/customer-chef-uiux-foundation | Shared UI/UX foundation for customer and chef experiences. | customer-web-next | Design system, page shells, component library, route structure | P2 | Validate |
| feat/customer-landing-v2-clean-20260808 | Cleaner version of customer landing v2 experience. | customer-web-next | Landing page UI, frontend content blocks, BFF hooks | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing page improvements for customer web. | customer-web-next | Landing content, semantic HTML, design polish, SEO | P2 | Review |
| feature/address-final-work | Final pass on address management flow. | user-chef-service + customer-web-next | Address APIs, BFF, forms, validation, location UX | P1 | Review |
| feature/address-final-work-2 | Follow-up address workflow refinement. | user-chef-service + customer-web-next | Address APIs, UI forms, validation, geocoding | P1 | Review |
| feature/address-final-work-3 | Additional address flow fixes or completion work. | user-chef-service + customer-web-next | Address APIs, UX refinements, BFF, validation | P1 | Review |
| feature/address-final-work-4 | Latest address finalization iteration before merge. | user-chef-service + customer-web-next | Address APIs, UI polish, geocoding, integration testing | P1 | Validate |
| feature/azure-maps-address-autofill | Azure Maps-powered address autofill and suggestion flow. | user-chef-service + customer-web-next | Azure Maps, geocoding, forms, BFF, customer profile | P1 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM or gateway custom-domain behavior. | infra/apim | Azure APIM, gateway routing, domain config, edge networking | P0 | Ready |
| agent/backend-completion-guarded-release | Guarded release branch for backend completion and rollout control. | platform | Release orchestration, deployment gating, backend validation | P0 | Validate |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery issues. | infra/front-door | AFD config, edge compression, caching behavior | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to fix cold-load behavior. | infra/front-door + frontend hosting | Compression settings, CDN/origin tuning, cold-start delivery | P0 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices or cold sessions. | frontend delivery platform | CDN/static hosting, asset loading, cache headers | P1 | Validate |
| agent/fix-customer-web-proxy-origin | Correct customer-web proxy origin/routing configuration. | infra + customer-web-next | Proxy config, origin routing, BFF traffic | P0 | Review |
| agent/fix-front-door-cache-validation-cli-288 | Repair Front Door cache rule validation issue referenced by CLI-288. | infra/front-door | AFD rule engine, cache validation, deployment config | P0 | Ready |
| agent/fix-front-door-cli-288 | General Front Door remediation for CLI-288 issue. | infra/front-door | Edge config, route rules, deployment automation | P0 | Ready |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip and cache bypass interplay at the edge. | infra/front-door | Compression, caching, edge rules, CDN behavior | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Fix gzip rule validation in Front Door policy definitions. | infra/front-door | Rule definitions, validation, edge config | P0 | Ready |
| agent/fix-front-door-secret-rest | Repair secret or REST integration for Front Door provisioning. | infra/front-door | Secrets, deployment automation, gateway provisioning | P0 | Review |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy validation for CLI-288. | infra/front-door | WAF/security policy, edge routing, deployment config | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Fix static gzip behavior impacting cold loads. | frontend delivery platform | Asset compression, cache strategy, static delivery | P1 | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache settings in Front Door definitions. | infra/front-door | CDN cache config, rule normalization, IaC validation | P0 | Ready |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door custom domain provisioning. | infra/front-door | Domain automation, deployment tooling, edge config | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF bindings during Front Door custom domain changes. | infra/front-door | AFD custom domains, WAF policy attachment, rollout safety | P0 | Review |
| agent/razorpay-payment-switch | Payment gateway switch or routing change toward Razorpay. | integration-service + platform config | Payments, provider routing, env config, checkout integration | P0 | Review |
| android-build | Android/mobile build support branch. | mobile/build platform | Build tooling, packaging, mobile release support | P2 | Validate |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before customer landing v2 work. | customer-web-next | Backup branch, rollback safety, landing UI snapshot | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup branch before mobile home refinement work. | mobile/frontend | Backup branch, rollback snapshot, UI preservation | P3 | Hold |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK build branch for packaging/testing. | mobile/build platform | Build pipeline, APK packaging, QA delivery | P2 | Validate |
| ci/subscription-service-predeploy-gate | CI gate for subscription-service predeploy checks. | subscription-service + CI/CD | Pipeline checks, deployment validation, automation | P0 | Ready |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | docs/platform | Documentation, release audit, operational evidence | P2 | Review |
| feature/backend-cashfree-production-hardening | Production hardening for Cashfree payment integration. | integration-service | Payments backend, provider reliability, operational hardening | P0 | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness work for delivery provider integrations. | integration-service | Delivery adapters, webhook handling, provider ops | P0 | Review |
| feature/backend-launch-policy-enforcement | Enforce launch/readiness policies before operational release. | order-service + platform | Policy enforcement, release guards, backend checks | P0 | Review |
| feature/backend-production-readiness-completion | Broad backend production-readiness completion branch. | multi-service backend | Hardening, integration validation, release prep | P0 | Review |
| feature/backend-refund-production-readiness | Refund flow production readiness and hardening. | integration-service + order-service | Refund workflow, webhooks, ops, reconciliation | P0 | Review |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout and production completion work. | integration-service | Payment provider integration, reconciliation, release closeout | P0 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Miscellaneous or accidental branch; not intended as structured delivery. | unknown | Unknown / ad hoc | P3 | Hold |
| do-not-use | Explicitly marked non-merge branch. | unknown | Unknown / blocked | P3 | Hold |
| copilot/research-task-repository-analysis | Repository analysis and research output branch. | docs/research | Documentation, repo analysis, planning artifacts | P3 | Hold |
| craves-master-guide-v1 | Master guide or project guide branch. | docs/platform | Documentation, onboarding, guide content | P2 | Review |
| craves-v5-patch-repack | Patch repack/rebundle branch for release packaging. | release/platform | Release packaging, artifact prep, patch assembly | P2 | Validate |
| dispatch-craves-v4 | Dispatch workflow support branch. | ops/automation | Workflow orchestration, issue automation, dispatch support | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Issue-trigger automation branch for dispatch workflows. | ops/automation | GitHub workflow triggers, issue automation | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger automation branch for dispatch workflows. | ops/automation | Workflow triggers, automation, issue state handling | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch workflow run branch iteration 2. | ops/automation | Automation run support, workflow testing | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch workflow run branch iteration 3. | ops/automation | Automation run support, workflow testing | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch workflow branch. | ops/automation | Scheduled automation, workflow orchestration | P3 | Hold |
| feat/landing-reference-20260811 | Landing page reference implementation snapshot. | customer-web-next | Landing UI, content reference, design baseline | P2 | Review |
| feat/landing-reference-refresh | Refresh of landing reference implementation. | customer-web-next | Frontend UI refresh, content blocks, design iteration | P2 | Review |
| feature/admin-control-center-global-search | Global search across admin control center workflows. | admin web + backend APIs | Search UI, admin APIs, BFF, directory/investigation integration | P1 | Review |
| feature/admin-customer-360-document-review | Customer 360 and document review workflows for admin users. | admin web + user-chef-service | Admin UI, document review, profile ops, BFF | P1 | Review |
| feature/admin-dashboard-v2 | Second version of admin dashboard summary and operations UX. | admin web + backend APIs | Dashboard UI, BFF, summary APIs, analytics surfaces | P1 | Review |
| feature/admin-operational-investigations-apim | APIM layer for admin operational investigation APIs. | infra + backend admin APIs | APIM routing, admin policies, secure exposure | P1 | Validate |
| feature/admin-operational-investigations-web | Admin web workflows for operational investigations. | admin web + backend APIs | Investigation UI, BFF, admin operations, search/forms | P1 | Review |
| feature/admin-subscription-operations | Admin workflows for subscription operations and interventions. | subscription-service + admin web | Admin APIs, BFF, operations UI, lifecycle actions | P1 | Review |
| feature/admin-subscription-plans | Admin management flows for subscription plans. | subscription-service + admin web | Plan APIs, admin UI, BFF, approvals/review | P1 | Review |
| feature/admin-web-operations-shell | Admin operations shell or layout foundation. | admin web | Shell layout, route structure, shared admin UI | P2 | Review |
| feature/admin-web-shell | Core admin shell foundation. | admin web | Navigation, shell, auth gating, shared components | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs supporting operational/admin investigations. | order-service + integration-service | Admin APIs, audit trails, JDBC/Flyway, investigation workflows | P1 | Review |
| feature/backend-admin-operations-audit | Backend operational audit trail and admin observability support. | multi-service backend | Audit persistence, admin APIs, operational logging | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle orchestration. | subscription-service | Billing workflows, workers, events, JDBC/Flyway | P1 | Review |
| feature/backend-subscription-occurrence-generator | Generator for subscription occurrences/schedules. | subscription-service | Scheduled workers, occurrence logic, persistence | P1 | Review |
| feature/backend-subscription-order-fulfillment | Bridge subscription occurrences into order fulfillment. | subscription-service + order-service | Internal APIs, event flows, fulfillment integration | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and tracking. | integration-service + subscription-service | Payments API, billing linkage, provider integration | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | Event consumer, billing status, lifecycle transitions | P1 | Review |
| feature/backend-subscription-plan-schedules | Subscription plan schedule authoring and retrieval support. | subscription-service | Scheduling APIs, plan workflows, JDBC/Flyway | P1 | Review |

---

## Branches not returned in the fetched branch page

The task required using the actual output from `github_list_branches` page 1 with `per_page=100`, and this document inventories those 100 real branches. The integration target remains `main`, but `main` itself was not included in the returned page payload used to build this inventory.

## Merge guidance summary

- Merge **infra P0** branches before dependent UI or backend rollout branches.
- Merge **auth and contract-impacting backend** branches before customer/admin frontend branches.
- Merge **customer/chef/admin UI branches** only after validating API contracts and BFF route compatibility.
- Keep **backup, dispatch, do-not-use, and accidental branches** out of the merge queue unless a release manager explicitly approves them.
