# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-25  
**Total branch count:** 100

This document is the working source of truth for active, historical, operational, and feature branches currently visible in the GitHub branch inventory for this repository.

## Branch naming convention

The current branch inventory uses several naming patterns:

- `main` / long-lived protected default branch when present in workflow expectations
- `agent/*` — autonomous agent fixes, release patches, integration corrections, Front Door/APIM/network hardening, or UI connection work
- `feature/*` — product and backend feature implementation branches
- `feat/*` — UI/UX-oriented feature branches, often customer/chef landing, checkout, or tracking work
- `backend-*` — backend domain slices or targeted implementation branches
- `backup/*` — point-in-time safety branches before major UI/mobile refactors
- `build/*` — build artifact, QA packaging, or release packaging branches
- `ci/*` — deployment and release gate pipeline work
- `docs/*` — audits, release notes, and documentation-only branches
- `chatgpt/*`, `copilot/*` — assistant-generated research or implementation support branches
- `dispatch-*` — dispatch/automation trigger branches
- standalone utility branches such as `android-build`, `do-not-use`, `accidental-ignore-7`

## Merge policy

### General rules

1. Merge into `main` only after domain owner review.
2. Prefer squash merge for narrow feature branches; prefer merge commit for multi-commit operational tracks where history matters.
3. Validate impacted services before merge:
   - Java services: Maven build + tests
   - Next.js/web routes: lint/build/smoke validation
   - APIM/Front Door/infra: policy validation and environment diff review
4. Merge infra and API contract changes before dependent frontend changes where coupling exists.
5. For duplicate or iterative branches (`-v2`, `-2`, `-3`, `-4`), merge only the most complete successor unless earlier branches contain unique commits.
6. Backup, dispatch, accidental, and “do-not-use” branches should not be merged unless explicitly revalidated.

### Merge readiness labels used below

- **Ready** — branch name indicates focused work likely suitable for review/merge sequencing
- **Review** — likely valid branch, but requires functional and dependency review before merge
- **Hold** — operational/backup/trigger/ambiguous branch; keep out of merge train until explicitly needed
- **Superseded candidate** — appears iterative or replaced by a later branch and should be compared first

### Priority labels used below

