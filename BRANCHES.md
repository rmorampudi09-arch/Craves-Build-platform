# BRANCHES.md

Repository: `rmorampudi09-arch/Craves-Build-platform`  
Date: `2026-08-26`  
Total branch count: **100**

## Branch naming convention

The repository currently uses several practical naming families:

- `agent/*` — autonomous agent fixes, release hardening, infra tuning, UI integration, and production remediation
- `feature/*` — durable feature branches, usually backend/admin/platform capabilities intended for review and merge
- `feat/*` — frontend/UIUX oriented feature work and landing/customer experience improvements
- `backend-*` — direct backend workstreams, usually focused on a single capability
- `backup/*` — backup/snapshot branches; generally **do not merge** without explicit reason
- `build/*` / `ci/*` / `docs/*` — build pipeline, release gate, and documentation branches
- `dispatch-*` / `android-build` / `do-not-use` / `accidental-*` — operational or special-purpose branches requiring explicit human review before merge

### Recommended convention going forward

- Product/backend feature work: `feature/<domain>-<capability>`
- UI/UX work: `feat/<surface>-<capability>`
- Ops hotfixes: `agent/<system>-<fix>`
- Backups: `backup/<scope>-<date>`
- Documentation: `docs/<topic>-<date>`

## Merge policy

1. **Merge target:** `main`
2. **Preferred path:** PR merge after CI passes and domain owner approval.
3. **Cherry-pick only when:** the branch is experimental, stale, or contains unrelated bundled changes.
4. **Do not merge directly** from backup/dispatch/do-not-use branches without explicit release-manager approval.
5. **Review order:**
   - P0: security, auth, payment, production readiness, delivery, release blockers
   - P1: customer journey blockers, chef workflow blockers, admin operations
   - P2: UX improvements, discovery enhancements, supporting capabilities
   - P3: backups, historical references, exploratory branches
