# Craves-Build-platform — Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the current branch handover inventory for the repository. It groups all discovered branches into functional categories and provides merge guidance for review planning.

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — agent-led fixes, release hardening, frontend/backend integration, infra adjustments
- `feature/` — product or platform feature branches, typically merge-candidate workstreams
- `feat/` — UI/UX or frontend feature slices
- `backend-` — targeted backend feature work
- `backup/` — snapshot/backup branches, generally not intended for direct merge
- `build/` — build artifact or QA packaging branches
- `ci/` — CI/CD and pipeline control branches
- `docs/` — documentation-only branches
- `chatgpt/`, `copilot/` — AI-assisted research or implementation branches
- `dispatch-` — automation/dispatch branches
- unprefixed branches — legacy, temporary, or manual branches

### Recommended naming standard going forward

Use one of the following shapes:

- `feature/<domain>-<capability>`
- `agent/<fix-or-rollout-purpose>`
- `feat/<ui-surface-or-experience>`
- `infra/<platform-or-delivery-change>`
- `docs/<document-purpose>`
- `ci/<pipeline-purpose>`

## Merge policy

### Readiness labels used in this document

- **Ready** — appears purpose-built and likely reviewable for merge after normal validation
- **Needs validation** — likely valid branch, but requires functional testing, diff review, and dependency checks
- **Sequenced** — should merge only after an upstream/backend/API/foundation branch
- **Hold** — backup, automation, or suspicious branch; do not merge without explicit approval

### Priority labels used in this document

- **P0** — production, release, security, payment, routing, or critical platform stability
- **P1** — customer-critical feature, admin operations, core backend capability
- **P2** — UX refinement, supporting capability, or non-blocking platform enhancement
- **P3** — research, backup, audit, or low-risk support work

### Merge guidance

