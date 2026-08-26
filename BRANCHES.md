# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branch count:** 100

This document is the branch inventory and merge handover for the Craves Build platform. It lists every currently visible branch in the repository, groups them by product or platform domain, and provides practical merge guidance for bringing work back into `main`.

---

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — autonomous or assisted implementation/fix branches
- `feature/` — feature delivery branches, usually scoped to a domain or service
- `feat/` — frontend/UIUX focused feature branches
- `backend-` — backend scoped feature delivery branches
- `docs/` — documentation and audit branches
- `ci/` — CI/CD and deployment guardrails
- `build/` — build artifact or QA packaging branches
- `backup/` — safety backup branches, generally not intended for merge
- `dispatch-` — operational or automation trigger branches, generally not intended for merge
- `chatgpt/`, `copilot/` — research or assisted development branches
- unprefixed branches — ad hoc branches; require extra review before merge

### Recommended interpretation

- Merge `feature/`, `feat/`, selected `agent/`, and selected `backend-` branches after validation.
- Treat `backup/`, `dispatch-`, `do-not-use`, and accidental branches as non-mergeable unless explicitly approved.
- Prefer squash merges for UI and docs branches.
- Prefer rebase or standard merge for backend branches with migrations, eventing, or infra changes so commit history remains understandable.

---

## Merge policy

### Default merge order

1. **Infra / platform safety fixes**
2. **Auth and admin security branches**
3. **Catalog and discovery**
4. **Orders / checkout / payment**
5. **Notifications and operations recovery**
6. **Chef and customer experience**
7. **Admin web shells and UI polish**
8. **Backups / dispatch / archival branches: do not merge by default**

### Readiness labels used below

- **Ready** — appears purpose-built and likely mergeable after standard CI and review
- **Review** — likely useful, but needs code review, QA, and dependency validation
- **Hold** — should not merge until prerequisite branches or release checks complete
- **Do Not Merge** — backup, dispatch, accidental, or explicitly unsafe branch

### Priority labels used below

- **P0** — security, production stability, traffic, release safety
- **P1** — core product flow or critical business functionality
- **P2** — major feature improvement, admin operations, UX completion
- **P3** — polish, experiments, reference work, low urgency

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation and auth hardening | auth-service | backend, security, api | P0 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up RBAC expansion/refinement for internal admin roles | auth-service | backend, security, api | P0 | Review |
| feature/backend-admin-account-intervention | Backend admin account intervention APIs for support operations | auth-service | backend, api, admin | P1 | Review |
| feature/admin-account-intervention-apim | APIM exposure/config for admin account intervention flows | infra + auth-service | apim, infra, backend | P1 | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows | admin-portal / customer-web-next | frontend, bff, admin | P2 | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse prevention and token/session revocation hardening | auth-service | backend, redis, security | P0 | Ready |
| agent/fix-backend-connected-signed-in-flows | Fix signed-in customer flows against backend auth/session contracts | customer-web-next + auth-service | frontend, bff, backend | P1 | Review |
| agent/fix-chef-entry-and-session-routing | Fix chef entry routing and session gating | customer-web-next + auth-service | frontend, routing, auth | P1 | Review |

---

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Introduces discovery-first nearby kitchens experience | catalog-service + customer-web-next | backend, frontend, discovery | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Follow-up iteration of nearby-first discovery | catalog-service + customer-web-next | backend, frontend, discovery | P1 | Review |
| feature/advanced-search-smart-filters | Advanced search and smart filters for discovery and listing refinement | catalog-service + customer-web-next | backend, frontend, search | P2 | Review |
| feat/customer-landing-discovery-uiux | Customer landing/discovery UX refresh | customer-web-next | frontend, uiux, landing | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic landing page reference implementation for customer web | customer-web-next | frontend, uiux, reference | P3 | Review |
| feat/landing-reference-20260811 | Landing reference branch for visual/content baseline | customer-web-next | frontend, uiux | P3 | Hold |
| feat/landing-reference-refresh | Refresh of landing reference assets and page composition | customer-web-next | frontend, uiux | P3 | Hold |
| feat/customer-landing-v2-clean-20260808 | Cleaner landing V2 implementation branch | customer-web-next | frontend, uiux | P2 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing V2 changes | customer-web-next | frontend, backup | P3 | Do Not Merge |
| agent/landing-body-07cm-inset | Landing layout/body spacing tweak | customer-web-next | frontend, css, uiux | P3 | Hold |
| agent/landing-body-11cm-inset | Alternate landing spacing tweak | customer-web-next | frontend, css, uiux | P3 | Hold |

