# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated:** 2026-08-26  
**Total branch count:** 100

## Branch naming convention

This repository currently uses multiple branch prefixes, reflecting both product work and operational maintenance:

- `agent/` — autonomous or assisted implementation/fix branches
- `feature/` — feature delivery branches, often backend or admin scoped
- `feat/` — frontend or UX-focused feature branches
- `backend-` — direct backend feature branches
- `backup/` — safety snapshot branches
- `build/` — build artifact or QA packaging branches
- `ci/` — pipeline and deployment guard branches
- `docs/` — documentation and audit branches
- `chatgpt/`, `copilot/` — AI-assisted analysis or implementation branches
- unprefixed branches — legacy, release, dispatch, or temporary work

### Interpretation rules used in this document

- **Purpose** is inferred from the branch name and verified platform architecture context.
- **Owning service** maps to the most likely domain/service or app impacted.
- **Tech layers** summarize likely touched layers: frontend, BFF, API, DB, infra, CI/CD, docs.
- **Priority** is a merge prioritization heuristic:
  - `P0` critical production/runtime fix
  - `P1` high-value platform capability
  - `P2` important product enhancement
  - `P3` exploratory, backup, or low-priority support work
- **Merge readiness** is inferred conservatively from the branch naming signal only:
  - `Ready` — focused, likely merge-targeted scope
  - `Review` — likely valid branch but needs verification/testing
  - `Hold` — duplicate/backup/temporary/unsafe-to-merge directly

## Merge policy

