# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated:** 2026-08-26  
**Total branches:** 100

This document is the branch inventory and merge handover for the Craves platform. It consolidates all currently listed GitHub branches, groups them by domain, and provides practical merge guidance for moving work safely into `main`.

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — agent-created fixes, rollout, infra, UI integration, and release hardening work
- `feature/` — product or platform feature branches, usually scoped to a service or admin capability
- `feat/` — frontend/UIUX feature branches
- `backend-` — backend feature delivery branches without a namespace prefix
- `backup/` — preservation/snapshot branches; do not merge without explicit need
- `build/` — build artifact or QA packaging branches
- `ci/` — CI/CD and deployment gate branches
- `docs/` — documentation or audit branches
- `chatgpt/`, `copilot/` — AI-assisted exploratory or implementation branches
- `dispatch-`, `android-build`, `craves-*`, `do-not-use`, `accidental-*` — operational, packaging, or legacy branches requiring manual review

## Merge policy

1. Merge into `main` only through reviewed PRs.
2. Prefer this order:
   - auth and RBAC foundations
   - infra/platform readiness
   - backend feature services
   - frontend/BFF integration
   - admin tools
   - experimental/reference/backup branches last or never
3. For branches touching Flyway migrations, verify migration ordering and checksum compatibility before merge.
4. For frontend branches, confirm corresponding backend/BFF contracts already exist or merge backend first.
5. For infra and Front Door branches, validate environment-specific settings in non-production first.
6. `backup/`, `do-not-use`, `accidental-*`, and dispatch/package branches should generally be retained as references, not merged.

## Merge readiness legend

