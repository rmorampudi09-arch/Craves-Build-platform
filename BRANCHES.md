# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

## Branch naming convention

The repository currently uses a mixed branch naming strategy. Existing real prefixes in the repository include:

- `agent/` — autonomous agent fixes, release patches, frontend/backend integration, infra/domain fixes
- `feature/` — production feature work, backend capabilities, admin tools, platform enhancements
- `feat/` — UI/UX and product-facing feature design or frontend implementation streams
- `backend-` — backend feature slices without prefix namespace
- `backup/` — point-in-time preservation branches before risky UI/refactor work
- `build/` — build or artifact validation branches
- `ci/` — deployment or pipeline gating work
- `docs/` — release and audit documentation
- `chatgpt/`, `copilot/` — AI-assisted exploration or implementation branches
- `dispatch-` — orchestration/trigger branches
- miscellaneous single-purpose branches like `android-build`, `do-not-use`, and `accidental-ignore-7`

### Recommended interpretation rules

1. Prefer `feature/<domain-capability>` for mergeable production work.
2. Treat `agent/`, `dispatch-`, `backup/`, and `do-not-use` as branches requiring extra validation before merge.
3. Treat `feat/` branches as primarily frontend/product experience streams unless backend evidence says otherwise.
4. Treat `backend-...` and `feature/backend-...` branches as service-facing implementation branches.

## Merge policy

### Base policy

- Merge target: `main`
- Preferred strategy: **Squash merge** for UI, docs, and iterative agent branches; **Rebase or squash** for backend feature branches depending on review traceability needs.
- Require green CI, config validation, and service-specific smoke checks before merge.
- For branches touching production infra, payment, auth, notification delivery, or checkout flows, require staged verification before merging to `main`.

### Merge readiness labels used in this document

- **Ready** — naming and scope indicate likely mergeable feature work, pending normal review.
- **Review** — needs code review and service validation before merge.
- **Caution** — branch appears experimental, operational, backup, or release-hotfix oriented; merge only with explicit owner approval.
- **Do not merge** — archival or explicitly unsafe branch.

### Priority labels used in this document

