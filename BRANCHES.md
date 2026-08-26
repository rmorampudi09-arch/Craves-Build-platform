# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the branch inventory and merge handover for the Craves platform repository. It groups active and historical branches by delivery domain so engineering, QA, and release owners can review, prioritize, and merge work into `main` with a shared source of truth.

---

## Branch naming convention

Observed naming patterns in this repository:

- `agent/*` — agent-driven implementation, bug-fix, infra, release, and platform branches
- `feat/*` — UI/UX or product-facing feature work, commonly frontend-focused
- `feature/*` — larger feature streams across backend, web, admin, subscriptions, and platform work
- `backend-*` — direct backend implementation branches, usually service-specific
- `backup/*` — backup/safety snapshot branches, not intended for merge unless explicitly restored
- `build/*` — build artifact or QA packaging branches
- `ci/*` — CI/CD and deployment gate branches
- `docs/*` — documentation/audit branches
- `chatgpt/*`, `copilot/*` — research or AI-assisted working branches
- `dispatch-*` — operational trigger/run branches, usually not long-lived feature branches
- standalone names like `android-build`, `do-not-use`, `accidental-ignore-7` — ad hoc operational branches requiring case-by-case handling

### Recommended branch interpretation

- Treat `main` as the only release authority.
- Merge only branches with clear scope, green validation, and no overlap with a newer successor branch.
- Prefer the latest iteration when multiple similarly named branches exist, for example `*-v2`, or numbered continuations such as address work branches.
- Do **not** merge `backup/*`, `dispatch-*`, `do-not-use`, or accidental branches without explicit release approval.

---

## Merge policy

### Readiness definitions

- **Ready** — purpose is clear and branch appears merge-candidate pending normal review
- **Review** — likely valid branch, but requires code review, smoke test, and conflict check
- **Needs validation** — branch intent is known but production impact or overlap must be verified
- **Hold** — do not merge until dependency or release validation is complete
- **Do not merge** — archival, trigger, backup, or explicitly unsafe branch

### Priority definitions

- **P0** — production stability, security, release unblockers
- **P1** — important platform/business capability likely worth near-term merge
- **P2** — standard feature work needing sequencing
- **P3** — exploratory, backup, packaging, or low-priority branch

### Merge guidance

