# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

> This document inventories all branches returned by GitHub `list_branches` page 1 with `per_page=100` on 2026-08-26. It is intended to be the team handover and merge-planning source of truth.

## Branch naming convention

Observed branch families in this repository:

- `main` *(not returned in this page of results; merge target assumed by task instructions)*
- `agent/*` — autonomous implementation, infra fixes, frontend/backend integration, release hardening
- `feature/*` — product or platform feature branches, generally production-oriented
- `feat/*` — UI/UX or frontend-focused feature work
- `backend-*` — backend domain enhancements with dated suffixes
- `backup/*` — preservation branches; do not merge unless specifically restoring state
- `build/*` — build artifacts or QA packaging work
- `ci/*` — deployment or pipeline gating changes
- `docs/*` — documentation/audit deliverables
- `chatgpt/*`, `copilot/*` — AI-assisted exploratory/research or generated implementation work
- `dispatch-*`, `craves-*`, `android-build`, `accidental-*`, `do-not-use` — operational, legacy, packaging, or special-purpose branches requiring manual review

## Merge policy

1. **Preferred merge target:** `main`.
2. **Merge order:**
   - Infra/platform safety fixes
   - Backend foundations and API changes
   - Admin/internal tooling
   - Customer/chef experience branches
   - Documentation, backup, and operational branches only as needed
3. **Before merge:**
   - Verify branch diff against latest `main`
   - Confirm Flyway migration ordering and checksum safety
   - Validate service ownership and contract compatibility across `apps/customer-web-next` and backend services
   - Run smoke/regression checks for auth, catalog, checkout, orders, notifications, and subscriptions
4. **Do not merge without explicit justification:**
   - `backup/*`
   - `do-not-use`
   - `accidental-ignore-7`
   - dispatch/trigger branches unless they contain deliberate release automation updates
5. **Readiness labels used here:**
   - **Ready** — branch purpose is clear and likely mergeable after standard validation
   - **Review** — likely useful but needs code review, rebase, and regression testing
   - **Hold** — preserve only, restore only, or operational branch not intended for normal merge

## Category: Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC backend work for auth/admin authorization flows. | auth-service | Backend API, Security, RBAC, Flyway | High | Review |
| feature/admin-account-intervention-apim | APIM/API layer for admin account intervention workflow. | auth-service / API gateway | APIM, Backend API, Admin | High | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention requests and review. | apps/customer-web-next admin | Frontend, BFF, Admin UI | High | Review |
| feature/backend-admin-account-intervention | Backend implementation of account intervention operations already aligned with auth-service domain. | auth-service | Backend API, Security, Persistence | High | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up or hardened RBAC implementation for internal admins. | auth-service | Backend API, Security, RBAC, Flyway | High | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token revocation hardening for auth/session flows. | auth-service | Security, Redis, Backend API | High | Review |
| agent/fix-backend-connected-signed-in-flows | Fix signed-in customer/chef/admin flows dependent on auth/session integrity. | auth-service + customer-web-next | Frontend, BFF, Backend API, Auth | High | Review |

## Category: Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens discovery experience aligned with existing catalog discovery APIs. | catalog-service / customer-web-next | Backend API, Discovery, Frontend | High | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby discovery; likely UX and ranking refinement. | catalog-service / customer-web-next | Backend API, Discovery, Frontend | High | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX improvements leveraging catalog/discovery data. | apps/customer-web-next | Frontend, Discovery UI, BFF | Medium | Review |
| feature/advanced-search-smart-filters | Search/filtering enhancement for discovery/catalog browsing. | catalog-service / customer-web-next | Backend API, Frontend, Search UX | High | Review |

## Category: Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder / repeat-order flow matching existing order-service capability. | order-service | Backend API, Orders, Customer flows | High | Review |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment user experience improvements. | apps/customer-web-next / order-service / integration-service | Frontend, BFF, Checkout, Payments | High | Review |
| feat/customer-orders-tracking-uiux | Customer orders and tracking experience improvements aligned to order/delivery APIs. | apps/customer-web-next / order-service | Frontend, BFF, Orders, Tracking | High | Review |
| agent/fix-chef-registration-and-checkout-contract | Contract fix affecting chef onboarding and checkout integration. | order-service + user-chef-service + frontend | Backend API, Contracts, Frontend | High | Review |
| agent/order-flyway-v14-checksum | Repair or reconcile order-service Flyway checksum at V14. | order-service | Flyway, Backend, Database | High | Review |
| feature/backend-launch-policy-enforcement | Checkout or order launch policy enforcement for guarded releases. | order-service | Backend API, AOP/Policy, Orders | High | Review |
| feature/backend-refund-production-readiness | Refund operations hardening across order lifecycle. | order-service / integration-service | Backend API, Refunds, Async workflows | High | Review |

