# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the current branch inventory for the Craves Build Platform repository. It groups real branches by functional domain and provides a merge-oriented handover view for engineering, release, and review planning.

---

## Branch naming convention

Observed branch naming patterns in this repository:

- `agent/*` — autonomous or assisted implementation/fix branches, often cross-cutting and release-oriented
- `feature/*` — backend, admin, infra-adjacent, or product feature branches
- `feat/*` — frontend/UIUX feature branches
- `backend-*` — direct backend delivery branches
- `backup/*` — point-in-time safety branches before UI or feature refactors
- `build/*` — build artifact / QA packaging branches
- `docs/*` — documentation or release audit branches
- `ci/*` — CI/CD and deployment gate branches
- `chatgpt/*`, `copilot/*` — AI-assisted analysis or implementation work
- `dispatch-*` — release automation / workflow trigger branches
- ad hoc roots like `android-build`, `do-not-use`, `accidental-ignore-7`, `craves-*` — exceptional operational branches

### Recommended convention going forward

Use this hierarchy consistently:

- `feature/<domain>-<capability>` for product/backend features
- `feat/<surface>-<ux-scope>` for frontend/UI work
- `agent/<scope>-<fix-or-enhancement>` for assisted implementation branches
- `docs/<topic>` for documentation
- `ci/<pipeline-or-gate>` for delivery pipeline changes
- `backup/<surface>-<snapshot-date>` only for short-lived safety snapshots

---

## Merge policy

### Base policy

- Merge target for all reviewed work: `main`
- Prefer **squash merge** for narrowly scoped feature/UI branches
- Prefer **rebase then merge** for long-running backend branches when preserving a cleaner integration history matters
- Do **not** merge `backup/*`, `do-not-use`, `accidental-ignore-7`, or old dispatch trigger branches unless explicitly required for recovery or audit

### Readiness labels used in this document

- **Ready** — branch appears intentionally scoped and likely mergeable after normal CI/review
- **Review** — branch appears active or mergeable but needs code review / regression verification
- **Validate** — branch is likely useful but needs environment, contract, or release validation first
- **Hold** — branch is historical, backup, trigger-only, or should not be merged directly

### Priority labels used in this document

