# BRANCHES.md

Repository: `rmorampudi09-arch/Craves-Build-platform`  
Date: `2026-08-26`  
Total branch count: **100**

This document is the branch inventory and merge handover guide for all currently listed branches in the repository. Branches are grouped by capability domain using branch-name intent and known codebase service boundaries.

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — autonomous or AI-assisted implementation/fix branches
- `feature/` — production feature branches, often backend/admin/ops oriented
- `feat/` — UX/UI feature branches, usually customer/chef/front-end heavy
- `backend-` — backend capability branches without nested prefixing
- `backup/` — snapshot/rollback safety branches
- `build/` — build artifact or QA packaging branches
- `ci/` — pipeline or deployment gate branches
- `docs/` — documentation and release-audit branches
- `chatgpt/`, `copilot/` — research or AI-authored exploration branches
- `dispatch-` — operational trigger/scheduler branches
- unprefixed branches like `android-build`, `do-not-use`, `craves-*` — legacy, packaging, or utility branches

Recommended convention going forward:

```text
feature/<domain>-<capability>
feat/<surface>-<experience>
fix/<surface>-<issue>
docs/<topic>
ci/<pipeline-change>
backup/<snapshot-name>-<date>
```

## Merge policy

- Merge **backend dependency branches before dependent web/admin UI branches**.
- Prefer sequence: **infra → auth/internal controls → backend domain APIs → web/admin UI → polish/docs**.
- Require validation for branches touching payments, notifications, auth, subscriptions, or delivery orchestration.
- Merge one branch set per domain, run smoke tests, then continue.
- Treat `backup/`, `dispatch-*`, `do-not-use`, and accidental branches as **non-merge by default**.
- If two branches appear to overlap, merge the broader/harder backend foundation branch first and manually reconcile UI branches after validation.

Merge readiness legend used below:

- **Ready** — branch name and scope appear production-oriented and mergeable after normal review
- **Review** — likely useful, but needs manual validation for overlap, completeness, or hidden risk
- **Hold** — merge only if explicitly needed; typically backup/ops/experimental/unsafe branches

Priority legend:

- **P0** — critical platform, security, payments, production readiness
- **P1** — important feature completion or core workflow
- **P2** — UX enhancement, optimization, or secondary ops capability
- **P3** — archival, research, backup, packaging, or low-priority utility

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC hardening and role control rollout | auth-service | backend, security, RBAC, internal APIs | P0 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up/internal-admin RBAC v2 completion | auth-service | backend, security, RBAC, Flyway/API | P0 | Ready |
| feature/backend-admin-account-intervention | Backend support for admin account intervention workflows | auth-service | backend, admin APIs, audit, security | P0 | Ready |
| feature/admin-account-intervention-apim | API management exposure/policy layer for account intervention endpoints | auth-service / APIM | infra, gateway, admin APIs, security policy | P1 | Review |
| feature/admin-account-intervention-web | Admin web UI for account intervention operations | customer-web-next admin | web, BFF, admin UI | P1 | Review |
| feature/backend-redis-abuse-revocation | Abuse protection and token revocation strengthening | auth-service | backend, Redis, security filters, auth | P0 | Ready |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/nearby-kitchens-first-discovery | First-pass nearby kitchens discovery experience | catalog-service / customer-web-next | backend, discovery APIs, web UI, search UX | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Iteration on nearby kitchens discovery and ranking/presentation | catalog-service / customer-web-next | backend, discovery APIs, web UI, search UX | P1 | Review |
| feature/advanced-search-smart-filters | Advanced search and smart filtering across discovery/catalog | catalog-service / customer-web-next | backend, search, BFF, UI filters | P1 | Ready |
| feat/customer-landing-discovery-uiux | Discovery-first customer landing experience | customer-web-next | web, landing UX, discovery components | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic landing reference implementation for discovery/marketing pages | customer-web-next | web, content structure, landing UX | P2 | Review |
| feat/landing-reference-20260811 | Landing reference baseline snapshot | customer-web-next | web, UX reference | P3 | Hold |
| feat/landing-reference-refresh | Refreshed landing reference branch | customer-web-next | web, UX reference | P3 | Hold |
| feat/customer-landing-v2-clean-20260808 | Cleaned landing v2 implementation | customer-web-next | web, landing UX, components | P2 | Review |
| agent/landing-body-07cm-inset | Landing page layout adjustment variant | customer-web-next | web, CSS/layout | P3 | Hold |
| agent/landing-body-11cm-inset | Alternate landing page layout adjustment variant | customer-web-next | web, CSS/layout | P3 | Hold |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| backend-customer-reorder-20260816 | Customer reorder backend flow | order-service | backend, orders API, reorder workflow | P1 | Ready |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment UI/UX foundation | customer-web-next | web, checkout UI, BFF, payment UX | P1 | Review |
| feat/customer-orders-tracking-uiux | Customer orders history and tracking UI/UX | customer-web-next | web, orders UI, tracking UX, BFF | P1 | Review |
| agent/fix-chef-registration-and-checkout-contract | Fix checkout contract issues affecting chef registration/checkout interoperability | order-service / customer-web-next | backend, contract alignment, BFF | P1 | Review |
| agent/order-flyway-v14-checksum | Repair Flyway checksum mismatch in order service migration V14 | order-service | backend, Flyway, database | P0 | Review |
| agent/fix-full-frontend-backend-integration | End-to-end frontend/backend integration fixes across checkout and signed-in flows | order-service / customer-web-next | backend, web, BFF, integration | P1 | Review |
| agent/fix-backend-connected-signed-in-flows | Fix authenticated user flows for connected frontend/backend sessions | auth-service / order-service / web | backend, web, session, BFF | P1 | Review |
| chatgpt/backend-customer-chef-journey-20260819 | Backend journey support across customer-chef order lifecycle | order-service / user-chef-service | backend, journey APIs, workflow | P2 | Review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/backend-notification-production-delivery | Production-ready notification delivery path | notification-service | backend, workers, provider adapters, delivery ops | P0 | Ready |
| feature/backend-notification-recovery-operations | Notification recovery and retry operations backend | notification-service | backend, recovery ops, admin APIs | P0 | Ready |
| feature/admin-notification-recovery-apim | APIM/gateway layer for notification recovery operations | notification-service / APIM | infra, gateway, admin APIs | P1 | Review |
| feature/admin-notification-recovery-web | Admin UI for notification recovery actions | customer-web-next admin | web, admin UI, BFF | P1 | Review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/chef-complete-uiux | Chef experience end-to-end UI/UX completion | customer-web-next chef | web, chef UI, dashboard, workflows | P1 | Review |
| agent/fix-chef-entry-and-session-routing | Fix chef entry routing and session bootstrapping | customer-web-next / auth-service | web, auth, routing, BFF | P1 | Review |
| agent/fix-chef-orders-and-customer-palette | Chef orders UI corrections and shared palette consistency | customer-web-next chef | web, chef orders UI, design system | P2 | Review |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI patterns | customer-web-next | web, design system, shared components | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow implementation | user-chef-service / admin web | backend, admin APIs, web UI, document review | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger backend capability | integration-service | backend, payments, ledger, admin/chef APIs | P1 | Ready |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feat/customer-chef-uiux-foundation | Shared UI/UX foundation spanning customer and chef surfaces | customer-web-next | web, shared components, UX foundation | P1 | Review |
| agent/customer-web-connected-ui | Connected customer web UI against live BFF/backend contracts | customer-web-next | web, BFF, integration, session-aware UI | P1 | Review |
| backend-customer-favorites-20260816 | Customer favorites backend support | user-chef-service / catalog-service | backend, favorites APIs, profile/home data | P1 | Ready |
| feature/azure-maps-address-autofill | Address autofill using Azure Maps | customer-web-next / user-chef-service | web, location APIs, geocoding, forms | P1 | Ready |
| feature/address-final-work | Address workflow completion pass 1 | customer-web-next / user-chef-service | web, backend, addresses, BFF | P1 | Review |
| feature/address-final-work-2 | Address workflow completion pass 2 | customer-web-next / user-chef-service | web, backend, addresses, BFF | P1 | Review |
| feature/address-final-work-3 | Address workflow completion pass 3 | customer-web-next / user-chef-service | web, backend, addresses, BFF | P1 | Review |
| feature/address-final-work-4 | Address workflow completion pass 4 | customer-web-next / user-chef-service | web, backend, addresses, BFF | P1 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes | customer-web-next | backup, web snapshot | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinement | mobile/customer UI | backup, mobile snapshot | P3 | Hold |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/apim-gateway-domain-fix | Fix APIM/gateway custom domain behavior | infrastructure / APIM | infra, gateway, domain config | P0 | Review |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression | infrastructure / edge | infra, CDN, edge config | P1 | Review |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to address cold loading issues | infrastructure / frontend delivery | infra, CDN, origin config | P1 | Review |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices | infrastructure / frontend delivery | infra, static hosting, caching | P1 | Review |
| agent/fix-customer-web-proxy-origin | Fix proxy origin configuration for customer web | infrastructure / frontend delivery | infra, proxy, routing | P1 | Review |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation CLI issue fix | infrastructure / Azure Front Door | infra, caching, CLI ops | P1 | Review |
| agent/fix-front-door-cli-288 | General Front Door CLI issue remediation | infrastructure / Azure Front Door | infra, CLI, deployment ops | P1 | Review |
| agent/fix-front-door-gzip-cache-bypass | Bypass/correct gzip caching at Front Door | infrastructure / Azure Front Door | infra, caching, compression | P1 | Review |
| agent/fix-front-door-gzip-rule-validation | Validate/correct Front Door gzip rules | infrastructure / Azure Front Door | infra, rules, compression | P1 | Review |
| agent/fix-front-door-secret-rest | Fix secret restore/REST handling for Front Door config | infrastructure / Azure Front Door | infra, secrets, gateway ops | P1 | Review |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy configuration through CLI | infrastructure / Azure Front Door | infra, security policy, CLI ops | P0 | Review |
| agent/fix-static-gzip-cold-loading | Static gzip and cold load remediation | infrastructure / frontend delivery | infra, static hosting, compression | P1 | Review |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty Front Door cache values in automation | infrastructure / Azure Front Door | infra, caching, automation | P2 | Review |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning | infrastructure / Azure Front Door | infra, provisioning, automation | P2 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF when updating AFD custom domains | infrastructure / Azure Front Door | infra, WAF, domain config | P0 | Review |
| ci/subscription-service-predeploy-gate | Predeploy validation gate for subscription service | CI/CD | pipeline, deployment validation, subscription | P1 | Ready |
| docs/production-release-audit-20260821 | Production release audit documentation | docs / release process | docs, audit, release management | P2 | Ready |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK build branch | mobile / build | build, QA packaging, mobile | P3 | Hold |
| android-build | Android build-focused branch | mobile / build | mobile, build, packaging | P3 | Review |
| feature/backend-production-readiness-completion | Cross-service production readiness completion | multiple backend services | backend, hardening, ops, release readiness | P0 | Ready |
| feature/backend-cashfree-production-hardening | Cashfree production hardening backend work | integration-service | backend, payments, hardening | P0 | Ready |
| feature/backend-delivery-provider-production-readiness | Delivery provider production readiness | integration-service | backend, delivery providers, ops readiness | P0 | Ready |
| feature/backend-refund-production-readiness | Refund flow production readiness | integration-service / order-service | backend, refunds, ops readiness | P0 | Ready |
| feature/cashfree-production-closeout-20260815 | Cashfree closeout and final production prep | integration-service | backend, payments, release closeout | P1 | Review |
| feature/backend-launch-policy-enforcement | Launch policy enforcement backend controls | order-service / platform control | backend, policy, release controls | P0 | Ready |
| agent/backend-completion-guarded-release | Guarded release branch for backend completion | multiple backend services | backend, release control, ops | P0 | Review |
| agent/fix-chef-release-traffic-verification | Verify release traffic behavior for chef surface | infrastructure / web delivery | infra, traffic validation, release ops | P1 | Review |
| agent/razorpay-payment-switch | Payment provider switching toward Razorpay path | integration-service / customer-web-next | backend, payments, web integration | P0 | Review |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-control-center-global-search | Global search in admin control center | admin web / user-chef-service | web, BFF, backend search, admin UX | P1 | Ready |
| feature/admin-customer-360-document-review | Customer 360 and document review admin workflows | admin web / user-chef-service | web, backend, admin APIs, review tooling | P1 | Ready |
| feature/admin-dashboard-v2 | Admin dashboard v2 experience | admin web / order-service | web, analytics UI, admin summary APIs | P1 | Ready |
| feature/admin-operational-investigations-apim | APIM layer for admin operational investigations | integration-service / order-service / APIM | infra, gateway, admin APIs | P1 | Review |
| feature/admin-operational-investigations-web | Admin operational investigations web experience | admin web | web, BFF, investigations UI | P1 | Review |
| feature/admin-subscription-operations | Admin subscription operations experience | subscription-service / admin web | backend, admin APIs, web UI | P1 | Ready |
| feature/admin-subscription-plans | Admin subscription plan management | subscription-service / admin web | backend, admin APIs, plan management UI | P1 | Ready |
| feature/admin-web-operations-shell | Operations-oriented admin shell | admin web | web, layout, navigation, admin shell | P2 | Review |
| feature/admin-web-shell | Base admin shell/foundation | admin web | web, layout, navigation, shell | P1 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | order-service / integration-service | backend, admin APIs, audit, ops tooling | P1 | Ready |
| feature/backend-admin-operations-audit | Backend audit capability for admin operations | auth-service / order-service / integration-service | backend, audit, ops controls | P1 | Ready |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service | backend, billing, workers, persistence | P1 | Ready |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation workflows | subscription-service | backend, scheduler, lifecycle, persistence | P1 | Ready |
| feature/backend-subscription-order-fulfillment | Subscription-driven order fulfillment | subscription-service / order-service | backend, events, order orchestration | P1 | Ready |
| feature/backend-subscription-payment-intents | Subscription payment intent creation flow | subscription-service / integration-service | backend, payments, invoices, APIs | P1 | Ready |
| feature/backend-subscription-payment-status-consumer | Subscription payment status consumer integration | subscription-service | backend, event consumer, payments, state transitions | P1 | Ready |
| feature/backend-subscription-plan-schedules | Subscription plan schedules backend | subscription-service | backend, scheduling, public/admin APIs | P1 | Ready |
| craves-master-guide-v1 | Master guide or reference branch | docs / platform | docs, reference material | P3 | Hold |
| craves-v5-patch-repack | Patch repackaging branch | release / packaging | release engineering, packaging | P3 | Hold |
| dispatch-craves-v4 | Dispatch/automation trigger branch baseline | operations automation | automation, trigger, release ops | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue-trigger automation branch | operations automation | automation, trigger | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen-trigger automation branch | operations automation | automation, trigger | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch automation run branch 2 | operations automation | automation, trigger | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch automation run branch 3 | operations automation | automation, trigger | P3 | Hold |
| dispatch-craves-v4-schedule | Scheduled dispatch automation branch | operations automation | automation, scheduler | P3 | Hold |
| copilot/research-task-repository-analysis | Repository analysis research branch | docs / research | research, documentation | P3 | Hold |
| accidental-ignore-7 | Accidental/temporary branch; do not merge without explicit validation | unknown | miscellaneous | P3 | Hold |
| do-not-use | Explicit non-merge branch | unknown | miscellaneous | P3 | Hold |

