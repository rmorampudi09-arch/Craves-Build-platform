# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total Branch Count:** 100

This document is the consolidated branch inventory for the Craves platform repository. It lists every currently discovered branch from GitHub page 1 (`per_page=100`) and groups them by platform domain so engineering, QA, and release managers have a single merge-planning reference.

---

## Branch Naming Convention

Observed branch prefixes in this repository:

- `agent/` — autonomous or assisted implementation, infra fixes, integration work, release hardening, and UX correction branches.
- `feature/` — feature-complete product, backend, admin, infra, and service branches intended for review/merge.
- `feat/` — UX/UI or product experience branches, usually frontend-heavy.
- `backend-` — backend capability branches with date-stamped rollout intent.
- `backup/` — snapshot/parking branches retained for rollback or comparison.
- `build/` — build artifact or QA packaging branches.
- `ci/` — pipeline, predeploy, or gating automation branches.
- `docs/` — documentation and audit branches.
- `chatgpt/`, `copilot/` — research or AI-assisted exploratory implementation branches.
- `dispatch-`, `android-build`, `craves-*`, `do-not-use`, `accidental-*` — operational or legacy branches requiring extra review before merge.

### Interpretation Rules Used in This Document

- **Purpose** is inferred from the branch name and grounded against the repository implementation map supplied in context.
- **Owning service** maps to the most likely application/service area impacted.
- **Tech layers** use repo-native layers such as Next.js BFF, Spring Boot services, APIM, Azure Front Door, delivery/payment integrations, CI, docs.
- **Priority** is an operational recommendation:
  - `P0` critical release/security/platform path
  - `P1` high-value product or production-readiness work
  - `P2` important but can follow after mainline stabilization
  - `P3` archival, exploratory, or low-urgency work
- **Merge readiness** is a documentation assessment from branch naming only, not a code diff audit:
  - `Ready for review` — likely merge candidate branch name and scope
  - `Needs validation` — should be tested or diff-reviewed before merge
  - `Hold` — backup, experimental, accidental, or ambiguous branch

---

## Merge Policy

1. **Merge `main` only through reviewed pull requests.** Do not fast-forward unknown operational branches directly.
2. **Prioritize platform-critical branches first**:
   - auth/RBAC/security
   - production payment and refund hardening
   - notification recovery/delivery
   - subscription/order lifecycle correctness
   - APIM/Front Door/proxy/domain fixes
3. **Validate service contracts before merge** for branches touching:
   - `customer-web-next` BFF routes
   - auth token/session flows
   - payment gateways (Razorpay/Cashfree)
   - delivery provider routing/webhooks
   - subscription occurrence/order coupling
4. **Treat these as non-merge-by-default** until explicitly approved:
   - `backup/*`
   - `dispatch-*`
   - `do-not-use`
   - `accidental-ignore-7`
5. **Sequence backend before frontend** when both exist for the same capability:
   - merge API/backend branch
   - deploy/test contracts
   - merge web/admin surface branch
6. **Infra and edge branches** must be validated in staging for cache, gzip, WAF, APIM, and custom domain behavior before merge.
7. **Consolidate duplicate or iterative branches** (`-v2`, numbered suffixes, multiple address-final-work branches) into one chosen merge candidate before opening PRs.

---

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC rollout for privileged operations | auth-service | Spring Boot, security, JWT, Redis revocation, admin APIs | P0 | Ready for review |
| feature/backend-internal-admin-rbac-v2 | Follow-up RBAC hardening/expanded internal admin roles | auth-service | Spring Boot, security, Flyway, admin role APIs | P0 | Needs validation |
| feature/backend-admin-account-intervention | Backend account intervention operations such as disable/enable/revoke sessions | auth-service | Spring Boot, admin controllers, audit, auth domain | P0 | Ready for review |
| feature/admin-account-intervention-apim | APIM exposure for admin account intervention endpoints | auth-service | APIM, auth-service, admin API gateway | P1 | Needs validation |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows | customer-web-next/admin | Next.js app router, BFF, admin UI | P1 | Needs validation |
| feature/backend-redis-abuse-revocation | Redis-based anti-abuse and token revocation hardening | auth-service | Redis, Spring Security, JWT/session lifecycle | P0 | Ready for review |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchen discovery experience and service alignment | catalog-service | Spring Boot, geodiscovery, customer web BFF, search UX | P1 | Needs validation |
| agent/nearby-kitchens-first-discovery-v2 | Iteration of nearby discovery with likely improved ranking or UX | catalog-service | Spring Boot, geodiscovery, Next.js discovery surfaces | P1 | Needs validation |
| feat/customer-landing-discovery-uiux | Discovery-led landing UX for customer acquisition and browsing | customer-web-next + catalog-service | Next.js, discovery UI, public catalog APIs | P1 | Ready for review |
| feature/advanced-search-smart-filters | Advanced search and smart filters over kitchens/menu discovery | catalog-service | Next.js BFF, catalog queries, search/filter UX | P1 | Ready for review |
| feat/customer-web-semantic-reference-landing | Semantic/structured landing reference for discovery positioning | customer-web-next | Next.js marketing/discovery pages | P2 | Needs validation |
| feat/landing-reference-20260811 | Reference landing implementation branch | customer-web-next | Next.js landing page, UX reference | P2 | Needs validation |
| feat/landing-reference-refresh | Refresh of landing reference implementation | customer-web-next | Next.js landing page, UX refresh | P2 | Needs validation |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing v2 branch for customer web | customer-web-next | Next.js landing/discovery surface | P2 | Ready for review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes | customer-web-next | Next.js backup snapshot | P3 | Hold |
| agent/landing-body-07cm-inset | Landing page layout tweak branch | customer-web-next | CSS/layout, Next.js landing page | P3 | Hold |
| agent/landing-body-11cm-inset | Alternative landing page layout tweak branch | customer-web-next | CSS/layout, Next.js landing page | P3 | Hold |

