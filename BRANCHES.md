# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated:** `2026-08-26`  
**Total branch count:** `93`

## Branch naming convention

This repository currently uses a mixed branch naming strategy that reflects feature work, agent-driven fixes, environment work, backups, and operational automation.

### Common prefixes

- `main` — stable integration branch when present as default branch target for merges.
- `feature/` — product or backend feature branches.
- `feat/` — UI/UX and frontend-oriented feature branches.
- `agent/` — autonomous agent-created fixes, release hardening, and infrastructure adjustments.
- `backend-` — backend capability branches using date-stamped naming.
- `backup/` — safety snapshots before large UI or product changes.
- `build/` — build artifact or QA packaging branches.
- `ci/` — CI/CD enforcement or deployment gate work.
- `docs/` — release audit or documentation work.
- `dispatch-` — workflow automation and scheduled dispatch triggers.
- `chatgpt/`, `copilot/` — research or assisted implementation work.

### Naming guidance going forward

Recommended standard:

```text
feature/<domain>-<capability>
feat/<surface>-<ux-scope>
fix/<service>-<issue>
infra/<platform-change>
docs/<artifact>
```

### Category mapping used in this document

Branches are grouped into the following handover categories:

- **auth** — authentication, session, RBAC, admin identity intervention
- **catalog** — discovery, favorites, landing, kitchens, address lookup/search
- **orders** — cart, checkout, reorder, launch policy, payment switching, order flow
- **notifications** — notification delivery and recovery capabilities
- **chef** — chef onboarding, chef UI, chef review, chef orders, chef panel work
- **customer** — customer-facing web/mobile/profile/journey work not better classified elsewhere
- **infra** — CI/CD, Front Door, APIM, release hardening, environment, build, backup, dispatch, docs
- **feature** — cross-domain platform initiatives, admin surfaces, subscriptions, integration, financials, search

## Merge policy

### Merge order

1. **Infra and platform safety fixes first**
   - Front Door / APIM / compression / secret / routing / production readiness
2. **Backend contract and service branches second**
   - auth, notification, integration, subscription, order-service foundations
3. **Domain UX branches third**
   - chef, customer, catalog, checkout, tracking
4. **Admin and operational surfaces next**
   - investigation, recovery, dashboard, subscription operations
5. **Backups, experiments, and obsolete branches last or never**
   - merge only if specifically needed for recovery

### Readiness labels used here

- **Ready** — purpose is clear and likely mergeable after normal checks.
- **Review** — useful branch but needs code review / regression verification.
- **Validate** — requires environment or contract validation before merge.
- **Hold** — backup, duplicate, trigger, or ambiguous branch; do not merge by default.

### Priority labels used here

- **P0** — production/platform critical
- **P1** — high-value feature or release blocker
- **P2** — important but not blocking
- **P3** — optional, backup, research, or operationally low priority

### General merge guidance

