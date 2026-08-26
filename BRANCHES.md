# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branch count:** 100

This document is the branch inventory and merge handover for the Craves Build Platform repository. It uses the real branch list currently returned by GitHub for this repository and categorises branches by product or platform domain to help the team review, prioritise, and merge work into `main`.

> Note: This inventory reflects the fetched branch set returned by GitHub from the requested branch listing. The current fetched total is **100** branches.

---

## Branch naming convention

The repository currently uses multiple branch naming patterns:

- `main` / long-lived trunk branch for production-ready integration
- `feature/*` for backend, admin, infra-adjacent, and product feature work
- `feat/*` for UI/UX and frontend feature streams
- `agent/*` for autonomous agent implementation, fixes, rollout, and environment remediation work
- `backend-*` for targeted backend implementation branches
- `backup/*` for restore points or rollback-safe snapshots
- `build/*` for build artifacts and packaging flows
- `ci/*` for CI/CD gating and pipeline controls
- `docs/*` for documentation and audit-oriented changes
- `chatgpt/*`, `copilot/*` for AI-assisted exploratory or implementation work
- `dispatch-*` for automation/dispatch trigger lines
- miscellaneous branches such as `android-build`, `do-not-use`, `accidental-ignore-7`, and release utility branches

### Recommended interpretation

- Prefer merging **service-complete feature branches** before UI polish branches that depend on them.
- Treat `backup/*`, `dispatch-*`, `do-not-use`, and `accidental-*` branches as **non-mergeable unless explicitly reviewed**.
- Treat `agent/*` branches as **task-focused branches** that often contain hotfixes, infra remediations, or cross-stack integration work.

---

## Merge policy

### Standard merge order

1. **Infra and platform safety branches**
   - Front Door, APIM, compression, routing, cache, release gating
2. **Backend contract and service branches**
   - auth, catalog, orders, notifications, chef/customer domain, subscriptions, integration
3. **Frontend/BFF branches**
   - customer web, chef web, admin web, landing/discovery, checkout, tracking
4. **Documentation and audit branches**
   - production audit and operational handover docs
5. **Utility / backup / dispatch branches**
   - merge only if a human reviewer confirms necessity

### Merge readiness scale

- **Ready** — clearly scoped and likely mergeable after standard checks
- **Review** — likely useful but needs code review, validation, or dependency verification
- **Hold** — depends on other branches, needs reconciliation, or represents partial work
- **Do Not Merge** — backup, accidental, dispatch, or explicitly unsafe branch

### Priority scale

- **P0** — production fix, release blocker, security, auth, routing, payments
- **P1** — core product capability, backend enablement, customer/chef critical flow
- **P2** — UX improvement, admin tooling, operational visibility
- **P3** — exploratory, backup, documentation-only, utility, or non-primary branch

---

## Category: Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Initial internal admin role-based access control implementation and auth enforcement stream. | auth-service | Backend, Security, RBAC, API | P0 | Review |
| `feature/backend-internal-admin-rbac-v2` | V2 hardening of internal admin RBAC for production-grade admin authorization. | auth-service | Backend, Security, RBAC, API, Data | P0 | Review |
| `feature/backend-admin-account-intervention` | Backend support for admin account intervention flows and account operations. | auth-service | Backend, Admin API, Security, Data | P0 | Review |
| `feature/admin-account-intervention-apim` | APIM exposure and gateway contract layer for admin account intervention APIs. | auth-service / infra | APIM, Backend Gateway, Security | P1 | Review |
| `feature/admin-account-intervention-web` | Admin web interface for account intervention workflows. | admin-portal / customer-web-next | Frontend, BFF, Admin UI | P1 | Hold |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token/session revocation hardening. | auth-service | Backend, Security, Redis, Infra | P0 | Review |
| `agent/fix-backend-connected-signed-in-flows` | Fixes authenticated connected flows between frontend and backend auth/session boundaries. | auth-service / customer-web-next | Frontend, BFF, Backend, Auth | P0 | Review |
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entrypoints and session-aware route handling. | auth-service / customer-web-next | Frontend Routing, Auth, BFF | P1 | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Resolves auth and contract mismatches affecting chef registration and signed flow continuity. | auth-service / order-service | Backend, Frontend, API Contract, Auth | P1 | Review |

