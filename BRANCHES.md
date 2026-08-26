# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 95

## Branch naming convention

This repository currently uses several branch prefixes that imply scope and intent:

- `agent/` — autonomous or agent-driven implementation, fixes, infrastructure, and release work
- `feature/` — productized feature development, backend capabilities, admin tools, and production-readiness work
- `feat/` — UI/UX oriented feature work and landing/customer experience initiatives
- `backend-` — backend-specific feature increments without the `feature/` prefix
- `backup/` — snapshot/backup branches before major UI or flow changes
- `build/` — build artifacts or packaging-oriented branches
- `ci/` — CI/CD and deployment gate work
- `docs/` — documentation and release audit work
- `dispatch-` — release orchestration or workflow trigger branches
- `chatgpt/`, `copilot/` — AI-assisted research or implementation branches
- root branches like `android-build`, `do-not-use`, `accidental-ignore-7` — ad hoc or operational branches that should be reviewed carefully before merge

## Merge policy

1. **Merge target:** `main`
2. **Preferred sequence:**
   - Infra/platform fixes first
   - Security/auth changes next
   - Backend service branches next
   - Customer/chef/admin UI branches after dependent backend APIs are verified
   - Release, docs, backup, and experimental branches last or never, depending on purpose
3. **Before merge:**
   - Rebase or merge latest `main`
   - Run service-specific tests and smoke checks
   - Validate Flyway version conflicts across backend services
   - Confirm API contract compatibility for `apps/customer-web-next`
   - Verify Azure/AFD/APIM changes in non-prod before production rollout