## Category: Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | API/APIM exposure for notification recovery operations. | notification-service / API gateway | APIM, Backend API, Admin | High | Review |
| feature/admin-notification-recovery-web | Admin UI for recovery and replay of notification operations. | apps/customer-web-next admin | Frontend, BFF, Admin UI | High | Review |
| feature/backend-notification-production-delivery | Production delivery hardening for app/email/push notifications. | notification-service | Backend API, Workers, Delivery adapters | High | Review |
| feature/backend-notification-recovery-operations | Recovery/retry tooling for notification failures. | notification-service | Backend API, Admin, Workers | High | Review |

## Category: Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/chef-complete-uiux | Full chef panel UI/UX pass across application, kitchen, menu, orders, and operations. | apps/customer-web-next chef | Frontend, BFF, Chef UI | High | Review |
| feature/admin-chef-review | Admin chef application review workflow and supporting backoffice tools. | user-chef-service / admin web | Backend API, Frontend, Admin review | High | Review |
| feature/backend-chef-financial-ledger | Chef financial ledger and earnings backend. | integration-service | Backend API, Finance, Persistence | High | Review |
| agent/fix-chef-entry-and-session-routing | Chef entry/session routing fixes in frontend and auth-protected navigation. | apps/customer-web-next / auth-service | Frontend, Auth, Routing | High | Review |
| agent/fix-chef-orders-and-customer-palette | Chef orders UX plus customer design palette adjustments. | apps/customer-web-next / order-service | Frontend, BFF, Orders UI | Medium | Review |
| agent/fix-chef-release-traffic-verification | Release traffic verification for chef-facing production rollout. | Infra / chef web | Infra, Release, Frontend validation | Medium | Review |
| agent/unify-chef-panel-customer-ui | Shared UI shell or design system unification across chef and customer surfaces. | apps/customer-web-next | Frontend, Design system, BFF | Medium | Review |

## Category: Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-favorites-20260816 | Customer favorites backend support aligned with existing favorites APIs. | user-chef-service / catalog-service | Backend API, Customer profile, Favorites | High | Review |
| feat/customer-chef-uiux-foundation | Shared customer/chef UX foundation and application shell improvements. | apps/customer-web-next | Frontend, Design system, Routing | Medium | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing page v2 customer experience refresh. | apps/customer-web-next | Frontend, Marketing UI | Medium | Review |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing implementation for customer web. | apps/customer-web-next | Frontend, Accessibility, SEO | Medium | Review |
| feature/address-final-work | Address flow completion; likely customer address CRUD or recommendation refinement. | user-chef-service / customer-web-next | Frontend, BFF, Backend API, Maps | High | Review |
| feature/address-final-work-2 | Iteration on address work; follow-up fixes or cleanup. | user-chef-service / customer-web-next | Frontend, BFF, Backend API, Maps | Medium | Review |
| feature/address-final-work-3 | Additional address flow iteration. | user-chef-service / customer-web-next | Frontend, BFF, Backend API, Maps | Medium | Review |
| feature/address-final-work-4 | Final address follow-up branch. | user-chef-service / customer-web-next | Frontend, BFF, Backend API, Maps | Medium | Review |
| feature/azure-maps-address-autofill | Azure Maps powered address autofill for customer address capture. | user-chef-service / customer-web-next | Frontend, Maps, BFF, Backend integration | High | Review |
| agent/customer-web-connected-ui | Connected UI branch wiring customer screens to live backend/BFF contracts. | apps/customer-web-next | Frontend, BFF, API integration | High | Review |
| agent/fix-customer-web-proxy-origin | Proxy/origin fix for customer-web API routing. | apps/customer-web-next / edge config | Frontend, BFF, Infra | High | Review |
| agent/fix-full-frontend-backend-integration | End-to-end integration fixes across customer flows. | apps/customer-web-next + backend services | Frontend, BFF, Backend API | High | Review |
| agent/landing-body-07cm-inset | Landing page layout refinement. | apps/customer-web-next | Frontend, Marketing UI | Low | Review |
| agent/landing-body-11cm-inset | Alternate landing page layout refinement. | apps/customer-web-next | Frontend, Marketing UI | Low | Review |
| feat/landing-reference-20260811 | Landing page reference branch. | apps/customer-web-next | Frontend, Marketing UI | Low | Review |
| feat/landing-reference-refresh | Refresh of landing reference implementation. | apps/customer-web-next | Frontend, Marketing UI | Low | Review |