---

## Orders
n
| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder backend flow | order-service | backend, api, order domain | P1 | Ready |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment UI/UX completion | customer-web-next | frontend, bff, checkout | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer orders and tracking UX | customer-web-next | frontend, bff, orders | P1 | Review |
| agent/fix-chef-registration-and-checkout-contract | Fix checkout contract mismatches and chef registration dependencies | order-service + customer-web-next | backend, frontend, contract | P1 | Review |
| agent/order-flyway-v14-checksum | Flyway checksum repair for order-service migration history | order-service | backend, database, flyway | P0 | Ready |
| agent/razorpay-payment-switch | Payment provider switch or activation for Razorpay flows | integration-service + customer-web-next | backend, frontend, payments | P1 | Review |
| feature/backend-launch-policy-enforcement | Enforces backend launch gating/policy in order flows | order-service | backend, policy, api | P0 | Review |
| feature/backend-refund-production-readiness | Refund path production hardening | integration-service + order-service | backend, events, payments | P1 | Review |
| feature/backend-cashfree-production-hardening | Cashfree provider production hardening | integration-service | backend, payments, provider | P1 | Review |
| feature/cashfree-production-closeout-20260815 | Cashfree release closeout and finishing tasks | integration-service | backend, payments, ops | P2 | Review |
| agent/fix-full-frontend-backend-integration | Integration fixes across customer ordering flows | customer-web-next + order-service + integration-service | frontend, backend, contracts | P1 | Review |
| feature/backend-production-readiness-completion | Final backend production readiness closure branch spanning business-critical flows | multi-service backend | backend, release, ops | P0 | Hold |

---

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-ready notification delivery improvements | notification-service | backend, worker, delivery | P1 | Review |
| feature/backend-notification-recovery-operations | Backend support for notification recovery operations | notification-service | backend, admin, recovery | P1 | Review |
| feature/admin-notification-recovery-apim | APIM layer for notification recovery administration | infra + notification-service | apim, infra, admin | P2 | Review |
| feature/admin-notification-recovery-web | Admin web UX for notification recovery | admin-portal / customer-web-next | frontend, bff, admin | P2 | Review |

---

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/chef-complete-uiux | Complete chef-facing UI/UX flows | customer-web-next | frontend, uiux, chef portal | P2 | Review |
| agent/fix-chef-orders-and-customer-palette | Fix chef order screens and customer color palette alignment | customer-web-next | frontend, uiux, chef | P2 | Review |
| feature/admin-chef-review | Admin workflow for chef application review | user-chef-service + admin web | backend, frontend, admin | P1 | Review |
| feature/backend-chef-financial-ledger | Chef financial ledger backend implementation | integration-service | backend, ledger, financials | P1 | Review |
| agent/unify-chef-panel-customer-ui | Shared UI language across chef panel and customer web | customer-web-next | frontend, design-system, uiux | P2 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | Assisted branch covering customer-chef journey backend integration | user-chef-service + order-service | backend, api, cross-service | P2 | Review |

---

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-favorites-20260816 | Customer favorites backend support | user-chef-service + catalog-service | backend, api, favorites | P1 | Ready |
| feature/address-final-work | Address workflow completion | user-chef-service + customer-web-next | backend, frontend, address | P1 | Review |
| feature/address-final-work-2 | Follow-up address workflow refinement | user-chef-service + customer-web-next | backend, frontend, address | P1 | Hold |
| feature/address-final-work-3 | Additional address fixes/iteration | user-chef-service + customer-web-next | backend, frontend, address | P1 | Hold |
| feature/address-final-work-4 | Latest address iteration branch | user-chef-service + customer-web-next | backend, frontend, address | P1 | Review |
| feature/azure-maps-address-autofill | Address autofill powered by Azure Maps | user-chef-service + customer-web-next | backend, frontend, maps | P1 | Review |
| feat/customer-chef-uiux-foundation | Foundational customer and chef UI shell/shared experience | customer-web-next | frontend, uiux, foundation | P2 | Review |
| agent/customer-web-connected-ui | Customer web connected to real backend/BFF flows | customer-web-next | frontend, bff, integration | P1 | Review |
| android-build | Android/mobile related build branch, likely for customer app packaging | mobile/build | build, mobile, ci | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinement | mobile/ui | backup, mobile | P3 | Do Not Merge |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK packaging branch | mobile/build | build, qa, mobile | P3 | Do Not Merge |

