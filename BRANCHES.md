# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 97

This document is the single source of truth for active, historical, backup, agent-generated, release, and feature branches currently present in the repository.

## Branch naming convention

The current repository uses several naming families:

- `main` — default integration branch if present as repository default; merge target for reviewed work
- `agent/*` — autonomous or assisted implementation / fix / release-hardening branches
- `feature/*` — feature delivery branches, usually backend, admin, infra, or platform capabilities
- `feat/*` — frontend/UI/UX oriented feature branches
- `backend-*` — direct backend delivery branches with dated suffixes
- `backup/*` — snapshot / rollback safety branches
- `build/*` — build artifact or packaging branches
- `ci/*` — CI/CD and deployment gate branches
- `docs/*` — documentation and audit branches
- `dispatch-*` — workflow / automation / release-trigger branches
- miscellaneous standalone names — legacy, sandbox, release-pack, or advisory branches

## Merge policy

1. Merge into `main` only after branch diff review, CI validation, and service-level smoke checks.
2. Prefer **squash merge** for short-lived fix and agent branches.
3. Prefer **merge commit** for larger feature branches when preserving grouped commits is useful for auditability.
4. Rebase before merge when branch drift is high, especially for backend schema or API-contract changes.
5. Never merge `backup/*`, `do-not-use`, `accidental-*`, or dispatch trigger branches into `main`.
6. For infra/front-door/APIM branches, validate production routing, compression, cache, WAF, and secret references before merge.
7. For backend branches touching Flyway migrations, verify migration ordering against service-specific latest versions already on `main`.
8. For frontend branches, validate BFF contract compatibility against backend services before merge.

## Readiness legend

