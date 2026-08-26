# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branches:** 100

This document is the branch inventory and merge handover for the Craves platform. It lists every currently visible branch in the repository, groups them by domain, and provides practical merge guidance for moving changes safely into `main`.

---

## Branch naming convention

Observed branch families in this repository:

- `feature/*` — production feature branches, usually service-specific or cross-cutting delivery work
- `feat/*` — UI/UX and product-facing feature work, primarily customer/chef/admin web experience
- `agent/*` — agent-driven integration, bug-fix, infrastructure, and release-hardening branches
- `backend-*` — backend feature implementations delivered outside the `feature/*` namespace
- `backup/*` — temporary safety backups before refactors
- `build/*` — build/package artifacts or QA packaging work
- `ci/*` — delivery pipeline and gating changes
- `docs/*` — documentation and audit branches
- `dispatch-*` — dispatch/release automation or trigger branches
- unprefixed branches — legacy, utility, Android, or special-purpose lines of work

### Recommended interpretation

- Prefer merging `feature/*`, `feat/*`, `backend-*`, and selected `agent/*` branches after validation.
- Treat `backup/*`, `dispatch-*`, `do-not-use`, and `accidental-*` branches as non-mergeable unless explicitly required.
- Review `agent/*` branches carefully because many are environment, networking, Front Door, APIM, routing, or release fix branches rather than end-user features.

---

## Merge policy

### Default merge order

1. **Infra and platform safety branches first**
   - APIM, Front Door, cache, compression, proxy, release-readiness, CI gates
2. **Backend platform branches next**
   - auth, notification, subscription, payment, readiness, admin APIs
3. **Core product backend branches**
   - customer profile, favorites, reorder, discovery, chef workflow
4. **Web and experience branches**
   - landing, customer, chef, admin shells and connected UI
5. **Operational/docs branches last**
   - audits, guides, backup references

### Merge guardrails

- Rebase or merge from latest `main` before opening final PR.
- Validate Flyway migration ordering per service before merging backend branches.
- For branches touching payment, auth, subscription, or notification delivery, require smoke tests plus rollback notes.
- For branches with overlapping domains, merge the deeper backend/API branch before the corresponding web/APIM branch.
- Avoid merging backup, dispatch, accidental, and placeholder utility branches into `main`.

### Merge readiness scale used below

- **Ready** — can be prioritised for PR review; appears purposeful and mergeable with standard checks
- **Review** — likely valid branch but needs code review, integration verification, or dependency sequencing
- **Hold** — preserve branch, but do not merge yet; usually backup/dispatch/utility/risky branch
- **Caution** — environment or infrastructure fix branch; merge only with deployment validation

### Priority scale used below