- **P0** — production readiness, release blocker, security, payments, auth, critical infra
- **P1** — core domain capability or admin/ops capability
- **P2** — UX enhancement or supporting feature
- **P3** — archival, backup, experiment, trigger, or low-priority utility

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC hardening for staff/admin access control | auth-service | Spring Boot, RBAC, auth APIs, security config | P0 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up/internal admin RBAC v2, likely refinement over earlier RBAC work | auth-service | Spring Boot, RBAC, auth APIs, security config | P0 | Review |
| feature/backend-redis-abuse-revocation | Abuse protection, token/session revocation, likely Redis-backed auth invalidation | auth-service | Spring Boot, Redis, auth/session management | P0 | Ready |
| feature/backend-admin-account-intervention | Backend support for admin account intervention flows | auth-service | Spring Boot, internal admin APIs, audit/security | P1 | Review |
| feature/admin-account-intervention-apim | APIM exposure/policies for admin account intervention endpoints | infra / auth-service edge | APIM policies, Azure infra, API gateway | P1 | Review |
| feature/admin-account-intervention-web | Web admin UI for account intervention workflows | customer-web-next admin | Next.js, admin UI, BFF/API integration | P1 | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens discovery iteration for customer landing/catalog browsing | catalog-service | Spring Boot, geospatial discovery, Next.js integration | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Second iteration of nearby discovery; compare with prior branch and prefer latest complete diff | catalog-service | Spring Boot, geospatial discovery, Next.js integration | P1 | Superseded candidate |
| feature/catalog-discovery-apim | APIM layer for catalog discovery APIs | infra / catalog-service edge | APIM policies, API gateway, Azure infra | P1 | Review |
| feature/advanced-search-smart-filters | Smart filters and advanced search for catalog exploration | catalog-service | Spring Boot, search APIs, customer web UI | P1 | Ready |
| feature/curated-collections-occasion-discovery | Curated collections and occasion-based discovery surfaces | catalog-service | Spring Boot, discovery APIs, customer web UI | P2 | Ready |
| backend-customer-favorites-20260816 | Favorites backend reads/writes supporting personalized catalog and home feed | user-chef-service + catalog read models | Spring Boot, profile/favorites APIs, customer experiences | P1 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/order-flyway-v14-checksum | Fix or reconcile Flyway V14 checksum in order-service migrations | order-service | Spring Boot, Flyway, DB migrations | P0 | Ready |
| backend-customer-reorder-20260816 | Reorder / buy-again backend support for customer repeat orders | order-service | Spring Boot, order APIs, customer flows | P1 | Review |
| feature/backend-launch-policy-enforcement | Enforce launch and operational policy rules in order processing | order-service | Spring Boot, policies, domain logic | P0 | Review |
| feature/backend-refund-production-readiness | Refund hardening and production readiness for order/payment recovery | order-service + integration-service | Spring Boot, refund workflows, async consumers | P0 | Review |
| feature/scheduled-orders-time-slot-checkout | Scheduled order creation with time-slot selection during checkout | order-service | Spring Boot, checkout APIs, customer web UI | P1 | Ready |
| feature/real-time-order-tracking-timeline | Real-time order timeline/tracking experience | order-service | Spring Boot, tracking APIs, customer web UI | P1 | Ready |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX refinements | customer-web-next | Next.js, checkout UI, BFF integration | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer order tracking UX improvements | customer-web-next | Next.js, order tracking UI, API integration | P1 | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production delivery channel hardening for notifications | notification-service | Spring Boot, workers, delivery adapters, async processing | P0 | Review |
| feature/backend-notification-recovery-operations | Recovery and replay operations for failed notifications | notification-service | Spring Boot, admin APIs, recovery workers | P1 | Review |
| feature/admin-notification-recovery-apim | APIM exposure for admin notification recovery operations | infra / notification-service edge | APIM policies, Azure infra | P1 | Review |
| feature/admin-notification-recovery-web | Admin UI for notification recovery actions | customer-web-next admin | Next.js, admin UI, internal API integration | P1 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef workspace entrypoints and auth/session routing | customer-web-next chef | Next.js, auth/session, routing | P1 | Ready |
| agent/fix-chef-orders-and-customer-palette | Chef order surface fixes plus shared customer palette alignment | customer-web-next | Next.js, UI theming, chef orders UI | P2 | Review |
| agent/fix-chef-registration-and-checkout-contract | Resolve contract mismatches affecting chef registration and possibly chef-led checkout flows | user-chef-service + web | Spring Boot, Next.js, API contracts | P1 | Review |
| agent/fix-chef-release-traffic-verification | Validate chef release traffic and production routing behavior | infra + chef web | Front Door/APIM, traffic validation, web routing | P0 | Review |
| agent/unify-chef-panel-customer-ui | Align chef panel and customer UI systems | customer-web-next | Next.js, shared components, UX consistency | P2 | Review |
| feat/chef-complete-uiux | Broad chef UI/UX completion branch | customer-web-next chef | Next.js, chef UI, BFF integration | P1 | Review |
| feature/admin-chef-review | Admin review workflow for chef applications/documents | user-chef-service + admin web | Spring Boot, Next.js admin, review APIs | P1 | Review |
| feature/backend-chef-financial-ledger | Chef payouts/ledger/accounting backend support | integration-service + user-chef-service | Spring Boot, ledger domain, finance integrations | P1 | Review |
| feature/preference-mode-veg-healthy | Preference mode toggles supporting dietary discovery, likely chef/customer personalization | user-chef-service | Spring Boot, profile/preferences, customer UI | P2 | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer UI to live/backend-backed flows | customer-web-next | Next.js, BFF routes, API integration | P1 | Ready |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in customer flows against live backend contracts | customer-web-next + backend APIs | Next.js, auth/session, API integration | P1 | Ready |
| agent/fix-full-frontend-backend-integration | End-to-end frontend/backend integration fixes across customer flows | customer-web-next + services | Next.js, Spring Boot APIs, integration layer | P0 | Review |
| feat/customer-chef-uiux-foundation | Shared foundation for customer and chef UX system | customer-web-next | Next.js, design system, routing/layout | P2 | Review |
| feat/customer-landing-discovery-uiux | Landing/discovery UI/UX improvements for customers | customer-web-next | Next.js, discovery UI | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Customer landing v2 cleanup/refinement branch | customer-web-next | Next.js, landing page UX | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for landing page structure/content | customer-web-next | Next.js, SEO/content structure, UI | P2 | Review |
| feat/landing-reference-20260811 | Landing reference branch for UX/content direction | customer-web-next | Next.js, UI reference | P3 | Hold |
| feat/landing-reference-refresh | Refresh of landing reference implementation | customer-web-next | Next.js, UI reference | P3 | Hold |
| feature/address-final-work | Address flow finalization | user-chef-service + customer web | Spring Boot, Next.js, address/profile UX | P1 | Review |
| feature/address-final-work-2 | Iteration 2 of address flow finalization | user-chef-service + customer web | Spring Boot, Next.js, address/profile UX | P1 | Superseded candidate |
| feature/address-final-work-3 | Iteration 3 of address flow finalization | user-chef-service + customer web | Spring Boot, Next.js, address/profile UX | P1 | Superseded candidate |
| feature/address-final-work-4 | Iteration 4 of address flow finalization; likely latest address branch | user-chef-service + customer web | Spring Boot, Next.js, address/profile UX | P1 | Review |
| feature/azure-maps-address-autofill | Address autofill using Azure Maps/geocoding | user-chef-service + customer web | Spring Boot, Azure Maps, Next.js forms | P1 | Ready |
| feature/referral-craves-coins-loyalty | Referral and loyalty wallet / Craves coins feature | user-chef-service | Spring Boot, loyalty/referral APIs, customer UI | P2 | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM gateway/custom domain behavior | infra | APIM, Azure networking, certificates | P0 | Ready |
| agent/backend-completion-guarded-release | Release guardrail branch ensuring backend completion and safe rollout | platform/release | CI/CD, release controls, service coordination | P0 | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to fix delivery/asset issues | infra | Front Door, CDN behavior, Azure config | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to improve cold-loading behavior | infra | Front Door/origin config, static asset delivery | P0 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices/sessions | infra + web | Front Door, caching, web asset delivery | P0 | Review |
| agent/fix-customer-web-proxy-origin | Correct customer web proxy/origin routing | infra + customer-web-next | Front Door, proxy config, web delivery | P0 | Ready |
| agent/fix-front-door-cache-validation-cli-288 | Fix Front Door cache validation issue tied to CLI/ruleset changes | infra | Front Door, Azure CLI, cache config | P0 | Review |
| agent/fix-front-door-cli-288 | Front Door CLI compatibility/fix branch | infra | Azure CLI, Front Door automation | P0 | Review |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip/cache bypass behavior in Front Door | infra | Front Door, caching, compression rules | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Validate/correct gzip rules in Front Door config | infra | Front Door, rules engine | P0 | Ready |
| agent/fix-front-door-secret-rest | Correct Front Door secret or REST automation behavior | infra | Azure secrets, Front Door, automation | P0 | Review |
| agent/fix-front-door-security-policy-cli-288 | Fix security policy deployment/validation via CLI | infra | Front Door WAF/security policies, Azure CLI | P0 | Review |
| agent/fix-static-gzip-cold-loading | Static gzip/cold load mitigation branch | infra + web | Front Door, static assets, compression | P0 | Review |
| agent/parallel-front-door-domain-provisioning | Parallelize/protect Front Door domain provisioning | infra | Azure Front Door, domain automation | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve AFD custom domain and WAF state during updates | infra | Front Door, WAF, domain config | P0 | Ready |
| agent/razorpay-payment-switch | Payment provider switch/toggle likely at edge/config level | integration-service + web + infra | Payments integration, config, web checkout | P0 | Review |
| android-build | Android/mobile build support branch | mobile/build | Android build pipeline, scripts | P2 | Review |
| build/qa-mobile-apk-2026-08-20 | QA APK packaging/build branch for mobile validation | mobile/build | Mobile CI/CD, Android packaging | P2 | Hold |
| ci/subscription-service-predeploy-gate | Subscription service pre-deploy gate and validation checks | subscription-service / CI | CI/CD, Maven validation, deployment gates | P0 | Ready |
| docs/production-release-audit-20260821 | Production release audit artifacts and documentation updates | docs / release | Markdown/docs, release governance | P1 | Review |
| feature/backend-cashfree-production-hardening | Cashfree production hardening across backend integration surfaces | integration-service | Spring Boot, payment gateway, webhooks | P0 | Review |
| feature/backend-delivery-provider-production-readiness | Delivery provider integration hardening for production | integration-service | Spring Boot, Shiprocket/Borzo adapters, orchestration | P0 | Review |
| feature/backend-production-readiness-completion | Cross-service production readiness closeout branch | platform/backend services | Spring Boot, infra, release readiness | P0 | Review |
| feature/cashfree-production-closeout-20260815 | Final closeout branch for Cashfree production readiness | integration-service | Spring Boot, payments, operations checks | P0 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Ambiguous utility/temporary branch; likely not intended for merge | unknown | unknown | P3 | Hold |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before customer landing v2 changes | customer-web-next | Next.js backup snapshot | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinement | mobile | mobile UI backup | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted backend/customer-chef journey exploration or implementation support | cross-domain | Spring Boot, docs, exploratory changes | P2 | Review |
| copilot/research-task-repository-analysis | AI-generated repository analysis branch | docs/research | documentation, analysis artifacts | P3 | Hold |
| craves-master-guide-v1 | General guide or handover branch | docs | markdown/docs | P3 | Hold |
| craves-v5-patch-repack | Repack/patch packaging branch | release | packaging/release ops | P2 | Hold |
| dispatch-craves-v4 | Dispatch automation branch | automation | workflow triggers/ops | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Issue-trigger automation branch | automation | workflow triggers/ops | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger automation branch | automation | workflow triggers/ops | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch rerun branch | automation | workflow triggers/ops | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch rerun branch | automation | workflow triggers/ops | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | automation | workflow triggers/ops | P3 | Hold |
| do-not-use | Explicit non-merge branch | unknown | unknown | P3 | Hold |
| feature/admin-control-center-global-search | Admin global search across control-center operations | customer-web-next admin + backend search | Next.js admin UI, internal APIs, search | P1 | Review |
| feature/admin-customer-360-document-review | Customer 360 / document review workflow for admin ops | customer-web-next admin + user-chef-service | Next.js admin UI, Spring Boot admin APIs | P1 | Review |
| feature/admin-dashboard-v2 | Next iteration of admin dashboard | customer-web-next admin | Next.js dashboards, analytics/admin BFF | P1 | Review |
| feature/admin-operational-investigations-apim | APIM support for operational investigation APIs | infra / admin edge | APIM policies, Azure infra | P1 | Review |
| feature/admin-operational-investigations-web | Admin UI for operational investigations | customer-web-next admin | Next.js admin UI, investigation APIs | P1 | Review |
| feature/admin-subscription-operations | Admin operations for subscription lifecycle handling | subscription-service + admin web | Spring Boot, Next.js admin, ops flows | P1 | Review |
| feature/admin-subscription-plans | Admin management of subscription plans | subscription-service + admin web | Spring Boot, Next.js admin, plan management | P1 | Review |
| feature/admin-web-operations-shell | Admin operations shell foundation | customer-web-next admin | Next.js shell/layout, ops navigation | P2 | Review |
| feature/admin-web-shell | Generic admin shell/foundation | customer-web-next admin | Next.js shell/layout | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | integration-service + order-service | Spring Boot, internal APIs, ops tooling | P1 | Review |
| feature/backend-admin-operations-audit | Backend operational audit trail endpoints/processes | cross-service backend | Spring Boot, audit logging, internal APIs | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle backend implementation | subscription-service | Spring Boot, billing domain, async events | P1 | Review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation logic | subscription-service | Spring Boot, schedulers, domain generation | P1 | Review |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment path | subscription-service + order-service | Spring Boot, internal APIs, async orchestration | P1 | Review |
| feature/backend-subscription-payment-intents | Payment intent support for subscription checkout/billing | subscription-service + integration-service | Spring Boot, payment APIs, async handling | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status updates | subscription-service | Spring Boot, event consumers, payment sync | P1 | Review |
| feature/backend-subscription-plan-schedules | Plan schedule modeling and scheduling support | subscription-service | Spring Boot, scheduling, plan APIs | P1 | Review |
| feature/offer-engine-coupon-wallet | Coupon wallet and offer engine support for promotions | integration-service | Spring Boot, promo/offer APIs, customer UI | P2 | Ready |