- **P0** — release-critical, production, auth, payment, infra, or cross-platform integration
- **P1** — important customer/chef/admin capability work
- **P2** — enhancement, UX, or operational follow-up
- **P3** — archival, backup, experimental, or low-priority support work

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC enablement and authorization hardening. | auth-service | backend, security, admin APIs | P0 | Review |
| `feature/admin-account-intervention-apim` | Admin account intervention API management / gateway exposure work. | auth-service | backend, apim, admin, security | P0 | Validate |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention workflows. | admin-portal / customer-web-next | frontend, admin UI, BFF | P1 | Review |
| `feature/backend-admin-account-intervention` | Backend support for account intervention workflows. | auth-service | backend, security, admin APIs | P0 | Review |
| `feature/backend-internal-admin-rbac-v2` | Second-pass internal admin RBAC implementation and refinement. | auth-service | backend, security, RBAC | P0 | Review |
| `feature/backend-redis-abuse-revocation` | Redis-based abuse protection and token revocation hardening. | auth-service | backend, redis, security | P0 | Ready |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchens-first discovery UX and API alignment. | catalog-service / customer-web-next | backend, frontend, BFF, discovery | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration on nearby-first discovery ranking and presentation. | catalog-service / customer-web-next | backend, frontend, discovery | P1 | Review |
| `backend-customer-favorites-20260816` | Backend support for customer favorites and home feed behaviors. | user-chef-service / catalog-service | backend, API, favorites | P1 | Ready |
| `feature/advanced-search-smart-filters` | Full-text search and smart filter capability for discovery/catalog. | catalog-service | backend, search, filters, SQL/read-model | P1 | Validate |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-orders-and-customer-palette` | Fix chef order flows and customer-facing visual consistency. | order-service / customer-web-next | backend, frontend, chef UI, customer UI | P1 | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Resolve contract mismatches affecting chef registration and checkout. | order-service / user-chef-service / customer-web-next | backend, frontend, contracts, BFF | P0 | Validate |
| `agent/order-flyway-v14-checksum` | Repair or normalize order-service Flyway checksum/version state. | order-service | backend, database, flyway | P0 | Validate |
| `backend-customer-reorder-20260816` | Reorder / repeat-order backend functionality. | order-service | backend, API, reorder | P1 | Ready |
| `feature/backend-launch-policy-enforcement` | Enforce checkout/order launch policy gates. | order-service | backend, policy, checkout | P0 | Review |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-notification-recovery-apim` | APIM-facing notification recovery operations exposure. | notification-service | backend, apim, admin ops | P1 | Validate |
| `feature/admin-notification-recovery-web` | Admin UI for notification recovery workflows. | admin-portal / customer-web-next | frontend, admin UI, BFF | P1 | Review |
| `feature/backend-notification-production-delivery` | Production delivery hardening for notification channels. | notification-service | backend, worker, delivery adapters | P0 | Ready |
| `feature/backend-notification-recovery-operations` | Backend recovery operations for failed/blocked notifications. | notification-service | backend, admin ops, recovery | P1 | Review |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fix chef entry pathing, auth/session routing, and panel navigation. | customer-web-next / auth-service | frontend, routing, session, BFF | P1 | Review |
| `agent/unify-chef-panel-customer-ui` | Unify chef panel and customer UI patterns for a consistent app shell. | customer-web-next | frontend, design system, routing | P2 | Review |
| `feat/chef-complete-uiux` | Full chef-side UI/UX buildout. | customer-web-next | frontend, chef UI, App Router | P1 | Review |
| `feature/admin-chef-review` | Admin review workflows for chef applications/documents. | user-chef-service / admin-portal | backend, admin UI, document review | P1 | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and settlement support. | integration-service | backend, ledger, finance, admin | P0 | Review |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connect customer web UI to live backend/BFF data flows. | customer-web-next | frontend, BFF, integration | P1 | Ready |
| `agent/fix-backend-connected-signed-in-flows` | Fix signed-in customer flows across frontend and backend integration points. | customer-web-next / auth-service | frontend, backend, session, BFF | P0 | Review |
| `agent/fix-full-frontend-backend-integration` | End-to-end integration fixes across customer and chef journeys. | customer-web-next / multiple services | frontend, backend, BFF, contracts | P0 | Validate |
| `agent/landing-body-07cm-inset` | Landing page layout polish iteration. | customer-web-next | frontend, UX, landing | P3 | Review |
| `agent/landing-body-11cm-inset` | Alternate landing layout adjustment iteration. | customer-web-next | frontend, UX, landing | P3 | Review |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UX improvements. | customer-web-next | frontend, checkout, payment UI | P1 | Review |
| `feat/customer-chef-uiux-foundation` | Shared customer/chef UI foundation work. | customer-web-next | frontend, design system, shell | P2 | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery experience design work. | customer-web-next | frontend, discovery, landing | P2 | Review |
| `feat/customer-landing-v2-clean-20260808` | Cleaned landing page v2 implementation branch. | customer-web-next | frontend, landing | P2 | Ready |
| `feat/customer-orders-tracking-uiux` | Customer order history and tracking UX. | customer-web-next | frontend, orders, tracking | P1 | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic/reference landing page implementation. | customer-web-next | frontend, landing, content | P2 | Review |
| `feat/landing-reference-20260811` | Landing reference implementation branch. | customer-web-next | frontend, reference UI | P3 | Hold |
| `feat/landing-reference-refresh` | Landing reference refresh iteration. | customer-web-next | frontend, UX refresh | P3 | Review |
| `feature/address-final-work` | Address flow refinement and finalization. | user-chef-service / customer-web-next | backend, frontend, address, maps | P1 | Review |
| `feature/address-final-work-2` | Follow-up address flow refinement. | user-chef-service / customer-web-next | backend, frontend, address | P1 | Review |
| `feature/address-final-work-3` | Additional address UX/backend integration pass. | user-chef-service / customer-web-next | backend, frontend, address | P1 | Review |
| `feature/address-final-work-4` | Final address-related stabilization branch. | user-chef-service / customer-web-next | backend, frontend, address | P1 | Review |
| `feature/azure-maps-address-autofill` | Azure Maps-powered address autofill and geocoding UX. | user-chef-service / customer-web-next | backend, frontend, maps, BFF | P1 | Ready |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fix APIM gateway custom domain configuration. | infra / api gateway | infra, apim, networking | P0 | Validate |
| `agent/backend-completion-guarded-release` | Guarded release sequencing for backend completion work. | infra / release | release, CI/CD, environment gating | P0 | Validate |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to correct behavior. | infra | azure front door, networking, edge config | P0 | Validate |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to mitigate cold-load issues. | infra | edge, origin config, performance | P0 | Validate |
| `agent/fix-chef-release-traffic-verification` | Verify and fix production traffic routing for chef release. | infra / release | traffic management, validation, release | P0 | Validate |
| `agent/fix-cold-device-static-loading` | Fix static asset loading issues on cold devices. | infra / frontend delivery | CDN, static hosting, frontend delivery | P1 | Review |
| `agent/fix-customer-web-proxy-origin` | Correct proxy origin configuration for customer web. | infra / customer-web-next | proxy, networking, frontend delivery | P0 | Validate |
| `agent/fix-front-door-cache-validation-cli-288` | Validate Front Door cache configuration under CLI workflow constraints. | infra | azure front door, cache, cli | P0 | Validate |
| `agent/fix-front-door-cli-288` | General Front Door CLI issue remediation. | infra | azure front door, cli, networking | P0 | Validate |
| `agent/fix-front-door-gzip-cache-bypass` | Resolve gzip/cache bypass behavior in Front Door. | infra | front door, cache, compression | P0 | Validate |
| `agent/fix-front-door-gzip-rule-validation` | Repair Front Door gzip rule validation issues. | infra | front door, rules engine, compression | P0 | Validate |
| `agent/fix-front-door-secret-rest` | Fix secret or REST configuration related to Front Door integration. | infra | secrets, networking, edge config | P0 | Validate |
| `agent/fix-front-door-security-policy-cli-288` | Resolve Front Door security policy configuration issues. | infra | WAF, security policy, cli | P0 | Validate |
| `agent/fix-static-gzip-cold-loading` | Further static gzip/cold-load mitigation work. | infra / frontend delivery | CDN, compression, frontend delivery | P1 | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty Front Door cache values/config in CLI automation. | infra | front door, cache, automation | P1 | Validate |
| `agent/parallel-front-door-domain-provisioning` | Parallelize Front Door domain provisioning workflow. | infra | provisioning, networking, automation | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve custom domain/WAF associations during AFD changes. | infra | WAF, domain config, networking | P0 | Validate |
| `agent/razorpay-payment-switch` | Payment provider switch support impacting integration and frontend readiness. | integration-service / customer-web-next / infra | backend, frontend, payment integration, config | P0 | Review |
| `android-build` | Android/mobile build support branch. | mobile/build | build, mobile, packaging | P2 | Review |
| `build/qa-mobile-apk-2026-08-20` | QA APK packaging/output branch. | mobile/build | build, QA, artifact packaging | P2 | Hold |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service predeploy checks. | subscription-service / CI | ci, deployment gate, validation | P0 | Ready |
| `dispatch-craves-v4-issue-trigger` | Automation trigger branch for release/dispatch workflow. | infra / automation | workflow, automation | P3 | Hold |
| `dispatch-craves-v4-reopen-trigger` | Automation reopen trigger branch. | infra / automation | workflow, automation | P3 | Hold |
| `dispatch-craves-v4-run-2` | Dispatch automation run branch. | infra / automation | workflow, automation | P3 | Hold |
| `dispatch-craves-v4-run-3` | Dispatch automation run branch. | infra / automation | workflow, automation | P3 | Hold |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | infra / automation | workflow, automation, scheduling | P3 | Hold |
| `dispatch-craves-v4` | Base dispatch automation branch. | infra / automation | workflow, automation | P3 | Hold |
| `feature/backend-cashfree-production-hardening` | Cashfree production hardening. | integration-service | backend, payments, production readiness | P0 | Ready |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider production readiness improvements. | integration-service | backend, delivery integration, readiness | P0 | Review |
| `feature/backend-production-readiness-completion` | Backend-wide production readiness completion work. | multiple backend services | backend, release hardening, ops | P0 | Validate |
| `feature/backend-refund-production-readiness` | Refund workflow production hardening. | integration-service / order-service | backend, refunds, readiness | P0 | Review |
| `feature/cashfree-production-closeout-20260815` | Cashfree production closeout and final stabilization. | integration-service | backend, payments, release hardening | P0 | Ready |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Accidental or ad hoc branch; not intended as a merge candidate. | repository misc | misc | P3 | Hold |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | backup, frontend | P3 | Hold |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile UI refinement. | mobile / frontend | backup, mobile UI | P3 | Hold |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work for customer-chef journey coverage. | multiple backend services | backend, journey orchestration, analysis | P2 | Review |
| `copilot/research-task-repository-analysis` | AI-assisted repository analysis and documentation research branch. | documentation / repo-wide | docs, analysis | P3 | Hold |
| `craves-master-guide-v1` | Master guide or documentation packaging branch. | documentation | docs, guide | P3 | Hold |
| `craves-v5-patch-repack` | Patch repack/rebuild branch for release packaging. | release / build | packaging, release | P2 | Hold |
| `do-not-use` | Explicit non-merge branch. | repository misc | misc | P3 | Hold |
| `docs/production-release-audit-20260821` | Documentation branch for production release audit. | documentation / release | docs, audit, release | P2 | Ready |
| `feature/admin-control-center-global-search` | Admin control center global search capability. | admin-portal / backend APIs | frontend, backend, search, admin | P1 | Review |
| `feature/admin-customer-360-document-review` | Customer 360 and document review tooling for admin workflows. | admin-portal / auth-service / user-chef-service | frontend, backend, admin ops | P1 | Review |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard. | admin-portal / order-service | frontend, backend, admin analytics | P1 | Review |
| `feature/admin-operational-investigations-apim` | APIM exposure for admin operational investigations. | integration-service / order-service | backend, apim, admin ops | P1 | Validate |
| `feature/admin-operational-investigations-web` | Web UI for operational investigations. | admin-portal | frontend, admin UI, investigations | P1 | Review |
| `feature/admin-subscription-operations` | Admin subscription operations management. | subscription-service / admin-portal | backend, frontend, admin ops | P1 | Review |
| `feature/admin-subscription-plans` | Admin plan management for subscriptions. | subscription-service / admin-portal | backend, frontend, admin plans | P1 | Ready |
| `feature/admin-web-operations-shell` | Operations-focused admin shell for web. | admin-portal | frontend, admin shell, operations | P2 | Review |
| `feature/admin-web-shell` | Core admin shell and navigation foundation. | admin-portal | frontend, admin shell | P2 | Ready |
| `feature/backend-admin-investigation-apis` | Backend investigation APIs for admin tooling. | order-service / integration-service | backend, admin APIs, investigations | P1 | Review |
| `feature/backend-admin-operations-audit` | Admin operations audit trail implementation. | order-service / auth-service / integration-service | backend, audit, admin ops | P1 | Review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle implementation. | subscription-service | backend, billing, lifecycle | P0 | Ready |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generation workflows. | subscription-service | backend, scheduler, generation | P0 | Ready |
| `feature/backend-subscription-order-fulfillment` | Subscription occurrence to order fulfillment pipeline. | subscription-service / order-service | backend, orchestration, fulfillment | P0 | Review |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and handling. | subscription-service / integration-service | backend, payments, subscriptions | P0 | Review |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service | backend, consumer, async processing | P0 | Ready |
| `feature/backend-subscription-plan-schedules` | Subscription plan schedule management. | subscription-service | backend, scheduling, plans | P1 | Ready |