4. **Readiness meanings used below:**
   - `Ready` — branch name indicates a focused, mergeable increment
   - `Review` — likely mergeable but needs code review/integration validation
   - `Caution` — operational, backup, trigger, or ambiguous branch; merge only with explicit owner approval
   - `Hold` — avoid merge until superseded, clarified, or intentionally selected

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation/update for privileged operations. | auth-service | backend, security, RBAC, Flyway, internal APIs | High | Review |
| `feature/backend-internal-admin-rbac-v2` | Second-pass RBAC hardening/expansion for internal admin roles. | auth-service | backend, security, RBAC, repositories, internal APIs | High | Review |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token revocation enhancements. | auth-service | backend, Redis, security filters, JWT/session | High | Review |
| `feature/backend-admin-account-intervention` | Backend support for admin account intervention flows. | auth-service | backend, admin APIs, audit, security | High | Review |
| `feature/admin-account-intervention-apim` | APIM exposure/configuration for admin account intervention endpoints. | auth-service / APIM | infrastructure, APIM, backend exposure, security | Medium | Review |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention operations. | admin web + auth-service | frontend, BFF/API proxy, admin UI, auth operations | Medium | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchens first-pass discovery experience and ranking flow. | catalog-service / customer-web-next | backend, discovery API, frontend discovery UI | High | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Refined v2 of nearby kitchens discovery behavior. | catalog-service / customer-web-next | backend, discovery API, frontend, ranking/refinement | High | Review |
| `backend-customer-favorites-20260816` | Backend customer favorites support tied to saved menu items/home feed. | user-chef-service / catalog-service | backend, favorites APIs, persistence, BFF integration | High | Review |
| `feature/advanced-search-smart-filters` | Smart search and advanced filtering capability for discovery/catalog flows. | catalog-service / customer-web-next | backend, query/filtering, frontend discovery/search UI | High | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Reorder/repeat-order backend flow. | order-service | backend, order APIs, checkout integration | High | Review |
| `agent/order-flyway-v14-checksum` | Flyway checksum repair/fix for order-service migration history. | order-service | backend, Flyway, DB migrations | High | Caution |
| `feature/backend-launch-policy-enforcement` | Checkout/order launch policy enforcement. | order-service | backend, policy/aspect, checkout/order domain | High | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production delivery path hardening for notification processing. | notification-service | backend, workers, provider adapters, delivery ops | High | Review |
| `feature/backend-notification-recovery-operations` | Recovery operations for failed notification processing and replay. | notification-service | backend, admin ops, workers, persistence | High | Review |
| `feature/admin-notification-recovery-apim` | APIM integration for admin notification recovery endpoints. | notification-service / APIM | infrastructure, APIM, backend exposure | Medium | Review |
| `feature/admin-notification-recovery-web` | Admin web UI for notification recovery operations. | admin web + notification-service | frontend, BFF/API proxy, admin UI | Medium | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fix chef entry path and authenticated session routing. | customer-web-next / auth-service | frontend routing, auth session, BFF | High | Review |
| `agent/fix-chef-orders-and-customer-palette` | Fix chef orders experience and shared visual palette consistency. | customer-web-next / order-service | frontend UI, order views, design system | Medium | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Repair chef registration and checkout-related contract mismatches. | user-chef-service / order-service / customer-web-next | backend APIs, contracts, frontend integration | High | Review |
| `agent/fix-chef-release-traffic-verification` | Verify chef release traffic and rollout behavior. | chef/admin platform | release validation, routing, monitoring | Medium | Caution |
| `agent/unify-chef-panel-customer-ui` | Align chef panel and customer UI patterns/components. | customer-web-next | frontend, design system, shared components | Medium | Review |
| `feat/chef-complete-uiux` | Broader chef-facing UI/UX completion effort. | customer-web-next | frontend, chef pages, interaction flows | High | Review |
| `feature/admin-chef-review` | Admin chef review workflow support. | user-chef-service / admin web | backend, admin APIs, frontend review UI | High | Review |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work across customer-chef journey touchpoints. | user-chef-service / order-service | backend, workflow integration, APIs | Medium | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connect customer web UI to real backend/BFF flows. | customer-web-next | frontend, BFF routes, API integration | High | Review |
| `agent/fix-backend-connected-signed-in-flows` | Repair signed-in customer flows against connected backend. | customer-web-next / auth-service / order-service | frontend, auth, BFF, integration | High | Review |
| `agent/fix-full-frontend-backend-integration` | End-to-end frontend/backend integration stabilization. | customer-web-next + backend services | frontend, BFF, multi-service integration | High | Review |
| `agent/fix-customer-web-proxy-origin` | Fix customer-web proxy/origin behavior. | customer-web-next / infra | frontend proxy, deployment config, origin routing | Medium | Review |
| `agent/landing-body-07cm-inset` | Landing page layout refinement iteration. | customer-web-next | frontend, landing page styling | Low | Review |
| `agent/landing-body-11cm-inset` | Alternate landing page layout refinement iteration. | customer-web-next | frontend, landing page styling | Low | Review |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UI/UX work. | customer-web-next / order-service / integration-service | frontend, checkout UX, payment flow, BFF | High | Review |
| `feat/customer-chef-uiux-foundation` | Shared customer-chef UI foundation. | customer-web-next | frontend, design system, shared app shell | Medium | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UI/UX enhancements. | customer-web-next / catalog-service | frontend, discovery UX, landing experience | High | Review |
| `feat/customer-landing-v2-clean-20260808` | Cleaned v2 landing page implementation. | customer-web-next | frontend, landing page | Medium | Review |
| `feat/customer-orders-tracking-uiux` | Orders and tracking UI/UX improvements. | customer-web-next / order-service | frontend, order tracking, BFF integration | High | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic landing reference implementation for customer web. | customer-web-next | frontend, semantic structure, landing | Low | Review |
| `feat/landing-reference-20260811` | Landing reference baseline branch. | customer-web-next | frontend, reference UI | Low | Review |
| `feat/landing-reference-refresh` | Landing reference refresh/update. | customer-web-next | frontend, reference UI refresh | Low | Review |
| `feature/address-final-work` | Customer address flow finalization. | user-chef-service / customer-web-next | frontend, backend, address APIs, geocoding | High | Review |
| `feature/address-final-work-2` | Follow-up iteration on address finalization. | user-chef-service / customer-web-next | frontend, backend, address APIs | High | Review |
| `feature/address-final-work-3` | Additional address flow corrections/improvements. | user-chef-service / customer-web-next | frontend, backend, address APIs | Medium | Review |
| `feature/address-final-work-4` | Final pass on address flow workstream. | user-chef-service / customer-web-next | frontend, backend, address APIs | Medium | Review |
| `feature/azure-maps-address-autofill` | Azure Maps powered address autofill for customer input flows. | user-chef-service / customer-web-next | frontend, geocoding, external API integration | High | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | APIM gateway domain fix. | infrastructure / APIM | Azure APIM, domains, gateway config | High | Review |
| `agent/backend-completion-guarded-release` | Guarded release branch for backend completion verification. | multi-service backend | release management, backend validation | High | Caution |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to address delivery/runtime issues. | infrastructure / frontend delivery | Azure Front Door, CDN/compression | Medium | Review |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to improve cold-load behavior. | infrastructure / frontend delivery | origin config, compression, static delivery | Medium | Review |
| `agent/fix-cold-device-static-loading` | Fix static asset loading on cold devices/startups. | infrastructure / frontend delivery | static hosting, caching, client loading | High | Review |
| `agent/fix-front-door-cache-validation-cli-288` | Fix Front Door cache validation issue tied to CLI/ruleset constraints. | infrastructure | Azure Front Door, cache rules, CLI validation | Medium | Review |
| `agent/fix-front-door-cli-288` | General Front Door CLI issue remediation. | infrastructure | Azure Front Door, CLI automation | Medium | Review |
| `agent/fix-front-door-gzip-cache-bypass` | Prevent gzip-related cache bypass behavior. | infrastructure | cache, compression, Front Door rules | Medium | Review |
| `agent/fix-front-door-gzip-rule-validation` | Validate and fix gzip rule configuration. | infrastructure | Front Door rules, compression | Medium | Review |
| `agent/fix-front-door-secret-rest` | Secret handling/rest configuration fix for Front Door/APIM path. | infrastructure | secrets, Azure config, platform ops | High | Review |
| `agent/fix-front-door-security-policy-cli-288` | Front Door security policy validation/fix branch. | infrastructure | security policy, Front Door, CLI | High | Review |
| `agent/fix-static-gzip-cold-loading` | Static gzip delivery fix for cold loading scenarios. | infrastructure / frontend delivery | static assets, compression, caching | Medium | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty cache config edge case in Front Door automation. | infrastructure | Azure Front Door, automation, cache config | Medium | Review |
| `agent/parallel-front-door-domain-provisioning` | Parallelize custom domain provisioning in Front Door rollout. | infrastructure | Azure Front Door, domain provisioning, automation | Medium | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF while updating AFD custom domain resources. | infrastructure | Azure Front Door, WAF, domain config | High | Review |
| `android-build` | Android build-oriented branch, likely packaging or mobile build support. | mobile/build | build tooling, mobile packaging | Low | Caution |
| `build/qa-mobile-apk-2026-08-20` | QA APK build branch. | mobile/build | CI/build, Android artifacts | Low | Caution |
| `ci/subscription-service-predeploy-gate` | Predeploy gate for subscription-service rollout. | CI/CD / subscription-service | CI pipeline, deployment gate | High | Review |
| `feature/backend-cashfree-production-hardening` | Production hardening around Cashfree backend integration. | integration-service | backend, payments, readiness, provider integration | High | Review |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider readiness and operational hardening. | integration-service | backend, delivery orchestration, readiness | High | Review |
| `feature/backend-production-readiness-completion` | Final completion pass for backend production readiness. | multi-service backend | backend, ops, readiness | High | Review |
| `feature/backend-refund-production-readiness` | Refund workflow production readiness and safeguards. | integration-service / order-service | backend, refunds, provider integration, ops | High | Review |
| `feature/cashfree-production-closeout-20260815` | Cashfree closeout tasks for production launch. | integration-service | backend, payments, production ops | Medium | Review |
| `docs/production-release-audit-20260821` | Production release audit documentation branch. | docs / release ops | documentation, release audit | Medium | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Ad hoc branch with unclear intent; likely not part of planned feature delivery. | unknown | unknown | Low | Hold |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | backup snapshot, frontend | Low | Caution |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile UI home refinements. | mobile / frontend | backup snapshot, mobile UI | Low | Caution |
| `copilot/research-task-repository-analysis` | AI-assisted repository analysis branch. | docs / research | documentation, analysis | Low | Caution |
| `craves-master-guide-v1` | Master guide or documentation/reference branch. | docs | documentation | Low | Review |
| `craves-v5-patch-repack` | Patch repack/rebundle branch. | release engineering | packaging, release ops | Low | Caution |
| `dispatch-craves-v4` | Release dispatch/orchestration branch. | release engineering | workflow automation, release ops | Low | Caution |
| `dispatch-craves-v4-issue-trigger` | Trigger branch for dispatch issue workflow. | release engineering | workflow automation | Low | Caution |
| `dispatch-craves-v4-reopen-trigger` | Trigger branch for dispatch reopen workflow. | release engineering | workflow automation | Low | Caution |
| `dispatch-craves-v4-run-2` | Dispatch run iteration 2. | release engineering | workflow automation | Low | Caution |
| `dispatch-craves-v4-run-3` | Dispatch run iteration 3. | release engineering | workflow automation | Low | Caution |
| `dispatch-craves-v4-schedule` | Scheduled dispatch workflow branch. | release engineering | workflow automation, scheduling | Low | Caution |
| `do-not-use` | Explicit non-merge branch. | unknown | unknown | Low | Hold |
| `agent/razorpay-payment-switch` | Payment provider switch or routing adjustment toward Razorpay. | integration-service / customer-web-next | backend, payments, frontend payment flow | High | Review |
| `feature/admin-control-center-global-search` | Global admin search capability across operational data. | admin web / user-chef-service / order-service | frontend, backend APIs, search/index/query | High | Review |
| `feature/admin-customer-360-document-review` | Customer 360 plus document review operations. | admin web / user-chef-service | frontend, backend admin APIs, document review | High | Review |
| `feature/admin-dashboard-v2` | Admin dashboard second-generation experience. | admin web / order-service / integration-service | frontend, backend metrics, admin APIs | High | Review |
| `feature/admin-operational-investigations-apim` | APIM exposure for admin investigation endpoints. | integration-service / order-service / APIM | infrastructure, admin APIs, gateway config | Medium | Review |
| `feature/admin-operational-investigations-web` | Admin web investigation console. | admin web / integration-service / order-service | frontend, BFF, admin UI | High | Review |
| `feature/admin-subscription-operations` | Admin tooling for subscription operational workflows. | admin web / subscription-service | frontend, backend admin APIs, ops tooling | High | Review |
| `feature/admin-subscription-plans` | Admin subscription plan management feature. | admin web / subscription-service | frontend, backend plan APIs, workflow UI | High | Review |
| `feature/admin-web-operations-shell` | Admin operations shell and navigation scaffolding. | admin web | frontend, app shell, navigation, permissions | Medium | Review |
| `feature/admin-web-shell` | Base admin web shell/foundation. | admin web | frontend, app shell, shared layout | Medium | Review |
| `feature/backend-admin-investigation-apis` | Backend APIs for admin investigations. | order-service / integration-service | backend, admin APIs, audit/search | High | Review |
| `feature/backend-admin-operations-audit` | Backend audit support for admin operations. | order-service / integration-service / auth-service | backend, audit logs, admin ops | High | Review |
| `feature/backend-chef-financial-ledger` | Chef financial ledger implementation. | integration-service | backend, financial ledger, reconciliation | High | Review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle support. | subscription-service | backend, billing, workers, persistence | High | Review |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generator workflow. | subscription-service | backend, scheduler/workers, occurrence generation | High | Review |
| `feature/backend-subscription-order-fulfillment` | Subscription to order fulfillment handoff. | subscription-service / order-service | backend, orchestration, internal APIs | High | Review |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation/support. | integration-service / subscription-service | backend, payments, provider integration | High | Review |
| `feature/backend-subscription-payment-status-consumer` | Payment status consumer for subscription lifecycle updates. | subscription-service / integration-service | backend, event consumption, billing state | High | Review |
| `feature/backend-subscription-plan-schedules` | Plan schedule management for subscriptions. | subscription-service | backend, plan schedules, policy APIs | High | Review |

