# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the current branch inventory for the Craves monorepo. It groups active and historical branches by platform domain so the team can review, sequence, and merge work into `main` with a single source of truth.

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — autonomous or assistant-driven implementation, infra fixes, release hardening, UI integration, and platform fixes
- `feature/` — production feature branches, usually scoped to a backend service, admin workflow, infra-facing integration, or customer-facing feature
- `feat/` — UI/UX and landing experience feature work, mostly frontend oriented
- `backend-` — backend slices implemented outside the `feature/` prefix
- `backup/` — snapshot or safety branches taken before large UI or product changes
- `build/` — build artifact or QA build branches
- `ci/` — CI/CD and deployment gate work
- `docs/` — documentation and audit branches
- `chatgpt/`, `copilot/` — AI-assisted research or implementation branches
- `dispatch-` — dispatch or release automation branches
- other standalone branches — special-purpose, temporary, or legacy lines of work

### Recommended naming standard going forward

Use:

- `feature/<domain>-<capability>` for feature delivery
- `agent/<problem-or-release-scope>` for AI-generated operational or integration work
- `fix/<service>-<issue>` for narrowly scoped corrections
- `docs/<topic>` for documentation-only changes
- `ci/<pipeline-change>` for CI/CD work
- `backup/<area>-<date>` only for temporary rollback safety points

## Merge policy

### Baseline policy

1. Merge into `main` only through reviewed pull requests.
2. Prefer squash merge for small or noisy branches.
3. Prefer rebase or merge commit for long-running branches that preserve milestone history.
4. Run service-specific tests before merge for touched areas:
   - backend Spring services
   - `apps/customer-web-next`
   - infra / Azure Front Door / APIM changes
   - migration validation where Flyway is involved
5. Validate cross-service contracts for auth, checkout, notifications, subscriptions, and chef/customer UI flows.

### Readiness scale used in this document

- **Ready** — branch title suggests a focused, reviewable change and can be prioritized for merge after normal validation
- **Review** — likely useful, but needs manual diff review, regression checks, or domain-owner approval
- **Caution** — likely temporary, backup, trigger, repack, or ambiguous branch; do not merge blindly
- **Hold** — explicitly risky or intentionally non-mergeable until renamed or reviewed deeply

### Priority scale used in this document

