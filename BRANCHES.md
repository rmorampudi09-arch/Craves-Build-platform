# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-25  
**Total branch count:** 100

This document is the branch inventory and handover guide for the Craves platform repository. It lists every real branch returned by the GitHub branch listing call and groups them by product or engineering domain so the team can review, prioritise, and merge safely into `main`.

## Branch naming convention

Observed branch naming patterns in this repository:

- `agent/*` - autonomous fix, release, infra, or UI integration branches
- `feature/*` - product or backend feature branches
- `feat/*` - frontend/UI UX focused feature branches
- `backend-*` - backend capability branches without namespace prefix
- `backup/*` - restore points and pre-change safety branches
- `build/*` - build artifact or QA build branches
- `ci/*` - CI/CD or deployment gate branches
- `docs/*` - documentation and release audit branches
- `chatgpt/*`, `copilot/*` - research or AI-assisted implementation branches
- unprefixed special branches - operational, accidental, or temporary branches

## Merge policy

- Always merge to `main` through PR review unless the branch is explicitly a docs-only or emergency infra hotfix branch and team policy allows direct update.
- Prefer **squash merge** for short-lived feature branches.
- Prefer **rebase then merge** for branches that alter release pipelines, APIM, Front Door, auth, payment, or database migration sequences.
- Validate service-specific tests before merge:
  - Auth/User/Chef: security, RBAC, profile, address, chef onboarding tests
  - Catalog: search, discovery, menu, geo/search, saved/favorites tests
  - Orders: checkout, state transition, tracking, refund, admin ops tests
  - Notifications: delivery worker, recovery ops, provider adapter tests
  - Infra: APIM policy validation, Front Door configuration validation, deployment dry run
- Merge readiness labels used below:
  - **Ready** - clear scoped branch with mergeable intent
  - **Review** - needs code review and integration validation
  - **Caution** - risky, overlapping, duplicate, or environment-sensitive
  - **Hold** - backup/temporary/do-not-use/dispatch or unclear operational branch

## Merge order guidance

Recommended broad merge order:

1. Docs and release audit branches
2. CI and infra stabilization branches
3. Auth and admin security branches
4. Catalog and discovery branches
5. Customer/Chef experience branches
6. Orders and notifications branches
7. Broad frontend unification or production-hardening branches
8. Backup, dispatch, and do-not-use branches should generally not be merged

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC enhancement for protected backend operations | auth-service | Spring Boot, security, RBAC | High | Review |
| feature/backend-admin-account-intervention | Backend admin account intervention APIs and controls | auth-service | Spring Boot, auth APIs, admin ops | High | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up RBAC hardening and role model refinement | auth-service | Spring Boot, security, RBAC | High | Review |
| feature/backend-redis-abuse-revocation | Abuse prevention and token/session revocation protections | auth-service | Spring Boot, Redis, security | High | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchen discovery experience | catalog-service | Spring Boot, discovery APIs, geo/search, web UI | High | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby-first discovery ranking and UX | catalog-service | Spring Boot, discovery APIs, geo/search, web UI | High | Review |
| backend-customer-favorites-20260816 | Customer favorites backend capability | user-chef-service / catalog-service | Spring Boot, profile/favorites, persistence | High | Review |
| feature/advanced-search-smart-filters | Advanced search with smart filter facets and ranked results | catalog-service | Spring Boot, React/TS, search UI | High | Ready |
| feature/personalized-home-feed | Personalized home feed rails based on customer affinity and reorder patterns | catalog-service | Spring Boot, React/TS, discovery UI | High | Ready |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fix chef orders surface and align customer-facing visual language | order-service / customer-web | Spring Boot, Next.js/React, UI | Medium | Review |
| agent/order-flyway-v14-checksum | Resolve order-service Flyway checksum mismatch | order-service | Spring Boot, Flyway, DB migration | High | Caution |
| backend-customer-reorder-20260816 | Repeat/reorder customer flow support | order-service | Spring Boot, orders domain, BFF/UI integration | High | Review |
| feature/backend-launch-policy-enforcement | Enforce launch and rollout policy checks in order flows | order-service | Spring Boot, policy enforcement, operations | High | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM exposure for notification recovery operations | notification-service | APIM, API policy, admin ops | Medium | Review |
| feature/admin-notification-recovery-web | Admin web UI for notification recovery workflows | notification-service / admin web | Next.js/React, admin UI, BFF | Medium | Review |
| feature/backend-notification-production-delivery | Production delivery worker and provider readiness enhancements | notification-service | Spring Boot, workers, email/push adapters | High | Ready |
| feature/backend-notification-recovery-operations | Recovery operations APIs and remediation workflows | notification-service | Spring Boot, admin ops, recovery tools | High | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry flow and authenticated session routing | user-chef-service / customer-web-next | Next.js, auth session, routing | High | Review |
| agent/fix-chef-registration-and-checkout-contract | Resolve chef registration and checkout contract mismatches | user-chef-service / order-service | Spring Boot, API contracts, frontend integration | High | Review |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic and deployment routing | infra / customer-web-next | Azure, Front Door/APIM, release verification | Medium | Caution |
| feat/chef-complete-uiux | End-to-end chef workspace UI/UX refinement | customer-web-next chef module | Next.js, TypeScript, Tailwind | High | Review |
| feature/admin-chef-review | Admin review flow for chef onboarding and approval | user-chef-service / admin web | Spring Boot, Next.js, admin workflow | High | Review |
| feature/backend-chef-financial-ledger | Backend chef earnings and financial ledger capability | integration-service | Spring Boot, payments/accounting, admin ops | High | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live APIs/services | customer-web-next | Next.js, TypeScript, BFF/API wiring | High | Review |
| agent/fix-backend-connected-signed-in-flows | Fix signed-in customer flows against connected backend | customer-web-next / auth-service | Next.js, auth, BFF integration | High | Review |
| agent/fix-customer-web-proxy-origin | Correct customer web proxy origin behavior | customer-web-next | Next.js proxy, deployment config | Medium | Review |
| agent/landing-body-07cm-inset | Landing page layout adjustment variant | customer-web-next | Next.js, CSS/Tailwind | Low | Caution |
| agent/landing-body-11cm-inset | Alternate landing page layout adjustment variant | customer-web-next | Next.js, CSS/Tailwind | Low | Caution |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UX package | customer-web-next | Next.js, TypeScript, Tailwind | High | Review |
| feat/customer-chef-uiux-foundation | Shared customer/chef UI foundation | customer-web-next | Next.js, design system, Tailwind | Medium | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UX | customer-web-next | Next.js, discovery UI | High | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing V2 implementation | customer-web-next | Next.js, marketing UI | Medium | Review |
| feat/customer-orders-tracking-uiux | Customer orders and tracking UX improvements | customer-web-next | Next.js, tracking UI, BFF | High | Review |
| feat/customer-web-semantic-reference-landing | Semantic landing reference implementation | customer-web-next | Next.js, semantic HTML/CSS | Low | Caution |
| feat/landing-reference-20260811 | Landing page reference branch | customer-web-next | Next.js, design reference | Low | Caution |
| feat/landing-reference-refresh | Landing reference refresh iteration | customer-web-next | Next.js, design refresh | Low | Caution |
| feature/address-final-work | Address experience finalisation | user-chef-service / customer web | Spring Boot, React, address UX | High | Review |
| feature/address-final-work-2 | Follow-up address finalisation variant | user-chef-service / customer web | Spring Boot, React, address UX | Medium | Caution |
| feature/address-final-work-3 | Follow-up address finalisation variant | user-chef-service / customer web | Spring Boot, React, address UX | Medium | Caution |
| feature/address-final-work-4 | Follow-up address finalisation variant | user-chef-service / customer web | Spring Boot, React, address UX | Medium | Caution |
| feature/azure-maps-address-autofill | Azure Maps-backed address autofill and lookup | user-chef-service | Spring Boot, Azure Maps, frontend forms | High | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM gateway custom domain or routing issues | infra/apim | Azure APIM, DNS, gateway config | High | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to solve delivery issues | infra/frontdoor | Azure Front Door, CDN behavior | Medium | Caution |
| agent/disable-origin-gzip-for-cold-loading | Adjust origin gzip handling for cold-load problems | infra/frontdoor | Azure Front Door, origin config | Medium | Caution |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices | infra/frontdoor / customer-web-next | Azure Front Door, static hosting | High | Review |
| agent/fix-front-door-cache-validation-cli-288 | Repair Front Door cache validation command/config issue | infra/frontdoor | Azure CLI, Front Door, cache config | Medium | Review |
| agent/fix-front-door-cli-288 | General Front Door CLI compatibility fix | infra/frontdoor | Azure CLI, Front Door | Medium | Review |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip and cache bypass behavior | infra/frontdoor | Front Door, caching, compression | Medium | Review |
| agent/fix-front-door-gzip-rule-validation | Fix gzip rule validation in Front Door policy/config | infra/frontdoor | Front Door rules engine | Medium | Review |
| agent/fix-front-door-secret-rest | Restore Front Door secret handling / REST config | infra/frontdoor | Azure REST/API, secrets | High | Caution |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy provisioning | infra/frontdoor | Azure CLI, WAF/security policy | High | Review |
| agent/fix-static-gzip-cold-loading | Static asset gzip cold-loading fix | infra/frontdoor / customer-web-next | Front Door, static hosting | Medium | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize cache config edge case for Front Door | infra/frontdoor | Azure CLI, caching | Medium | Review |
| agent/parallel-front-door-domain-provisioning | Parallelise Front Door domain provisioning flow | infra/frontdoor | Azure Front Door, automation | Medium | Review |
| agent/preserve-afd-custom-domain-waf | Preserve custom domain WAF association during updates | infra/frontdoor | Azure Front Door, WAF | High | Review |
| android-build | Android/mobile build branch | mobile/build | Android tooling, CI/build | Medium | Review |
| build/qa-mobile-apk-2026-08-20 | QA APK build packaging branch | mobile/build | CI/CD, Android artifact build | Medium | Review |
| ci/subscription-service-predeploy-gate | Subscription service pre-deploy gate and validation | subscription-service / CI | pipeline config, deployment checks | Medium | Ready |
| docs/production-release-audit-20260821 | Production release audit and documentation branch | cross-repo docs | Markdown, release governance | High | Ready |
| feature/admin-account-intervention-apim | APIM integration for admin account intervention APIs | infra/apim | APIM, policy, gateway contracts | Medium | Review |
| feature/admin-operational-investigations-apim | APIM integration for operational investigation endpoints | infra/apim | APIM, policy, admin routing | Medium | Review |
| feature/backend-cashfree-production-hardening | Production hardening for Cashfree backend integrations | integration-service | Spring Boot, payments, ops hardening | High | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider integrations | integration-service | Spring Boot, delivery adapters, ops readiness | High | Review |
| feature/backend-production-readiness-completion | Cross-backend production readiness completion work | multiple backend services | Spring Boot, ops hardening, configs | High | Review |
| feature/backend-refund-production-readiness | Refund flow production hardening | integration-service / order-service | Spring Boot, payments, refunds | High | Review |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout and final fixes | integration-service | Spring Boot, payment gateway, deployment | High | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Temporary or accidental branch; likely not intended for merge | unknown | unknown | Low | Hold |
| agent/backend-completion-guarded-release | Controlled release branch to complete backend rollout | multiple backend services | Spring Boot, release controls | High | Review |
| agent/fix-full-frontend-backend-integration | Full-stack integration fixes across frontend and backend | multiple services | Next.js, Spring Boot, contracts | High | Review |
| agent/razorpay-payment-switch | Payment provider switch or fallback toward Razorpay path | integration-service | Spring Boot, payment integrations | Medium | Caution |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI patterns | customer-web-next | Next.js, shared UI, design system | Medium | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup branch before landing v2 changes | customer-web-next | source backup | Low | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup branch before mobile UI refinement | mobile app | source backup | Low | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch for customer-chef journey backend work | user-chef-service / order-service | Spring Boot, domain flows | Medium | Review |
| copilot/research-task-repository-analysis | Research/analysis branch, likely non-production | docs/research | docs, analysis | Low | Hold |
| craves-master-guide-v1 | Master guide or release guidance branch | docs / release | documentation | Low | Hold |
| craves-v5-patch-repack | Patch repack/release assembly branch | release engineering | packaging, release ops | Medium | Caution |
| dispatch-craves-v4 | Dispatch trigger/ops branch | release/ops | automation, workflows | Low | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue trigger automation branch | release/ops | GitHub workflows/automation | Low | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen trigger automation branch | release/ops | GitHub workflows/automation | Low | Hold |
| dispatch-craves-v4-run-2 | Dispatch rerun branch | release/ops | automation | Low | Hold |
| dispatch-craves-v4-run-3 | Dispatch rerun branch | release/ops | automation | Low | Hold |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch | release/ops | automation, scheduler | Low | Hold |
| do-not-use | Explicitly marked non-mergeable branch | unknown | unknown | Low | Hold |
| feature/admin-account-intervention-web | Admin web interface for account intervention workflows | admin web | Next.js, TypeScript, admin UI | Medium | Review |
| feature/admin-control-center-global-search | Global search across admin control center | admin web / multiple services | Next.js, search UI, admin APIs | High | Review |
| feature/admin-customer-360-document-review | Customer 360 and document review admin workflows | admin web / user-chef-service | Next.js, Spring Boot, admin tooling | High | Review |
| feature/admin-dashboard-v2 | Version 2 of admin dashboard | admin web / order-service | Next.js, analytics/admin UI | High | Review |
| feature/admin-operational-investigations-web | Admin web UI for operational investigations | admin web / order-service | Next.js, admin tooling, BFF | High | Review |
| feature/admin-subscription-operations | Admin tooling for subscription operations | admin web / subscription-service | Next.js, Spring Boot, admin ops | High | Review |
| feature/admin-subscription-plans | Admin management for subscription plans | admin web / subscription-service | Next.js, Spring Boot, plan management | High | Review |
| feature/admin-web-operations-shell | Operational shell for admin workspace | admin web | Next.js, layout shell, BFF | Medium | Review |
| feature/admin-web-shell | Base shell for admin portal/workspace | admin web | Next.js, layout shell | Medium | Review |
| feature/backend-admin-investigation-apis | Backend APIs for investigations and admin operational tracing | order-service / integration-service | Spring Boot, admin APIs | High | Review |
| feature/backend-admin-operations-audit | Audit trail and operational logging for admin actions | multiple backend services | Spring Boot, auditing, persistence | High | Review |
| feature/backend-subscription-billing-lifecycle | Billing lifecycle management for subscriptions | subscription-service | Spring Boot, billing, lifecycle | High | Ready |
| feature/backend-subscription-occurrence-generator | Occurrence generation for recurring plans | subscription-service | Spring Boot, schedulers, lifecycle | High | Ready |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment integration | subscription-service / order-service | Spring Boot, events, order orchestration | High | Review |
| feature/backend-subscription-payment-intents | Payment intent creation for subscriptions | subscription-service / integration-service | Spring Boot, payment orchestration | High | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status updates | subscription-service | Spring Boot, async consumer, payment events | High | Ready |
| feature/backend-subscription-plan-schedules | Plan schedule APIs and persistence | subscription-service | Spring Boot, scheduling, public APIs | High | Ready |