## Category: Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | First pass at nearby kitchen discovery experience backed by catalog discovery APIs. | catalog-service | Backend, Discovery, Geospatial, Frontend | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration on nearby kitchen discovery with likely UX/data filtering improvements. | catalog-service | Backend, Discovery, Geospatial, Frontend | P1 | Review |
| `feature/advanced-search-smart-filters` | Advanced search and smart filter feature branch for catalog/discovery exploration. | catalog-service / customer-web-next | Backend, Search UX, BFF, Frontend | P2 | Hold |
| `backend-customer-favorites-20260816` | Backend implementation for customer favorites and saved menu item flows. | user-chef-service / catalog-service | Backend, API, Data, Read Models | P1 | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UX stream tied to browse/discovery experiences. | customer-web-next / catalog-service | Frontend, UX, Discovery, BFF | P2 | Hold |
| `feat/customer-web-semantic-reference-landing` | Semantic landing reference branch for structured customer browsing and page composition. | customer-web-next | Frontend, UX, Content Structure | P3 | Hold |
| `feat/landing-reference-20260811` | Landing reference implementation branch for discovery/marketing page direction. | customer-web-next | Frontend, UX, Landing | P3 | Hold |
| `feat/landing-reference-refresh` | Refresh of landing reference implementation and page composition. | customer-web-next | Frontend, UX, Landing | P3 | Hold |
| `feat/customer-landing-v2-clean-20260808` | Cleaned landing v2 implementation branch likely aligned to discovery and merchandising. | customer-web-next | Frontend, UX, Landing | P2 | Hold |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | Frontend, Backup | P3 | Do Not Merge |

## Category: Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Backend reorder and repeat-order capability for customer purchase history. | order-service | Backend, API, Data, Customer Flow | P1 | Review |
| `agent/order-flyway-v14-checksum` | Fixes Flyway checksum issue around order-service V14 dynamic checkout pricing migration. | order-service | Backend, Database, Flyway | P0 | Ready |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment frontend UX implementation. | customer-web-next / order-service / integration-service | Frontend, BFF, Checkout, Payment | P1 | Hold |
| `feat/customer-orders-tracking-uiux` | Customer orders and tracking UX for post-purchase visibility. | customer-web-next / order-service | Frontend, BFF, Tracking, UX | P1 | Hold |
| `agent/fix-full-frontend-backend-integration` | Cross-stack integration fixes across cart, checkout, orders, and signed flows. | order-service / customer-web-next | Frontend, BFF, Backend, API Contract | P0 | Review |
| `agent/fix-chef-orders-and-customer-palette` | Fixes chef order workflows while also aligning customer-side presentation. | order-service / customer-web-next | Frontend, Backend, UX, Order Ops | P1 | Review |
| `feature/backend-launch-policy-enforcement` | Enforces launch policy around order placement/readiness and rollout-safe access. | order-service | Backend, Policy, API, Data | P1 | Review |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted branch focused on end-to-end customer and chef operational journey through ordering. | order-service / user-chef-service | Backend, Journey APIs, Admin/Operational | P2 | Review |
| `feature/backend-refund-production-readiness` | Production hardening for refund orchestration and refund state handling. | integration-service / order-service | Backend, Refunds, Payments, Operations | P0 | Review |
| `feature/cashfree-production-closeout-20260815` | Closeout branch for payment settlement/readiness touching checkout and order completion. | integration-service / order-service | Backend, Payment, Operations | P0 | Review |
| `agent/razorpay-payment-switch` | Payment provider switch work affecting checkout and order payment flow. | integration-service / order-service | Backend, Payments, Frontend Integration | P0 | Review |

## Category: Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production-grade notification delivery improvements for app/email/push channels. | notification-service | Backend, Delivery Workers, Messaging | P1 | Review |
| `feature/backend-notification-recovery-operations` | Recovery and replay operations for failed notifications. | notification-service | Backend, Operations, Recovery, Admin API | P1 | Review |
| `feature/admin-notification-recovery-apim` | APIM layer and contracts for admin notification recovery operations. | notification-service / infra | APIM, Backend Gateway, Operations | P2 | Review |
| `feature/admin-notification-recovery-web` | Admin UI for retrying and investigating notification recovery actions. | admin-portal / customer-web-next | Frontend, BFF, Admin UI | P2 | Hold |

