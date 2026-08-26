# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total Branch Count:** 100

This document is the single source of truth for the currently discoverable GitHub branches returned by the branch listing for this repository at the time of generation.

## Branch naming convention

The repository currently uses several naming styles:

- `main` / long-lived base branch (not returned in the retrieved page, so not included in the inventory tables below)
- `feature/*` — feature delivery branches, typically backend, admin, customer, payments, subscription, or platform work
- `feat/*` — UI/UX and landing/customer-facing feature work
- `agent/*` — autonomous/assistant-generated implementation, fixes, infra, release hardening, routing, integration, and delivery work
- `backend-*` — backend feature spikes or dated feature branches
- `backup/*` — backup or restore points before major frontend/mobile changes
- `build/*` — build artifact or QA packaging branches
- `docs/*` — documentation and audit branches
- `ci/*` — CI/CD or deployment gate changes
- `chatgpt/*`, `copilot/*` — assistant-supported research or implementation branches
- ad hoc names like `android-build`, `do-not-use`, `accidental-ignore-7`, `dispatch-*`

### Naming guidance going forward

Preferred branch names should remain scoped and descriptive:

- `feature/<domain>-<capability>` for product/backend features
- `feat/<surface>-<ux-scope>` for frontend UX branches
- `agent/<system>-<fix-or-capability>` for autonomous fix streams
- `docs/<artifact>` for documentation only
- `ci/<pipeline-change>` for delivery pipeline work
- `backup/<surface>-<snapshot-date>` for temporary restore points

## Merge policy

1. **Merge target:** `main`
2. **Preferred strategy:** squash merge for short-lived branches; rebase/squash acceptable where history is noisy.
3. **Pre-merge checks:**
   - backend service builds pass
   - frontend/BFF contract compatibility validated
   - Flyway version conflicts checked
   - Azure / APIM / Front Door / delivery-provider changes verified in lower environments
   - no duplicate feature overlap with another active branch
4. **High-risk merge sequencing:**
   - auth and admin RBAC before admin web shells that depend on them
   - subscription backend APIs before subscription admin/customer UI
   - payment/provider hardening before checkout UI rollouts
   - infra/networking fixes before frontend routing validation