---

## Branch count verification

The branch inventory above includes **all 100 real branches** returned by the direct GitHub `list_branches` call for page 1 with `per_page=100`.

## Service ownership summary

- **auth-service**: RBAC, account intervention, abuse revocation
- **user-chef-service**: chef onboarding/review, addresses, favorites-adjacent customer profile work
- **catalog-service**: discovery, nearby kitchens, personalized feed, advanced search
- **order-service**: reorder, launch policy, order state and chef order workflows
- **subscription-service**: billing lifecycle, schedule generation, payment status consumption, admin subscription ops
- **integration-service**: Cashfree, Razorpay, refund hardening, delivery provider readiness, ledger work
- **notification-service**: production delivery and recovery operations
- **customer-web-next / admin web**: customer, chef, and admin UI flows
- **infra**: APIM, Azure Front Door, release routing and provisioning

## Suggested immediate merge candidates

1. `docs/production-release-audit-20260821`
2. `feature/backend-redis-abuse-revocation`
3. `feature/azure-maps-address-autofill`
4. `feature/advanced-search-smart-filters`
5. `feature/personalized-home-feed`
6. `feature/backend-notification-production-delivery`
7. `feature/backend-notification-recovery-operations`
8. `feature/backend-subscription-billing-lifecycle`
9. `feature/backend-subscription-occurrence-generator`
10. `feature/backend-subscription-payment-status-consumer`
11. `feature/backend-subscription-plan-schedules`
12. `ci/subscription-service-predeploy-gate`

## Branches to avoid merging directly

- `do-not-use`
- `accidental-ignore-7`
- all `backup/*` branches
- all `dispatch-craves-v4*` branches unless specifically required for ops automation restoration
- duplicate/variant branches where a later canonical branch exists, such as multiple address-final-work variants or landing reference variants, until the team nominates the source of truth
