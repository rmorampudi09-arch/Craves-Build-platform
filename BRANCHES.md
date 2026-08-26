# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 94

## Branch naming convention

Observed conventions currently in use:

- `agent/*` — autonomous or assisted implementation, infra fixes, release hardening, UI integration, routing, caching, and platform fixes
- `feat/*` — user-facing feature/UI work, mostly frontend and UX-oriented slices
- `feature/*` — larger scoped feature delivery branches, often backend/API/admin/subscription/integration work
- `backend-*` — backend domain increments with date suffixes
- `backup/*` — safety backup snapshots before major UI revisions
- `build/*` — build/distribution artifacts or packaging branches
- `ci/*` — CI/CD gates and deployment workflow branches
- `docs/*` — documentation and audit branches
- `chatgpt/*`, `copilot/*` — research or assisted implementation branches
- unprefixed branches — ad hoc, release utility, legacy, or cautionary branches

## Merge policy

1. Merge service foundations before dependent UI branches.
2. Prefer this order where dependencies exist:
   - `infra` / platform / gateway / cache fixes
   - `auth` and security / RBAC
   - core backend domains (`catalog`, `orders`, `notifications`, `chef`, `customer`, `subscription`, `integration`)
   - admin web and customer web experience branches
   - backup, build, dispatch, and archive-style branches only if explicitly needed
3. Require validation before merge:
   - branch diff review
   - service-level tests and smoke checks
   - contract compatibility for `apps/customer-web-next` BFF routes and backend APIs
   - Flyway compatibility checks for backend branches
4. Merge readiness meanings:
   - **High** — branch name maps clearly to an implemented domain and appears directly mergeable after normal review
   - **Medium** — likely useful but should be rebased, verified, or merged after prerequisite branches
   - **Low** — backup, dispatch, experimental, duplicate, or cautionary branch; merge only if specifically required
