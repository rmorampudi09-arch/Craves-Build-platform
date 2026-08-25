# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-25  
**Total branch count:** 100

## Branch naming convention

The current repository uses a mixed but understandable branch taxonomy:

- `agent/*` — autonomous agent fixes, release hardening, infra repair, integration patches, UI connection work
- `feature/*` — product or platform feature branches intended for review and merge
- `feat/*` — UI/UX focused feature work, often frontend-heavy
- `backend-*` / `chatgpt/*` — backend domain work from prior implementation streams
- `backup/*` — snapshot safety branches; do not merge unless recovering lost work
- `build/*` / `ci/*` — build validation and deployment gate branches
- `docs/*` — documentation and audit branches
- `dispatch-*` — automation, scheduling, and workflow trigger branches
- ad hoc branches like `android-build`, `do-not-use`, `accidental-ignore-7` — operational or disposable branches requiring manual judgment

### Recommended naming moving forward

Use: `<type>/<domain>-<capability>`

Examples:
- `feature/auth-session-hardening`
- `feature/catalog-universal-search`
- `feature/orders-scheduled-orders`
- `feature/notifications-recovery-dashboard`
- `feature/infra-front-door-cache-policy`

## Merge policy

### Base rules

1. Merge into `main` only through reviewed PRs.
2. Prefer **squash merge** for small focused changes, **merge commit** for large feature streams where commit history matters.
3. Require green CI for touched services, frontend apps, infra validation, and contract checks where applicable.
4. For `backup/*`, `dispatch-*`, `do-not-use`, and accidental branches, do **not** merge by default.
5. For infra and APIM branches, validate in lower environments before merge.
6. For backend branches touching payments, subscriptions, refunds, auth, or delivery, require API/contract verification and rollback notes.
7. If two branches overlap in the same domain, merge the more complete or newer variant first and either rebase or close duplicates.

### Merge readiness scale used below

- **Ready** — likely merge candidate after normal PR validation
- **Needs validation** — substantial work exists but requires QA, integration, or release checks
- **Sequenced** — should merge after another dependency branch
- **Hold** — backup, disposable, duplicate, or operational-only branch

### Priority scale used below