- **Ready** — branch purpose is clear and appears aligned to committed platform direction
- **Review** — likely mergeable after code review, validation, and dependency checks
- **Sequence** — should merge only after prerequisite branches/services
- **Hold** — preserve but do not merge until explicitly needed
- **Do not merge** — branch name or purpose indicates it should not be merged directly

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC enablement and role enforcement hardening. | auth-service | backend, security, database | High | Sequence |
| `feature/backend-internal-admin-rbac-v2` | Follow-up version of internal admin RBAC with likely expanded role model. | auth-service | backend, security, database | High | Review |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token revocation improvements. | auth-service | backend, security, redis | High | Review |
| `feature/backend-admin-account-intervention` | Backend admin account intervention flows for support and risk handling. | auth-service | backend, admin api, security | High | Review |
| `feature/admin-account-intervention-apim` | APIM exposure/configuration for admin account intervention APIs. | auth-service / APIM | apim, backend gateway, security | Medium | Sequence |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention workflows. | admin-web / auth-service | frontend, bff, admin ui | Medium | Sequence |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchens-first discovery experience and query shaping. | catalog-service | backend, discovery, frontend integration | High | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration on kitchens-first discovery with likely UX or ranking refinements. | catalog-service | backend, discovery, frontend integration | High | Sequence |
| `backend-customer-favorites-20260816` | Backend support for customer favorites and saved menu item flows. | user-chef-service / catalog-service | backend, api, database | Medium | Review |
| `feature/advanced-search-smart-filters` | Advanced search and smart filter capabilities for discovery. | catalog-service | backend, search, frontend | High | Review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Customer reorder flow built on existing repeat-order capability. | order-service | backend, api, database | High | Review |
| `agent/order-flyway-v14-checksum` | Fix for order-service Flyway checksum/version issue. | order-service | backend, database, migration | High | Sequence |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production-grade notification delivery improvements across channels. | notification-service | backend, worker, provider integration | High | Review |
| `feature/backend-notification-recovery-operations` | Recovery operations for failed notifications and replay workflows. | notification-service | backend, admin api, worker | High | Review |
| `feature/admin-notification-recovery-apim` | APIM surface for admin notification recovery operations. | notification-service / APIM | apim, backend gateway | Medium | Sequence |
| `feature/admin-notification-recovery-web` | Admin web recovery UI for notification incidents. | admin-web / notification-service | frontend, bff, admin ui | Medium | Sequence |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fix chef entry paths and authenticated session routing. | customer-web-next / user-chef-service | frontend, bff, auth integration | High | Review |
| `agent/fix-chef-orders-and-customer-palette` | Chef orders UI fixes plus shared customer palette adjustments. | customer-web-next / order-service | frontend, bff, ui | Medium | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Fix contract mismatches across chef registration and checkout related flows. | user-chef-service / order-service | backend, frontend, contracts | High | Review |
| `agent/unify-chef-panel-customer-ui` | Unify visual and route conventions between chef panel and customer UI. | customer-web-next | frontend, design system, routing | Medium | Review |
| `feat/chef-complete-uiux` | Full chef-facing UI/UX refinement branch. | customer-web-next | frontend, uiux | High | Review |
| `feature/admin-chef-review` | Admin chef review workflow enhancements. | user-chef-service / admin-web | backend, frontend, admin ui | High | Review |
| `feature/backend-chef-financial-ledger` | Chef financial ledger implementation and reporting support. | integration-service | backend, finance, database | High | Review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connect customer web UI to live backend/BFF flows. | customer-web-next | frontend, bff, integration | High | Review |
| `agent/fix-backend-connected-signed-in-flows` | Repair signed-in customer journeys across connected flows. | customer-web-next / auth-service | frontend, bff, auth | High | Review |
| `agent/fix-full-frontend-backend-integration` | End-to-end frontend/backend integration fixes across customer journeys. | platform-wide | frontend, backend, bff | High | Review |
| `agent/fix-customer-web-proxy-origin` | Fix origin/proxy issues in customer web backend-for-frontend traffic. | customer-web-next | frontend, proxy, infra | Medium | Review |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UI/UX improvements. | customer-web-next | frontend, uiux, payments | High | Sequence |
| `feat/customer-chef-uiux-foundation` | Shared UI foundation spanning customer and chef surfaces. | customer-web-next | frontend, design system | Medium | Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UX improvements. | customer-web-next | frontend, uiux, discovery | High | Review |
| `feat/customer-orders-tracking-uiux` | Customer order history and tracking UX improvements. | customer-web-next | frontend, uiux, order tracking | High | Review |
| `feature/address-final-work` | Customer address workflow completion. | user-chef-service / customer-web-next | backend, frontend, maps | High | Review |
| `feature/address-final-work-2` | Follow-up address workflow fixes and polish. | user-chef-service / customer-web-next | backend, frontend, maps | Medium | Sequence |
| `feature/address-final-work-3` | Additional address workflow iteration. | user-chef-service / customer-web-next | backend, frontend, maps | Medium | Sequence |
| `feature/address-final-work-4` | Final address iteration branch in the series. | user-chef-service / customer-web-next | backend, frontend, maps | Medium | Sequence |
| `feature/azure-maps-address-autofill` | Azure Maps-based address autofill for customer address entry. | user-chef-service / customer-web-next | backend, frontend, maps api | High | Review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fix APIM gateway domain configuration. | infra / APIM | infra, gateway, dns | High | Review |
| `agent/backend-completion-guarded-release` | Guarded release orchestration after backend completion milestones. | infra / platform | release, ci/cd, backend | High | Sequence |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to address delivery issues. | infra / Front Door | infra, cdn, networking | Medium | Review |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip to improve cold asset loading behavior. | infra / Front Door | infra, cdn, performance | Medium | Review |
| `agent/fix-chef-release-traffic-verification` | Verify traffic routing during chef release rollout. | infra / release | infra, routing, release | Medium | Review |
| `agent/fix-cold-device-static-loading` | Resolve static asset loading on cold devices. | infra / frontend delivery | infra, frontend delivery, caching | Medium | Review |
| `agent/fix-front-door-cache-validation-cli-288` | Fix Front Door cache validation issue tracked under CLI-288. | infra / Front Door | infra, cdn, validation | Medium | Review |
| `agent/fix-front-door-cli-288` | General Front Door remediation for CLI-288 issues. | infra / Front Door | infra, cdn | Medium | Review |
| `agent/fix-front-door-gzip-cache-bypass` | Fix gzip and cache bypass behavior at the edge. | infra / Front Door | infra, cdn, caching | Medium | Review |
| `agent/fix-front-door-gzip-rule-validation` | Correct Front Door gzip rule validation. | infra / Front Door | infra, cdn, rules | Medium | Review |
| `agent/fix-front-door-secret-rest` | Fix secret handling or REST configuration for Front Door integration. | infra / Front Door | infra, secrets, networking | Medium | Review |
| `agent/fix-front-door-security-policy-cli-288` | Fix security policy validation for Front Door under CLI-288. | infra / Front Door | infra, security, waf | High | Review |
| `agent/fix-static-gzip-cold-loading` | Improve static gzip handling during cold starts. | infra / frontend delivery | infra, performance, caching | Medium | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty cache configuration behavior in Front Door. | infra / Front Door | infra, caching, config | Low | Review |
| `agent/parallel-front-door-domain-provisioning` | Parallelize Front Door custom domain provisioning. | infra / Front Door | infra, automation, dns | Medium | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF associations while changing Front Door custom domains. | infra / Front Door | infra, waf, dns | High | Review |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service predeploy safety. | infra / CI | ci/cd, subscription-service | Medium | Review |
| `feature/backend-cashfree-production-hardening` | Production hardening of Cashfree payment integration. | integration-service | backend, payments, ops | High | Review |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider production-readiness work. | integration-service | backend, delivery integrations, ops | High | Review |
| `feature/backend-launch-policy-enforcement` | Launch policy enforcement across production rollout paths. | order-service / platform | backend, policy, ops | High | Review |
| `feature/backend-production-readiness-completion` | General platform production-readiness completion branch. | platform-wide | backend, ops, readiness | High | Sequence |
| `feature/backend-refund-production-readiness` | Refund flow production hardening and readiness checks. | integration-service | backend, payments, refunds | High | Review |
| `feature/cashfree-production-closeout-20260815` | Closeout/finalization branch for Cashfree production rollout. | integration-service | backend, payments, ops | Medium | Sequence |
| `android-build` | Android build support or packaging branch. | mobile / build | build, mobile | Low | Hold |
| `build/qa-mobile-apk-2026-08-20` | QA APK packaging branch. | mobile / build | build, qa, mobile | Low | Hold |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Accidental or scratch branch; unclear product value. | unknown | misc | Low | Do not merge |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 changes. | customer-web-next | backup, frontend | Low | Hold |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile UI refinement. | mobile | backup, frontend | Low | Hold |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work for customer-chef journey connectivity. | platform-wide | backend, api, workflow | Medium | Review |
| `copilot/research-task-repository-analysis` | AI-assisted repository analysis branch; documentation/research oriented. | docs / platform | docs, analysis | Low | Hold |
| `craves-master-guide-v1` | Repository guide or packaging reference branch. | docs / platform | docs | Low | Hold |
| `craves-v5-patch-repack` | Patch repackaging branch for release artifact work. | release / packaging | release, packaging | Low | Hold |
| `dispatch-craves-v4` | Dispatch/release automation branch. | release / automation | release, automation | Low | Hold |
| `dispatch-craves-v4-issue-trigger` | Dispatch automation issue trigger branch. | release / automation | automation | Low | Hold |
| `dispatch-craves-v4-reopen-trigger` | Dispatch automation reopen trigger branch. | release / automation | automation | Low | Hold |
| `dispatch-craves-v4-run-2` | Dispatch automation run branch. | release / automation | automation | Low | Hold |
| `dispatch-craves-v4-run-3` | Dispatch automation run branch. | release / automation | automation | Low | Hold |
| `dispatch-craves-v4-schedule` | Dispatch scheduled automation branch. | release / automation | automation | Low | Hold |
| `do-not-use` | Explicitly marked branch not intended for merge. | unknown | misc | Low | Do not merge |
| `docs/production-release-audit-20260821` | Documentation branch for production release audit. | docs / platform | docs, audit | Medium | Review |
| `feat/customer-landing-v2-clean-20260808` | Clean landing page v2 implementation branch. | customer-web-next | frontend, uiux | Medium | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic reference implementation for landing page. | customer-web-next | frontend, reference ui | Low | Hold |
| `feat/landing-reference-20260811` | Landing page reference branch. | customer-web-next | frontend, reference ui | Low | Hold |
| `feat/landing-reference-refresh` | Refresh of landing reference implementation. | customer-web-next | frontend, reference ui | Low | Hold |
| `feature/admin-control-center-global-search` | Admin global search/control center experience. | admin-web / user-chef-service | frontend, backend, admin search | High | Review |
| `feature/admin-customer-360-document-review` | Admin customer 360 and document review workflows. | admin-web / user-chef-service | frontend, backend, admin ui | High | Review |
| `feature/admin-dashboard-v2` | Improved admin dashboard summary and operations views. | admin-web / order-service | frontend, backend, admin analytics | High | Review |
| `feature/admin-operational-investigations-apim` | APIM layer for admin operational investigation APIs. | integration-service / APIM | apim, backend gateway | Medium | Sequence |
| `feature/admin-operational-investigations-web` | Admin web for operational investigations. | admin-web / integration-service | frontend, bff, admin ui | High | Sequence |
| `feature/admin-subscription-operations` | Admin subscription operations workflows. | subscription-service / admin-web | backend, frontend, admin ops | High | Review |
| `feature/admin-subscription-plans` | Admin subscription plan management experience. | subscription-service / admin-web | backend, frontend, admin ui | High | Review |
| `feature/admin-web-operations-shell` | Admin operations shell/foundation UI. | admin-web | frontend, shell, design system | Medium | Review |
| `feature/admin-web-shell` | Base admin shell and navigation foundation. | admin-web | frontend, shell | Medium | Sequence |
| `feature/backend-admin-investigation-apis` | Backend APIs for admin investigations. | integration-service / order-service | backend, admin api | High | Review |
| `feature/backend-admin-operations-audit` | Backend audit trails for admin operations. | platform-wide | backend, audit, security | High | Review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle implementation. | subscription-service | backend, billing, worker | High | Review |
| `feature/backend-subscription-occurrence-generator` | Subscription occurrence generator worker enhancements. | subscription-service | backend, scheduler, database | High | Review |
| `feature/backend-subscription-order-fulfillment` | Subscription order fulfillment workflow. | subscription-service / order-service | backend, workflow, integration | High | Review |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and orchestration. | integration-service / subscription-service | backend, payments, api | High | Review |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service | backend, messaging, worker | High | Review |
| `feature/backend-subscription-plan-schedules` | Subscription plan schedule modeling and APIs. | subscription-service | backend, scheduling, api | High | Review |
| `agent/landing-body-07cm-inset` | Landing page layout tweak branch with 7cm inset variant. | customer-web-next | frontend, ui experiment | Low | Hold |
| `agent/landing-body-11cm-inset` | Landing page layout tweak branch with 11cm inset variant. | customer-web-next | frontend, ui experiment | Low | Hold |
| `agent/razorpay-payment-switch` | Switch or enable Razorpay payment path. | integration-service / customer-web-next | backend, frontend, payments | High | Review |