- **P0** — production-critical or release-blocking
- **P1** — high-value feature or platform capability
- **P2** — useful enhancement or dependent workstream
- **P3** — low-priority, backup, exploratory, or operational reference

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation or fix path for protected admin capabilities. | auth-service | Backend, Security, RBAC, Internal APIs | P1 | Review |
| feature/admin-account-intervention-apim | APIM surface for admin account intervention flows. | auth-service | APIM, API contract, Security | P1 | Review |
| feature/admin-account-intervention-web | Admin web experience for locking, disabling, or intervening on accounts. | customer-web-next / admin | Frontend, BFF, Admin UI | P1 | Review |
| feature/backend-admin-account-intervention | Backend account intervention support, likely auth admin controls and audit. | auth-service | Backend, Security, Admin APIs, Persistence | P1 | Review |
| feature/backend-internal-admin-rbac-v2 | Second-pass internal admin RBAC hardening and role management. | auth-service | Backend, Security, RBAC, Internal APIs | P1 | Review |
| feature/backend-redis-abuse-revocation | Redis-backed token abuse protection and revocation improvements. | auth-service | Backend, Security, Redis, JWT | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Nearby kitchens first discovery experience, aligned with location-aware catalog browsing. | catalog-service / customer-web-next | Backend, Discovery, Frontend, BFF | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Refined version of nearby-first discovery, likely iteration over ranking or UX flow. | catalog-service / customer-web-next | Backend, Discovery, Frontend, BFF | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved items. | user-chef-service / catalog-service | Backend, APIs, Persistence | P1 | Ready |
| feature/advanced-search-smart-filters | Advanced search and smart filter capability; strategist-aligned search enhancement branch. | catalog-service / customer-web-next | Backend, Search, Discovery, Frontend, BFF | P1 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/order-flyway-v14-checksum | Order-service Flyway checksum repair for migration integrity. | order-service | Backend, Database, Flyway | P0 | Caution |
| backend-customer-reorder-20260816 | Repeat order or reorder flow for customers. | order-service | Backend, APIs, Order domain | P1 | Ready |
| feature/backend-launch-policy-enforcement | Launch policy enforcement around order or release eligibility gates. | order-service | Backend, Policy, AOP, APIs | P1 | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM layer for admin recovery operations on notifications. | notification-service / APIM | APIM, Admin APIs, Operations | P1 | Review |
| feature/admin-notification-recovery-web | Admin web tooling for notification recovery workflows. | customer-web-next / admin | Frontend, BFF, Admin UI | P1 | Review |
| feature/backend-notification-production-delivery | Production-grade delivery improvements for notification dispatch. | notification-service | Backend, Workers, Delivery adapters, Persistence | P0 | Ready |
| feature/backend-notification-recovery-operations | Recovery, replay, and operator workflows for failed notification delivery. | notification-service | Backend, Operations, Workers, Admin APIs | P1 | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fixes chef entry routing, auth/session pathing, or dashboard handoff. | customer-web-next / auth-service | Frontend, Routing, Session, BFF | P1 | Review |
| agent/fix-chef-orders-and-customer-palette | Fixes chef order workflows and shared UI palette styling. | customer-web-next | Frontend, UX, Orders UI | P2 | Review |
| agent/fix-chef-registration-and-checkout-contract | Fixes contract mismatches around chef registration and checkout integration. | user-chef-service / customer-web-next | Backend, BFF, API contracts, Frontend | P1 | Review |
| agent/fix-chef-release-traffic-verification | Release verification branch for chef traffic/routing rollout. | Infra / customer-web-next | Infra, Routing, Validation | P1 | Caution |
| agent/unify-chef-panel-customer-ui | Unifies chef panel and customer-facing UI system. | customer-web-next | Frontend, Design system, Navigation | P2 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | Backend support for broader customer-chef lifecycle journey. | user-chef-service / order-service | Backend, APIs, Workflow | P1 | Review |
| feat/chef-complete-uiux | Full chef UI/UX pass across chef workflows. | customer-web-next | Frontend, UX, App Router, Components | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared customer-chef UI foundation and component baseline. | customer-web-next | Frontend, Design system, Components | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow for applications and evidence handling. | user-chef-service / customer-web-next | Backend, Frontend, Admin UI, APIs | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger and payout accounting support. | integration-service | Backend, Payments, Ledger, Persistence | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connects customer web UI to live backend/BFF contracts. | customer-web-next | Frontend, BFF, Integration | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Fixes authenticated customer flows once frontend is connected to backend. | auth-service / customer-web-next | Backend, Frontend, Session, BFF | P1 | Review |
| agent/fix-full-frontend-backend-integration | End-to-end integration fix branch across frontend and backend contracts. | customer-web-next / multiple services | Frontend, Backend, BFF, Integration | P0 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX work. | customer-web-next | Frontend, Checkout, Payments UI, BFF | P1 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery experience refresh. | customer-web-next | Frontend, Discovery UI, Components | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 implementation branch. | customer-web-next | Frontend, Landing page, Components | P2 | Review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI/UX work. | customer-web-next | Frontend, Orders UI, Tracking UI | P1 | Review |
| feat/customer-web-semantic-reference-landing | Semantic or SEO-aware landing implementation for web. | customer-web-next | Frontend, SEO, Content, Components | P2 | Review |
| feature/address-final-work | Final address workflow implementation iteration 1. | user-chef-service / customer-web-next | Backend, Frontend, Address APIs, BFF | P1 | Review |
| feature/address-final-work-2 | Final address workflow implementation iteration 2. | user-chef-service / customer-web-next | Backend, Frontend, Address APIs, BFF | P1 | Review |
| feature/address-final-work-3 | Final address workflow implementation iteration 3. | user-chef-service / customer-web-next | Backend, Frontend, Address APIs, BFF | P1 | Review |
| feature/address-final-work-4 | Final address workflow implementation iteration 4. | user-chef-service / customer-web-next | Backend, Frontend, Address APIs, BFF | P1 | Review |
| feature/azure-maps-address-autofill | Address autofill and recommendation using Azure Maps. | user-chef-service / customer-web-next | Backend, Maps integration, Frontend, BFF | P1 | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or temporary utility branch; no clear product intent. | Repository-wide | Git hygiene, Utility | P3 | Hold |
| agent/apim-gateway-domain-fix | APIM gateway domain configuration fix. | Infrastructure / APIM | Infra, Networking, APIM | P0 | Caution |
| agent/backend-completion-guarded-release | Release hardening gate for backend completion criteria. | Multi-service platform | Backend, Release process, Validation | P0 | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery issues. | Infrastructure / Front Door | Infra, CDN, Edge config | P0 | Caution |
| agent/disable-origin-gzip-for-cold-loading | Disable gzip at origin to solve cold-loading/static asset issues. | Infrastructure / Frontend delivery | Infra, CDN, Caching, Static delivery | P0 | Caution |
| agent/fix-cold-device-static-loading | Fix cold-device static asset loading behavior. | Infrastructure / customer-web-next | Infra, Frontend delivery, Caching | P0 | Caution |
| agent/fix-customer-web-proxy-origin | Fix reverse proxy origin configuration for customer web. | Infrastructure / customer-web-next | Infra, Proxy, Networking | P0 | Caution |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix likely tied to CLI/API validation issue 288. | Infrastructure / Front Door | Infra, CDN, Validation | P0 | Caution |
| agent/fix-front-door-cli-288 | General Front Door fix branch for CLI issue 288. | Infrastructure / Front Door | Infra, Networking, Delivery | P0 | Caution |
| agent/fix-front-door-gzip-cache-bypass | Bypass gzip caching behavior in Front Door. | Infrastructure / Front Door | Infra, CDN, Compression | P0 | Caution |
| agent/fix-front-door-gzip-rule-validation | Front Door gzip rule validation repair. | Infrastructure / Front Door | Infra, CDN, Rules engine | P0 | Caution |
| agent/fix-front-door-secret-rest | Fix secret/REST handling for Front Door or APIM integration. | Infrastructure | Infra, Secrets, API gateway | P0 | Caution |
| agent/fix-front-door-security-policy-cli-288 | Front Door security policy validation fix. | Infrastructure / Security | Infra, WAF, Security policy | P0 | Caution |
| agent/fix-static-gzip-cold-loading | Static gzip cold-load remediation. | Infrastructure / customer-web-next | Infra, CDN, Static delivery | P0 | Caution |
| agent/normalize-empty-front-door-cache-cli-288 | Normalization fix for empty cache config in Front Door. | Infrastructure / Front Door | Infra, CDN, Validation | P1 | Caution |
| agent/parallel-front-door-domain-provisioning | Parallelized or corrected Front Door domain provisioning. | Infrastructure / Front Door | Infra, Domains, Automation | P1 | Caution |
| agent/preserve-afd-custom-domain-waf | Preserve Front Door custom domain and WAF settings during updates. | Infrastructure / Security | Infra, WAF, Domains | P0 | Caution |
| android-build | Android packaging or mobile build branch. | Mobile / build system | Mobile, Build, Packaging | P2 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 refactor. | customer-web-next | Backup, Frontend | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile UI refinement. | Mobile / frontend | Backup, Mobile UI | P3 | Hold |
| build/qa-mobile-apk-2026-08-20 | QA APK packaging/build branch. | Mobile / CI | Build, QA, Packaging | P2 | Review |
| ci/subscription-service-predeploy-gate | CI/predeploy quality gate for subscription service rollout. | subscription-service / CI | CI, Deployment, Validation | P0 | Ready |
| copilot/research-task-repository-analysis | Analysis or research branch; not intended as shipping code. | Repository-wide | Docs, Analysis | P3 | Hold |
| craves-master-guide-v1 | Guide/reference branch, likely documentation or repo guide asset. | Repository-wide | Docs, Reference | P3 | Hold |
| craves-v5-patch-repack | Packaging or repack branch for a patch release. | Release engineering | Release, Packaging | P2 | Review |
| dispatch-craves-v4 | Dispatch automation/release branch. | Release engineering | Automation, Release | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue-trigger branch. | Release engineering | Automation, GitHub workflow | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen-trigger branch. | Release engineering | Automation, GitHub workflow | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch run branch iteration 2. | Release engineering | Automation, Release | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch run branch iteration 3. | Release engineering | Automation, Release | P3 | Hold |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch. | Release engineering | Automation, Scheduling | P3 | Hold |
| do-not-use | Explicitly non-merge branch. | Repository-wide | Utility | P3 | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | Repository-wide | Docs, Audit, Operations | P2 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/landing-body-07cm-inset | Landing page layout adjustment variant. | customer-web-next | Frontend, Styling, UX | P3 | Review |
| agent/landing-body-11cm-inset | Alternate landing page layout adjustment variant. | customer-web-next | Frontend, Styling, UX | P3 | Review |
| agent/razorpay-payment-switch | Payment gateway switching or routing to Razorpay. | integration-service / customer-web-next | Backend, Payments, Frontend, Integration | P1 | Review |
| feat/landing-reference-20260811 | Landing reference branch for design/content comparison. | customer-web-next | Frontend, Reference, UX | P3 | Review |
| feat/landing-reference-refresh | Refreshed landing reference implementation. | customer-web-next | Frontend, Reference, UX | P3 | Review |
| feature/admin-control-center-global-search | Admin control-center search across operational domains. | customer-web-next / backend admin APIs | Frontend, Backend, Search, Admin | P1 | Review |
| feature/admin-customer-360-document-review | Customer 360 admin workflow with document review support. | user-chef-service / customer-web-next | Backend, Frontend, Admin APIs, Review workflow | P1 | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard and summary workflows. | customer-web-next / order-service | Frontend, Backend, Dashboard, BFF | P1 | Review |
| feature/admin-operational-investigations-apim | APIM support for operational investigations. | order-service / integration-service / APIM | APIM, Admin APIs, Operations | P1 | Review |
| feature/admin-operational-investigations-web | Admin operational investigations web UI. | customer-web-next / admin | Frontend, BFF, Admin UI | P1 | Review |
| feature/admin-subscription-operations | Admin workflows for subscription operations and exception handling. | subscription-service / customer-web-next | Backend, Frontend, Admin APIs, Operations | P1 | Review |
| feature/admin-subscription-plans | Admin plan management for subscriptions. | subscription-service / customer-web-next | Backend, Frontend, Admin APIs | P1 | Ready |
| feature/admin-web-operations-shell | Admin operations shell and navigation container. | customer-web-next | Frontend, Shell, Navigation | P2 | Review |
| feature/admin-web-shell | Base admin shell and layout framework. | customer-web-next | Frontend, Shell, Navigation | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations. | order-service / integration-service | Backend, Admin APIs, Audit | P1 | Ready |
| feature/backend-admin-operations-audit | Operational audit logging and backend visibility. | multiple backend services | Backend, Audit, Persistence, Admin APIs | P1 | Ready |
| feature/backend-cashfree-production-hardening | Cashfree production hardening and readiness improvements. | integration-service | Backend, Payments, Webhooks, Operations | P0 | Ready |
| feature/backend-delivery-provider-production-readiness | Delivery provider production readiness and operational diagnostics. | integration-service | Backend, Delivery, Admin APIs, Readiness | P0 | Ready |
| feature/backend-production-readiness-completion | Final backend production-readiness sweep across services. | Multi-service backend | Backend, Ops, Readiness, Validation | P0 | Review |
| feature/backend-refund-production-readiness | Refund processing production readiness and operational robustness. | integration-service / order-service | Backend, Refunds, Workers, Operations | P0 | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation. | subscription-service | Backend, Billing, Workers, Persistence | P1 | Ready |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation engine and scheduling. | subscription-service | Backend, Scheduling, Workers, Persistence | P1 | Ready |
| feature/backend-subscription-order-fulfillment | Bridge from subscription occurrences into order fulfillment. | subscription-service / order-service | Backend, Integration, Workers, Order flow | P1 | Ready |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and payment orchestration hooks. | integration-service / subscription-service | Backend, Payments, APIs, Persistence | P1 | Ready |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events. | subscription-service | Backend, Event processing, Workers | P1 | Ready |
| feature/backend-subscription-plan-schedules | Plan schedule modeling and management for subscriptions. | subscription-service | Backend, Scheduling, APIs, Persistence | P1 | Ready |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout or release close branch for payment production readiness. | integration-service | Backend, Payments, Ops, Release | P1 | Review |