- **P0** — production-critical or release-blocking
- **P1** — high-value feature or operational readiness
- **P2** — useful enhancement or follow-up work
- **P3** — low urgency, archival, backup, or uncertain value

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation and enforcement updates for auth flows | Auth Service | Spring Boot, security, RBAC, API | P1 | Needs validation |
| feature/backend-internal-admin-rbac-v2 | Second-pass internal admin RBAC hardening aligned with production auth controls | Auth Service | Spring Boot, security, RBAC, migrations | P1 | Sequenced |
| feature/backend-admin-account-intervention | Backend support for admin account intervention actions | Auth Service | Spring Boot, admin APIs, audit/security | P1 | Needs validation |
| feature/backend-redis-abuse-revocation | Token/session abuse revocation and Redis-backed security controls | Auth Service | Spring Boot, Redis, security, auth sessions | P0 | Needs validation |
| feature/admin-account-intervention-apim | APIM exposure for admin intervention endpoints | Auth Service / APIM | APIM policies, gateway config | P1 | Sequenced |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows | Auth Service / Admin Web | Next.js, TypeScript, admin UI | P1 | Sequenced |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens discovery flow improvements | Catalog Service | Spring Boot, discovery APIs, Next.js UI | P1 | Needs validation |
| agent/nearby-kitchens-first-discovery-v2 | Refined second iteration of nearby discovery ranking and UX | Catalog Service | Spring Boot, discovery, frontend UX | P1 | Sequenced |
| backend-customer-favorites-20260816 | Favorites capability linked to customer catalog experience | Catalog Service / User-Chef Service | Spring Boot, APIs, persistence | P1 | Needs validation |
| feature/catalog-discovery-apim | APIM publication layer for catalog discovery endpoints | Catalog Service / APIM | APIM policies, gateway routing | P1 | Ready |
| feature/universal-search | Universal search across dishes, chefs, kitchens, and cuisines; created from feature strategist output | Catalog Service | Spring Boot, repository/API, legacy customer web UI | P1 | Needs validation |
| feature/smart-filters-dietary-discovery | Dietary-first discovery with smart filters for veg, healthy, protein, and budget use cases | Catalog Service | Spring Boot, filter/discovery APIs, legacy customer web UI | P1 | Needs validation |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fix chef orders views and customer-facing UI palette consistency | Order Service / Customer Web | Next.js, order UI, theming | P1 | Needs validation |
| agent/fix-chef-registration-and-checkout-contract | Repair contract mismatches affecting chef registration and checkout flows | Order Service / User-Chef Service | API contracts, Spring Boot, frontend integration | P0 | Needs validation |
| agent/order-flyway-v14-checksum | Resolve Flyway checksum issue in order service migrations | Order Service | Spring Boot, Flyway, database migrations | P0 | Ready |
| backend-customer-reorder-20260816 | Repeat/reorder customer journey support | Order Service | Spring Boot, order APIs, customer flow | P1 | Needs validation |
| feature/backend-launch-policy-enforcement | Enforce launch policy rules around order lifecycle or rollout gating | Order Service | Spring Boot, policy enforcement, release control | P0 | Needs validation |
| feature/backend-refund-production-readiness | Refund readiness and hardening for production order flows | Order Service / Integration Service | Spring Boot, events, payments/refunds | P0 | Needs validation |
| feature/scheduled-orders | Customer ability to place and manage scheduled orders | Order Service | Spring Boot, order APIs, legacy customer web UI | P1 | Needs validation |
| feature/live-order-tracking-timeline | Timeline-based live order tracking experience | Order Service | Spring Boot, tracking APIs, legacy customer web UI | P1 | Needs validation |
| feature/offers-coupons-promotions | Promotions and coupon application support in order journey | Order Service | Spring Boot, checkout/order pricing, legacy customer web UI | P1 | Needs validation |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-grade notification delivery improvements | Notification Service | Spring Boot, workers, email/push delivery | P1 | Needs validation |
| feature/backend-notification-recovery-operations | Recovery operations for failed notification processing | Notification Service | Spring Boot, recovery APIs, workers | P1 | Needs validation |
| feature/admin-notification-recovery-apim | APIM layer for admin notification recovery operations | Notification Service / APIM | APIM policies, gateway config | P1 | Sequenced |
| feature/admin-notification-recovery-web | Admin web recovery console for notification operations | Notification Service / Admin Web | Next.js, TypeScript, admin UI | P1 | Sequenced |
| feature/react-native-customer-app-mvp | Notification-backed mobile MVP support and initial committed `apps/customer-mobile` scaffold from strategist-created branch | Notification Service / Mobile | Spring Boot, mobile support APIs, React Native scaffold | P1 | Needs validation |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry routes and session handling | User-Chef Service / Customer Web | Next.js routing, auth/session integration | P1 | Needs validation |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic behavior during rollout | User-Chef Service / Infra | Release validation, routing, observability | P1 | Needs validation |
| feat/chef-complete-uiux | End-to-end chef UI/UX workstream | User-Chef Service / Customer Web | Next.js, TypeScript, chef UI | P1 | Needs validation |
| feature/admin-chef-review | Admin review workflow for chef onboarding and approvals | User-Chef Service / Admin Web | Spring Boot, admin UI, workflow APIs | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger and payout/accounting support | Integration Service / User-Chef Service | Spring Boot, ledger domain, persistence | P1 | Needs validation |
| feature/loyalty-coins-wallet | Loyalty wallet for customers, likely tied to repeat usage and chef marketplace retention | User-Chef Service | Spring Boot, wallet APIs, legacy customer web UI | P2 | Needs validation |
| feature/ratings-and-reviews | Ratings and reviews for customer-chef or order experiences | User-Chef Service | Spring Boot, review APIs, legacy customer web UI | P1 | Needs validation |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect frontend UI to real backend flows | Customer Web Next | Next.js, TypeScript, BFF/API integration | P0 | Needs validation |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in customer flows after backend connection | Customer Web Next / Auth | Next.js, auth integration, API connectivity | P0 | Needs validation |
| agent/fix-full-frontend-backend-integration | Full frontend/backend integration fixes across customer journeys | Customer Web Next / Platform | Next.js, Spring Boot APIs, contracts | P0 | Needs validation |
| agent/unify-chef-panel-customer-ui | Harmonize chef and customer UI shells | Customer Web Next | Next.js, shared UI shell, routing | P2 | Needs validation |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UX improvements | Customer Web Next | Next.js, TypeScript, checkout UI | P1 | Needs validation |
| feat/customer-chef-uiux-foundation | Shared UI foundation spanning customer and chef experiences | Customer Web Next | Next.js, design system, TypeScript | P1 | Needs validation |
| feat/customer-landing-discovery-uiux | Landing and discovery experience improvements | Customer Web Next | Next.js, marketing/discovery UI | P1 | Needs validation |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing page revision | Customer Web Next | Next.js, frontend UI | P2 | Ready |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UX | Customer Web Next | Next.js, order UI, tracking UI | P1 | Needs validation |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for landing experience | Customer Web | Frontend reference, HTML/CSS/TS | P2 | Needs validation |
| feat/landing-reference-20260811 | Landing reference branch for design or content alignment | Customer Web | Frontend reference | P3 | Hold |
| feat/landing-reference-refresh | Refresh of landing reference assets and layout | Customer Web | Frontend reference | P3 | Hold |
| feature/address-final-work | Address workflow completion pass | User-Chef Service / Customer Web | Spring Boot, address APIs, frontend forms | P1 | Needs validation |
| feature/address-final-work-2 | Iteration 2 of address workflow completion | User-Chef Service / Customer Web | API, frontend, address UX | P1 | Sequenced |
| feature/address-final-work-3 | Iteration 3 of address workflow completion | User-Chef Service / Customer Web | API, frontend, address UX | P1 | Sequenced |
| feature/address-final-work-4 | Iteration 4 / likely latest address refinement branch | User-Chef Service / Customer Web | API, frontend, address UX | P1 | Needs validation |
| feature/azure-maps-address-autofill | Azure Maps powered address autofill and location enrichment | User-Chef Service / Customer Web | Azure Maps, Spring Boot, Next.js | P1 | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM gateway custom domain behavior | Infra / APIM | Azure APIM, gateway config, certificates | P0 | Ready |
| agent/backend-completion-guarded-release | Guarded backend completion release branch for coordinated rollout | Platform Release | CI/CD, release gating, backend deploy orchestration | P0 | Needs validation |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression | Infra / Front Door | Azure Front Door, CDN/cache policy | P1 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold load reliability | Infra / Front Door | Front Door, origin config, caching | P1 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices | Infra / Frontend Delivery | Front Door, static assets, caching | P1 | Needs validation |
| agent/fix-customer-web-proxy-origin | Correct frontend proxy origin behavior | Infra / Customer Web | Proxy config, routing, deployment | P1 | Ready |
| agent/fix-front-door-cache-validation-cli-288 | Fix Front Door cache validation CLI issue | Infra / Front Door | Azure CLI, Front Door, automation | P1 | Ready |
| agent/fix-front-door-cli-288 | General Front Door CLI fix branch | Infra / Front Door | Azure CLI, automation | P1 | Needs validation |
| agent/fix-front-door-gzip-cache-bypass | Correct gzip and cache bypass behavior | Infra / Front Door | Caching, compression, CDN rules | P1 | Ready |
| agent/fix-front-door-gzip-rule-validation | Validate and repair Front Door gzip rule handling | Infra / Front Door | CDN rules, validation, automation | P1 | Ready |
| agent/fix-front-door-secret-rest | Fix Front Door secret or secret restore flow | Infra / Security | Azure secrets, Front Door, automation | P0 | Needs validation |
| agent/fix-front-door-security-policy-cli-288 | Correct security policy automation for Front Door | Infra / Security | Azure CLI, WAF/security policy | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Static gzip cold-load fix | Infra / Frontend Delivery | CDN, compression, static asset delivery | P1 | Needs validation |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config behavior in automation | Infra / Front Door | Azure CLI, cache config | P2 | Ready |
| agent/parallel-front-door-domain-provisioning | Provision Front Door domains in parallel | Infra / Front Door | Azure automation, domain provisioning | P1 | Needs validation |
| agent/preserve-afd-custom-domain-waf | Preserve WAF policy while updating AFD custom domain | Infra / Security | Azure Front Door, WAF, domain config | P0 | Ready |
| agent/razorpay-payment-switch | Payment provider switch branch, likely infra/config-assisted | Integration Service / Infra | Payment config, deployment, env wiring | P1 | Needs validation |
| android-build | Android/mobile build support branch | Mobile / Build | Android build config, pipelines | P2 | Needs validation |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK build branch | Mobile / Build | Mobile packaging, CI build outputs | P2 | Hold |
| ci/subscription-service-predeploy-gate | Predeploy gate for subscription service | Subscription Service / CI | CI/CD, deployment gates, release validation | P0 | Ready |
| feature/backend-cashfree-production-hardening | Production hardening for Cashfree integration | Integration Service | Spring Boot, payment integration, ops hardening | P0 | Needs validation |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery-provider integrations | Integration Service | Spring Boot, provider adapters, telemetry | P0 | Needs validation |
| feature/backend-production-readiness-completion | Broad backend production-readiness completion stream | Platform Backend | Spring Boot, infra, release readiness | P0 | Needs validation |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout and final production prep | Integration Service | Payment integration, release hardening | P0 | Needs validation |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Likely accidental or temporary working branch | Unknown | Misc | P3 | Hold |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes | Customer Web | Backup only | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinement | Mobile | Backup only | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | Backend customer-chef journey experimentation branch | Multi-service | Spring Boot, journey APIs | P2 | Needs validation |
| copilot/research-task-repository-analysis | Repository analysis/research branch | Docs / Meta | Documentation, analysis artifacts | P3 | Hold |
| craves-master-guide-v1 | Master guide or reference branch | Documentation / Platform | Docs, reference assets | P3 | Hold |
| craves-v5-patch-repack | Patch repackaging branch | Release / Platform | Release artifacts, packaging | P2 | Needs validation |
| dispatch-craves-v4 | Dispatch automation branch | Release Automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Issue-triggered dispatch automation | Release Automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger automation variant | Release Automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-run-2 | Additional dispatch run branch | Release Automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-run-3 | Additional dispatch run branch | Release Automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | Release Automation | Workflow automation | P3 | Hold |
| do-not-use | Explicitly non-mergeable branch | Unknown | Misc | P3 | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation branch | Docs / Release | Markdown, audit docs, runbooks | P2 | Ready |
| feature/admin-control-center-global-search | Admin global search across operational data | Admin Platform | Next.js, admin UI, possibly backend APIs | P1 | Needs validation |
| feature/admin-customer-360-document-review | Customer 360 and document review admin workflow | Admin Platform / User-Chef Service | Admin UI, Spring Boot APIs | P1 | Needs validation |
| feature/admin-dashboard-v2 | Admin dashboard refresh | Admin Platform | Next.js, dashboard UI, API integration | P1 | Needs validation |
| feature/admin-operational-investigations-apim | APIM publication of admin investigation APIs | Admin Platform / APIM | APIM, gateway policies | P1 | Sequenced |
| feature/admin-operational-investigations-web | Admin investigations frontend | Admin Platform | Next.js, TypeScript, admin UI | P1 | Sequenced |
| feature/admin-subscription-operations | Admin operations for subscription workflows | Subscription Service / Admin Platform | Spring Boot, admin UI, operational tooling | P1 | Needs validation |
| feature/admin-subscription-plans | Admin management for subscription plans | Subscription Service / Admin Platform | Spring Boot, admin UI, plan tooling | P1 | Needs validation |
| feature/admin-web-operations-shell | Admin operations shell and navigation container | Admin Platform | Next.js, shell architecture | P2 | Needs validation |
| feature/admin-web-shell | Base admin shell experience | Admin Platform | Next.js, TypeScript, layout shell | P2 | Sequenced |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | Order Service / Integration Service | Spring Boot, admin APIs, audit trails | P1 | Needs validation |
| feature/backend-admin-operations-audit | Backend audit logging and operational review support | Platform Backend | Spring Boot, audit logging, persistence | P1 | Needs validation |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | Subscription Service | Spring Boot, billing, persistence, events | P0 | Needs validation |
| feature/backend-subscription-occurrence-generator | Generate subscription occurrences and schedules | Subscription Service | Spring Boot, schedulers, persistence | P1 | Needs validation |
| feature/backend-subscription-order-fulfillment | Tie subscriptions to order fulfillment workflows | Subscription Service / Order Service | Spring Boot, internal APIs, orchestration | P0 | Needs validation |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and management | Subscription Service / Integration Service | Spring Boot, payments, APIs | P1 | Needs validation |
| feature/backend-subscription-payment-status-consumer | Consume payment status for subscriptions | Subscription Service | Spring Boot, events/consumers, payments | P1 | Needs validation |
| feature/backend-subscription-plan-schedules | Plan schedule configuration and exposure | Subscription Service | Spring Boot, scheduling, APIs | P1 | Needs validation |

