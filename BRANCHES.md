# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-26  
**Total branches:** 98

This document is the current branch inventory for the repository and is intended to act as the handover and merge-planning source of truth for engineering, release, and QA teams.

---

## Branch naming convention

Observed naming conventions in this repository:

- `main` — primary integration branch if present as repository default/target branch for merges.
- `agent/*` — autonomous or assisted implementation/fix branches, often spanning infra, frontend integration, and release hardening.
- `feature/*` — feature delivery branches, usually backend, admin, or platform capabilities.
- `feat/*` — UI/UX or product-scope feature branches, commonly frontend-heavy.
- `backend-*` — backend-only feature or service enhancement branches.
- `backup/*` — safety snapshot branches; do not merge without explicit need.
- `build/*` — build artifact or packaging branches; generally not merge candidates.
- `ci/*` — CI/CD and deployment gate branches.
- `docs/*` — documentation or audit branches.
- `dispatch-*` — operational or dispatch-trigger branches; usually ephemeral.
- `chatgpt/*`, `copilot/*` — research or AI-assisted exploratory branches.
- unprefixed branches such as `android-build`, `do-not-use`, `accidental-ignore-7` — legacy, utility, or cautionary branches requiring manual review.

### Classification rules used in this document

Branches are categorized by dominant domain signal from the branch name:

- **auth**: auth, RBAC, account intervention, identity, abuse/revocation
- **catalog**: discovery, landing, favorites, search, address, maps, kitchens/menu discovery
- **orders**: cart, checkout, reorder, order fulfillment, tracking, launch policy
- **notifications**: notification delivery, recovery, inbox/admin recovery
- **chef**: chef onboarding, chef UI, chef operations, chef financials, chef review
- **customer**: customer web/app UX, profile-style end-user flows, customer 360
- **infra**: APIM, Front Door, caching, domains, CI/CD, builds, docs, backups, dispatch, release hardening
- **feature**: broad platform/admin/subscription/integration work not fitting one of the domain buckets above

---

## Merge policy

### General policy

1. Merge **service-backed backend branches before dependent web/admin/APIM branches**.
2. Merge **infra and release-hardening branches early** if they unblock validation environments.
3. Merge **backup/build/dispatch/research branches only by exception**.
4. Prefer PR merge order:
   - backend/API foundations
   - APIM / gateway / routing updates
   - frontend/BFF integration
   - release hardening / production readiness
5. Require green CI, smoke validation, and branch diff review for all non-ephemeral branches.

### Merge readiness legend

- **Ready** — appears purpose-built and plausibly mergeable after standard review.
- **Review** — likely valid but needs code/QA/security verification.
- **Dependent** — should merge only after prerequisite backend or infra branches.
- **Hold** — snapshot, backup, experimental, dispatch, or cautionary branch; do not merge by default.

### Priority legend

