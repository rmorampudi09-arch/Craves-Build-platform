# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branch count:** 98

This document is the current branch inventory for the Craves platform repository. It groups all real GitHub branches by product or platform domain and provides merge guidance for bringing work safely into `main`.

## Branch naming convention

Observed branch patterns in this repository:

- `agent/*` — autonomous or assisted implementation / fix branches, often cross-cutting or release-focused
- `feature/*` — backend, admin, platform, and product feature branches
- `feat/*` — UI/UX and frontend-oriented feature branches
- `backend-*` — backend feature spikes or dated implementation branches
- `backup/*` — snapshot / rollback safety branches
- `build/*` — build artifact or QA packaging branches
- `ci/*` — CI/CD or deployment gating branches
- `docs/*` — documentation and audit branches
- `chatgpt/*`, `copilot/*` — research or AI-assisted task branches
- `dispatch-*` — dispatch / automation run branches
- root branches like `android-build`, `do-not-use`, `craves-v5-patch-repack` — special-purpose operational branches

## Merge policy

### Base policy

1. Merge into `main` only after branch diff review, CI verification, and environment-specific smoke testing.
2. Prefer **squash merge** for short-lived task branches and UI polish branches.
3. Prefer **merge commit** when preserving a multi-commit backend feature history is useful for auditability.
4. Rebase or refresh long-lived branches against `main` before merge when they touch shared contracts, route handlers, or Flyway migrations.
5. For branches with infrastructure or delivery-path impact, require explicit validation in staging or equivalent production-like environment.

### Priority labels used here

- **P0** — release critical / production stability / security / routing
- **P1** — important product capability or production readiness work
- **P2** — supporting enhancement or UX improvement
- **P3** — experimental, backup, research, or archival

### Merge readiness labels used here

