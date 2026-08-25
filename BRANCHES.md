# Craves-Build-platform Branch Inventory

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated date:** 2026-08-25  
**Total branch count:** 98

This document is the current branch inventory for the repository and is intended to serve as the team handover and merge-planning source of truth. Branches are grouped by domain based on branch naming, codebase service structure, and the repository intelligence report.

---

## Branch naming convention

Observed conventions in this repository:

- `agent/*` — autonomous/ops/platform or integration work, often release, edge, routing, or environment fixes
- `feature/*` — product or backend feature implementation branches
- `feat/*` — UI/UX and frontend feature branches
- `backend-*` — backend-focused delivery branches, usually direct functional additions
- `backup/*` — point-in-time safety branches; do not merge unless explicitly required
- `build/*` — build outputs or QA packaging branches; merge only with release approval
- `docs/*` — documentation or audit branches
- `ci/*` — CI/CD or deployment gating changes
- `dispatch-*` — automation/trigger branches; generally non-product code
- ad hoc names such as `android-build`, `do-not-use`, `accidental-ignore-7` — handle with caution and confirm intent before merge

### Recommended naming standard going forward

- Domain feature work: `feature/<domain>-<capability>`
- Backend-only implementation: `feature/backend-<service-or-capability>`
- Frontend/UI implementation: `feat/<experience-or-surface>`
- Infrastructure/platform fixes: `agent/<platform-or-runtime-change>` or `ci/<pipeline-change>`
- Backup/snapshots: `backup/<context>-<date>`
- Documentation: `docs/<topic>-<yyyymmdd>`

---

## Merge policy

### General guidance

1. Merge infrastructure and platform safety fixes before UX polish branches that depend on them.
2. Merge backend API branches before corresponding web/app shell branches.
3. Prefer PR validation and squash-merge for feature branches unless preserving commit history is important.
4. Do **not** merge `backup/*`, `dispatch-*`, `do-not-use`, or `accidental-*` branches without explicit maintainer approval.
5. For branches that appear to overlap in scope, compare head SHAs and diffs before choosing a canonical merge path.
6. For agent-created remediation branches, verify environment/routing changes in staging before merging to `main`.

### Merge readiness legend

- **Ready** — branch intent is clear and appears merge-candidate pending review/tests
- **Review** — valid branch, but requires code review, verification, or dependency checks
- **Sequence-dependent** — should merge only after prerequisite backend/platform branches
- **Hold** — snapshot, backup, experiment, or potentially obsolete branch; do not merge by default

### Priority legend