- **P0** — production-critical auth, payment, checkout, delivery, or release stability work
- **P1** — important platform or customer-facing feature work
- **P2** — enhancement, UI/UX refinement, admin tooling, or optimization
- **P3** — archival, exploratory, or low-priority support work

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC hardening and role enablement. | auth-service | Backend API, security, RBAC, Flyway | P0 | Review |
| feature/admin-account-intervention-apim | Admin account intervention API management and gateway exposure. | auth-service | APIM, backend API, security | P1 | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows. | customer-web-next / admin-web | Frontend, BFF, admin UI, auth flows | P1 | Review |
| feature/backend-admin-account-intervention | Backend implementation of account intervention controls and audit behavior. | auth-service | Backend API, security, persistence | P0 | Ready |
| feature/backend-internal-admin-rbac-v2 | Second-pass RBAC expansion for internal admin permissions. | auth-service | Backend API, security, RBAC, Flyway | P0 | Ready |
| feature/backend-redis-abuse-revocation | Redis-backed abuse prevention and token revocation strengthening. | auth-service | Backend API, security, Redis | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchens discovery experience and service hookup. | catalog-service | Backend API, discovery, frontend/BFF | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Refined nearby discovery flow with likely UX and query improvements. | catalog-service | Backend API, discovery, frontend/BFF | P1 | Review |
| backend-customer-favorites-20260816 | Customer favorites capability tied to catalog/menu experience. | user-chef-service / catalog read flows | Backend API, BFF, customer experience | P1 | Review |
| feature/advanced-search-smart-filters | Advanced search and smart filters for discovery and catalog browsing. | catalog-service / customer-web-next | Backend API, search, frontend, BFF | P1 | Ready |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fix chef order views and customer-facing order UI consistency. | order-service / customer-web-next | Backend API, frontend, BFF | P1 | Review |
| agent/fix-chef-registration-and-checkout-contract | Resolve contract mismatches affecting chef registration and checkout. | order-service / user-chef-service | Backend API, contracts, BFF | P0 | Review |
| agent/order-flyway-v14-checksum | Repair Flyway checksum issue on order-service migration V14. | order-service | Backend API, Flyway, database | P0 | Caution |
| backend-customer-reorder-20260816 | Reorder or repeat order experience for customers. | order-service | Backend API, BFF, customer web | P1 | Review |
| feature/backend-launch-policy-enforcement | Enforce launch policies in checkout/order lifecycle. | order-service | Backend API, business rules, persistence | P0 | Ready |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | Expose notification recovery operations through API management/admin paths. | notification-service | Backend API, APIM, ops tooling | P1 | Review |
| feature/admin-notification-recovery-web | Admin UI for recovery and replay of notification delivery issues. | customer-web-next / admin-web | Frontend, BFF, admin UI | P1 | Review |
| feature/backend-notification-production-delivery | Production delivery hardening for email/push notification execution. | notification-service | Backend API, workers, adapters, persistence | P0 | Ready |
| feature/backend-notification-recovery-operations | Recovery operations, redelivery, and operational repair tooling. | notification-service | Backend API, workers, ops tooling | P1 | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry points, auth session routing, and dashboard access behavior. | customer-web-next / auth-service | Frontend, BFF, auth/session | P0 | Review |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic and environment routing behavior. | customer-web-next / infra | Frontend, infra, release validation | P1 | Caution |
| feat/chef-complete-uiux | Complete chef UI/UX across chef workflows. | customer-web-next | Frontend, design system, BFF | P1 | Review |
| feature/admin-chef-review | Admin chef review workflow and document approval tooling. | user-chef-service / admin-web | Backend API, frontend, BFF, admin workflow | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef earnings, financial ledger, and settlement read models. | integration-service | Backend API, payments, ledger, persistence | P1 | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live backend/BFF integrations. | customer-web-next | Frontend, BFF, API integration | P0 | Review |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in customer flows against connected backend APIs. | customer-web-next / auth-service | Frontend, BFF, auth/session | P0 | Review |
| agent/fix-customer-web-proxy-origin | Fix proxy origin behavior for customer-web BFF routes. | customer-web-next | BFF, frontend, routing | P0 | Review |
| agent/fix-full-frontend-backend-integration | End-to-end frontend/backend integration corrections across user journeys. | customer-web-next / platform | Frontend, BFF, backend integration | P0 | Review |
| agent/landing-body-07cm-inset | Landing page layout refinement iteration. | customer-web-next | Frontend, UI/UX | P3 | Caution |
| agent/landing-body-11cm-inset | Alternative landing page spacing/layout refinement. | customer-web-next | Frontend, UI/UX | P3 | Caution |
| agent/unify-chef-panel-customer-ui | Unify shared UI language across chef and customer surfaces. | customer-web-next | Frontend, design system, BFF | P2 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing page V2 work. | customer-web-next | Frontend backup | P3 | Do not merge |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinements. | customer-web-next / mobile UI | Frontend backup | P3 | Do not merge |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted customer-chef journey implementation or exploration. | platform | Backend API, frontend, BFF | P2 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX stream. | customer-web-next | Frontend, BFF, payments UX | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared customer/chef UI foundation. | customer-web-next | Frontend, design system | P2 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX enhancements. | customer-web-next | Frontend, discovery UX | P1 | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaner landing V2 implementation. | customer-web-next | Frontend, UI/UX | P2 | Review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI/UX improvements. | customer-web-next / order-service | Frontend, BFF, order UX | P1 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference landing implementation for customer web. | customer-web-next | Frontend, SEO, UX | P2 | Review |
| feat/landing-reference-20260811 | Landing reference branch for visual/content direction. | customer-web-next | Frontend, UX reference | P3 | Caution |
| feat/landing-reference-refresh | Refresh of landing reference implementation. | customer-web-next | Frontend, UX reference | P3 | Caution |
| feature/address-final-work | Final address workflow implementation iteration. | user-chef-service / customer-web-next | Backend API, BFF, frontend, geocoding | P1 | Review |
| feature/address-final-work-2 | Follow-up iteration for address workflow stabilization. | user-chef-service / customer-web-next | Backend API, BFF, frontend, geocoding | P1 | Review |
| feature/address-final-work-3 | Third pass on address workflow fixes and refinements. | user-chef-service / customer-web-next | Backend API, BFF, frontend, geocoding | P1 | Review |
| feature/address-final-work-4 | Fourth pass on address flow completion and polish. | user-chef-service / customer-web-next | Backend API, BFF, frontend, geocoding | P1 | Review |
| feature/azure-maps-address-autofill | Azure Maps powered address autofill and recommendation UX. | user-chef-service / customer-web-next | Backend API, BFF, Azure Maps, frontend | P1 | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM or gateway custom domain configuration. | infra / api gateway | Infra, DNS, APIM | P0 | Review |
| agent/backend-completion-guarded-release | Guarded backend release completion with rollout safety checks. | platform | Release, CI/CD, backend ops | P0 | Caution |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to fix delivery issues. | infra / frontend delivery | Infra, CDN, Front Door | P0 | Review |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-load stability. | infra / frontend delivery | Infra, CDN, web delivery | P0 | Review |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices. | infra / customer-web-next | Infra, CDN, frontend delivery | P0 | Review |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation correction tied to CLI issue 288. | infra | Infra, CDN, validation | P1 | Review |
| agent/fix-front-door-cli-288 | Front Door correction branch tied to CLI issue 288. | infra | Infra, CDN | P1 | Review |
| agent/fix-front-door-gzip-cache-bypass | Adjust gzip cache bypass handling at edge. | infra | Infra, CDN, caching | P1 | Review |
| agent/fix-front-door-gzip-rule-validation | Validate/repair Front Door gzip rule configuration. | infra | Infra, CDN, policy validation | P1 | Review |
| agent/fix-front-door-secret-rest | Secret handling fix for Front Door or gateway integration. | infra | Infra, secrets, gateway | P0 | Review |
| agent/fix-front-door-security-policy-cli-288 | Repair Front Door security policy config tied to CLI issue. | infra | Infra, security, CDN | P0 | Review |
| agent/fix-static-gzip-cold-loading | Static gzip cold-loading reliability fix. | infra / frontend delivery | Infra, CDN, frontend delivery | P1 | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache settings for Front Door. | infra | Infra, CDN, config | P1 | Review |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning automation. | infra | Infra, automation, DNS/CDN | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve Azure Front Door custom domain and WAF settings through updates. | infra | Infra, WAF, Front Door | P0 | Review |
| android-build | Android build or packaging validation branch. | mobile/build | Build, mobile, CI | P2 | Caution |
| build/qa-mobile-apk-2026-08-20 | QA APK build generation and validation. | mobile/build | Build, CI, mobile artifact | P2 | Caution |
| ci/subscription-service-predeploy-gate | CI gate before subscription-service deployment. | subscription-service / CI | CI/CD, deployment validation | P1 | Ready |
| dispatch-craves-v4 | Dispatch/orchestration trigger branch for v4 workflow. | ops automation | Automation, dispatch tooling | P3 | Caution |
| dispatch-craves-v4-issue-trigger | Issue-triggered dispatch automation for v4. | ops automation | Automation, issue ops | P3 | Caution |
| dispatch-craves-v4-reopen-trigger | Reopen-triggered dispatch automation for v4. | ops automation | Automation, issue ops | P3 | Caution |
| dispatch-craves-v4-run-2 | Dispatch workflow run branch 2. | ops automation | Automation | P3 | Caution |
| dispatch-craves-v4-run-3 | Dispatch workflow run branch 3. | ops automation | Automation | P3 | Caution |
| dispatch-craves-v4-schedule | Scheduled dispatch automation for v4. | ops automation | Automation, scheduler | P3 | Caution |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | docs / platform | Documentation, release governance | P2 | Ready |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Unclear utility/temporary branch; likely accidental or experimental. | unknown | Miscellaneous | P3 | Caution |
| copilot/research-task-repository-analysis | AI-assisted research and repository analysis branch. | docs / platform | Documentation, analysis | P3 | Caution |
| craves-master-guide-v1 | Master guide or broad reference content branch. | docs / platform | Documentation | P3 | Caution |
| craves-v5-patch-repack | Repackaging or release patch preparation branch. | platform | Release engineering | P2 | Caution |
| do-not-use | Explicitly non-mergeable branch. | unknown | Miscellaneous | P3 | Do not merge |
| feature/admin-control-center-global-search | Global search for admin control center and operational lookup. | customer-web-next / admin-web / backend | Frontend, BFF, backend APIs, search | P1 | Ready |
| feature/admin-customer-360-document-review | Customer 360 and document review tooling for admin operations. | user-chef-service / admin-web | Backend API, frontend, BFF, admin ops | P1 | Ready |
| feature/admin-dashboard-v2 | Second-generation admin dashboard. | admin-web / order-service | Frontend, BFF, analytics/dashboard | P1 | Ready |
| feature/admin-operational-investigations-apim | APIM exposure for admin operational investigations. | order-service / integration-service | APIM, backend API, admin ops | P1 | Review |
| feature/admin-operational-investigations-web | Admin web workflows for operational investigations. | admin-web / customer-web-next | Frontend, BFF, admin ops | P1 | Review |
| feature/admin-subscription-operations | Admin operations for subscriptions lifecycle oversight. | subscription-service / admin-web | Backend API, frontend, BFF | P1 | Ready |
| feature/admin-subscription-plans | Admin management for subscription plans and plan readiness. | subscription-service / admin-web | Backend API, frontend, BFF | P1 | Ready |
| feature/admin-web-operations-shell | Operations-focused admin shell and navigation framework. | admin-web | Frontend, shell, BFF | P2 | Ready |
| feature/admin-web-shell | Base admin shell/foundation branch. | admin-web | Frontend, shell | P2 | Ready |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigation workflows. | order-service / integration-service | Backend API, audit, persistence | P1 | Ready |
| feature/backend-admin-operations-audit | Audit trail and operations audit backend capability. | order-service / platform | Backend API, audit, persistence | P1 | Ready |
| feature/backend-cashfree-production-hardening | Harden Cashfree integration for production conditions. | integration-service | Backend API, payments, provider adapter | P0 | Ready |
| feature/backend-delivery-provider-production-readiness | Delivery provider readiness, checks, and production hardening. | integration-service | Backend API, delivery orchestration, provider adapters | P0 | Ready |
| feature/backend-production-readiness-completion | Broad backend production-readiness completion branch. | platform | Backend API, ops, release hardening | P0 | Review |
| feature/backend-refund-production-readiness | Refund workflow hardening and production support. | integration-service / order-service | Backend API, payments, refund processing | P0 | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation. | subscription-service | Backend API, billing, workers, persistence | P1 | Ready |
| feature/backend-subscription-occurrence-generator | Generate subscription occurrences and schedule materialization. | subscription-service | Backend API, workers, scheduling, persistence | P1 | Ready |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment integration. | subscription-service / order-service | Backend API, async integration, persistence | P1 | Ready |
| feature/backend-subscription-payment-intents | Payment intent creation for subscriptions. | integration-service / subscription-service | Backend API, payments, billing | P1 | Ready |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | Backend API, async processing, workers | P1 | Ready |
| feature/backend-subscription-plan-schedules | Plan scheduling and public/private schedule management. | subscription-service | Backend API, scheduling, persistence | P1 | Ready |
| feature/cashfree-production-closeout-20260815 | Closeout and completion branch for Cashfree production rollout. | integration-service | Backend API, payments, release hardening | P1 | Review |
| agent/razorpay-payment-switch | Switch payment routing or default provider behavior to Razorpay. | integration-service | Backend API, payments, provider routing | P0 | Review |