1. Merge backend/API foundation branches before dependent web or admin branches.
2. Merge schema/migration branches before UI branches that depend on new endpoints.
3. Batch infra/front-door/CDN branches carefully and validate caching, compression, and routing after each merge.
4. Avoid merging `backup/`, `dispatch-*`, `do-not-use`, and `accidental-*` branches into `main`.
5. Where multiple branches overlap the same domain, compare diffs and prefer the most complete or latest branch.
6. For paired branches such as `*-apim` and `*-web`, merge API/backend changes first, then web, then end-to-end validate.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation or patching for backend auth controls. | auth-service | backend, security, RBAC, API | P0 | Needs validation |
| feature/admin-account-intervention-apim | API management surface for admin account intervention flows. | auth-service / API gateway | API gateway, backend, admin API | P1 | Sequenced |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows. | admin-portal / customer-web-next | frontend, admin UI, BFF | P1 | Sequenced |
| feature/backend-admin-account-intervention | Backend implementation for admin intervention over user accounts. | auth-service | backend, auth, admin operations | P1 | Ready |
| feature/backend-internal-admin-rbac-v2 | Follow-on or improved RBAC backend implementation for internal admin controls. | auth-service | backend, security, RBAC | P0 | Ready |
| feature/backend-redis-abuse-revocation | Redis-backed auth abuse protection and token revocation hardening. | auth-service | backend, Redis, security, auth infra | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens discovery experience and likely supporting API alignment. | catalog-service / customer-web-next | backend, frontend, discovery, geospatial | P1 | Needs validation |
| agent/nearby-kitchens-first-discovery-v2 | Iteration of nearby discovery, likely refined from earlier discovery branch. | catalog-service / customer-web-next | backend, frontend, discovery, geospatial | P1 | Needs validation |
| backend-customer-favorites-20260816 | Customer favorites backend capability for saved menu items/home feed use cases. | user-chef-service / catalog-service | backend, API, favorites | P1 | Ready |
| feature/advanced-search-smart-filters | Advanced search and filtering capability for discovery/catalog surfaces. | catalog-service / customer-web-next | backend, frontend, search, filtering | P1 | Needs validation |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fixes chef order workflows and customer-facing UI polish in shared ordering surfaces. | order-service / customer-web-next | backend, frontend, chef UI, customer UI | P1 | Needs validation |
| agent/fix-chef-registration-and-checkout-contract | Aligns chef registration and checkout contracts, likely affecting order/checkout integration. | order-service / user-chef-service / customer-web-next | backend, contracts, BFF, frontend | P0 | Needs validation |
| agent/order-flyway-v14-checksum | Repair branch for order-service Flyway checksum mismatch around V14. | order-service | backend, database, Flyway | P0 | Ready |
| backend-customer-reorder-20260816 | Reorder/repeat-order backend implementation. | order-service | backend, API, ordering | P1 | Ready |
| feature/backend-launch-policy-enforcement | Backend enforcement for launch or release policy around ordering/feature access. | order-service | backend, policy, API | P1 | Ready |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | API layer for notification recovery operations. | notification-service / API gateway | backend, API gateway, admin API | P1 | Sequenced |
| feature/admin-notification-recovery-web | Admin web experience for notification recovery actions. | admin-portal / customer-web-next | frontend, admin UI, BFF | P1 | Sequenced |
| feature/backend-notification-production-delivery | Production delivery hardening for notifications across providers/channels. | notification-service | backend, worker, delivery adapters | P0 | Ready |
| feature/backend-notification-recovery-operations | Backend recovery operations for notification failures and retries. | notification-service | backend, admin API, recovery workflows | P1 | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fixes chef entry points, routing, and likely auth/session navigation. | customer-web-next / auth-service | frontend, routing, auth session | P1 | Needs validation |
| agent/fix-chef-release-traffic-verification | Verifies chef release traffic or rollout routing in production. | infra / customer-web-next | infra, routing, release verification | P1 | Needs validation |
| agent/unify-chef-panel-customer-ui | Unifies chef panel and customer UI patterns into a shared surface. | customer-web-next | frontend, design system, UX | P2 | Needs validation |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch covering customer-chef journey flows and supporting APIs. | user-chef-service / customer-web-next | backend, frontend, journey orchestration | P2 | Needs validation |
| feat/chef-complete-uiux | Chef end-to-end UI/UX experience completion. | customer-web-next | frontend, chef UX, BFF | P1 | Needs validation |
| feat/customer-chef-uiux-foundation | Shared customer/chef UI foundation for later experience branches. | customer-web-next | frontend, design system, app shell | P1 | Sequenced |
| feature/admin-chef-review | Admin chef application review workflow implementation. | user-chef-service / admin UI | backend, frontend, admin workflow | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger backend, likely payouts/earnings ledger support. | integration-service | backend, finance, ledger, admin/chef APIs | P1 | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connected customer web UI integrated with live APIs/BFF routes. | customer-web-next | frontend, BFF, integration | P1 | Needs validation |
| agent/fix-backend-connected-signed-in-flows | Fixes authenticated customer flows against connected backend APIs. | customer-web-next / auth-service | frontend, BFF, auth, backend integration | P0 | Needs validation |
| agent/fix-full-frontend-backend-integration | End-to-end integration fix branch across frontend and backend. | customer-web-next / multiple services | frontend, backend, BFF, contracts | P0 | Needs validation |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX implementation. | customer-web-next | frontend, checkout, payments, BFF | P1 | Needs validation |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX improvements. | customer-web-next | frontend, landing, discovery | P2 | Needs validation |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 branch. | customer-web-next | frontend, landing page | P2 | Needs validation |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI/UX implementation. | customer-web-next | frontend, orders, tracking | P1 | Needs validation |
| feat/customer-web-semantic-reference-landing | Semantic/reference implementation of landing page structure. | customer-web-next | frontend, landing, semantic HTML/CSS | P3 | Needs validation |
| feat/landing-reference-20260811 | Landing reference branch used as design or implementation baseline. | customer-web-next | frontend, reference UI | P3 | Hold |
| feat/landing-reference-refresh | Refresh of landing reference implementation. | customer-web-next | frontend, reference UI | P3 | Hold |
| feature/address-final-work | Final address workflow implementation, likely customer address management. | user-chef-service / customer-web-next | backend, frontend, address, maps | P1 | Needs validation |
| feature/address-final-work-2 | Follow-up address workflow branch iteration. | user-chef-service / customer-web-next | backend, frontend, address, maps | P1 | Needs validation |
| feature/address-final-work-3 | Further address workflow iteration branch. | user-chef-service / customer-web-next | backend, frontend, address, maps | P1 | Needs validation |
| feature/address-final-work-4 | Latest visible address workflow iteration branch. | user-chef-service / customer-web-next | backend, frontend, address, maps | P1 | Needs validation |
| feature/azure-maps-address-autofill | Azure Maps-backed address autofill and recommendation experience. | user-chef-service / customer-web-next | backend, frontend, Azure Maps, address UX | P1 | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or temporary branch; not a planned delivery branch. | repository-wide | git hygiene | P3 | Hold |
| agent/apim-gateway-domain-fix | Fix for API management or gateway custom domain configuration. | infra / API gateway | infra, APIM, DNS, routing | P0 | Ready |
| agent/backend-completion-guarded-release | Guarded backend release completion branch coordinating final production readiness. | repository-wide | backend, release, validation | P0 | Needs validation |
| agent/disable-afd-edge-compression | Disables Azure Front Door edge compression to address delivery/caching issues. | infra | CDN, Azure Front Door, compression | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disables origin gzip for cold-load reliability. | infra | CDN, origin config, compression | P0 | Ready |
| agent/fix-cold-device-static-loading | Fixes static asset loading on cold devices. | infra / customer-web-next | frontend delivery, CDN, static assets | P0 | Needs validation |
| agent/fix-customer-web-proxy-origin | Fixes proxy/origin configuration for customer web. | infra / customer-web-next | infra, reverse proxy, frontend delivery | P0 | Ready |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix branch related to CLI/ruleset issue 288. | infra | Azure Front Door, caching, automation | P0 | Ready |
| agent/fix-front-door-cli-288 | Front Door CLI compatibility or rule fix for issue 288. | infra | Azure Front Door, CLI, automation | P0 | Ready |
| agent/fix-front-door-gzip-cache-bypass | Fixes gzip-induced cache bypass behavior at the edge. | infra | CDN, compression, caching | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Fixes Front Door gzip rule validation. | infra | CDN, rules engine, compression | P0 | Ready |
| agent/fix-front-door-secret-rest | Restores or fixes Front Door secret handling. | infra | secrets, CDN, edge routing | P0 | Ready |
| agent/fix-front-door-security-policy-cli-288 | Front Door security policy fix related to CLI/rules validation. | infra | security policy, CDN, automation | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Fix for gzip/static loading interactions during cold starts. | infra / frontend delivery | CDN, compression, static assets | P0 | Ready |
| agent/normalize-empty-front-door-cache-cli-288 | Normalizes empty cache configuration behavior for Front Door automation. | infra | CDN, caching, automation | P1 | Ready |
| agent/parallel-front-door-domain-provisioning | Parallelizes Front Door domain provisioning workflows. | infra | CDN, domain automation, deployment | P1 | Needs validation |
| agent/preserve-afd-custom-domain-waf | Preserves WAF and custom domain settings in Azure Front Door changes. | infra | CDN, WAF, domain config | P0 | Ready |
| android-build | Android/mobile build branch. | mobile/build pipeline | build, mobile, packaging | P2 | Needs validation |
| backup/customer-web-before-landing-v2-20260808 | Snapshot backup before landing v2 changes. | customer-web-next | backup, frontend | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Snapshot backup before mobile/home refinement. | mobile/frontend | backup, frontend | P3 | Hold |
| build/qa-mobile-apk-2026-08-20 | QA APK build packaging branch. | mobile/build pipeline | build, QA, mobile packaging | P2 | Hold |
| ci/subscription-service-predeploy-gate | CI gate for subscription-service predeploy checks. | subscription-service / CI | CI/CD, validation, deployment | P1 | Ready |
| copilot/research-task-repository-analysis | Repository analysis/research branch, likely not for product merge. | repository-wide | docs, analysis, AI research | P3 | Hold |
| craves-master-guide-v1 | Guide or manual branch, likely documentation/support material. | repository-wide | docs, guidance | P3 | Hold |
| craves-v5-patch-repack | Repack or patch branch tied to release packaging. | release engineering | build, release packaging | P2 | Needs validation |
| dispatch-craves-v4 | Automation dispatch branch for v4 workflow. | automation | automation, release ops | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Trigger automation for issues in dispatch flow. | automation | automation, issue ops | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger automation branch. | automation | automation, issue ops | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch run branch iteration 2. | automation | automation, release ops | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch run branch iteration 3. | automation | automation, release ops | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch. | automation | automation, scheduling | P3 | Hold |
| do-not-use | Explicitly marked non-merge branch. | repository-wide | temporary | P3 | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | repository-wide | docs, release audit | P3 | Ready |
| feature/backend-cashfree-production-hardening | Hardening for Cashfree production payment flows. | integration-service | backend, payments, production readiness | P0 | Ready |
| feature/backend-delivery-provider-production-readiness | Production readiness branch for delivery provider integrations. | integration-service | backend, delivery integrations, ops | P0 | Ready |
| feature/backend-production-readiness-completion | Broad backend production-readiness completion branch. | repository-wide | backend, release hardening, ops | P0 | Needs validation |
| feature/backend-refund-production-readiness | Production readiness for refund processing flows. | integration-service / order-service | backend, refunds, payments | P0 | Ready |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout branch to complete production payment rollout. | integration-service | backend, payments, release hardening | P0 | Needs validation |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/landing-body-07cm-inset | Landing page layout variant with 0.7 cm body inset. | customer-web-next | frontend, layout, UX experiment | P3 | Hold |
| agent/landing-body-11cm-inset | Landing page layout variant with 1.1 cm body inset. | customer-web-next | frontend, layout, UX experiment | P3 | Hold |
| agent/razorpay-payment-switch | Switches payment flow or provider path toward Razorpay. | integration-service / customer-web-next | backend, frontend, payments, BFF | P0 | Needs validation |
| feature/admin-control-center-global-search | Global search for admin control center. | admin-portal / backend admin APIs | frontend, backend, search, admin | P1 | Ready |
| feature/admin-customer-360-document-review | Customer 360 and document review experience for admins. | admin UI / user-chef-service | frontend, backend, admin investigations | P1 | Ready |
| feature/admin-dashboard-v2 | Second-generation admin dashboard branch. | admin-portal / order-service | frontend, backend, analytics, admin | P1 | Ready |
| feature/admin-operational-investigations-apim | API surface for admin operational investigations. | order-service / integration-service / API gateway | backend, API, admin ops | P1 | Sequenced |
| feature/admin-operational-investigations-web | Admin web UI for operational investigations. | admin-portal / customer-web-next | frontend, admin UI, investigations | P1 | Sequenced |
| feature/admin-subscription-operations | Admin operations features for subscription lifecycle management. | subscription-service / admin UI | backend, frontend, admin ops | P1 | Ready |
| feature/admin-subscription-plans | Admin feature work for subscription plan management. | subscription-service / admin UI | backend, frontend, plans, admin | P1 | Ready |
| feature/admin-web-operations-shell | Admin operations shell or navigation framework. | admin-portal / customer-web-next | frontend, app shell, admin UX | P2 | Sequenced |
| feature/admin-web-shell | Core admin web shell/foundation. | admin-portal / customer-web-next | frontend, app shell, routing | P1 | Ready |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations. | order-service / integration-service | backend, admin APIs, audit | P1 | Ready |
| feature/backend-admin-operations-audit | Backend operations audit capability for admins. | order-service / integration-service | backend, audit, admin ops | P1 | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle backend implementation. | subscription-service | backend, billing, outbox, payments | P1 | Ready |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation backend worker/service branch. | subscription-service | backend, scheduling, worker, fulfillment | P1 | Ready |
| feature/backend-subscription-order-fulfillment | Subscription-to-order fulfillment backend integration. | subscription-service / order-service | backend, fulfillment, internal API | P1 | Ready |
| feature/backend-subscription-payment-intents | Subscription payment intent backend implementation. | integration-service / subscription-service | backend, payments, billing | P1 | Ready |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | backend, async events, payments | P1 | Ready |
| feature/backend-subscription-plan-schedules | Backend plan scheduling support for subscriptions. | subscription-service | backend, scheduling, plans | P1 | Ready |

