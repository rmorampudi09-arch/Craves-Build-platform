# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the current branch handover and merge-planning inventory for the repository. It groups all real branches returned by GitHub into delivery domains so the team can review, sequence, and merge safely into `main`.

## Branch naming convention

Observed naming patterns in the repository:

- `agent/*` — autonomous or assisted implementation/fix branches
- `feature/*` — product or backend feature branches
- `feat/*` — UX/UI focused feature branches
- `backend-*` — backend-targeted feature work using date suffixes
- `backup/*` — restore points / safety branches
- `build/*` — build or packaging branches
- `ci/*` — CI/CD workflow or deployment gate changes
- `docs/*` — documentation and release audit branches
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation branches
- `dispatch-*` — operational trigger or workflow branches
- standalone names such as `android-build`, `do-not-use`, `craves-master-guide-v1` — ad hoc or legacy utility branches

## Merge policy

1. Merge **backend contract and infrastructure prerequisites first**.
2. Merge **service-level backend branches before corresponding web/admin UI branches**.
3. Merge **APIM / gateway branches before public client traffic cutover**.
4. Validate Flyway, API contracts, auth scopes, and BFF route compatibility before merge.
5. Treat `backup/*`, `do-not-use`, `dispatch-*`, and accidental branches as **non-mergeable by default** unless explicitly required.
6. Prefer squash merges for isolated feature branches and regular merges only where history preservation matters.
7. For branches with overlapping ownership, merge the more foundational branch first and rebase dependent branches.

## Category mapping notes