- **P0** — production stability, security, payments, auth, release, or routing
- **P1** — important product capabilities or operational tooling
- **P2** — UX refinement, support tooling, or additive improvements
- **P3** — backups, research, temporary branches, or low-priority historical work

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC enablement and role controls | auth-service | backend, security, API, Flyway | P0 | Review |
| feature/backend-internal-admin-rbac-v2 | Second-pass RBAC hardening for internal admin authorization | auth-service | backend, security, API, Flyway | P0 | Review |
| feature/backend-admin-account-intervention | Backend APIs for admin account intervention flows | auth-service | backend, admin API, security, Flyway | P0 | Review |
| feature/admin-account-intervention-apim | APIM exposure and gateway shaping for account intervention APIs | auth-service / api gateway | infra, APIM, API management | P1 | Review |
| feature/admin-account-intervention-web | Admin portal UI for account intervention operations | admin-portal / customer-web-next | frontend, BFF, admin UI | P1 | Review |
| feature/backend-redis-abuse-revocation | Abuse protection and token revocation using Redis-backed controls | auth-service | backend, security, Redis | P0 | Review |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in session flows across backend-connected surfaces | auth-service / customer-web-next | backend, frontend, auth, BFF | P0 | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchen-first discovery experience over catalog and geospatial search | catalog-service / customer-web-next | backend, frontend, discovery, geospatial | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration of kitchen-first discovery ranking and UX flow | catalog-service / customer-web-next | backend, frontend, discovery, geospatial | P1 | Review |
| feature/advanced-search-smart-filters | Expanded search and filtering for discovery and catalog browsing | catalog-service / customer-web-next | backend, frontend, search, BFF | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved items | user-chef-service / catalog-service | backend, API, data access | P1 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted customer-chef journey enhancements spanning discovery and profile interactions | customer-web-next / user-chef-service / catalog-service | backend, frontend, BFF | P2 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Repeat-order or reorder backend flow for customer order history | order-service | backend, API, order lifecycle | P1 | Review |
| agent/fix-chef-orders-and-customer-palette | UI/flow polish across chef orders and customer visual system | order-service / customer-web-next | frontend, BFF, UX | P2 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment experience redesign | customer-web-next / order-service / integration-service | frontend, BFF, payments, checkout | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI improvements | customer-web-next / order-service | frontend, BFF, tracking | P1 | Review |
| agent/fix-chef-registration-and-checkout-contract | Fix contract mismatches affecting chef registration and checkout flow integration | order-service / user-chef-service / customer-web-next | backend, frontend, contract, BFF | P0 | Review |
| agent/order-flyway-v14-checksum | Repair Flyway checksum issue for order-service migration V14 | order-service | backend, Flyway, database | P0 | Review |
| feature/backend-launch-policy-enforcement | Enforcement of launch policy gates around checkout or order release paths | order-service | backend, policy, API | P0 | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-grade notification delivery improvements across channels | notification-service | backend, worker, delivery, API | P0 | Review |
| feature/backend-notification-recovery-operations | Recovery and replay tooling for failed notification delivery | notification-service | backend, admin API, operations | P1 | Review |
| feature/admin-notification-recovery-apim | APIM and gateway exposure for admin recovery endpoints | notification-service / api gateway | infra, APIM, API management | P1 | Review |
| feature/admin-notification-recovery-web | Admin UI for notification recovery workflows | admin-portal / customer-web-next | frontend, admin UI, BFF | P1 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry paths, auth/session routing, and shell transitions | customer-web-next / auth-service | frontend, routing, auth, BFF | P0 | Review |
| agent/fix-chef-release-traffic-verification | Release verification for chef traffic and deployment routing correctness | chef web / infra | infra, routing, release validation | P0 | Review |
| agent/unify-chef-panel-customer-ui | Align chef panel and customer UI shell patterns for shared frontend consistency | customer-web-next | frontend, design system, shell | P2 | Review |
| feat/chef-complete-uiux | Chef application, kitchen, menu, operations, and orders UI/UX completion | customer-web-next / user-chef-service | frontend, BFF, chef UI | P1 | Review |
| feature/admin-chef-review | Admin workflow for chef application review and decisioning | user-chef-service / admin UI | backend, admin API, frontend | P1 | Review |
| feature/backend-chef-financial-ledger | Chef ledger and financial tracking support in backend integrations | integration-service | backend, payments, ledger, admin | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to real backend and BFF flows | customer-web-next | frontend, BFF, integration | P1 | Review |
| agent/fix-full-frontend-backend-integration | Resolve end-to-end frontend/backend integration gaps | customer-web-next / backend services | frontend, backend, BFF, contracts | P0 | Review |
| agent/fix-customer-web-proxy-origin | Fix proxy origin handling for customer web upstream calls | customer-web-next / infra | frontend, proxy, networking | P0 | Review |
| feat/customer-chef-uiux-foundation | Shared foundation for customer and chef-facing UI patterns | customer-web-next | frontend, design system, shell | P2 | Review |
| feat/customer-landing-discovery-uiux | Landing and discovery page UX improvements for acquisition flow | customer-web-next / catalog-service | frontend, BFF, discovery | P1 | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaner second-pass landing experience branch | customer-web-next | frontend, landing page | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for landing page structure | customer-web-next | frontend, semantics, accessibility | P2 | Review |
| feat/landing-reference-20260811 | Landing page reference branch for UI iteration | customer-web-next | frontend, landing page | P2 | Review |
| feat/landing-reference-refresh | Refresh of landing reference implementation | customer-web-next | frontend, landing page | P2 | Review |
| feature/address-final-work | Finalization pass for customer addresses workflow | user-chef-service / customer-web-next | backend, frontend, address, BFF | P1 | Review |
| feature/address-final-work-2 | Follow-up pass for address workflow completion | user-chef-service / customer-web-next | backend, frontend, address, BFF | P1 | Review |
| feature/address-final-work-3 | Third iteration of address workflow finalization | user-chef-service / customer-web-next | backend, frontend, address, BFF | P1 | Review |
| feature/address-final-work-4 | Fourth iteration of address workflow finalization | user-chef-service / customer-web-next | backend, frontend, address, BFF | P1 | Review |
| feature/azure-maps-address-autofill | Address autofill and suggestion experience using Azure Maps | user-chef-service / customer-web-next | backend, frontend, maps, BFF | P1 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM or gateway custom domain configuration | infra / api gateway | Azure, APIM, networking | P0 | Ready |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to mitigate asset issues | infra / frontend delivery | Azure Front Door, CDN, networking | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-load asset reliability | infra / frontend delivery | Azure Front Door, origin config, networking | P0 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading issues on cold devices or fresh sessions | infra / frontend delivery | frontend delivery, CDN, caching | P0 | Review |
| agent/fix-front-door-cache-validation-cli-288 | Correct Front Door cache validation rule issues, likely CLI 288-related | infra | Azure Front Door, CLI, cache rules | P0 | Ready |
| agent/fix-front-door-cli-288 | Fix Azure Front Door CLI 288 configuration/application problems | infra | Azure Front Door, CLI | P0 | Ready |
| agent/fix-front-door-gzip-cache-bypass | Adjust gzip and cache bypass behavior to prevent stale/corrupt delivery | infra | Azure Front Door, cache, compression | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Validate and repair gzip rules at Front Door layer | infra | Azure Front Door, validation, compression | P0 | Ready |
| agent/fix-front-door-secret-rest | Restore or fix secret handling for Front Door automation | infra | Azure, secrets, deployment automation | P0 | Review |
| agent/fix-front-door-security-policy-cli-288 | Repair Front Door security policy deployment or validation | infra | Azure Front Door, security policy, CLI | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Static gzip tuning for cold-loading paths | infra / frontend delivery | CDN, compression, caching | P0 | Ready |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config handling in Front Door automation | infra | Azure Front Door, CLI, cache config | P1 | Ready |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning workflow | infra | Azure Front Door, automation, domain ops | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF binding while updating custom domains in AFD | infra | Azure Front Door, WAF, networking | P0 | Review |
| agent/razorpay-payment-switch | Payment provider switch likely involving env, routes, or frontend wiring to Razorpay | integration-service / infra | payments, config, frontend integration | P0 | Review |
| android-build | Android/mobile build support branch | mobile / build pipeline | build, Android, CI | P2 | Review |
| build/qa-mobile-apk-2026-08-20 | QA APK build packaging branch | mobile / build pipeline | build, QA, Android | P2 | Caution |
| ci/subscription-service-predeploy-gate | CI gate to validate subscription-service before deploy | subscription-service / CI | CI/CD, validation, deployment | P1 | Ready |
| docs/production-release-audit-20260821 | Production release audit and release evidence documentation | docs / release | documentation, audit, release | P2 | Ready |
| feature/backend-cashfree-production-hardening | Production hardening for Cashfree integration paths | integration-service | backend, payments, reliability | P0 | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider integration stack | integration-service | backend, delivery, operations | P0 | Review |
| feature/backend-production-readiness-completion | Cross-backend production readiness completion work | multi-service backend | backend, ops, reliability | P0 | Review |
| feature/backend-refund-production-readiness | Refund workflow production readiness and operational hardening | integration-service / order-service | backend, refund, operations | P0 | Review |
| feature/cashfree-production-closeout-20260815 | Closeout tasks for Cashfree production rollout | integration-service | backend, payments, release | P1 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Temporary or accidental branch; not clearly aligned to deliverable work | unknown | git hygiene | P3 | Caution |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 customer-web changes | customer-web-next | backup, frontend | P3 | Caution |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile/home UI refinement | mobile / frontend | backup, frontend | P3 | Caution |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted journey branch spanning customer and chef flows | multi-service | backend, frontend, BFF | P2 | Review |
| copilot/research-task-repository-analysis | Research-only branch for repository analysis | docs / research | documentation, analysis | P3 | Caution |
| craves-master-guide-v1 | Master guide or umbrella documentation branch | docs | documentation | P3 | Review |
| craves-v5-patch-repack | Patch repack branch; likely release packaging rather than source change | release | packaging, release | P3 | Caution |
| dispatch-craves-v4 | Dispatch automation or release coordination branch | release / automation | automation, release | P3 | Caution |
| dispatch-craves-v4-issue-trigger | Dispatch trigger branch for issue-driven automation | release / automation | automation, workflow | P3 | Caution |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen trigger branch for workflow automation | release / automation | automation, workflow | P3 | Caution |
| dispatch-craves-v4-run-2 | Dispatch run branch iteration 2 | release / automation | automation, workflow | P3 | Caution |
| dispatch-craves-v4-run-3 | Dispatch run branch iteration 3 | release / automation | automation, workflow | P3 | Caution |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch | release / automation | automation, scheduling | P3 | Caution |
| do-not-use | Explicitly non-merge branch | unknown | temporary | P3 | Hold |
| feat/customer-cart-checkout-payment-uiux | Customer cart and checkout UI/UX redesign | customer-web-next / order-service / integration-service | frontend, BFF, payments | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared UI foundation for customer and chef experiences | customer-web-next | frontend, design system | P2 | Review |
| feat/customer-landing-discovery-uiux | Discovery-first landing experience | customer-web-next / catalog-service | frontend, BFF, discovery | P1 | Review |
| feat/customer-landing-v2-clean-20260808 | Clean landing v2 iteration | customer-web-next | frontend, landing | P2 | Review |
| feat/customer-orders-tracking-uiux | Order tracking and history UX improvements | customer-web-next / order-service | frontend, BFF, tracking | P1 | Review |
| feat/customer-web-semantic-reference-landing | Semantic landing reference branch | customer-web-next | frontend, accessibility, semantics | P2 | Review |
| feat/landing-reference-20260811 | Landing reference branch | customer-web-next | frontend | P2 | Review |
| feat/landing-reference-refresh | Refreshed landing reference branch | customer-web-next | frontend | P2 | Review |
| feature/admin-control-center-global-search | Admin global search and directory workflow | admin-portal / user-chef-service | frontend, backend, admin API | P1 | Review |
| feature/admin-customer-360-document-review | Admin customer-360 and document review workspace | admin-portal / user-chef-service / auth-service | frontend, backend, admin API | P1 | Review |
| feature/admin-dashboard-v2 | Admin dashboard second-generation experience | admin-portal / order-service | frontend, backend, analytics | P1 | Review |
| feature/admin-operational-investigations-apim | APIM work for operational investigations backend exposure | api gateway / order-service / integration-service | APIM, backend, admin ops | P1 | Review |
| feature/admin-operational-investigations-web | Admin web workflow for investigations and ops tracing | admin-portal | frontend, admin UI, BFF | P1 | Review |
| feature/admin-subscription-operations | Admin operations tooling for subscription incidents and lifecycle control | subscription-service / admin-portal | backend, frontend, admin API | P1 | Review |
| feature/admin-subscription-plans | Admin workflow for subscription plan management | subscription-service / admin-portal | backend, frontend, plan management | P1 | Review |
| feature/admin-web-operations-shell | Shared admin shell focused on operational workflows | admin-portal | frontend, shell, navigation | P2 | Review |
| feature/admin-web-shell | Baseline admin shell and app framing | admin-portal | frontend, shell | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for investigations across admin workflows | order-service / integration-service | backend, admin API, audit | P1 | Review |
| feature/backend-admin-operations-audit | Audit trail for admin operations and investigations | auth-service / order-service / integration-service | backend, audit, security | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Billing lifecycle support for subscriptions | subscription-service | backend, billing, events | P1 | Review |
| feature/backend-subscription-occurrence-generator | Scheduled generation of subscription occurrences | subscription-service | backend, scheduler, domain logic | P1 | Review |
| feature/backend-subscription-order-fulfillment | Order fulfillment linkage for subscription occurrences | subscription-service / order-service | backend, events, order integration | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and management | integration-service / subscription-service | backend, payments, API | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events | subscription-service / integration-service | backend, messaging, payments | P1 | Review |
| feature/backend-subscription-plan-schedules | Backend schedule modeling for subscription plans | subscription-service | backend, scheduling, API | P1 | Review |

