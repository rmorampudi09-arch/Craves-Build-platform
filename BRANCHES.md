# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

## Branch naming convention

This repository currently uses several branch prefixes that map reasonably well to intent and ownership:

- `main` — primary integration branch for production-ready changes.
- `feature/*` — scoped feature delivery branches, typically backend, admin, infra-adjacent, or product capability work.
- `feat/*` — mostly UI/UX and frontend product work.
- `agent/*` — autonomous or assisted engineering branches, often remediation, release hardening, infra fixes, and connected UI integration.
- `backend-*` — direct backend feature branches outside the `feature/*` naming scheme.
- `backup/*` — snapshot branches kept for rollback/reference.
- `build/*` — build artifact or QA packaging branches.
- `docs/*` — documentation and audit branches.
- `ci/*` — CI/CD or deployment gating changes.
- `chatgpt/*`, `copilot/*` — AI-assisted research or implementation branches.
- miscellaneous legacy/special-purpose branches — e.g. `android-build`, `do-not-use`, `dispatch-*`, `craves-*`, `accidental-ignore-7`.

### Recommended interpretation rules

1. Prefer `feature/<domain>-<capability>` for long-lived feature work.
2. Prefer `feat/<surface>-<ux>` for frontend-only presentation changes.
3. Prefer `agent/<problem-statement>` for focused remediation or release work.
4. Do not merge `backup/*`, `dispatch-*`, `do-not-use`, or `accidental-*` branches without explicit review.
5. Treat same-SHA branch clusters as likely aliases, snapshots, or staging copies unless proven otherwise.

## Merge policy

### Default merge order

1. **Infra / platform safety**
   - APIM, Front Door, compression, proxy, traffic validation, security policy, build, CI, release hardening.
2. **Auth / internal controls**
   - RBAC, admin intervention, token/session/platform protection work.
3. **Backend domain capabilities**
   - notification delivery, order, subscription, chef financials, search, favorites, reorder.
4. **Frontend integration / UX**
   - connected UI, discovery, checkout, chef UX, orders tracking, landing refinements.
5. **Backups / audits / reference branches**
   - merge only if intentionally needed; usually keep as historical artifacts.

### Merge readiness meanings

- **Ready** — branch name clearly maps to an implemented or reviewable scope and appears safe to assess for merge.
- **Review first** — likely valid work, but needs validation for overlap, staleness, or branch intent.
- **Hold** — preserve for audit/reference or because it may duplicate newer work.
- **Do not merge** — archival, trigger, accidental, or explicitly unsafe branch.

### General guidance