---

## Full branch list by category index

### Auth branches
- agent/backend-internal-admin-rbac
- feature/admin-account-intervention-apim
- feature/admin-account-intervention-web
- feature/backend-admin-account-intervention
- feature/backend-internal-admin-rbac-v2
- feature/backend-redis-abuse-revocation

### Catalog branches
- agent/nearby-kitchens-first-discovery
- agent/nearby-kitchens-first-discovery-v2
- backend-customer-favorites-20260816
- feature/advanced-search-smart-filters

### Orders branches
- agent/fix-chef-orders-and-customer-palette
- agent/fix-chef-registration-and-checkout-contract
- agent/order-flyway-v14-checksum
- backend-customer-reorder-20260816
- feature/backend-launch-policy-enforcement

### Notifications branches
- feature/admin-notification-recovery-apim
- feature/admin-notification-recovery-web
- feature/backend-notification-production-delivery
- feature/backend-notification-recovery-operations

### Chef branches
- agent/fix-chef-entry-and-session-routing
- agent/fix-chef-release-traffic-verification
- agent/unify-chef-panel-customer-ui
- chatgpt/backend-customer-chef-journey-20260819
- feat/chef-complete-uiux
- feat/customer-chef-uiux-foundation
- feature/admin-chef-review
- feature/backend-chef-financial-ledger