---

## Full branch inventory

For quick auditing, here is the complete branch list exactly as discovered:

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

---

## Suggested merge waves

### Wave 1 — production blockers and infra safety
- agent/apim-gateway-domain-fix
- agent/disable-afd-edge-compression
- agent/disable-origin-gzip-for-cold-loading
- agent/fix-customer-web-proxy-origin
- agent/fix-front-door-cli-288
- agent/fix-front-door-cache-validation-cli-288
- agent/fix-front-door-gzip-cache-bypass
- agent/fix-front-door-gzip-rule-validation
- agent/fix-front-door-security-policy-cli-288
- agent/fix-static-gzip-cold-loading
- feature/backend-cashfree-production-hardening
- feature/backend-delivery-provider-production-readiness
- feature/backend-refund-production-readiness
- feature/backend-redis-abuse-revocation
- ci/subscription-service-predeploy-gate

### Wave 2 — backend operational maturity
- feature/backend-admin-account-intervention
- feature/backend-admin-investigation-apis
- feature/backend-admin-operations-audit
- feature/backend-notification-production-delivery
- feature/backend-notification-recovery-operations
- feature/backend-launch-policy-enforcement
- feature/backend-production-readiness-completion
- feature/backend-chef-financial-ledger

### Wave 3 — subscription platform
- feature/backend-subscription-billing-lifecycle
- feature/backend-subscription-occurrence-generator
- feature/backend-subscription-order-fulfillment
- feature/backend-subscription-payment-intents
- feature/backend-subscription-payment-status-consumer
- feature/backend-subscription-plan-schedules
- feature/admin-subscription-plans
- feature/admin-subscription-operations