- Rebase or merge `main` before opening final PRs for long-lived branches.
- Check duplicate capability branches and merge the newest/most complete branch only.
- Prefer backend-before-frontend where branches are paired across services and web.
- For branches affecting infra delivery, validate Azure Front Door/APIM/proxy behavior in staging first.
- For subscription and payment branches, require migration review and operational rollout notes.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC enablement for auth/admin controls. | auth-service | backend, security, RBAC, API | High | Review first |
| feature/admin-account-intervention-apim | APIM exposure and routing for admin account intervention endpoints. | auth-service / APIM | infra, api gateway, security | High | Review first |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows. | customer-web-next admin | frontend, BFF, admin UI | High | Review first |
| feature/backend-admin-account-intervention | Backend implementation of admin account intervention workflows. | auth-service | backend, auth, admin API, persistence | High | Ready |
| feature/backend-internal-admin-rbac-v2 | Second-pass or expanded internal admin RBAC implementation. | auth-service | backend, security, RBAC | High | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Discovery-first nearby kitchens customer experience. | catalog-service / customer-web-next | backend, frontend, discovery, geospatial | High | Review first |
| agent/nearby-kitchens-first-discovery-v2 | Follow-up iteration of nearby kitchens discovery; likely supersedes v1. | catalog-service / customer-web-next | backend, frontend, discovery, geospatial | High | Review first |
| backend-customer-favorites-20260816 | Customer favorites persistence and retrieval enhancements. | user-chef-service / catalog-service | backend, favorites, API, persistence | Medium | Ready |
| feature/advanced-search-smart-filters | Advanced search and smart filtering over catalog/discovery results. | catalog-service / customer-web-next | backend, frontend, search, filters | High | Ready |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-registration-and-checkout-contract | Contract alignment between chef registration, checkout, and consuming clients. | order-service / user-chef-service / web | backend, API contract, frontend | High | Review first |
| agent/order-flyway-v14-checksum | Flyway checksum remediation for order-service migration V14. | order-service | backend, database, flyway | High | Review first |
| backend-customer-reorder-20260816 | Customer reorder / repeat order backend support. | order-service | backend, orders, API, persistence | High | Ready |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment flow UI/UX. | customer-web-next | frontend, checkout, payment, BFF | High | Review first |
| feat/customer-orders-tracking-uiux | Customer orders list, details, and tracking user experience. | customer-web-next | frontend, order tracking, BFF | High | Review first |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM route layer for notification recovery administration. | notification-service / APIM | infra, api gateway, ops | Medium | Review first |
| feature/admin-notification-recovery-web | Admin web interface for notification recovery requests and replay. | customer-web-next admin | frontend, admin UI, BFF | Medium | Review first |
| feature/backend-notification-production-delivery | Production-grade notification delivery hardening. | notification-service | backend, workers, provider integrations | High | Ready |
| feature/backend-notification-recovery-operations | Backend recovery operations for failed notification handling. | notification-service | backend, ops tooling, retry/recovery | High | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entrypoint navigation and session routing. | customer-web-next chef / auth-service | frontend, auth session, routing | High | Review first |
| agent/fix-chef-orders-and-customer-palette | Chef orders UX fixes plus shared visual palette alignment. | customer-web-next | frontend, chef UI, design system | Medium | Review first |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI shell patterns. | customer-web-next | frontend, shell, design system | Medium | Review first |
| chatgpt/backend-customer-chef-journey-20260819 | Backend flows spanning customer and chef journey interactions. | order-service / user-chef-service | backend, journey orchestration, API | Medium | Review first |
| feat/chef-complete-uiux | End-to-end chef UI/UX completion branch. | customer-web-next chef | frontend, chef workflows, BFF | High | Review first |
| feat/customer-chef-uiux-foundation | Shared customer-chef UI foundation and reusable patterns. | customer-web-next | frontend, design system, shell | Medium | Review first |
| feature/admin-chef-review | Admin review workflow for chef applications/documents. | user-chef-service / customer-web-next admin | backend, frontend, admin review | High | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger backend implementation. | integration-service | backend, ledger, payouts/earnings APIs | High | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live backend/BFF contracts. | customer-web-next | frontend, BFF, API integration | High | Review first |
| agent/fix-backend-connected-signed-in-flows | Fix signed-in user flows once frontend is wired to backend. | auth-service / customer-web-next / backend services | frontend, backend, auth, session | High | Review first |
| feat/customer-landing-discovery-uiux | Discovery-led landing page and browse experience. | customer-web-next | frontend, discovery UX, marketing | High | Review first |
| feat/customer-landing-v2-clean-20260808 | Clean landing page v2 refinement branch. | customer-web-next | frontend, landing page | Medium | Hold |
| feat/customer-web-semantic-reference-landing | Semantic/reference implementation for customer landing page. | customer-web-next | frontend, landing page, semantics | Medium | Hold |
| feature/address-final-work | Address management finalization, likely customer addresses flow. | customer-web-next / user-chef-service | frontend, backend, addresses, maps | High | Review first |
| feature/address-final-work-2 | Follow-up address flow branch, likely iteration on prior branch. | customer-web-next / user-chef-service | frontend, backend, addresses, maps | High | Review first |
| feature/address-final-work-3 | Follow-up address flow branch, likely iteration on prior branch. | customer-web-next / user-chef-service | frontend, backend, addresses, maps | High | Review first |
| feature/address-final-work-4 | Latest visible address refinement branch in series. | customer-web-next / user-chef-service | frontend, backend, addresses, maps | High | Review first |
| feature/azure-maps-address-autofill | Azure Maps powered address autocomplete/autofill experience. | user-chef-service / customer-web-next | backend, frontend, maps, address search | High | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or throwaway branch; no reliable merge intent. | repo-wide | misc | Low | Do not merge |
| agent/apim-gateway-domain-fix | APIM custom domain or gateway domain correction. | infra / APIM | infra, gateway, networking | High | Review first |
| agent/backend-completion-guarded-release | Guarded release branch for backend completion/hardening. | repo-wide backend | release, backend, ops | High | Review first |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery issues. | infra / frontend delivery | infra, CDN, networking | High | Review first |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip for cold-load/static asset recovery. | infra / frontend delivery | infra, CDN, origin config | High | Review first |
| agent/fix-chef-release-traffic-verification | Validate release traffic path for chef surface. | infra / frontend delivery | infra, release verification, routing | Medium | Review first |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices. | frontend delivery | infra, static assets, caching | High | Review first |
| agent/fix-customer-web-proxy-origin | Fix customer web proxy origin configuration. | infra / customer-web-next | infra, proxy, networking | High | Review first |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation remediation. | infra | infra, Front Door, caching | High | Review first |
| agent/fix-front-door-cli-288 | Front Door fix tracked under CLI-288. | infra | infra, Front Door | High | Review first |
| agent/fix-front-door-gzip-cache-bypass | Bypass incorrect gzip cache handling at Front Door. | infra | infra, caching, compression | High | Review first |
| agent/fix-front-door-gzip-rule-validation | Validate/fix Front Door gzip rules. | infra | infra, CDN, compression | High | Review first |
| agent/fix-front-door-secret-rest | Fix Front Door secret or REST integration issue. | infra | infra, security, gateway | High | Review first |
| agent/fix-front-door-security-policy-cli-288 | Front Door security policy remediation. | infra | infra, security policy, gateway | High | Review first |
| agent/fix-full-frontend-backend-integration | Broad integration branch spanning frontend/backend connectivity. | repo-wide | frontend, backend, integration | High | Review first |
| agent/fix-static-gzip-cold-loading | Static gzip and cold load remediation. | infra / web delivery | infra, static assets, compression | High | Review first |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty-cache behavior for Front Door path. | infra | infra, caching | Medium | Review first |
| agent/parallel-front-door-domain-provisioning | Improve/provide parallel Front Door custom domain provisioning. | infra | infra, DNS, provisioning | Medium | Review first |
| agent/preserve-afd-custom-domain-waf | Preserve Azure Front Door custom domain WAF config during changes. | infra | infra, WAF, gateway | High | Review first |
| agent/razorpay-payment-switch | Payment provider switch or default routing to Razorpay. | integration-service / infra rollout | backend, payment integration, config | High | Review first |
| android-build | Android build or packaging support branch. | mobile/build | build, android | Low | Hold |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before customer landing v2 changes. | customer-web-next | backup, frontend | Low | Do not merge |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile UI refinements. | mobile / frontend | backup, mobile UI | Low | Do not merge |
| build/qa-mobile-apk-2026-08-20 | QA APK build preparation branch. | mobile/build | build, QA, android | Low | Hold |
| ci/subscription-service-predeploy-gate | CI gate for subscription service predeploy checks. | subscription-service / CI | CI/CD, deployment gating | Medium | Ready |
| copilot/research-task-repository-analysis | Research/documentation branch from AI-assisted repository analysis. | docs / repo-wide | documentation, research | Low | Hold |
| craves-master-guide-v1 | Guide/reference branch; likely documentation or release packaging. | docs / repo-wide | docs, reference | Low | Hold |
| craves-v5-patch-repack | Patch repack branch for release artifact reshaping. | release engineering | build, release packaging | Medium | Review first |
| dispatch-craves-v4 | Dispatch or workflow trigger branch; not a feature branch. | automation | automation, triggers | Low | Do not merge |
| dispatch-craves-v4-issue-trigger | Issue-trigger automation branch. | automation | automation, triggers | Low | Do not merge |
| dispatch-craves-v4-reopen-trigger | Reopen-trigger automation branch. | automation | automation, triggers | Low | Do not merge |
| dispatch-craves-v4-run-2 | Dispatch run artifact branch. | automation | automation | Low | Do not merge |
| dispatch-craves-v4-run-3 | Dispatch run artifact branch. | automation | automation | Low | Do not merge |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch. | automation | automation, scheduling | Low | Do not merge |
| do-not-use | Explicitly unsafe branch. | repo-wide | misc | Low | Do not merge |
| docs/production-release-audit-20260821 | Production release audit documentation branch. | docs / release engineering | docs, audit, release | Medium | Hold |
| feature/backend-cashfree-production-hardening | Hardening for Cashfree production flows. | integration-service | backend, payments, production readiness | High | Ready |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider integrations. | integration-service | backend, delivery integrations, ops | High | Ready |
| feature/backend-launch-policy-enforcement | Launch policy enforcement across backend runtime flows. | order-service / platform | backend, policy, ops controls | High | Ready |
| feature/backend-production-readiness-completion | Final backend production readiness completion work. | repo-wide backend | backend, release hardening, ops | High | Ready |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token revocation standardization. | auth-service / shared backend | backend, security, redis | High | Ready |
| feature/backend-refund-production-readiness | Refund pipeline production readiness and resiliency. | integration-service / order-service | backend, refunds, ops | High | Ready |
| feature/cashfree-production-closeout-20260815 | Closeout items for Cashfree production rollout. | integration-service | backend, payments, release hardening | Medium | Review first |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| chatgpt/backend-customer-chef-journey-20260819 | Cross-domain backend journey improvements touching customer and chef flows. | order-service / user-chef-service | backend, APIs, journey orchestration | Medium | Review first |
| feat/landing-reference-20260811 | Landing page reference implementation for future UX work. | customer-web-next | frontend, reference UI | Low | Hold |
| feat/landing-reference-refresh | Refreshed landing reference branch. | customer-web-next | frontend, reference UI | Low | Hold |
| feature/admin-control-center-global-search | Global search across admin control center workflows. | user-chef-service / admin web | backend, frontend, admin search | High | Ready |
| feature/admin-customer-360-document-review | Customer 360 and document review tooling for admin surface. | user-chef-service / admin web | backend, frontend, admin workflows | High | Ready |
| feature/admin-dashboard-v2 | Admin dashboard second iteration. | order-service / admin web | backend, frontend, analytics/dashboard | High | Ready |
| feature/admin-operational-investigations-apim | APIM support for admin operational investigation APIs. | integration-service / APIM | infra, api gateway, admin ops | Medium | Review first |
| feature/admin-operational-investigations-web | Admin web for operational investigations. | integration-service / admin web | frontend, admin tools, BFF | Medium | Review first |
| feature/admin-subscription-operations | Admin operations for subscription management and incident handling. | subscription-service / admin web | backend, frontend, admin ops | High | Ready |
| feature/admin-subscription-plans | Admin workflows for subscription plan review and management. | subscription-service / admin web | backend, frontend, admin plans | High | Ready |
| feature/admin-web-operations-shell | Shared operations shell for admin web. | customer-web-next admin | frontend, shell, navigation | Medium | Ready |
| feature/admin-web-shell | Base admin shell and layout scaffolding. | customer-web-next admin | frontend, shell, design system | High | Ready |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations. | order-service / integration-service | backend, admin APIs, audit | High | Ready |
| feature/backend-admin-operations-audit | Operations audit trail and backend support. | integration-service / auth-service | backend, audit, persistence | High | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle backend implementation. | subscription-service | backend, billing, events, persistence | High | Ready |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation engine. | subscription-service | backend, scheduling, generation | High | Ready |
| feature/backend-subscription-order-fulfillment | Subscription order fulfillment integration. | subscription-service / order-service | backend, orchestration, order fulfillment | High | Ready |
| feature/backend-subscription-payment-intents | Payment intent creation for subscriptions. | integration-service / subscription-service | backend, payments, API | High | Ready |
| feature/backend-subscription-payment-status-consumer | Consume and reconcile subscription payment statuses. | subscription-service | backend, consumers, events, payments | High | Ready |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling backend capability. | subscription-service | backend, schedules, API, persistence | High | Ready |

---

## Complete branch inventory

For audit completeness, this document inventories the following 100 branches captured from GitHub:

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