---

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM or gateway custom domain behavior | infra | apim, networking, dns | P0 | Ready |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery issues | infra | afd, networking, caching | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-loading/static boot issues | infra | cdn, compression, web delivery | P0 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices | infra + customer-web-next | frontend, cdn, caching | P0 | Review |
| agent/fix-customer-web-proxy-origin | Correct proxy origin config for customer web | infra | networking, reverse-proxy, frontend delivery | P0 | Ready |
| agent/fix-front-door-cache-validation-cli-288 | Azure Front Door cache validation fix | infra | afd, cli, caching | P0 | Ready |
| agent/fix-front-door-cli-288 | Front Door CLI fix branch | infra | afd, cli | P0 | Ready |
| agent/fix-front-door-gzip-cache-bypass | Front Door gzip/cache bypass fix | infra | afd, caching, compression | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Front Door gzip rule validation correction | infra | afd, rules, compression | P0 | Ready |
| agent/fix-front-door-secret-rest | Secret restore/fix for Front Door integrations | infra | secrets, afd, ops | P0 | Review |
| agent/fix-front-door-security-policy-cli-288 | Front Door security policy CLI fix | infra | afd, security, cli | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Static gzip cold-loading remediation | infra | cdn, compression, frontend delivery | P0 | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize cache configuration for empty Front Door rules | infra | afd, cli, caching | P0 | Ready |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning | infra | afd, automation, provisioning | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF when changing AFD custom domains | infra | afd, waf, security | P0 | Ready |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic/routing in production | infra + web delivery | infra, routing, release | P0 | Review |
| ci/subscription-service-predeploy-gate | CI predeploy gate for subscription-service | ci/cd | ci, quality gates, deployment | P1 | Ready |
| docs/production-release-audit-20260821 | Production release audit and checklist branch | docs | documentation, release, audit | P2 | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider integrations | integration-service + infra | backend, ops, provider readiness | P1 | Review |
| feature/backend-admin-operations-audit | Backend admin operations auditability improvements | multi-service backend | backend, audit, admin | P1 | Review |