- **Ready** — likely candidate for merge after normal review
- **Review** — meaningful implementation likely exists, but needs targeted validation
- **Validate** — operational or integration branch requiring environment checks
- **Hold** — historical, backup, duplicate, or intentionally non-merge branch

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation/hardening for staff access flows | auth-service | Backend API, security, RBAC, persistence | High | Review |
| feature/admin-account-intervention-apim | APIM layer for admin account intervention endpoints and gateway exposure | auth-service / APIM | APIM, gateway policy, backend integration | High | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows | customer-web-next admin | Frontend UI, BFF, auth/admin UX | High | Review |
| feature/backend-admin-account-intervention | Backend account intervention workflow and operational controls | auth-service | Backend API, persistence, audit, security | High | Review |
| feature/backend-internal-admin-rbac-v2 | Second iteration of internal admin RBAC with broader role controls | auth-service | Backend API, RBAC, security, internal auth | High | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse protection and token revocation hardening | auth-service | Backend security, Redis, auth session controls | High | Review |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchen discovery experience aligned to geo search | catalog-service / customer-web-next | Backend discovery API, frontend discovery UI, geo flows | High | Review |
| agent/nearby-kitchens-first-discovery-v2 | Follow-up iteration of nearby discovery with refined UX or ranking | catalog-service / customer-web-next | Discovery API, UI/UX, geo/search | High | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites and saved relationships | user-chef-service / catalog-service | Backend API, persistence, favorites projection | Medium | Review |
| feature/advanced-search-smart-filters | Advanced discovery/search with smart filtering for kitchens or menu items | catalog-service / customer-web-next | Search UX, backend filtering, BFF | High | Review |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-registration-and-checkout-contract | Fixes checkout contract mismatches discovered during chef/customer onboarding flows | order-service / customer-web-next | Backend API, BFF contracts, checkout flow | High | Validate |
| agent/order-flyway-v14-checksum | Repairs or aligns Flyway checksum for order-service migration V14 | order-service | Flyway, backend schema, deployment safety | High | Validate |
| backend-customer-reorder-20260816 | Customer reorder/repeat-order backend flow implementation | order-service | Backend API, persistence, reorder logic | Medium | Review |
| feature/backend-launch-policy-enforcement | Launch gating/policy enforcement around checkout or order activation | order-service | Backend policy, API, operational guardrails | High | Review |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM exposure for admin notification recovery operations | notification-service / APIM | Gateway, admin API, recovery ops | Medium | Review |
| feature/admin-notification-recovery-web | Admin web interface for failed notification recovery workflows | customer-web-next admin | Frontend admin UI, BFF, notification ops | Medium | Review |
| feature/backend-notification-production-delivery | Production delivery readiness for notifications across channels | notification-service | Backend delivery workers, channel integration, ops | High | Review |
| feature/backend-notification-recovery-operations | Recovery, replay, and admin tooling for failed notifications | notification-service | Backend ops API, persistence, workers | High | Review |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fixes chef panel entry, sign-in, and route/session behavior | customer-web-next chef | Frontend routing, auth/session, BFF | High | Validate |
| agent/fix-chef-orders-and-customer-palette | UI correction branch for chef order screens and shared design palette | customer-web-next chef | Frontend UI, theming, order UX | Medium | Review |
| agent/unify-chef-panel-customer-ui | Consolidates chef panel and customer UI system patterns | customer-web-next | Frontend design system, shared components, navigation | Medium | Review |
| chatgpt/backend-customer-chef-journey-20260819 | Backend journey work spanning chef onboarding and customer interaction flows | user-chef-service / order-service | Backend API, workflow, persistence | Medium | Review |
| feat/chef-complete-uiux | End-to-end chef UI/UX buildout for application, kitchen, menu, and operations | customer-web-next chef | Frontend pages, components, BFF | High | Review |
| feat/customer-chef-uiux-foundation | Shared customer/chef UI foundation and reusable UX system | customer-web-next | Frontend design system, layout, state | Medium | Review |
| feature/admin-chef-review | Admin review workflow for chef applications and documents | user-chef-service / customer-web-next admin | Backend API, admin UI, document review | High | Review |
| feature/backend-chef-financial-ledger | Chef ledger, earnings, and financial reconciliation backend work | integration-service | Backend API, persistence, financial domain | High | Review |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connects customer web UI to live backend/BFF flows | customer-web-next | Frontend UI, BFF, API integration | High | Review |
| agent/fix-backend-connected-signed-in-flows | Fixes signed-in customer experiences after backend connectivity changes | customer-web-next / backend services | Frontend auth UX, BFF, session contracts | High | Validate |
| agent/fix-full-frontend-backend-integration | Cross-stack integration fixes across frontend and backend flows | platform-wide | Frontend, BFF, backend APIs, contract integration | High | Validate |
| agent/landing-body-07cm-inset | Layout refinement for landing page body spacing variant | customer-web-next | Frontend UI, styling | Low | Hold |
| agent/landing-body-11cm-inset | Alternative landing page body spacing/layout adjustment | customer-web-next | Frontend UI, styling | Low | Hold |
| backend-customer-favorites-20260816 | Favorites capability for customer saved dishes/kitchens | user-chef-service / catalog-service | Backend API, persistence, BFF dependencies | Medium | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup of customer web before landing v2 changes | customer-web-next | Backup snapshot | Low | Hold |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI/UX branch | customer-web-next | Frontend UI, payment UX, BFF | High | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX improvements | customer-web-next | Frontend UI, discovery UX | High | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing page v2 implementation | customer-web-next | Frontend UI, static marketing, navigation | Medium | Review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UI enhancements | customer-web-next | Frontend UI, tracking views, BFF | High | Review |
| feat/customer-web-semantic-reference-landing | Semantic/reference implementation for landing structure | customer-web-next | Frontend content structure, SEO, design | Medium | Review |
| feat/landing-reference-20260811 | Landing reference implementation branch | customer-web-next | Frontend reference UI | Low | Hold |
| feat/landing-reference-refresh | Refresh of landing reference direction | customer-web-next | Frontend UX, static content | Low | Hold |
| feature/address-final-work | Finalized customer address workflow changes | user-chef-service / customer-web-next | Backend address API, frontend forms, geocoding | High | Review |
| feature/address-final-work-2 | Iteration 2 of address workflow refinement | user-chef-service / customer-web-next | Backend + frontend address handling | Medium | Review |
| feature/address-final-work-3 | Iteration 3 of address workflow refinement | user-chef-service / customer-web-next | Backend + frontend address handling | Medium | Review |
| feature/address-final-work-4 | Iteration 4 / latest address branch | user-chef-service / customer-web-next | Backend + frontend address handling | High | Review |
| feature/azure-maps-address-autofill | Azure Maps-driven address autofill and geocoding UX | user-chef-service / customer-web-next | Frontend forms, BFF, maps/geocoding | High | Review |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Accidental or disposable branch; not intended for integration | N/A | Miscellaneous | Low | Hold |
| agent/apim-gateway-domain-fix | Fixes APIM / gateway domain routing or configuration | Infra / APIM | Gateway, DNS, routing, environment config | High | Validate |
| agent/backend-completion-guarded-release | Release-hardening branch ensuring backend completion gates | Platform backend | Release process, backend validation, CI | High | Validate |
| agent/disable-afd-edge-compression | Disables Azure Front Door edge compression for troubleshooting | Infra / Front Door | CDN, compression, edge config | Medium | Validate |
| agent/disable-origin-gzip-for-cold-loading | Disables origin gzip to fix cold loading behavior | Infra / Front Door / origin | CDN, origin config, performance | Medium | Validate |
| agent/fix-chef-release-traffic-verification | Verifies release traffic routing for chef-facing surfaces | Infra / customer-web-next | Traffic routing, release verification, observability | Medium | Validate |
| agent/fix-cold-device-static-loading | Fixes static asset loading on cold devices/sessions | customer-web-next / infra | Frontend delivery, CDN/cache, static assets | Medium | Validate |
| agent/fix-customer-web-proxy-origin | Fixes proxy origin configuration for customer web | Infra / customer-web-next | Reverse proxy, origin routing, frontend delivery | High | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix from CLI issue 288 | Infra / Front Door | CDN cache, CLI automation, validation | Medium | Validate |
| agent/fix-front-door-cli-288 | Primary Front Door CLI issue remediation branch | Infra / Front Door | CLI automation, CDN config | Medium | Validate |
| agent/fix-front-door-gzip-cache-bypass | Fixes gzip + cache bypass behavior in Front Door | Infra / Front Door | CDN, compression, cache rules | Medium | Validate |
| agent/fix-front-door-gzip-rule-validation | Validates or repairs Front Door gzip rules | Infra / Front Door | CDN rules, compression policy | Medium | Validate |
| agent/fix-front-door-secret-rest | Secret/reference fix for Front Door configuration | Infra / secrets | Secret management, gateway config | High | Validate |
| agent/fix-front-door-security-policy-cli-288 | Fixes Front Door security policy automation path | Infra / Front Door | WAF/security policy, CLI, edge config | High | Validate |
| agent/fix-static-gzip-cold-loading | Static gzip loading fix for cold-start asset delivery | customer-web-next / infra | Asset delivery, gzip, cache | Medium | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalizes empty cache config handling in Front Door automation | Infra / Front Door | CDN automation, config normalization | Medium | Validate |
| agent/parallel-front-door-domain-provisioning | Parallelizes Front Door domain provisioning process | Infra / Front Door | Provisioning automation, domains, CI/CD | Medium | Validate |
| agent/preserve-afd-custom-domain-waf | Preserves custom domain and WAF associations in AFD changes | Infra / Front Door | WAF, custom domains, edge config | High | Validate |
| agent/razorpay-payment-switch | Switches or finalizes Razorpay as active payment path | integration-service / frontend payments | Payments, backend integration, checkout | High | Review |
| android-build | Android/mobile build branch | Mobile / build | Build config, packaging | Low | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup before mobile UI home refinement | Mobile / backup | Backup snapshot | Low | Hold |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK build output or packaging branch | Mobile / build | Build artifact, QA packaging | Low | Hold |
| ci/subscription-service-predeploy-gate | CI predeploy gate for subscription service safety | subscription-service / CI | CI/CD, deploy checks, backend safety | High | Review |
| copilot/research-task-repository-analysis | Research/documentation branch from repository analysis | Documentation / meta | Docs, analysis | Low | Hold |
| craves-master-guide-v1 | Master guide/reference branch | Documentation / product | Docs, planning | Low | Hold |
| craves-v5-patch-repack | Patch repack/release assembly branch | Release engineering | Packaging, release management | Medium | Hold |
| dispatch-craves-v4 | Dispatch automation or release orchestration branch | Release automation | Workflows, automation | Low | Hold |
| dispatch-craves-v4-issue-trigger | Trigger branch for dispatch workflow on issue events | Release automation | GitHub workflow automation | Low | Hold |
| dispatch-craves-v4-reopen-trigger | Trigger branch for reopen automation path | Release automation | GitHub workflow automation | Low | Hold |
| dispatch-craves-v4-run-2 | Dispatch run branch iteration 2 | Release automation | Workflow run artifacts | Low | Hold |
| dispatch-craves-v4-run-3 | Dispatch run branch iteration 3 | Release automation | Workflow run artifacts | Low | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | Release automation | Scheduling, workflows | Low | Hold |
| do-not-use | Explicit non-merge branch | N/A | Miscellaneous | Low | Hold |
| docs/production-release-audit-20260821 | Production release audit and deployment notes | Documentation / release | Docs, audit, release ops | Medium | Review |
| feature/backend-cashfree-production-hardening | Hardening branch for Cashfree production readiness | integration-service | Payments backend, webhook safety, ops | High | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider integrations | integration-service | Delivery integrations, ops, backend API | High | Review |
| feature/backend-production-readiness-completion | Final backend production readiness completion branch | Platform backend | Operational hardening, validation, config | High | Review |
| feature/backend-refund-production-readiness | Refund workflow readiness and production guardrails | integration-service / order-service | Refund orchestration, backend ops | High | Review |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout, cleanup, or rollout branch | integration-service | Payment ops, production readiness | Medium | Review |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-control-center-global-search | Global search capability for admin control center | user-chef-service / customer-web-next admin | Backend directory/search API, admin UI, BFF | High | Review |
| feature/admin-customer-360-document-review | Customer 360 and document review admin workflow | user-chef-service / customer-web-next admin | Backend admin API, UI, document review | High | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard and summary experience | order-service / customer-web-next admin | Backend dashboard API, frontend admin UI | High | Review |
| feature/admin-operational-investigations-apim | APIM surface for operational investigation endpoints | integration-service / order-service / APIM | Gateway, admin APIs, investigations | Medium | Review |
| feature/admin-operational-investigations-web | Admin investigation UI for ops workflows | customer-web-next admin | Frontend admin UI, BFF, ops workflows | High | Review |
| feature/admin-subscription-operations | Admin subscription operations and intervention workflows | subscription-service / customer-web-next admin | Backend API, admin UI, BFF | High | Review |
| feature/admin-subscription-plans | Admin subscription plan management workflow | subscription-service / customer-web-next admin | Backend plan APIs, admin UI, BFF | High | Review |
| feature/admin-web-operations-shell | Operations shell/layout for admin console | customer-web-next admin | Frontend shell, navigation, admin UX | Medium | Review |
| feature/admin-web-shell | Foundational admin shell for web console | customer-web-next admin | Frontend shell, routing, layout | Medium | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations and operational forensics | integration-service / order-service | Backend API, audit, persistence | High | Review |
| feature/backend-admin-operations-audit | Backend audit trail and operations audit layer | integration-service / order-service / auth-service | Backend API, audit persistence, security | High | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | Backend API, workers, billing domain | High | Review |
| feature/backend-subscription-occurrence-generator | Occurrence generation for subscription plans | subscription-service | Backend workers, schedule domain, persistence | High | Review |
| feature/backend-subscription-order-fulfillment | Internal subscription-to-order fulfillment workflow | subscription-service / order-service | Backend integration, internal APIs, workers | High | Review |
| feature/backend-subscription-payment-intents | Payment intent creation for subscriptions | subscription-service / integration-service | Backend API, payment orchestration, persistence | High | Review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events | subscription-service | Backend consumer, async processing, billing | High | Review |
| feature/backend-subscription-plan-schedules | Plan scheduling management for subscriptions | subscription-service | Backend API, persistence, schedule logic | High | Review |