## Complete branch inventory

For quick auditing, here is the full real branch list captured from the GitHub branch API on 2026-08-26:

```text
accidental-ignore-7
agent/apim-gateway-domain-fix
agent/backend-completion-guarded-release
agent/backend-internal-admin-rbac
agent/customer-web-connected-ui
agent/disable-afd-edge-compression
agent/disable-origin-gzip-for-cold-loading
agent/fix-backend-connected-signed-in-flows
agent/fix-chef-entry-and-session-routing
agent/fix-chef-orders-and-customer-palette
agent/fix-chef-registration-and-checkout-contract
agent/fix-chef-release-traffic-verification
agent/fix-cold-device-static-loading
agent/fix-customer-web-proxy-origin
agent/fix-front-door-cache-validation-cli-288
agent/fix-front-door-cli-288
agent/fix-front-door-gzip-cache-bypass
agent/fix-front-door-gzip-rule-validation
agent/fix-front-door-secret-rest
agent/fix-front-door-security-policy-cli-288
agent/fix-full-frontend-backend-integration
agent/fix-static-gzip-cold-loading
agent/landing-body-07cm-inset
agent/landing-body-11cm-inset
agent/nearby-kitchens-first-discovery
agent/nearby-kitchens-first-discovery-v2
agent/normalize-empty-front-door-cache-cli-288
agent/order-flyway-v14-checksum
agent/parallel-front-door-domain-provisioning
agent/preserve-afd-custom-domain-waf
agent/razorpay-payment-switch
agent/unify-chef-panel-customer-ui
android-build
backend-customer-favorites-20260816
backend-customer-reorder-20260816
backup/customer-web-before-landing-v2-20260808
backup/mobile-ui-before-home-refinement-2026-08-16
build/qa-mobile-apk-2026-08-20
chatgpt/backend-customer-chef-journey-20260819
ci/subscription-service-predeploy-gate
copilot/research-task-repository-analysis
craves-master-guide-v1
craves-v5-patch-repack
dispatch-craves-v4
dispatch-craves-v4-issue-trigger
dispatch-craves-v4-reopen-trigger
dispatch-craves-v4-run-2
dispatch-craves-v4-run-3
dispatch-craves-v4-schedule
do-not-use
docs/production-release-audit-20260821
feat/chef-complete-uiux
feat/customer-cart-checkout-payment-uiux
feat/customer-chef-uiux-foundation
feat/customer-landing-discovery-uiux
feat/customer-landing-v2-clean-20260808
feat/customer-orders-tracking-uiux
feat/customer-web-semantic-reference-landing
feat/landing-reference-20260811
feat/landing-reference-refresh
feature/address-final-work
feature/address-final-work-2
feature/address-final-work-3
feature/address-final-work-4
feature/admin-account-intervention-apim
feature/admin-account-intervention-web
feature/admin-chef-review
feature/admin-control-center-global-search
feature/admin-customer-360-document-review
feature/admin-dashboard-v2
feature/admin-notification-recovery-apim
feature/admin-notification-recovery-web
feature/admin-operational-investigations-apim
feature/admin-operational-investigations-web
feature/admin-subscription-operations
feature/admin-subscription-plans
feature/admin-web-operations-shell
feature/admin-web-shell
feature/advanced-search-smart-filters
feature/azure-maps-address-autofill
feature/backend-admin-account-intervention
feature/backend-admin-investigation-apis
feature/backend-admin-operations-audit
feature/backend-cashfree-production-hardening
feature/backend-chef-financial-ledger
feature/backend-delivery-provider-production-readiness
feature/backend-internal-admin-rbac-v2
feature/backend-launch-policy-enforcement
feature/backend-notification-production-delivery
feature/backend-notification-recovery-operations
feature/backend-production-readiness-completion
feature/backend-redis-abuse-revocation
feature/backend-refund-production-readiness
feature/backend-subscription-billing-lifecycle
feature/backend-subscription-occurrence-generator
feature/backend-subscription-order-fulfillment
feature/backend-subscription-payment-intents
feature/backend-subscription-payment-status-consumer
feature/backend-subscription-plan-schedules
feature/cashfree-production-closeout-20260815
```