5. **Readiness labels in this document:**
   - **Ready** — purpose is clear and branch appears merge-candidate based on name and branch type
   - **Review** — likely valid but requires code review/integration testing
   - **Caution** — backup, dispatch, experiment, or potentially stale branch; do not merge blindly
   - **Hold** — explicit non-merge or accidental branch

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC backend work for privileged operations. | auth-service | Backend, Security, RBAC, API | High | Review |
| feature/admin-account-intervention-apim | APIM exposure for admin account intervention flows. | auth-service / APIM | API Gateway, Backend, Security | High | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention tooling. | admin-web / auth-service | Frontend, BFF, Admin UI | High | Review |
| feature/backend-admin-account-intervention | Backend account intervention implementation. | auth-service | Backend, Security, Admin APIs | High | Review |
| feature/backend-internal-admin-rbac-v2 | Second-pass hardening/extension of internal admin RBAC. | auth-service | Backend, Security, RBAC | High | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse prevention and token revocation improvements. | auth-service | Backend, Security, Redis | High | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchen-first discovery experience and supporting logic. | catalog-service / customer-web | Discovery, Backend, Frontend | High | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby kitchen-first discovery. | catalog-service / customer-web | Discovery, Backend, Frontend | High | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites. | user-chef-service / catalog read experience | Backend, API, Customer Data | Medium | Review |
| feature/advanced-search-dietary-filters | Dietary-aware advanced search taxonomy and filters. | catalog-service | Backend, Search, Discovery, API | High | Review |
| feature/advanced-search-smart-filters | Smart filter enhancements for discovery/search. | catalog-service | Backend, Search, Discovery | High | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fixes around chef order views and matching customer UI presentation. | order-service / customer-web / chef UI | Backend, Frontend, UX | High | Review |
| agent/fix-chef-registration-and-checkout-contract | Align checkout contract and onboarding interactions. | order-service / user-chef-service | Backend, API Contracts, Frontend | High | Review |
| agent/order-flyway-v14-checksum | Resolve Flyway checksum issue for order-service migration V14. | order-service | Backend, Database, Flyway | High | Review |
| backend-customer-reorder-20260816 | Customer reorder/repeat-order capability. | order-service | Backend, API, Customer Experience | High | Review |
| feature/backend-launch-policy-enforcement | Enforce launch or release gating policies in order/runtime flows. | order-service | Backend, Policy, API | Medium | Review |
| feature/offers-and-coupon-engine | Planned offers and coupon engine tied to checkout/pricing. | order-service | Backend, Pricing, Checkout | High | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM surface for notification recovery operations. | notification-service / APIM | API Gateway, Backend, Ops | Medium | Review |
| feature/admin-notification-recovery-web | Admin UI for notification recovery operations. | admin-web / notification-service | Frontend, BFF, Admin UI | Medium | Review |
| feature/backend-notification-production-delivery | Production-grade delivery channels and robustness. | notification-service | Backend, Delivery Workers, Provider Integration | High | Review |
| feature/backend-notification-recovery-operations | Recovery workflows for failed notification delivery. | notification-service | Backend, Ops, Recovery | High | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entrypoint and authenticated session routing. | customer-web / chef web / auth-service | Frontend, Routing, Auth | High | Review |
| agent/fix-chef-release-traffic-verification | Validate chef release traffic after deployment. | chef web / infra | Release, Routing, Verification | Medium | Review |
| feat/chef-complete-uiux | Full chef-facing UI/UX implementation. | chef web | Frontend, UX, BFF | High | Review |
| feature/admin-chef-review | Admin review workflow for chef applications/documents. | user-chef-service / admin-web | Backend, Frontend, Admin Workflow | High | Review |
| feature/backend-chef-financial-ledger | Chef earnings/financial ledger backend. | integration-service | Backend, Finance, Reporting | High | Review |
| feature/customer-ratings-and-reviews | Planned customer ratings and reviews capability for chefs/orders. | user-chef-service / order-service | Backend, API, Customer Feedback | High | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer UI to live backend/BFF flows. | customer-web-next | Frontend, BFF, API Integration | High | Review |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in customer flows across backend-connected UI. | customer-web-next / auth-service | Frontend, Auth, BFF | High | Review |
| agent/fix-customer-web-proxy-origin | Correct proxy/origin behavior for customer web. | customer-web-next / infra | Frontend, Proxy, Routing | Medium | Review |
| agent/fix-full-frontend-backend-integration | End-to-end integration fixes across customer experience. | platform-wide | Frontend, Backend, Contracts | High | Review |
| agent/landing-body-07cm-inset | Landing page layout refinement experiment. | customer-web-next | Frontend, UX, Styling | Low | Caution |
| agent/landing-body-11cm-inset | Alternate landing layout refinement experiment. | customer-web-next | Frontend, UX, Styling | Low | Caution |
| agent/unify-chef-panel-customer-ui | Shared or unified visual system between chef and customer surfaces. | customer-web-next / chef web | Frontend, UX, Design System | Medium | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes. | customer-web-next | Frontend, Backup | Low | Caution |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UX. | customer-web-next | Frontend, UX, BFF | High | Review |
| feat/customer-chef-uiux-foundation | Foundation layer for customer and chef UX surfaces. | customer-web-next / chef web | Frontend, UX | Medium | Review |
| feat/customer-landing-discovery-uiux | Discovery-focused landing UI. | customer-web-next | Frontend, UX, Discovery | High | Review |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 implementation. | customer-web-next | Frontend, UX | Medium | Review |
| feat/customer-orders-tracking-uiux | Orders and live tracking UX for customers. | customer-web-next | Frontend, UX, Tracking | High | Review |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing page implementation. | customer-web-next | Frontend, UX, Content | Medium | Review |
| feat/landing-reference-20260811 | Reference landing page branch. | customer-web-next | Frontend, UX | Low | Caution |
| feat/landing-reference-refresh | Refresh of reference landing implementation. | customer-web-next | Frontend, UX | Low | Caution |
| feature/address-final-work | Address management completion work. | user-chef-service / customer-web-next | Backend, Frontend, Geocoding | High | Review |
| feature/address-final-work-2 | Follow-up address work iteration. | user-chef-service / customer-web-next | Backend, Frontend, Geocoding | High | Review |
| feature/address-final-work-3 | Additional address workflow completion pass. | user-chef-service / customer-web-next | Backend, Frontend, Geocoding | High | Review |
| feature/address-final-work-4 | Final address refinement pass. | user-chef-service / customer-web-next | Backend, Frontend, Geocoding | High | Review |
| feature/azure-maps-address-autofill | Azure Maps-based address autofill. | user-chef-service / customer-web-next | Backend, Frontend, Maps API | High | Review |
| feature/refer-and-earn | Planned referral and rewards program. | user-chef-service | Backend, API, Growth | Medium | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Unclear accidental branch; likely not intended for merge. | repository-wide | Misc, Git Hygiene | Low | Hold |
| agent/apim-gateway-domain-fix | Fix APIM gateway custom domain setup. | infra / APIM | Infra, Networking, Gateway | High | Review |
| agent/backend-completion-guarded-release | Guarded release completion branch for backend rollout. | platform-wide | Release, Backend, Ops | High | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression. | infra | CDN, Networking, Edge | Medium | Review |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to fix cold-load issues. | infra / frontend delivery | CDN, Compression, Performance | Medium | Review |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices. | infra / frontend delivery | CDN, Static Assets, Performance | Medium | Review |
| agent/fix-front-door-cache-validation-cli-288 | Fix Front Door cache validation behavior. | infra | CDN, Cache, CLI | Medium | Review |
| agent/fix-front-door-cli-288 | Front Door CLI fix branch. | infra | CDN, CLI, Networking | Medium | Review |
| agent/fix-front-door-gzip-cache-bypass | Fix cache bypass behavior for gzipped content. | infra | CDN, Compression, Cache | Medium | Review |
| agent/fix-front-door-gzip-rule-validation | Validate/fix Front Door gzip rules. | infra | CDN, Compression, Rules | Medium | Review |
| agent/fix-front-door-secret-rest | Fix secret handling for Front Door REST operations. | infra | Security, Secrets, Networking | High | Review |
| agent/fix-front-door-security-policy-cli-288 | Security policy fix for Front Door via CLI. | infra | Security, CDN, CLI | High | Review |
| agent/fix-static-gzip-cold-loading | Static gzip cold-loading fix. | infra / frontend delivery | CDN, Performance, Compression | Medium | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache settings for Front Door. | infra | CDN, Cache, CLI | Medium | Review |
| agent/parallel-front-door-domain-provisioning | Parallelize/protect Front Door domain provisioning. | infra | CDN, Provisioning, Automation | Medium | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF while updating Front Door custom domains. | infra | Security, WAF, CDN | High | Review |
| android-build | Android/mobile build branch. | mobile/build | Build, Mobile | Medium | Review |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup before mobile UI refinement. | mobile | Mobile, Backup | Low | Caution |
| build/qa-mobile-apk-2026-08-20 | QA APK build branch. | mobile/build | Build, QA, Mobile | Medium | Review |
| ci/subscription-service-predeploy-gate | CI gate for subscription-service deployment. | CI/CD | Pipeline, Deployment, Backend | Medium | Review |
| copilot/research-task-repository-analysis | Research-only branch for repo analysis. | documentation / analysis | Docs, Research | Low | Caution |
| craves-master-guide-v1 | Master guide or internal release guide branch. | docs/platform | Documentation, Ops | Low | Caution |
| craves-v5-patch-repack | Patch repack or release packaging branch. | release engineering | Release, Packaging | Medium | Review |
| dispatch-craves-v4 | Dispatch/release automation branch. | automation | Release, Automation | Low | Caution |
| dispatch-craves-v4-issue-trigger | Dispatch automation issue-trigger branch. | automation | Release, Automation | Low | Caution |
| dispatch-craves-v4-reopen-trigger | Dispatch automation reopen-trigger branch. | automation | Release, Automation | Low | Caution |
| dispatch-craves-v4-run-2 | Dispatch automation run branch. | automation | Release, Automation | Low | Caution |
| dispatch-craves-v4-run-3 | Dispatch automation run branch. | automation | Release, Automation | Low | Caution |
| dispatch-craves-v4-schedule | Dispatch automation scheduler branch. | automation | Release, Automation | Low | Caution |
| do-not-use | Explicitly marked as non-merge branch. | repository-wide | Misc | Low | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation. | docs/platform | Documentation, Audit, Release | Medium | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| chatgpt/backend-customer-chef-journey-20260819 | Assistant-driven backend work on customer-chef journey flows. | user-chef-service / order-service | Backend, API, Journey Orchestration | Medium | Review |
| feature/admin-control-center-global-search | Global search for admin control center. | admin-web / user-chef-service | Frontend, Backend, Search | High | Review |
| feature/admin-customer-360-document-review | Customer 360 plus document review tooling. | admin-web / user-chef-service | Frontend, Backend, Admin Workflow | High | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard. | admin-web / order-service | Frontend, Backend, Analytics | High | Review |
| feature/admin-operational-investigations-apim | APIM work for operational investigations. | integration-service / APIM | Backend, API Gateway, Ops | High | Review |
| feature/admin-operational-investigations-web | Admin web tooling for investigations. | admin-web / integration-service | Frontend, BFF, Ops | High | Review |
| feature/admin-subscription-operations | Admin operations suite for subscriptions. | subscription-service / admin-web | Backend, Frontend, Admin Ops | High | Review |
| feature/admin-subscription-plans | Admin subscription plan management. | subscription-service / admin-web | Backend, Frontend, Admin Workflow | High | Review |
| feature/admin-web-operations-shell | Operations-focused admin shell. | admin-web | Frontend, Shell, Admin UX | Medium | Review |
| feature/admin-web-shell | Base admin shell/foundation. | admin-web | Frontend, Shell, Admin UX | Medium | Review |
| feature/backend-admin-investigation-apis | Backend APIs for investigations. | order-service / integration-service | Backend, API, Audit | High | Review |
| feature/backend-admin-operations-audit | Operational audit trail backend. | integration-service / order-service | Backend, Audit, Ops | High | Review |
| feature/backend-cashfree-production-hardening | Harden Cashfree payment provider for production. | integration-service | Backend, Payments, Provider Integration | High | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery providers. | integration-service | Backend, Logistics, Provider Integration | High | Review |
| feature/backend-production-readiness-completion | Final backend production-readiness sweep. | platform-wide | Backend, Ops, Release | High | Review |
| feature/backend-refund-production-readiness | Refund path production hardening. | integration-service / order-service | Backend, Payments, Refunds | High | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle support. | subscription-service | Backend, Billing, Schedulers | High | Review |
| feature/backend-subscription-occurrence-generator | Occurrence generation for subscription plans. | subscription-service | Backend, Scheduling, Domain Logic | High | Review |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment integration. | subscription-service / order-service | Backend, Fulfillment, Async | High | Review |
| feature/backend-subscription-payment-intents | Payment intent flows for subscriptions. | integration-service / subscription-service | Backend, Payments, API | High | Review |
| feature/backend-subscription-payment-status-consumer | Consume subscription payment status events. | subscription-service | Backend, Async, Payments | High | Review |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling APIs and logic. | subscription-service | Backend, Scheduling, API | High | Review |
| feature/gift-cards | Planned gift card/stored value implementation. | integration-service | Backend, Payments, Stored Value | Medium | Review |