---

## Merge guidance by branch family

### Merge first: production and platform safety
Prioritize these branches first because they reduce production risk or unblock release operations:

- `feature/backend-redis-abuse-revocation`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-notification-production-delivery`
- `feature/cashfree-production-closeout-20260815`
- `ci/subscription-service-predeploy-gate`
- `feature/backend-production-readiness-completion`
- `agent/apim-gateway-domain-fix`
- `agent/fix-front-door-*` family

### Merge second: core platform capabilities
These branches materially expand backend platform capabilities and admin operations:

- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`
- `feature/backend-chef-financial-ledger`
- `feature/backend-admin-investigation-apis`
- `feature/backend-admin-operations-audit`
- `feature/backend-launch-policy-enforcement`

### Merge third: customer, chef, and admin experience
These are high-value surface improvements but should follow platform stability:

- `agent/customer-web-connected-ui`
- `agent/fix-backend-connected-signed-in-flows`
- `agent/fix-full-frontend-backend-integration`
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-orders-tracking-uiux`
- `feat/chef-complete-uiux`
- `feature/admin-dashboard-v2`
- `feature/admin-subscription-plans`
- `feature/admin-subscription-operations`
- `feature/admin-web-shell`

### Keep out of the merge queue unless explicitly needed

- all `backup/*`
- all `dispatch-*`
- `do-not-use`
- `accidental-ignore-7`
- `copilot/research-task-repository-analysis`
- older reference-only landing branches unless needed for cherry-picks

---

## Complete branch inventory

For quick reference, the 100 real branches covered by this document are:

`accidental-ignore-7`, `agent/apim-gateway-domain-fix`, `agent/backend-completion-guarded-release`, `agent/backend-internal-admin-rbac`, `agent/customer-web-connected-ui`, `agent/disable-afd-edge-compression`, `agent/disable-origin-gzip-for-cold-loading`, `agent/fix-backend-connected-signed-in-flows`, `agent/fix-chef-entry-and-session-routing`, `agent/fix-chef-orders-and-customer-palette`, `agent/fix-chef-registration-and-checkout-contract`, `agent/fix-chef-release-traffic-verification`, `agent/fix-cold-device-static-loading`, `agent/fix-customer-web-proxy-origin`, `agent/fix-front-door-cache-validation-cli-288`, `agent/fix-front-door-cli-288`, `agent/fix-front-door-gzip-cache-bypass`, `agent/fix-front-door-gzip-rule-validation`, `agent/fix-front-door-secret-rest`, `agent/fix-front-door-security-policy-cli-288`, `agent/fix-full-frontend-backend-integration`, `agent/fix-static-gzip-cold-loading`, `agent/landing-body-07cm-inset`, `agent/landing-body-11cm-inset`, `agent/nearby-kitchens-first-discovery`, `agent/nearby-kitchens-first-discovery-v2`, `agent/normalize-empty-front-door-cache-cli-288`, `agent/order-flyway-v14-checksum`, `agent/parallel-front-door-domain-provisioning`, `agent/preserve-afd-custom-domain-waf`, `agent/razorpay-payment-switch`, `agent/unify-chef-panel-customer-ui`, `android-build`, `backend-customer-favorites-20260816`, `backend-customer-reorder-20260816`, `backup/customer-web-before-landing-v2-20260808`, `backup/mobile-ui-before-home-refinement-2026-08-16`, `build/qa-mobile-apk-2026-08-20`, `chatgpt/backend-customer-chef-journey-20260819`, `ci/subscription-service-predeploy-gate`, `copilot/research-task-repository-analysis`, `craves-master-guide-v1`, `craves-v5-patch-repack`, `dispatch-craves-v4-issue-trigger`, `dispatch-craves-v4-reopen-trigger`, `dispatch-craves-v4-run-2`, `dispatch-craves-v4-run-3`, `dispatch-craves-v4-schedule`, `dispatch-craves-v4`, `do-not-use`, `docs/production-release-audit-20260821`, `feat/chef-complete-uiux`, `feat/customer-cart-checkout-payment-uiux`, `feat/customer-chef-uiux-foundation`, `feat/customer-landing-discovery-uiux`, `feat/customer-landing-v2-clean-20260808`, `feat/customer-orders-tracking-uiux`, `feat/customer-web-semantic-reference-landing`, `feat/landing-reference-20260811`, `feat/landing-reference-refresh`, `feature/address-final-work`, `feature/address-final-work-2`, `feature/address-final-work-3`, `feature/address-final-work-4`, `feature/admin-account-intervention-apim`, `feature/admin-account-intervention-web`, `feature/admin-chef-review`, `feature/admin-control-center-global-search`, `feature/admin-customer-360-document-review`, `feature/admin-dashboard-v2`, `feature/admin-notification-recovery-apim`, `feature/admin-notification-recovery-web`, `feature/admin-operational-investigations-apim`, `feature/admin-operational-investigations-web`, `feature/admin-subscription-operations`, `feature/admin-subscription-plans`, `feature/admin-web-operations-shell`, `feature/admin-web-shell`, `feature/advanced-search-smart-filters`, `feature/azure-maps-address-autofill`, `feature/backend-admin-account-intervention`, `feature/backend-admin-investigation-apis`, `feature/backend-admin-operations-audit`, `feature/backend-cashfree-production-hardening`, `feature/backend-chef-financial-ledger`, `feature/backend-delivery-provider-production-readiness`, `feature/backend-internal-admin-rbac-v2`, `feature/backend-launch-policy-enforcement`, `feature/backend-notification-production-delivery`, `feature/backend-notification-recovery-operations`, `feature/backend-production-readiness-completion`, `feature/backend-redis-abuse-revocation`, `feature/backend-refund-production-readiness`, `feature/backend-subscription-billing-lifecycle`, `feature/backend-subscription-occurrence-generator`, `feature/backend-subscription-order-fulfillment`, `feature/backend-subscription-payment-intents`, `feature/backend-subscription-payment-status-consumer`, `feature/backend-subscription-plan-schedules`, `feature/cashfree-production-closeout-20260815`
