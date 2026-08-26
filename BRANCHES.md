# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branches:** 100

This document is the working branch handover for the Craves platform. It inventories all currently listed GitHub branches, groups them by delivery domain, and provides merge guidance for engineering review and release planning.

## Branch naming convention

Observed naming patterns in this repository:

- `agent/*` — autonomous or assisted implementation/fix branches, often spanning frontend, backend, infra, or release corrections.
- `feature/*` — productized feature branches, usually mapped to a service or admin/customer capability.
- `feat/*` — UI/UX and experience-focused feature work, primarily frontend-facing.
- `backend-*` — targeted backend capability increments without a slash namespace.
- `backup/*` — snapshot or restore-point branches; do not merge blindly.
- `build/*` — build artifact or QA packaging branches.
- `ci/*` — CI/CD gating or deployment workflow branches.
- `docs/*` — documentation and release audit branches.
- `dispatch-*` — automation/trigger branches; typically not feature branches.
- miscellaneous root branches (`android-build`, `do-not-use`, `accidental-ignore-7`, etc.) — require explicit validation before any merge activity.

### Categorisation rules used in this document

Because branch names span multiple conventions, branches are grouped into the following operational categories:

- **auth** — authentication, RBAC, account intervention, abuse/revocation, session flows.
- **catalog** — discovery, kitchens, menu, favorites, address lookup, landing/discovery UX.
- **orders** — cart, checkout, payment, order tracking, reorder, launch policy.
- **notifications** — notification delivery, inbox, recovery, notification admin surfaces.
- **chef** — chef onboarding, chef panel, chef review, chef operations, chef finance.
- **customer** — customer-facing UI, profile, landing, tracking, connected experience.
- **infra** — front door, APIM, domain, compression, CI, build, release, docs, dispatch, backup, platform hardening.
- **feature** — cross-cutting admin/subscription/platform initiatives that do not fit a narrower domain cleanly.

## Merge policy

1. **Merge target:** `main`
2. **Preferred strategy:** squash merge for single-purpose branches; rebase or merge-commit only when commit history is operationally meaningful.
3. **Required checks before merge:**
   - branch rebased or updated against latest `main`
   - service-specific tests pass
   - Flyway migration numbering verified where applicable
   - contract compatibility reviewed for BFF/API changes
   - frontend route/BFF alignment verified for customer-web-next changes
   - infra branches validated in a non-production environment first
4. **Do not auto-merge** these branch types:
   - `backup/*`
   - `dispatch-*`
   - `do-not-use`
   - `accidental-ignore-*`
   - release hotfix/platform branches without verification evidence
5. **Merge readiness labels used below:**
   - **Ready** — focused branch with clear intent; likely candidate after review.
   - **Review** — appears valid but needs code + integration review.
   - **Validate** — likely environment/platform sensitive; verify in staging first.
   - **Hold** — backup/dispatch/do-not-use/archive style branch; do not merge without explicit approval.