---

## Merge guidance by branch family

### Merge first: production stability and platform safety

Prioritize these branches early because they affect routing, auth, payments, release readiness, or core reliability:

- `agent/apim-gateway-domain-fix`
- `agent/disable-afd-edge-compression`
- `agent/disable-origin-gzip-for-cold-loading`
- `agent/fix-front-door-cli-288`
- `agent/fix-front-door-cache-validation-cli-288`
- `agent/fix-front-door-security-policy-cli-288`
- `agent/fix-front-door-gzip-cache-bypass`
- `agent/fix-front-door-gzip-rule-validation`
- `agent/fix-static-gzip-cold-loading`
- `agent/backend-internal-admin-rbac`
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-redis-abuse-revocation`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-refund-production-readiness`
- `feature/backend-production-readiness-completion`
- `agent/order-flyway-v14-checksum`

### Merge second: customer-critical flows

These branches improve acquisition, signed-in flows, checkout, discovery, chef operations, and customer backend integration:

- `agent/customer-web-connected-ui`
- `agent/fix-full-frontend-backend-integration`
- `agent/fix-backend-connected-signed-in-flows`
- `agent/fix-chef-entry-and-session-routing`
- `agent/fix-chef-registration-and-checkout-contract`
- `agent/nearby-kitchens-first-discovery`
- `agent/nearby-kitchens-first-discovery-v2`
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-orders-tracking-uiux`
- `backend-customer-reorder-20260816`
- `backend-customer-favorites-20260816`
- `feature/azure-maps-address-autofill`
- `feature/address-final-work*`

### Merge third: admin and subscription operations

- `feature/admin-dashboard-v2`
- `feature/admin-control-center-global-search`
- `feature/admin-customer-360-document-review`
- `feature/admin-notification-recovery-apim`
- `feature/admin-notification-recovery-web`
- `feature/admin-operational-investigations-apim`
- `feature/admin-operational-investigations-web`
- `feature/admin-subscription-operations`
- `feature/admin-subscription-plans`
- `feature/backend-admin-investigation-apis`
- `feature/backend-admin-operations-audit`
- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`