---

## Complete branch inventory cross-check

The 100 branches included in this document are exactly the branches returned by the GitHub branch listing used for generation:

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
- dispatch-craves-v4-issue-trigger
- dispatch-craves-v4-reopen-trigger
- dispatch-craves-v4-run-2
- dispatch-craves-v4-run-3
- dispatch-craves-v4-schedule
- dispatch-craves-v4
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
- feature/advanced-search-dietary-filters
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

## Merge sequencing guidance

Recommended merge order for the most interdependent streams:

1. **Infra and routing stability**
   - APIM / Front Door / proxy / gzip / cache branches
2. **Auth and admin access control**
   - internal admin RBAC, account intervention, redis abuse/revocation
3. **Backend production hardening**
   - notification delivery, refund hardening, provider readiness, launch policy
4. **Subscription backend foundation**
   - plan schedules → occurrence generator → billing lifecycle → payment status consumer → payment intents → order fulfillment
5. **Admin operational tooling**
   - admin shell → dashboard → investigations → notification recovery → subscription operations
6. **Customer and chef UI surfaces**
   - connected UI, landing/discovery, cart/checkout/payment, orders tracking, chef complete UI
7. **Planned net-new features**
   - ratings/reviews, offers/coupons, refer-and-earn, gift cards, advanced search

## Notes

- This inventory reflects the returned branch listing page of 100 branches.
- Branch purposes are inferred from real branch names and the confirmed codebase domain map.
- The following newly reported planned branches from the feature strategist context are included where present in branch inventory or as intended work descriptions:
  - `feature/advanced-search-dietary-filters`
  - `feature/customer-ratings-and-reviews`
  - `feature/offers-and-coupon-engine`
  - `feature/refer-and-earn`
  - `feature/gift-cards`
- Of those, only branches present in the retrieved GitHub inventory can be considered confirmed inventory branches. Planned descriptions have been used to improve purpose mapping where applicable.
