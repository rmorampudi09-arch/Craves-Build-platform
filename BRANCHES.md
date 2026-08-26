# BRANCHES.md

Repository: `rmorampudi09-arch/Craves-Build-platform`  
Date: `2026-08-26`  
Total branch count: **100**

## Branch naming convention

This repository currently uses a mixed branch taxonomy that reflects delivery stage, ownership, and scope:

- `main` — stable integration branch for production-ready documentation and coordinated merges.
- `agent/*` — autonomous or assisted implementation/fix branches, commonly spanning infra, frontend integration, release hardening, and tactical corrections.
- `feature/*` — product or platform feature branches, usually scoped to a backend capability, admin feature, or cross-service enhancement.
- `feat/*` — frontend or UX-focused feature branches, typically customer/chef/admin web experience work.
- `backend-*` — backend-only implementation spikes or feature deliveries using date-stamped naming.
- `backup/*` — safety snapshot branches kept before larger UI or landing-page refinements.
- `build/*` — build artifact or QA packaging branches.
- `ci/*` — CI/CD or deployment gate changes.
- `docs/*` — release audits and documentation work.
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation branches.
- `dispatch-*` — automation/trigger/scheduler related dispatch branches.
- singleton utility branches like `android-build`, `do-not-use`, `accidental-ignore-7`, `craves-*` — special-case branches that should be reviewed carefully before any merge.

## Merge policy

1. **Merge target**: all approved work should merge into `main` through reviewed PRs only.
2. **Service validation first**:
   - Backend branches must pass service build, migration validation, and impacted integration checks.
   - Frontend branches must pass route/API contract validation and smoke checks.
   - Infra branches must be validated against environment safety, domain, caching, WAF, and compression behavior.
3. **Prefer thematic merge order**:
   - Infra and gateway safety fixes
   - Auth/security and admin governance
   - Core backend platform readiness
   - Notifications and operational recovery
   - Customer and chef UI integration
   - Lower-priority experiments, backups, and legacy utility branches
4. **Do not fast-track these without manual review**:
   - `do-not-use`
   - `accidental-ignore-7`
   - `backup/*`
   - `dispatch-*`
5. **Merge readiness meanings**:
   - `Ready` — branch purpose appears clear and likely mergeable after normal PR checks.
   - `Review required` — merge only after domain-owner validation.
   - `Caution` — branch is operationally sensitive, legacy, backup, or ambiguous.
   - `Hold` — should not merge until explicitly approved.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation for privileged operations. | auth-service | Backend API, security, persistence | High | Review required |