## Full branch inventory

For completeness, the repository branch inventory captured for this document is:

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

## Merge guidance summary

- **Merge first:**
  - `agent/apim-gateway-domain-fix`
  - `agent/preserve-afd-custom-domain-waf`
  - `feature/backend-redis-abuse-revocation`
  - `agent/backend-internal-admin-rbac`
  - `feature/backend-internal-admin-rbac-v2`
  - `feature/backend-launch-policy-enforcement`
  - `feature/backend-notification-production-delivery`
  - `feature/backend-delivery-provider-production-readiness`
  - `feature/backend-production-readiness-completion`

- **Merge after backend validation:**
  - `agent/customer-web-connected-ui`
  - `agent/fix-full-frontend-backend-integration`
  - `feat/customer-cart-checkout-payment-uiux`
  - `feat/customer-orders-tracking-uiux`
  - `feature/azure-maps-address-autofill`
  - `feature/admin-dashboard-v2`
  - `feature/admin-subscription-plans`

- **Merge only with explicit approval or archival review:**
  - `do-not-use`
  - `accidental-ignore-7`
  - all `backup/*`
  - all `dispatch-*`
  - `build/qa-mobile-apk-2026-08-20`
  - `android-build`

> Note: The branch API response used for this inventory returned 100 branches. The total branch count shown above reflects the actual retrieved inventory used to build this document.