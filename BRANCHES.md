# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branch count:** 99

This document is the branch inventory and merge handover reference for the Craves platform. It groups all currently observed branches into delivery domains and provides guidance on purpose, ownership, merge priority, and readiness.

## Branch naming convention

Observed naming styles in this repository:

- `agent/*` — autonomous or assisted implementation, fix, infra, and rollout branches
- `feature/*` — backend or product feature branches, usually production-facing or service-specific
- `feat/*` — frontend/UI/UX feature branches
- `backend-*` — backend feature branches with date suffixes
- `backup/*` — backup/snapshot branches, not intended for direct merge unless explicitly revived
- `build/*` — build or artifact branches
- `ci/*` — CI/CD and deployment gating changes
- `docs/*` — documentation and audit branches
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation branches
- unprefixed branches like `android-build`, `dispatch-craves-v4`, `do-not-use` — legacy, operational, or special-purpose branches

### Naming guidance

Preferred branch naming moving forward:

- Product/backend: `feature/<domain>-<capability>`
- Frontend/UI: `feat/<surface>-<capability>`
- Fixes: `agent/fix-<surface>-<issue>` or `fix/<surface>-<issue>`
- Infra/platform: `agent/<infra-change>`, `ci/<pipeline-change>`, `docs/<artifact>`

## Merge policy

1. **Merge target:** `main`
2. **Order of merge:** infra/platform fixes → auth/security → backend platform capabilities → customer/chef/admin UI → backups/docs only if intentionally needed
3. **Conflict handling:** prefer rebasing long-lived feature branches onto latest `main` before merge
4. **Validation required before merge:**
   - backend build and Flyway migration verification
   - frontend contract/API compatibility verification
   - auth/session flow smoke tests where applicable
   - payment/delivery/notification readiness checks for integration branches
5. **Avoid direct merge** for backup, throwaway, duplicate, or explicitly unsafe branches unless branch owner approves
6. **Squash merge recommended** for tactical fix branches; **regular merge** acceptable for major multi-commit feature streams where history matters

### Merge readiness legend

- **Ready** — appears purpose-built and likely merge-candidate pending normal review
- **Review** — likely valid, but needs code/QA/product review before merge
- **Validate** — likely operationally sensitive; requires environment or regression validation
- **Hold** — backup, duplicate, risky, or non-merge branch unless explicitly revived

### Priority legend