## Category: Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | APIM gateway domain correction. | infra / apps/api | APIM, DNS, Gateway | High | Review |
| agent/backend-completion-guarded-release | Guarded release coordination for backend completion. | multi-service backend | Release, CI/CD, Backend | High | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to resolve asset/runtime issues. | infra | CDN, Azure Front Door, Edge config | Medium | Review |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-loading behavior. | infra | CDN, Origin config, Performance | Medium | Review |
| agent/fix-cold-device-static-loading | Static asset loading fix for cold devices. | infra / frontend delivery | CDN, Frontend, Performance | Medium | Review |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix tied to CLI issue 288. | infra | Azure Front Door, CLI, Cache | Medium | Review |
| agent/fix-front-door-cli-288 | Front Door CLI issue remediation. | infra | Azure Front Door, CLI | Medium | Review |
| agent/fix-front-door-gzip-cache-bypass | Gzip/cache bypass rule correction in Front Door. | infra | CDN, Cache rules | Medium | Review |
| agent/fix-front-door-gzip-rule-validation | Rule validation fix for gzip handling in Front Door. | infra | CDN, Validation, Edge rules | Medium | Review |
| agent/fix-front-door-secret-rest | Secret or REST config fix for Front Door provisioning. | infra | Secrets, Azure, Edge | High | Review |
| agent/fix-front-door-security-policy-cli-288 | Front Door security policy remediation. | infra | WAF/Security, Azure Front Door | High | Review |
| agent/fix-static-gzip-cold-loading | Static gzip loading fix for cold-start clients. | infra / frontend delivery | CDN, Performance, Frontend | Medium | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache settings in Front Door automation. | infra | CDN, CLI automation | Low | Review |
| agent/parallel-front-door-domain-provisioning | Parallelized domain provisioning at Front Door edge. | infra | Automation, Azure Front Door, DNS | Medium | Review |
| agent/preserve-afd-custom-domain-waf | Preserve custom domain/WAF attachments during Front Door updates. | infra | WAF, CDN, Provisioning | High | Review |
| agent/razorpay-payment-switch | Payment provider switch logic or environment cutover to Razorpay. | integration-service / frontend / infra | Payments, Config, Backend API, Frontend | High | Review |
| android-build | Android/mobile build branch. | mobile/build pipeline | Build, Mobile, Packaging | Medium | Review |
| build/qa-mobile-apk-2026-08-20 | QA APK packaging branch. | mobile/build pipeline | Build, QA, Mobile | Low | Review |
| ci/subscription-service-predeploy-gate | CI/predeploy gate for subscription-service rollout safety. | subscription-service / CI | CI/CD, Deployment, Backend | High | Review |
| feature/backend-cashfree-production-hardening | Production hardening of Cashfree integration. | integration-service | Payments, Backend API, Webhooks | High | Review |
| feature/backend-delivery-provider-production-readiness | Delivery provider production readiness work. | integration-service | Delivery integrations, Async, Backend | High | Review |
| feature/backend-production-readiness-completion | Cross-backend production readiness completion branch. | multi-service backend | Release, Observability, Backend | High | Review |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout and finalization work. | integration-service | Payments, Backend API, Ops | High | Review |