## Category: Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-chef-review` | Admin chef application review workflows and document decision tooling. | user-chef-service / admin-portal | Backend, Admin UI, Review Workflow | P1 | Review |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and earnings accounting support. | integration-service / user-chef-service | Backend, Finance, Ledger, API | P1 | Review |
| `feat/chef-complete-uiux` | Full chef-facing UI/UX branch spanning onboarding, menu, orders, and operations. | customer-web-next | Frontend, UX, Chef Panel, BFF | P1 | Hold |
| `agent/unify-chef-panel-customer-ui` | Unifies design and routing patterns between chef panel and customer UI shells. | customer-web-next | Frontend, UX, Layout, Navigation | P2 | Review |
| `agent/fix-chef-release-traffic-verification` | Release validation branch for chef traffic, routes, and environment behavior. | user-chef-service / infra / customer-web-next | Infra, Frontend, Backend, Verification | P1 | Review |

## Category: Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/address-final-work` | Customer address workflow completion branch. | user-chef-service / customer-web-next | Backend, Frontend, Address, BFF | P1 | Review |
| `feature/address-final-work-2` | Follow-up iteration on customer address flows. | user-chef-service / customer-web-next | Backend, Frontend, Address, BFF | P1 | Hold |
| `feature/address-final-work-3` | Additional iteration on address workflow stabilization. | user-chef-service / customer-web-next | Backend, Frontend, Address, BFF | P2 | Hold |
| `feature/address-final-work-4` | Latest address-flow refinement branch in the sequence. | user-chef-service / customer-web-next | Backend, Frontend, Address, BFF | P2 | Hold |
| `feature/azure-maps-address-autofill` | Azure Maps–driven address autofill and recommendation support. | user-chef-service / customer-web-next | Backend, Geocoding, Frontend, Maps API | P1 | Review |
| `agent/customer-web-connected-ui` | Connected customer web UI integrated against live/backing APIs. | customer-web-next | Frontend, BFF, UX | P1 | Review |
| `feature/admin-customer-360-document-review` | Customer 360 and document review features for operational support. | user-chef-service / admin-portal | Backend, Admin UI, Support Ops | P2 | Review |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup branch before mobile/home UI refinement. | customer-web-next | Frontend, Mobile UI, Backup | P3 | Do Not Merge |