## Orders
n
| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder flow backend support | order-service | Spring Boot, cart/order APIs, repeat order logic | P1 | Ready for review |
| feat/customer-cart-checkout-payment-uiux | Customer cart, checkout, and payment UI experience | customer-web-next + order-service | Next.js, BFF routes, checkout contracts | P1 | Ready for review |
| feat/customer-orders-tracking-uiux | Customer order history and tracking experience | customer-web-next + order-service | Next.js, order APIs, delivery tracking UI | P1 | Ready for review |
| agent/fix-chef-orders-and-customer-palette | UI fix set affecting chef orders and customer styling | customer-web-next + order-service | Next.js, chef orders UI, design system | P2 | Needs validation |
| agent/fix-chef-registration-and-checkout-contract | Fix mismatch between chef registration and checkout contracts | order-service + customer-web-next | BFF contracts, Spring Boot APIs, validation | P1 | Needs validation |
| agent/order-flyway-v14-checksum | Repair or reconcile order-service Flyway checksum at V14 | order-service | Flyway, Spring Boot, DB migrations | P0 | Ready for review |
| feature/backend-launch-policy-enforcement | Enforce launch policy checks during checkout/order flows | order-service | Spring Boot, policy registry, checkout pipeline | P1 | Ready for review |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted backend branch spanning customer-chef operational flow | order-service + user-chef-service | Spring Boot services, journey APIs | P2 | Needs validation |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Harden production notification delivery execution | notification-service | Spring Boot, worker delivery, ACS/FCM adapters | P0 | Ready for review |
| feature/backend-notification-recovery-operations | Backend recovery/replay operations for failed notifications | notification-service | Spring Boot, recovery workers, audit/retry | P0 | Ready for review |
| feature/admin-notification-recovery-apim | APIM layer for notification recovery administration | notification-service | APIM, internal admin APIs | P1 | Needs validation |
| feature/admin-notification-recovery-web | Admin web recovery UI for notification operations | customer-web-next/admin | Next.js admin UI, BFF, recovery workflows | P1 | Needs validation |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/chef-complete-uiux | Full chef panel/user experience pass | customer-web-next chef area | Next.js, chef routes, UX/UI | P1 | Ready for review |
| feature/admin-chef-review | Admin review workflow for chef applications and documents | user-chef-service + admin web | Spring Boot, Next.js admin UI, document review | P1 | Ready for review |
| feature/backend-chef-financial-ledger | Chef financial ledger backend implementation | integration-service | Spring Boot, finance ledger, payout/accounting models | P1 | Ready for review |
| feat/customer-chef-uiux-foundation | Shared chef/customer UX foundation likely unifying navigation and components | customer-web-next | Next.js, design system, shared UX foundation | P2 | Needs validation |
| agent/fix-chef-entry-and-session-routing | Fix chef area entry paths and session routing | customer-web-next + auth-service | Next.js routing, auth session flow, BFF | P1 | Needs validation |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI shell/components | customer-web-next | Next.js, shared UI shell, routing | P2 | Needs validation |
| agent/fix-chef-release-traffic-verification | Release traffic verification for chef-facing rollout | customer-web-next + infra | Next.js deployment, traffic validation, release ops | P1 | Needs validation |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-favorites-20260816 | Backend support for customer favorites | user-chef-service + catalog-service | Spring Boot, favorites APIs, home feed data | P1 | Ready for review |
| feature/address-final-work | Customer address flow implementation candidate | user-chef-service | Spring Boot, addresses, Azure Maps, BFF | P1 | Needs validation |
| feature/address-final-work-2 | Iteration 2 of customer address flow | user-chef-service | Spring Boot, addresses, geocoding, BFF | P2 | Needs validation |
| feature/address-final-work-3 | Iteration 3 of customer address flow | user-chef-service | Spring Boot, addresses, geocoding, BFF | P2 | Needs validation |
| feature/address-final-work-4 | Iteration 4 of customer address flow | user-chef-service | Spring Boot, addresses, geocoding, BFF | P2 | Needs validation |
| feature/azure-maps-address-autofill | Address autofill integration using Azure Maps | user-chef-service + customer-web-next | Azure Maps, Spring Boot, Next.js forms | P1 | Ready for review |
| agent/customer-web-connected-ui | Connect customer web UI to live backend/BFF contracts | customer-web-next | Next.js app router, BFF, contract wiring | P1 | Ready for review |
| agent/fix-backend-connected-signed-in-flows | Fix authenticated customer flows once backend-connected | customer-web-next + auth/order/customer APIs | BFF routes, auth session, signed-in UX | P1 | Needs validation |
| agent/fix-full-frontend-backend-integration | Broad frontend-backend integration fixes across customer experience | customer-web-next + multiple services | Next.js BFF, service contracts, auth/order/catalog | P1 | Needs validation |
| agent/fix-customer-web-proxy-origin | Fix proxy/origin routing for customer web backend access | customer-web-next + infra | Next.js, proxy config, origin routing | P1 | Needs validation |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM gateway custom domain or routing configuration | platform-infra | APIM, DNS, gateway routing | P0 | Ready for review |
| agent/backend-completion-guarded-release | Backend completion gate before controlled release | platform-infra + backend services | release orchestration, CI/CD, readiness checks | P0 | Needs validation |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression for compatibility | platform-infra | Azure Front Door, caching/compression | P1 | Ready for review |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to address cold-load issues | platform-infra | Azure, origin config, static asset serving | P1 | Needs validation |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices/sessions | platform-infra + frontend | CDN, caching, static assets, Next.js | P1 | Needs validation |
| agent/fix-front-door-cache-validation-cli-288 | Fix Front Door cache validation issue tied to CLI-288 | platform-infra | Azure Front Door, CLI automation, cache rules | P1 | Needs validation |
| agent/fix-front-door-cli-288 | General Front Door CLI issue remediation | platform-infra | Azure Front Door, infrastructure automation | P1 | Needs validation |
| agent/fix-front-door-gzip-cache-bypass | Bypass problematic gzip caching behavior at edge | platform-infra | CDN, Front Door, compression/cache rules | P1 | Needs validation |
| agent/fix-front-door-gzip-rule-validation | Validate and fix gzip rule configuration in Front Door | platform-infra | Azure Front Door, rule engine | P1 | Needs validation |
| agent/fix-front-door-secret-rest | Restore/fix Front Door secret handling | platform-infra | secrets, Front Door, deployment config | P0 | Ready for review |
| agent/fix-front-door-security-policy-cli-288 | Security policy repair for Front Door ruleset | platform-infra | WAF/security policy, Azure CLI, Front Door | P0 | Needs validation |
| agent/fix-static-gzip-cold-loading | Static gzip cold-load remediation branch | platform-infra + frontend | asset serving, gzip, CDN | P1 | Needs validation |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache configuration behavior in Front Door | platform-infra | Azure Front Door, cache policy automation | P1 | Needs validation |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning workflow | platform-infra | Azure Front Door, domain automation, deployment tooling | P1 | Needs validation |
| agent/preserve-afd-custom-domain-waf | Preserve WAF association during custom domain changes | platform-infra | Azure Front Door, WAF, domain config | P0 | Ready for review |
| agent/razorpay-payment-switch | Payment gateway switch targeting Razorpay path | integration-service + web | payment gateway integration, BFF, Spring Boot | P0 | Needs validation |
| android-build | Android/mobile build branch | mobile/build | Android build pipeline, packaging | P2 | Needs validation |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK packaging branch | mobile/build | CI build, APK packaging, QA distribution | P2 | Needs validation |
| ci/subscription-service-predeploy-gate | Predeploy gate for subscription-service rollout | subscription-service + CI | CI pipeline, deployment guardrails | P1 | Ready for review |
| docs/production-release-audit-20260821 | Production release audit documentation branch | docs/release | Markdown docs, release audit | P2 | Ready for review |
| feature/backend-cashfree-production-hardening | Production hardening for Cashfree integration | integration-service | Spring Boot, payments, provider hardening | P0 | Ready for review |
| feature/backend-delivery-provider-production-readiness | Delivery provider readiness and production checks | integration-service | Spring Boot, provider adapters, delivery orchestration | P0 | Ready for review |
| feature/backend-production-readiness-completion | Aggregate backend production-readiness completion work | multi-service backend | readiness endpoints, CI/CD, ops hardening | P0 | Needs validation |
| feature/backend-refund-production-readiness | Refund production readiness and provider-neutral behavior | integration-service + order-service | refund workflow, status consumers, provider adapters | P0 | Ready for review |
| feature/cashfree-production-closeout-20260815 | Cashfree rollout closeout and cleanup | integration-service | payment integration, release closeout | P1 | Needs validation |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Ambiguous accidental branch; likely not intended for merge | unknown | repo hygiene | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup of mobile UI before home refinement work | mobile/web UI | backup snapshot | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | AI-assisted exploration of end-to-end customer-chef journey | multi-service | Spring Boot services, journey integration | P2 | Needs validation |
| copilot/research-task-repository-analysis | Research/analysis branch, likely non-production | docs/research | documentation, repository analysis | P3 | Hold |
| craves-master-guide-v1 | General guide or master reference branch | docs/platform | documentation | P3 | Hold |
| craves-v5-patch-repack | Patch repackaging branch for release artifact maintenance | release/packaging | release engineering, packaging | P2 | Needs validation |
| dispatch-craves-v4 | Dispatch automation or release workflow branch | release/automation | dispatch workflow, automation | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Issue-triggered dispatch automation branch | release/automation | automation, GitHub workflows | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Reopen-triggered dispatch automation branch | release/automation | automation, GitHub workflows | P3 | Hold |
| dispatch-craves-v4-run-2 | Iterative dispatch run branch | release/automation | automation, workflow testing | P3 | Hold |
| dispatch-craves-v4-run-3 | Iterative dispatch run branch | release/automation | automation, workflow testing | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | release/automation | cron/workflow automation | P3 | Hold |
| do-not-use | Explicitly marked non-merge branch | unknown | repo hygiene | P3 | Hold |
| feature/admin-control-center-global-search | Admin control center global search across operational records | user-chef-service + admin web | Spring Boot search API, Next.js admin UI | P1 | Ready for review |
| feature/admin-customer-360-document-review | Admin customer 360 and document review workflows | user-chef-service + admin web | Spring Boot, admin UI, document review | P1 | Ready for review |
| feature/admin-dashboard-v2 | Admin dashboard second-generation experience | order-service + admin web | summary APIs, Next.js admin dashboard | P1 | Ready for review |
| feature/admin-operational-investigations-apim | APIM surface for operational investigation endpoints | order-service/integration-service | APIM, admin operations APIs | P1 | Needs validation |
| feature/admin-operational-investigations-web | Admin web operational investigations console | customer-web-next/admin | Next.js admin UI, BFF, investigation tooling | P1 | Needs validation |
| feature/admin-subscription-operations | Admin operations for subscriptions and incident handling | subscription-service + admin web | Spring Boot, Next.js admin UI, capacity/ops | P1 | Ready for review |
| feature/admin-subscription-plans | Admin management for subscription plans | subscription-service + admin web | Spring Boot, plan policy APIs, Next.js admin UI | P1 | Ready for review |
| feature/admin-web-operations-shell | Shell for admin operations workspace | customer-web-next/admin | Next.js admin shell, navigation, layout | P2 | Needs validation |
| feature/admin-web-shell | Foundational admin shell for all admin experiences | customer-web-next/admin | Next.js admin shell, auth guards, layout | P2 | Ready for review |
| feature/backend-admin-investigation-apis | Backend operational investigation APIs | order-service + integration-service | Spring Boot, admin APIs, audit/research | P1 | Ready for review |
| feature/backend-admin-operations-audit | Audit trail for admin operations | order-service/integration-service | Spring Boot, Flyway, audit logging | P1 | Ready for review |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | Spring Boot, billing, outbox, payment state | P0 | Ready for review |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation engine | subscription-service | Spring Boot, schedulers, occurrence materialization | P0 | Ready for review |
| feature/backend-subscription-order-fulfillment | Subscription occurrences to order fulfillment pipeline | subscription-service + order-service | internal APIs, order dispatch, async workflow | P0 | Ready for review |
| feature/backend-subscription-payment-intents | Subscription payment intent handling | integration-service + subscription-service | payments, invoices, Spring Boot APIs | P0 | Ready for review |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events | subscription-service | Azure Service Bus, status consumer, billing lifecycle | P0 | Ready for review |
| feature/backend-subscription-plan-schedules | Subscription plan scheduling APIs and persistence | subscription-service | Spring Boot, plan schedule controllers, Flyway | P1 | Ready for review |

---

## Full Real Branch Inventory

For audit completeness, below is the flat branch list exactly as discovered:

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