1. Merge `main`-safe production fixes first: infra, gateway, cache, security, payment, readiness.
2. Merge backend branches before dependent web/UI branches when both implement the same capability.
3. Prefer the newest or more explicit successor where duplicate branches exist, such as `-v2`, `-refresh`, or numbered follow-ups.
4. Do **not** merge backup, dispatch trigger, or clearly temporary branches without explicit release approval.
5. For admin and operational features, verify API + web parity before merge.
6. For customer and chef UX branches, verify BFF/API contracts against existing route handlers and service APIs.
7. For any branch touching auth, payments, notifications, or delivery routing, require integration validation.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC enablement for protected operational APIs | auth-service | backend API, security, DB | P1 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up or hardened RBAC implementation replacing earlier admin RBAC work | auth-service | backend API, security, DB | P1 | Review |
| feature/backend-admin-account-intervention | Backend support for admin account disable/enable intervention flows | auth-service | backend API, security, DB | P1 | Review |
| feature/admin-account-intervention-apim | API management/gateway exposure for admin account intervention endpoints | auth-service / APIM | apim, backend integration, security | P1 | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows | admin web / customer-web-next | frontend, BFF, admin UX | P2 | Review |
| feature/backend-redis-abuse-revocation | Abuse protection and token revocation hardening using Redis-backed auth controls | auth-service | backend API, security, Redis, DB | P1 | Review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchen discovery experience and ranking flow | catalog-service / customer-web-next | backend API, discovery, frontend | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby-first discovery, likely the preferred successor branch | catalog-service / customer-web-next | backend API, discovery, frontend | P1 | Review |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UX refresh | customer-web-next / catalog-service | frontend, BFF, discovery UI | P2 | Review |
| feat/customer-landing-v2-clean-20260808 | Cleaned second-generation customer landing page implementation | customer-web-next | frontend, landing UX | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic/reference landing implementation for customer web | customer-web-next | frontend, content, SEO UX | P3 | Review |
| feat/landing-reference-20260811 | Landing reference implementation branch | customer-web-next | frontend, design reference | P3 | Review |
| feat/landing-reference-refresh | Refreshed landing reference branch | customer-web-next | frontend, design refresh | P3 | Review |
| feature/advanced-search-smart-filters | Smarter catalog/discovery search and filtering enhancements | catalog-service / customer-web-next | backend API, search, frontend | P2 | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder capability on backend order flow | order-service | backend API, DB, BFF | P2 | Review |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment UX improvements | customer-web-next / order-service / integration-service | frontend, BFF, payments | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking UX improvements | customer-web-next / order-service | frontend, BFF, tracking UI | P2 | Review |
| feature/backend-launch-policy-enforcement | Enforcement of launch policy rules during checkout/order lifecycle | order-service | backend API, domain logic, DB | P1 | Review |
| agent/order-flyway-v14-checksum | Migration checksum repair for order-service V14 dynamic checkout pricing migration | order-service | DB, backend maintenance | P0 | Ready |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production delivery hardening for push/email notification pipeline | notification-service | backend API, workers, providers, DB | P1 | Review |
| feature/backend-notification-recovery-operations | Recovery operations for failed notification delivery workflows | notification-service | backend API, workers, DB, ops | P1 | Review |
| feature/admin-notification-recovery-apim | APIM/gateway surface for notification recovery operations | notification-service / APIM | apim, backend integration | P2 | Review |
| feature/admin-notification-recovery-web | Admin web interface for notification recovery actions | admin web / customer-web-next | frontend, BFF, admin UX | P2 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry points, sign-in continuity, and routing/session handling | customer-web-next / auth-service | frontend, BFF, auth | P1 | Ready |
| agent/fix-chef-orders-and-customer-palette | Fix chef orders UX and customer-facing visual palette inconsistencies | customer-web-next | frontend, UX | P2 | Review |
| agent/fix-chef-registration-and-checkout-contract | Align chef registration and checkout contract behavior | user-chef-service / order-service / customer-web-next | backend API, BFF, frontend | P1 | Review |
| agent/fix-chef-release-traffic-verification | Release verification branch for chef-facing production traffic behavior | chef web / infra | frontend, observability, release | P1 | Review |
| agent/unify-chef-panel-customer-ui | Shared UI convergence between chef panel and customer app | customer-web-next | frontend, design system | P2 | Review |
| feat/chef-complete-uiux | Large chef UX completion pass across chef workspace surfaces | customer-web-next / user-chef-service | frontend, BFF, chef UX | P2 | Review |
| feat/customer-chef-uiux-foundation | Shared customer-chef UI foundation and primitives | customer-web-next | frontend, design system | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow enhancements | user-chef-service / admin web | backend API, frontend, review ops | P2 | Review |
| feature/backend-chef-financial-ledger | Chef financial ledger backend implementation | integration-service | backend API, DB, financial domain | P1 | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Connect customer web UI to live/backend-backed data flows | customer-web-next | frontend, BFF | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Fix signed-in customer flows against connected backend APIs | customer-web-next / auth-service | frontend, BFF, auth | P1 | Ready |
| agent/fix-full-frontend-backend-integration | Full-stack integration fixes across frontend and backend contracts | customer-web-next / multiple services | frontend, BFF, backend integration | P1 | Review |
| backend-customer-favorites-20260816 | Backend support for customer favorites | user-chef-service / catalog-service | backend API, DB, BFF | P2 | Review |
| feature/address-final-work | Finalization pass for address workflows | user-chef-service / customer-web-next | frontend, BFF, backend API | P2 | Review |
| feature/address-final-work-2 | Follow-up address workflow fixes/enhancements | user-chef-service / customer-web-next | frontend, BFF, backend API | P2 | Review |
| feature/address-final-work-3 | Additional address finalization branch | user-chef-service / customer-web-next | frontend, BFF, backend API | P2 | Review |
| feature/address-final-work-4 | Latest address finalization iteration | user-chef-service / customer-web-next | frontend, BFF, backend API | P2 | Review |
| feature/azure-maps-address-autofill | Azure Maps-powered address autofill and geocoding UX | user-chef-service / customer-web-next | frontend, BFF, external integration | P2 | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Temporary repository/worktree adjustment branch; unsafe intent unclear | repo maintenance | git hygiene | P3 | Hold |
| agent/apim-gateway-domain-fix | Fix APIM or gateway custom domain mapping/configuration | infra / APIM | infra, gateway, DNS | P0 | Ready |
| agent/backend-completion-guarded-release | Guarded backend release completion branch, likely release orchestration | platform release | release, CI/CD, backend | P1 | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression to resolve delivery/runtime issues | infra / Azure Front Door | infra, CDN, edge config | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to fix cold-load asset behavior | infra / frontend delivery | infra, CDN, origin config | P0 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices/sessions | frontend delivery / infra | frontend delivery, CDN | P1 | Review |
| agent/fix-customer-web-proxy-origin | Correct customer web proxy/origin routing configuration | infra / customer-web-next | infra, proxy, frontend delivery | P1 | Ready |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix related to CLI/rules issue 288 | infra / Azure Front Door | infra, CDN, cache | P0 | Ready |
| agent/fix-front-door-cli-288 | General Front Door fix tied to CLI issue 288 | infra / Azure Front Door | infra, CDN | P0 | Ready |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip/cache bypass behavior at edge | infra / Azure Front Door | infra, CDN, cache | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Correct Front Door gzip rule validation problems | infra / Azure Front Door | infra, CDN, rules | P0 | Ready |
| agent/fix-front-door-secret-rest | Restore/fix Front Door secret handling or secret-backed config | infra / Azure Front Door | infra, secrets, gateway | P0 | Ready |
| agent/fix-front-door-security-policy-cli-288 | Front Door security policy fix linked to CLI issue 288 | infra / Azure Front Door | infra, security, gateway | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Static gzip loading fix for cold starts | infra / frontend delivery | infra, CDN, asset delivery | P1 | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config handling in Front Door rules | infra / Azure Front Door | infra, cache, gateway | P1 | Ready |
| agent/parallel-front-door-domain-provisioning | Improve/parallelize Front Door domain provisioning | infra / Azure Front Door | infra, provisioning, gateway | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve custom domain and WAF bindings during AFD updates | infra / Azure Front Door | infra, security, gateway | P0 | Review |
| agent/razorpay-payment-switch | Switch or cut over payment provider path toward Razorpay | integration-service / payments | backend integration, payments, config | P1 | Review |
| android-build | Android/mobile build branch | mobile / build pipeline | mobile, build | P3 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before customer landing v2 work | customer-web-next | backup, frontend | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile/home UI refinement | mobile UI | backup, frontend | P3 | Hold |
| build/qa-mobile-apk-2026-08-20 | QA build packaging branch for mobile APK | mobile / CI | build, QA, release | P3 | Review |
| ci/subscription-service-predeploy-gate | CI gate for subscription-service pre-deploy checks | subscription-service / CI | CI/CD, deployment | P1 | Ready |
| docs/production-release-audit-20260821 | Production release audit documentation branch | docs / release management | docs, release audit | P2 | Review |
| do-not-use | Explicitly unsafe or deprecated branch | repo maintenance | none | P3 | Hold |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted branch for customer-chef journey backend refinement | multiple backend services | backend API, BFF, domain integration | P2 | Review |
| copilot/research-task-repository-analysis | AI-assisted repository analysis/research branch | docs / platform analysis | docs, analysis | P3 | Hold |
| craves-master-guide-v1 | Master guide or umbrella documentation/reference branch | docs / platform | docs | P3 | Review |
| craves-v5-patch-repack | Release repack or patch packaging branch | release engineering | release, packaging | P2 | Review |
| dispatch-craves-v4 | Dispatch/release automation branch | release automation | automation, release | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue-trigger automation branch | release automation | automation | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen-trigger automation branch | release automation | automation | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch execution run branch | release automation | automation | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch execution run branch | release automation | automation | P3 | Hold |
| dispatch-craves-v4-schedule | Dispatch schedule automation branch | release automation | automation | P3 | Hold |
| feature/admin-control-center-global-search | Global search across admin control center workflows | admin web / backend admin APIs | frontend, BFF, backend API | P2 | Review |
| feature/admin-customer-360-document-review | Customer 360 and document review admin workflow | user-chef-service / admin web | backend API, frontend, ops tooling | P2 | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard | admin web / order-service | frontend, BFF, analytics | P2 | Review |
| feature/admin-operational-investigations-apim | APIM layer for admin operational investigation endpoints | integration-service / order-service / APIM | apim, backend integration | P2 | Review |
| feature/admin-operational-investigations-web | Admin web UI for investigations | admin web | frontend, BFF, ops tooling | P2 | Review |
| feature/admin-subscription-operations | Admin subscription operations workflows | subscription-service / admin web | backend API, frontend, ops | P2 | Review |
| feature/admin-subscription-plans | Admin subscription plan management workflows | subscription-service / admin web | backend API, frontend | P2 | Review |
| feature/admin-web-operations-shell | Admin operations shell/foundation UI | admin web | frontend, shell, navigation | P2 | Review |
| feature/admin-web-shell | Base admin shell and layout scaffolding | admin web | frontend, shell | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | order-service / integration-service | backend API, DB, ops | P1 | Review |
| feature/backend-admin-operations-audit | Backend audit trail for admin operations | auth-service / order-service / integration-service | backend API, DB, audit | P1 | Review |
| feature/backend-cashfree-production-hardening | Cashfree integration hardening for production readiness | integration-service | backend API, payments, webhooks | P1 | Review |
| feature/backend-delivery-provider-production-readiness | Production readiness for delivery provider orchestration | integration-service | backend API, delivery, webhooks | P1 | Review |
| feature/backend-production-readiness-completion | Umbrella backend production readiness completion branch | multiple backend services | backend API, infra, release | P1 | Review |
| feature/backend-refund-production-readiness | Refund workflow hardening for production | integration-service / order-service | backend API, payments, refunds | P1 | Review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | backend API, workers, DB | P1 | Review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation engine work | subscription-service | backend API, workers, DB | P1 | Review |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment integration | subscription-service / order-service | backend API, workers, domain integration | P1 | Review |
| feature/backend-subscription-payment-intents | Subscription payment intent creation and management | integration-service / subscription-service | backend API, payments, DB | P1 | Review |
| feature/backend-subscription-payment-status-consumer | Subscription payment status consumer processing | subscription-service / integration-service | backend API, messaging, DB | P1 | Review |
| feature/backend-subscription-plan-schedules | Subscription plan schedules implementation | subscription-service | backend API, DB, scheduling | P1 | Review |
| feature/cashfree-production-closeout-20260815 | Cashfree production closeout/cleanup branch | integration-service | backend API, payments, release | P2 | Review |