## Complete branch inventory

For audit completeness, here is the full branch list retrieved from GitHub:

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
44. dispatch-craves-v4
45. dispatch-craves-v4-issue-trigger
46. dispatch-craves-v4-reopen-trigger
47. dispatch-craves-v4-run-2
48. dispatch-craves-v4-run-3
49. dispatch-craves-v4-schedule
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

## Merge guidance by category

### Highest-priority merge candidates

1. Auth/security hardening branches
   - `feature/backend-internal-admin-rbac-v2`
   - `feature/backend-redis-abuse-revocation`
   - `feature/backend-admin-account-intervention`
   - `feature/admin-account-intervention-apim`
   - `feature/admin-account-intervention-web`

2. Subscription platform branches
   - `feature/backend-subscription-billing-lifecycle`
   - `feature/backend-subscription-occurrence-generator`
   - `feature/backend-subscription-order-fulfillment`
   - `feature/backend-subscription-payment-intents`
   - `feature/backend-subscription-payment-status-consumer`
   - `feature/backend-subscription-plan-schedules`
   - `feature/admin-subscription-operations`
   - `feature/admin-subscription-plans`

3. Notification operations branches
   - `feature/backend-notification-production-delivery`
   - `feature/backend-notification-recovery-operations`
   - `feature/admin-notification-recovery-apim`
   - `feature/admin-notification-recovery-web`

