# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 96

## Branch naming convention

This repository currently uses a mix of branch prefixes that reflect delivery intent, service ownership, and operational context:

- `agent/` — AI-assisted delivery, infra fixes, UI integration, release hardening, and operational remediation.
- `feature/` — production feature branches, typically backend, admin, infra, or platform capabilities.
- `feat/` — UI/UX and experience-oriented feature work, mostly customer/chef/admin frontend flows.
- `backend-*` — backend-only focused changes outside the `feature/` prefix.
- `backup/` — preservation branches used as restore points before major UI or experience changes.
- `build/` — build artifacts and QA packaging branches.
- `ci/` — deployment gates and pipeline enforcement work.
- `docs/` — documentation and audit artifacts.
- `dispatch-*` — scheduled/automation orchestration branches.
- `chatgpt/`, `copilot/` — AI research or implementation experiments.
- other standalone branches such as `android-build`, `do-not-use`, and `accidental-ignore-7` — ad hoc operational or historical work.

## Merge policy

### General rules

1. Merge **service-safe branches first**: auth, catalog, orders, notifications, chef/customer domain changes.
2. Merge **infra and APIM changes after validating downstream APIs**.
3. Merge **frontend experience branches only after backend/BFF contracts are stable**.
4. Do **not** merge `backup/`, `dispatch-*`, `do-not-use`, or obviously temporary branches into `main` unless explicitly required.
5. Prefer **squash merge** for isolated feature branches and **rebase or merge commit** only when preserving branch history matters.

### Readiness labels used below

- **Ready** — branch purpose is clear and likely mergeable after normal review.
- **Review** — branch appears substantial or cross-cutting and should undergo targeted validation.
- **Validate** — branch is likely environment- or deployment-sensitive and needs integration checks.
- **Hold** — branch looks archival, experimental, duplicate, or intentionally non-mergeable.

### Priority labels used below