- **P0** — production/release blocker or critical platform fix
- **P1** — high-value feature or major enablement branch
- **P2** — useful enhancement or follow-on integration
- **P3** — low priority, exploratory, backup, or operational artifact

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation or hardening for protected admin operations. | auth-service | Backend API, authz, DB/Flyway, security | P1 | Review |
| `feature/admin-account-intervention-apim` | APIM exposure/policy layer for admin account intervention endpoints. | auth-service / APIM | APIM, gateway policy, security | P1 | Dependent |
| `feature/admin-account-intervention-web` | Admin web flow for account intervention tools and operator controls. | customer-web-next admin | Frontend, BFF, admin UI | P1 | Dependent |
| `feature/backend-admin-account-intervention` | Backend implementation for admin-led account intervention workflows. | auth-service | Backend API, DB/Flyway, security, worker integration | P1 | Ready |
| `feature/backend-internal-admin-rbac-v2` | Follow-up RBAC expansion/refinement for internal admin roles and access control. | auth-service | Backend API, authz, DB/Flyway, security | P1 | Review |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token revocation reinforcement. | auth-service | Backend, Redis, security, session management | P1 | Ready |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/landing-body-07cm-inset` | Landing page layout refinement for marketing/discovery experience. | customer-web-next / catalog discovery | Frontend UI, styling | P3 | Review |
| `agent/landing-body-11cm-inset` | Alternate landing page spacing/layout refinement. | customer-web-next / catalog discovery | Frontend UI, styling | P3 | Review |
| `agent/nearby-kitchens-first-discovery` | Discovery-first nearby kitchens experience emphasizing locality. | catalog-service / customer-web-next | Backend discovery API, frontend BFF/UI | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Iteration on nearby kitchens discovery flow and ranking presentation. | catalog-service / customer-web-next | Backend discovery API, frontend BFF/UI | P1 | Review |
| `backend-customer-favorites-20260816` | Backend support for customer favorites and saved items. | user-chef-service / catalog read flows | Backend API, DB/Flyway, BFF integration | P1 | Ready |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UI/UX refresh. | customer-web-next | Frontend UI, BFF, design system | P1 | Review |
| `feat/customer-landing-v2-clean-20260808` | Clean landing v2 implementation/snapshot for discovery and acquisition. | customer-web-next | Frontend UI, route handlers | P2 | Review |
| `feat/customer-web-semantic-reference-landing` | Semantic reference implementation for landing information architecture. | customer-web-next | Frontend UI, semantics, SEO | P2 | Review |
| `feat/landing-reference-20260811` | Landing reference baseline branch. | customer-web-next | Frontend UI/reference | P3 | Review |
| `feat/landing-reference-refresh` | Refresh of reference landing implementation. | customer-web-next | Frontend UI/reference | P3 | Review |
| `feature/address-final-work` | Customer address workflow finalization. | user-chef-service / customer-web-next | Backend API, frontend BFF/UI, maps/location | P1 | Review |
| `feature/address-final-work-2` | Follow-up iteration on customer address flow completion. | user-chef-service / customer-web-next | Backend API, frontend BFF/UI, maps/location | P2 | Review |
| `feature/address-final-work-3` | Additional refinement branch for address completion logic/UI. | user-chef-service / customer-web-next | Backend API, frontend BFF/UI, maps/location | P2 | Review |
| `feature/address-final-work-4` | Latest iteration in address finalization sequence. | user-chef-service / customer-web-next | Backend API, frontend BFF/UI, maps/location | P2 | Review |
| `feature/advanced-search-smart-filters` | Smart filters and richer discovery search experience. | catalog-service / customer-web-next | Backend discovery/search, frontend BFF/UI | P1 | Ready |
| `feature/azure-maps-address-autofill` | Address autofill powered by Azure Maps for customer address entry. | user-chef-service / customer-web-next | Maps integration, backend API, frontend BFF/UI | P1 | Ready |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-registration-and-checkout-contract` | Contract alignment between chef registration and checkout-related flows. | order-service / customer-web-next | Backend API contracts, frontend BFF | P1 | Review |
| `agent/order-flyway-v14-checksum` | Flyway checksum repair for order-service V14 migration. | order-service | DB/Flyway, backend release hygiene | P0 | Ready |
| `agent/razorpay-payment-switch` | Payment provider switching or routing update toward Razorpay. | integration-service / order-service | Payments, backend integration, frontend payment flow | P1 | Review |
| `backend-customer-reorder-20260816` | Repeat/reorder customer journey support in backend. | order-service | Backend API, DB/Flyway, customer flow | P1 | Ready |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UX implementation. | customer-web-next / order-service integration | Frontend UI, BFF, payments | P1 | Dependent |
| `feat/customer-orders-tracking-uiux` | Orders list/detail/tracking user experience implementation. | customer-web-next / order-service | Frontend UI, BFF, tracking views | P1 | Dependent |
| `feature/backend-launch-policy-enforcement` | Backend enforcement of launch policy rules in ordering flow. | order-service | Backend API, business rules, DB/Flyway | P1 | Ready |
| `feature/backend-refund-production-readiness` | Production hardening for refunds and downstream status handling. | integration-service / order-service | Backend, payments/refunds, workers, ops | P1 | Ready |
| `feature/backend-subscription-order-fulfillment` | Subscription occurrence to order fulfillment flow. | subscription-service / order-service | Backend API, async processing, DB/Flyway | P1 | Ready |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-notification-recovery-apim` | APIM/gateway support for admin notification recovery operations. | notification-service / APIM | APIM, gateway policy, admin APIs | P1 | Dependent |
| `feature/admin-notification-recovery-web` | Admin web UI for notification recovery tooling. | customer-web-next admin / notification-service | Frontend admin UI, BFF | P1 | Dependent |
| `feature/backend-notification-production-delivery` | Production delivery hardening for notifications across supported channels. | notification-service | Backend API, workers, provider adapters | P1 | Ready |
| `feature/backend-notification-recovery-operations` | Backend recovery and replay operations for failed notification delivery. | notification-service | Backend API, workers, admin ops, DB/Flyway | P1 | Ready |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fix chef entrypoint/session routing in web experience. | customer-web-next chef / auth integration | Frontend routing, BFF, auth/session | P1 | Review |
| `agent/fix-chef-orders-and-customer-palette` | Chef order views and shared UI palette corrections. | customer-web-next chef | Frontend UI, BFF | P2 | Review |
| `agent/fix-chef-release-traffic-verification` | Chef release validation under live/prod traffic conditions. | chef web / platform | Frontend, observability, release validation | P1 | Review |
| `agent/unify-chef-panel-customer-ui` | Unify design system and patterns between chef panel and customer UI. | customer-web-next | Frontend UI, shared components | P2 | Review |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work spanning customer-chef journey interactions. | user-chef-service / order-service | Backend API, business flows | P2 | Review |
| `feat/chef-complete-uiux` | Full chef-side UI/UX implementation across chef workflows. | customer-web-next chef | Frontend UI, BFF, dashboard flows | P1 | Review |
| `feature/admin-chef-review` | Admin chef review operations and document decision workflows. | user-chef-service / admin web | Backend API, admin UI, BFF | P1 | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and earnings backend capability. | integration-service | Backend API, finance ledger, DB/Flyway | P1 | Ready |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connect customer web UI to real backend/BFF flows. | customer-web-next | Frontend UI, BFF, API integration | P1 | Review |
| `agent/fix-backend-connected-signed-in-flows` | Resolve signed-in customer flows against connected backend. | customer-web-next / backend services | Frontend BFF, auth, backend integration | P1 | Review |
| `agent/fix-full-frontend-backend-integration` | Full frontend/backend integration stabilization across customer journeys. | customer-web-next / platform services | Frontend BFF, backend integration, QA | P1 | Review |
| `feat/customer-chef-uiux-foundation` | Shared UI/UX foundation across customer and chef experiences. | customer-web-next | Frontend UI, design system, shared components | P2 | Review |
| `feature/admin-customer-360-document-review` | Admin-side customer 360 and document review tooling. | admin web / user-chef-service | Admin UI, BFF, backend API | P1 | Ready |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Miscellaneous/legacy branch with unclear intent; treat as non-mergeable until inspected. | Unknown | Unknown | P3 | Hold |
| `agent/apim-gateway-domain-fix` | Fix APIM or gateway custom domain configuration. | Platform infra | APIM, DNS, gateway | P0 | Ready |
| `agent/backend-completion-guarded-release` | Guarded backend release completion branch for coordinated rollout. | Platform backend / release | Release engineering, backend integration | P1 | Review |
| `agent/disable-afd-edge-compression` | Disable Azure Front Door edge compression to address delivery/caching issues. | Platform infra | Azure Front Door, CDN/cache | P0 | Ready |
| `agent/disable-origin-gzip-for-cold-loading` | Disable origin gzip for cold-load/static asset troubleshooting. | Platform infra | CDN, origin config, static delivery | P0 | Ready |
| `agent/fix-cold-device-static-loading` | Fix static asset loading on cold devices or first launch. | Platform infra / frontend delivery | CDN, static assets, frontend delivery | P1 | Review |
| `agent/fix-customer-web-proxy-origin` | Fix customer web proxy origin configuration. | Platform infra / web | Reverse proxy, origin routing, frontend delivery | P1 | Ready |
| `agent/fix-front-door-cache-validation-cli-288` | Address Front Door cache validation issue tied to CLI-288. | Platform infra | Azure Front Door, caching, CLI ops | P0 | Ready |
| `agent/fix-front-door-cli-288` | General Front Door remediation for CLI-288 issue. | Platform infra | Azure Front Door, routing | P0 | Ready |
| `agent/fix-front-door-gzip-cache-bypass` | Bypass problematic gzip cache behavior at Front Door. | Platform infra | Azure Front Door, caching, compression | P0 | Ready |
| `agent/fix-front-door-gzip-rule-validation` | Fix Front Door gzip rule validation. | Platform infra | Azure Front Door, rules engine | P0 | Ready |
| `agent/fix-front-door-secret-rest` | Repair Front Door secret handling or REST provisioning flow. | Platform infra | Secrets, Front Door, infra automation | P0 | Review |
| `agent/fix-front-door-security-policy-cli-288` | Front Door security policy remediation for CLI-288. | Platform infra | Azure Front Door, WAF/security policy | P0 | Ready |
| `agent/fix-static-gzip-cold-loading` | Static gzip loading fix for cold-start asset delivery. | Platform infra | Static hosting, CDN, compression | P1 | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalize empty cache config/behavior in Front Door. | Platform infra | Azure Front Door, cache config | P0 | Ready |
| `agent/parallel-front-door-domain-provisioning` | Parallelize Front Door custom domain provisioning. | Platform infra | Infra automation, Front Door, DNS | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserve WAF settings while managing AFD custom domains. | Platform infra | Azure Front Door, WAF, domain automation | P0 | Ready |
| `android-build` | Android/mobile build branch. | Mobile/build | Mobile build, packaging | P3 | Hold |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before landing v2 work. | customer-web-next | Snapshot/backup | P3 | Hold |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile UI refinement. | Mobile/frontend | Snapshot/backup | P3 | Hold |
| `build/qa-mobile-apk-2026-08-20` | QA mobile APK packaging branch. | Mobile/build | Build pipeline, packaging | P3 | Hold |
| `ci/subscription-service-predeploy-gate` | Pre-deploy CI gate for subscription service rollout. | CI/CD / subscription-service | CI/CD, deployment gating | P1 | Ready |
| `copilot/research-task-repository-analysis` | AI-assisted repository analysis/research branch. | Docs/research | Documentation, analysis | P3 | Hold |
| `craves-master-guide-v1` | Guide or packaging branch for master documentation/release prep. | Docs/platform | Documentation | P3 | Review |
| `craves-v5-patch-repack` | Patch repack/release packaging branch. | Release engineering | Packaging, release ops | P2 | Review |
| `dispatch-craves-v4` | Dispatch/ops trigger branch. | Operations | Operational automation | P3 | Hold |
| `dispatch-craves-v4-issue-trigger` | Issue-trigger dispatch branch. | Operations | Operational automation | P3 | Hold |
| `dispatch-craves-v4-reopen-trigger` | Reopen-trigger dispatch branch. | Operations | Operational automation | P3 | Hold |
| `dispatch-craves-v4-run-2` | Dispatch run artifact branch. | Operations | Operational automation | P3 | Hold |
| `dispatch-craves-v4-run-3` | Dispatch run artifact branch. | Operations | Operational automation | P3 | Hold |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | Operations | Operational automation | P3 | Hold |
| `do-not-use` | Explicit non-merge branch. | Unknown | Unknown | P3 | Hold |
| `docs/production-release-audit-20260821` | Production release audit documentation branch. | Docs/release | Documentation, audit | P2 | Review |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-control-center-global-search` | Admin global search/control-center capability. | admin web / user-chef-service | Admin UI, BFF, backend search | P1 | Ready |
| `feature/admin-dashboard-v2` | Second iteration of admin dashboard experience and summaries. | admin web / order-service | Admin UI, BFF, backend aggregation | P1 | Ready |
| `feature/admin-operational-investigations-apim` | APIM surface for admin operational investigation APIs. | order-service / integration-service / APIM | APIM, gateway policy, admin APIs | P1 | Dependent |
| `feature/admin-operational-investigations-web` | Admin web tooling for operational investigations. | admin web | Frontend admin UI, BFF | P1 | Dependent |
| `feature/admin-subscription-operations` | Admin operations for subscriptions and intervention workflows. | subscription-service / admin web | Backend API, admin UI, BFF | P1 | Ready |
| `feature/admin-subscription-plans` | Admin management/review of subscription plans. | subscription-service / admin web | Backend API, admin UI, BFF | P1 | Ready |
| `feature/admin-web-operations-shell` | Admin operations shell/container for operational tools. | admin web | Frontend shell, routing, navigation | P2 | Review |
| `feature/admin-web-shell` | Base admin shell framework/navigation. | admin web | Frontend shell, routing, layout | P2 | Review |
| `feature/backend-admin-investigation-apis` | Backend APIs for admin investigations. | order-service / integration-service | Backend API, DB/Flyway, admin ops | P1 | Ready |
| `feature/backend-admin-operations-audit` | Backend audit trail for admin operations. | order-service / integration-service / auth-service | Backend API, audit, DB/Flyway | P1 | Ready |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree integration. | integration-service | Backend integration, payments, webhooks, ops | P1 | Ready |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider readiness and production hardening. | integration-service | Backend integration, delivery orchestration, ops | P1 | Ready |
| `feature/backend-production-readiness-completion` | Cross-backend production readiness completion branch. | Platform backend | Backend integration, release hardening | P1 | Review |
| `feature/backend-subscription-billing-lifecycle` | Billing lifecycle engine/workflows for subscriptions. | subscription-service | Backend API, async workers, DB/Flyway | P1 | Ready |
| `feature/backend-subscription-occurrence-generator` | Scheduled occurrence generation for subscription plans. | subscription-service | Backend API, schedulers/workers, DB/Flyway | P1 | Ready |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and orchestration. | integration-service / subscription-service | Backend payments, API integration | P1 | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumer for subscription payment status events. | subscription-service | Async consumer, backend, DB/Flyway | P1 | Ready |
| `feature/backend-subscription-plan-schedules` | Subscription plan schedule management backend. | subscription-service | Backend API, DB/Flyway | P1 | Ready |
| `feature/cashfree-production-closeout-20260815` | Cashfree rollout closeout and production completion tasks. | integration-service | Backend integration, release ops | P2 | Review |