## Full branch inventory

For completeness, the repository currently contains these 100 branches:

- accidental-ignore-7
- agent/apim-gateway-domain-fix
- agent/backend-completion-guarded-release
- agent/backend-internal-admin-rbac
- agent/customer-web-connected-ui
- agent/disable-afd-edge-compression
- agent/disable-origin-gzip-for-cold-loading
- agent/fix-backend-connected-signed-in-flows
- agent/fix-chef-entry-and-session-routing
- agent/fix-chef-orders-and-customer-palette
- agent/fix-chef-registration-and-checkout-contract
- agent/fix-chef-release-traffic-verification
- agent/fix-cold-device-static-loading
- agent/fix-customer-web-proxy-origin
- agent/fix-front-door-cache-validation-cli-288
- agent/fix-front-door-cli-288
- agent/fix-front-door-gzip-cache-bypass
- agent/fix-front-door-gzip-rule-validation
- agent/fix-front-door-secret-rest
- agent/fix-front-door-security-policy-cli-288
- agent/fix-full-frontend-backend-integration
- agent/fix-static-gzip-cold-loading
- agent/landing-body-07cm-inset
- agent/landing-body-11cm-inset
- agent/nearby-kitchens-first-discovery
- agent/nearby-kitchens-first-discovery-v2
- agent/normalize-empty-front-door-cache-cli-288
- agent/order-flyway-v14-checksum
- agent/parallel-front-door-domain-provisioning
- agent/preserve-afd-custom-domain-waf
- agent/razorpay-payment-switch
- agent/unify-chef-panel-customer-ui
- android-build
- backend-customer-favorites-20260816
- backend-customer-reorder-20260816
- backup/customer-web-before-landing-v2-20260808
- backup/mobile-ui-before-home-refinement-2026-08-16
- build/qa-mobile-apk-2026-08-20
- chatgpt/backend-customer-chef-journey-20260819
- ci/subscription-service-predeploy-gate
- copilot/research-task-repository-analysis
- craves-master-guide-v1
- craves-v5-patch-repack
- dispatch-craves-v4
- dispatch-craves-v4-issue-trigger
- dispatch-craves-v4-reopen-trigger
- dispatch-craves-v4-run-2
- dispatch-craves-v4-run-3
- dispatch-craves-v4-schedule
- do-not-use
- docs/production-release-audit-20260821
- feat/chef-complete-uiux
- feat/customer-cart-checkout-payment-uiux
- feat/customer-chef-uiux-foundation
- feat/customer-landing-discovery-uiux
- feat/customer-landing-v2-clean-20260808
- feat/customer-orders-tracking-uiux
- feat/customer-web-semantic-reference-landing
- feat/landing-reference-20260811
- feat/landing-reference-refresh
- feature/address-final-work
- feature/address-final-work-2
- feature/address-final-work-3
- feature/address-final-work-4
- feature/admin-account-intervention-apim
- feature/admin-account-intervention-web
- feature/admin-chef-review
- feature/admin-control-center-global-search
- feature/admin-customer-360-document-review
- feature/admin-dashboard-v2
- feature/admin-notification-recovery-apim
- feature/admin-notification-recovery-web
- feature/admin-operational-investigations-apim
- feature/admin-operational-investigations-web
- feature/admin-subscription-operations
- feature/admin-subscription-plans
- feature/admin-web-operations-shell
- feature/admin-web-shell
- feature/advanced-search-smart-filters
- feature/azure-maps-address-autofill
- feature/backend-admin-account-intervention
- feature/backend-admin-investigation-apis
- feature/backend-admin-operations-audit
- feature/backend-cashfree-production-hardening
- feature/backend-chef-financial-ledger
- feature/backend-delivery-provider-production-readiness
- feature/backend-internal-admin-rbac-v2
- feature/backend-launch-policy-enforcement
- feature/backend-notification-production-delivery
- feature/backend-notification-recovery-operations
- feature/backend-production-readiness-completion
- feature/backend-redis-abuse-revocation
- feature/backend-refund-production-readiness
- feature/backend-subscription-billing-lifecycle
- feature/backend-subscription-occurrence-generator
- feature/backend-subscription-order-fulfillment
- feature/backend-subscription-payment-intents
- feature/backend-subscription-payment-status-consumer
- feature/backend-subscription-plan-schedules
- feature/cashfree-production-closeout-20260815