- **P0** — production-critical, security, payments, release, or routing fixes.
- **P1** — important feature completion or operational capabilities.
- **P2** — useful product enhancement or UI improvement.
- **P3** — backup, research, build-only, experimental, or deferred work.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin role-based access control implementation or stabilization. | auth-service | Backend, security, Redis, JWT, internal APIs | P0 | Review |
| `feature/backend-internal-admin-rbac-v2` | Follow-up RBAC iteration for internal admin authorization. | auth-service | Backend, security, JWT, internal RBAC | P0 | Review |
| `feature/backend-admin-account-intervention` | Backend support for admin account disable, enable, and session revocation flows. | auth-service | Backend, admin APIs, security, audit | P0 | Ready |
| `feature/admin-account-intervention-apim` | APIM exposure and policy wiring for admin account intervention endpoints. | auth-service | APIM, infra, gateway policies | P1 | Validate |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention and operator actions. | auth-service | Frontend, BFF, admin portal, auth flows | P1 | Review |
| `feature/backend-redis-abuse-revocation` | Hardening for token revocation and abuse controls using Redis-backed security enforcement. | auth-service | Backend, Redis, security filters, auth | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Discovery-first customer experience emphasizing nearby kitchens. | catalog-service | Backend discovery APIs, frontend landing/discovery, BFF | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Refined second pass of nearby-kitchen-first discovery experience. | catalog-service | Catalog backend, discovery UX, BFF, frontend | P1 | Review |
| `feature/advanced-search-smart-filters` | Enhanced search and filtering for kitchens and menu exploration. | catalog-service | Backend query layer, frontend filters, BFF | P1 | Review |
| `feature/azure-maps-address-autofill` | Address autofill and geospatial assistance using Azure Maps. | catalog-service | Frontend, BFF, maps integration, address UX | P1 | Ready |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-orders-and-customer-palette` | Fixes chef order views and customer-facing styling consistency. | order-service | Frontend, BFF, chef flows, customer UI | P1 | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Contract corrections across chef onboarding and checkout payload handling. | order-service | Backend contracts, BFF, checkout, validation | P0 | Validate |
| `agent/order-flyway-v14-checksum` | Order-service migration checksum repair for Flyway consistency. | order-service | Backend, database migrations, release ops | P0 | Validate |
| `backend-customer-reorder-20260816` | Customer reorder capability built on prior order history. | order-service | Backend, order APIs, BFF, frontend | P1 | Ready |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment user experience enhancement. | order-service | Frontend, BFF, checkout UI, payment UX | P1 | Review |
| `feat/customer-orders-tracking-uiux` | Customer order list and live tracking experience improvements. | order-service | Frontend, BFF, tracking UI, order flows | P1 | Review |
| `feature/backend-launch-policy-enforcement` | Backend enforcement of launch gates and operational policy around order execution. | order-service | Backend, aspects/policies, release controls | P0 | Review |
| `feature/backend-refund-production-readiness` | Production hardening for refund workflows and post-order financial correctness. | order-service | Backend, integrations, refunds, outbox/events | P0 | Ready |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Hardening delivery workers and production notification sending. | notification-service | Backend, email/push delivery, workers, retries | P0 | Ready |
| `feature/backend-notification-recovery-operations` | Recovery operations for failed notifications and admin retry workflows. | notification-service | Backend, admin APIs, recovery ops, delivery state | P1 | Ready |
| `feature/admin-notification-recovery-apim` | APIM exposure for admin notification recovery operations. | notification-service | APIM, gateway, infra policies | P1 | Validate |
| `feature/admin-notification-recovery-web` | Admin web experience for notification recovery and retry operations. | notification-service | Frontend, admin portal, BFF, operations UI | P1 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entry points, navigation, and session routing. | user-chef-service | Frontend, BFF, auth/session, chef UI | P1 | Review |
| `agent/fix-chef-release-traffic-verification` | Release validation for chef traffic routing and production behavior. | user-chef-service | Infra, routing, frontend validation, release ops | P0 | Validate |
| `agent/unify-chef-panel-customer-ui` | Unifies design language between chef panel and customer experiences. | user-chef-service | Frontend, design system, BFF, UX | P2 | Review |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted implementation of connected customer-chef journey flows. | user-chef-service | Backend, frontend, BFF, cross-domain flow design | P2 | Review |
| `feat/chef-complete-uiux` | Broad chef product UX completion branch. | user-chef-service | Frontend, BFF, chef dashboard, UX | P1 | Review |
| `feature/admin-chef-review` | Admin review workflow for chef applications and operational approval. | user-chef-service | Backend, admin APIs, frontend review tools | P1 | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and earnings/accounting capability. | integration-service | Backend, finance, payouts/ledger, admin tools | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connects customer web UI to live backend/BFF data flows. | customer-web-next | Frontend, Next.js BFF, API integration | P1 | Review |
| `agent/fix-backend-connected-signed-in-flows` | Fixes signed-in customer flows after backend integration. | customer-web-next | Frontend, BFF, auth session, API integration | P0 | Review |
| `agent/fix-full-frontend-backend-integration` | End-to-end frontend/backend integration stabilization. | customer-web-next | Frontend, backend contracts, BFF, integration testing | P0 | Validate |
| `backend-customer-favorites-20260816` | Backend support for customer favorites/wishlist flows. | user-chef-service | Backend, customer APIs, favorites domain | P1 | Ready |
| `feat/customer-chef-uiux-foundation` | Shared foundation for customer and chef UI/UX systems. | customer-web-next | Frontend, design system, BFF | P2 | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery browsing experience. | customer-web-next | Frontend, discovery UX, BFF, marketing surface | P1 | Review |
| `feat/customer-landing-v2-clean-20260808` | Cleaned-up v2 landing page implementation. | customer-web-next | Frontend, landing UX, static/SSR pages | P2 | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic reference landing page implementation or redesign baseline. | customer-web-next | Frontend, semantic HTML, landing UX | P2 | Review |
| `feature/address-final-work` | Address management iteration for customer profile and checkout flows. | user-chef-service | Backend, frontend, BFF, address management | P1 | Review |
| `feature/address-final-work-2` | Follow-up address flow fixes or completion pass. | user-chef-service | Backend, frontend, address UX, BFF | P1 | Review |
| `feature/address-final-work-3` | Third pass on address completion and bug fixes. | user-chef-service | Backend, frontend, customer profile, BFF | P1 | Review |
| `feature/address-final-work-4` | Fourth pass on address flow stabilization, likely superseding prior iterations. | user-chef-service | Backend, frontend, address APIs, BFF | P1 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | API Management gateway custom-domain or routing fix. | infra/apim | Infra, APIM, gateway, DNS/routing | P0 | Validate |
| `agent/backend-completion-guarded-release` | Release guardrails to ensure backend completion before rollout. | infra/platform | CI/CD, release controls, backend deployment | P0 | Validate |
| `agent/disable-afd-edge-compression` | Azure Front Door edge compression disablement to resolve response issues. | infra/front-door | Infra, Azure Front Door, caching/compression | P0 | Validate |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to improve cold-load behavior and content serving reliability. | infra/front-door | Infra, CDN/origin, compression, delivery | P0 | Validate |
| `agent/fix-cold-device-static-loading` | Fix static asset loading issues on cold devices. | infra/frontend-delivery | Frontend delivery, caching, CDN, performance | P0 | Validate |
| `agent/fix-customer-web-proxy-origin` | Correct proxy origin configuration for customer web. | infra/front-door | Infra, reverse proxy, frontend routing | P0 | Validate |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache validation fix tied to CLI compatibility issue 288. | infra/front-door | Infra, CLI automation, cache rules | P0 | Validate |
| `agent/fix-front-door-cli-288` | General Azure Front Door CLI issue 288 remediation. | infra/front-door | Infra, CLI automation, deployment scripts | P0 | Validate |
| `agent/fix-front-door-gzip-cache-bypass` | Adjust gzip/cache interaction to prevent stale or broken asset delivery. | infra/front-door | Infra, cache, compression, frontend delivery | P0 | Validate |
| `agent/fix-front-door-gzip-rule-validation` | Rule validation fix for Front Door gzip behavior. | infra/front-door | Infra, routing rules, gateway validation | P0 | Validate |
| `agent/fix-front-door-secret-rest` | Secret handling fix for Front Door configuration or automation REST flows. | infra/front-door | Infra, secrets, automation, REST config | P0 | Validate |
| `agent/fix-front-door-security-policy-cli-288` | Security policy fix for Front Door under CLI issue constraints. | infra/front-door | Infra, security policy, WAF, CLI | P0 | Validate |
| `agent/fix-static-gzip-cold-loading` | Static gzip behavior fix targeting cold-loading problems. | infra/frontend-delivery | CDN, static assets, compression, performance | P0 | Validate |
| `agent/parallel-front-door-domain-provisioning` | Parallelizes Front Door custom-domain provisioning workflow. | infra/front-door | Infra, domain automation, deployment | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF configuration during Front Door custom-domain updates. | infra/front-door | Infra, WAF, APIM/AFD config, deployment safety | P0 | Validate |
| `agent/razorpay-payment-switch` | Payment provider switching and operational routing toward Razorpay. | integration-service | Backend, payments, config, release ops | P0 | Review |
| `android-build` | Android/mobile build branch, likely packaging or compatibility work. | mobile/build | Build pipeline, mobile packaging | P3 | Hold |
| `build/qa-mobile-apk-2026-08-20` | QA APK generation and build packaging branch. | mobile/build | Build, QA artifacts, CI/CD | P3 | Hold |
| `ci/subscription-service-predeploy-gate` | CI predeploy gate for subscription-service safety checks. | subscription-service | CI/CD, validation gates, deployment | P1 | Ready |
| `docs/production-release-audit-20260821` | Production release audit notes and evidence collection. | docs/release | Documentation, audit, release ops | P2 | Ready |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree payment integration. | integration-service | Backend, payments, provider integration, ops | P0 | Ready |
| `feature/backend-delivery-provider-production-readiness` | Hardening delivery provider integrations for production use. | integration-service | Backend, delivery provider adapters, ops | P0 | Ready |
| `feature/backend-production-readiness-completion` | Broad backend readiness completion branch across services. | platform/backend | Backend, ops, validation, deployment | P0 | Review |
| `feature/cashfree-production-closeout-20260815` | Final closeout work for Cashfree production launch. | integration-service | Backend, payments, release closure, ops | P0 | Validate |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Historical or accidental branch; no reliable merge intent inferred. | unknown | Misc, repository history | P3 | Hold |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | Backup, frontend snapshot | P3 | Hold |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | mobile/ui | Backup, frontend/mobile snapshot | P3 | Hold |
| `copilot/research-task-repository-analysis` | AI research branch for repository understanding. | docs/platform | Documentation, analysis, research | P3 | Hold |
| `craves-master-guide-v1` | Repository guide or master documentation branch. | docs/platform | Docs, onboarding, reference | P2 | Review |
| `craves-v5-patch-repack` | Patch repack branch for release packaging. | release/platform | Release engineering, packaging | P2 | Hold |
| `dispatch-craves-v4` | Dispatch automation branch for Craves v4 run flow. | automation | Scheduling, automation, release tooling | P3 | Hold |
| `dispatch-craves-v4-issue-trigger` | Issue-triggered dispatch automation branch. | automation | Automation, issue workflows | P3 | Hold |
| `dispatch-craves-v4-reopen-trigger` | Reopen-triggered dispatch automation branch. | automation | Automation, issue workflows | P3 | Hold |
| `dispatch-craves-v4-run-2` | Dispatch automation rerun branch. | automation | Automation, scheduled workflows | P3 | Hold |
| `dispatch-craves-v4-run-3` | Dispatch automation rerun branch. | automation | Automation, scheduled workflows | P3 | Hold |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | automation | Scheduling, automation | P3 | Hold |
| `do-not-use` | Explicitly marked non-mergeable branch. | unknown | Misc | P3 | Hold |
| `feat/landing-reference-20260811` | Landing page reference implementation branch. | customer-web-next | Frontend, design reference, landing UX | P2 | Review |
| `feat/landing-reference-refresh` | Refresh of landing reference implementation. | customer-web-next | Frontend, design refresh, landing UX | P2 | Review |
| `feature/admin-control-center-global-search` | Admin global search across accounts, chefs, subscriptions, or operations. | admin-portal | Frontend, backend APIs, search UX, BFF | P1 | Review |
| `feature/admin-customer-360-document-review` | Admin customer 360 and document review capabilities. | admin-portal | Frontend, backend admin APIs, document workflows | P1 | Review |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard. | admin-portal | Frontend, BFF, dashboards, ops UX | P1 | Review |
| `feature/admin-operational-investigations-apim` | APIM exposure for operational investigations endpoints. | integration-service | APIM, backend admin operations, infra | P1 | Validate |
| `feature/admin-operational-investigations-web` | Admin UI for operational investigations. | admin-portal | Frontend, BFF, investigations UX | P1 | Review |
| `feature/admin-subscription-operations` | Admin operations toolkit for subscriptions. | subscription-service | Backend, admin APIs, frontend operations | P1 | Review |
| `feature/admin-subscription-plans` | Admin workflows for subscription plan management. | subscription-service | Backend, admin APIs, frontend/BFF | P1 | Review |
| `feature/admin-web-operations-shell` | Shared admin operations shell or portal scaffold. | admin-portal | Frontend, shell architecture, routing | P2 | Review |
| `feature/admin-web-shell` | Base admin web shell and layout foundation. | admin-portal | Frontend, shell, navigation, auth | P2 | Review |
| `feature/backend-admin-investigation-apis` | Backend APIs for admin operational investigations. | integration-service | Backend, admin APIs, investigations, ops data | P1 | Ready |
| `feature/backend-admin-operations-audit` | Audit trails and backend observability for admin operations. | platform/backend | Backend, audit logging, admin ops | P1 | Ready |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle orchestration and events. | subscription-service | Backend, billing, events, integrations | P1 | Ready |
| `feature/backend-subscription-occurrence-generator` | Generation of subscription occurrences and scheduling materialization. | subscription-service | Backend, scheduling, workers, DB | P1 | Ready |
| `feature/backend-subscription-order-fulfillment` | Order fulfillment path for subscription-generated meals/orders. | subscription-service | Backend, orders, integrations, dispatch | P1 | Ready |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and payment initiation. | subscription-service | Backend, payments, invoices, integrations | P1 | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumer flow for subscription payment status updates. | subscription-service | Backend, async messaging, payments, workers | P1 | Ready |
| `feature/backend-subscription-plan-schedules` | Plan scheduling and schedule-management backend capabilities. | subscription-service | Backend, scheduling, chef plans, APIs | P1 | Ready |

---

## Merge guidance by sequence

### Suggested first-wave merges

1. `feature/backend-admin-account-intervention`
2. `feature/backend-redis-abuse-revocation`
3. `feature/backend-notification-production-delivery`
4. `feature/backend-notification-recovery-operations`
5. `feature/backend-cashfree-production-hardening`
6. `feature/backend-delivery-provider-production-readiness`
7. `feature/backend-refund-production-readiness`
8. `feature/backend-subscription-billing-lifecycle`
9. `feature/backend-subscription-occurrence-generator`
10. `feature/backend-subscription-order-fulfillment`
11. `feature/backend-subscription-payment-intents`
12. `feature/backend-subscription-payment-status-consumer`
13. `feature/backend-subscription-plan-schedules`
14. `feature/admin-chef-review`
15. `backend-customer-favorites-20260816`
16. `backend-customer-reorder-20260816`

### Suggested second-wave merges after validation

1. `feature/admin-account-intervention-apim`
2. `feature/admin-account-intervention-web`
3. `feature/admin-notification-recovery-apim`
4. `feature/admin-notification-recovery-web`
5. `feature/backend-admin-investigation-apis`
6. `feature/admin-operational-investigations-apim`
7. `feature/admin-operational-investigations-web`
8. `feature/admin-subscription-operations`
9. `feature/admin-subscription-plans`
10. `feature/admin-dashboard-v2`
11. `feature/admin-control-center-global-search`
12. `feature/admin-customer-360-document-review`

### Validate carefully before merge

- All `agent/fix-front-door*`, `agent/disable-*`, and APIM/domain routing branches
- `agent/razorpay-payment-switch`
- `agent/fix-full-frontend-backend-integration`
- `agent/fix-chef-registration-and-checkout-contract`
- `feature/cashfree-production-closeout-20260815`
- `agent/order-flyway-v14-checksum`

### Keep out of main unless specifically needed

- `do-not-use`
- `accidental-ignore-7`
- all `backup/*`
- all `dispatch-*`
- `build/qa-mobile-apk-2026-08-20`
- `android-build`
- `copilot/research-task-repository-analysis`

---

## Full branch inventory summary

- Auth: 6
- Catalog: 4
- Orders: 8
- Notifications: 4
- Chef: 7
- Customer: 12
- Infra: 21
- Feature/Other: 34

**Total:** 96