- **P0** — production stability, security, auth, payments, routing, delivery
- **P1** — core customer/order/catalog flows and major admin operations
- **P2** — UX improvements, discovery, operational enhancements
- **P3** — docs, backup, research, packaging, or lower urgency work

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC backend work for staff/admin authorization flows. | auth-service | Spring Boot, Security, JWT, Redis revocation, Flyway | P0 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up or expanded RBAC implementation for internal admin authorization. | auth-service | Spring Boot, Security, JWT, Redis revocation, Flyway | P0 | Review |
| feature/backend-admin-account-intervention | Backend account intervention capabilities for admin support actions on user accounts. | auth-service | Spring Boot, Security, admin APIs, audit, Flyway | P0 | Review |
| feature/admin-account-intervention-apim | API management/gateway exposure for admin account intervention endpoints. | auth-service / APIM | APIM, auth APIs, routing, policy | P1 | Validate |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows. | admin web / auth-service | Next.js, BFF, admin UI, auth integration | P1 | Review |
| feature/backend-redis-abuse-revocation | Hardening around abuse protection and token revocation infrastructure. | auth-service | Redis, Spring Security, JWT, abuse filters | P0 | Validate |
| agent/fix-backend-connected-signed-in-flows | Fixes authenticated user flow integration across frontend and backend. | auth-service / customer-web-next | Next.js, BFF, auth APIs, session handling | P0 | Validate |
| agent/fix-chef-entry-and-session-routing | Fixes chef-facing entry and session routing behavior. | auth-service / customer-web-next | Next.js routing, auth session, chef surface | P1 | Validate |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens discovery-first customer experience improvement. | catalog-service / customer-web-next | Catalog APIs, geospatial discovery, Next.js UI | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration of nearby discovery prioritization and UX. | catalog-service / customer-web-next | Catalog APIs, discovery ranking, Next.js UI | P1 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX improvements. | customer-web-next / catalog-service | Next.js App Router, BFF, UI components | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for landing/discovery structure. | customer-web-next | Next.js, semantic UI structure, content | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Refined landing page cleanup branch for improved discovery presentation. | customer-web-next | Next.js, UI components, landing UX | P2 | Review |
| feat/landing-reference-20260811 | Landing reference implementation branch. | customer-web-next | Next.js, design reference, static UX | P3 | Review |
| feat/landing-reference-refresh | Refresh of landing reference implementation. | customer-web-next | Next.js, UX refresh, static content | P3 | Review |
| agent/landing-body-07cm-inset | Landing page layout spacing/inset adjustment experiment. | customer-web-next | CSS/layout, frontend UX | P3 | Hold |
| agent/landing-body-11cm-inset | Alternate landing page spacing/inset adjustment experiment. | customer-web-next | CSS/layout, frontend UX | P3 | Hold |
| feature/advanced-search-smart-filters | Advanced search and smart filtering capabilities for catalog/discovery. | catalog-service / customer-web-next | Catalog search, filtering logic, BFF, UI | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved catalog items. | user-chef-service / catalog-service | Spring Boot APIs, JDBC, BFF integration | P1 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch likely spanning discovery and customer-chef journey improvements. | catalog-service / user-chef-service / web | Backend APIs, BFF, UX integration | P2 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Reorder capability for customers using prior order history. | order-service | Spring Boot, JDBC, order APIs, BFF | P1 | Review |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment UI/UX improvements. | customer-web-next / order-service / integration-service | Next.js, BFF, checkout APIs, payment flow | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI/UX branch. | customer-web-next / order-service | Next.js, BFF, order APIs, tracking UI | P1 | Review |
| agent/fix-chef-orders-and-customer-palette | Fixes chef order views and customer UI styling consistency. | order-service / customer-web-next | Next.js, BFF, chef orders, UI theme | P2 | Review |
| agent/fix-chef-registration-and-checkout-contract | Fixes contract alignment between chef registration and checkout flows. | user-chef-service / order-service / web | API contract, BFF, validation | P1 | Validate |
| agent/order-flyway-v14-checksum | Flyway checksum repair or migration alignment for order-service. | order-service | Flyway, database migration, backend ops | P0 | Validate |
| feature/backend-launch-policy-enforcement | Launch policy enforcement affecting checkout/order release controls. | order-service | Spring Boot, policy enforcement, admin config | P0 | Review |
| feature/backend-production-readiness-completion | Backend production-readiness completion branch likely covering order and platform hardening. | order-service / integration-service / platform | Spring Boot, ops hardening, readiness checks | P0 | Validate |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-grade notification delivery pipeline hardening. | notification-service | Spring Boot, worker delivery, email/push adapters | P0 | Validate |
| feature/backend-notification-recovery-operations | Recovery workflows for notification failures and replay operations. | notification-service | Spring Boot, admin recovery APIs, repositories | P1 | Review |
| feature/admin-notification-recovery-apim | APIM exposure/policy branch for notification recovery admin endpoints. | notification-service / APIM | APIM, admin APIs, routing | P1 | Validate |
| feature/admin-notification-recovery-web | Admin UI for notification recovery operations. | admin web / notification-service | Next.js, admin BFF, recovery screens | P1 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/chef-complete-uiux | Comprehensive chef UI/UX implementation for chef workflows. | customer-web-next / chef surfaces | Next.js, BFF, chef pages, UI components | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared customer-chef UI foundation branch. | customer-web-next | Next.js, shared UI patterns, layout foundation | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow for application approvals/rejections. | user-chef-service / admin web | Spring Boot, admin APIs, Next.js admin UI | P1 | Review |
| feature/backend-chef-financial-ledger | Backend chef earnings/financial ledger implementation. | integration-service | Spring Boot, financial ledger, payments, admin APIs | P1 | Review |
| agent/unify-chef-panel-customer-ui | Unifies chef panel and customer UI shell/design language. | customer-web-next | Next.js, shared shell, route composition | P2 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Customer web UI connected to live backend/BFF flows. | customer-web-next | Next.js App Router, BFF, API integration | P1 | Review |
| feature/address-final-work | Address flow completion branch for customer addresses. | user-chef-service / customer-web-next | Azure Maps, address APIs, Next.js forms | P1 | Review |
| feature/address-final-work-2 | Follow-up branch for address flow completion. | user-chef-service / customer-web-next | Azure Maps, address APIs, BFF | P2 | Hold |
| feature/address-final-work-3 | Further address flow iteration branch. | user-chef-service / customer-web-next | Azure Maps, address APIs, BFF | P2 | Hold |
| feature/address-final-work-4 | Additional address flow iteration branch. | user-chef-service / customer-web-next | Azure Maps, address APIs, BFF | P2 | Hold |
| feature/azure-maps-address-autofill | Address autofill using Azure Maps recommendation/geocoding flows. | user-chef-service / customer-web-next | Azure Maps, Next.js, BFF, location APIs | P1 | Review |
| agent/fix-full-frontend-backend-integration | End-to-end integration fixes across customer-facing frontend and backend contracts. | customer-web-next / platform services | Next.js, BFF, API integration, contract alignment | P0 | Validate |
| backup/customer-web-before-landing-v2-20260808 | Backup branch preserving customer web state prior to landing v2 work. | customer-web-next | Snapshot/backup | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup branch for mobile/customer UI before refinement changes. | mobile / frontend | Snapshot/backup | P3 | Hold |
| android-build | Android/mobile build branch. | mobile app | Android build tooling, packaging | P3 | Review |
| build/qa-mobile-apk-2026-08-20 | QA build branch for mobile APK generation. | mobile app / CI | Build pipeline, APK packaging | P3 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fixes APIM or gateway domain configuration. | platform / APIM | Azure APIM, routing, domains, DNS | P0 | Validate |
| agent/disable-afd-edge-compression | Disables Azure Front Door edge compression to fix delivery behavior. | platform edge | Azure Front Door, CDN rules, compression | P0 | Validate |
| agent/disable-origin-gzip-for-cold-loading | Disables origin gzip to address cold loading issues. | platform edge | CDN/origin config, compression, delivery | P0 | Validate |
| agent/fix-cold-device-static-loading | Fixes static asset loading for cold devices/sessions. | platform frontend delivery | Static asset delivery, CDN/cache, frontend | P1 | Validate |
| agent/fix-customer-web-proxy-origin | Fixes proxy origin configuration for customer web. | platform / web infra | Reverse proxy, origin routing, web delivery | P1 | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix related to CLI/rule issue 288. | platform edge | Azure Front Door, cache rules, automation | P0 | Validate |
| agent/fix-front-door-cli-288 | Fixes Front Door provisioning/config issue tracked as CLI-288. | platform edge | Azure Front Door, infra automation | P0 | Validate |
| agent/fix-front-door-gzip-cache-bypass | Fixes gzip and cache bypass interplay at Front Door. | platform edge | Azure Front Door, cache policy, compression | P0 | Validate |
| agent/fix-front-door-gzip-rule-validation | Validates and fixes Front Door gzip rule configuration. | platform edge | Azure Front Door, rules engine | P0 | Validate |
| agent/fix-front-door-secret-rest | Fixes Front Door secret or REST configuration issue. | platform edge | Secrets, APIM/Front Door config, automation | P0 | Validate |
| agent/fix-front-door-security-policy-cli-288 | Security policy fix for Front Door under CLI-288 effort. | platform security edge | Azure Front Door, WAF/security policies | P0 | Validate |
| agent/fix-static-gzip-cold-loading | Static gzip behavior fix for cold-loading issues. | platform frontend delivery | Static hosting, gzip, CDN | P1 | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalizes empty Front Door cache configuration under CLI-288 workstream. | platform edge | Azure Front Door, cache config | P1 | Validate |
| agent/parallel-front-door-domain-provisioning | Improves parallelization of Front Door custom domain provisioning. | platform edge | Azure Front Door, provisioning automation | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserves Front Door custom domain and WAF association during changes. | platform edge/security | Azure Front Door, WAF, domain management | P0 | Validate |
| agent/fix-chef-release-traffic-verification | Release traffic verification for chef rollout paths. | platform release / chef web | Routing, release validation, traffic checks | P1 | Validate |
| agent/razorpay-payment-switch | Payment provider switching work toward Razorpay routing. | integration-service | Payment orchestration, provider adapters, BFF | P0 | Validate |
| feature/backend-cashfree-production-hardening | Cashfree production hardening work for payment reliability. | integration-service | Payments, webhook handling, backend hardening | P0 | Validate |
| feature/backend-delivery-provider-production-readiness | Delivery provider production-readiness hardening and validation. | integration-service | Delivery adapters, orchestration, readiness APIs | P0 | Validate |
| feature/backend-refund-production-readiness | Refund production readiness and recovery hardening. | integration-service | Refund workflows, payment status, admin ops | P0 | Validate |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout branch for production payment readiness wrap-up. | integration-service | Payment provider integration, readiness, reconciliation | P1 | Validate |
| ci/subscription-service-predeploy-gate | CI gate before subscription-service deployment. | subscription-service / CI | CI pipeline, deployment checks | P1 | Review |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | platform docs | Documentation, release audit | P3 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Likely scratch or accidental branch; not recommended for merge without owner confirmation. | unknown | Unknown / misc | P3 | Hold |
| bkup-placeholder | _No branch with this name exists; omitted._ | - | - | - | - |
| copilot/research-task-repository-analysis | AI-assisted repository analysis/research branch. | docs / research | Documentation, analysis | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | Cross-domain backend journey work spanning customer and chef flows. | multi-service | Backend APIs, BFF, UX integration | P2 | Review |
| craves-master-guide-v1 | Master guide or documentation/reference branch. | docs | Documentation | P3 | Review |
| craves-v5-patch-repack | Packaging or repack branch for release artifact/version patching. | release engineering | Packaging, release prep | P3 | Hold |
| dispatch-craves-v4 | Dispatch or workflow trigger branch for v4 process. | ops/release | Dispatch automation, release ops | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch automation branch tied to issue trigger. | ops/release | Automation | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch automation branch tied to reopen trigger. | ops/release | Automation | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch run branch variant. | ops/release | Automation | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch run branch variant. | ops/release | Automation | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch. | ops/release | Automation, scheduling | P3 | Hold |
| do-not-use | Explicitly marked unsafe/non-merge branch. | unknown | Misc | P3 | Hold |
| feat/customer-chef-uiux-foundation | Foundational UI branch spanning customer and chef surfaces. | customer-web-next | Next.js, shared UI | P2 | Review |
| feature/admin-control-center-global-search | Global admin search across directory/ops surfaces. | user-chef-service / admin web | Admin search API, Next.js admin UI | P1 | Review |
| feature/admin-customer-360-document-review | Admin customer 360 and document review experience. | user-chef-service / admin web | Admin APIs, document review, BFF, UI | P1 | Review |
| feature/admin-dashboard-v2 | New version of admin dashboard summary and operational surfaces. | order-service / admin web | Admin APIs, dashboard UI, BFF | P1 | Review |
| feature/admin-operational-investigations-apim | APIM branch for operational investigation APIs. | order-service / integration-service / APIM | APIM, admin APIs, routing | P1 | Validate |
| feature/admin-operational-investigations-web | Admin web experience for operational investigations. | admin web | Next.js, admin BFF, investigation UI | P1 | Review |
| feature/admin-subscription-operations | Admin operations surface for subscriptions. | subscription-service / admin web | Spring Boot, admin APIs, Next.js | P1 | Review |
| feature/admin-subscription-plans | Admin management of subscription plans. | subscription-service / admin web | Subscription APIs, admin UI | P1 | Review |
| feature/admin-web-operations-shell | Admin operations shell/layout branch. | admin web | Next.js shell, navigation, UI framework | P2 | Review |
| feature/admin-web-shell | Base admin shell/layout branch. | admin web | Next.js shell, navigation, UI framework | P2 | Review |
| feature/backend-admin-investigation-apis | Backend investigation APIs for admin operations. | order-service / integration-service | Spring Boot, admin APIs, audit, JDBC | P1 | Review |
| feature/backend-admin-operations-audit | Backend audit trail and operational review support. | order-service / integration-service | Audit logging, admin APIs, backend ops | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation. | subscription-service | Billing services, payment state, Flyway, Spring Boot | P1 | Review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation workflow. | subscription-service | Schedulers, occurrence generation, backend services | P1 | Review |
| feature/backend-subscription-order-fulfillment | Internal order dispatch/fulfillment for subscriptions. | subscription-service / order-service | Internal APIs, occurrence order bridge, backend orchestration | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and management. | integration-service / subscription-service | Payment intents, backend APIs, provider integration | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Payment status consumer for subscription lifecycle progression. | subscription-service / integration-service | Service Bus/consumer, payment reconciliation | P1 | Review |
| feature/backend-subscription-plan-schedules | Backend support for plan schedules and public/private schedule management. | subscription-service | Scheduling APIs, policy, backend services | P1 | Review |