- **Auth**: identity, session, RBAC, account intervention, auth hardening
- **Catalog**: discovery, kitchens, menu/search, landing/discovery catalog UX
- **Orders**: cart, checkout, reorder, fulfillment, payment-adjacent order flows
- **Notifications**: delivery, recovery, messaging operations
- **Chef**: chef onboarding, chef panel, chef review, chef financials, chef operations UX
- **Customer**: customer web, favorites, address, landing, tracking, signed-in journeys
- **Infra**: APIM, Azure Front Door, CI/CD, build, release, compression, traffic and environment fixes
- **Feature**: cross-cutting, admin, subscription, research, backup, and uncategorized feature work

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation pass for privileged operations. | auth-service | Backend, Security, RBAC, API | High | Needs integration validation |
| `feature/backend-internal-admin-rbac-v2` | Follow-up RBAC hardening/version 2 for internal admin controls. | auth-service | Backend, Security, RBAC, Flyway/API | High | Ready after RBAC diff review |
| `feature/backend-redis-abuse-revocation` | Abuse protection and token revocation reinforcement. | auth-service | Backend, Redis, Security, Auth filters | High | Ready for controlled merge |
| `feature/backend-admin-account-intervention` | Backend support for admin account intervention workflows. | auth-service | Backend, Admin API, Security, Audit | High | Ready after API review |
| `feature/admin-account-intervention-apim` | APIM surface for admin account intervention endpoints. | api / APIM | Gateway, APIM, Security | Medium | Merge after backend/admin API |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention flows. | admin-portal / customer-web-next admin | Frontend, BFF, Admin UI | Medium | Merge after backend + APIM |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Reworks discovery to prioritize nearby kitchens. | catalog-service | Backend, Discovery, BFF compatibility | High | Needs UX/API regression check |
| `agent/nearby-kitchens-first-discovery-v2` | Second iteration of nearby-first discovery logic and ranking. | catalog-service | Backend, Discovery, Search UX | High | Candidate after v1 comparison |
| `feature/advanced-search-smart-filters` | Smart filters and richer search/discovery controls. | catalog-service / customer-web-next | Backend, Frontend, Search, BFF | High | Needs contract and UI validation |
| `feat/customer-landing-discovery-uiux` | Discovery-led landing experience for customers. | customer-web-next + catalog-service | Frontend, UX, BFF, Discovery | Medium | Merge after discovery API confirmation |
| `feat/customer-web-semantic-reference-landing` | Semantic landing reference implementation for customer web. | customer-web-next | Frontend, UX, Content structure | Low | Reference branch; cherry-pick selectively |
| `feat/landing-reference-20260811` | Landing page reference implementation snapshot. | customer-web-next | Frontend, UX, Reference | Low | Reference only |
| `feat/landing-reference-refresh` | Refreshed landing reference concepts. | customer-web-next | Frontend, UX, Reference | Low | Reference only |
| `feat/customer-landing-v2-clean-20260808` | Cleaned landing V2 customer experience branch. | customer-web-next | Frontend, UX, BFF | Medium | Ready after visual QA |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Adds reorder capability for customer order history. | order-service | Backend, Orders, API | High | Ready after idempotency/regression test |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment user flow UI/UX. | customer-web-next + order-service | Frontend, BFF, Checkout, Payment UX | High | Merge after backend/payment validation |
| `feat/customer-orders-tracking-uiux` | Orders list, detail, and tracking UX improvements. | customer-web-next + order-service | Frontend, BFF, Orders, Tracking | High | Ready after tracking contract check |
| `agent/fix-chef-registration-and-checkout-contract` | Resolves contract mismatches affecting registration and checkout. | order-service + customer-web-next | Backend, BFF, Contracts | High | High confidence after contract tests |
| `agent/fix-full-frontend-backend-integration` | End-to-end integration fix across frontend and backend flows. | multi-service | Backend, Frontend, BFF, Contracts | High | Needs broad regression run |
| `agent/fix-backend-connected-signed-in-flows` | Fixes signed-in customer flow wiring across services. | multi-service | Backend, Auth, BFF | High | Ready after auth/session verification |
| `agent/razorpay-payment-switch` | Switch or stabilization work for Razorpay payment path. | integration-service + order-service | Payments, Backend, BFF | High | Merge with payment smoke test |
| `agent/order-flyway-v14-checksum` | Repairs or aligns Flyway checksum for order-service migration V14. | order-service | Backend, Database, Flyway | Critical | Safe only after DB review |
| `feature/backend-launch-policy-enforcement` | Enforces launch policy gates around order/runtime behavior. | order-service | Backend, Policy, API | Medium | Merge after rollout rules approval |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production delivery hardening for notifications. | notification-service | Backend, Workers, Delivery | High | Ready after provider verification |
| `feature/backend-notification-recovery-operations` | Recovery operations for failed/stuck notifications. | notification-service | Backend, Admin Ops, Retry tooling | High | Ready after ops workflow review |
| `feature/admin-notification-recovery-apim` | APIM route layer for notification recovery operations. | api / APIM | Gateway, Admin API, Security | Medium | Merge after backend recovery ops |
| `feature/admin-notification-recovery-web` | Admin UI to inspect and recover notifications. | admin-portal / customer-web-next admin | Frontend, Admin UI, BFF | Medium | Merge after backend + APIM |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entry flow and chef session routing. | customer-web-next + auth-service | Frontend, Auth, Routing, BFF | High | Ready after chef sign-in QA |
| `agent/fix-chef-orders-and-customer-palette` | Aligns chef orders UX and shared visual palette. | customer-web-next | Frontend, Chef UI, Design system | Medium | Needs design acceptance |
| `agent/fix-chef-release-traffic-verification` | Verifies chef release traffic path in production routing. | infra + chef surface | Infra, Routing, Release verification | Medium | Merge after traffic validation |
| `agent/unify-chef-panel-customer-ui` | Unifies chef panel and customer UI architecture/visual system. | customer-web-next | Frontend, Shared UI, Navigation | Medium | Needs conflict review with chef UI branches |
| `feat/chef-complete-uiux` | Comprehensive chef UI/UX implementation branch. | customer-web-next chef surface | Frontend, Chef UI, BFF | High | Merge after dependency rebase |
| `feature/admin-chef-review` | Admin workflow for chef application/document review. | user-chef-service + admin UI | Backend, Admin API, Frontend | High | Ready after review workflow QA |
| `feature/backend-chef-financial-ledger` | Chef financial ledger backend support. | integration-service / user-chef-service | Backend, Finance, Ledger, APIs | High | Needs accounting/domain review |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work spanning customer-chef lifecycle touchpoints. | multi-service | Backend, API, Journey flows | Medium | Requires manual code review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connects customer UI to live backend/BFF flows. | customer-web-next | Frontend, BFF, Integration | High | Ready after E2E smoke test |
| `agent/fix-customer-web-proxy-origin` | Fixes customer web proxy origin/config issues. | customer-web-next / infra | Frontend, Proxy, Runtime config | High | Ready after env validation |
| `backend-customer-favorites-20260816` | Backend support for customer favorites. | user-chef-service | Backend, Favorites, API | High | Ready after API/UI check |
| `feature/address-final-work` | Customer address workflow completion pass. | user-chef-service + customer-web-next | Backend, Frontend, Address UX | High | Needs comparison with sibling branches |
| `feature/address-final-work-2` | Iteration 2 of address workflow completion. | user-chef-service + customer-web-next | Backend, Frontend, Address UX | High | Select best candidate before merge |
| `feature/address-final-work-3` | Iteration 3 of address workflow completion. | user-chef-service + customer-web-next | Backend, Frontend, Address UX | High | Select best candidate before merge |
| `feature/address-final-work-4` | Iteration 4 of address workflow completion. | user-chef-service + customer-web-next | Backend, Frontend, Address UX | High | Likely latest candidate; verify diffs |
| `feature/azure-maps-address-autofill` | Azure Maps powered address autofill/recommendation. | user-chef-service + customer-web-next | Backend, Frontend, Maps, BFF | High | Ready after maps quota/config test |
| `feat/customer-chef-uiux-foundation` | Shared foundation for customer and chef UI/UX patterns. | customer-web-next | Frontend, Design system, Layout | Medium | Merge before larger UI branches if reused |
| `agent/landing-body-07cm-inset` | Landing page layout tweak variant. | customer-web-next | Frontend, UX, Styling | Low | Experimental/reference |
| `agent/landing-body-11cm-inset` | Alternate landing layout inset variant. | customer-web-next | Frontend, UX, Styling | Low | Experimental/reference |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fixes APIM gateway/custom domain behavior. | infra / api | APIM, DNS, Gateway | High | Ready after domain validation |
| `agent/disable-afd-edge-compression` | Disables Azure Front Door edge compression. | infra | CDN, Azure Front Door, Edge config | Medium | Merge after cache behavior validation |
| `agent/disable-origin-gzip-for-cold-loading` | Disables origin gzip to improve cold loading behavior. | infra | CDN, Origin config, Performance | Medium | Needs performance comparison |
| `agent/fix-cold-device-static-loading` | Fixes static asset loading on cold devices/sessions. | infra + frontend | Frontend, CDN, Caching | High | Ready after device smoke tests |
| `agent/fix-front-door-cache-validation-cli-288` | Fixes Front Door cache validation issue tied to CLI-288. | infra | Azure Front Door, Cache rules | High | Ready after config validation |
| `agent/fix-front-door-cli-288` | General Front Door fix associated with CLI-288. | infra | Azure Front Door, Networking | High | Needs overlap review with related branches |
| `agent/fix-front-door-gzip-cache-bypass` | Adjusts gzip/cache bypass rules in Front Door. | infra | Azure Front Door, Caching, Compression | Medium | Merge after cache verification |
| `agent/fix-front-door-gzip-rule-validation` | Corrects gzip rule validation in Front Door config. | infra | Azure Front Door, Validation | Medium | Ready after IaC validation |
| `agent/fix-front-door-secret-rest` | Fixes Front Door secret or REST configuration path. | infra | Azure Front Door, Secrets, API | Medium | Needs security review |
| `agent/fix-front-door-security-policy-cli-288` | Security policy correction for Front Door rollout. | infra | WAF, Security policy, Azure Front Door | High | Merge after security approval |
| `agent/fix-static-gzip-cold-loading` | Resolves static gzip cold-loading issue. | infra + frontend | CDN, Compression, Frontend runtime | Medium | Needs comparison with related gzip branches |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalizes empty cache config handling for Front Door. | infra | Azure Front Door, Cache config | Medium | Ready after IaC plan review |
| `agent/parallel-front-door-domain-provisioning` | Improves/domain provisioning flow in parallel for Front Door. | infra | Azure Front Door, Provisioning automation | Medium | Merge after domain orchestration test |
| `agent/preserve-afd-custom-domain-waf` | Preserves WAF association while changing AFD custom domains. | infra | Azure Front Door, WAF, Domain config | High | Ready after security validation |
| `android-build` | Android build-related branch. | mobile/build | Build, Packaging, CI | Low | Merge only if mobile delivery requires it |
| `build/qa-mobile-apk-2026-08-20` | QA APK build packaging branch. | mobile/build | Build, Release artifact | Low | Operational branch, not default merge |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service predeploy checks. | CI/CD | Pipeline, Quality gate, Deploy | Medium | Ready after pipeline test |
| `docs/production-release-audit-20260821` | Release audit and production readiness documentation. | docs / infra | Documentation, Release ops | Medium | Merge if still current |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree integration. | integration-service | Backend, Payments, Production readiness | High | Ready after payment gateway validation |
| `feature/backend-delivery-provider-production-readiness` | Production readiness work for delivery providers. | integration-service | Backend, Delivery adapters, Ops | High | Ready after provider smoke test |
| `feature/backend-production-readiness-completion` | Final backend production readiness consolidation. | multi-service backend | Backend, Ops, Hardening | High | Merge late after dependent branches |
| `feature/backend-refund-production-readiness` | Refund flow production hardening. | integration-service + order-service | Backend, Payments, Refunds | High | Ready after refund lifecycle tests |
| `feature/cashfree-production-closeout-20260815` | Cashfree closeout/finalization branch. | integration-service | Backend, Payments, Release ops | Medium | Merge after hardening branch review |
| `craves-v5-patch-repack` | Packaging/repack branch for patch release. | release engineering | Build, Release | Low | Operational; merge only if needed |
| `dispatch-craves-v4` | Dispatch/trigger branch for v4 workflow. | operations | Automation, Dispatch | Low | Do not merge by default |
| `dispatch-craves-v4-issue-trigger` | Issue trigger branch for dispatch workflow. | operations | Automation, GitHub workflow | Low | Do not merge by default |
| `dispatch-craves-v4-reopen-trigger` | Reopen trigger branch for dispatch workflow. | operations | Automation, GitHub workflow | Low | Do not merge by default |
| `dispatch-craves-v4-run-2` | Dispatch workflow run branch #2. | operations | Automation | Low | Do not merge by default |
| `dispatch-craves-v4-run-3` | Dispatch workflow run branch #3. | operations | Automation | Low | Do not merge by default |
| `dispatch-craves-v4-schedule` | Scheduled dispatch workflow branch. | operations | Automation, Scheduling | Low | Do not merge by default |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Accidental or temporary branch; no clear product intent. | unknown | Misc | Low | Do not merge |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing V2 changes. | customer-web-next | Backup, Frontend snapshot | Low | Do not merge directly |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | mobile / frontend | Backup, UI snapshot | Low | Do not merge directly |
| `copilot/research-task-repository-analysis` | Repository analysis/research branch. | docs / research | Research, Documentation | Low | Do not merge unless docs needed |
| `craves-master-guide-v1` | Master guide or repo guide branch. | docs | Documentation | Low | Merge selectively if missing docs |
| `do-not-use` | Explicitly marked non-usable branch. | unknown | Misc | Low | Do not merge |
| `feature/admin-control-center-global-search` | Admin control center global search capability. | user-chef-service + admin UI | Backend, Frontend, Search, Admin | Medium | Ready after directory/search QA |
| `feature/admin-customer-360-document-review` | Admin customer 360 and document review workflows. | admin UI + user-chef-service | Frontend, Backend, Admin review | Medium | Merge after RBAC/admin shell |
| `feature/admin-dashboard-v2` | Next admin dashboard iteration. | admin UI + order/auth backends | Frontend, Admin UI, BFF | Medium | Ready after admin shell |
| `feature/admin-operational-investigations-apim` | APIM layer for admin operational investigation APIs. | api / APIM | Gateway, Admin API | Medium | Merge after backend investigation APIs |
| `feature/admin-operational-investigations-web` | Admin investigations UI. | admin UI | Frontend, BFF, Admin ops | Medium | Merge after backend + APIM |
| `feature/admin-subscription-operations` | Admin operations workflows for subscriptions. | subscription-service + admin UI | Backend, Frontend, Admin ops | High | Ready after admin shell dependencies |
| `feature/admin-subscription-plans` | Admin plan management UI/workflows. | subscription-service + admin UI | Backend, Frontend, BFF | High | Merge after schedule/policy APIs |
| `feature/admin-web-operations-shell` | Operational shell layout for admin experience. | admin UI | Frontend, Shell, Navigation | Medium | Merge before operations feature branches |
| `feature/admin-web-shell` | Core admin web shell and frame. | admin UI | Frontend, Shell, Layout | High | Foundational; merge early for admin UI |
| `feature/backend-admin-investigation-apis` | Backend admin APIs for investigations and operational tracing. | order-service / integration-service | Backend, Admin API, Audit | High | Ready after security review |
| `feature/backend-admin-operations-audit` | Backend audit trail support for admin operations. | multi-service backend | Backend, Audit, Admin ops | High | Merge before admin investigations UI |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle backend implementation. | subscription-service | Backend, Billing, Workers | High | Ready after payment coordination |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generation worker/backend. | subscription-service | Backend, Scheduling, Workers | High | Ready after billing model review |
| `feature/backend-subscription-order-fulfillment` | Subscription-to-order fulfillment orchestration. | subscription-service + order-service | Backend, Fulfillment, Internal APIs | High | Needs cross-service regression test |
| `feature/backend-subscription-payment-intents` | Subscription payment intent/order generation backend. | integration-service + subscription-service | Backend, Payments, Billing | High | Ready after gateway verification |
| `feature/backend-subscription-payment-status-consumer` | Consumes payment status events for subscriptions. | subscription-service | Backend, Async, Service Bus | High | Ready after event contract review |
| `feature/backend-subscription-plan-schedules` | Backend support for plan schedules and availability. | subscription-service | Backend, Scheduling, API | High | Ready after plan review |