---

## Full branch inventory

For quick reference, all 100 real branches included in this document:

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

## Recommended merge sequence

1. **Infra/runtime blockers**
   - `agent/apim-gateway-domain-fix`
   - `agent/disable-afd-edge-compression`
   - `agent/disable-origin-gzip-for-cold-loading`
   - `agent/fix-front-door-*`
   - `agent/preserve-afd-custom-domain-waf`
   - `agent/fix-customer-web-proxy-origin`
2. **Backend critical stability**
   - `agent/order-flyway-v14-checksum`
   - `feature/backend-redis-abuse-revocation`
   - `feature/backend-cashfree-production-hardening`
   - `feature/backend-refund-production-readiness`
   - `feature/backend-delivery-provider-production-readiness`
   - `feature/backend-notification-production-delivery`
3. **Admin and operational enablement**
   - RBAC/account intervention branches
   - investigation/audit branches
   - notification recovery branches
   - subscription admin branches
4. **Subscription platform capabilities**
   - billing lifecycle
   - occurrence generator
   - order fulfillment
   - payment intents/status consumer
   - plan schedules
5. **Customer and chef experience branches**
   - connected UI / signed-in flow fixes
   - address work / Azure Maps autofill
   - landing, discovery, cart, tracking, chef UI branches
6. **Backups, dispatch, and research branches**
   - keep unmerged unless specifically needed