- **P0** — platform stability, production safety, authentication, checkout, payments, or release-critical
- **P1** — core product capability or admin/ops enablement
- **P2** — UX enhancement, discovery improvement, or non-blocking feature work
- **P3** — backup, research, automation, or historical branch

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation or remediation for auth/admin role flows. | auth-service | Backend API, security, RBAC, DB migration | P0 | Review |
| `feature/admin-account-intervention-apim` | API management and gateway support for admin account intervention flows. | auth-service / API gateway | APIM, backend API, auth admin ops | P1 | Sequence-dependent |
| `feature/admin-account-intervention-web` | Admin web experience for account intervention such as suspend/restore actions. | customer-web-next / auth-service | Next.js BFF, admin UI, backend integration | P1 | Sequence-dependent |
| `feature/backend-admin-account-intervention` | Backend implementation for admin account intervention capabilities. | auth-service | Backend API, JDBC, migrations, auth admin ops | P1 | Review |
| `feature/backend-internal-admin-rbac-v2` | Follow-up or expanded RBAC implementation for internal admin authorization. | auth-service | Backend API, security, RBAC, DB migration | P0 | Review |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse prevention and token/session revocation hardening. | auth-service | Backend security, Redis, auth filters | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | First-pass nearby kitchen discovery experience and ranking integration. | catalog-service / customer-web-next | Discovery API, geo search, frontend integration | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration on nearby discovery with likely ranking/filter UX improvements. | catalog-service / customer-web-next | Discovery API, geo search, frontend integration | P1 | Review |
| `feature/advanced-search-smart-filters` | Enhanced search and filtering over discovery/catalog listings. | catalog-service / customer-web-next | Search UX, filters, BFF, backend query logic | P1 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-orders-and-customer-palette` | Fixes affecting chef order flows and customer-facing experience consistency. | order-service / customer-web-next | Backend API, chef UI, customer UI | P1 | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Contract alignment for chef registration plus checkout integration path. | order-service / user-chef-service / web | API contracts, checkout, registration flow | P0 | Sequence-dependent |
| `agent/order-flyway-v14-checksum` | Repair or normalize Flyway checksum issue for order-service migration V14. | order-service | Flyway, backend DB migration | P0 | Ready |
| `backend-customer-reorder-20260816` | Customer reorder flow implementation based on prior orders. | order-service | Backend API, customer experience, order history | P1 | Ready |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UI/UX improvements. | customer-web-next / order-service / integration-service | Next.js UI, BFF, payments integration | P0 | Sequence-dependent |
| `feat/customer-orders-tracking-uiux` | Order history and tracking UI/UX enhancements. | customer-web-next / order-service | Next.js UI, BFF, order APIs | P1 | Sequence-dependent |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-notification-recovery-apim` | APIM exposure/support for admin notification recovery operations. | notification-service / API gateway | APIM, admin ops, backend API | P1 | Sequence-dependent |
| `feature/admin-notification-recovery-web` | Admin web UI for notification recovery and retry operations. | customer-web-next / notification-service | Next.js admin UI, BFF, recovery APIs | P1 | Sequence-dependent |
| `feature/backend-notification-production-delivery` | Production-grade notification delivery enhancements. | notification-service | Delivery workers, providers, DB ops | P0 | Review |
| `feature/backend-notification-recovery-operations` | Recovery operations and retry tooling for notification delivery failures. | notification-service | Backend API, admin ops, worker flows | P1 | Ready |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fix chef entry navigation and session routing behavior. | customer-web-next / auth-service / user-chef-service | Next.js routing, auth session, BFF | P1 | Review |
| `feat/chef-complete-uiux` | Comprehensive chef-facing UI/UX implementation or polish. | customer-web-next / user-chef-service / catalog-service / order-service | Next.js chef UI, BFF, backend integrations | P1 | Sequence-dependent |
| `feature/admin-chef-review` | Admin review workflow for chef applications and verification. | user-chef-service / customer-web-next | Admin backend, document review, Next.js admin UI | P1 | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and earnings backend support. | integration-service | Backend API, financial domain, ledger, admin/chef ops | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connect customer web UI to real backend/BFF flows. | customer-web-next | Next.js UI, BFF, API wiring | P1 | Review |
| `agent/fix-backend-connected-signed-in-flows` | Fix authenticated customer journeys against connected backend services. | customer-web-next / auth-service / downstream services | Auth session, BFF, backend integration | P0 | Sequence-dependent |
| `agent/fix-full-frontend-backend-integration` | End-to-end frontend/backend integration fixes across major journeys. | customer-web-next / multi-service | BFF, API contracts, full-stack integration | P0 | Review |
| `backend-customer-favorites-20260816` | Backend support for customer favorites and saved menu item flows. | user-chef-service / catalog-service | Backend API, customer profile, favorites feed | P1 | Ready |
| `feature/address-final-work` | Address flow completion work for customer address management. | user-chef-service / customer-web-next | Address APIs, BFF, profile UI | P1 | Review |
| `feature/address-final-work-2` | Iteration 2 of customer address completion work. | user-chef-service / customer-web-next | Address APIs, BFF, profile UI | P1 | Hold |
| `feature/address-final-work-3` | Iteration 3 of customer address completion work. | user-chef-service / customer-web-next | Address APIs, BFF, profile UI | P1 | Hold |
| `feature/address-final-work-4` | Iteration 4 of customer address completion work. | user-chef-service / customer-web-next | Address APIs, BFF, profile UI | P1 | Hold |
| `feature/azure-maps-address-autofill` | Address autofill and geocoding assistance using Azure Maps. | user-chef-service / customer-web-next | Maps integration, BFF, address UX | P1 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fix API Management or gateway custom domain configuration. | platform / API gateway | APIM, DNS, ingress | P0 | Ready |
| `agent/backend-completion-guarded-release` | Controlled backend release completion branch with safety gates. | platform / multi-service | Release engineering, backend verification | P0 | Review |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression for compatibility/perf issues. | platform | Azure Front Door, CDN, edge config | P0 | Ready |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to mitigate cold loading/static asset issues. | platform / frontend delivery | Edge delivery, compression, caching | P0 | Ready |
| `agent/fix-chef-release-traffic-verification` | Validate or repair chef release traffic/routing. | platform / frontend delivery | Release verification, routing, observability | P1 | Review |
| `agent/fix-cold-device-static-loading` | Fix static asset loading on cold devices/sessions. | platform / frontend delivery | CDN, cache, frontend asset delivery | P0 | Review |
| `agent/fix-customer-web-proxy-origin` | Fix proxy origin routing for customer web. | platform / customer-web-next | Reverse proxy, origin config, frontend delivery | P0 | Ready |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache validation fix tied to CLI-288. | platform | Azure Front Door, cache rules | P0 | Ready |
| `agent/fix-front-door-cli-288` | Core Front Door fix associated with CLI-288. | platform | Azure Front Door, infra config | P0 | Review |
| `agent/fix-front-door-gzip-cache-bypass` | Bypass or correct gzip cache behavior at Front Door. | platform | Azure Front Door, compression, cache | P0 | Ready |
| `agent/fix-front-door-gzip-rule-validation` | Validate/correct Front Door gzip rules. | platform | Azure Front Door, rule engine | P0 | Ready |
| `agent/fix-front-door-secret-rest` | Secret handling remediation for Front Door-related configuration. | platform | Secrets, edge config, infra security | P0 | Review |
| `agent/fix-front-door-security-policy-cli-288` | Security policy remediation for Front Door configuration. | platform | WAF/security policy, Azure Front Door | P0 | Ready |
| `agent/fix-static-gzip-cold-loading` | Static gzip-related cold load remediation. | platform / frontend delivery | CDN, cache, compression | P0 | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty cache config/state for Front Door. | platform | Azure Front Door, cache config | P1 | Ready |
| `agent/parallel-front-door-domain-provisioning` | Parallelize or improve Front Door domain provisioning workflow. | platform | Azure Front Door, domain ops | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF/custom-domain state while applying AFD changes. | platform | Azure Front Door, WAF, domain config | P0 | Ready |
| `android-build` | Android build-related branch, likely packaging or mobile build config. | mobile/platform | Android build, CI, packaging | P2 | Review |
| `build/qa-mobile-apk-2026-08-20` | QA APK build output or packaging branch. | mobile/platform | Build artifacts, QA packaging | P3 | Hold |
| `ci/subscription-service-predeploy-gate` | Predeploy gate or CI check for subscription-service. | platform / subscription-service | CI/CD, deployment gates | P1 | Ready |
| `dispatch-craves-v4` | Automation/dispatch branch for v4 trigger workflows. | platform automation | Automation, dispatch | P3 | Hold |
| `dispatch-craves-v4-issue-trigger` | Automation issue-trigger branch. | platform automation | Automation, GitHub workflow/process | P3 | Hold |
| `dispatch-craves-v4-reopen-trigger` | Automation reopen-trigger branch. | platform automation | Automation, GitHub workflow/process | P3 | Hold |
| `dispatch-craves-v4-run-2` | Automation run branch iteration 2. | platform automation | Automation | P3 | Hold |
| `dispatch-craves-v4-run-3` | Automation run branch iteration 3. | platform automation | Automation | P3 | Hold |
| `dispatch-craves-v4-schedule` | Scheduled automation dispatch branch. | platform automation | Automation, scheduling | P3 | Hold |
| `docs/production-release-audit-20260821` | Documentation/audit for production release verification. | platform / docs | Docs, release audit | P2 | Ready |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Ad hoc branch with unclear intent; likely not for merge. | unknown | Unknown | P3 | Hold |
| `agent/landing-body-07cm-inset` | Landing page visual/layout adjustment variant. | customer-web-next | Frontend UI, marketing page | P2 | Hold |
| `agent/landing-body-11cm-inset` | Alternate landing page layout adjustment variant. | customer-web-next | Frontend UI, marketing page | P2 | Hold |
| `agent/razorpay-payment-switch` | Payment provider switching or Razorpay routing adjustment. | integration-service / customer-web-next | Payments backend, checkout UI, provider routing | P0 | Review |
| `agent/unify-chef-panel-customer-ui` | Design system or navigation unification between chef and customer surfaces. | customer-web-next | Frontend UI, shared components, shell | P2 | Review |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | Backup snapshot | P3 | Hold |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | mobile/customer-web-next | Backup snapshot | P3 | Hold |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted branch for customer/chef backend journey work. | multi-service backend | Backend APIs, journey flows | P2 | Review |
| `copilot/research-task-repository-analysis` | Research/documentation branch for repository analysis. | docs / repo analysis | Documentation, analysis | P3 | Hold |
| `craves-master-guide-v1` | Master guide or reference content branch. | docs / project | Documentation | P3 | Hold |
| `craves-v5-patch-repack` | Patch repack or release preparation branch. | release/platform | Release packaging | P2 | Review |
| `do-not-use` | Explicitly marked as non-merge branch. | unknown | Unknown | P3 | Hold |
| `feat/customer-chef-uiux-foundation` | Foundational UI/UX for shared customer and chef experiences. | customer-web-next | Frontend UI, shared patterns, app shell | P1 | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UI/UX implementation. | customer-web-next / catalog-service | Frontend UI, discovery BFF | P1 | Sequence-dependent |
| `feat/customer-landing-v2-clean-20260808` | Cleaned landing v2 implementation. | customer-web-next | Frontend UI, marketing/discovery | P2 | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic/reference landing page implementation. | customer-web-next | Frontend UI, content structure, SEO | P2 | Review |
| `feat/landing-reference-20260811` | Landing page reference implementation branch. | customer-web-next | Frontend UI | P2 | Hold |
| `feat/landing-reference-refresh` | Refresh of landing reference branch. | customer-web-next | Frontend UI | P2 | Hold |
| `feature/admin-control-center-global-search` | Global search experience for admin control center. | customer-web-next / user-chef-service / order-service | Admin UI, directory APIs, search | P1 | Review |
| `feature/admin-customer-360-document-review` | Admin customer 360 and document review workflows. | customer-web-next / user-chef-service / auth-service | Admin UI, document review, customer support flows | P1 | Review |
| `feature/admin-dashboard-v2` | New or improved admin dashboard. | customer-web-next / order-service / integration-service | Admin UI, dashboards, summary APIs | P1 | Review |
| `feature/admin-operational-investigations-apim` | API management support for admin investigations tooling. | order-service / integration-service / API gateway | APIM, admin APIs, investigations | P1 | Sequence-dependent |
| `feature/admin-operational-investigations-web` | Admin web interface for operational investigations. | customer-web-next / order-service / integration-service | Admin UI, BFF, investigation APIs | P1 | Sequence-dependent |
| `feature/admin-subscription-operations` | Admin operations tooling for subscriptions. | subscription-service / customer-web-next | Admin UI, backend ops APIs | P1 | Review |
| `feature/admin-subscription-plans` | Admin management of subscription plans. | subscription-service / customer-web-next | Plan management UI, backend APIs | P1 | Review |
| `feature/admin-web-operations-shell` | Admin operations shell or navigation framework. | customer-web-next | Admin shell, routing, layout | P2 | Sequence-dependent |
| `feature/admin-web-shell` | Base admin shell experience. | customer-web-next | Admin shell, layout, auth wiring | P2 | Review |
| `feature/backend-admin-investigation-apis` | Backend APIs for operational/admin investigation use cases. | order-service / integration-service | Backend API, admin ops, search/investigation | P1 | Ready |
| `feature/backend-admin-operations-audit` | Backend operational audit trails and admin observability support. | multi-service backend | Backend API, audit logging, admin ops | P1 | Review |
| `feature/backend-cashfree-production-hardening` | Cashfree production hardening and readiness improvements. | integration-service | Payments backend, provider integration, ops | P0 | Ready |
| `feature/backend-delivery-provider-production-readiness` | Production readiness for delivery provider integrations. | integration-service | Delivery adapters, orchestration, readiness checks | P0 | Ready |
| `feature/backend-launch-policy-enforcement` | Backend enforcement for launch/readiness policy checks. | subscription-service / platform | Policy engine, backend validation, release logic | P1 | Review |
| `feature/backend-production-readiness-completion` | Final backend readiness completion branch across services. | multi-service backend | Release hardening, validation, backend completion | P0 | Review |
| `feature/backend-refund-production-readiness` | Refund pipeline production readiness improvements. | integration-service / order-service | Refund workflow, status consumers, provider integration | P0 | Ready |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle implementation. | subscription-service / integration-service | Billing backend, async consumers, invoice/payment states | P1 | Ready |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generation workflow. | subscription-service | Scheduler, occurrence generation, DB jobs | P1 | Ready |
| `feature/backend-subscription-order-fulfillment` | Subscription occurrence to order-fulfillment bridge. | subscription-service / order-service | Backend API, async orchestration, fulfillment | P1 | Ready |
| `feature/backend-subscription-payment-intents` | Payment intent creation and subscription payment flow support. | integration-service / subscription-service | Payments backend, invoices, provider integration | P1 | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service / integration-service | Async consumer, Service Bus, billing state updates | P1 | Ready |
| `feature/backend-subscription-plan-schedules` | Backend support for subscription plan schedules. | subscription-service | Backend API, schedules, policy/state | P1 | Ready |
| `feature/cashfree-production-closeout-20260815` | Closeout/remediation branch for Cashfree production work. | integration-service | Payments backend, provider hardening | P1 | Review |

---

## Full branch inventory

For traceability, the complete branch set represented in the tables above is:

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
