# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated date:** 2026-08-26  
**Total branch count:** 100

This document is the single-source branch inventory for the Craves Build Platform. It captures every currently listed GitHub branch and groups them into delivery domains to support review, sequencing, and merge planning.

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — autonomous or assisted implementation, infra fixes, release fixes, connected UI work
- `feature/` — long-lived product or backend feature work
- `feat/` — UI/UX or frontend feature slices
- `backend-` — backend-focused implementation branches without `feature/` prefix
- `backup/` — restore points / preservation branches, not intended as direct merge candidates unless explicitly approved
- `build/` — build artifact or QA build support branches
- `ci/` — CI/CD gating or deployment workflow changes
- `docs/` — documentation or release audit branches
- `chatgpt/`, `copilot/` — AI-assisted research or implementation branches
- unprefixed special branches such as `android-build`, `craves-master-guide-v1`, `dispatch-*`, `do-not-use`, `accidental-ignore-7`

Recommended interpretation:

1. Prefer merging product-bearing `feature/`, `feat/`, `backend-`, and validated `agent/` branches.
2. Treat `backup/`, `dispatch-*`, `do-not-use`, and `accidental-ignore-*` as non-merge operational branches unless manually justified.
3. Route admin, APIM, and infra-affecting branches through environment validation before merge.

## Merge policy

### Standard merge order

1. **Infra / platform safety fixes**
   - APIM, Front Door, compression, domain, cache, CI, readiness gates
2. **Backend contract and platform hardening**
   - auth, payments, notifications, refund, delivery, subscription lifecycle, RBAC
3. **Domain features**
   - catalog, orders, chef, customer, notifications preferences/ops
4. **Frontend / UX branches**
   - customer-web, landing, checkout, chef/admin shells
5. **Documentation / audit branches**

### Merge readiness guidance

- **Ready** — clear scope, mergeable after standard CI + smoke tests
- **Validate** — likely mergeable but requires targeted QA, contract checks, or infra verification
- **Hold** — preserve branch, do not merge until product or release owner approves
- **Do not merge** — operational/archive branches not intended for `main`

### Merge mechanics