6. **Priority scale used below:**
   - **P0** critical production/platform path
   - **P1** high-value feature or release blocker
   - **P2** normal planned merge
   - **P3** optional, exploratory, or archival

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation/refinement for secured operations. | auth-service | Backend API, security, RBAC, Redis/JWT | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Fix authenticated signed-in experience and backend-connected session flows. | auth-service + customer-web-next | Backend API, BFF, frontend auth/session | P1 | Review |
| feature/admin-account-intervention-apim | APIM exposure/configuration for admin account intervention endpoints. | auth-service + infra | API gateway, backend API, security | P1 | Validate |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows. | auth-service + admin web | Frontend, BFF, admin UX | P1 | Review |
| feature/backend-admin-account-intervention | Backend account intervention capability for suspend/restore/investigation actions. | auth-service | Backend API, security, audit | P1 | Review |
| feature/backend-internal-admin-rbac-v2 | Next iteration of internal admin RBAC hardening and role controls. | auth-service | Backend API, security, RBAC | P1 | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token revocation hardening. | auth-service | Backend API, Redis, security | P1 | Review |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/landing-body-07cm-inset | Landing page layout refinement iteration. | customer-web-next | Frontend UI/UX | P3 | Review |
| agent/landing-body-11cm-inset | Alternate landing page layout refinement iteration. | customer-web-next | Frontend UI/UX | P3 | Review |
| agent/nearby-kitchens-first-discovery | Prioritise nearby kitchens in first discovery experience. | catalog-service + customer-web-next | Backend discovery API, BFF, frontend | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Second iteration of nearby-first discovery ranking and UX. | catalog-service + customer-web-next | Backend discovery API, BFF, frontend | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites. | user-chef-service + catalog-service | Backend API, persistence, BFF integration | P1 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX implementation. | customer-web-next | Frontend UI/UX, BFF | P1 | Review |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 refresh branch. | customer-web-next | Frontend UI/UX | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for landing page structure/content. | customer-web-next | Frontend UI/UX | P2 | Review |
| feat/landing-reference-20260811 | Landing reference baseline branch for visual/system comparison. | customer-web-next | Frontend UI/UX | P3 | Review |
| feat/landing-reference-refresh | Refreshed landing reference branch. | customer-web-next | Frontend UI/UX | P3 | Review |
| feature/address-final-work | Address workflow finalization iteration 1. | user-chef-service + customer-web-next | Backend API, BFF, frontend, maps | P1 | Review |
| feature/address-final-work-2 | Address workflow finalization iteration 2. | user-chef-service + customer-web-next | Backend API, BFF, frontend, maps | P1 | Review |
| feature/address-final-work-3 | Address workflow finalization iteration 3. | user-chef-service + customer-web-next | Backend API, BFF, frontend, maps | P1 | Review |
| feature/address-final-work-4 | Address workflow finalization iteration 4. | user-chef-service + customer-web-next | Backend API, BFF, frontend, maps | P1 | Review |
| feature/advanced-search-smart-filters | Advanced search and smart filters; aligns with discovery/search gap in platform roadmap. | catalog-service + customer-web-next | Backend discovery API, filters, frontend search UX | P1 | Review |
| feature/azure-maps-address-autofill | Address autofill using Azure Maps for customer address entry. | user-chef-service + customer-web-next | Backend geocoding, BFF, frontend maps UX | P1 | Review |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-registration-and-checkout-contract | Resolve contract mismatches affecting chef registration and checkout flows. | order-service + user-chef-service + customer-web-next | Backend API, contracts, BFF, frontend | P1 | Review |
| agent/order-flyway-v14-checksum | Repair or reconcile Flyway V14 checksum issue in order service. | order-service | Backend DB, Flyway | P0 | Validate |
| agent/razorpay-payment-switch | Switch or harden Razorpay payment path selection. | integration-service + order-service | Payments, backend API, BFF | P1 | Validate |
| backend-customer-reorder-20260816 | Backend reorder/repeat-order capability increment. | order-service | Backend API, persistence, BFF integration | P1 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX implementation. | customer-web-next + order-service | Frontend, BFF, checkout/payments | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer orders and tracking UI/UX improvements. | customer-web-next + order-service | Frontend, BFF, tracking UX | P1 | Review |
| feature/backend-launch-policy-enforcement | Backend launch-policy enforcement around order/checkout readiness. | order-service | Backend API, policy, guardrails | P1 | Review |
| feature/backend-refund-production-readiness | Refund flow production readiness hardening. | integration-service + order-service | Payments, backend workers, webhooks | P1 | Validate |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout and operational completion branch. | integration-service + order-service | Payments, backend integration, ops | P1 | Validate |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM layer for admin notification recovery operations. | notification-service + infra | API gateway, backend API | P1 | Validate |
| feature/admin-notification-recovery-web | Admin UI for notification recovery workflows. | notification-service + admin web | Frontend, BFF, admin UX | P1 | Review |
| feature/backend-notification-production-delivery | Production delivery hardening for notification channels. | notification-service | Backend API, workers, provider adapters | P1 | Validate |
| feature/backend-notification-recovery-operations | Recovery operations backend for failed notification handling. | notification-service | Backend API, workers, admin ops | P1 | Review |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entrypoint and authenticated session routing. | customer-web-next + auth-service | Frontend routing, BFF, auth/session | P1 | Review |
| agent/fix-chef-orders-and-customer-palette | Chef order screens and shared design palette corrections. | customer-web-next + order-service | Frontend UI/UX, BFF | P2 | Review |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic routing after deployment. | infra + customer-web-next | Traffic validation, frontend deployment, routing | P1 | Validate |
| feat/chef-complete-uiux | Comprehensive chef experience UI/UX implementation. | customer-web-next + user-chef-service | Frontend, BFF, chef workspace UX | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared UI foundation spanning customer and chef surfaces. | customer-web-next | Frontend design system, shared UX | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow for application approval/rejection. | user-chef-service + admin web | Backend API, admin BFF, frontend | P1 | Review |
| feature/backend-chef-financial-ledger | Chef financial ledger implementation for earnings and settlement visibility. | integration-service | Backend API, payments, ledger, admin/chef ops | P1 | Review |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer UI to live backend/BFF flows. | customer-web-next | Frontend, BFF, integration | P1 | Review |
| agent/fix-full-frontend-backend-integration | Resolve broad frontend/backend integration issues across customer flows. | customer-web-next + platform services | Frontend, BFF, backend integration | P1 | Review |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI foundations/components. | customer-web-next | Frontend design system, shared components | P2 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | Customer-chef journey alignment branch likely spanning core user flow contracts. | multi-service | Backend API, BFF, journey integration | P2 | Review |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or temporary branch; not a valid merge candidate without explicit inspection. | repo/platform | Git hygiene | P3 | Hold |
| agent/apim-gateway-domain-fix | Fix APIM gateway custom domain behavior. | infra | APIM, DNS, gateway | P0 | Validate |
| agent/backend-completion-guarded-release | Guarded release coordination for backend completion. | infra + multi-service | Release management, backend rollout | P1 | Validate |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery/runtime issues. | infra | Azure Front Door, CDN | P1 | Validate |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip during cold-load troubleshooting. | infra | Front Door, origin config, CDN | P1 | Validate |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices/sessions. | infra + customer-web-next | CDN, frontend assets, caching | P1 | Validate |
| agent/fix-customer-web-proxy-origin | Correct customer web proxy origin configuration. | infra + customer-web-next | Proxy, routing, frontend deployment | P1 | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Repair Front Door cache validation issue tied to CLI-288. | infra | Azure Front Door, cache, IaC/CLI | P1 | Validate |
| agent/fix-front-door-cli-288 | General Front Door fix for CLI-288 issue family. | infra | Azure Front Door, IaC/CLI | P1 | Validate |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip cache bypass behavior in Front Door. | infra | CDN, compression, caching | P1 | Validate |
| agent/fix-front-door-gzip-rule-validation | Fix gzip rule validation in Front Door configuration. | infra | CDN, rules engine | P1 | Validate |
| agent/fix-front-door-secret-rest | Correct secret handling or REST configuration for Front Door. | infra | CDN, secrets, gateway config | P1 | Validate |
| agent/fix-front-door-security-policy-cli-288 | Repair Front Door security policy definition for CLI-288. | infra | WAF/security policy, IaC/CLI | P0 | Validate |
| agent/fix-static-gzip-cold-loading | Additional static gzip and cold loading fix branch. | infra + customer-web-next | CDN, assets, performance | P1 | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache configuration values in Front Door. | infra | Azure Front Door, cache config | P2 | Validate |
| agent/parallel-front-door-domain-provisioning | Enable or fix parallel custom-domain provisioning in Front Door. | infra | CDN, domains, provisioning automation | P1 | Validate |
| agent/preserve-afd-custom-domain-waf | Preserve WAF association while changing AFD custom domains. | infra | Azure Front Door, WAF, domains | P0 | Validate |
| android-build | Android/mobile build branch. | mobile/build | Build packaging | P2 | Review |
| backup/customer-web-before-landing-v2-20260808 | Snapshot backup of customer web before landing v2 work. | customer-web-next | Backup/archive | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Snapshot backup of mobile UI before home refinement. | mobile/frontend | Backup/archive | P3 | Hold |
| build/qa-mobile-apk-2026-08-20 | QA APK build packaging branch. | mobile/build | Build, QA artifacts | P2 | Review |
| ci/subscription-service-predeploy-gate | CI gate for subscription-service predeployment checks. | infra + subscription-service | CI/CD, deployment gating | P1 | Validate |
| copilot/research-task-repository-analysis | Research/analysis branch; informational, not a product merge target. | docs/platform | Documentation, analysis | P3 | Hold |
| craves-master-guide-v1 | Guide or release reference branch. | docs/platform | Documentation | P3 | Review |
| craves-v5-patch-repack | Release repack or patch branch for v5. | release/platform | Release packaging | P2 | Validate |
| dispatch-craves-v4 | Dispatch automation branch. | automation | Dispatch/release automation | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Trigger branch for dispatch issue automation. | automation | Dispatch automation | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Trigger branch for dispatch reopen automation. | automation | Dispatch automation | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch automation run branch. | automation | Dispatch automation | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch automation run branch. | automation | Dispatch automation | P3 | Hold |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch. | automation | Scheduling, automation | P3 | Hold |
| do-not-use | Explicit non-merge branch. | repo/platform | N/A | P3 | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | docs/platform | Documentation, release audit | P2 | Review |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-control-center-global-search | Admin global search across operational/control-center surfaces. | admin-portal + user-chef-service/order-service | Frontend, BFF, backend search APIs | P1 | Review |
| feature/admin-customer-360-document-review | Admin customer 360 and document review capability. | admin-portal + user-chef-service | Frontend, BFF, backend admin APIs | P1 | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard and operational summary views. | admin-portal + order-service | Frontend, BFF, backend admin APIs | P1 | Review |
| feature/admin-operational-investigations-apim | APIM support for admin operational investigation endpoints. | integration-service + infra | API gateway, backend admin APIs | P1 | Validate |
| feature/admin-operational-investigations-web | Admin web investigation workflow implementation. | admin-portal + integration-service | Frontend, BFF, backend admin APIs | P1 | Review |
| feature/admin-subscription-operations | Admin operational tooling for subscription lifecycle intervention. | subscription-service + admin-portal | Backend admin APIs, frontend, BFF | P1 | Review |
| feature/admin-subscription-plans | Admin subscription plan management surfaces and workflows. | subscription-service + admin-portal | Backend admin APIs, frontend, BFF | P1 | Review |
| feature/admin-web-operations-shell | Administrative operations shell for web. | admin-portal | Frontend shell, navigation, BFF | P2 | Review |
| feature/admin-web-shell | Base admin web shell/foundation. | admin-portal | Frontend shell, navigation | P2 | Review |
| feature/backend-admin-investigation-apis | Backend investigation APIs for admin operations. | integration-service + order-service | Backend API, audit, ops tooling | P1 | Review |
| feature/backend-admin-operations-audit | Backend audit trails and operations auditing enhancements. | integration-service + auth-service | Backend API, audit, persistence | P1 | Review |
| feature/backend-cashfree-production-hardening | Cashfree payment integration hardening for production. | integration-service | Backend payments, webhooks, resilience | P1 | Validate |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider orchestration. | integration-service | Backend adapters, workers, delivery integration | P1 | Validate |
| feature/backend-production-readiness-completion | Cross-service production readiness completion branch. | multi-service | Backend APIs, infra, release hardening | P1 | Validate |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation/hardening. | subscription-service | Backend API, workers, billing | P1 | Review |
| feature/backend-subscription-occurrence-generator | Occurrence generation for scheduled subscription fulfillment. | subscription-service | Backend workers, persistence, scheduling | P1 | Review |
| feature/backend-subscription-order-fulfillment | Order fulfillment handoff for subscription occurrences. | subscription-service + order-service | Backend APIs, workers, messaging | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intents and invoicing/payment orchestration. | integration-service + subscription-service | Backend payments, APIs, workers | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | Backend messaging, workers, billing state | P1 | Review |
| feature/backend-subscription-plan-schedules | Subscription plan schedule management backend. | subscription-service | Backend API, scheduling, persistence | P1 | Review |

