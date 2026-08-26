# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the branch inventory and merge handover for the Craves platform. It lists every currently visible branch in the repository, groups them by functional domain, and provides merge guidance based on branch naming, repository architecture, and the currently committed service boundaries on `main`.

---

## Branch naming convention

Observed branch prefixes in this repository:

- `main` — primary integration branch and source of truth
- `agent/*` — autonomous or assisted implementation/fix branches, often release, infra, UI integration, APIM, AFD, routing, and production-readiness work
- `feature/*` — feature delivery branches, usually backend/admin/platform/domain enhancements
- `feat/*` — frontend or UI/UX oriented feature branches
- `backend-*` — direct backend feature branches outside the `feature/` namespace
- `backup/*` — snapshot/backup branches; should not usually be merged without explicit review
- `build/*` — build artifact or QA packaging branches
- `ci/*` — CI/CD or deployment pipeline hardening branches
- `docs/*` — documentation and audit branches
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation branches
- `dispatch-*`, `android-build`, `craves-*`, `do-not-use`, `accidental-*` — operational, legacy, packaging, or non-standard branches requiring extra caution

Recommended branch taxonomy going forward:

- Use `feature/<domain>-<capability>` for product work
- Use `agent/<area>-<fix>` for tactical corrective work
- Use `feat/<app>-<ux-scope>` for frontend-only UX iterations
- Use `docs/<topic>` for documentation
- Use `ci/<topic>` for pipeline changes
- Reserve `backup/*`, `dispatch-*`, `do-not-use`, and `accidental-*` as non-merge-by-default lines

---

## Merge policy

### General

1. Merge into `main` only through reviewed PRs.
2. Prefer squash merge for narrow tactical branches; prefer rebase or merge commit only when commit history matters.
3. Validate impacted service contracts before merge:
   - `auth-service`
   - `catalog-service`
   - `order-service`
   - `notification-service`
   - `integration-service`
   - `subscription-service`
   - `user-chef-service`
   - `apps/customer-web-next`
4. For backend branches, require Flyway migration review and backward-compatibility checks.
5. For BFF/frontend branches, validate Next.js route contracts against backend APIs.
6. For infra/release branches, require environment verification, APIM/AFD validation, and rollback notes.
7. Do not merge backup, dispatch, accidental, or explicitly unsafe branches without incident-level justification.

### Readiness legend

- **Ready** — appears targeted and mergeable after normal PR validation
- **Review** — likely useful but requires manual verification, regression testing, or dependency sequencing
- **Hold** — merge only after prerequisite branches or release checks land
- **Do Not Merge** — archival, backup, trigger, or unsafe branch

### Priority legend