## Category: Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fixes APIM gateway custom domain or gateway routing configuration. | infra / api gateway | APIM, Infra, DNS, Routing | P0 | Ready |
| `agent/disable-afd-edge-compression` | Disables Azure Front Door edge compression to resolve static/content delivery issues. | infra | Front Door, CDN, Infra | P0 | Ready |
| `agent/disable-origin-gzip-for-cold-loading` | Disables origin gzip behavior to improve cold loading or avoid compression mismatch. | infra | Front Door, Origin, CDN, Infra | P0 | Ready |
| `agent/fix-cold-device-static-loading` | Fixes static asset cold-load failures on devices. | infra / customer-web-next | Infra, CDN, Frontend Delivery | P0 | Review |
| `agent/fix-customer-web-proxy-origin` | Corrects customer web proxy origin configuration. | infra / customer-web-next | Infra, Proxy, Frontend Delivery | P0 | Ready |
| `agent/fix-front-door-cache-validation-cli-288` | Fixes Front Door cache validation issues in CLI-driven provisioning path. | infra | Front Door, IaC, Validation | P0 | Ready |
| `agent/fix-front-door-cli-288` | Fixes Front Door CLI provisioning or ruleset issues. | infra | Front Door, IaC, CLI | P0 | Ready |
| `agent/fix-front-door-gzip-cache-bypass` | Resolves gzip cache bypass behavior at Front Door. | infra | Front Door, CDN, Compression | P0 | Ready |
| `agent/fix-front-door-gzip-rule-validation` | Corrects validation issues for Front Door gzip rules. | infra | Front Door, IaC, Rules Engine | P0 | Ready |
| `agent/fix-front-door-secret-rest` | Fixes secret handling in Front Door REST or automation flows. | infra | Front Door, Secrets, Automation | P0 | Review |
| `agent/fix-front-door-security-policy-cli-288` | Fixes security policy provisioning for Front Door via CLI. | infra | Front Door, Security Policy, IaC | P0 | Ready |
| `agent/fix-static-gzip-cold-loading` | Addresses gzip/static cold-load regressions in the delivery path. | infra / customer-web-next | Infra, CDN, Frontend Delivery | P0 | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalizes empty cache configuration handling for Front Door provisioning. | infra | Front Door, IaC, Validation | P1 | Ready |
| `agent/parallel-front-door-domain-provisioning` | Improves or parallelizes Front Door custom domain provisioning. | infra | Front Door, DNS, IaC | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserves WAF bindings when changing AFD custom domains. | infra | Front Door, WAF, DNS, IaC | P0 | Review |
| `feature/backend-production-readiness-completion` | Final backend production readiness branch spanning platform hardening. | infra / backend platform | Backend, Infra, Operations, Release | P0 | Review |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree payment integration and operational safety. | integration-service / infra | Backend, Payments, Infra, Ops | P0 | Review |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider integration hardening for real-world readiness. | integration-service | Backend, Delivery Integrations, Ops | P1 | Review |
| `feature/backend-admin-operations-audit` | Backend audit and operational observability branch for admin operations. | order-service / integration-service | Backend, Audit, Operations | P1 | Review |
| `feature/backend-admin-investigation-apis` | Admin investigation APIs for platform operational debugging. | order-service / integration-service | Backend, Admin API, Operations | P1 | Review |
| `feature/admin-operational-investigations-apim` | APIM exposure of operational investigation endpoints. | infra / admin backend | APIM, Backend Gateway, Operations | P2 | Review |
| `feature/admin-operational-investigations-web` | Admin web UI for operational investigations. | admin-portal / customer-web-next | Frontend, BFF, Admin UI | P2 | Hold |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard for operational summaries. | admin-portal / order-service | Frontend, Backend, Dashboard, Analytics UI | P2 | Review |
| `feature/admin-control-center-global-search` | Control-center style global search for admin operations. | admin-portal / user-chef-service / order-service | Frontend, Backend, Search, Admin UI | P2 | Review |
| `feature/admin-web-shell` | Foundational admin web shell and layout scaffolding. | admin-portal / customer-web-next | Frontend, Layout, Admin UI | P2 | Review |
| `feature/admin-web-operations-shell` | Operations-focused admin shell for dashboards and investigations. | admin-portal / customer-web-next | Frontend, Layout, Admin UI | P2 | Hold |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service predeploy validation. | subscription-service / CI | CI/CD, Validation, Deployment | P1 | Ready |
| `docs/production-release-audit-20260821` | Release audit and production documentation branch. | docs | Documentation, Release Audit | P2 | Ready |
| `build/qa-mobile-apk-2026-08-20` | QA mobile APK build branch. | build / mobile packaging | Build, QA, Mobile | P3 | Hold |
| `android-build` | Android build-oriented branch for packaging or platform validation. | build / mobile | Build, Android, CI | P3 | Hold |

## Category: Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Accidental or transient branch; not part of planned feature delivery. | unknown | Misc | P3 | Do Not Merge |
| `do-not-use` | Explicitly marked as unsafe/non-target branch. | unknown | Misc | P3 | Do Not Merge |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted journey branch covering customer-chef lifecycle improvements. | cross-service | Backend, Journey Flow | P2 | Review |
| `copilot/research-task-repository-analysis` | AI-generated repository analysis or exploration branch. | docs / research | Documentation, Analysis | P3 | Do Not Merge |
| `craves-master-guide-v1` | Master guide or reference branch, likely documentation or packaged reference state. | docs / cross-platform | Documentation, Reference | P3 | Hold |
| `craves-v5-patch-repack` | Patch repack or release utility branch. | release engineering | Build, Release | P3 | Hold |
| `dispatch-craves-v4` | Dispatch automation branch for v4 workflow. | automation | Automation, Dispatch | P3 | Do Not Merge |
| `dispatch-craves-v4-issue-trigger` | Dispatch issue trigger automation branch. | automation | Automation, Triggering | P3 | Do Not Merge |
| `dispatch-craves-v4-reopen-trigger` | Dispatch reopen trigger automation branch. | automation | Automation, Triggering | P3 | Do Not Merge |
| `dispatch-craves-v4-run-2` | Dispatch workflow run branch. | automation | Automation | P3 | Do Not Merge |
| `dispatch-craves-v4-run-3` | Dispatch workflow run branch. | automation | Automation | P3 | Do Not Merge |
| `dispatch-craves-v4-schedule` | Dispatch schedule automation branch. | automation | Automation, Scheduling | P3 | Do Not Merge |
| `feat/customer-chef-uiux-foundation` | Shared customer-chef UI foundation branch. | customer-web-next | Frontend, Design System, UX | P2 | Hold |
| `agent/landing-body-07cm-inset` | Landing page visual/layout adjustment branch. | customer-web-next | Frontend, UX, Styling | P3 | Hold |
| `agent/landing-body-11cm-inset` | Landing page layout variation branch. | customer-web-next | Frontend, UX, Styling | P3 | Hold |

