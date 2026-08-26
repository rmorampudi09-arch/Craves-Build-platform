# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 100

This document is the single-source branch inventory for the repository. It is based on the actual GitHub branch list returned from the repository and organised by functional domain so reviewers can prioritise merge sequencing into `main`.

---

## Branch naming convention

Observed branch prefixes in the repository:

- `agent/` — agent-created implementation, infra, release, integration, and UI fix branches
- `feature/` — product or platform feature work, generally closer to mergeable delivery branches
- `feat/` — frontend/UIUX feature branches
- `backend-` — backend-focused delivery branches without slash prefixing
- `backup/` — snapshot/backup preservation branches; do not merge without intent
- `build/` — build artifact or QA packaging branches
- `ci/` — pipeline and deployment gating branches
- `docs/` — documentation/audit branches
- `dispatch-` — operational trigger/schedule branches
- `chatgpt/`, `copilot/` — research or AI-assisted exploratory branches
- unprefixed branches such as `android-build`, `do-not-use`, `accidental-ignore-7` — special-case branches requiring manual review

Recommended convention going forward:

```text
feature/<domain>-<capability>
feat/<surface>-<ux-scope>
agent/<service-or-platform>-<change>
ci/<pipeline-change>
docs/<artifact>
backup/<snapshot-name>
```

---

## Merge policy

### General

1. Merge to `main` only through PR review.
2. Prefer service-safe sequencing:
   - infra/platform first
   - backend contract changes second
   - frontend/BFF integration next
   - UI polish/follow-up fixes last
3. Do **not** merge `backup/`, `dispatch-*`, `do-not-use`, or `accidental-*` branches without explicit release-manager approval.
4. If multiple branches touch the same domain, merge the most foundational backend/API branch before web/admin/UI branches.
5. Branches with overlapping concerns should be squash-merged after contract verification and smoke tests.

### Merge readiness legend

- **Ready** — branch name suggests scoped delivery with likely direct PR potential
- **Review** — likely useful but needs code/contract/regression review
- **Validate** — merge only after environment/runtime verification
- **Hold** — retain for reference, backup, or operational history; not normal merge candidates

### Priority legend