## Category: Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Special-purpose or accidental branch; not a normal merge candidate. | unknown | Misc | Low | Hold |
| backup/customer-web-before-landing-v2-20260808 | Backup branch preserving customer web state before landing v2. | apps/customer-web-next | Frontend backup | Low | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup branch preserving mobile UI before refinement. | mobile/frontend | Frontend backup | Low | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch for customer-chef journey work. | multi-service backend / frontend | Backend API, Frontend, BFF | Medium | Review |
| copilot/research-task-repository-analysis | Research/analysis branch, likely non-production documentation or investigation. | docs / repository analysis | Documentation, Research | Low | Hold |
| craves-master-guide-v1 | Master guide or packaging/reference branch. | docs / release | Documentation | Low | Review |
| craves-v5-patch-repack | Patch repack or release packaging branch. | release engineering | Packaging, Build | Medium | Review |
| dispatch-craves-v4 | Dispatch/release automation branch. | release engineering | Automation, Ops | Low | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue-trigger automation branch. | release engineering | Automation, Ops | Low | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen-trigger automation branch. | release engineering | Automation, Ops | Low | Hold |
| dispatch-craves-v4-run-2 | Dispatch run branch for operational automation. | release engineering | Automation, Ops | Low | Hold |
| dispatch-craves-v4-run-3 | Dispatch run branch for operational automation. | release engineering | Automation, Ops | Low | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch. | release engineering | Automation, Ops | Low | Hold |
| do-not-use | Explicit non-merge branch. | unknown | Misc | Low | Hold |
| docs/production-release-audit-20260821 | Documentation branch containing production release audit. | docs | Documentation, Audit | Medium | Review |
| feature/admin-control-center-global-search | Admin global search/control center enhancement. | admin web / user-chef-service | Frontend, BFF, Backend API, Search | High | Review |
| feature/admin-customer-360-document-review | Admin customer 360 and document review workflow. | admin web / user-chef-service / auth-service | Frontend, Backend API, Admin tooling | High | Review |
| feature/admin-dashboard-v2 | Admin dashboard iteration. | admin web / order-service | Frontend, BFF, Backend API, Analytics | High | Review |
| feature/admin-operational-investigations-apim | APIM/API support for operational investigations. | order-service / integration-service / API gateway | APIM, Backend API, Admin | High | Review |
| feature/admin-operational-investigations-web | Admin web investigation console. | apps/customer-web-next admin | Frontend, BFF, Admin UI | High | Review |
| feature/admin-subscription-operations | Admin operations for subscription management and incident handling. | subscription-service / admin web | Backend API, Frontend, Admin ops | High | Review |
| feature/admin-subscription-plans | Admin plan management experience. | subscription-service / admin web | Backend API, Frontend, Admin | High | Review |
| feature/admin-web-operations-shell | Admin operations shell/framework branch. | apps/customer-web-next admin | Frontend, App shell, BFF | Medium | Review |
| feature/admin-web-shell | Foundational admin shell branch. | apps/customer-web-next admin | Frontend, App shell | Medium | Review |
| feature/backend-admin-investigation-apis | Backend APIs for operational/admin investigations. | order-service / integration-service | Backend API, Admin, Audit | High | Review |
| feature/backend-admin-operations-audit | Backend operational auditing enhancements. | order-service / integration-service / auth-service | Backend API, Audit, Persistence | High | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation. | subscription-service | Backend API, Billing, Workers | High | Review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation backend logic. | subscription-service | Backend API, Scheduler, Persistence | High | Review |
| feature/backend-subscription-order-fulfillment | Subscription-to-order fulfillment workflow. | subscription-service / order-service | Backend API, Async workflow, Orders | High | Review |
| feature/backend-subscription-payment-intents | Subscription payment intents orchestration. | integration-service / subscription-service | Backend API, Payments, Async | High | Review |
| feature/backend-subscription-payment-status-consumer | Payment status consumer for subscription lifecycle completion. | subscription-service / integration-service | Backend API, Event consumer, Payments | High | Review |
| feature/backend-subscription-plan-schedules | Plan schedule backend support and management. | subscription-service | Backend API, Scheduling, Persistence | High | Review |

## Merge guidance summary

### Recommended first-wave merges

1. `agent/apim-gateway-domain-fix`
2. `agent/fix-customer-web-proxy-origin`
3. `feature/backend-redis-abuse-revocation`
4. `feature/backend-internal-admin-rbac-v2`
5. `feature/backend-cashfree-production-hardening`
6. `feature/backend-delivery-provider-production-readiness`
7. `feature/backend-notification-production-delivery`
8. `feature/backend-subscription-billing-lifecycle`
9. `feature/backend-subscription-occurrence-generator`
10. `feature/backend-subscription-order-fulfillment`

### Merge after dependency verification

- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`
- `feature/backend-refund-production-readiness`
- `feature/backend-launch-policy-enforcement`
- `feature/admin-subscription-operations`
- `feature/admin-subscription-plans`
- `feature/admin-dashboard-v2`
- `feature/admin-control-center-global-search`
- `feature/admin-customer-360-document-review`

### UI/UX branches to consolidate before merge

- `feat/chef-complete-uiux`
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-chef-uiux-foundation`
- `feat/customer-landing-discovery-uiux`
- `feat/customer-orders-tracking-uiux`
- `agent/unify-chef-panel-customer-ui`
- landing reference and inset branches

### Do not merge by default

- `backup/*`
- `dispatch-*`
- `do-not-use`
- `accidental-ignore-7`
- exploratory/research-only branches unless intentionally promoted