5. Branches named `backup/*`, `dispatch-*`, `do-not-use`, and `accidental-*` should generally not be merged to `main` unless there is an incident response reason.

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC rollout and auth hardening | auth-service | backend, security, RBAC, API | High | Medium |
| feature/admin-account-intervention-apim | APIM layer for admin account intervention flows | auth-service / infra | APIM, backend, security | High | Medium |
| feature/admin-account-intervention-web | Admin web UI for account intervention actions | admin-portal, auth-service | frontend, BFF, admin UI | High | Medium |
| feature/backend-admin-account-intervention | Backend account intervention implementation | auth-service | backend, API, persistence, security | High | High |
| feature/backend-internal-admin-rbac-v2 | Second-pass internal RBAC expansion | auth-service | backend, security, RBAC | High | Medium |
| feature/backend-redis-abuse-revocation | Redis-backed abuse prevention and token revocation | auth-service | backend, security, Redis | High | High |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchens discovery UX/backend alignment | catalog-service, customer-web-next | backend, frontend, discovery, BFF | High | Medium |
| agent/nearby-kitchens-first-discovery-v2 | Refined nearby discovery follow-up | catalog-service, customer-web-next | backend, frontend, discovery, BFF | High | Medium |
| feat/customer-landing-discovery-uiux | Discovery-led landing page UX | customer-web-next, catalog-service | frontend, UX, BFF | High | Medium |
| feature/advanced-search-smart-filters | Search and filtering experience for catalog/discovery | catalog-service, customer-web-next | backend, frontend, search, filters | High | Medium |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-registration-and-checkout-contract | Fix contract mismatches affecting chef registration and checkout | order-service, user-chef-service, customer-web-next | backend, frontend, contracts | High | Medium |
| agent/order-flyway-v14-checksum | Repair Flyway checksum issue in order migrations | order-service | backend, Flyway, database | High | High |
| agent/razorpay-payment-switch | Switch or stabilize Razorpay order payment flow | integration-service, order-service, customer-web-next | backend, payments, frontend, BFF | High | Medium |
| backend-customer-reorder-20260816 | Customer reorder backend support | order-service | backend, API, persistence | High | High |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment UX | customer-web-next, order-service, integration-service | frontend, BFF, payments | High | Medium |
| feat/customer-orders-tracking-uiux | Orders and tracking customer experience | customer-web-next, order-service, notification-service | frontend, BFF, tracking | High | Medium |
| feature/backend-launch-policy-enforcement | Launch policy enforcement around ordering/availability | order-service, integration-service | backend, policy, API | High | Medium |
| feature/backend-refund-production-readiness | Refund pipeline hardening for production | order-service, integration-service | backend, refunds, messaging | High | High |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM/admin API surface for notification recovery | notification-service / infra | APIM, backend, admin ops | Medium | Medium |
| feature/admin-notification-recovery-web | Admin web recovery console for notifications | admin-portal, notification-service | frontend, admin UI, BFF | Medium | Medium |
| feature/backend-notification-production-delivery | Production-grade delivery path for notifications | notification-service | backend, workers, delivery adapters | High | High |
| feature/backend-notification-recovery-operations | Notification recovery operations backend | notification-service | backend, admin ops, persistence | High | High |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry points and session routing | customer-web-next, auth-service, user-chef-service | frontend, routing, auth, BFF | High | Medium |
| agent/fix-chef-orders-and-customer-palette | Chef orders UX and palette consistency updates | customer-web-next, order-service | frontend, UI, BFF | Medium | Medium |
| agent/unify-chef-panel-customer-ui | Unify chef and customer UI shell patterns | customer-web-next | frontend, design system, routing | Medium | Medium |
| chatgpt/backend-customer-chef-journey-20260819 | Assisted implementation for customer-chef journey flows | user-chef-service, customer-web-next | backend, frontend, journey flows | Medium | Medium |
| feat/chef-complete-uiux | End-to-end chef UI/UX build-out | customer-web-next, user-chef-service | frontend, BFF, UX | High | Medium |
| feat/customer-chef-uiux-foundation | Shared chef/customer design foundation | customer-web-next | frontend, design system | Medium | Medium |
| feature/admin-chef-review | Admin chef review workflow | user-chef-service, admin-portal | backend, admin UI, document review | High | High |
| feature/backend-chef-financial-ledger | Chef earnings and financial ledger backend | integration-service | backend, ledger, financial ops | High | High |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live backend flows | customer-web-next | frontend, BFF, integration | High | Medium |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in customer connected flows | customer-web-next, auth-service, backend APIs | frontend, backend, auth, BFF | High | Medium |
| agent/fix-full-frontend-backend-integration | Full-stack integration stabilization | customer-web-next, multiple services | frontend, backend, BFF, contracts | High | Medium |
| backend-customer-favorites-20260816 | Customer favorites backend capability | user-chef-service, catalog-service | backend, API, persistence | High | High |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 refresh | customer-web-next | frontend, landing page, UX | Medium | Medium |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing implementation | customer-web-next | frontend, landing page, content | Medium | Medium |
| feat/landing-reference-20260811 | Landing reference implementation branch | customer-web-next | frontend, landing page | Low | Medium |
| feat/landing-reference-refresh | Refresh of landing reference implementation | customer-web-next | frontend, landing page | Low | Medium |
| feature/address-final-work | Customer address flow finalization | user-chef-service, customer-web-next | backend, frontend, geocoding, BFF | High | Medium |
| feature/address-final-work-2 | Iteration 2 of address finalization | user-chef-service, customer-web-next | backend, frontend, geocoding, BFF | Medium | Medium |
| feature/address-final-work-3 | Iteration 3 of address finalization | user-chef-service, customer-web-next | backend, frontend, geocoding, BFF | Medium | Medium |
| feature/address-final-work-4 | Iteration 4 of address finalization | user-chef-service, customer-web-next | backend, frontend, geocoding, BFF | Medium | Medium |
| feature/azure-maps-address-autofill | Address autofill using Azure Maps | user-chef-service, customer-web-next | backend, frontend, maps, geocoding | High | High |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM or gateway domain routing | infra | APIM, gateway, DNS, config | High | High |
| agent/backend-completion-guarded-release | Guarded production release completion branch | infra, multiple services | release, backend, ops | High | Medium |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression | infra | Azure Front Door, CDN, config | Medium | High |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to address cold loading issues | infra | CDN, origin config, performance | Medium | High |
| agent/fix-chef-release-traffic-verification | Verify release traffic behavior for chef surfaces | infra, customer-web-next | release, traffic, routing | Medium | Medium |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices | infra, customer-web-next | CDN, static assets, frontend | High | Medium |
| agent/fix-customer-web-proxy-origin | Correct customer web proxy/origin behavior | infra, customer-web-next | proxy, routing, frontend ops | High | High |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix | infra | Azure Front Door, cache, CLI | Medium | High |
| agent/fix-front-door-cli-288 | General Front Door CLI-288 remediation | infra | Azure Front Door, CLI, config | Medium | High |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip and cache bypass handling | infra | CDN, cache, compression | Medium | High |
| agent/fix-front-door-gzip-rule-validation | Validate gzip rules in Front Door | infra | Azure Front Door, policy, validation | Medium | High |
| agent/fix-front-door-secret-rest | Restore or fix Front Door secret handling | infra | secrets, infra, gateway | High | Medium |
| agent/fix-front-door-security-policy-cli-288 | Security policy fix for Front Door | infra | security policy, gateway, CLI | High | High |
| agent/fix-static-gzip-cold-loading | Static asset gzip cold-load fix | infra, customer-web-next | CDN, frontend performance | Medium | High |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache configuration behavior | infra | Azure Front Door, cache, CLI | Medium | High |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning | infra | domain provisioning, CDN, automation | Medium | Medium |
| agent/preserve-afd-custom-domain-waf | Preserve WAF on custom AFD domains | infra | Azure Front Door, WAF, security | High | High |
| android-build | Android/mobile build branch | mobile/build | build, packaging, mobile | Low | Medium |
| build/qa-mobile-apk-2026-08-20 | QA APK build packaging branch | mobile/build | build, QA, artifact | Low | Medium |
| ci/subscription-service-predeploy-gate | Predeploy quality gate for subscription-service | CI/CD, subscription-service | pipeline, deployment, validation | High | High |
| dispatch-craves-v4 | Dispatch or automation trigger branch | ops | automation, dispatch | Low | Low |
| dispatch-craves-v4-issue-trigger | Issue-triggered dispatch automation | ops | automation, issue workflow | Low | Low |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger dispatch automation | ops | automation, issue workflow | Low | Low |
| dispatch-craves-v4-run-2 | Dispatch rerun branch 2 | ops | automation | Low | Low |
| dispatch-craves-v4-run-3 | Dispatch rerun branch 3 | ops | automation | Low | Low |
| dispatch-craves-v4-schedule | Scheduled dispatch automation | ops | automation, scheduler | Low | Low |
| docs/production-release-audit-20260821 | Production release audit documentation | docs | documentation, release audit | Medium | High |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or temporary branch; likely not intended for merge | unknown | misc | Low | Low |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes | customer-web-next | backup, frontend | Low | Low |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile UI refinement | mobile/frontend | backup, frontend | Low | Low |
| copilot/research-task-repository-analysis | Repository analysis and research branch | docs / research | documentation, analysis | Low | Low |
| craves-master-guide-v1 | Master guide/reference branch | docs | documentation | Low | Medium |
| craves-v5-patch-repack | Patch repack or release utility branch | release/ops | release, packaging | Low | Low |
| do-not-use | Explicitly marked non-merge branch | unknown | misc | Low | Low |
| feature/admin-control-center-global-search | Global search for admin control center | admin-portal, user-chef-service, order-service | frontend, backend, search, admin UI | High | Medium |
| feature/admin-customer-360-document-review | Customer 360 and document review operations | admin-portal, user-chef-service | frontend, backend, admin UI | High | Medium |
| feature/admin-dashboard-v2 | Next version of admin dashboard | admin-portal, multiple services | frontend, backend aggregation, admin UI | High | Medium |
| feature/admin-operational-investigations-apim | APIM surface for operational investigations | infra, integration-service, order-service | APIM, backend, admin ops | Medium | Medium |
| feature/admin-operational-investigations-web | Web console for operational investigations | admin-portal | frontend, admin UI, BFF | Medium | Medium |
| feature/admin-subscription-operations | Admin operations for subscriptions | admin-portal, subscription-service | frontend, backend, admin ops | High | Medium |
| feature/admin-subscription-plans | Admin subscription plan management | admin-portal, subscription-service | frontend, backend, admin UI | High | Medium |
| feature/admin-web-operations-shell | Operations-focused admin shell | admin-portal | frontend, shell, navigation | Medium | Medium |
| feature/admin-web-shell | Base admin shell and navigation framework | admin-portal | frontend, shell, navigation | Medium | Medium |
| feature/backend-admin-investigation-apis | Backend investigation APIs for admin operations | order-service, integration-service | backend, API, audit | High | High |
| feature/backend-admin-operations-audit | Backend operational audit trail implementation | order-service, integration-service | backend, audit, persistence | High | High |
| feature/backend-cashfree-production-hardening | Cashfree hardening for production traffic | integration-service | backend, payments, ops hardening | High | High |
| feature/backend-delivery-provider-production-readiness | Delivery provider readiness hardening | integration-service | backend, delivery, provider adapters | High | High |
| feature/backend-production-readiness-completion | Cross-service production readiness completion | multiple backend services | backend, ops hardening, release | High | Medium |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | backend, billing, workers | High | High |
| feature/backend-subscription-occurrence-generator | Generate subscription occurrences | subscription-service | backend, scheduler, domain logic | High | High |
| feature/backend-subscription-order-fulfillment | Fulfillment bridge from subscriptions to orders | subscription-service, order-service | backend, integration, fulfillment | High | High |
| feature/backend-subscription-payment-intents | Subscription payment intent flows | integration-service, subscription-service | backend, payments, API | High | High |
| feature/backend-subscription-payment-status-consumer | Consume subscription payment statuses | subscription-service, integration-service | backend, messaging, payments | High | High |
| feature/backend-subscription-plan-schedules | Chef/customer subscription plan schedule backend | subscription-service | backend, schedule, API | High | High |
| feature/cashfree-production-closeout-20260815 | Final cashfree production closeout | integration-service | backend, payments, release hardening | Medium | High |
| feat/customer-landing-discovery-uiux | Discovery-first customer landing UX duplicate/parallel stream | customer-web-next, catalog-service | frontend, UX, BFF | Medium | Medium |

## Notes on categorisation

- Categories are based on branch naming and the confirmed repository architecture on `main`.
- Some branches span multiple services; the listed owner reflects the most likely primary domain.
- Backup, dispatch, and explicitly cautionary branches are inventoried for completeness but are not recommended merge candidates.
- Where multiple similarly named iterations exist, merge the newest verified branch only after comparing diffs and commit history.