4. Admin operations branches
   - `feature/backend-admin-investigation-apis`
   - `feature/backend-admin-operations-audit`
   - `feature/admin-operational-investigations-apim`
   - `feature/admin-operational-investigations-web`
   - `feature/admin-dashboard-v2`
   - `feature/admin-control-center-global-search`
   - `feature/admin-customer-360-document-review`

### Merge order recommendation

1. Merge backend foundational branches first:
   - auth, subscription, notification, investigation/audit, payment hardening
2. Merge gateway/APIM branches second:
   - account intervention APIM, notification APIM, investigation APIM, domain/gateway fixes
3. Merge admin and customer web branches third:
   - admin shell, operations shell, dashboard, intervention/recovery/investigation UIs
4. Merge UX polish and experimental layout branches last:
   - landing variants, palette work, spacing experiments
5. Keep backup, dispatch, and non-merge branches excluded from merge queues.

### Do-not-merge set

The following should remain excluded from merge planning unless there is a very specific recovery reason:

- `accidental-ignore-7`
- `do-not-use`
- all `backup/*`
- all `dispatch-*`
- likely temporary layout experiments such as `agent/landing-body-07cm-inset` and `agent/landing-body-11cm-inset`

---

Generated from live GitHub branch inventory on 2026-08-26.
