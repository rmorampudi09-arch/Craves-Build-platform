# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branches:** 98

## Branch naming convention

This repository currently uses several branch prefixes that map to work type and team ownership:

- `agent/` — autonomous or assisted implementation, release fixes, frontend/backend integration, infra hotfixes
- `feature/` — product and platform feature branches, usually merge candidates after review
- `feat/` — UI/UX-focused feature work, reference landing pages, end-user experience branches
- `backend-` — backend service feature slices with dated suffixes
- `backup/` — archival safety branches, not intended for merge unless restoring lost work
- `build/` — build artifacts or QA packaging branches
- `ci/` — CI/CD pipeline and deployment gate changes
- `docs/` — documentation and release audit branches
- `chatgpt/`, `copilot/` — AI-assisted exploratory or implementation branches
- unprefixed maintenance branches such as `android-build`, `dispatch-*`, `do-not-use`, `accidental-ignore-7`

## Merge policy

### Default merge order
1. **Infra / platform safety fixes**
2. **Auth and admin security branches**
3. **Backend service completion branches**
4. **Customer and chef UI branches**
5. **Operational/admin web branches**
6. **Backup / experimental / dispatch branches only if explicitly required**

### Merge guidance
- Prefer **PR-based squash merge** into `main` for isolated feature branches.
- Prefer **rebase + test** before merging branches that touch shared contracts across `apps/customer-web-next`, `apps/api`, and backend services.
- Treat `backup/*`, `do-not-use`, `accidental-ignore-7`, and `dispatch-*` as **non-standard branches** requiring manual confirmation before merge.
- For `agent/*` branches, verify whether they are:
  - temporary release remediation branches,
  - superseded by a newer branch,
  - or already represented by a corresponding `feature/*` branch.
- When multiple branches overlap a capability, merge the **backend/API branch first**, then the **web/BFF/UI branch**, then any **infra or APIM branch**.