---

## Full observed branch list

For audit completeness, here is the full real branch list retrieved from GitHub on 2026-08-26:

1. accidental-ignore-7
2. agent/apim-gateway-domain-fix
3. agent/backend-completion-guarded-release
4. agent/backend-internal-admin-rbac
5. agent/customer-web-connected-ui
6. agent/disable-afd-edge-compression
7. agent/disable-origin-gzip-for-cold-loading
8. agent/fix-backend-connected-signed-in-flows
9. agent/fix-chef-entry-and-session-routing
10. agent/fix-chef-orders-and-customer-palette
11. agent/fix-chef-registration-and-checkout-contract
12. agent/fix-chef-release-traffic-verification
13. agent/fix-cold-device-static-loading
14. agent/fix-customer-web-proxy-origin
15. agent/fix-front-door-cache-validation-cli-288
16. agent/fix-front-door-cli-288
17. agent/fix-front-door-gzip-cache-bypass
18. agent/fix-front-door-gzip-rule-validation
19. agent/fix-front-door-secret-rest
20. agent/fix-front-door-security-policy-cli-288
21. agent/fix-full-frontend-backend-integration
22. agent/fix-static-gzip-cold-loading
23. agent/landing-body-07cm-inset
24. agent/landing-body-11cm-inset
25. agent/nearby-kitchens-first-discovery
26. agent/nearby-kitchens-first-discovery-v2
27. agent/normalize-empty-front-door-cache-cli-288
28. agent/order-flyway-v14-checksum
29. agent/parallel-front-door-domain-provisioning
30. agent/preserve-afd-custom-domain-waf
31. agent/razorpay-payment-switch
32. agent/unify-chef-panel-customer-ui
33. android-build
34. backend-customer-favorites-20260816
35. backend-customer-reorder-20260816
36. backup/customer-web-before-landing-v2-20260808
37. backup/mobile-ui-before-home-refinement-2026-08-16
38. build/qa-mobile-apk-2026-08-20
39. chatgpt/backend-customer-chef-journey-20260819
40. ci/subscription-service-predeploy-gate
41. copilot/research-task-repository-analysis
42. craves-master-guide-v1
43. craves-v5-patch-repack
44. dispatch-craves-v4-issue-trigger
45. dispatch-craves-v4-reopen-trigger
46. dispatch-craves-v4-run-2
47. dispatch-craves-v4-run-3
48. dispatch-craves-v4-schedule
49. dispatch-craves-v4
50. do-not-use
51. docs/production-release-audit-20260821
52. feat/chef-complete-uiux
53. feat/customer-cart-checkout-payment-uiux
54. feat/customer-chef-uiux-foundation
55. feat/customer-landing-discovery-uiux
56. feat/customer-landing-v2-clean-20260808
57. feat/customer-orders-tracking-uiux
58. feat/customer-web-semantic-reference-landing
59. feat/landing-reference-20260811
60. feat/landing-reference-refresh
61. feature/address-final-work
62. feature/address-final-work-2
63. feature/address-final-work-3
64. feature/address-final-work-4
65. feature/admin-account-intervention-apim
66. feature/admin-account-intervention-web
67. feature/admin-chef-review
68. feature/admin-control-center-global-search
69. feature/admin-customer-360-document-review
70. feature/admin-dashboard-v2
71. feature/admin-notification-recovery-apim
72. feature/admin-notification-recovery-web
73. feature/admin-operational-investigations-apim
74. feature/admin-operational-investigations-web
75. feature/admin-subscription-operations
76. feature/admin-subscription-plans
77. feature/admin-web-operations-shell
78. feature/admin-web-shell
79. feature/advanced-search-smart-filters
80. feature/azure-maps-address-autofill
81. feature/backend-admin-account-intervention
82. feature/backend-admin-investigation-apis
83. feature/backend-admin-operations-audit
84. feature/backend-cashfree-production-hardening
85. feature/backend-chef-financial-ledger
86. feature/backend-delivery-provider-production-readiness
87. feature/backend-internal-admin-rbac-v2
88. feature/backend-launch-policy-enforcement
89. feature/backend-notification-production-delivery
90. feature/backend-notification-recovery-operations
91. feature/backend-production-readiness-completion
92. feature/backend-redis-abuse-revocation
93. feature/backend-refund-production-readiness
94. feature/backend-subscription-billing-lifecycle
95. feature/backend-subscription-occurrence-generator
96. feature/backend-subscription-order-fulfillment
97. feature/backend-subscription-payment-intents
98. feature/backend-subscription-payment-status-consumer
99. feature/backend-subscription-plan-schedules
100. feature/cashfree-production-closeout-20260815