6. **Merge readiness meanings:**
   - `High` — focused branch with clear scope; likely suitable for PR review now
   - `Medium` — probably mergeable but needs validation/testing or conflict review
   - `Low` — archival, backup, ambiguous, or operational-only branch

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation/hardening for staff authorization flows | auth-service | backend, security, RBAC, API | P0 | Medium |
| feature/admin-account-intervention-apim | APIM exposure for admin account intervention workflows | auth-service / APIM | api-gateway, auth, admin | P1 | Medium |
| feature/admin-account-intervention-web | Admin web UI for account intervention operations | admin-web, auth-service | frontend, admin, auth | P1 | Medium |
| feature/backend-admin-account-intervention | Backend implementation for account intervention controls and auditability | auth-service | backend, auth, audit, admin | P0 | High |
| feature/backend-internal-admin-rbac-v2 | Second-pass hardened internal admin RBAC model for privileged access | auth-service | backend, security, RBAC | P0 | High |
| feature/backend-redis-abuse-revocation | Redis-based auth abuse prevention and token revocation hardening | auth-service | backend, security, redis | P0 | High |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Discovery-first catalog experience prioritizing nearby kitchens | catalog-service, customer-web | backend, frontend, discovery, geo | P1 | Medium |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby-first discovery ordering and UX | catalog-service, customer-web | backend, frontend, discovery, geo | P1 | Medium |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved food relationships | user-chef-service, catalog-service | backend, API, persistence | P1 | Medium |
| feature/advanced-search-smart-filters | Catalog/discovery smart filters and advanced search capability | catalog-service, customer-web | backend, frontend, search, UX | P1 | High |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/order-flyway-v14-checksum | Repair or alignment branch for order-service Flyway V14 checksum issues | order-service | backend, database, flyway | P0 | Medium |
| backend-customer-reorder-20260816 | Reorder/repeat-order backend flow for customers | order-service | backend, API, checkout | P1 | Medium |
| feature/backend-launch-policy-enforcement | Launch-policy enforcement around checkout/order behavior | order-service | backend, policy, checkout | P0 | High |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM route/config for admin notification recovery operations | notification-service / APIM | api-gateway, admin, notifications | P1 | Medium |
| feature/admin-notification-recovery-web | Admin UI for notification recovery workflows | admin-web, notification-service | frontend, admin, notifications | P1 | Medium |
| feature/backend-notification-production-delivery | Production-grade notification delivery hardening across channels | notification-service | backend, worker, delivery | P0 | High |
| feature/backend-notification-recovery-operations | Backend recovery tooling and operational retry/reconciliation for notifications | notification-service | backend, admin, worker, recovery | P1 | High |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry paths, auth/session routing, and shell navigation | customer-web-next / auth-service | frontend, routing, auth | P1 | Medium |
| agent/fix-chef-orders-and-customer-palette | UI/flow correction for chef orders plus customer-facing palette consistency | customer-web-next | frontend, chef, design-system | P2 | Medium |
| agent/fix-chef-registration-and-checkout-contract | Align chef registration journey and checkout contracts with backend APIs | customer-web-next, user-chef-service, order-service | frontend, backend, API-contract | P1 | Medium |
| agent/fix-chef-release-traffic-verification | Release validation branch for chef traffic and production routing | infra, customer-web-next | infra, validation, routing | P1 | Medium |
| feat/chef-complete-uiux | Full chef UI/UX experience improvements across workspace pages | customer-web-next | frontend, chef, UX | P1 | Medium |
| feature/admin-chef-review | Admin chef review workflow for application approval/rejection | user-chef-service, admin-web | backend, frontend, admin, review | P1 | High |
| feature/backend-chef-financial-ledger | Chef earnings and financial ledger backend capability | integration-service | backend, finance, ledger, admin | P1 | High |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live backend APIs and signed-in flows | customer-web-next | frontend, API-integration, auth | P1 | Medium |
| agent/fix-backend-connected-signed-in-flows | Repair signed-in customer flows against connected backend services | customer-web-next, auth-service | frontend, backend, session, API | P0 | Medium |
| agent/fix-customer-web-proxy-origin | Fix proxy/origin behavior for customer web deployment | customer-web-next, infra | frontend, networking, proxy | P1 | Medium |
| agent/fix-full-frontend-backend-integration | End-to-end integration fix branch for customer and chef web flows | customer-web-next, platform services | frontend, backend, integration | P0 | Medium |
| chatgpt/backend-customer-chef-journey-20260819 | Combined backend support branch for customer-chef journey improvements | multi-service | backend, API, journey | P1 | Medium |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX improvements | customer-web-next, integration-service | frontend, checkout, payments | P1 | Medium |
| feat/customer-chef-uiux-foundation | Shared foundation across customer and chef web experiences | customer-web-next | frontend, design-system, UX | P2 | Medium |
| feat/customer-landing-discovery-uiux | Discovery-first landing experience for customers | customer-web-next, catalog-service | frontend, discovery, UX | P1 | Medium |
| feat/customer-landing-v2-clean-20260808 | Cleaned second-pass customer landing implementation | customer-web-next | frontend, landing-page, UX | P2 | Medium |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI enhancements | customer-web-next, order-service | frontend, tracking, orders | P1 | Medium |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing branch for customer web | customer-web-next | frontend, landing-page, SEO/semantics | P3 | Low |
| feature/address-final-work | Finalization of customer address flow | user-chef-service, customer-web-next | frontend, backend, address, maps | P1 | Medium |
| feature/address-final-work-2 | Follow-up finalization pass for address workflow | user-chef-service, customer-web-next | frontend, backend, address, maps | P2 | Medium |
| feature/address-final-work-3 | Additional address fixes/refinement branch | user-chef-service, customer-web-next | frontend, backend, address | P2 | Medium |
| feature/address-final-work-4 | Latest address final-work iteration; likely superseding earlier variants | user-chef-service, customer-web-next | frontend, backend, address | P1 | Medium |
| feature/azure-maps-address-autofill | Address autofill and geosearch using Azure Maps | user-chef-service, customer-web-next | frontend, backend, maps, geocoding | P1 | High |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or scratch branch; no merge intent implied | repo tooling | source-control, misc | P3 | Low |
| agent/apim-gateway-domain-fix | Fix APIM gateway/custom domain behavior | infra, APIM | infra, gateway, networking | P0 | Medium |
| agent/backend-completion-guarded-release | Backend release guardrail/completion gating for safer rollout | platform | release, CI/CD, backend | P0 | Medium |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to resolve delivery/runtime issues | infra | CDN, Azure Front Door, networking | P1 | Medium |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-load reliability | infra, frontend delivery | CDN, compression, performance | P1 | Medium |
| agent/fix-cold-device-static-loading | Resolve static asset loading failures on cold devices | frontend delivery, infra | CDN, static-assets, performance | P1 | Medium |
| agent/fix-front-door-cache-validation-cli-288 | Azure Front Door cache validation remediation | infra | CDN, cache, Azure | P1 | Medium |
| agent/fix-front-door-cli-288 | Generic Azure Front Door CLI-related fix branch | infra | Azure, CLI, CDN | P1 | Medium |
| agent/fix-front-door-gzip-cache-bypass | Bypass gzip caching behavior causing stale/broken responses | infra | CDN, cache, compression | P1 | Medium |
| agent/fix-front-door-gzip-rule-validation | Validate or fix Front Door gzip rule configuration | infra | Azure, CDN, rules | P1 | Medium |
| agent/fix-front-door-secret-rest | Secret/configuration fix for Front Door or related edge config | infra | secrets, Azure, networking | P0 | Medium |
| agent/fix-front-door-security-policy-cli-288 | Security policy fix for Front Door rulesets or WAF via CLI | infra | security, WAF, Azure | P0 | Medium |
| agent/fix-static-gzip-cold-loading | Static delivery gzip fix targeting cold-load behavior | infra, frontend delivery | CDN, compression, performance | P1 | Medium |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config behavior in Front Door | infra | CDN, cache, Azure | P2 | Medium |
| agent/parallel-front-door-domain-provisioning | Parallelized custom domain provisioning for Front Door | infra | Azure, automation, domain-management | P2 | Medium |
| agent/preserve-afd-custom-domain-waf | Preserve WAF association during Azure Front Door custom domain updates | infra | Azure, WAF, domain-management | P0 | Medium |
| agent/razorpay-payment-switch | Payment provider switch/toggle likely tied to production configuration rollout | integration-service, infra | payments, config, release | P0 | Medium |
| android-build | Android/mobile build support branch | mobile/build | build, mobile, CI | P2 | Low |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes | customer-web-next | backup, frontend | P3 | Low |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup of mobile UI before home refinement | mobile/web | backup, UI | P3 | Low |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK build branch | mobile/build | build, QA, mobile | P2 | Low |
| ci/subscription-service-predeploy-gate | CI/predeploy gate for subscription service rollout | subscription-service, CI | ci-cd, deployment, backend | P1 | Medium |
| copilot/research-task-repository-analysis | Research/documentation branch, not likely production code | docs/research | docs, analysis | P3 | Low |
| craves-master-guide-v1 | Repository guide/reference branch | docs/platform | documentation | P3 | Low |
| craves-v5-patch-repack | Packaging/repack branch for release artifact | release engineering | release, packaging | P2 | Low |
| dispatch-craves-v4 | Dispatch/release operational trigger branch | release ops | automation, release | P3 | Low |
| dispatch-craves-v4-issue-trigger | Dispatch automation trigger from issue events | release ops | automation, workflow | P3 | Low |
| dispatch-craves-v4-reopen-trigger | Dispatch automation trigger on reopen events | release ops | automation, workflow | P3 | Low |
| dispatch-craves-v4-run-2 | Dispatch operational run branch | release ops | automation, workflow | P3 | Low |
| dispatch-craves-v4-run-3 | Dispatch operational run branch | release ops | automation, workflow | P3 | Low |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | release ops | automation, scheduling | P3 | Low |
| do-not-use | Explicit non-merge branch | repo hygiene | misc | P3 | Low |
| docs/production-release-audit-20260821 | Production release audit documentation | docs/release | documentation, audit, release | P2 | Medium |
| feat/landing-reference-20260811 | Landing reference implementation branch | customer-web-next | frontend, reference, landing-page | P3 | Low |
| feat/landing-reference-refresh | Landing reference refresh/update branch | customer-web-next | frontend, reference, landing-page | P3 | Low |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/landing-body-07cm-inset | Landing-page visual/layout adjustment experiment | customer-web-next | frontend, styling, UX | P3 | Low |
| agent/landing-body-11cm-inset | Alternate landing-page layout adjustment experiment | customer-web-next | frontend, styling, UX | P3 | Low |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI shell/system | customer-web-next | frontend, design-system, UX | P2 | Medium |
| feature/admin-control-center-global-search | Global search across admin control center datasets | admin-web, user-chef-service, order-service | frontend, backend, search, admin | P1 | High |
| feature/admin-customer-360-document-review | Customer 360 and document review experience for admin tooling | admin-web, user-chef-service | frontend, backend, admin, review | P1 | High |
| feature/admin-dashboard-v2 | Second iteration of admin dashboard summary and operational metrics | admin-web, order-service, integration-service | frontend, backend, analytics, admin | P1 | High |
| feature/admin-operational-investigations-apim | APIM exposure for operational investigation endpoints | integration-service / APIM | api-gateway, admin, operations | P1 | Medium |
| feature/admin-operational-investigations-web | Web UI for operational investigations and diagnostics | admin-web, integration-service | frontend, admin, operations | P1 | High |
| feature/admin-subscription-operations | Admin operations for subscriptions, incidents, and reconciliation | subscription-service, admin-web | backend, frontend, admin, operations | P1 | High |
| feature/admin-subscription-plans | Admin management of subscription plans and review flows | subscription-service, admin-web | backend, frontend, admin, subscriptions | P1 | High |
| feature/admin-web-operations-shell | Operations-oriented shell/navigation for admin web | admin-web | frontend, shell, admin | P2 | High |
| feature/admin-web-shell | Foundational admin web shell and shared layout | admin-web | frontend, shell, admin | P2 | High |
| feature/backend-admin-investigation-apis | Backend investigation APIs for operational/admin deep dives | integration-service, order-service | backend, admin, diagnostics | P1 | High |
| feature/backend-admin-operations-audit | Backend audit trail and operations audit APIs | multi-service | backend, audit, admin | P1 | High |
| feature/backend-cashfree-production-hardening | Cashfree production hardening and readiness validation | integration-service | backend, payments, readiness | P0 | High |
| feature/backend-delivery-provider-production-readiness | Delivery provider readiness and production hardening | integration-service | backend, delivery, readiness | P0 | High |
| feature/backend-production-readiness-completion | Cross-backend production readiness completion umbrella branch | multi-service | backend, readiness, release | P0 | Medium |
| feature/backend-refund-production-readiness | Refund flow production readiness and operational hardening | integration-service, order-service | backend, refunds, readiness | P0 | High |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | backend, billing, workers | P1 | High |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation scheduling/workers | subscription-service | backend, scheduling, workers | P1 | High |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment bridge | subscription-service, order-service | backend, orchestration, fulfillment | P1 | High |
| feature/backend-subscription-payment-intents | Payment intent support for subscription charges | subscription-service, integration-service | backend, payments, subscriptions | P1 | High |
| feature/backend-subscription-payment-status-consumer | Payment status event consumer for subscriptions | subscription-service | backend, consumers, events | P1 | High |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling and public schedule support | subscription-service | backend, scheduling, API | P1 | High |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout/reconciliation finalization branch | integration-service | backend, payments, reconciliation | P1 | Medium |
| feature/post-order-ratings-reviews | Post-order ratings and reviews for delivered orders; adds customer review APIs, chef rating summaries, and Flyway V11 in user-chef-service | user-chef-service | backend, API, jdbc, flyway, cross-service validation | P1 | High |

## Branch inventory notes

- This inventory is based on the real branch list returned from GitHub for page 1 with `per_page=100`.
- The current counted inventory in this document is **100 branches**.
- Branch descriptions are grounded in branch names and the provided codebase intelligence report.
- The new branch `feature/post-order-ratings-reviews` is included using the supplied feature implementation details.

## Merge guidance summary

### Merge first
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-redis-abuse-revocation`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-refund-production-readiness`
- `feature/backend-notification-production-delivery`
- `feature/backend-launch-policy-enforcement`

### Merge next
- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`
- `feature/admin-chef-review`
- `feature/admin-control-center-global-search`
- `feature/admin-dashboard-v2`
- `feature/post-order-ratings-reviews`
- `feature/azure-maps-address-autofill`
- `feature/advanced-search-smart-filters`

### Review carefully before merge
- all `agent/fix-front-door-*` branches
- `agent/apim-gateway-domain-fix`
- `agent/preserve-afd-custom-domain-waf`
- `agent/razorpay-payment-switch`
- `ci/subscription-service-predeploy-gate`

### Generally do not merge directly
- `backup/*`
- `dispatch-*`
- `do-not-use`
- `accidental-ignore-7`
- reference-only landing/layout experiment branches unless explicitly selected