---

## Merge guidance by sequence

### Recommended first-wave merge candidates

1. `agent/apim-gateway-domain-fix`
2. `agent/disable-afd-edge-compression`
3. `agent/disable-origin-gzip-for-cold-loading`
4. `agent/fix-customer-web-proxy-origin`
5. `agent/fix-front-door-gzip-cache-bypass`
6. `agent/fix-front-door-gzip-rule-validation`
7. `agent/preserve-afd-custom-domain-waf`
8. `agent/order-flyway-v14-checksum`
9. `ci/subscription-service-predeploy-gate`
10. `feature/azure-maps-address-autofill`
11. `feature/advanced-search-smart-filters`
12. `feature/scheduled-orders-time-slot-checkout`
13. `feature/real-time-order-tracking-timeline`
14. `feature/preference-mode-veg-healthy`
15. `feature/referral-craves-coins-loyalty`
16. `feature/offer-engine-coupon-wallet`
17. `feature/curated-collections-occasion-discovery`

### Recommended compare-before-merge groups

- `agent/nearby-kitchens-first-discovery` vs `agent/nearby-kitchens-first-discovery-v2`
- `feature/address-final-work` through `feature/address-final-work-4`
- `agent/backend-internal-admin-rbac` vs `feature/backend-internal-admin-rbac-v2`
- `feature/backend-cashfree-production-hardening` vs `feature/cashfree-production-closeout-20260815`

