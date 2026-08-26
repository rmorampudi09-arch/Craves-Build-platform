# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 96

This document is the branch inventory and merge handover for the Craves Build Platform repository. It catalogs every real branch currently present in GitHub, groups them by delivery domain, and provides guidance for sequencing, review, and merge readiness.

---

## Branch naming convention

Observed branch naming patterns in this repository:

- `agent/*` — autonomous or assisted implementation/fix branches, often cross-cutting across frontend, backend, infra, or release concerns.
- `feature/*` — backend or product feature branches, typically service-aligned and generally closest to mergeable functional work.
- `feat/*` — frontend/UIUX feature branches, especially customer, chef, and landing experience work.
- `backend-*` — direct backend slices or targeted service enhancements.
- `backup/*` — safety checkpoints or rollback snapshots; do not merge by default.
- `build/*` — build artifact or QA packaging branches; merge only if intentionally preserving pipeline changes.
- `ci/*` — CI/CD and deployment gate changes.
- `docs/*` — documentation and audit branches.
- `dispatch-*` — operational trigger branches; generally not product code branches.
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation lines.
- root branches like `android-build`, `do-not-use`, `accidental-ignore-7` — special-purpose or nonstandard branches requiring explicit review.

Recommended durable naming standard going forward:

```text
feature/<domain>-<capability>
fix/<domain>-<issue>
infra/<platform-change>
docs/<document-purpose>
ci/<pipeline-purpose>
backup/<snapshot-purpose>-<date>
```

---

## Merge policy

### Default merge target
- Merge reviewed feature work into `main`.

### Merge order guidance
1. **Infra / platform fixes first**
   - Front Door, APIM, compression, cache, release traffic, CI, guarded release changes.
2. **Auth and admin access control**
   - RBAC, account intervention, internal admin controls.
3. **Core backend business flows**
   - notifications, orders, subscriptions, payments, delivery readiness.
4. **Customer and chef experience**
   - customer web connected flows, landing/discovery, chef UI, checkout and order experience.
5. **Admin experience and investigative tooling**
   - dashboards, search, customer 360, notification recovery, operations shell.
6. **Documentation, audits, and backups last**
   - docs branches may merge any time, but backup/dispatch branches should normally stay unmerged.

### Merge readiness meanings
- **Ready** — likely intended for normal review and merge once checks pass.
- **Review** — meaningful implementation exists, but branch intent or blast radius requires manual review.
- **Hold** — useful branch but should wait for dependencies or sequencing.
- **Do Not Merge** — backup, trigger, archive, or explicitly unsafe branch.