---

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Ad hoc branch with unclear purpose; likely accidental or temporary | unknown | unknown | P3 | Do Not Merge |
| do-not-use | Explicitly unsafe branch | unknown | unknown | P3 | Do Not Merge |
| copilot/research-task-repository-analysis | Research/analysis branch; documentation or investigation only | docs/research | docs, analysis | P3 | Do Not Merge |
| craves-master-guide-v1 | Guide/reference branch for platform documentation or release packaging | docs/product | docs, reference | P3 | Hold |
| craves-v5-patch-repack | Release repack or patch packaging branch | release engineering | build, release | P2 | Hold |
| dispatch-craves-v4 | Dispatch automation trigger branch | automation | automation, ops | P3 | Do Not Merge |
| dispatch-craves-v4-issue-trigger | Dispatch issue-trigger automation | automation | automation, ops | P3 | Do Not Merge |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen-trigger automation | automation | automation, ops | P3 | Do Not Merge |
| dispatch-craves-v4-run-2 | Dispatch run branch iteration 2 | automation | automation, ops | P3 | Do Not Merge |
| dispatch-craves-v4-run-3 | Dispatch run branch iteration 3 | automation | automation, ops | P3 | Do Not Merge |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch | automation | automation, ops | P3 | Do Not Merge |
| feature/admin-control-center-global-search | Admin global search/control-center experience | admin-portal + backend APIs | frontend, backend, admin | P2 | Review |
| feature/admin-customer-360-document-review | Customer 360 and document review experience for admins | admin-portal + user-chef-service | frontend, backend, admin | P2 | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard | admin-portal + order-service | frontend, backend, admin analytics | P2 | Review |
| feature/admin-operational-investigations-apim | APIM setup for admin operational investigations | infra + backend APIs | apim, infra, admin | P2 | Review |
| feature/admin-operational-investigations-web | Admin web experience for operational investigations | admin-portal | frontend, bff, admin | P2 | Review |
| feature/admin-subscription-operations | Admin operations for subscriptions | subscription-service + admin web | backend, frontend, admin | P1 | Review |
| feature/admin-subscription-plans | Admin subscription plan management | subscription-service + admin web | backend, frontend, admin | P1 | Review |
| feature/admin-web-operations-shell | Admin operations shell/foundation UI | admin-portal | frontend, shell, admin | P2 | Review |
| feature/admin-web-shell | Base admin shell and navigation | admin-portal | frontend, shell, admin | P2 | Ready |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | order-service + integration-service + user-chef-service | backend, api, admin | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | backend, billing, workers | P1 | Review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation | subscription-service | backend, scheduler, domain | P1 | Review |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment path | subscription-service + order-service | backend, events, fulfillment | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intent orchestration | subscription-service + integration-service | backend, payments, api | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Consumes subscription payment status updates | subscription-service | backend, events, consumer | P1 | Review |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling support | subscription-service | backend, scheduling, api | P1 | Review |

---

## Merge guidance by dependency chain

### 1. Merge first: safety and delivery path

Start with branches that reduce release risk:

- `agent/apim-gateway-domain-fix`
- `agent/disable-afd-edge-compression`
- `agent/disable-origin-gzip-for-cold-loading`
- `agent/fix-customer-web-proxy-origin`
- `agent/fix-front-door-cache-validation-cli-288`
- `agent/fix-front-door-cli-288`
- `agent/fix-front-door-gzip-cache-bypass`
- `agent/fix-front-door-gzip-rule-validation`
- `agent/fix-front-door-security-policy-cli-288`
- `agent/normalize-empty-front-door-cache-cli-288`
- `agent/preserve-afd-custom-domain-waf`
- `ci/subscription-service-predeploy-gate`

### 2. Merge next: auth and admin security

- `feature/backend-redis-abuse-revocation`
- `agent/backend-internal-admin-rbac`
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-admin-account-intervention`
- `feature/admin-account-intervention-apim`
- `feature/admin-account-intervention-web`

### 3. Merge core customer journey and order flow

- `backend-customer-favorites-20260816`
- `backend-customer-reorder-20260816`
- `feature/azure-maps-address-autofill`
- one chosen address branch, preferably latest validated branch (`feature/address-final-work-4` after comparing against earlier iterations)
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-orders-tracking-uiux`
- `agent/fix-full-frontend-backend-integration`
- `agent/razorpay-payment-switch`

### 4. Merge chef and admin operating capabilities

- `feature/admin-chef-review`
- `feature/backend-chef-financial-ledger`
- `feat/chef-complete-uiux`
- `feature/admin-dashboard-v2`
- `feature/admin-control-center-global-search`
- `feature/admin-web-shell`
- `feature/admin-web-operations-shell`

### 5. Merge subscription program branches as a set

These are interdependent and should be reviewed together:

- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`
- `feature/admin-subscription-operations`
- `feature/admin-subscription-plans`

### 6. Do not merge without explicit approval

- `accidental-ignore-7`
- `do-not-use`
- all `backup/` branches
- all `dispatch-` branches
- `build/qa-mobile-apk-2026-08-20`
- exploratory/reference-only branches unless product explicitly wants them

---

## Notes

- This inventory is based on the currently visible repository branches at generation time.
- Some branches appear to be iterative variants of the same feature; compare before merging to avoid duplicate work.
- Where branch intent is not explicit from the name alone, readiness is conservatively marked as **Review**, **Hold**, or **Do Not Merge**.
- For address, landing, and UI reference branches, choose one canonical successor branch before merge to avoid conflicting implementations.