- **P0** — platform/release blocker or production correctness
- **P1** — major feature or operational capability
- **P2** — important enhancement or UX completion
- **P3** — optional, exploratory, packaging, or archival

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC expansion and auth enforcement refinement | auth-service | Backend, security, API, RBAC, Flyway | P1 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-on RBAC hardening/version 2 for internal admin access controls | auth-service | Backend, security, API, RBAC, Flyway | P1 | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token revocation improvements | auth-service | Backend, security, Redis, JWT, filters | P0 | Review |
| feature/backend-admin-account-intervention | Backend support for admin account intervention workflows | auth-service | Backend, admin API, audit, security | P1 | Review |
| feature/admin-account-intervention-apim | APIM exposure/routing for admin account intervention APIs | auth-service / APIM | API gateway, routing, policy | P1 | Hold |
| feature/admin-account-intervention-web | Admin web UI for account intervention flows | apps/customer-web-next | Frontend, admin UI, BFF, auth integration | P1 | Hold |
| agent/fix-backend-connected-signed-in-flows | Fix authenticated connected flows across frontend/backend session handling | auth-service + customer-web-next | Backend, frontend, BFF, auth/session | P0 | Review |
| agent/fix-chef-entry-and-session-routing | Fix chef entrypoints and authenticated routing/session behavior | auth-service + customer-web-next | Frontend, routing, session, BFF | P1 | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens discovery-first experience using catalog geography capabilities | catalog-service + customer-web-next | Backend, frontend, discovery, geospatial, BFF | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Second iteration of nearby discovery flow and ranking/presentation | catalog-service + customer-web-next | Backend, frontend, discovery, geospatial, BFF | P1 | Review |
| feature/advanced-search-smart-filters | Advanced discovery/search filtering for kitchens and menu items | catalog-service + customer-web-next | Backend, frontend, search UX, filtering | P1 | Review |
| backend-customer-favorites-20260816 | Customer favorites backend support tied to catalog and profile surfaces | user-chef-service + catalog-service | Backend, API, favorites, BFF contracts | P1 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX refinement | apps/customer-web-next | Frontend, UX, discovery, landing | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic landing page/reference implementation for discovery and entry flows | apps/customer-web-next | Frontend, marketing UI, discovery entry | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing v2 branch for customer discovery/home | apps/customer-web-next | Frontend, landing UI, discovery | P2 | Review |
| feat/landing-reference-20260811 | Landing reference implementation used for design calibration | apps/customer-web-next | Frontend, reference UI | P3 | Review |
| feat/landing-reference-refresh | Refresh of landing reference assets and interactions | apps/customer-web-next | Frontend, reference UI | P3 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 work | apps/customer-web-next | Frontend snapshot | P3 | Do Not Merge |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder capability aligned with RepeatOrder flows | order-service | Backend, API, reorder, order history | P1 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX completion | apps/customer-web-next | Frontend, cart, checkout, payments, BFF | P1 | Review |
| feat/customer-orders-tracking-uiux | Orders and live tracking UI/UX completion | apps/customer-web-next | Frontend, orders, tracking, BFF | P1 | Review |
| agent/fix-chef-registration-and-checkout-contract | Fix contract mismatches affecting chef registration and checkout paths | order-service + customer-web-next | Backend, frontend, contracts, checkout | P0 | Review |
| agent/order-flyway-v14-checksum | Repair or reconcile order-service Flyway checksum for V14 pricing migration | order-service | Backend, Flyway, DB migration | P0 | Hold |
| feature/backend-launch-policy-enforcement | Launch policy enforcement around order/release gating | order-service | Backend, policy, API, release gating | P1 | Review |
| feature/backend-refund-production-readiness | Production readiness for refund processing and status flows | integration-service + order-service | Backend, refunds, async, readiness | P1 | Review |
| feature/cashfree-production-closeout-20260815 | Payment provider production closeout impacting checkout completion | integration-service + order-service | Backend, payments, reconciliation | P1 | Review |
| agent/razorpay-payment-switch | Razorpay payment provider switch or routing update | integration-service + customer-web-next | Backend, frontend, payments, BFF | P1 | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Harden notification delivery channels for production | notification-service | Backend, workers, email/push, delivery | P1 | Review |
| feature/backend-notification-recovery-operations | Backend recovery operations for failed notification delivery | notification-service | Backend, admin API, recovery ops, workers | P1 | Review |
| feature/admin-notification-recovery-apim | APIM exposure for notification recovery admin APIs | notification-service / APIM | API gateway, admin routing, policy | P1 | Hold |
| feature/admin-notification-recovery-web | Admin web console for notification recovery workflows | apps/customer-web-next | Frontend, admin UI, notification ops, BFF | P1 | Hold |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/chef-complete-uiux | Complete chef-side UI/UX across onboarding, kitchen, menu, orders, and earnings | apps/customer-web-next | Frontend, chef UI, BFF | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared customer/chef UI foundation and design system alignment | apps/customer-web-next | Frontend, shared UI, navigation, shells | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow implementation | user-chef-service + customer-web-next | Backend, frontend, admin UI, review workflow | P1 | Review |
| agent/fix-chef-orders-and-customer-palette | Fix chef order surfaces and align customer-facing palette/theme | apps/customer-web-next | Frontend, chef UI, orders, styling | P2 | Review |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI shell/navigation patterns | apps/customer-web-next | Frontend, shared shell, navigation | P2 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch covering integrated customer-chef journey behavior | user-chef-service + order-service + customer-web-next | Backend, frontend, profile, journey flows | P2 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/address-final-work | Finalize customer address flow iteration 1 | user-chef-service + customer-web-next | Backend, frontend, address, maps, BFF | P1 | Review |
| feature/address-final-work-2 | Finalize customer address flow iteration 2 | user-chef-service + customer-web-next | Backend, frontend, address, maps, BFF | P1 | Review |
| feature/address-final-work-3 | Finalize customer address flow iteration 3 | user-chef-service + customer-web-next | Backend, frontend, address, maps, BFF | P1 | Review |
| feature/address-final-work-4 | Finalize customer address flow iteration 4 | user-chef-service + customer-web-next | Backend, frontend, address, maps, BFF | P1 | Review |
| feature/azure-maps-address-autofill | Azure Maps-driven address autofill and recommendation UX | user-chef-service + customer-web-next | Backend, frontend, maps, geocoding, BFF | P1 | Review |
| agent/customer-web-connected-ui | Connected customer web UI using live backend/BFF integrations | apps/customer-web-next | Frontend, BFF, integration, signed-in UX | P1 | Review |
| agent/fix-customer-web-proxy-origin | Fix proxy origin behavior for customer-web API routing | apps/customer-web-next | Frontend, BFF, proxy, networking | P0 | Review |
| agent/fix-full-frontend-backend-integration | Full-stack integration fixes across customer experiences | customer-web-next + multiple services | Frontend, backend, BFF, contracts | P0 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM custom domain or gateway domain configuration | Platform/Infra | APIM, DNS, gateway, release | P0 | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery/runtime issues | Platform/Infra | AFD, CDN, compression, caching | P0 | Review |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to improve cold-load behavior | Platform/Infra | CDN, origin, gzip, caching | P0 | Review |
| agent/fix-cold-device-static-loading | Fix static asset loading issues on cold devices | Platform/Infra + customer-web-next | CDN, static assets, frontend delivery | P0 | Review |
| agent/fix-front-door-cache-validation-cli-288 | Resolve AFD cache validation issue tied to CLI-288 | Platform/Infra | AFD, cache rules, validation | P0 | Review |
| agent/fix-front-door-cli-288 | Core fix branch for Azure Front Door issue CLI-288 | Platform/Infra | AFD, CDN, routing | P0 | Review |
| agent/fix-front-door-gzip-cache-bypass | Adjust gzip/cache bypass behavior in Front Door | Platform/Infra | AFD, compression, caching | P0 | Review |
| agent/fix-front-door-gzip-rule-validation | Validate/correct Front Door gzip rule handling | Platform/Infra | AFD, rules engine, caching | P0 | Review |
| agent/fix-front-door-secret-rest | Repair secret handling for Front Door automation or REST config | Platform/Infra | Secrets, AFD, deployment automation | P0 | Review |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy for CLI-288 rollout | Platform/Infra | AFD, WAF/security policy | P0 | Review |
| agent/fix-static-gzip-cold-loading | Fix static gzip serving behavior on cold loads | Platform/Infra + customer-web-next | CDN, frontend delivery, gzip | P0 | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config/state in Front Door rollout | Platform/Infra | AFD, cache config | P1 | Review |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door custom domain provisioning | Platform/Infra | AFD, automation, provisioning | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF association during AFD custom domain changes | Platform/Infra | AFD, WAF, automation | P0 | Review |
| agent/fix-chef-release-traffic-verification | Verify release traffic behavior for chef surface rollout | Platform/Infra + customer-web-next | Release engineering, routing, validation | P1 | Review |
| feature/backend-production-readiness-completion | Complete backend production readiness hardening | Multiple backend services | Backend, ops, readiness, config | P0 | Review |
| feature/backend-cashfree-production-hardening | Harden Cashfree integration for production | integration-service | Backend, payments, provider hardening | P1 | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider orchestration | integration-service | Backend, delivery integrations, ops | P1 | Review |
| ci/subscription-service-predeploy-gate | Pre-deploy CI/CD gate for subscription-service | subscription-service | CI/CD, quality gates, deployment | P1 | Review |
| build/qa-mobile-apk-2026-08-20 | QA/mobile build packaging branch | Mobile/Build | Build, packaging, QA | P3 | Review |
| android-build | Android build line or packaging branch | Mobile/Build | Build, Android packaging | P3 | Review |
| docs/production-release-audit-20260821 | Production release audit documentation | Platform/Docs | Docs, audit, release ops | P2 | Ready |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Non-standard incidental branch; likely temporary or accidental state | Unknown | Misc | P3 | Do Not Merge |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup branch before mobile UI refinement | Frontend/Mobile | Snapshot, UI backup | P3 | Do Not Merge |
| copilot/research-task-repository-analysis | AI-generated repository analysis branch | Docs/Research | Docs, analysis | P3 | Do Not Merge |
| craves-master-guide-v1 | General guide or packaging branch | Docs/Platform | Docs, reference | P3 | Review |
| craves-v5-patch-repack | Repackaging/patch preparation branch | Platform/Release | Packaging, release | P2 | Review |
| dispatch-craves-v4 | Dispatch or automation trigger branch | Ops/Automation | Automation, triggers | P3 | Do Not Merge |
| dispatch-craves-v4-issue-trigger | Issue-trigger automation branch | Ops/Automation | Automation, triggers | P3 | Do Not Merge |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger automation branch | Ops/Automation | Automation, triggers | P3 | Do Not Merge |
| dispatch-craves-v4-run-2 | Dispatch run branch iteration 2 | Ops/Automation | Automation, triggers | P3 | Do Not Merge |
| dispatch-craves-v4-run-3 | Dispatch run branch iteration 3 | Ops/Automation | Automation, triggers | P3 | Do Not Merge |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | Ops/Automation | Automation, scheduler | P3 | Do Not Merge |
| do-not-use | Explicitly unsafe/non-target branch | Unknown | Misc | P3 | Do Not Merge |
| feature/admin-control-center-global-search | Admin global search / control center lookup experience | customer-web-next + backend admin APIs | Frontend, backend, admin search, BFF | P1 | Review |
| feature/admin-customer-360-document-review | Admin customer 360 and document review workflow | user-chef-service + customer-web-next | Backend, frontend, admin UI, document review | P1 | Review |
| feature/admin-dashboard-v2 | Admin dashboard v2 implementation | order-service + customer-web-next | Backend, frontend, analytics, admin UI | P1 | Review |
| feature/admin-operational-investigations-apim | APIM layer for admin operational investigation APIs | integration-service / APIM | Gateway, admin API, policy | P1 | Hold |
| feature/admin-operational-investigations-web | Admin operational investigations web console | customer-web-next | Frontend, admin UI, ops investigation, BFF | P1 | Hold |
| feature/admin-subscription-operations | Admin tooling for subscription lifecycle operations | subscription-service + customer-web-next | Backend, frontend, admin ops, BFF | P1 | Review |
| feature/admin-subscription-plans | Admin management for subscription plans | subscription-service + customer-web-next | Backend, frontend, plan management, BFF | P1 | Review |
| feature/admin-web-operations-shell | Admin operations shell/navigation foundation | customer-web-next | Frontend, admin shell, navigation | P2 | Review |
| feature/admin-web-shell | Admin shell/base layout foundation | customer-web-next | Frontend, admin shell, navigation | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | integration-service + order-service | Backend, admin API, ops investigation, audit | P1 | Review |
| feature/backend-admin-operations-audit | Audit trail support for admin operations | multiple backend services | Backend, audit, admin ops | P1 | Review |
| feature/backend-chef-financial-ledger | Chef financial ledger and payout/accounting support | integration-service | Backend, ledger, finance, admin APIs | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | Backend, billing, workers, APIs | P1 | Review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation and scheduling | subscription-service | Backend, scheduler, projections, APIs | P1 | Review |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment flow | subscription-service + order-service | Backend, async, fulfillment, integration | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and orchestration | integration-service + subscription-service | Backend, payments, APIs, workers | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Payment status consumption for subscription lifecycle updates | subscription-service + integration-service | Backend, consumers, async, billing | P1 | Review |
| feature/backend-subscription-plan-schedules | Plan schedule management and publication | subscription-service | Backend, API, schedules, policy | P1 | Review |
| main | Default branch; target for integration and documentation | Repository | Git, release integration | P0 | Ready |

---

## Merge sequencing guidance

Recommended merge order to reduce conflicts and rollout risk:

1. **Infra and platform correctness first**
   - Front Door/APIM/domain/security fixes
   - gzip/cache/static loading fixes
   - CI predeploy gates and release audits
2. **Auth and admin security next**
   - RBAC
   - Redis abuse revocation
   - admin account intervention backend before APIM/web
3. **Backend production readiness branches**
   - payment, refund, notification, delivery provider hardening
4. **Subscription and admin backends**
   - billing lifecycle
   - occurrence generation
   - plan schedules
   - payment intents/status consumers
5. **Customer and chef UX integration branches**
   - connected UI
   - cart/checkout/payment
   - orders/tracking
   - chef complete UIUX
   - address/autofill flows
6. **Admin web branches after API readiness**
   - dashboard/search/operations/customer-360/subscription ops
7. **Never merge by default**
   - `backup/*`
   - `dispatch-*`
   - `do-not-use`
   - `accidental-ignore-7`

---

## Branch inventory summary by category

- Auth: 8
- Catalog: 10
- Orders: 9
- Notifications: 4
- Chef: 6
- Customer: 8
- Infra: 20
- Feature: 35

**Total:** 100