| feature/backend-internal-admin-rbac-v2 | Follow-up or refined internal admin RBAC rollout. | auth-service | Backend API, security, DB migration | High | Review required |
| feature/backend-redis-abuse-revocation | Redis-backed token abuse protection and revocation controls. | auth-service | Backend API, Redis, security | High | Ready |
| feature/backend-admin-account-intervention | Backend support for admin account intervention and identity control. | auth-service | Backend API, admin ops, persistence | High | Ready |
| feature/admin-account-intervention-apim | API management or gateway exposure for admin account intervention endpoints. | auth-service | APIM, backend integration, security | High | Review required |
| feature/admin-account-intervention-web | Admin web UX for account intervention workflows. | auth-service | Web UI, BFF/API integration, admin UX | High | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Prioritizes nearby kitchen discovery experience. | catalog-service | Backend API, discovery, frontend integration | High | Ready |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby-first discovery ranking and UX. | catalog-service | Backend API, discovery, frontend integration | High | Review required |
| feature/advanced-search-smart-filters | Advanced search and smart filtering for catalog/discovery. | catalog-service | Search UX, backend query layer, frontend filters | High | Review required |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder flow leveraging prior order history. | order-service | Backend API, order domain, customer UX | High | Ready |
| agent/order-flyway-v14-checksum | Fix for order-service Flyway V14 checksum mismatch. | order-service | DB migration, backend maintenance | High | Ready |
| feature/backend-launch-policy-enforcement | Launch policy enforcement in ordering and release gates. | order-service | Backend API, policy enforcement, platform controls | High | Review required |
| feature/backend-admin-operations-audit | Admin operations audit trail for order/backoffice actions. | order-service | Backend API, admin ops, persistence | Medium | Ready |
| feature/backend-admin-investigation-apis | Investigation APIs for operational or customer-order incidents. | order-service | Backend API, admin ops, query endpoints | High | Ready |
| feature/admin-operational-investigations-apim | APIM layer for operational investigation endpoints. | order-service | APIM, backend integration, admin ops | Medium | Review required |
| feature/admin-operational-investigations-web | Admin web UI for operational investigations. | order-service | Web UI, BFF/API integration, admin UX | Medium | Ready |
| feature/admin-customer-360-document-review | Customer 360 and document review experience for support workflows. | order-service | Admin web, backend integration, ops tooling | Medium | Review required |
| feature/admin-dashboard-v2 | Enhanced operational/admin dashboard iteration. | order-service | Admin web, backend summary APIs, analytics UI | Medium | Ready |
| feature/admin-control-center-global-search | Global admin search across operational records. | order-service | Admin UI, search, backend integration | Medium | Review required |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-grade notification delivery hardening. | notification-service | Backend API, delivery workers, provider adapters | High | Ready |
| feature/backend-notification-recovery-operations | Recovery and retry operations for failed notification delivery. | notification-service | Backend API, recovery workflows, admin ops | High | Ready |
| feature/admin-notification-recovery-apim | APIM surface for notification recovery endpoints. | notification-service | APIM, backend integration, admin ops | Medium | Review required |
| feature/admin-notification-recovery-web | Admin web for notification recovery and retry management. | notification-service | Web UI, BFF/API integration, admin UX | Medium | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry routing and authenticated session transitions. | customer-web-next / auth-service | Web routing, auth/session, frontend integration | High | Ready |
| agent/fix-chef-orders-and-customer-palette | Fix chef orders experience and align palette styling. | customer-web-next / order-service | Frontend UI, order UX, design system | Medium | Ready |
| agent/fix-chef-registration-and-checkout-contract | Repair chef registration and checkout contract mismatches. | user-chef-service / order-service | API contracts, backend integration, frontend BFF | High | Review required |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer-facing UI conventions. | customer-web-next | Web UI, design system, app shell | Medium | Review required |
| feat/chef-complete-uiux | End-to-end chef UX/UI completion branch. | customer-web-next / user-chef-service | Web UI, chef flows, BFF integration | High | Review required |
| feature/admin-chef-review | Admin workflow for chef application review. | user-chef-service | Backend API, admin UI, document review | High | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger and earnings accounting support. | integration-service | Backend API, payments, ledger persistence | High | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to real backend/BFF flows. | customer-web-next | Web UI, BFF routes, backend integration | High | Ready |
| agent/fix-backend-connected-signed-in-flows | Fix authenticated customer signed-in journeys end to end. | customer-web-next / auth-service | Auth/session, frontend integration, backend API | High | Ready |
| agent/fix-full-frontend-backend-integration | Full frontend-backend integration stabilization across customer flows. | customer-web-next / multi-service | Web UI, BFF, backend integration | High | Review required |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved items. | user-chef-service / catalog-service | Backend API, favorites persistence, BFF integration | High | Ready |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch for improving customer-chef journey flows. | multi-service | Backend API, frontend flow integration | Medium | Review required |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UX/UI enhancement. | customer-web-next / order-service / integration-service | Web UI, BFF, payments | High | Ready |
| feat/customer-chef-uiux-foundation | Shared customer-chef UI foundation and design scaffolding. | customer-web-next | Design system, web UI, app shell | Medium | Review required |
| feat/customer-landing-discovery-uiux | Customer landing and discovery experience improvements. | customer-web-next / catalog-service | Web UI, discovery UX, BFF integration | High | Ready |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UX improvements. | customer-web-next / order-service | Web UI, BFF, delivery tracking | High | Ready |
| feature/address-final-work | Customer address finalization workstream. | user-chef-service / customer-web-next | Address APIs, web forms, geolocation | High | Review required |
| feature/address-final-work-2 | Iteration 2 of customer address completion. | user-chef-service / customer-web-next | Address APIs, web forms, geolocation | High | Review required |
| feature/address-final-work-3 | Iteration 3 of customer address completion. | user-chef-service / customer-web-next | Address APIs, web forms, geolocation | High | Review required |
| feature/address-final-work-4 | Iteration 4 of customer address completion. | user-chef-service / customer-web-next | Address APIs, web forms, geolocation | High | Review required |
| feature/azure-maps-address-autofill | Azure Maps powered address autofill for customer addresses. | user-chef-service / customer-web-next | Maps integration, web forms, geocoding | High | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM or gateway custom domain handling. | Infra / APIM | Gateway, DNS/domain, edge config | High | Review required |
| agent/backend-completion-guarded-release | Guarded release branch for backend completion rollout. | Platform | Release management, backend integration, CI/CD | High | Review required |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery issues. | Infra / Front Door | CDN/edge, compression, platform ops | High | Review required |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-start/static loading issues. | Infra / Front Door | Edge config, origin behavior, perf | Medium | Review required |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic routing and release safety. | Infra / Release | Traffic routing, validation, release ops | Medium | Review required |
| agent/fix-cold-device-static-loading | Resolve static asset loading issues on cold devices. | Infra / Frontend delivery | CDN, static assets, client perf | Medium | Ready |
| agent/fix-customer-web-proxy-origin | Fix proxy origin configuration for customer web. | Infra / Frontend delivery | Reverse proxy, origin routing, web delivery | High | Ready |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix tied to CLI-288. | Infra / Front Door | CDN cache, rule validation, ops | Medium | Review required |
| agent/fix-front-door-cli-288 | General Front Door remediation for CLI-288. | Infra / Front Door | Edge routing, infra config, ops | Medium | Review required |
| agent/fix-front-door-gzip-cache-bypass | Fix cache bypass behavior around gzip handling in Front Door. | Infra / Front Door | CDN cache, compression, edge rules | Medium | Review required |
| agent/fix-front-door-gzip-rule-validation | Validate and fix Front Door gzip rules. | Infra / Front Door | Edge rules, compression, config validation | Medium | Review required |
| agent/fix-front-door-secret-rest | Restore or fix Front Door secret management integration. | Infra / Front Door | Secrets, infra config, deployment safety | High | Review required |
| agent/fix-front-door-security-policy-cli-288 | Correct Front Door security policy behavior for CLI-288. | Infra / Front Door | WAF/security policy, edge config | High | Review required |
| agent/fix-static-gzip-cold-loading | Static gzip fix for cold-loading behavior. | Infra / Frontend delivery | CDN/static assets, compression, perf | Medium | Review required |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache settings for Front Door. | Infra / Front Door | Cache policy, edge config, ops | Medium | Review required |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning. | Infra / Front Door | Domain automation, edge provisioning, ops | Medium | Review required |
| agent/preserve-afd-custom-domain-waf | Preserve custom domain WAF behavior during Front Door changes. | Infra / Front Door | WAF, domain config, security | High | Review required |
| android-build | Android build-focused branch for mobile packaging or fixes. | Mobile / Build | Android build, packaging, CI | Medium | Review required |
| build/qa-mobile-apk-2026-08-20 | QA APK build branch for mobile testing. | Mobile / Build | Build pipeline, artifact packaging, QA | Low | Ready |
| ci/subscription-service-predeploy-gate | Pre-deploy CI gate for subscription-service. | CI/CD | Pipeline rules, deployment safety, service gating | High | Ready |
| docs/production-release-audit-20260821 | Production release audit and documentation updates. | Documentation / Release | Docs, release audit, ops | Medium | Ready |
| feature/admin-web-operations-shell | Admin operations shell or backoffice app shell. | customer-web-next / admin platform | Web shell, admin UX, navigation | Medium | Review required |
| feature/admin-web-shell | Base admin shell foundation for internal operations. | customer-web-next / admin platform | Web shell, layout, app infrastructure | Medium | Review required |
| feature/backend-cashfree-production-hardening | Cashfree production hardening for payments. | integration-service | Payments, provider integration, backend ops | High | Ready |
| feature/backend-delivery-provider-production-readiness | Production-readiness work for delivery provider integrations. | integration-service | Delivery integration, backend ops, provider adapters | High | Ready |
| feature/backend-production-readiness-completion | Final backend production readiness sweep. | Platform / multi-service | Backend integration, release hardening, ops | High | Review required |
| feature/backend-refund-production-readiness | Refund workflow production hardening. | integration-service / order-service | Refund processing, backend ops, provider integration | High | Ready |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout tasks and cleanup. | integration-service | Payments, provider ops, release cleanup | Medium | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation. | subscription-service | Backend API, billing, persistence | High | Ready |
| feature/backend-subscription-occurrence-generator | Generate subscription occurrences and recurring fulfillment windows. | subscription-service | Backend workers, scheduling, persistence | High | Ready |
| feature/backend-subscription-order-fulfillment | Order fulfillment pipeline for subscription orders. | subscription-service / order-service | Backend integration, fulfillment, events | High | Ready |
| feature/backend-subscription-payment-intents | Payment intent support for subscriptions. | subscription-service / integration-service | Payments, backend API, provider integration | High | Ready |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | Event consumer, billing state, backend integration | High | Ready |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling and plan calendar support. | subscription-service | Backend API, scheduling, persistence | High | Ready |
| feature/admin-subscription-operations | Admin operations workflows for subscriptions. | subscription-service / admin web | Admin UI, backend ops, subscription support | High | Ready |
| feature/admin-subscription-plans | Admin management for subscription plans. | subscription-service / admin web | Admin UI, backend APIs, plan management | High | Ready |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Ambiguous branch; likely a temporary or mistake branch and should not be merged casually. | Unknown | Misc/unknown | Low | Hold |
| agent/landing-body-07cm-inset | Landing page layout refinement with 0.7cm inset change. | customer-web-next | Web UI, styling, landing page | Low | Review required |
| agent/landing-body-11cm-inset | Landing page layout refinement with 1.1cm inset change. | customer-web-next | Web UI, styling, landing page | Low | Review required |
| agent/razorpay-payment-switch | Switch or validate Razorpay as payment provider path. | integration-service / customer-web-next | Payments, backend integration, checkout UX | High | Review required |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 work. | customer-web-next | Backup/snapshot | Low | Caution |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinement. | Mobile / customer-web-next | Backup/snapshot | Low | Caution |
| copilot/research-task-repository-analysis | AI-generated repository research branch. | Documentation / analysis | Docs, analysis, research artifacts | Low | Caution |
| craves-master-guide-v1 | Master guide or repository guide branch. | Documentation / platform | Docs, repository guidance | Low | Review required |
| craves-v5-patch-repack | Patch repackaging branch for a v5 release artifact. | Release / platform | Release packaging, ops | Low | Caution |
| dispatch-craves-v4 | Dispatch automation baseline branch. | Automation / dispatch | Automation, scripting, release ops | Low | Caution |
| dispatch-craves-v4-issue-trigger | Dispatch automation issue trigger branch. | Automation / dispatch | Automation, issue hooks, ops | Low | Caution |
| dispatch-craves-v4-reopen-trigger | Dispatch automation reopen trigger branch. | Automation / dispatch | Automation, issue hooks, ops | Low | Caution |
| dispatch-craves-v4-run-2 | Dispatch run variant 2. | Automation / dispatch | Automation, scheduling, ops | Low | Caution |
| dispatch-craves-v4-run-3 | Dispatch run variant 3. | Automation / dispatch | Automation, scheduling, ops | Low | Caution |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch. | Automation / dispatch | Scheduling, automation, ops | Low | Caution |
| do-not-use | Explicitly non-mergeable branch. | Unknown | Misc/unknown | Low | Hold |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 implementation. | customer-web-next | Web UI, landing UX, styling | Medium | Ready |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for landing page. | customer-web-next | Web UI, semantic structure, landing UX | Low | Review required |
| feat/landing-reference-20260811 | Landing page reference implementation from 2026-08-11. | customer-web-next | Web UI, reference design | Low | Review required |
| feat/landing-reference-refresh | Refresh of landing reference assets or implementation. | customer-web-next | Web UI, styling, reference design | Low | Review required |