### Customer branches
- agent/customer-web-connected-ui
- agent/fix-backend-connected-signed-in-flows
- agent/fix-full-frontend-backend-integration
- feat/customer-cart-checkout-payment-uiux
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
- feature/azure-maps-address-autofill

### Infra branches
- accidental-ignore-7
- agent/apim-gateway-domain-fix
- agent/backend-completion-guarded-release
- agent/disable-afd-edge-compression
- agent/disable-origin-gzip-for-cold-loading
- agent/fix-cold-device-static-loading
- agent/fix-customer-web-proxy-origin
- agent/fix-front-door-cache-validation-cli-288
- agent/fix-front-door-cli-288
- agent/fix-front-door-gzip-cache-bypass
- agent/fix-front-door-gzip-rule-validation
- agent/fix-front-door-secret-rest
- agent/fix-front-door-security-policy-cli-288
- agent/fix-static-gzip-cold-loading
- agent/normalize-empty-front-door-cache-cli-288
- agent/parallel-front-door-domain-provisioning
- agent/preserve-afd-custom-domain-waf
- android-build
- backup/customer-web-before-landing-v2-20260808
- backup/mobile-ui-before-home-refinement-2026-08-16
- build/qa-mobile-apk-2026-08-20
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
- feature/backend-cashfree-production-hardening
- feature/backend-delivery-provider-production-readiness
- feature/backend-production-readiness-completion
- feature/backend-refund-production-readiness
- feature/cashfree-production-closeout-20260815