### Review carefully before any merge

These are likely temporary, backup, research, packaging, or workflow branches:

- `accidental-ignore-7`
- `do-not-use`
- all `backup/*`
- all `dispatch-*`
- `craves-v5-patch-repack`
- `copilot/research-task-repository-analysis`
- `build/qa-mobile-apk-2026-08-20`

### Practical merge order within a PR train

1. **Infra + release safety**
2. **Auth + session integrity**
3. **Backend production hardening**
4. **Customer discovery and checkout**
5. **Chef operations and admin tooling**
6. **Subscription lifecycle branches**
7. **UI polish and reference branches**
8. **Backups / dispatch / temporary branches: never merge without explicit reason**

---

## Inventory notes

- Total branches listed above: **100**
- Branch categorization is based on real branch names retrieved from GitHub and aligned to the observed monorepo services:
  - `auth-service`
  - `catalog-service`
  - `order-service`
  - `notification-service`
  - `integration-service`
  - `subscription-service`
  - `user-chef-service`
  - `apps/customer-web-next`
  - admin / infra surfaces where branch names clearly indicate that scope
- Where branch names are ambiguous, readiness is intentionally conservative.

## Recommended next maintenance step

After each merge, update this file by:

1. removing merged branches from active tables or marking them merged,
2. downgrading backups and dispatch branches to archive status,
3. adding PR links and merge SHAs per branch,
4. tracking blockers for long-running branches such as auth RBAC, checkout integration, and subscription operations.