- Rebase onto latest `main` before PR where branch is stale.
- Validate Flyway migration ordering for backend branches.
- Validate public/internal/admin route contracts for frontend-connected branches.
- For infra branches, verify Front Door/APIM/WAF/domain configuration in non-prod before production rollout.
- Prefer PR merge with squash unless preserving commit history is operationally important.

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC hardening for auth/admin access flows | auth-service | Spring Boot, Security, JDBC, Redis, Flyway | High | Validate |
| feature/backend-internal-admin-rbac-v2 | Expanded v2 internal admin RBAC implementation | auth-service | Spring Boot, Security, JDBC, Redis, Flyway | High | Validate |
| feature/backend-admin-account-intervention | Backend account intervention APIs and controls for admin operations | auth-service | Spring Boot, Security, JDBC, Flyway, admin APIs | High | Validate |
| feature/admin-account-intervention-apim | APIM exposure/policy work for admin account intervention | infra + auth-service | APIM, routing, policy, admin API surface | High | Validate |
| feature/admin-account-intervention-web | Admin web workflow for account intervention operations | admin-portal / customer-web-next | Next.js, BFF routes, admin UX | High | Validate |
| feature/admin-web-shell | Foundational admin web shell for secured admin workflows | admin-portal / customer-web-next | Next.js, layout, auth guards, BFF | Medium | Validate |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens-first discovery experience and catalog discovery emphasis | catalog-service + customer-web-next | Spring Boot, JDBC, discovery APIs, Next.js | High | Validate |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby-first discovery with refined discovery flow | catalog-service + customer-web-next | Spring Boot, JDBC, discovery APIs, Next.js | High | Validate |
| feature/advanced-search-smart-filters | Rich search/filter enhancements over catalog discovery | catalog-service | Spring Boot, JDBC, search/filter APIs, frontend integration | Medium | Validate |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder capability built on prior order history | order-service | Spring Boot, JDBC, cart/order APIs, frontend hooks | High | Validate |
| agent/fix-chef-orders-and-customer-palette | Fixes affecting chef order views and related customer UI presentation | order-service + customer-web-next | Spring Boot APIs, Next.js UI, route fixes | High | Validate |
| agent/fix-chef-registration-and-checkout-contract | Contract alignment across chef registration and checkout flow | order-service + auth-service + customer-web-next | API contracts, validation, frontend BFF | High | Validate |
| agent/order-flyway-v14-checksum | Order service Flyway checksum correction for migration continuity | order-service | Flyway, PostgreSQL, deployment safety | High | Ready |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment user experience polish | customer-web-next + order-service/integration-service proxies | Next.js, BFF, payment UX, checkout UI | High | Validate |
| feat/customer-orders-tracking-uiux | Order history and tracking experience improvements | customer-web-next + order-service | Next.js, BFF, order tracking pages | Medium | Validate |
| agent/fix-backend-connected-signed-in-flows | Signed-in backend-connected customer flow fixes across order/profile/session surfaces | order-service + auth-service + customer-web-next | APIs, session flows, BFF | High | Validate |
| agent/fix-full-frontend-backend-integration | End-to-end integration fixes across frontend and backend domains including ordering flows | multi-service | Next.js, BFF, Spring Boot APIs, contracts | High | Validate |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-grade notification delivery workflows and channel reliability | notification-service | Spring Boot, JDBC, FCM, ACS Email, workers | High | Validate |
| feature/backend-notification-recovery-operations | Recovery operations for failed notification processing | notification-service | Spring Boot, JDBC, admin ops, workers | High | Validate |
| feature/admin-notification-recovery-apim | APIM exposure for notification recovery admin endpoints | infra + notification-service | APIM, policies, admin API exposure | Medium | Validate |
| feature/admin-notification-recovery-web | Admin recovery console for notification operations | admin-portal / customer-web-next | Next.js, admin BFF, ops UI | Medium | Validate |
| feature/notification-preference-center | User notification preference center with durable preference storage and APIs | notification-service | Spring Boot, JDBC, Flyway, preference APIs | High | Ready |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-chef-review | Admin chef application review workflow | user-chef-service + admin-portal | Spring Boot, JDBC, admin pages, document review | High | Validate |
| feat/chef-complete-uiux | Broad chef experience UI/UX completion | customer-web-next chef surface | Next.js, chef routes, BFF, UI components | High | Validate |
| feature/backend-chef-financial-ledger | Chef financial ledger and settlement visibility backend | integration-service | Spring Boot, JDBC, financial ledger, admin/internal APIs | High | Validate |
| feat/customer-chef-uiux-foundation | Shared customer/chef experience foundation including chef-adjacent flows | customer-web-next | Next.js, shared components, BFF | Medium | Validate |
| agent/fix-chef-entry-and-session-routing | Chef routing and session entry fixes | customer-web-next + auth-service | Next.js routing, auth/session, middleware | High | Ready |
| agent/fix-chef-release-traffic-verification | Production verification of chef release traffic paths | infra + chef web surface | routing, traffic validation, release verification | Medium | Validate |
| agent/unify-chef-panel-customer-ui | Unifies chef panel and customer-facing UI conventions | customer-web-next | Next.js, design system, route composition | Medium | Validate |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-favorites-20260816 | Backend support for customer favorites | user-chef-service / catalog-service integration | Spring Boot, JDBC, favorites APIs | High | Validate |
| feature/address-final-work | Customer address flow completion | user-chef-service + customer-web-next | Spring Boot, Azure Maps, Next.js BFF | Medium | Validate |
| feature/address-final-work-2 | Follow-up address workflow refinement | user-chef-service + customer-web-next | Spring Boot, Azure Maps, Next.js BFF | Medium | Validate |
| feature/address-final-work-3 | Additional address UX/API completion work | user-chef-service + customer-web-next | Spring Boot, Azure Maps, Next.js BFF | Medium | Validate |
| feature/address-final-work-4 | Finalized address workflow iteration | user-chef-service + customer-web-next | Spring Boot, Azure Maps, Next.js BFF | Medium | Validate |
| feature/azure-maps-address-autofill | Address autofill using Azure Maps geospatial services | user-chef-service + customer-web-next | Azure Maps, Spring Boot, Next.js | High | Validate |
| feat/customer-landing-discovery-uiux | Customer landing/discovery UX enhancement | customer-web-next | Next.js, landing/discovery UI | Medium | Validate |
| feat/customer-landing-v2-clean-20260808 | Customer landing v2 cleanup and refinement | customer-web-next | Next.js, frontend styling, routing | Medium | Validate |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing implementation improvements | customer-web-next | Next.js, content structure, SEO semantics | Low | Validate |
| feat/landing-reference-20260811 | Landing reference branch for frontend exploration | customer-web-next | Next.js, layout/content reference | Low | Hold |
| feat/landing-reference-refresh | Refreshed landing reference implementation | customer-web-next | Next.js, layout/content reference | Low | Hold |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 work | customer-web-next | source backup | Low | Do not merge |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile/home refinement | mobile/customer-web-next | source backup | Low | Do not merge |
| agent/customer-web-connected-ui | Connected customer web UI tied to live backend contracts | customer-web-next | Next.js, BFF, contract wiring | High | Validate |
| agent/fix-customer-web-proxy-origin | Proxy origin fix for customer web backend communication | customer-web-next + infra | Next.js proxy/BFF, origin config | High | Ready |
| agent/landing-body-07cm-inset | Landing page presentation tweak branch | customer-web-next | CSS/layout | Low | Hold |
| agent/landing-body-11cm-inset | Alternate landing page presentation tweak branch | customer-web-next | CSS/layout | Low | Hold |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM gateway custom domain behavior | infra | Azure APIM, DNS, gateway config | High | Validate |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to fix delivery behavior | infra | Azure Front Door, CDN policy | High | Validate |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to improve cold-loading reliability | infra | Front Door/origin config, caching | High | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix related to CLI-288 | infra | Azure Front Door, cache rules, IaC/scripts | High | Validate |
| agent/fix-front-door-cli-288 | Front Door fix branch for CLI-288 issue set | infra | Azure Front Door, IaC/scripts | High | Validate |
| agent/fix-front-door-gzip-cache-bypass | Gzip/cache bypass fix in Front Door path | infra | Azure Front Door, caching/compression | High | Validate |
| agent/fix-front-door-gzip-rule-validation | Validate and correct Front Door gzip rules | infra | Azure Front Door, rule engine | Medium | Validate |
| agent/fix-front-door-secret-rest | Front Door secret/config restoration or fix | infra | Azure Front Door, secrets/config | High | Validate |
| agent/fix-front-door-security-policy-cli-288 | Security policy correction for Front Door / WAF | infra | Azure Front Door, WAF, security policies | High | Validate |
| agent/fix-cold-device-static-loading | Static asset cold-load fix on devices | infra + frontend delivery | CDN/static hosting, caching | High | Validate |
| agent/fix-static-gzip-cold-loading | Static gzip loading fix for cold starts | infra + frontend delivery | CDN/static hosting, compression | High | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalization fix for empty cache configuration states | infra | Azure Front Door, cache policy | Medium | Validate |
| agent/parallel-front-door-domain-provisioning | Parallelized domain provisioning for Front Door rollout | infra | Azure Front Door, automation/scripts | Medium | Validate |
| agent/preserve-afd-custom-domain-waf | Preserve WAF while adjusting AFD custom domains | infra | Azure Front Door, WAF, domain config | High | Validate |
| ci/subscription-service-predeploy-gate | Predeploy CI gate for subscription service | CI/CD | pipeline YAML, deploy validation | High | Ready |
| docs/production-release-audit-20260821 | Production release audit documentation and checkpoints | release/docs | documentation, release process | Medium | Ready |
| build/qa-mobile-apk-2026-08-20 | QA mobile build branch for APK validation | mobile/build | CI/build scripts, mobile packaging | Low | Hold |
| android-build | Android build support branch | mobile/build | build tooling, mobile packaging | Low | Hold |
| agent/fix-chef-release-traffic-verification | Release traffic verification for chef paths in production | infra | routing, diagnostics, release verification | Medium | Validate |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or scratch branch; no merge intent implied | unknown | operational branch | Low | Do not merge |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch for customer-chef backend journey flows | multi-service | Spring Boot APIs, contracts | Medium | Validate |
| copilot/research-task-repository-analysis | AI research branch for repository analysis | docs/research | documentation, analysis artifacts | Low | Hold |
| craves-master-guide-v1 | Master guide/reference branch | docs/platform | documentation | Low | Hold |
| craves-v5-patch-repack | Packaging/repack branch for release patch work | release/ops | release packaging | Low | Hold |
| dispatch-craves-v4 | Dispatch automation branch for v4 run management | operations | automation/workflow | Low | Do not merge |
| dispatch-craves-v4-issue-trigger | Dispatch trigger automation from issue events | operations | automation/workflow | Low | Do not merge |
| dispatch-craves-v4-reopen-trigger | Dispatch trigger automation for reopen events | operations | automation/workflow | Low | Do not merge |
| dispatch-craves-v4-run-2 | Dispatch run branch variant | operations | automation/workflow | Low | Do not merge |
| dispatch-craves-v4-run-3 | Dispatch run branch variant | operations | automation/workflow | Low | Do not merge |
| dispatch-craves-v4-schedule | Dispatch schedule automation branch | operations | automation/workflow | Low | Do not merge |
| do-not-use | Explicitly non-merge branch | unknown | operational branch | Low | Do not merge |
| feature/admin-control-center-global-search | Admin global search/control center capability | admin-portal + backend APIs | Next.js, admin APIs, search UX | Medium | Validate |
| feature/admin-customer-360-document-review | Admin customer 360 and document review workflow | user-chef-service + admin-portal | Spring Boot, JDBC, admin UI | High | Validate |
| feature/admin-dashboard-v2 | Admin dashboard v2 refresh | admin-portal + order/integration APIs | Next.js, dashboards, BFF | Medium | Validate |
| feature/admin-operational-investigations-apim | APIM layer for admin operational investigation APIs | infra + backend APIs | APIM, policies, admin exposure | Medium | Validate |
| feature/admin-operational-investigations-web | Web console for admin operational investigations | admin-portal | Next.js, investigation UX | Medium | Validate |
| feature/admin-subscription-operations | Admin operational workflows for subscriptions | subscription-service + admin-portal | Spring Boot, JDBC, admin UX | High | Validate |
| feature/admin-subscription-plans | Admin plan review and plan operations | subscription-service + admin-portal | Spring Boot, JDBC, admin UX | High | Validate |
| feature/admin-web-operations-shell | Admin operations shell/foundation | admin-portal | Next.js, layout, operations shell | Medium | Validate |
| feature/backend-admin-investigation-apis | Backend APIs supporting operational investigations | integration-service / order-service / auth-service | Spring Boot, JDBC, admin APIs | High | Validate |
| feature/backend-admin-operations-audit | Backend audit trail for admin ops | multi-service backend | Spring Boot, JDBC, audit, Flyway | High | Validate |
| feature/backend-cashfree-production-hardening | Cashfree payment hardening for production | integration-service | Spring Boot, JDBC, payments, webhooks | High | Validate |
| feature/backend-delivery-provider-production-readiness | Delivery provider readiness and production hardening | integration-service | Spring Boot, JDBC, provider orchestration, workers | High | Validate |
| feature/backend-launch-policy-enforcement | Launch policy enforcement in backend flows | order-service / multi-service | Spring Boot, AOP/policy, JDBC | High | Validate |
| feature/backend-production-readiness-completion | General backend production readiness closeout | multi-service backend | Spring Boot, ops hardening, config | High | Validate |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token revocation hardening | auth-service + cross-service security | Redis, Spring Security, JWT | High | Validate |
| feature/backend-refund-production-readiness | Refund workflow hardening for production | integration-service + order-service | Spring Boot, JDBC, refund status handling | High | Validate |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | Spring Boot, JDBC, workers, billing events | High | Validate |
| feature/backend-subscription-occurrence-generator | Generator for subscription occurrences | subscription-service | Spring Boot, JDBC, schedulers, Flyway | High | Validate |
| feature/backend-subscription-order-fulfillment | Subscription order fulfillment orchestration | subscription-service + order-service | Spring Boot, JDBC, internal APIs | High | Validate |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and handling | integration-service + subscription-service | Spring Boot, JDBC, payment APIs | High | Validate |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events | subscription-service | Spring Boot, JDBC, async consumers | High | Validate |
| feature/backend-subscription-plan-schedules | Subscription plan schedule management backend | subscription-service | Spring Boot, JDBC, schedule APIs | High | Validate |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout follow-up branch | integration-service | payments, release closeout | Medium | Validate |