- Rebase onto `main` before opening final PR.
- Validate backend/frontend contracts for branches that touch BFF or service APIs.
- Apply Flyway ordering checks for backend service branches.
- Run smoke tests for auth, catalog, checkout, payments, chef orders, and notifications after each merge batch.
- Do not merge `backup/*`, `do-not-use`, `accidental-ignore-*`, or dispatch trigger branches unless explicitly required.

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/backend-internal-admin-rbac | Internal admin RBAC implementation and enforcement | auth-service | Backend API, security, RBAC, Flyway | P1 | Review |
| feature/admin-account-intervention-apim | Admin account intervention API management / gateway exposure | auth-service / APIM | APIM, backend contract, auth admin ops | P1 | Validate |
| feature/admin-account-intervention-web | Admin web UI for account intervention workflows | admin-portal / customer-web-next | Frontend UI, BFF, admin workflows | P1 | Review |
| feature/backend-admin-account-intervention | Backend admin account intervention workflow implementation | auth-service | Backend API, persistence, audit | P1 | Review |
| feature/backend-internal-admin-rbac-v2 | Follow-up/internal RBAC hardening for admin roles | auth-service | Backend API, security, migration | P1 | Review |
| feature/backend-redis-abuse-revocation | Redis-backed abuse controls and token revocation hardening | auth-service | Security, Redis, backend auth | P1 | Ready |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/landing-body-07cm-inset | Landing page presentation adjustment | customer-web-next | Frontend UI, styling | P3 | Review |
| agent/landing-body-11cm-inset | Landing page presentation adjustment variant | customer-web-next | Frontend UI, styling | P3 | Review |
| agent/nearby-kitchens-first-discovery | Nearby kitchens-first discovery experience | catalog-service / customer-web-next | Backend discovery API, BFF, frontend | P1 | Review |
| agent/nearby-kitchens-first-discovery-v2 | Refined nearby kitchens-first discovery flow | catalog-service / customer-web-next | Backend discovery API, BFF, frontend | P1 | Review |
| backend-customer-favorites-20260816 | Backend customer favorites persistence and APIs | user-chef-service / catalog-service | Backend API, SQL, BFF integration | P1 | Ready |
| feat/customer-landing-discovery-uiux | Customer landing and discovery UI/UX | customer-web-next | Frontend UI, BFF integration | P1 | Review |
| feat/customer-landing-v2-clean-20260808 | Clean landing v2 experience | customer-web-next | Frontend UI, layout, routing | P2 | Review |
| feat/customer-web-semantic-reference-landing | Semantic reference branch for landing experience | customer-web-next | Frontend UI, semantics, content | P3 | Hold |
| feat/landing-reference-20260811 | Landing reference baseline branch | customer-web-next | Frontend UI, reference implementation | P3 | Hold |
| feat/landing-reference-refresh | Landing reference refresh iteration | customer-web-next | Frontend UI, design refresh | P3 | Review |
| feature/address-final-work | Address workflow completion | user-chef-service / customer-web-next | Backend address APIs, BFF, frontend | P1 | Review |
| feature/address-final-work-2 | Address workflow completion iteration 2 | user-chef-service / customer-web-next | Backend address APIs, BFF, frontend | P1 | Review |
| feature/address-final-work-3 | Address workflow completion iteration 3 | user-chef-service / customer-web-next | Backend address APIs, BFF, frontend | P1 | Review |
| feature/address-final-work-4 | Address workflow completion iteration 4 | user-chef-service / customer-web-next | Backend address APIs, BFF, frontend | P1 | Review |
| feature/advanced-search-smart-filters | Advanced search and smart filter capability | catalog-service / customer-web-next | Backend discovery/search, BFF, frontend | P1 | Review |
| feature/azure-maps-address-autofill | Azure Maps-powered address autofill and geocoding UX | user-chef-service / customer-web-next | External integration, BFF, frontend | P1 | Ready |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-backend-connected-signed-in-flows | Fix signed-in customer flows across backend-connected surfaces | order-service / auth-service / customer-web-next | Backend API, BFF, frontend auth flow | P1 | Validate |
| agent/fix-chef-registration-and-checkout-contract | Fix contract mismatches affecting chef registration and checkout | order-service / user-chef-service / customer-web-next | API contracts, BFF, frontend | P1 | Validate |
| agent/fix-full-frontend-backend-integration | End-to-end integration fixes across frontend and backend | order-service / multiple services | Backend API, BFF, frontend | P0 | Validate |
| agent/order-flyway-v14-checksum | Repair Flyway checksum issue in order service | order-service | Flyway, backend migration | P0 | Ready |
| agent/razorpay-payment-switch | Switch payment flow toward Razorpay path | integration-service / customer-web-next | Payments, BFF, frontend checkout | P1 | Validate |
| backend-customer-reorder-20260816 | Customer reorder/repeat order backend support | order-service | Backend API, SQL, BFF integration | P1 | Ready |
| feat/customer-cart-checkout-payment-uiux | Cart, checkout, and payment UI/UX improvements | customer-web-next | Frontend UI, BFF, payment flow | P1 | Review |
| feat/customer-orders-tracking-uiux | Orders and tracking UI/UX improvements | customer-web-next | Frontend UI, BFF, tracking | P1 | Review |
| feature/backend-launch-policy-enforcement | Enforce launch policy in ordering flows | order-service | Backend rules, API, operational controls | P1 | Review |
| feature/backend-refund-production-readiness | Refund production hardening for post-order flows | integration-service / order-service | Refund orchestration, backend ops | P1 | Validate |
| feature/cashfree-production-closeout-20260815 | Closeout work for Cashfree production payments | integration-service | Payments, readiness, reconciliation | P2 | Review |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-notification-recovery-apim | APIM exposure for notification recovery operations | notification-service / APIM | APIM, backend ops API | P1 | Validate |
| feature/admin-notification-recovery-web | Admin web interface for notification recovery | admin-portal / customer-web-next | Frontend admin UI, BFF | P1 | Review |
| feature/backend-notification-production-delivery | Production delivery hardening for notifications | notification-service | Email/push adapters, workers, backend | P1 | Ready |
| feature/backend-notification-recovery-operations | Backend recovery operations for failed deliveries | notification-service | Backend ops API, workers, persistence | P1 | Ready |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/fix-chef-entry-and-session-routing | Fix chef entry routing and session behavior | customer-web-next / auth-service | Frontend routing, BFF, auth/session | P1 | Validate |
| agent/fix-chef-orders-and-customer-palette | Fix chef order views and customer-facing design palette overlap | customer-web-next | Frontend UI, route components | P2 | Review |
| agent/fix-chef-release-traffic-verification | Verify chef release traffic and rollout behavior | infra / customer-web-next | Release validation, routing, observability | P1 | Validate |
| agent/unify-chef-panel-customer-ui | Unify chef panel and customer UI shell patterns | customer-web-next | Frontend UI architecture, shared components | P2 | Review |
| feat/chef-complete-uiux | Complete chef experience UI/UX implementation | customer-web-next | Frontend UI, BFF-connected flows | P1 | Review |
| feat/customer-chef-uiux-foundation | Shared customer-chef UI foundation | customer-web-next | Design system, frontend architecture | P2 | Review |
| feature/admin-chef-review | Admin chef review workflow implementation | user-chef-service / customer-web-next | Backend review APIs, admin UI, BFF | P1 | Ready |
| feature/backend-chef-financial-ledger | Chef financial ledger and earnings backend | integration-service | Backend API, financial domain, ops | P1 | Review |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| agent/customer-web-connected-ui | Customer web connected UI pass tied to live APIs | customer-web-next | Frontend UI, BFF, API integration | P1 | Review |
| agent/fix-customer-web-proxy-origin | Fix proxy origin issues for customer web | customer-web-next / api | Frontend proxy, BFF, deployment config | P1 | Validate |
| android-build | Android/mobile build-oriented branch | mobile / build pipeline | Mobile build, packaging | P2 | Review |
| backup/customer-web-before-landing-v2-20260808 | Backup snapshot before landing v2 changes | customer-web-next | Backup branch | P3 | Hold |
| backup/mobile-ui-before-home-refinement-2026-08-16 | Backup snapshot before mobile home refinement | mobile / customer UI | Backup branch | P3 | Hold |
| build/qa-mobile-apk-2026-08-20 | QA mobile APK build branch | mobile / CI | Build pipeline, QA packaging | P3 | Hold |
| chatgpt/backend-customer-chef-journey-20260819 | Assisted implementation of customer-chef journey | multiple services / customer-web-next | Backend APIs, BFF, frontend | P2 | Review |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| accidental-ignore-7 | Ambiguous/accidental branch, not for normal integration | unknown | Miscellaneous | P3 | Hold |
| agent/apim-gateway-domain-fix | Fix APIM gateway domain configuration | infra / APIM | Gateway, networking, deployment | P0 | Ready |
| agent/backend-completion-guarded-release | Guarded backend release completion sequence | infra / backend platform | Release orchestration, deployment | P0 | Validate |
| agent/disable-afd-edge-compression | Disable Azure Front Door edge compression | infra | CDN, Front Door, traffic config | P0 | Ready |
| agent/disable-origin-gzip-for-cold-loading | Disable origin gzip to improve cold-load behavior | infra | Front Door, origin config, caching | P0 | Ready |
| agent/fix-cold-device-static-loading | Fix static asset loading on cold devices | infra / frontend delivery | CDN, static hosting, frontend delivery | P1 | Validate |
| agent/fix-front-door-cache-validation-cli-288 | Front Door cache validation fix | infra | Azure Front Door, CLI, caching | P0 | Ready |
| agent/fix-front-door-cli-288 | Front Door CLI issue fix | infra | Azure CLI, deployment automation | P0 | Ready |
| agent/fix-front-door-gzip-cache-bypass | Fix gzip cache bypass behavior | infra | Front Door, caching, compression | P0 | Ready |
| agent/fix-front-door-gzip-rule-validation | Validate/fix gzip rules in Front Door | infra | Front Door, rules engine | P0 | Ready |
| agent/fix-front-door-secret-rest | Fix secret restore/rest handling for Front Door | infra | Secrets, deployment, Front Door | P0 | Validate |
| agent/fix-front-door-security-policy-cli-288 | Fix Front Door security policy via CLI | infra | WAF/security policy, Azure CLI | P0 | Ready |
| agent/fix-static-gzip-cold-loading | Static gzip cold-loading fix | infra / frontend delivery | CDN, static hosting | P1 | Validate |
| agent/normalize-empty-front-door-cache-cli-288 | Normalize empty cache config in Front Door automation | infra | Azure CLI, caching config | P0 | Ready |
| agent/parallel-front-door-domain-provisioning | Parallelize Front Door domain provisioning | infra | Provisioning automation, domain management | P1 | Review |
| agent/preserve-afd-custom-domain-waf | Preserve WAF when changing AFD custom domains | infra | Azure Front Door, WAF, domain config | P0 | Ready |
| ci/subscription-service-predeploy-gate | CI predeploy gate for subscription service | subscription-service / CI | CI/CD, deployment validation | P1 | Ready |
| copilot/research-task-repository-analysis | Research/report branch, not product code | docs / research | Documentation, analysis | P3 | Hold |
| craves-master-guide-v1 | Guide/reference branch | docs | Documentation | P3 | Hold |
| craves-v5-patch-repack | Patch repack/release utility branch | release engineering | Packaging, release ops | P2 | Review |
| dispatch-craves-v4 | Dispatch automation branch | automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-issue-trigger | Dispatch issue trigger branch | automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-reopen-trigger | Dispatch reopen trigger branch | automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-run-2 | Dispatch automation run branch | automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-run-3 | Dispatch automation run branch | automation | Workflow automation | P3 | Hold |
| dispatch-craves-v4-schedule | Dispatch scheduled automation branch | automation | Workflow automation | P3 | Hold |
| do-not-use | Explicitly marked non-merge branch | unknown | Miscellaneous | P3 | Hold |
| docs/production-release-audit-20260821 | Production release audit documentation | docs / release | Documentation, audit | P2 | Ready |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| feature/admin-control-center-global-search | Admin global search across control-center surfaces | admin-portal / backend APIs | Frontend admin UI, BFF, search APIs | P1 | Review |
| feature/admin-customer-360-document-review | Admin customer 360 and document review workflows | admin-portal / user-chef-service / auth-service | Backend admin APIs, BFF, frontend | P1 | Review |
| feature/admin-dashboard-v2 | Second-generation admin dashboard | admin-portal / order-service / integration-service | Dashboard UI, BFF, backend summaries | P1 | Review |
| feature/admin-operational-investigations-apim | Operational investigation APIs through APIM | order-service / integration-service / APIM | Backend admin APIs, gateway | P1 | Validate |
| feature/admin-operational-investigations-web | Admin web for operational investigations | admin-portal / customer-web-next | Frontend admin UI, BFF, investigation workflows | P1 | Review |
| feature/admin-subscription-operations | Admin subscription operations tooling | subscription-service / admin-portal | Backend admin APIs, BFF, frontend | P1 | Review |
| feature/admin-subscription-plans | Admin subscription plan management | subscription-service / admin-portal | Backend APIs, BFF, frontend | P1 | Review |
| feature/admin-web-operations-shell | Admin operations shell foundation | admin-portal | Frontend shell, routing, layout | P2 | Review |
| feature/admin-web-shell | Admin web shell base foundation | admin-portal | Frontend shell, app structure | P2 | Review |
| feature/backend-admin-investigation-apis | Backend APIs for admin investigations | order-service / integration-service | Backend API, SQL, ops tooling | P1 | Ready |
| feature/backend-admin-operations-audit | Backend audit trail for admin operations | multiple backend services | Backend audit, persistence, ops | P1 | Review |
| feature/backend-cashfree-production-hardening | Hardening of Cashfree production integration | integration-service | Payments integration, readiness, reconciliation | P1 | Ready |
| feature/backend-delivery-provider-production-readiness | Delivery provider production readiness | integration-service | Delivery adapters, reconciliation, ops | P1 | Ready |
| feature/backend-production-readiness-completion | Final backend production-readiness completion track | multiple backend services | Backend hardening, release readiness | P1 | Validate |
| feature/backend-subscription-billing-lifecycle | Subscription billing lifecycle implementation | subscription-service / integration-service | Backend APIs, billing events, consumers | P1 | Ready |
| feature/backend-subscription-occurrence-generator | Subscription occurrence generation logic | subscription-service | Backend scheduling, persistence, workers | P1 | Ready |
| feature/backend-subscription-order-fulfillment | Subscription occurrence to order fulfillment pipeline | subscription-service / order-service | Internal APIs, backend workflows, async | P1 | Ready |
| feature/backend-subscription-payment-intents | Payment intent support for subscriptions | integration-service / subscription-service | Payments API, backend integration | P1 | Ready |
| feature/backend-subscription-payment-status-consumer | Consumer for subscription payment status events | subscription-service / integration-service | Async consumers, backend workflows | P1 | Ready |
| feature/backend-subscription-plan-schedules | Subscription plan schedule management | subscription-service | Backend API, persistence, scheduling | P1 | Ready |