---

## Merge sequencing recommendations

### Recommended first-wave merges

1. **Auth and session stability**
   - `agent/backend-internal-admin-rbac`
   - `feature/backend-internal-admin-rbac-v2`
   - `feature/backend-redis-abuse-revocation`
   - `feature/backend-admin-account-intervention`
   - `feature/admin-account-intervention-web`
   - `feature/admin-account-intervention-apim`

2. **Customer core journey**
   - `agent/customer-web-connected-ui`
   - `agent/fix-full-frontend-backend-integration`
   - `feat/customer-cart-checkout-payment-uiux`
   - `feat/customer-orders-tracking-uiux`
   - `backend-customer-reorder-20260816`
   - `backend-customer-favorites-20260816`

3. **Catalog/discovery and address experience**
   - `agent/nearby-kitchens-first-discovery`
   - `agent/nearby-kitchens-first-discovery-v2`
   - `feature/advanced-search-smart-filters`
   - `feature/azure-maps-address-autofill`
   - latest viable branch among `feature/address-final-work*`

4. **Chef and admin operations**
   - `feat/chef-complete-uiux`
   - `feature/admin-chef-review`
   - `feature/admin-dashboard-v2`
   - `feature/admin-control-center-global-search`
   - `feature/admin-customer-360-document-review`