### Feature branches
- agent/landing-body-07cm-inset
- agent/landing-body-11cm-inset
- agent/razorpay-payment-switch
- feature/admin-control-center-global-search
- feature/admin-customer-360-document-review
- feature/admin-dashboard-v2
- feature/admin-operational-investigations-apim
- feature/admin-operational-investigations-web
- feature/admin-subscription-operations
- feature/admin-subscription-plans
- feature/admin-web-operations-shell
- feature/admin-web-shell
- feature/backend-admin-investigation-apis
- feature/backend-admin-operations-audit
- feature/backend-subscription-billing-lifecycle
- feature/backend-subscription-occurrence-generator
- feature/backend-subscription-order-fulfillment
- feature/backend-subscription-payment-intents
- feature/backend-subscription-payment-status-consumer
- feature/backend-subscription-plan-schedules

## Merge sequencing recommendations

1. **Security/auth first**
   - `feature/backend-redis-abuse-revocation`
   - `feature/backend-internal-admin-rbac-v2`
   - `feature/backend-admin-account-intervention`
   - then `feature/admin-account-intervention-apim`
   - then `feature/admin-account-intervention-web`

2. **Notification admin recovery**
   - `feature/backend-notification-recovery-operations`
   - `feature/admin-notification-recovery-apim`
   - `feature/admin-notification-recovery-web`

3. **Subscription stack**
   - `feature/backend-subscription-plan-schedules`
   - `feature/backend-subscription-occurrence-generator`
   - `feature/backend-subscription-billing-lifecycle`
   - `feature/backend-subscription-payment-intents`
   - `feature/backend-subscription-payment-status-consumer`
   - `feature/backend-subscription-order-fulfillment`
   - then admin branches for plans/operations

4. **Infra hardening wave**
   - merge one Front Door/compression branch at a time
   - validate cache headers, gzip behavior, login flows, chef routing, and static asset cold loads after each merge

5. **Customer UI wave**
   - foundation branches first:
     - `feat/customer-chef-uiux-foundation`
     - `agent/customer-web-connected-ui`
   - then flows:
     - cart/checkout/payment
     - orders/tracking
     - landing/discovery
     - address/maps

## Branches to avoid merging directly

The following branches should generally remain out of the merge queue unless a human reviewer explicitly requests otherwise:

- `accidental-ignore-7`
- `do-not-use`
- all `backup/*`
- all `dispatch-*`
- `build/qa-mobile-apk-2026-08-20`
- `copilot/research-task-repository-analysis`
- `feat/landing-reference-20260811`
- `feat/landing-reference-refresh`

## Notes

- This inventory reflects the 100 branches returned by the branch listing call used for this update.
- Categories are functional and intended for planning; some branches touch multiple services.
- Where purpose is not explicit from code diff, description is inferred conservatively from the branch name and verified repository architecture context.