---

## Full inventory summary

### Category totals

| Category | Count |
|---|---:|
| auth | 6 |
| catalog | 15 |
| orders | 11 |
| notifications | 4 |
| chef | 8 |
| customer | 7 |
| infra | 27 |
| feature | 20 |
| **Total** | **98** |

> Note: The repository branch listing returned **93 real branches**. The category counts above intentionally include only the branch tables in this document and should match the inventory included here. If future branch additions occur after generation, regenerate this document.

## Recommended merge sequence

### Wave 1 — platform and safety
- `agent/apim-gateway-domain-fix`
- `agent/disable-afd-edge-compression`
- `agent/disable-origin-gzip-for-cold-loading`
- `agent/fix-front-door-cache-validation-cli-288`
- `agent/fix-front-door-cli-288`
- `agent/fix-front-door-gzip-cache-bypass`
- `agent/fix-front-door-gzip-rule-validation`
- `agent/fix-front-door-security-policy-cli-288`
- `agent/preserve-afd-custom-domain-waf`
- `ci/subscription-service-predeploy-gate`

### Wave 2 — backend production capabilities
- `feature/backend-redis-abuse-revocation`
- `feature/backend-admin-account-intervention`
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-notification-production-delivery`
- `feature/backend-notification-recovery-operations`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`
- `feature/backend-launch-policy-enforcement`

### Wave 3 — customer and chef experiences
- `feature/azure-maps-address-autofill`
- `backend-customer-favorites-20260816`
- `backend-customer-reorder-20260816`
- `feature/admin-chef-review`
- `feat/customer-landing-discovery-uiux`
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-orders-tracking-uiux`
- `feat/chef-complete-uiux`
- `agent/customer-web-connected-ui`
- `agent/fix-full-frontend-backend-integration`

### Wave 4 — admin operations and reporting
- `feature/admin-dashboard-v2`
- `feature/admin-control-center-global-search`
- `feature/admin-customer-360-document-review`
- `feature/admin-operational-investigations-apim`
- `feature/admin-operational-investigations-web`
- `feature/admin-subscription-operations`
- `feature/admin-subscription-plans`
- `feature/admin-notification-recovery-apim`
- `feature/admin-notification-recovery-web`

### Do not merge by default
- `backup/*`
- `dispatch-*`
- `do-not-use`
- `accidental-ignore-7`
- research/reference branches unless specifically requested