### Hold / non-merge utility branches

Do not merge without explicit justification:

- `accidental-ignore-7`
- `do-not-use`
- all `backup/*`
- all `dispatch-*`
- `copilot/research-task-repository-analysis`
- reference-only landing branches if they are design snapshots rather than implementation branches

---

## Complete branch list covered in this inventory

The current visible branch inventory covered in this document includes these 100 real branches:

`accidental-ignore-7`, `agent/apim-gateway-domain-fix`, `agent/backend-completion-guarded-release`, `agent/backend-internal-admin-rbac`, `agent/customer-web-connected-ui`, `agent/disable-afd-edge-compression`, `agent/disable-origin-gzip-for-cold-loading`, `agent/fix-backend-connected-signed-in-flows`, `agent/fix-chef-entry-and-session-routing`, `agent/fix-chef-orders-and-customer-palette`, `agent/fix-chef-registration-and-checkout-contract`, `agent/fix-chef-release-traffic-verification`, `agent/fix-cold-device-static-loading`, `agent/fix-customer-web-proxy-origin`, `agent/fix-front-door-cache-validation-cli-288`, `agent/fix-front-door-cli-288`, `agent/fix-front-door-gzip-cache-bypass`, `agent/fix-front-door-gzip-rule-validation`, `agent/fix-front-door-secret-rest`, `agent/fix-front-door-security-policy-cli-288`, `agent/fix-full-frontend-backend-integration`, `agent/fix-static-gzip-cold-loading`, `agent/landing-body-07cm-inset`, `agent/landing-body-11cm-inset`, `agent/nearby-kitchens-first-discovery`, `agent/nearby-kitchens-first-discovery-v2`, `agent/normalize-empty-front-door-cache-cli-288`, `agent/order-flyway-v14-checksum`, `agent/parallel-front-door-domain-provisioning`, `agent/preserve-afd-custom-domain-waf`, `agent/razorpay-payment-switch`, `agent/unify-chef-panel-customer-ui`, `android-build`, `backend-customer-favorites-20260816`, `backend-customer-reorder-20260816`, `backup/customer-web-before-landing-v2-20260808`, `backup/mobile-ui-before-home-refinement-2026-08-16`, `build/qa-mobile-apk-2026-08-20`, `chatgpt/backend-customer-chef-journey-20260819`, `ci/subscription-service-predeploy-gate`, `copilot/research-task-repository-analysis`, `craves-master-guide-v1`, `craves-v5-patch-repack`, `dispatch-craves-v4`, `dispatch-craves-v4-issue-trigger`, `dispatch-craves-v4-reopen-trigger`, `dispatch-craves-v4-run-2`, `dispatch-craves-v4-run-3`, `dispatch-craves-v4-schedule`, `do-not-use`, `docs/production-release-audit-20260821`, `feat/chef-complete-uiux`, `feat/customer-cart-checkout-payment-uiux`, `feat/customer-chef-uiux-foundation`, `feat/customer-landing-discovery-uiux`, `feat/customer-landing-v2-clean-20260808`, `feat/customer-orders-tracking-uiux`, `feat/customer-web-semantic-reference-landing`, `feat/landing-reference-20260811`, `feat/landing-reference-refresh`, `feature/address-final-work`, `feature/address-final-work-2`, `feature/address-final-work-3`, `feature/address-final-work-4`, `feature/admin-account-intervention-apim`, `feature/admin-account-intervention-web`, `feature/admin-chef-review`, `feature/admin-control-center-global-search`, `feature/admin-customer-360-document-review`, `feature/admin-dashboard-v2`, `feature/admin-notification-recovery-apim`, `feature/admin-notification-recovery-web`, `feature/admin-operational-investigations-apim`, `feature/admin-operational-investigations-web`, `feature/admin-subscription-operations`, `feature/admin-subscription-plans`, `feature/admin-web-operations-shell`, `feature/admin-web-shell`, `feature/advanced-search-smart-filters`, `feature/azure-maps-address-autofill`, `feature/backend-admin-account-intervention`, `feature/backend-admin-investigation-apis`, `feature/backend-admin-operations-audit`, `feature/backend-cashfree-production-hardening`, `feature/backend-chef-financial-ledger`, `feature/backend-delivery-provider-production-readiness`, `feature/backend-internal-admin-rbac-v2`, `feature/backend-launch-policy-enforcement`, `feature/backend-notification-production-delivery`, `feature/backend-notification-recovery-operations`, `feature/backend-production-readiness-completion`, `feature/backend-redis-abuse-revocation`, `feature/backend-refund-production-readiness`, `feature/backend-subscription-billing-lifecycle`, `feature/backend-subscription-occurrence-generator`, `feature/backend-subscription-order-fulfillment`, `feature/backend-subscription-payment-intents`, `feature/backend-subscription-payment-status-consumer`, `feature/backend-subscription-plan-schedules`, `feature/cashfree-production-closeout-20260815`.