---

## Suggested merge order

1. **P0 infra and release safety**
   - `agent/apim-gateway-domain-fix`
   - `agent/fix-front-door-security-policy-cli-288`
   - `agent/preserve-afd-custom-domain-waf`
   - `ci/subscription-service-predeploy-gate`
   - `agent/order-flyway-v14-checksum`

2. **P0 backend production readiness**
   - `feature/backend-redis-abuse-revocation`
   - `feature/backend-cashfree-production-hardening`
   - `feature/backend-delivery-provider-production-readiness`
   - `feature/backend-refund-production-readiness`
   - `feature/backend-production-readiness-completion`
   - `feature/backend-launch-policy-enforcement`

3. **Subscription/admin platform core**
   - `feature/backend-subscription-billing-lifecycle`
   - `feature/backend-subscription-occurrence-generator`
   - `feature/backend-subscription-payment-intents`
   - `feature/backend-subscription-payment-status-consumer`
   - `feature/backend-subscription-plan-schedules`
   - `feature/backend-subscription-order-fulfillment`
   - `feature/admin-subscription-plans`
   - `feature/admin-subscription-operations`

4. **Auth/admin operational controls**
   - `feature/backend-admin-account-intervention`
   - `feature/backend-admin-investigation-apis`
   - `feature/backend-admin-operations-audit`
   - `feature/admin-account-intervention-apim`
   - `feature/admin-account-intervention-web`
   - `feature/admin-operational-investigations-apim`
   - `feature/admin-operational-investigations-web`