---

## Full branch inventory summary

### Counts by category

| Category | Count |
|---|---:|
| auth | 6 |
| catalog | 16 |
| orders | 9 |
| notifications | 4 |
| chef | 8 |
| customer | 5 |
| infra | 33 |
| feature | 17 |
| **Total** | **98** |

### Merge sequencing guidance

Recommended merge order for the highest-value active work:

1. **Infra/P0 fixes**
   - `agent/apim-gateway-domain-fix`
   - Front Door/cache/gzip/security branches
   - `agent/order-flyway-v14-checksum`
2. **Backend feature foundations**
   - auth: `feature/backend-admin-account-intervention`, `feature/backend-internal-admin-rbac-v2`, `feature/backend-redis-abuse-revocation`
   - notifications: `feature/backend-notification-production-delivery`, `feature/backend-notification-recovery-operations`
   - subscriptions: billing, occurrence, schedules, payment-status branches
   - integration: Cashfree, delivery provider readiness, refund hardening, chef ledger
3. **Admin/API gateway layers**
   - APIM branches for account intervention, notification recovery, investigations
4. **Frontend/admin/customer experiences**
   - customer connected UI and signed-in flow fixes
   - cart/checkout/order tracking UI branches
   - chef complete UI/UX and admin shells
5. **Review-only/hold branches**
   - backup, dispatch, build, research, and ambiguous utility branches only after explicit approval

### Explicit hold / non-default merge branches

These should not be merged to `main` unless a maintainer explicitly requests it after inspection:

- `accidental-ignore-7`
- `do-not-use`
- `android-build`
- `backup/customer-web-before-landing-v2-20260808`
- `backup/mobile-ui-before-home-refinement-2026-08-16`
- `build/qa-mobile-apk-2026-08-20`
- `copilot/research-task-repository-analysis`
- `dispatch-craves-v4`
- `dispatch-craves-v4-issue-trigger`
- `dispatch-craves-v4-reopen-trigger`
- `dispatch-craves-v4-run-2`
- `dispatch-craves-v4-run-3`
- `dispatch-craves-v4-schedule`

---

## Notes

- Branch purposes above are derived from the real branch list and repository/service intelligence available for this repo.
- Where a branch name clearly maps to an existing service domain, the service assignment reflects the most likely owning backend or frontend surface.
- Branches marked **Dependent** should generally wait for their corresponding backend/API branches.
- Branches marked **Review** may be active or valid, but they need code-level inspection before merge.