### Merge readiness scale
- **Ready** — branch name and scope suggest direct review/merge candidate
- **Needs review** — likely valid but requires code + contract + CI verification
- **Hold** — merge only after dependency branch lands first
- **Do not merge** — backup, accidental, obsolete, or explicitly unsafe branch

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC backend rollout for privileged operations. | auth-service | backend, security, RBAC, API | High | Needs review |
| `feature/backend-internal-admin-rbac-v2` | Second-pass internal admin RBAC hardening aligned to auth domain. | auth-service | backend, security, RBAC, DB | High | Ready |
| `feature/backend-admin-account-intervention` | Backend account intervention flows for admin lock/recovery actions. | auth-service | backend, admin API, security | High | Ready |
| `feature/admin-account-intervention-apim` | APIM surface for admin account intervention endpoints. | api gateway / auth-service | APIM, backend integration, security | Medium | Hold |
| `feature/admin-account-intervention-web` | Admin portal UI for account intervention and recovery workflows. | admin-portal | frontend, BFF, admin UI | Medium | Hold |
| `feature/backend-redis-abuse-revocation` | Redis-backed auth abuse protection and token revocation improvements. | auth-service | backend, redis, security | High | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Discovery-first catalog experience centered on nearby kitchens. | catalog-service / customer-web-next | backend, frontend, discovery, location | High | Needs review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration on nearby kitchen discovery ranking and UX. | catalog-service / customer-web-next | backend, frontend, BFF, location | High | Needs review |
| `feature/advanced-search-smart-filters` | Advanced search and smart filter capability for menu and kitchen discovery. | catalog-service / customer-web-next | backend, frontend, search, BFF | High | Ready |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Customer reorder / repeat-order capability. | order-service | backend, API, order domain | High | Ready |
| `agent/order-flyway-v14-checksum` | Repair or reconciliation for order-service Flyway migration checksum. | order-service | backend, DB, Flyway | High | Needs review |
| `feat/customer-cart-checkout-payment-uiux` | Cart, checkout, and payment UX implementation for customer app. | customer-web-next | frontend, checkout UI, payment UX | High | Hold |
| `feat/customer-orders-tracking-uiux` | Customer order listing and tracking user experience. | customer-web-next | frontend, tracking UI, BFF | High | Hold |
| `agent/fix-chef-registration-and-checkout-contract` | Contract alignment for chef registration and checkout flows. | order-service / customer-web-next | backend, BFF, contracts | High | Needs review |
| `agent/fix-full-frontend-backend-integration` | End-to-end order and signed-in flow integration fixes. | order-service / customer-web-next | full-stack, contracts, API integration | Critical | Needs review |
| `agent/fix-backend-connected-signed-in-flows` | Backend-connected signed-in customer order/account flows stabilization. | order-service / auth-service / web | backend, auth, BFF | High | Needs review |
| `agent/razorpay-payment-switch` | Payment routing switch for Razorpay-backed checkout path. | integration-service / order-service | backend, payments, integration | High | Needs review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production-grade notification delivery pipeline stabilization. | notification-service | backend, delivery worker, messaging | High | Ready |
| `feature/backend-notification-recovery-operations` | Recovery and replay operations for failed notifications. | notification-service | backend, admin ops, retry/recovery | High | Ready |
| `feature/admin-notification-recovery-apim` | APIM exposure for admin notification recovery operations. | api gateway / notification-service | APIM, backend integration | Medium | Hold |
| `feature/admin-notification-recovery-web` | Admin UI for replaying and investigating notification failures. | admin-portal | frontend, admin UI, operations | Medium | Hold |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Chef app entrypoint and session routing fixes. | customer-web-next / auth-service | frontend, auth, routing | High | Needs review |
| `agent/fix-chef-orders-and-customer-palette` | Chef orders workflow adjustments plus shared customer color/palette fixes. | customer-web-next | frontend, chef UI, design system | Medium | Needs review |
| `agent/fix-chef-release-traffic-verification` | Verification branch for chef release traffic and rollout. | infra / customer-web-next | release, validation, traffic routing | Medium | Needs review |
| `agent/unify-chef-panel-customer-ui` | Shared UI system between chef panel and customer experience. | customer-web-next | frontend, design system, shared components | Medium | Needs review |
| `feat/chef-complete-uiux` | Comprehensive chef UI/UX implementation. | customer-web-next | frontend, chef flows, BFF | High | Ready |
| `backend-customer-favorites-20260816` | Backend support for customer favorites used in chef/customer journey personalization. | user-chef-service | backend, API, favorites | Medium | Ready |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work spanning customer and chef journey integration. | user-chef-service / order-service | backend, API, workflow | Medium | Needs review |
| `feature/admin-chef-review` | Admin chef application review workflow. | user-chef-service / admin-portal | backend, admin UI, review workflow | High | Ready |
| `feature/backend-chef-financial-ledger` | Chef earnings and financial ledger backend support. | integration-service | backend, finance, reporting | High | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connects customer UI to live backend/BFF services. | customer-web-next | frontend, BFF, API integration | Critical | Needs review |
| `feat/customer-chef-uiux-foundation` | Shared customer/chef experience foundation and design primitives. | customer-web-next | frontend, design system, shared UX | High | Ready |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UI overhaul. | customer-web-next | frontend, landing page, discovery UX | High | Ready |
| `feat/customer-landing-v2-clean-20260808` | Clean landing page v2 branch. | customer-web-next | frontend, landing page | Medium | Ready |
| `feat/customer-web-semantic-reference-landing` | Semantic reference implementation for landing page structure. | customer-web-next | frontend, semantics, UX reference | Medium | Needs review |
| `feat/landing-reference-20260811` | Landing reference branch used as design baseline. | customer-web-next | frontend, reference UX | Low | Needs review |
| `feat/landing-reference-refresh` | Refreshed landing reference iteration. | customer-web-next | frontend, reference UX | Low | Needs review |
| `feature/address-final-work` | Final address flow workstream. | user-chef-service / customer-web-next | frontend, backend, addresses, maps | High | Needs review |
| `feature/address-final-work-2` | Follow-up branch for address flow completion. | user-chef-service / customer-web-next | frontend, backend, addresses | Medium | Needs review |
| `feature/address-final-work-3` | Additional address refinements and fixes. | user-chef-service / customer-web-next | frontend, backend, addresses | Medium | Needs review |
| `feature/address-final-work-4` | Latest address work iteration before merge. | user-chef-service / customer-web-next | frontend, backend, addresses | Medium | Needs review |
| `feature/azure-maps-address-autofill` | Azure Maps based address autofill and geocoding support. | user-chef-service / customer-web-next | frontend, backend, maps, location | High | Ready |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | APIM/custom-domain fix at gateway edge. | infra / api gateway | infra, APIM, networking | High | Ready |
| `agent/backend-completion-guarded-release` | Controlled backend completion and guarded production release branch. | platform / multi-service | release, backend, deployment | Critical | Needs review |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to mitigate content issues. | infra | Azure Front Door, CDN, edge | High | Ready |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to resolve cold-load issues. | infra | CDN, origin config, gzip | High | Ready |
| `agent/fix-cold-device-static-loading` | Fix static asset loading on cold devices. | infra / frontend delivery | CDN, static hosting, frontend | High | Needs review |
| `agent/fix-customer-web-proxy-origin` | Correct proxy/origin settings for customer web. | infra / customer-web-next | proxy, networking, frontend delivery | High | Ready |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache validation rule fix. | infra | Azure Front Door, caching, CLI | Medium | Ready |
| `agent/fix-front-door-cli-288` | General Front Door CLI-driven remediation. | infra | Azure Front Door, CLI, networking | Medium | Ready |
| `agent/fix-front-door-gzip-cache-bypass` | Fix gzip cache bypass behavior at edge. | infra | CDN, caching, compression | Medium | Ready |
| `agent/fix-front-door-gzip-rule-validation` | Front Door gzip rule validation fixes. | infra | Azure Front Door, rules engine | Medium | Ready |
| `agent/fix-front-door-secret-rest` | Secret handling/rest configuration fix for Front Door. | infra | secrets, networking, gateway | High | Needs review |
| `agent/fix-front-door-security-policy-cli-288` | Front Door security policy remediation. | infra | WAF, security policy, CLI | High | Ready |
| `agent/fix-static-gzip-cold-loading` | Static gzip cold-loading fix at delivery layer. | infra / frontend delivery | CDN, compression, static assets | Medium | Ready |
| `agent/landing-body-07cm-inset` | Likely print/layout calibration branch for landing rendering. | customer-web-next / infra delivery | frontend, layout, presentation | Low | Needs review |
| `agent/landing-body-11cm-inset` | Alternate print/layout calibration for landing rendering. | customer-web-next / infra delivery | frontend, layout, presentation | Low | Needs review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalization of empty Front Door cache settings. | infra | Azure Front Door, cache config | Medium | Ready |
| `agent/parallel-front-door-domain-provisioning` | Parallelized Front Door custom-domain provisioning process. | infra | Azure Front Door, domain management | Medium | Needs review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF association while modifying custom domains. | infra | Azure Front Door, WAF, domain config | High | Ready |
| `android-build` | Android/mobile build support branch. | mobile/build | mobile, build pipeline | Medium | Needs review |
| `build/qa-mobile-apk-2026-08-20` | QA APK build branch. | mobile/build | mobile, CI, QA packaging | Medium | Needs review |
| `ci/subscription-service-predeploy-gate` | CI pre-deploy gate for subscription-service. | CI/CD | pipeline, deployment gate, backend | High | Ready |
| `docs/production-release-audit-20260821` | Production release audit documentation. | docs / release engineering | documentation, audit, release | Medium | Ready |
| `feature/backend-cashfree-production-hardening` | Cashfree production hardening and operational readiness. | integration-service | backend, payments, production readiness | High | Ready |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider production readiness work. | integration-service | backend, logistics, ops readiness | High | Ready |
| `feature/backend-production-readiness-completion` | Cross-service backend production readiness completion branch. | multi-service backend | backend, ops, release | Critical | Ready |
| `feature/backend-refund-production-readiness` | Refund workflow production readiness. | integration-service | backend, refunds, payments | High | Ready |
| `feature/cashfree-production-closeout-20260815` | Cashfree closeout tasks and release wrap-up. | integration-service | backend, payments, release closeout | Medium | Ready |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Non-standard branch, likely accidental or temporary ignore state. | unknown | misc | Low | Do not merge |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | backup, frontend | Low | Do not merge |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | mobile UI | backup, frontend | Low | Do not merge |
| `copilot/research-task-repository-analysis` | AI research branch for repo analysis rather than product code. | docs / analysis | docs, analysis | Low | Do not merge |
| `craves-master-guide-v1` | Master guide/reference branch. | docs / platform | docs, reference | Low | Needs review |
| `craves-v5-patch-repack` | Patch repack branch, likely release packaging oriented. | release engineering | release, packaging | Medium | Needs review |
| `dispatch-craves-v4` | Dispatch automation branch. | automation | ops, automation | Low | Do not merge |
| `dispatch-craves-v4-issue-trigger` | Dispatch trigger branch for issue event. | automation | ops, automation | Low | Do not merge |
| `dispatch-craves-v4-reopen-trigger` | Dispatch trigger branch for reopen event. | automation | ops, automation | Low | Do not merge |
| `dispatch-craves-v4-run-2` | Dispatch run branch iteration 2. | automation | ops, automation | Low | Do not merge |
| `dispatch-craves-v4-run-3` | Dispatch run branch iteration 3. | automation | ops, automation | Low | Do not merge |
| `dispatch-craves-v4-schedule` | Dispatch scheduled automation branch. | automation | ops, automation | Low | Do not merge |
| `do-not-use` | Explicitly unsafe branch. | unknown | misc | Low | Do not merge |
| `feature/admin-control-center-global-search` | Admin global search across operational data and entities. | admin-portal / user-chef-service | frontend, backend, admin search | High | Ready |
| `feature/admin-customer-360-document-review` | Customer 360 and document review workflow. | admin-portal / user-chef-service | frontend, backend, admin ops | High | Ready |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard. | admin-portal / order-service | frontend, backend, admin analytics | High | Ready |
| `feature/admin-operational-investigations-apim` | APIM layer for operational investigations APIs. | api gateway / multi-service | APIM, backend integration | Medium | Hold |
| `feature/admin-operational-investigations-web` | Admin web workflows for operational investigations. | admin-portal | frontend, admin ops, investigation UI | Medium | Hold |
| `feature/admin-subscription-operations` | Admin operational tooling for subscriptions. | admin-portal / subscription-service | frontend, backend, admin ops | High | Ready |
| `feature/admin-subscription-plans` | Admin management UI for subscription plans. | admin-portal / subscription-service | frontend, backend, admin UI | High | Ready |
| `feature/admin-web-operations-shell` | Operational shell layout for admin workflows. | admin-portal | frontend, shell, admin UX | Medium | Ready |
| `feature/admin-web-shell` | Base admin shell and navigation framework. | admin-portal | frontend, shell, navigation | High | Ready |
| `feature/backend-admin-investigation-apis` | Backend APIs supporting admin investigations. | order-service / integration-service | backend, admin API, investigations | High | Ready |
| `feature/backend-admin-operations-audit` | Backend audit trail and operational audit support. | multi-service backend | backend, audit, admin ops | High | Ready |
| `feature/backend-launch-policy-enforcement` | Launch policy enforcement across checkout/order flows. | order-service | backend, policy, aspect/security | High | Ready |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle backend implementation. | subscription-service | backend, billing, workers | High | Ready |
| `feature/backend-subscription-occurrence-generator` | Scheduled occurrence generation for subscriptions. | subscription-service | backend, scheduling, DB | High | Ready |
| `feature/backend-subscription-order-fulfillment` | Subscription occurrence to order fulfillment integration. | subscription-service / order-service | backend, async integration, fulfillment | High | Ready |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and tracking. | integration-service / subscription-service | backend, payments, API | High | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service | backend, messaging, workers | High | Ready |
| `feature/backend-subscription-plan-schedules` | Plan schedule management backend support. | subscription-service | backend, scheduling, API | High | Ready |

---

## Complete branch inventory

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
44. `dispatch-craves-v4`
45. `dispatch-craves-v4-issue-trigger`
46. `dispatch-craves-v4-reopen-trigger`
47. `dispatch-craves-v4-run-2`
48. `dispatch-craves-v4-run-3`
49. `dispatch-craves-v4-schedule`
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