---

## Uncategorized but intentionally represented within above categories

The following branches were categorised under the most operationally useful domain rather than by prefix alone:

- payment and refund branches were grouped under **Orders** or **Infra** depending on whether they are transactional or production-readiness oriented
- admin branches were grouped under **Auth**, **Notifications**, **Chef**, **Customer**, or **Infra** depending on the dominant service context
- customer-web landing and reference branches were grouped under **Catalog** or **Customer** when they support discovery or customer flows

---

## Full branch inventory checklist

Below is the complete real branch inventory captured in this document:

1. `accidental-ignore-7`
2. `agent/apim-gateway-domain-fix`
3. `agent/backend-completion-guarded-release`
4. `agent/backend-internal-admin-rbac`
5. `agent/customer-web-connected-ui`
6. `agent/disable-afd-edge-compression`
7. `agent/disable-origin-gzip-for-cold-loading`
8. `agent/fix-backend-connected-signed-in-flows`
9. `agent/fix-chef-entry-and-session-routing`
10. `agent/fix-chef-orders-and-customer-palette`
11. `agent/fix-chef-registration-and-checkout-contract`
12. `agent/fix-chef-release-traffic-verification`
13. `agent/fix-cold-device-static-loading`
14. `agent/fix-customer-web-proxy-origin`
15. `agent/fix-front-door-cache-validation-cli-288`
16. `agent/fix-front-door-cli-288`
17. `agent/fix-front-door-gzip-cache-bypass`
18. `agent/fix-front-door-gzip-rule-validation`
19. `agent/fix-front-door-secret-rest`
20. `agent/fix-front-door-security-policy-cli-288`
21. `agent/fix-full-frontend-backend-integration`
22. `agent/fix-static-gzip-cold-loading`
23. `agent/landing-body-07cm-inset`
24. `agent/landing-body-11cm-inset`
25. `agent/nearby-kitchens-first-discovery`
26. `agent/nearby-kitchens-first-discovery-v2`
27. `agent/normalize-empty-front-door-cache-cli-288`
28. `agent/order-flyway-v14-checksum`
29. `agent/parallel-front-door-domain-provisioning`
30. `agent/preserve-afd-custom-domain-waf`
31. `agent/razorpay-payment-switch`
32. `agent/unify-chef-panel-customer-ui`
33. `android-build`
34. `backend-customer-favorites-20260816`
35. `backend-customer-reorder-20260816`
36. `backup/customer-web-before-landing-v2-20260808`
37. `backup/mobile-ui-before-home-refinement-2026-08-16`
38. `build/qa-mobile-apk-2026-08-20`
39. `chatgpt/backend-customer-chef-journey-20260819`
40. `ci/subscription-service-predeploy-gate`
41. `copilot/research-task-repository-analysis`
42. `craves-master-guide-v1`
43. `craves-v5-patch-repack`
44. `dispatch-craves-v4-issue-trigger`
45. `dispatch-craves-v4-reopen-trigger`
46. `dispatch-craves-v4-run-2`
47. `dispatch-craves-v4-run-3`
48. `dispatch-craves-v4-schedule`
49. `dispatch-craves-v4`
50. `do-not-use`
51. `docs/production-release-audit-20260821`
52. `feat/chef-complete-uiux`
53. `feat/customer-cart-checkout-payment-uiux`
54. `feat/customer-chef-uiux-foundation`
55. `feat/customer-landing-discovery-uiux`
56. `feat/customer-landing-v2-clean-20260808`
57. `feat/customer-orders-tracking-uiux`
58. `feat/customer-web-semantic-reference-landing`
59. `feat/landing-reference-20260811`
60. `feat/landing-reference-refresh`
61. `feature/address-final-work`
62. `feature/address-final-work-2`
63. `feature/address-final-work-3`
64. `feature/address-final-work-4`
65. `feature/admin-account-intervention-apim`
66. `feature/admin-account-intervention-web`
67. `feature/admin-chef-review`
68. `feature/admin-control-center-global-search`
69. `feature/admin-customer-360-document-review`
70. `feature/admin-dashboard-v2`
71. `feature/admin-notification-recovery-apim`
72. `feature/admin-notification-recovery-web`
73. `feature/admin-operational-investigations-apim`
74. `feature/admin-operational-investigations-web`
75. `feature/admin-subscription-operations`
76. `feature/admin-subscription-plans`
77. `feature/admin-web-operations-shell`
78. `feature/admin-web-shell`
79. `feature/advanced-search-smart-filters`
80. `feature/azure-maps-address-autofill`
81. `feature/backend-admin-account-intervention`
82. `feature/backend-admin-investigation-apis`
83. `feature/backend-admin-operations-audit`
84. `feature/backend-cashfree-production-hardening`
85. `feature/backend-chef-financial-ledger`
86. `feature/backend-delivery-provider-production-readiness`
87. `feature/backend-internal-admin-rbac-v2`
88. `feature/backend-launch-policy-enforcement`
89. `feature/backend-notification-production-delivery`
90. `feature/backend-notification-recovery-operations`
91. `feature/backend-production-readiness-completion`
92. `feature/backend-redis-abuse-revocation`
93. `feature/backend-refund-production-readiness`
94. `feature/backend-subscription-billing-lifecycle`
95. `feature/backend-subscription-occurrence-generator`
96. `feature/backend-subscription-order-fulfillment`
97. `feature/backend-subscription-payment-intents`
98. `feature/backend-subscription-payment-status-consumer`
99. `feature/backend-subscription-plan-schedules`
100. `feature/cashfree-production-closeout-20260815`