## Recommended merge order

1. **Infra and safety controls**
   - `feature/backend-production-readiness-completion`
   - `feature/backend-launch-policy-enforcement`
   - `feature/backend-redis-abuse-revocation`
   - critical `agent/fix-front-door*`, `agent/apim-gateway-domain-fix`, `agent/preserve-afd-custom-domain-waf`

2. **Auth/admin control plane**
   - `feature/backend-admin-account-intervention`
   - `feature/backend-internal-admin-rbac-v2`
   - `feature/backend-admin-operations-audit`
   - then corresponding `feature/admin-account-intervention-*`

3. **Notifications**
   - `feature/backend-notification-production-delivery`
   - `feature/backend-notification-recovery-operations`
   - then `feature/admin-notification-recovery-*`

4. **Subscription backend foundations**
   - `feature/backend-subscription-plan-schedules`
   - `feature/backend-subscription-billing-lifecycle`
   - `feature/backend-subscription-payment-intents`
   - `feature/backend-subscription-payment-status-consumer`
   - `feature/backend-subscription-occurrence-generator`
   - `feature/backend-subscription-order-fulfillment`
   - then `feature/admin-subscription-*`

5. **Payments/delivery production hardening**
   - `feature/backend-cashfree-production-hardening`
   - `feature/backend-delivery-provider-production-readiness`
   - `feature/backend-refund-production-readiness`
   - `feature/cashfree-production-closeout-20260815`
   - `agent/razorpay-payment-switch`

6. **Customer core flows**
   - `backend-customer-favorites-20260816`
   - `backend-customer-reorder-20260816`
   - address branches after selecting the latest valid variant
   - then customer UX branches (`feat/customer-*`, `agent/customer-web-connected-ui`)

7. **Chef/admin experience branches**
   - `feature/admin-chef-review`
   - `feature/backend-chef-financial-ledger`
   - `feat/chef-complete-uiux`
   - chef routing and panel unification fixes

8. **Hold/backups/research/dispatch**
   - Do not merge unless explicitly required.