- **Ready** — appears intentionally scoped and likely merge-candidate after review
- **Review** — needs code review and targeted testing before merge
- **Validate** — requires environment, infra, or contract validation before merge
- **Hold** — backup, dispatch, experimental, or should not be merged directly

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation and auth authorization hardening. | auth-service | Backend API, security, RBAC, Flyway | P1 | Review |
| feature/backend-admin-account-intervention | Backend account intervention operations for admin workflows. | auth-service | Backend API, auth domain, admin ops, Flyway | P1 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up RBAC expansion for internal admin access control. | auth-service | Backend API, security, authorization, Flyway | P1 | Review |
| feature/backend-redis-abuse-revocation | Redis-based token abuse detection and revocation support. | auth-service | Backend API, Redis, security, background processing | P1 | Validate |
| feature/admin-account-intervention-apim | API management exposure for admin account intervention endpoints. | auth-service / infra-apim | APIM, auth API surface, policy/config | P1 | Validate |
| feature/admin-account-intervention-web | Admin web UX for account intervention actions. | admin web / auth-service | Next.js BFF, admin UI, auth integration | P1 | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchen discovery experience tied to geo discovery. | catalog-service / customer-web-next | Backend API, discovery, frontend UX | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Refined nearby-kitchen discovery flow with likely UX and query improvements. | catalog-service / customer-web-next | Backend API, discovery, frontend UX | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved item flows. | user-chef-service / catalog-service | Backend API, read models, favorites | P1 | Review |
| feature/advanced-search-smart-filters | Advanced search and smart-filter capability for discovery/catalog browsing. | catalog-service / customer-web-next | Backend API, search, frontend UX, filtering | P1 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fix chef order surfaces and align customer-facing order UI styling. | order-service / customer-web-next | Backend API, frontend UI, chef ops | P1 | Review |
| agent/fix-chef-registration-and-checkout-contract | Resolve contract issues affecting chef registration and checkout integration. | order-service / user-chef-service / web | Backend API, BFF routes, contracts | P0 | Validate |
| agent/order-flyway-v14-checksum | Repair or normalize order-service Flyway checksum around V14. | order-service | Flyway, backend schema, release ops | P0 | Validate |
| backend-customer-reorder-20260816 | Customer reorder / repeat order backend implementation. | order-service | Backend API, order domain, repeat order | P1 | Review |
| feature/backend-launch-policy-enforcement | Launch policy enforcement in order lifecycle or checkout path. | order-service | Backend API, policy, checkout/order flow | P1 | Validate |
| feature/backend-refund-production-readiness | Production hardening for refund workflows and downstream processing. | order-service / integration-service | Backend API, refund flow, ops | P1 | Validate |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM surface for admin notification recovery operations. | notification-service / infra-apim | APIM, backend API exposure, admin ops | P1 | Validate |
| feature/admin-notification-recovery-web | Admin web interface for notification recovery workflows. | admin web / notification-service | Next.js BFF, admin UI, ops tooling | P1 | Review |
| feature/backend-notification-production-delivery | Production delivery hardening for email/push notification flows. | notification-service | Backend API, delivery workers, provider integration | P1 | Validate |
| feature/backend-notification-recovery-operations | Backend recovery and retry operations for failed notifications. | notification-service | Backend API, recovery ops, workers | P1 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef-mode entry points and signed-in routing/session behavior. | customer-web-next / auth-service | Frontend routing, session handling, BFF | P0 | Validate |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic path and production routing behavior. | chef web / infra | Routing, release verification, observability | P0 | Validate |
| feat/chef-complete-uiux | End-to-end chef UI/UX refinement for chef workflows. | customer-web-next | Frontend UI, app router, design system | P2 | Review |
| feature/admin-chef-review | Admin chef-review operations and document/review workflow support. | user-chef-service / admin web | Backend API, admin UI, review workflow | P1 | Review |
| feature/backend-chef-financial-ledger | Chef financial ledger backend implementation. | integration-service | Backend API, ledger, payments/reporting | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer UI to live backend and BFF routes. | customer-web-next | Frontend UI, BFF, API integration | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Fix authenticated customer flows against connected backend APIs. | customer-web-next / auth-service | Frontend, BFF, auth/session | P1 | Review |
| agent/fix-customer-web-proxy-origin | Correct proxy/origin handling for customer web requests. | customer-web-next / infra edge | Frontend proxy, routing, env config | P0 | Validate |
| agent/fix-full-frontend-backend-integration | Resolve broader frontend-backend integration issues across customer journeys. | customer-web-next / platform services | Frontend, BFF, contracts, backend integration | P0 | Validate |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment experience improvements. | customer-web-next / order-service | Frontend UI, checkout BFF, payment UX | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared customer-chef experience foundation and navigation shell. | customer-web-next | Frontend UI, layout, navigation | P2 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX redesign. | customer-web-next / catalog-service | Frontend UI, discovery, landing | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing page V2 implementation. | customer-web-next | Frontend UI, landing page | P2 | Review |
| feat/customer-orders-tracking-uiux | Customer orders and tracking visual/UX improvements. | customer-web-next / order-service | Frontend UI, order tracking, BFF | P1 | Review |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing implementation for customer web. | customer-web-next | Frontend UI, content structure, landing | P2 | Review |
| feature/address-final-work | Customer address flow finalization. | user-chef-service / customer-web-next | Backend API, address UX, geocoding | P1 | Review |
| feature/address-final-work-2 | Follow-up customer address workflow polish. | user-chef-service / customer-web-next | Backend API, address UX | P1 | Review |
| feature/address-final-work-3 | Additional address flow refinements. | user-chef-service / customer-web-next | Backend API, address UX | P1 | Review |
| feature/address-final-work-4 | Final address workflow stabilization pass. | user-chef-service / customer-web-next | Backend API, address UX | P1 | Review |
| feature/azure-maps-address-autofill | Azure Maps-powered address autofill and recommendation support. | user-chef-service / customer-web-next | Backend API, maps integration, frontend UX | P1 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM gateway domain mapping or domain binding issues. | infra/apim | APIM, gateway config, DNS/domain | P0 | Validate |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to resolve delivery issues. | infra/frontdoor | CDN/edge config, compression, caching | P0 | Validate |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-load failures. | infra/frontdoor | Edge config, origin behavior, caching | P0 | Validate |
| agent/fix-cold-device-static-loading | Fix static asset loading for cold devices / first load path. | infra/frontdoor / web | CDN, caching, static assets | P0 | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Validate Front Door cache rules or CLI deployment semantics. | infra/frontdoor | Infra config, cache rules, release tooling | P0 | Validate |
| agent/fix-front-door-cli-288 | Fix Azure Front Door CLI provisioning or deployment issue. | infra/frontdoor | Infra config, CLI automation | P0 | Validate |
| agent/fix-front-door-gzip-cache-bypass | Adjust Front Door gzip/cache bypass rules. | infra/frontdoor | CDN, caching, compression rules | P0 | Validate |
| agent/fix-front-door-gzip-rule-validation | Fix validation of gzip-related Front Door rules. | infra/frontdoor | Infra config, validation, edge policy | P0 | Validate |
| agent/fix-front-door-secret-rest | Restore or fix Front Door secret handling. | infra/frontdoor | Secrets, infra config, release ops | P0 | Validate |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy provisioning issue. | infra/frontdoor | WAF/security policy, CLI automation | P0 | Validate |
| agent/fix-static-gzip-cold-loading | Additional static gzip cold-load remediation. | infra/frontdoor / web | CDN, static delivery, compression | P0 | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache configuration for Front Door deployments. | infra/frontdoor | Infra config, cache, release tooling | P0 | Validate |
| agent/parallel-front-door-domain-provisioning | Parallelize or stabilize Front Door domain provisioning. | infra/frontdoor | Domain provisioning, infra automation | P1 | Validate |
| agent/preserve-afd-custom-domain-waf | Preserve custom domain and WAF linkage during Front Door changes. | infra/frontdoor | WAF, domain config, infra automation | P0 | Validate |
| build/qa-mobile-apk-2026-08-20 | QA build packaging branch for mobile APK output. | build/mobile | Build pipeline, packaging, QA | P2 | Hold |
| ci/subscription-service-predeploy-gate | CI predeploy gating for subscription-service rollout. | CI/CD / subscription-service | CI workflows, deployment checks | P1 | Validate |
| feature/backend-cashfree-production-hardening | Production hardening of Cashfree integration. | integration-service | Backend API, payments, provider integration | P1 | Validate |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider integrations. | integration-service | Backend API, provider adapters, ops | P1 | Validate |
| feature/backend-production-readiness-completion | Cross-cutting backend production readiness completion work. | platform backend | Backend API, infra, ops hardening | P1 | Validate |
| feature/cashfree-production-closeout-20260815 | Closeout tasks for Cashfree production enablement. | integration-service | Payments, readiness, ops | P1 | Validate |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Miscellaneous branch, likely accidental or temporary and not intended for mainline merge. | unknown | Unknown / branch hygiene | P3 | Hold |
| agent/landing-body-07cm-inset | Landing-page visual spacing adjustment experiment. | customer-web-next | Frontend UI, styling | P3 | Hold |
| agent/landing-body-11cm-inset | Alternative landing-page spacing adjustment experiment. | customer-web-next | Frontend UI, styling | P3 | Hold |
| agent/razorpay-payment-switch | Switch or refine active payment routing to Razorpay. | integration-service / customer-web-next | Payment integration, BFF, backend config | P1 | Review |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI patterns/components. | customer-web-next | Frontend UI, shared shell, navigation | P2 | Review |
| android-build | Android/mobile-specific branch for build work. | mobile/build | Build, mobile packaging | P2 | Hold |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing V2 changes. | customer-web-next | Backup, frontend snapshot | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile UI home refinements. | mobile/web UI | Backup, frontend snapshot | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted backend work around customer-chef journey integration. | multi-service backend | Backend API, journey flow, integration | P2 | Review |
| copilot/research-task-repository-analysis | Research/documentation branch for repository analysis. | docs / research | Documentation, analysis | P3 | Hold |
| craves-master-guide-v1 | General guide or repackaged reference branch. | docs / platform | Docs, reference | P3 | Hold |
| craves-v5-patch-repack | Patch repack or release packaging branch. | release/platform | Release packaging, ops | P2 | Hold |
| dispatch-craves-v4 | Dispatch automation run branch. | automation | Automation metadata | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue-trigger automation branch. | automation | Automation metadata | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen-trigger automation branch. | automation | Automation metadata | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch automation execution branch 2. | automation | Automation metadata | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch automation execution branch 3. | automation | Automation metadata | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch. | automation | Automation metadata | P3 | Hold |
| do-not-use | Explicitly marked non-mergeable branch. | unknown | Unknown / quarantine | P3 | Hold |
| docs/production-release-audit-20260821 | Release audit and production documentation work. | docs / release ops | Documentation, audit, ops | P2 | Review |
| feat/landing-reference-20260811 | Landing reference implementation or benchmark. | customer-web-next | Frontend UI, reference implementation | P2 | Review |
| feat/landing-reference-refresh | Refresh of landing reference implementation. | customer-web-next | Frontend UI, reference implementation | P2 | Review |
| feature/admin-control-center-global-search | Global search across admin control center workflows. | admin web / backend APIs | Admin UI, BFF, search APIs | P1 | Review |
| feature/admin-customer-360-document-review | Customer 360 and document review operations in admin experience. | admin web / user-chef-service | Admin UI, backend APIs, review tools | P1 | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard. | admin web / order-service / integration-service | Admin UI, dashboards, backend projections | P1 | Review |
| feature/admin-operational-investigations-apim | APIM exposure for admin investigation APIs. | order-service / integration-service / infra-apim | APIM, backend API surface, admin ops | P1 | Validate |
| feature/admin-operational-investigations-web | Admin web workflow for investigations. | admin web / backend APIs | Admin UI, BFF, investigation tooling | P1 | Review |
| feature/admin-subscription-operations | Admin operations for subscription lifecycle management. | subscription-service / admin web | Backend API, admin UI, subscription ops | P1 | Review |
| feature/admin-subscription-plans | Admin management of subscription plans and review flow. | subscription-service / admin web | Backend API, admin UI, plan workflow | P1 | Review |
| feature/admin-web-operations-shell | Admin web operations shell and navigation frame. | admin web | Frontend shell, layout, navigation | P2 | Review |
| feature/admin-web-shell | Base admin web shell/foundation. | admin web | Frontend shell, layout, auth guard | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations and operational tooling. | order-service / integration-service | Backend API, audit, investigations | P1 | Review |
| feature/backend-admin-operations-audit | Backend audit trail support for admin operations. | multi-service backend | Backend API, audit, persistence | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle backend implementation. | subscription-service | Backend API, billing, workers, Flyway | P1 | Review |
| feature/backend-subscription-occurrence-generator | Scheduled occurrence generation for subscriptions. | subscription-service | Backend API, schedulers, occurrence generation | P1 | Review |
| feature/backend-subscription-order-fulfillment | Subscription-to-order fulfillment linkage. | subscription-service / order-service | Backend API, eventing, fulfillment | P1 | Review |
| feature/backend-subscription-payment-intents | Payment intent support for subscription billing. | integration-service / subscription-service | Backend API, payments, billing | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | Backend API, event consumer, billing | P1 | Review |
| feature/backend-subscription-plan-schedules | Subscription plan schedule management backend. | subscription-service | Backend API, schedules, plan workflow | P1 | Review |