---

## Missing from category tables and recorded here for completeness

These branches are part of the real fetched inventory and should be tracked even when not primary merge candidates:

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-completion-guarded-release` | Release guardrail branch for controlled backend completion and rollout sequencing. | backend platform | Backend, Release, Operations | P1 | Review |
| `feature/admin-subscription-operations` | Admin workflows for subscription operations and interventions. | subscription-service / admin-portal | Backend, Frontend, Admin UI | P2 | Review |
| `feature/admin-subscription-plans` | Admin management UI and APIs for subscription plan review and control. | subscription-service / admin-portal | Backend, Frontend, Admin UI | P2 | Review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle implementation. | subscription-service | Backend, Billing, Scheduling, Data | P1 | Review |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generation engine branch. | subscription-service | Backend, Scheduling, Domain Logic | P1 | Review |
| `feature/backend-subscription-order-fulfillment` | Subscription occurrence to order fulfillment orchestration. | subscription-service / order-service | Backend, Integration, Order Fulfillment | P1 | Review |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and management. | integration-service / subscription-service | Backend, Payment, API | P1 | Review |
| `feature/backend-subscription-payment-status-consumer` | Consumes subscription payment status updates. | subscription-service | Backend, Messaging, Consumer, Data | P1 | Review |
| `feature/backend-subscription-plan-schedules` | Plan scheduling and chef/customer plan cadence management. | subscription-service | Backend, Scheduling, API, Data | P1 | Review |

---

## Recommended next merge queue

1. `agent/apim-gateway-domain-fix`
2. `agent/fix-customer-web-proxy-origin`
3. `agent/fix-front-door-cli-288`
4. `agent/fix-front-door-security-policy-cli-288`
5. `agent/order-flyway-v14-checksum`
6. `feature/backend-redis-abuse-revocation`
7. `feature/backend-internal-admin-rbac-v2`
8. `feature/backend-notification-production-delivery`
9. `feature/backend-refund-production-readiness`
10. `feature/backend-production-readiness-completion`

## Reviewer guidance

- Validate overlapping `address-final-work*` branches before merging any one of them.
- Consolidate `nearby-kitchens-first-discovery` and `...-v2` before merge.
- Reconcile subscription branches into an ordered merge train due to likely schema and workflow coupling.
- Keep `backup/*`, `dispatch-*`, `accidental-*`, and `do-not-use` out of the merge queue.

---

Generated for `rmorampudi09-arch/Craves-Build-platform` as the branch source of truth.