1. Rebase or merge `main` into the candidate branch before opening final PR.
2. Prefer merging backend dependency branches before dependent web/admin branches.
3. When a newer replacement exists, close superseded branches instead of merging both.
4. For infra/front-door/platform branches, validate CDN, APIM, cache, compression, and domain behavior in staging first.
5. For admin, auth, payments, notification, and subscription branches, require API contract and migration review before merge.

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation/update for backend authorization. | auth-service | Backend, security, RBAC, API | P1 | Review |
| `feature/backend-internal-admin-rbac-v2` | Successor RBAC hardening branch; likely newer than earlier RBAC branch. | auth-service | Backend, security, RBAC, migrations | P1 | Needs validation |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token/session revocation improvements. | auth-service | Backend, security, Redis, auth filters | P1 | Review |
| `feature/admin-account-intervention-apim` | APIM-facing admin account intervention capability for identity/account operations. | auth-service / APIM | API gateway, auth, admin tooling | P1 | Review |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention workflows. | admin-web / auth-service | Frontend, admin UI, BFF/API integration | P1 | Needs validation |
| `feature/backend-admin-account-intervention` | Backend APIs and workflows for admin intervention on identities/accounts. | auth-service | Backend, admin APIs, audit/security | P1 | Review |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchen-first discovery experience tied to catalog/discovery flow. | catalog-service / customer-web-next | Backend discovery, frontend discovery, search UX | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration of nearby discovery; likely preferred over original discovery branch. | catalog-service / customer-web-next | Backend discovery, frontend discovery, ranking UX | P1 | Needs validation |
| `feature/advanced-search-smart-filters` | Enhanced search and smart filter capability for catalog browsing. | catalog-service / customer-web-next | Search, discovery, frontend filters, backend query support | P1 | Review |
| `backend-customer-favorites-20260816` | Backend support for customer favorites, likely catalog/user affinity behavior. | user-chef-service / catalog-service | Backend APIs, favorites, persistence | P2 | Review |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Reorder/repeat-order backend capability. | order-service | Backend APIs, order flows, cart/checkout | P1 | Review |
| `agent/order-flyway-v14-checksum` | Repair or reconcile Flyway checksum around order-service migration V14. | order-service | Backend, DB migrations, Flyway | P0 | Needs validation |
| `agent/razorpay-payment-switch` | Payment provider switch behavior affecting checkout/order payment path. | integration-service / order-service | Payments, backend, integration, checkout | P1 | Review |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-notification-recovery-apim` | Admin notification recovery API/gateway integration. | notification-service / APIM | Admin API, notifications, gateway | P1 | Review |
| `feature/admin-notification-recovery-web` | Admin web interface for notification recovery operations. | notification-service / admin-web | Admin UI, BFF/API, operations | P1 | Needs validation |
| `feature/backend-notification-production-delivery` | Production-grade notification delivery enhancements. | notification-service | Backend delivery workers, provider adapters, notifications | P1 | Review |
| `feature/backend-notification-recovery-operations` | Recovery operations backend for failed notification handling. | notification-service | Backend, recovery workflows, admin ops | P1 | Review |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fix chef portal entry points and session routing behavior. | customer-web-next / auth-service | Frontend routing, auth/session, BFF | P1 | Review |
| `agent/fix-chef-orders-and-customer-palette` | Fix chef orders UX and customer-facing palette/design consistency. | customer-web-next | Frontend UI, chef pages, styling | P2 | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Align chef registration and checkout-related API/UI contracts. | user-chef-service / customer-web-next / order-service | Backend contracts, frontend integration, API schemas | P1 | Needs validation |
| `agent/fix-chef-release-traffic-verification` | Validate chef release traffic and routing correctness post-release. | Infra / customer-web-next | Release validation, routing, observability | P1 | Hold |
| `feat/chef-complete-uiux` | Chef experience end-to-end UI/UX refinement. | customer-web-next | Frontend, chef UI, design system | P2 | Review |
| `feature/admin-chef-review` | Admin review workflow for chef applications/documents. | user-chef-service / admin-web | Backend admin APIs, frontend admin, document review | P1 | Review |
| `feature/backend-chef-financial-ledger` | Chef financial ledger backend support. | integration-service | Backend ledger, payouts/finance integration, APIs | P1 | Review |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connect customer web UI to live backend flows. | customer-web-next | Frontend, BFF, API integration | P1 | Review |
| `agent/fix-backend-connected-signed-in-flows` | Repair signed-in customer flows against connected backend. | customer-web-next / auth-service | Frontend auth, session handling, API integration | P1 | Review |
| `agent/fix-customer-web-proxy-origin` | Fix proxy origin behavior for customer web. | customer-web-next / infra | Frontend proxy, edge config, networking | P1 | Review |
| `agent/fix-full-frontend-backend-integration` | Broader frontend/backend integration fixes across customer journeys. | customer-web-next / platform | Frontend, BFF, API integration, contracts | P1 | Review |
| `agent/unify-chef-panel-customer-ui` | Unify design and shell patterns across chef and customer experiences. | customer-web-next | Frontend, shared UI, routing/layout | P2 | Needs validation |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UI/UX improvements. | customer-web-next | Frontend, checkout UI, payment UX | P1 | Review |
| `feat/customer-chef-uiux-foundation` | Shared UI/UX foundation for customer and chef surfaces. | customer-web-next | Frontend, shared components, design system | P2 | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery page UX enhancements. | customer-web-next | Frontend, landing, discovery | P2 | Review |
| `feat/customer-landing-v2-clean-20260808` | Clean landing page v2 iteration branch. | customer-web-next | Frontend, landing page | P2 | Needs validation |
| `feat/customer-orders-tracking-uiux` | Order history and tracking UI/UX improvements. | customer-web-next | Frontend, orders, tracking UX | P1 | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic/reference-based landing implementation for customer web. | customer-web-next | Frontend, SEO/content, landing | P2 | Review |
| `feature/address-final-work` | Customer address workflow finalization, iteration 1. | user-chef-service / customer-web-next | Backend addresses, frontend forms, maps | P1 | Review |
| `feature/address-final-work-2` | Customer address workflow finalization, iteration 2. | user-chef-service / customer-web-next | Backend addresses, frontend forms, maps | P1 | Needs validation |
| `feature/address-final-work-3` | Customer address workflow finalization, iteration 3. | user-chef-service / customer-web-next | Backend addresses, frontend forms, maps | P1 | Needs validation |
| `feature/address-final-work-4` | Latest visible address workflow iteration; likely preferred candidate. | user-chef-service / customer-web-next | Backend addresses, frontend forms, maps | P1 | Needs validation |
| `feature/azure-maps-address-autofill` | Address autofill using Azure Maps. | user-chef-service / customer-web-next | Maps integration, frontend forms, backend geocoding | P1 | Review |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | APIM or gateway domain configuration fix. | Infra / APIM | API gateway, DNS/domain, networking | P0 | Review |
| `agent/backend-completion-guarded-release` | Guarded backend release completion branch for staged rollout. | Platform / backend services | Release engineering, backend, validation | P1 | Hold |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to address delivery issues. | Infra / frontend delivery | CDN, compression, edge config | P0 | Review |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip for cold-loading/static loading compatibility. | Infra / frontend delivery | CDN/origin, compression, caching | P0 | Review |
| `agent/fix-cold-device-static-loading` | Fix cold-device/static asset loading issues. | Infra / customer-web-next | Static delivery, cache, frontend performance | P0 | Review |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache validation fix related to CLI/ruleset issue 288. | Infra | CDN, caching, Azure Front Door | P0 | Review |
| `agent/fix-front-door-cli-288` | General Front Door fix for CLI/ruleset issue 288. | Infra | CDN, Azure Front Door, deployment config | P0 | Review |
| `agent/fix-front-door-gzip-cache-bypass` | Fix gzip/cache bypass behavior in Front Door. | Infra | CDN, compression, caching | P0 | Review |
| `agent/fix-front-door-gzip-rule-validation` | Validate or fix Front Door gzip rules. | Infra | CDN rules, compression, validation | P0 | Review |
| `agent/fix-front-door-secret-rest` | Restore/fix Front Door secret or secret-backed config. | Infra | Secrets, gateway/CDN config, security | P0 | Needs validation |
| `agent/fix-front-door-security-policy-cli-288` | Security policy fix for Front Door issue path. | Infra | CDN security policy, WAF, deployment config | P0 | Review |
| `agent/fix-static-gzip-cold-loading` | Static gzip cold-loading remediation. | Infra / frontend delivery | CDN, static assets, compression | P0 | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty cache behavior in Front Door. | Infra | CDN, cache rules, edge config | P1 | Review |
| `agent/parallel-front-door-domain-provisioning` | Parallelize Front Door domain provisioning. | Infra | Provisioning automation, CDN/domain infra | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve Front Door custom domain and WAF state across changes. | Infra | WAF, CDN, domain config | P0 | Review |
| `android-build` | Android/mobile build-related branch. | Mobile / build system | Build tooling, packaging | P3 | Needs validation |
| `build/qa-mobile-apk-2026-08-20` | QA mobile APK build branch. | Mobile / QA | Build pipeline, packaging, QA | P3 | Do not merge |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service deployment readiness. | CI/CD / subscription-service | CI pipeline, deployment gate | P1 | Review |
| `feature/backend-cashfree-production-hardening` | Hardening Cashfree production behavior. | integration-service | Payments, backend hardening, production readiness | P1 | Review |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider production readiness work. | integration-service | Delivery integrations, backend readiness | P1 | Review |
| `feature/backend-launch-policy-enforcement` | Backend launch policy enforcement across protected features/releases. | platform / backend services | Backend policy, flags/guardrails, release controls | P1 | Review |
| `feature/backend-production-readiness-completion` | Final backend production readiness completion stream. | platform / backend services | Readiness, hardening, release validation | P1 | Hold |
| `feature/backend-refund-production-readiness` | Refund production readiness hardening. | integration-service / order-service | Refunds, backend, production operations | P1 | Review |
| `feature/cashfree-production-closeout-20260815` | Cashfree closeout branch for production-readiness completion. | integration-service | Payments, release closeout, hardening | P1 | Needs validation |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Ad hoc branch with no clear delivery purpose; treat as accidental or disposable. | Unknown | Miscellaneous | P3 | Do not merge |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | Backup snapshot | P3 | Do not merge |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | Mobile / frontend | Backup snapshot | P3 | Do not merge |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend/customer-chef journey exploration branch. | Platform / multi-service | Backend, research, integration | P3 | Needs validation |
| `copilot/research-task-repository-analysis` | Repository analysis/research branch, likely documentation or discovery only. | Repository-wide | Research, docs | P3 | Do not merge |
| `craves-master-guide-v1` | Master guide/documentation or release guide branch. | Repository-wide | Docs, project guidance | P3 | Needs validation |
| `craves-v5-patch-repack` | Patch repack/release preparation branch. | Release engineering | Packaging, release ops | P2 | Hold |
| `dispatch-craves-v4` | Dispatch/trigger operations branch. | Release ops | Automation, triggers | P3 | Do not merge |
| `dispatch-craves-v4-issue-trigger` | Issue-trigger branch for dispatch automation. | Release ops | Automation, issue hooks | P3 | Do not merge |
| `dispatch-craves-v4-reopen-trigger` | Reopen-trigger branch for dispatch automation. | Release ops | Automation, issue hooks | P3 | Do not merge |
| `dispatch-craves-v4-run-2` | Operational dispatch run branch. | Release ops | Automation, run artifacts | P3 | Do not merge |
| `dispatch-craves-v4-run-3` | Operational dispatch run branch. | Release ops | Automation, run artifacts | P3 | Do not merge |
| `dispatch-craves-v4-schedule` | Scheduled dispatch operations branch. | Release ops | Automation, scheduling | P3 | Do not merge |
| `do-not-use` | Explicitly marked unsafe/unwanted branch. | Unknown | Miscellaneous | P3 | Do not merge |
| `docs/production-release-audit-20260821` | Production release audit documentation branch. | Repository-wide | Docs, audit, release validation | P2 | Review |
| `feat/landing-reference-20260811` | Landing reference implementation branch. | customer-web-next | Frontend, landing/reference | P2 | Review |
| `feat/landing-reference-refresh` | Landing reference refresh iteration. | customer-web-next | Frontend, landing/reference | P2 | Needs validation |
| `feature/admin-control-center-global-search` | Admin control center global search capability. | admin-web / user-chef-service / order-service | Frontend admin, backend search/indexing, APIs | P1 | Review |
| `feature/admin-customer-360-document-review` | Customer 360 and document review admin workflow. | admin-web / user-chef-service / auth-service | Admin UI, document review, backend APIs | P1 | Review |
| `feature/admin-dashboard-v2` | Admin dashboard v2 enhancements. | admin-web / order-service | Frontend admin dashboard, backend summary APIs | P1 | Review |
| `feature/admin-operational-investigations-apim` | APIM/backend path for admin investigations. | APIM / order-service / integration-service | Admin API, investigations, gateway | P1 | Review |
| `feature/admin-operational-investigations-web` | Admin web UI for investigations. | admin-web | Frontend admin, BFF/API integration | P1 | Review |
| `feature/admin-subscription-operations` | Admin operations for subscription workflows. | admin-web / subscription-service | Admin UI, backend subscription ops | P1 | Review |
| `feature/admin-subscription-plans` | Admin plan management workflows for subscriptions. | admin-web / subscription-service | Admin UI, backend plan APIs | P1 | Review |
| `feature/admin-web-operations-shell` | Admin operations shell/layout foundation. | admin-web | Frontend shell, navigation, shared layout | P2 | Review |
| `feature/admin-web-shell` | Base admin web shell/foundation. | admin-web | Frontend shell, layout, auth/nav | P2 | Review |
| `feature/backend-admin-investigation-apis` | Backend investigation APIs for admin tooling. | order-service / integration-service | Backend APIs, audit, operations | P1 | Review |
| `feature/backend-admin-operations-audit` | Backend admin operations audit trail implementation. | order-service / auth-service / integration-service | Backend audit, admin ops, persistence | P1 | Review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle backend implementation. | subscription-service | Backend, billing, lifecycle workers | P1 | Review |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generation engine. | subscription-service | Backend, scheduling, occurrence generation | P1 | Review |
| `feature/backend-subscription-order-fulfillment` | Subscription to order-fulfillment integration. | subscription-service / order-service | Backend, outbox/integration, fulfillment | P1 | Review |
| `feature/backend-subscription-payment-intents` | Subscription payment intents flow. | integration-service / subscription-service | Payments, backend APIs, billing | P1 | Review |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service | Backend consumers, billing status, events | P1 | Review |
| `feature/backend-subscription-plan-schedules` | Subscription plan scheduling support. | subscription-service | Backend scheduling, plan management, APIs | P1 | Review |