## Full branch inventory

For audit completeness, all branches currently observed in GitHub are listed below.

| # | Branch |
|---:|---|
| 1 | accidental-ignore-7 |
| 2 | agent/apim-gateway-domain-fix |
| 3 | agent/backend-completion-guarded-release |
| 4 | agent/backend-internal-admin-rbac |
| 5 | agent/customer-web-connected-ui |
| 6 | agent/disable-afd-edge-compression |
| 7 | agent/disable-origin-gzip-for-cold-loading |
| 8 | agent/fix-backend-connected-signed-in-flows |
| 9 | agent/fix-chef-entry-and-session-routing |
| 10 | agent/fix-chef-orders-and-customer-palette |
| 11 | agent/fix-chef-registration-and-checkout-contract |
| 12 | agent/fix-chef-release-traffic-verification |
| 13 | agent/fix-cold-device-static-loading |
| 14 | agent/fix-customer-web-proxy-origin |
| 15 | agent/fix-front-door-cache-validation-cli-288 |
| 16 | agent/fix-front-door-cli-288 |
| 17 | agent/fix-front-door-gzip-cache-bypass |
| 18 | agent/fix-front-door-gzip-rule-validation |
| 19 | agent/fix-front-door-secret-rest |
| 20 | agent/fix-front-door-security-policy-cli-288 |
| 21 | agent/fix-full-frontend-backend-integration |
| 22 | agent/fix-static-gzip-cold-loading |
| 23 | agent/landing-body-07cm-inset |
| 24 | agent/landing-body-11cm-inset |
| 25 | agent/nearby-kitchens-first-discovery |
| 26 | agent/nearby-kitchens-first-discovery-v2 |
| 27 | agent/normalize-empty-front-door-cache-cli-288 |
| 28 | agent/order-flyway-v14-checksum |
| 29 | agent/parallel-front-door-domain-provisioning |
| 30 | agent/preserve-afd-custom-domain-waf |
| 31 | agent/razorpay-payment-switch |
| 32 | agent/unify-chef-panel-customer-ui |
| 33 | android-build |
| 34 | backend-customer-favorites-20260816 |
| 35 | backend-customer-reorder-20260816 |
| 36 | backup/customer-web-before-landing-v2-20260808 |
| 37 | backup/mobile-ui-before-home-refinement-2026-08-16 |
| 38 | build/qa-mobile-apk-2026-08-20 |
| 39 | chatgpt/backend-customer-chef-journey-20260819 |
| 40 | ci/subscription-service-predeploy-gate |
| 41 | copilot/research-task-repository-analysis |
| 42 | craves-master-guide-v1 |
| 43 | craves-v5-patch-repack |
| 44 | dispatch-craves-v4-issue-trigger |
| 45 | dispatch-craves-v4-reopen-trigger |
| 46 | dispatch-craves-v4-run-2 |
| 47 | dispatch-craves-v4-run-3 |
| 48 | dispatch-craves-v4-schedule |
| 49 | dispatch-craves-v4 |
| 50 | do-not-use |
| 51 | docs/production-release-audit-20260821 |
| 52 | feat/chef-complete-uiux |
| 53 | feat/customer-cart-checkout-payment-uiux |
| 54 | feat/customer-chef-uiux-foundation |
| 55 | feat/customer-landing-discovery-uiux |
| 56 | feat/customer-landing-v2-clean-20260808 |
| 57 | feat/customer-orders-tracking-uiux |
| 58 | feat/customer-web-semantic-reference-landing |
| 59 | feat/landing-reference-20260811 |
| 60 | feat/landing-reference-refresh |
| 61 | feature/address-final-work |
| 62 | feature/address-final-work-2 |
| 63 | feature/address-final-work-3 |
| 64 | feature/address-final-work-4 |
| 65 | feature/admin-account-intervention-apim |
| 66 | feature/admin-account-intervention-web |
| 67 | feature/admin-chef-review |
| 68 | feature/admin-control-center-global-search |
| 69 | feature/admin-customer-360-document-review |
| 70 | feature/admin-dashboard-v2 |
| 71 | feature/admin-notification-recovery-apim |
| 72 | feature/admin-notification-recovery-web |
| 73 | feature/admin-operational-investigations-apim |
| 74 | feature/admin-operational-investigations-web |
| 75 | feature/admin-subscription-operations |
| 76 | feature/admin-subscription-plans |
| 77 | feature/admin-web-operations-shell |
| 78 | feature/admin-web-shell |
| 79 | feature/advanced-search-smart-filters |
| 80 | feature/azure-maps-address-autofill |
| 81 | feature/backend-admin-account-intervention |
| 82 | feature/backend-admin-investigation-apis |
| 83 | feature/backend-admin-operations-audit |
| 84 | feature/backend-cashfree-production-hardening |
| 85 | feature/backend-chef-financial-ledger |
| 86 | feature/backend-delivery-provider-production-readiness |
| 87 | feature/backend-internal-admin-rbac-v2 |
| 88 | feature/backend-launch-policy-enforcement |
| 89 | feature/backend-notification-production-delivery |
| 90 | feature/backend-notification-recovery-operations |
| 91 | feature/backend-production-readiness-completion |
| 92 | feature/backend-redis-abuse-revocation |
| 93 | feature/backend-refund-production-readiness |
| 94 | feature/backend-subscription-billing-lifecycle |
| 95 | feature/backend-subscription-occurrence-generator |
| 96 | feature/backend-subscription-order-fulfillment |
| 97 | feature/backend-subscription-payment-intents |
| 98 | feature/backend-subscription-payment-status-consumer |
| 99 | feature/backend-subscription-plan-schedules |
| 100 | feature/cashfree-production-closeout-20260815 |

## Recommended merge order

1. **Production and infra stabilization**
   - `agent/apim-gateway-domain-fix`
   - Front Door and gzip/cache fix branches
   - `agent/fix-customer-web-proxy-origin`
   - `agent/fix-full-frontend-backend-integration`
   - `agent/fix-chef-entry-and-session-routing`

2. **Backend production readiness and policy work**
   - auth RBAC / revocation / admin intervention branches
   - payment and delivery provider readiness branches
   - notification production delivery and recovery branches
   - refund and launch policy enforcement branches

3. **Subscription and admin capability branches**
   - subscription billing, schedules, occurrence generation, order fulfillment
   - admin dashboard, investigations, subscription operations, web shell work

4. **Customer and chef experience branches**
   - connected UI, landing/discovery, checkout/payment, orders tracking, chef UI
   - address autofill and customer favorites/reorder enhancements

5. **Hold / archive branches**
   - backups, dispatch, `do-not-use`, experimental landing spacing branches

## Notes

- Category assignments are inferred from branch names and the repository’s committed service layout.
- Branches marked **Validate** should not merge without targeted environment verification.
- Branches marked **Hold** should generally remain outside the mainline unless a maintainer explicitly confirms otherwise.