## Recommended merge sequence

1. `feature/backend-redis-abuse-revocation`
2. `agent/backend-internal-admin-rbac`
3. `feature/backend-internal-admin-rbac-v2`
4. `feature/backend-admin-account-intervention`
5. `feature/backend-admin-operations-audit`
6. `feature/backend-cashfree-production-hardening`
7. `feature/backend-delivery-provider-production-readiness`
8. `feature/backend-refund-production-readiness`
9. `feature/backend-launch-policy-enforcement`
10. `feature/backend-notification-production-delivery`
11. `feature/backend-notification-recovery-operations`
12. `feature/backend-subscription-billing-lifecycle`
13. `feature/backend-subscription-occurrence-generator`
14. `feature/backend-subscription-plan-schedules`
15. `feature/backend-subscription-payment-intents`
16. `feature/backend-subscription-payment-status-consumer`
17. `feature/backend-subscription-order-fulfillment`
18. `backend-customer-favorites-20260816`
19. `backend-customer-reorder-20260816`
20. `feature/advanced-search-smart-filters`
21. `feature/azure-maps-address-autofill`
22. `feature/admin-dashboard-v2`
23. `feature/admin-chef-review`
24. `feature/admin-subscription-operations`
25. `feature/admin-subscription-plans`
26. `agent/customer-web-connected-ui`
27. `agent/fix-full-frontend-backend-integration`
28. `feat/customer-cart-checkout-payment-uiux`
29. `feat/customer-orders-tracking-uiux`
30. `feat/chef-complete-uiux`

Branches marked Hold or Do not merge should remain out of the merge queue unless explicitly required.