---

## Merge guidance by category

### Auth
- Merge RBAC and revocation branches before broad admin shell or intervention UI branches.
- Validate token refresh/logout/session flows and internal role checks.

### Catalog
- Merge discovery and search work behind feature flags if ranking/query behavior changes.
- Validate customer favorites against existing user-chef and catalog read models.

### Orders
- Merge migration repair branches only after confirming checksum strategy and environment safety.
- Validate checkout contracts, chef actions, reorder flows, and order history/tracking UX together.

### Notifications
- Merge production delivery hardening before recovery UI if the UI depends on backend recovery APIs.
- Confirm ACS/FCM provider config and retry/replay safety.

### Chef
- Merge chef session/routing fixes before chef UI completion branches.
- Validate admin chef review alongside evidence/document review APIs.

### Customer
- Merge core connected UI and signed-in flow fixes first.
- Treat backup branches as archival only.
- Address and maps branches should be merged after confirming BFF proxy behavior and reverse geocode contracts.

### Infra
- Prioritize APIM, Front Door, compression, security policy, and secret handling fixes before customer-facing release branches.
- Merge dispatch and build branches only if they represent durable automation changes rather than one-off runs.

### Feature
- Merge backend production-hardening branches before admin shells and broad operational UI surfaces that depend on them.
- Avoid merging ambiguous archival branches (`do-not-use`, accidental, repack) without explicit human owner approval.

---

## Inventory notes

- This document reflects the **100 real branches returned by GitHub list branches page 1 (`per_page=100`)**.
- The repository has at least these 100 branches available for triage and merge planning.
- Category placement is based on branch naming plus repository service topology from the current codebase.