---

## Suggested merge sequence

1. `feature/backend-redis-abuse-revocation`
2. `agent/backend-internal-admin-rbac`
3. `feature/backend-internal-admin-rbac-v2`
4. `feature/backend-admin-account-intervention`
5. `feature/backend-admin-operations-audit`
6. `feature/backend-admin-investigation-apis`
7. `feature/backend-subscription-plan-schedules`
8. `feature/backend-subscription-billing-lifecycle`
9. `feature/backend-subscription-occurrence-generator`
10. `feature/backend-subscription-payment-intents`
11. `feature/backend-subscription-payment-status-consumer`
12. `feature/backend-subscription-order-fulfillment`
13. `feature/backend-notification-production-delivery`
14. `feature/backend-notification-recovery-operations`
15. `feature/backend-chef-financial-ledger`
16. `feature/backend-cashfree-production-hardening`
17. `feature/backend-refund-production-readiness`
18. `feature/backend-delivery-provider-production-readiness`
19. `feature/backend-production-readiness-completion`
20. APIM/admin web/customer web branches dependent on those backends

## Non-default merge branches

The following branches should typically be excluded from merge planning unless specifically requested:

- `accidental-ignore-7`
- `do-not-use`
- all `backup/*`
- all `dispatch-*`
- most reference-only landing branches when a later canonical branch exists
- one-off operational packaging branches such as `build/*` unless release engineering requests otherwise

## Inventory completeness

This document includes **all 100 real branches** returned by GitHub branch listing at time of generation and categorizes each into one of the required domain tables: auth, catalog, orders, notifications, chef, customer, infra, or feature.