## Complete branch inventory by category mapping

For auditability, every branch currently listed by GitHub is represented above. Category assignment rules used:

- **Auth:** auth, admin account intervention, RBAC, secured admin shell work
- **Catalog:** discovery, nearby kitchens, search/filter catalog enhancements
- **Orders:** cart, checkout, reorder, tracking, order contract and order-platform fixes
- **Notifications:** delivery, recovery, preference center, notification admin operations
- **Chef:** chef workflows, chef UI, chef reviews, chef financials
- **Customer:** landing, favorites, addresses, customer web and session-related customer UX branches
- **Infra:** APIM, Front Door, gzip/cache/domain/WAF, CI/build/release audit
- **Feature:** documentation, dispatch, release utility, admin cross-domain, subscription platform, payment hardening, and other uncategorized product/platform branches

## Merge recommendations summary

### Merge first

- `ci/subscription-service-predeploy-gate`
- `agent/fix-customer-web-proxy-origin`
- `agent/fix-chef-entry-and-session-routing`
- `agent/order-flyway-v14-checksum`
- `feature/notification-preference-center`

### Merge after targeted QA

- Front Door/APIM branches under `agent/` and `feature/*apim`
- Payment/refund/delivery hardening branches under `feature/backend-*`
- Admin operations and subscription branches under `feature/admin-*` and `feature/backend-subscription-*`
- Connected UI branches under `feat/*` and `agent/customer-web-connected-ui`

### Preserve only

- `backup/*`
- `dispatch-*`
- `do-not-use`
- `accidental-ignore-7`
- reference or repack branches unless specifically requested by release owners