5. **Customer-facing product features**
   - `feature/azure-maps-address-autofill`
   - latest address branch (`feature/address-final-work-4`) after diff review against prior variants
   - `feature/universal-search`
   - `feature/smart-filters-dietary-discovery`
   - `feature/scheduled-orders`
   - `feature/live-order-tracking-timeline`
   - `feature/offers-coupons-promotions`
   - `feature/ratings-and-reviews`
   - `feature/loyalty-coins-wallet`
   - `feature/react-native-customer-app-mvp`

6. **UI/UX consolidation and cleanup**
   - `agent/customer-web-connected-ui`
   - `agent/fix-backend-connected-signed-in-flows`
   - `agent/fix-full-frontend-backend-integration`
   - `feat/*` customer and chef UI branches in dependency order

7. **Do not merge by default**
   - `backup/*`
   - `dispatch-*`
   - `do-not-use`
   - `accidental-ignore-7`
   - stale reference-only landing branches unless explicitly needed

---

## Notes

- This document inventories the **100 branches returned by GitHub list branches page 1 with `per_page=100`** on 2026-08-25.
- The eight strategist-created feature branches incorporated above are:
  - `feature/universal-search`
  - `feature/smart-filters-dietary-discovery`
  - `feature/scheduled-orders`
  - `feature/live-order-tracking-timeline`
  - `feature/offers-coupons-promotions`
  - `feature/loyalty-coins-wallet`
  - `feature/ratings-and-reviews`
  - `feature/react-native-customer-app-mvp`
- Where exact implementation details were not directly inferable from the branch name alone, purpose and readiness were assigned conservatively based on repository analysis and branch naming signals.