### Safe merge checklist
- Confirm branch diff is against latest `main`.
- Validate Flyway version ordering per affected service.
- Validate `customer-web-next` BFF contract compatibility with backend APIs.
- Verify Azure Front Door / APIM / infra branches in a lower environment first.
- Prefer squash merges for one-off feature branches unless branch history is valuable.
- Do not merge backup, dispatch, or clearly unsafe branches without explicit release-manager approval.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation or hardening for protected staff/admin flows. | auth-service | Backend API, security, RBAC, DB migration | High | Review |
| `feature/backend-internal-admin-rbac-v2` | Follow-on RBAC iteration for internal admin authorization model. | auth-service | Backend API, security, RBAC, DB migration | High | Ready |
| `feature/backend-admin-account-intervention` | Backend operational controls for account intervention such as suspend/unlock/investigate. | auth-service | Backend API, security, admin tooling, DB migration | High | Ready |
| `feature/admin-account-intervention-apim` | APIM surface and gateway contract for admin account intervention APIs. | apps/api, auth-service | API gateway, backend integration, access policy | Medium | Ready |
| `feature/admin-account-intervention-web` | Admin web workflow for account intervention and operational handling. | admin-portal / customer-web-next admin | Frontend UI, BFF/API integration, authz UX | Medium | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Customer discovery prioritizing nearby kitchens first. | catalog-service, customer-web-next | Backend discovery API, frontend listing UX, geo/search | High | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Refined second pass of nearby kitchen-first discovery ranking and UX. | catalog-service, customer-web-next | Backend discovery API, frontend UX, geo/search | High | Review |
| `backend-customer-favorites-20260816` | Backend support for customer favorites / saved items. | user-chef-service, catalog-service | Backend API, persistence, customer data | Medium | Ready |
| `feature/advanced-search-smart-filters` | Richer catalog/discovery filtering and search controls. | catalog-service | Backend search/filtering, frontend query UX | Medium | Ready |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-orders-and-customer-palette` | Order experience fixes spanning chef order screens and customer-facing visual consistency. | order-service, customer-web-next | Frontend UI, BFF/API integration, order workflow | High | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Resolves contract mismatches affecting chef registration and checkout flows. | order-service, user-chef-service, customer-web-next | Backend contracts, BFF routes, frontend integration | High | Review |
| `agent/order-flyway-v14-checksum` | Order service Flyway checksum repair around V14 dynamic checkout pricing migration. | order-service | DB migration, release maintenance | High | Ready |
| `backend-customer-reorder-20260816` | Backend reorder flow enabling repeat purchase/order recreation. | order-service | Backend API, order domain, persistence | Medium | Ready |
| `feat/customer-cart-checkout-payment-uiux` | End-to-end cart, checkout, and payment UX refinement. | customer-web-next, order-service, integration-service | Frontend UI, BFF, checkout/payment integration | High | Review |
| `feat/customer-orders-tracking-uiux` | Customer order history and live tracking experience improvements. | customer-web-next, order-service | Frontend UI, BFF/API integration, tracking views | High | Review |
| `agent/fix-full-frontend-backend-integration` | Cross-stack fixes to restore fully connected customer order flows. | customer-web-next, order-service, auth-service, integration-service | Frontend, backend APIs, contracts, auth/session | Critical | Review |
| `agent/fix-backend-connected-signed-in-flows` | Repairs signed-in flow regressions affecting checkout/order/account behaviors. | auth-service, order-service, customer-web-next | Auth/session, backend API, frontend integration | High | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production-grade notification delivery hardening and delivery workflow improvements. | notification-service | Backend API, workers, delivery adapters, DB migration | High | Ready |
| `feature/backend-notification-recovery-operations` | Recovery tooling for failed or delayed notification operations. | notification-service | Backend API, admin ops, DB migration, worker recovery | High | Ready |
| `feature/admin-notification-recovery-apim` | API gateway exposure for admin notification recovery endpoints. | apps/api, notification-service | API gateway, backend integration, policy | Medium | Ready |
| `feature/admin-notification-recovery-web` | Admin UI for notification recovery operations and request replay. | admin-portal / customer-web-next admin | Frontend UI, BFF/API integration, ops workflows | Medium | Ready |
| `feature/notification-preferences-center` | Customer notification preferences center with API, persistence, BFF route, and UI. | notification-service, customer-web-next | Backend API, DB migration, frontend UI, BFF, contracts | High | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entry navigation and authenticated session routing. | customer-web-next, auth-service | Frontend routing, auth/session, BFF integration | High | Review |
| `agent/unify-chef-panel-customer-ui` | Unifies visual system and shared app shell between chef and customer experiences. | customer-web-next | Frontend UI architecture, navigation, shared components | Medium | Review |
| `feat/chef-complete-uiux` | Chef-facing complete UI/UX implementation across menu, operations, and orders. | customer-web-next, user-chef-service, catalog-service, order-service | Frontend UI, BFF/API integration, domain workflows | High | Review |
| `feature/admin-chef-review` | Admin review workflow for chef applications and supporting documents. | user-chef-service, admin UI | Backend API, admin UI, document workflow | High | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connects customer web UI to real backend APIs and authenticated flows. | customer-web-next | Frontend UI, BFF routes, API integration | Critical | Review |
| `agent/fix-customer-web-proxy-origin` | Fixes proxy/origin behavior for customer web requests. | customer-web-next, apps/api | Frontend proxy, runtime config, edge/network | High | Ready |
| `feat/customer-chef-uiux-foundation` | Shared UX foundation for customer and chef surfaces. | customer-web-next | Frontend design system, app shell, shared components | Medium | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UX enhancement. | customer-web-next, catalog-service | Frontend landing UI, discovery integration | High | Review |
| `feat/customer-landing-v2-clean-20260808` | Cleaner second-generation customer landing page baseline. | customer-web-next | Frontend landing UI | Medium | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic/reference landing implementation for customer web. | customer-web-next | Frontend layout, content structure, SEO/semantics | Medium | Review |
| `feat/landing-reference-20260811` | Landing page reference branch for design/content direction. | customer-web-next | Frontend UI/reference implementation | Low | Hold |
| `feat/landing-reference-refresh` | Refresh of landing reference implementation and styling. | customer-web-next | Frontend UI/reference implementation | Low | Hold |
| `feature/address-final-work` | Finalization of customer address management flow. | user-chef-service, customer-web-next | Backend API, frontend UI, address management | High | Review |
| `feature/address-final-work-2` | Follow-up pass on address management finalization. | user-chef-service, customer-web-next | Backend API, frontend UI, address management | Medium | Review |
| `feature/address-final-work-3` | Additional address flow corrections or completion. | user-chef-service, customer-web-next | Backend API, frontend UI, address management | Medium | Review |
| `feature/address-final-work-4` | Latest iteration of address finalization branch. | user-chef-service, customer-web-next | Backend API, frontend UI, address management | High | Review |
| `feature/azure-maps-address-autofill` | Address autofill and geocoding UX using Azure Maps. | user-chef-service, customer-web-next | Backend integration, frontend form UX, maps/geocoding | High | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fixes API Management gateway domain configuration. | infra, apps/api | APIM, DNS/domain, gateway config | High | Ready |
| `agent/backend-completion-guarded-release` | Guarded release sequencing for backend completion and safer rollout. | infra, multi-service backend | Release orchestration, CI/CD, deployment controls | High | Review |
| `agent/disable-afd-edge-compression` | Disables Azure Front Door edge compression to address caching/content issues. | infra | Azure Front Door, CDN/edge config | High | Ready |
| `agent/disable-origin-gzip-for-cold-loading` | Disables origin gzip for cold-load troubleshooting. | infra, customer-web-next hosting | Edge/origin config, performance tuning | High | Ready |
| `agent/fix-chef-release-traffic-verification` | Verifies or fixes traffic routing during chef release rollout. | infra, customer-web-next | Release traffic validation, routing, environment config | Medium | Review |
| `agent/fix-cold-device-static-loading` | Static asset loading fix for cold devices / uncached clients. | infra, customer-web-next | CDN/edge, static asset delivery, frontend runtime | High | Ready |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache validation workaround tied to CLI/ruleset issue 288. | infra | Azure Front Door, cache rules, CLI workaround | Medium | Ready |
| `agent/fix-front-door-cli-288` | General Azure Front Door CLI issue 288 remediation. | infra | Azure Front Door, automation, CLI | Medium | Ready |
| `agent/fix-front-door-gzip-cache-bypass` | Fixes gzip-related cache bypass behavior at the edge. | infra | Azure Front Door, compression, cache rules | High | Ready |
| `agent/fix-front-door-gzip-rule-validation` | Resolves validation issues for Front Door gzip rules. | infra | Azure Front Door, rule engine, automation | Medium | Ready |
| `agent/fix-front-door-secret-rest` | Secret/configuration handling fix for Front Door automation or REST setup. | infra | Secrets, Front Door automation, platform config | High | Review |
| `agent/fix-front-door-security-policy-cli-288` | Fixes security policy provisioning impacted by CLI issue 288. | infra | Azure Front Door, WAF/security policy, automation | High | Ready |
| `agent/fix-static-gzip-cold-loading` | Static gzip tuning for cold-start asset loading. | infra, customer-web-next hosting | CDN/edge, gzip, static delivery | High | Ready |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalizes empty cache rule inputs for Front Door CLI compatibility. | infra | Azure Front Door, cache rules, automation | Medium | Ready |
| `agent/parallel-front-door-domain-provisioning` | Parallelized Front Door domain provisioning and rollout workflow. | infra | Azure Front Door, DNS, automation | Medium | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserves WAF/security policy while updating Front Door custom domains. | infra | Azure Front Door, WAF, custom domain config | High | Ready |
| `android-build` | Android build-related branch, likely packaging or mobile build stabilization. | mobile/build pipeline | Build tooling, mobile packaging | Low | Hold |
| `build/qa-mobile-apk-2026-08-20` | QA APK build branch for mobile distribution/testing. | mobile/build pipeline | Build artifacts, QA distribution | Low | Do Not Merge |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service predeployment checks. | ci/subscription-service | CI/CD, validation pipeline | High | Ready |
| `craves-v5-patch-repack` | Release repackaging branch for versioned patch delivery. | release engineering | Packaging, release artifact management | Low | Hold |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree payment integration. | integration-service | Backend integration, payment provider config, observability | High | Ready |
| `feature/backend-delivery-provider-production-readiness` | Hardening delivery provider orchestration for production readiness. | integration-service | Backend integration, delivery adapters, ops readiness | High | Ready |
| `feature/backend-production-readiness-completion` | Final production readiness completion branch across backend capabilities. | multi-service backend | Backend hardening, config, readiness checks | High | Review |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token revocation refinement. | auth-service, shared security | Backend security, Redis, auth middleware | High | Ready |
| `feature/backend-refund-production-readiness` | Production readiness improvements for refund processing. | integration-service, order-service | Backend workflows, payments/refunds, ops readiness | High | Ready |
| `feature/cashfree-production-closeout-20260815` | Final closeout tasks for Cashfree production launch. | integration-service | Backend integration, release hardening, provider config | Medium | Ready |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Nonstandard branch; purpose unclear and likely not part of planned feature delivery. | Unknown / repository maintenance | Unknown | Low | Do Not Merge |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 work. | customer-web-next | Backup snapshot | Low | Do Not Merge |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | mobile/frontend | Backup snapshot | Low | Do Not Merge |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted branch for customer-chef backend journey implementation. | multi-service backend | Backend APIs, domain integration | Medium | Review |
| `copilot/research-task-repository-analysis` | AI-assisted repository analysis/research branch. | docs/research | Documentation, analysis | Low | Do Not Merge |
| `craves-master-guide-v1` | Master guide or reference branch. | docs/platform | Documentation, reference material | Low | Hold |
| `dispatch-craves-v4` | Dispatch or automation trigger branch for v4 workflow. | release operations | Operational trigger | Low | Do Not Merge |
| `dispatch-craves-v4-issue-trigger` | Issue-trigger branch for dispatch automation. | release operations | Operational trigger | Low | Do Not Merge |
| `dispatch-craves-v4-reopen-trigger` | Reopen-trigger branch for dispatch automation. | release operations | Operational trigger | Low | Do Not Merge |
| `dispatch-craves-v4-run-2` | Execution/run branch for dispatch automation. | release operations | Operational trigger | Low | Do Not Merge |
| `dispatch-craves-v4-run-3` | Execution/run branch for dispatch automation. | release operations | Operational trigger | Low | Do Not Merge |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | release operations | Operational trigger | Low | Do Not Merge |
| `do-not-use` | Explicitly unsafe/non-merge branch. | repository maintenance | N/A | Low | Do Not Merge |
| `docs/production-release-audit-20260821` | Production release audit and documentation branch. | docs/release | Documentation, audit | Medium | Ready |
| `agent/landing-body-07cm-inset` | Landing page layout experiment with body inset variant. | customer-web-next | Frontend UI/layout | Low | Hold |
| `agent/landing-body-11cm-inset` | Alternate landing page layout experiment with larger inset. | customer-web-next | Frontend UI/layout | Low | Hold |
| `agent/razorpay-payment-switch` | Payment provider switching or routing update toward Razorpay. | integration-service, customer-web-next | Payments backend, frontend payment flow, provider config | High | Review |
| `feature/admin-control-center-global-search` | Admin global search across operational entities. | admin UI, user-chef-service, order-service | Frontend UI, backend search APIs, admin tooling | High | Ready |
| `feature/admin-customer-360-document-review` | Admin customer 360 and document review workflow. | admin UI, user-chef-service, order-service | Frontend UI, backend APIs, review workflow | High | Ready |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard experience and summary metrics. | admin UI, order-service | Frontend UI, backend dashboards, analytics projection | High | Ready |
| `feature/admin-operational-investigations-apim` | APIM exposure for operational investigation APIs. | apps/api, order-service, integration-service | API gateway, backend integration | Medium | Ready |
| `feature/admin-operational-investigations-web` | Admin web interface for operational investigations. | admin UI | Frontend UI, API integration, investigation workflows | High | Ready |
| `feature/admin-subscription-operations` | Admin controls for subscription operations and exception handling. | subscription-service, admin UI | Backend APIs, admin UI, workflow operations | High | Ready |
| `feature/admin-subscription-plans` | Admin subscription plan management and lifecycle controls. | subscription-service, admin UI | Backend APIs, admin UI, plan governance | High | Ready |
| `feature/admin-web-operations-shell` | Shell and layout for admin operational tooling. | admin UI | Frontend shell, navigation, shared components | Medium | Ready |
| `feature/admin-web-shell` | Foundational admin web shell and platform scaffold. | admin UI | Frontend shell, navigation, auth-aware layout | Medium | Ready |
| `feature/backend-admin-investigation-apis` | Backend APIs for operational/admin investigations. | order-service, integration-service | Backend APIs, audit, investigation tooling | High | Ready |
| `feature/backend-admin-operations-audit` | Backend audit and traceability enhancements for admin operations. | order-service, auth-service | Backend APIs, audit logging, persistence | High | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger backend for payouts and financial visibility. | integration-service | Backend API, financial domain, persistence | High | Ready |
| `feature/backend-launch-policy-enforcement` | Launch policy enforcement during checkout/order execution. | order-service | Backend API, policy/aspect logic, DB migration | High | Ready |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle orchestration. | subscription-service | Backend API, workers, billing workflow, DB migration | High | Ready |
| `feature/backend-subscription-occurrence-generator` | Occurrence generation for scheduled subscription fulfillment. | subscription-service | Backend worker, scheduling, DB logic | High | Ready |
| `feature/backend-subscription-order-fulfillment` | Bridges subscriptions to order fulfillment creation. | subscription-service, order-service | Backend integration, workers, order callbacks | High | Ready |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and orchestration. | subscription-service, integration-service | Backend API, payment integration, DB migration | High | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumes async payment status updates for subscriptions. | subscription-service | Backend worker, messaging, payment state | High | Ready |
| `feature/backend-subscription-plan-schedules` | Plan schedule APIs and persistence for subscriptions. | subscription-service | Backend API, scheduling, DB migration | High | Ready |

---

## Branch inventory summary

### Count by category
- Auth: 5
- Catalog: 4
- Orders: 8
- Notifications: 5
- Chef: 4
- Customer: 13
- Infra: 24
- Feature: 33

**Total documented branches:** 96

### Merge first candidates
- `agent/fix-full-frontend-backend-integration`
- `agent/customer-web-connected-ui`
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-notification-production-delivery`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-launch-policy-enforcement`
- `ci/subscription-service-predeploy-gate`

### Explicit non-merge branches
- `do-not-use`
- `accidental-ignore-7`
- all `backup/*`
- all `dispatch-*`
- `build/qa-mobile-apk-2026-08-20`
- `copilot/research-task-repository-analysis`

### Notes
- `feature/notification-preferences-center` is included from the provided feature strategist context as a newly created feature branch and documented here as part of the active branch program.
- Purpose, owning service, and merge guidance are inferred from branch names plus the repository architecture and feature context provided for this task.
- Existing branch names were taken from the real GitHub branch listing retrieved at execution time.