## Merge sequencing recommendation

Recommended merge batches:

1. **Platform stability batch**
   - all `agent/fix-front-door*`
   - `agent/apim-gateway-domain-fix`
   - `agent/disable-*`
   - `agent/preserve-afd-custom-domain-waf`
   - `agent/fix-customer-web-proxy-origin`

2. **Auth and security batch**
   - `agent/backend-internal-admin-rbac`
   - `feature/backend-internal-admin-rbac-v2`
   - `feature/backend-admin-account-intervention`
   - `feature/admin-account-intervention-apim`
   - `feature/admin-account-intervention-web`
   - `feature/backend-redis-abuse-revocation`

3. **Payments, delivery, and notification hardening batch**
   - `agent/razorpay-payment-switch`
   - `feature/backend-cashfree-production-hardening`
   - `feature/backend-delivery-provider-production-readiness`
   - `feature/backend-refund-production-readiness`
   - `feature/backend-notification-production-delivery`
   - `feature/backend-notification-recovery-operations`

4. **Core product flows batch**
   - reorder, favorites, address, discovery, checkout, tracking, chef review, chef ledger

5. **Admin operations batch**
   - dashboard, search, investigations, subscription operations, web shells

6. **Backups/docs/dispatch branches**
   - keep unmerged unless there is a deliberate operational need