5. **Notifications and subscriptions**
   - `feature/backend-notification-production-delivery`
   - `feature/backend-notification-recovery-operations`
   - `feature/admin-notification-recovery-web`
   - `feature/backend-subscription-billing-lifecycle`
   - `feature/backend-subscription-occurrence-generator`
   - `feature/backend-subscription-order-fulfillment`
   - `feature/backend-subscription-payment-intents`
   - `feature/backend-subscription-payment-status-consumer`
   - `feature/backend-subscription-plan-schedules`
   - `feature/admin-subscription-plans`
   - `feature/admin-subscription-operations`

### Branches that should be treated as environment-sensitive

Merge only after explicit staging verification:

- all `agent/fix-front-door-*`
- `agent/apim-gateway-domain-fix`
- `agent/disable-afd-edge-compression`
- `agent/disable-origin-gzip-for-cold-loading`
- `agent/parallel-front-door-domain-provisioning`
- `agent/preserve-afd-custom-domain-waf`
- `ci/subscription-service-predeploy-gate`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-refund-production-readiness`
- `feature/backend-notification-production-delivery`
- `feature/cashfree-production-closeout-20260815`

### Branches to hold unless explicitly requested

- `accidental-ignore-7`
- `do-not-use`
- all `backup/*`
- all `dispatch-*`
- `copilot/research-task-repository-analysis`

---

## Full branch count check

The tables above account for **all 100 real branches** returned from the repository branch listing at generation time.