- **P0** — production stability, routing, auth, payment, delivery, critical infra
- **P1** — core domain capability or admin operations
- **P2** — UX enhancement, supporting platform work, non-blocking feature expansion
- **P3** — research, backup, trigger, audit, or archival branch

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation/hardening for staff roles and protected admin flows | auth-service | Spring Boot, security, JWT, Redis revocation, internal admin APIs | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Fix signed-in session and backend-connected auth experiences across app flows | auth-service + customer-web-next | Auth APIs, BFF session handling, frontend integration | P0 | Validate |
| feature/admin-account-intervention-apim | API management exposure for admin account intervention endpoints | auth-service / APIM | APIM, auth internal APIs, admin operations | P1 | Review |
| feature/admin-account-intervention-web | Admin web UI for account disable/enable/reset/intervention actions | admin-portal / customer-web-next admin | Web admin UI, BFF/API integration | P1 | Review |
| feature/backend-admin-account-intervention | Backend account intervention capability for internal admins | auth-service | Spring Boot, JDBC, Flyway, admin APIs | P1 | Ready |
| feature/backend-internal-admin-rbac-v2 | Second-pass RBAC hardening for internal admin roles and assignments | auth-service | Security, JWT claims, Redis revocation, admin role APIs | P1 | Ready |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token/session revocation hardening | auth-service | Redis, security filters, auth session control | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | Introduce or refine nearby kitchens as primary discovery experience | catalog-service + customer-web-next | Catalog APIs, geospatial discovery, frontend discovery UX | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Follow-up iteration on nearby-first catalog discovery | catalog-service + customer-web-next | Discovery SQL, BFF, frontend ranking/presentation | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved menu item flows | user-chef-service + catalog-service | JDBC, favorites APIs, home feed read model | P1 | Ready |
| feature/advanced-search-smart-filters | Advanced search and smart filtering for kitchen/menu discovery | catalog-service | Public catalog APIs, search filters, web discovery layer | P1 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-orders-and-customer-palette | Fix chef order surfaces and customer-facing order UI presentation coherence | order-service + customer-web-next | Order APIs, chef UI, customer UI theming | P1 | Validate |
| agent/fix-chef-registration-and-checkout-contract | Resolve chef registration and checkout contract mismatches | order-service + user-chef-service + frontend BFF | API contracts, checkout flows, registration integration | P0 | Validate |
| agent/order-flyway-v14-checksum | Repair or reconcile order-service Flyway V14 checksum issue | order-service | Flyway, DB migration integrity | P0 | Validate |
| backend-customer-reorder-20260816 | Backend reorder/repeat-order capability for customer journeys | order-service | Order APIs, repeat order service, BFF integration | P1 | Ready |
| feature/backend-launch-policy-enforcement | Launch policy enforcement around order placement or protected production flows | order-service | Spring aspects/interceptors, policy gates, backend governance | P1 | Ready |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | API management integration for admin notification recovery operations | notification-service / APIM | Admin APIs, APIM, operational tooling | P1 | Review |
| feature/admin-notification-recovery-web | Admin web experience for failed notification recovery handling | admin-portal / customer-web-next admin | Admin UI, BFF integration, operational workflows | P1 | Review |
| feature/backend-notification-production-delivery | Production-grade delivery hardening for notifications | notification-service | Delivery worker, provider adapters, JDBC, retries | P0 | Ready |
| feature/backend-notification-recovery-operations | Backend recovery operations for failed notifications | notification-service | Recovery repositories, admin APIs, worker operations | P1 | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry points, session routing, and navigation handoff | customer-web-next chef + auth-service | Routing, BFF session handling, chef UX | P0 | Validate |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic and routing behavior in deployed environments | chef web surface / infra edge | Release validation, routing, deployment verification | P0 | Validate |
| feat/chef-complete-uiux | End-to-end chef UI/UX completion across operations, kitchen, menu, earnings, and orders | customer-web-next chef | App Router pages, components, BFF integration | P1 | Review |
| feature/admin-chef-review | Admin workflow for chef application review and decisioning | user-chef-service + admin web | Admin APIs, review workflow, document handling | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger backend capability | integration-service | Payment/refund ledger, JDBC, admin financial tooling | P1 | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to real BFF/backend flows | customer-web-next | Next.js App Router, BFF routes, API integration | P0 | Validate |
| agent/fix-full-frontend-backend-integration | End-to-end integration fixes across frontend and backend contracts | customer-web-next + platform services | BFF, API contracts, session/order/catalog flows | P0 | Validate |
| agent/unify-chef-panel-customer-ui | Unify design/system behavior between chef and customer surfaces | customer-web-next | Shared components, routing, design system | P2 | Review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX improvements | customer-web-next | Cart/checkout pages, payment BFF routes, components | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared UI foundation spanning customer and chef web surfaces | customer-web-next | Design system, layout, shared components | P2 | Review |
| feat/customer-landing-discovery-uiux | Landing and discovery experience improvements for customer entry funnel | customer-web-next | Landing pages, discovery pages, components | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Clean second version of customer landing page experience | customer-web-next | Landing page UX, components, styling | P2 | Review |
| feat/customer-orders-tracking-uiux | Customer orders list and delivery tracking UX enhancements | customer-web-next | Orders pages, tracking pages, BFF integration | P1 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference implementation for customer landing content/structure | customer-web-next | Marketing page structure, semantic HTML/CSS | P2 | Review |
| feature/address-final-work | Finalisation of customer address workflows | user-chef-service + customer-web-next | Address APIs, BFF, profile/address UI | P1 | Review |
| feature/address-final-work-2 | Follow-up address workflow finalisation iteration | user-chef-service + customer-web-next | Address APIs, UX refinement | P1 | Review |
| feature/address-final-work-3 | Additional address finalisation pass | user-chef-service + customer-web-next | Address contracts, web UX, validation | P1 | Review |
| feature/address-final-work-4 | Final address workflow follow-up branch | user-chef-service + customer-web-next | Address APIs, BFF, UI polish | P1 | Review |
| feature/azure-maps-address-autofill | Address autofill via Azure Maps for customer address capture | user-chef-service + customer-web-next | External maps integration, address recommendation, frontend forms | P1 | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM/gateway domain configuration | infra / api gateway | Azure APIM, DNS, gateway routing | P0 | Validate |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to address delivery/runtime issues | infra | Azure Front Door, edge config, CDN behavior | P0 | Validate |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to mitigate cold-load/static asset issues | infra + web delivery | Azure edge/origin config, static delivery | P0 | Validate |
| agent/fix-cold-device-static-loading | Fix static asset loading issues on cold devices | infra + frontend delivery | CDN/front door, asset caching, web delivery | P0 | Validate |
| agent/fix-customer-web-proxy-origin | Correct proxy origin configuration for customer web | infra + customer-web-next | Reverse proxy, origin config, deployment | P0 | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Fix Front Door cache validation issue tied to CLI/policy update | infra | Azure Front Door, CLI automation, caching rules | P0 | Validate |
| agent/fix-front-door-cli-288 | General Front Door CLI 288 compatibility/fix branch | infra | Azure CLI, Front Door automation | P0 | Validate |
| agent/fix-front-door-gzip-cache-bypass | Adjust Front Door rules for gzip/cache bypass behavior | infra | Edge caching, compression rules | P0 | Validate |
| agent/fix-front-door-gzip-rule-validation | Validate and fix Front Door gzip rule definitions | infra | Azure Front Door rules engine | P0 | Validate |
| agent/fix-front-door-secret-rest | Restore or fix Front Door secret management behavior | infra | Secrets, edge configuration, deployment automation | P0 | Validate |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy automation for CLI 288 constraints | infra | WAF/security policy, CLI automation | P0 | Validate |
| agent/fix-static-gzip-cold-loading | Static gzip cold-loading fix branch | infra + frontend delivery | Compression, cache, static assets | P0 | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config handling in Front Door automation | infra | Azure Front Door, CLI automation, cache config | P1 | Validate |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door custom domain provisioning | infra | Azure Front Door, provisioning automation, DNS | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve Azure Front Door custom domain and WAF linkage during updates | infra | WAF, custom domains, deployment automation | P0 | Validate |
| android-build | Android/mobile build support branch | mobile/build pipeline | Android packaging, build config | P2 | Review |
| build/qa-mobile-apk-2026-08-20 | QA APK build packaging branch | build/release | Mobile build pipeline, QA artifact generation | P2 | Hold |
| ci/subscription-service-predeploy-gate | Add/adjust predeploy gate for subscription-service | CI/CD | Pipeline validation, release gates | P1 | Ready |
| feature/backend-cashfree-production-hardening | Cashfree production hardening in payment/integration flows | integration-service | Payments, webhooks, ops hardening | P0 | Ready |
| feature/backend-delivery-provider-production-readiness | Delivery provider readiness and production hardening | integration-service | Delivery orchestration, provider adapters, readiness APIs | P0 | Ready |
| feature/backend-production-readiness-completion | Final backend production readiness completion branch | multi-service backend | Hardening, release readiness, ops checks | P0 | Review |
| feature/backend-refund-production-readiness | Refund workflow production hardening | integration-service + order-service | Refund orchestration, provider-neutral status, admin ops | P0 | Ready |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout and final payment rollout tasks | integration-service | Payments, reconciliation, production rollout | P0 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or temporary branch; not intended as feature delivery | unknown | Miscellaneous | P3 | Hold |
| agent/landing-body-07cm-inset | Landing page print/layout or spacing refinement experiment | customer-web-next | UI layout, styling | P3 | Hold |
| agent/landing-body-11cm-inset | Alternative landing layout spacing refinement | customer-web-next | UI layout, styling | P3 | Hold |
| agent/razorpay-payment-switch | Switch or validate Razorpay payment provider path | integration-service + customer-web-next | Payments, BFF, provider routing | P0 | Validate |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 work | customer-web-next | Backup/reference only | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile UI refinement | mobile/customer UI | Backup/reference only | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted backend/customer-chef journey exploration branch | multi-service | Research/prototyping | P3 | Hold |
| copilot/research-task-repository-analysis | Research branch for repository analysis | docs/research | Analysis artifacts | P3 | Hold |
| craves-master-guide-v1 | Guide/reference branch for broader project documentation | docs/platform | Documentation | P3 | Hold |
| craves-v5-patch-repack | Release repack/patch branch | release engineering | Packaging/release prep | P2 | Review |
| dispatch-craves-v4 | Operational dispatch/run branch | operations | Triggers/schedules | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue trigger branch | operations | Workflow triggers | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen trigger branch | operations | Workflow triggers | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch run iteration branch | operations | Workflow execution | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch run iteration branch | operations | Workflow execution | P3 | Hold |
| dispatch-craves-v4-schedule | Dispatch schedule branch | operations | Scheduling automation | P3 | Hold |
| do-not-use | Explicit non-merge branch | unknown | Miscellaneous | P3 | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation branch | docs/release | Documentation, audit artifact | P3 | Review |
| feat/landing-reference-20260811 | Landing reference implementation branch | customer-web-next | Marketing/landing UI | P2 | Review |
| feat/landing-reference-refresh | Refresh of landing reference implementation | customer-web-next | Marketing/landing UI | P2 | Review |
| feature/admin-control-center-global-search | Global search for admin control center | user-chef-service + admin web | Admin directory/search APIs, UI | P1 | Ready |
| feature/admin-customer-360-document-review | Customer 360 and document review operations | admin web + user-chef-service | Admin APIs, document review, customer ops | P1 | Ready |
| feature/admin-dashboard-v2 | Second-generation admin dashboard | order-service/admin web | Dashboard APIs, analytics UI | P1 | Ready |
| feature/admin-operational-investigations-apim | APIM exposure for admin operational investigation endpoints | order-service / integration-service | APIM, admin ops APIs | P1 | Review |
| feature/admin-operational-investigations-web | Admin web operational investigations UI | admin web | Investigations UI, BFF, audit flows | P1 | Ready |
| feature/admin-subscription-operations | Admin tooling for subscription operations | subscription-service + admin web | Admin APIs, ops workflows, capacity/status management | P1 | Ready |
| feature/admin-subscription-plans | Admin subscription plan management | subscription-service + admin web | Plan workflow APIs, admin UI | P1 | Ready |
| feature/admin-web-operations-shell | Admin web operations shell and navigation structure | admin web | Shell/layout, route structure, shared components | P1 | Ready |
| feature/admin-web-shell | Foundational admin web shell | admin web | Layout, auth gating, navigation | P1 | Ready |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | order-service + integration-service | Admin investigation APIs, JDBC, audit | P1 | Ready |
| feature/backend-admin-operations-audit | Backend audit capability for admin operations | multi-service backend | Audit tables, APIs, admin ops tracing | P1 | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | Billing workflows, outbox, payment state handling | P1 | Ready |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation capability | subscription-service | Scheduling, occurrence generation worker, JDBC | P1 | Ready |
| feature/backend-subscription-order-fulfillment | Subscription order dispatch and fulfillment integration | subscription-service + order-service | Internal order callbacks, fulfillment, async workflows | P1 | Ready |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and orchestration | subscription-service + integration-service | Payments, invoice/order creation, BFF integration | P1 | Ready |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events | subscription-service | Event consumption, billing reconciliation, async processing | P1 | Ready |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling and runtime management | subscription-service | Schedule APIs, plan runtime rules, JDBC/Flyway | P1 | Ready |

---

## Complete branch inventory

For audit completeness, below is the exact branch list used to build this document.

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