### Wave 4 — customer and chef experience
- backend-customer-favorites-20260816
- backend-customer-reorder-20260816
- feature/advanced-search-smart-filters
- feature/azure-maps-address-autofill
- feature/admin-chef-review
- feat/customer-cart-checkout-payment-uiux
- feat/customer-orders-tracking-uiux
- feat/chef-complete-uiux
- agent/customer-web-connected-ui
- agent/fix-full-frontend-backend-integration

### Wave 5 — admin shell and product polish
- feature/admin-web-shell
- feature/admin-web-operations-shell
- feature/admin-dashboard-v2
- feature/admin-control-center-global-search
- feature/admin-customer-360-document-review
- feature/admin-account-intervention-web
- feature/admin-notification-recovery-web
- feature/admin-operational-investigations-web

### Do not merge by default
- accidental-ignore-7
- do-not-use
- backup/*
- dispatch-*
- copilot/research-task-repository-analysis
- craves-master-guide-v1

---

## Notes

- This inventory is based on the live branch list retrieved from GitHub on 2026-08-26.
- Purpose statements are inferred from real branch names and confirmed repository service structure.
- Where a branch spans multiple layers, the dominant owning service is listed first and supporting layers are captured in `Tech layers`.
- If the team wants stricter merge sequencing, the next step should be to map each branch head SHA to changed files and PR status.