---

## Full branch inventory

For audit completeness, the repository branches included in this document are:

- accidental-ignore-7
- agent/apim-gateway-domain-fix
- agent/backend-completion-guarded-release
- agent/backend-internal-admin-rbac
- agent/customer-web-connected-ui
- agent/disable-afd-edge-compression
- agent/disable-origin-gzip-for-cold-loading
- agent/fix-backend-connected-signed-in-flows
- agent/fix-chef-entry-and-session-routing
- agent/fix-chef-orders-and-customer-palette
- agent/fix-chef-registration-and-checkout-contract
- agent/fix-chef-release-traffic-verification
- agent/fix-cold-device-static-loading
- agent/fix-customer-web-proxy-origin
- agent/fix-front-door-cache-validation-cli-288
- agent/fix-front-door-cli-288
- agent/fix-front-door-gzip-cache-bypass
- agent/fix-front-door-gzip-rule-validation
- agent/fix-front-door-secret-rest
- agent/fix-front-door-security-policy-cli-288
- agent/fix-full-frontend-backend-integration
- agent/fix-static-gzip-cold-loading
- agent/landing-body-07cm-inset
- agent/landing-body-11cm-inset
- agent/nearby-kitchens-first-discovery
- agent/nearby-kitchens-first-discovery-v2
- agent/normalize-empty-front-door-cache-cli-288
- agent/order-flyway-v14-checksum
- agent/parallel-front-door-domain-provisioning
- agent/preserve-afd-custom-domain-waf
- agent/razorpay-payment-switch
- agent/unify-chef-panel-customer-ui
- android-build
- backend-customer-favorites-20260816
- backend-customer-reorder-20260816
- backup/customer-web-before-landing-v2-20260808
- backup/mobile-ui-before-home-refinement-2026-08-16
- build/qa-mobile-apk-2026-08-20
- chatgpt/backend-customer-chef-journey-20260819
- ci/subscription-service-predeploy-gate
- copilot/research-task-repository-analysis
- craves-master-guide-v1
- craves-v5-patch-repack
- dispatch-craves-v4
- dispatch-craves-v4-issue-trigger
- dispatch-craves-v4-reopen-trigger
- dispatch-craves-v4-run-2
- dispatch-craves-v4-run-3
- dispatch-craves-v4-schedule
- do-not-use
- docs/production-release-audit-20260821
- feat/chef-complete-uiux
- feat/customer-cart-checkout-payment-uiux
- feat/customer-chef-uiux-foundation
- feat/customer-landing-discovery-uiux
- feat/customer-landing-v2-clean-20260808
- feat/customer-orders-tracking-uiux
- feat/customer-web-semantic-reference-landing
- feat/landing-reference-20260811
- feat/landing-reference-refresh
- feature/address-final-work
- feature/address-final-work-2
- feature/address-final-work-3
- feature/address-final-work-4
- feature/admin-account-intervention-apim
- feature/admin-account-intervention-web
- feature/admin-chef-review
- feature/admin-control-center-global-search
- feature/admin-customer-360-document-review
- feature/admin-dashboard-v2
- feature/admin-notification-recovery-apim
- feature/admin-notification-recovery-web
- feature/admin-operational-investigations-apim
- feature/admin-operational-investigations-web
- feature/admin-subscription-operations
- feature/admin-subscription-plans
- feature/admin-web-operations-shell
- feature/admin-web-shell
- feature/advanced-search-smart-filters
- feature/azure-maps-address-autofill
- feature/backend-admin-account-intervention
- feature/backend-admin-investigation-apis
- feature/backend-admin-operations-audit
- feature/backend-cashfree-production-hardening
- feature/backend-chef-financial-ledger
- feature/backend-delivery-provider-production-readiness
- feature/backend-internal-admin-rbac-v2
- feature/backend-launch-policy-enforcement
- feature/backend-notification-production-delivery
- feature/backend-notification-recovery-operations
- feature/backend-production-readiness-completion
- feature/backend-redis-abuse-revocation
- feature/backend-refund-production-readiness
- feature/backend-subscription-billing-lifecycle
- feature/backend-subscription-occurrence-generator
- feature/backend-subscription-order-fulfillment
- feature/backend-subscription-payment-intents
- feature/backend-subscription-payment-status-consumer
- feature/backend-subscription-plan-schedules
- feature/cashfree-production-closeout-20260815
