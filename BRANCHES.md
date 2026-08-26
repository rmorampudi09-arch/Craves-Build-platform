# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-26  
**Total branch count:** 97

This document is the current branch inventory for the repository. It groups all real branches returned by the GitHub branch API into delivery domains so engineering, QA, and release owners can review, sequence, and merge work into `main` safely.

---

## Branch naming convention

The repository currently uses several naming families:

- `agent/*` — autonomous or assisted implementation, infra fixes, release fixes, and integration work
- `feature/*` — feature branches for backend, admin, subscription, search, delivery, and operational capabilities
- `feat/*` — UI/UX and product-facing feature slices, mainly frontend experiences
- `backend-*` — backend point features or targeted service work
- `backup/*` — temporary preservation branches before major UI or flow changes
- `build/*` — build artifacts or QA packaging branches
- `ci/*` — pipeline and deployment gate branches
- `docs/*` — documentation and release audit branches
- `chatgpt/*`, `copilot/*` — research or AI-assisted exploratory work
- unprefixed branches — legacy, dispatch, hotfix, sandbox, or do-not-merge branches

### Recommended interpretation rules

1. Treat `main` as the source of truth for released code.
2. Prefer merging narrowly scoped `feature/*`, `feat/*`, and validated `agent/*` branches before broad umbrella branches.
3. Treat `backup/*`, `dispatch-*`, `do-not-use`, and `accidental-*` branches as non-merge branches unless explicitly reviewed.
4. For branches sharing the same theme, merge backend/API branches before web/UI branches.
5. For admin and subscription work, validate service contracts in backend services and `apps/customer-web-next` BFF routes before merge.

---

## Merge policy

### General policy

- **Merge target:** `main`
- **Preferred method:** squash merge for isolated features; regular merge only when preserving branch history matters
- **Required checks before merge:**
  - service build passes
  - Flyway migration safety reviewed where applicable
  - no contract drift between backend services and `apps/customer-web-next`
  - release-risk review for payment, auth, notification, and infra branches

### Merge order guidance

1. **Infra/platform branches first** if they unblock environments, domains, proxies, cache, or deployment flow.
2. **Backend service branches second** for auth, notification, payment, catalog, order, subscription, and admin APIs.
3. **Frontend and admin web branches third** after backend endpoints are stable.
4. **Experimental, backup, dispatch, and do-not-use branches last or never** unless specifically promoted.

### Merge readiness legend

- **Ready** — focused branch with clear purpose and likely intended for merge after validation
- **Needs Review** — likely useful but requires code review, QA, or dependency verification
- **Blocked/Sequenced** — depends on another backend, infra, or contract branch first
- **Do Not Merge** — backup, accidental, dispatch, or explicitly unsafe branch

### Priority legend

- **P0** — release blocking, production readiness, payment/auth/infra critical
- **P1** — core customer, chef, admin, or operational capability
- **P2** — enhancement, UX improvement, or iterative extension
- **P3** — archive, backup, experiment, research, or low-priority maintenance

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC backend implementation or patch for auth governance. | auth-service | backend API, auth, RBAC, data migration | P0 | Needs Review |
| `feature/backend-internal-admin-rbac-v2` | Second-generation internal admin RBAC hardening likely superseding earlier RBAC work. | auth-service | backend API, auth, RBAC, security | P0 | Needs Review |
| `feature/backend-redis-abuse-revocation` | Redis-backed abuse protection and token revocation rollout aligned with auth patterns already present. | auth-service | backend API, Redis, auth security, middleware | P0 | Ready |
| `feature/backend-admin-account-intervention` | Backend admin account intervention flows for operator action on user identities. | auth-service | backend API, admin tools, auth, audit | P1 | Ready |
| `feature/admin-account-intervention-apim` | API management or gateway layer for admin account intervention endpoints. | auth-service / APIM | gateway, API management, backend integration | P1 | Blocked/Sequenced |
| `feature/admin-account-intervention-web` | Admin web UI for account intervention workflows. | admin web / auth | frontend, BFF, admin UI, auth ops | P1 | Blocked/Sequenced |

---

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchen discovery-first experience, likely improving landing-to-discovery flow. | catalog-service / customer-web-next | discovery API, frontend, location, catalog | P1 | Needs Review |
| `agent/nearby-kitchens-first-discovery-v2` | Follow-up iteration of nearby kitchen discovery with refined behavior. | catalog-service / customer-web-next | discovery API, frontend, location, catalog | P1 | Needs Review |
| `backend-customer-favorites-20260816` | Backend customer favorites support tied to favorite feeds and saved menu items. | user-chef-service / catalog-service | backend API, favorites, data access, BFF contracts | P1 | Ready |
| `feature/advanced-search-smart-filters` | Advanced search and smart filtering capability over kitchens or menu items. | catalog-service / customer-web-next | search API, SQL filtering, frontend, discovery UX | P1 | Needs Review |

---

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `backend-customer-reorder-20260816` | Repeat/reorder customer flow aligned with order-service repeat order capability. | order-service | backend API, order orchestration, customer BFF | P1 | Ready |
| `agent/order-flyway-v14-checksum` | Flyway checksum fix for order-service migration history. | order-service | database migration, backend ops, release safety | P0 | Ready |
| `agent/fix-chef-orders-and-customer-palette` | Fixes likely spanning chef order views and customer-facing order UI styling. | order-service / customer-web-next | backend contracts, frontend UI, chef workflow | P1 | Needs Review |
| `feature/backend-launch-policy-enforcement` | Launch policy enforcement around checkout or order placement. | order-service | backend API, policy, aspect/orchestration, checkout | P0 | Ready |

---

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/backend-notification-production-delivery` | Production-grade notification delivery hardening for in-app, email, or push flows. | notification-service | backend API, worker processing, provider integration | P0 | Ready |
| `feature/backend-notification-recovery-operations` | Recovery operations for failed notification delivery and admin remediation. | notification-service | backend API, ops tooling, recovery tables, workers | P0 | Ready |
| `feature/admin-notification-recovery-apim` | API gateway or APIM exposure for notification recovery operations. | notification-service / APIM | gateway, API management, backend integration | P1 | Blocked/Sequenced |
| `feature/admin-notification-recovery-web` | Admin web UI for notification recovery workflows. | admin web / notification-service | frontend, admin UI, BFF, recovery ops | P1 | Blocked/Sequenced |

---

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entry routing, authentication session handling, or protected navigation. | customer-web-next / auth-service | frontend routing, auth session, BFF | P1 | Needs Review |
| `agent/fix-chef-registration-and-checkout-contract` | Resolves chef registration and checkout contract mismatches across frontend/backend. | user-chef-service / order-service / customer-web-next | backend contracts, BFF, frontend forms | P1 | Needs Review |
| `agent/fix-chef-release-traffic-verification` | Release verification branch for chef-specific production traffic and routing behavior. | platform / chef experience | release ops, routing, verification, monitoring | P1 | Needs Review |
| `feat/chef-complete-uiux` | Full chef UI/UX enhancement branch for chef portal flows. | customer-web-next | frontend, chef UI, design system, route components | P1 | Needs Review |
| `feature/admin-chef-review` | Admin chef review workflow likely covering application review and evidence decisions. | user-chef-service / admin web | backend API, admin UI, document review | P1 | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger APIs and payout-style accounting support. | integration-service | backend API, finance ledger, reporting, admin/chef surfaces | P0 | Ready |
| `agent/unify-chef-panel-customer-ui` | Unifies design language or shared shell between chef panel and customer UI. | customer-web-next | frontend architecture, UI components, shared design tokens | P2 | Needs Review |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend work spanning customer and chef journey flows. | multi-service | backend API, orchestration, journey contracts | P2 | Needs Review |

---

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connects customer web UI to live backend/BFF flows. | customer-web-next | frontend, BFF, API integration, auth/session | P1 | Needs Review |
| `agent/fix-backend-connected-signed-in-flows` | Fixes signed-in flows once frontend is connected to backend services. | customer-web-next / multiple services | frontend integration, auth/session, BFF contracts | P1 | Needs Review |
| `agent/fix-customer-web-proxy-origin` | Corrects proxy/origin behavior for customer web API routing. | customer-web-next / infra | frontend proxy, gateway, networking | P0 | Ready |
| `agent/fix-full-frontend-backend-integration` | Broad integration branch closing contract gaps across frontend and backend. | customer-web-next / multiple services | frontend, BFF, backend contracts, QA | P0 | Needs Review |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UX improvement. | customer-web-next / order-service / integration-service | frontend, BFF, checkout, payments | P1 | Blocked/Sequenced |
| `feat/customer-chef-uiux-foundation` | Shared customer-chef UI foundation, possibly shell/components/base patterns. | customer-web-next | frontend, shared components, design foundation | P2 | Needs Review |
| `feat/customer-landing-discovery-uiux` | Customer landing and discovery UX work for acquisition and browse flows. | customer-web-next / catalog-service | frontend, discovery UX, landing page | P1 | Needs Review |
| `feat/customer-landing-v2-clean-20260808` | Cleaned second iteration of landing experience. | customer-web-next | frontend, landing page, marketing/discovery UX | P2 | Needs Review |
| `feat/customer-orders-tracking-uiux` | Order history and tracking UI improvement. | customer-web-next / order-service | frontend, BFF, tracking UX, order status | P1 | Blocked/Sequenced |
| `feat/customer-web-semantic-reference-landing` | Semantic or reference-based landing redesign branch. | customer-web-next | frontend, landing content, SEO/semantic structure | P2 | Needs Review |
| `feat/landing-reference-20260811` | Landing page reference implementation branch. | customer-web-next | frontend, reference UI, static experience | P2 | Needs Review |
| `feat/landing-reference-refresh` | Refresh of landing reference branch with updated visuals/content. | customer-web-next | frontend, landing UX, content refresh | P2 | Needs Review |
| `feature/address-final-work` | Final address workflow implementation. | user-chef-service / customer-web-next | backend API, BFF, frontend forms, geocoding | P1 | Needs Review |
| `feature/address-final-work-2` | Follow-on address workflow revision. | user-chef-service / customer-web-next | backend API, BFF, frontend forms, geocoding | P1 | Needs Review |
| `feature/address-final-work-3` | Third iteration of address workflow finalization. | user-chef-service / customer-web-next | backend API, BFF, frontend forms, geocoding | P1 | Needs Review |
| `feature/address-final-work-4` | Fourth iteration of address workflow finalization. | user-chef-service / customer-web-next | backend API, BFF, frontend forms, geocoding | P1 | Needs Review |
| `feature/azure-maps-address-autofill` | Address autofill using Azure Maps, aligned with reverse geocoding already present. | user-chef-service / customer-web-next | frontend, BFF, Azure Maps, address UX | P1 | Ready |
| `backup/customer-web-before-landing-v2-20260808` | Backup of customer web before landing v2 changes. | customer-web-next | archive, frontend backup | P3 | Do Not Merge |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup of mobile UI before home refinement changes. | mobile/customer UI | archive, frontend backup | P3 | Do Not Merge |

---

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fixes domain configuration in API management or gateway layer. | platform / APIM | infra, gateway, domain, DNS/routing | P0 | Ready |
| `agent/backend-completion-guarded-release` | Guarded release branch to complete backend rollout with controls. | platform / release engineering | release ops, backend rollout, validation | P0 | Needs Review |
| `agent/disable-afd-edge-compression` | Disables Azure Front Door edge compression to address delivery issues. | platform / Azure Front Door | infra, CDN, compression, edge config | P0 | Ready |
| `agent/disable-origin-gzip-for-cold-loading` | Disables origin gzip to resolve cold loading or caching issues. | platform / frontend delivery | infra, CDN, compression, origin config | P0 | Ready |
| `agent/fix-cold-device-static-loading` | Fixes static asset loading on cold devices or cold caches. | platform / frontend delivery | infra, static hosting, caching, UX | P0 | Needs Review |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache validation fix tied to CLI or policy issue 288. | platform / Azure Front Door | infra, CDN, cache policy, validation | P0 | Ready |
| `agent/fix-front-door-cli-288` | Generic Front Door corrective branch associated with CLI 288. | platform / Azure Front Door | infra, CDN, config automation | P0 | Needs Review |
| `agent/fix-front-door-gzip-cache-bypass` | Fix for gzip cache bypass behavior at edge. | platform / Azure Front Door | infra, CDN, compression, cache rules | P0 | Ready |
| `agent/fix-front-door-gzip-rule-validation` | Validates gzip rule correctness in Front Door. | platform / Azure Front Door | infra, CDN, rule engine, validation | P0 | Ready |
| `agent/fix-front-door-secret-rest` | Fixes secret handling for Front Door or REST-based configuration path. | platform / Azure Front Door | infra, secrets, REST automation, security | P0 | Needs Review |
| `agent/fix-front-door-security-policy-cli-288` | Security policy correction in Front Door config. | platform / Azure Front Door | infra, WAF/policy, security, automation | P0 | Ready |
| `agent/fix-static-gzip-cold-loading` | Fix for static gzip asset behavior affecting cold loading. | platform / frontend delivery | infra, static assets, compression, caching | P0 | Ready |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalizes empty cache config edge cases in Front Door. | platform / Azure Front Door | infra, cache config, automation, validation | P0 | Ready |
| `agent/parallel-front-door-domain-provisioning` | Parallelizes or improves Front Door domain provisioning workflow. | platform / Azure Front Door | infra, provisioning, domain automation | P1 | Needs Review |
| `agent/preserve-afd-custom-domain-waf` | Preserves custom domain and WAF state during AFD changes. | platform / Azure Front Door | infra, WAF, domain config, release safety | P0 | Ready |
| `android-build` | Android build or packaging branch. | mobile build | build, mobile, packaging | P2 | Needs Review |
| `build/qa-mobile-apk-2026-08-20` | QA APK build branch for mobile validation. | mobile build / QA | build pipeline, QA packaging, mobile | P2 | Needs Review |
| `ci/subscription-service-predeploy-gate` | CI gate for subscription-service predeployment checks. | CI/CD | pipeline, deployment gate, backend validation | P1 | Ready |
| `docs/production-release-audit-20260821` | Release audit documentation for production readiness. | release engineering | documentation, audit, ops | P2 | Ready |
| `feature/backend-cashfree-production-hardening` | Hardening Cashfree integration for production. | integration-service | backend API, payment integration, release hardening | P0 | Ready |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider production-readiness work for integration-service. | integration-service | backend API, provider adapters, ops readiness | P0 | Ready |
| `feature/backend-production-readiness-completion` | Final backend production readiness closure branch. | multi-service | backend, release engineering, readiness checklist | P0 | Needs Review |
| `feature/backend-refund-production-readiness` | Refund pipeline readiness hardening for production flows. | integration-service / order-service | backend API, refunds, ops, monitoring | P0 | Ready |
| `feature/cashfree-production-closeout-20260815` | Cashfree release closeout and operational stabilization branch. | integration-service | payments, ops, release stabilization | P0 | Needs Review |
| `agent/razorpay-payment-switch` | Payment provider switching or routing change toward Razorpay. | integration-service / customer-web-next | payments, backend integration, frontend checkout | P0 | Needs Review |
| `craves-master-guide-v1` | Repository-wide guide or master reference branch. | docs/platform | documentation, repo guidance | P3 | Needs Review |
| `craves-v5-patch-repack` | Patch repackaging branch for release artifact preparation. | release engineering | packaging, release ops | P2 | Needs Review |

---

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-control-center-global-search` | Admin global search/control-center capability. | user-chef-service / admin web | backend API, admin UI, search/indexing | P1 | Ready |
| `feature/admin-customer-360-document-review` | Customer 360 and document review operations in admin surface. | user-chef-service / admin web | backend API, admin UI, document review | P1 | Needs Review |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard metrics and operations surface. | order-service / admin web | backend API, admin UI, analytics | P1 | Ready |
| `feature/admin-operational-investigations-apim` | API management layer for admin operational investigations. | integration-service / APIM | gateway, API management, ops APIs | P1 | Blocked/Sequenced |
| `feature/admin-operational-investigations-web` | Admin web investigation UI for ops workflows. | admin web / integration-service | frontend, admin UI, BFF, investigations | P1 | Blocked/Sequenced |
| `feature/admin-subscription-operations` | Subscription operations admin tooling. | subscription-service / admin web | backend API, admin UI, subscription ops | P1 | Ready |
| `feature/admin-subscription-plans` | Admin review and management for subscription plans. | subscription-service / admin web | backend API, admin UI, workflow | P1 | Ready |
| `feature/admin-web-operations-shell` | Admin web operations shell and layout foundation. | admin web | frontend shell, navigation, admin architecture | P2 | Needs Review |
| `feature/admin-web-shell` | Base admin shell framework for the web app. | admin web | frontend shell, navigation, UI framework | P2 | Needs Review |
| `feature/backend-admin-investigation-apis` | Backend APIs for operational investigations. | integration-service | backend API, ops tooling, audits | P1 | Ready |
| `feature/backend-admin-operations-audit` | Operational audit logging/read APIs for admin workflows. | integration-service / multi-service | backend API, audit, observability, ops | P1 | Ready |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle orchestration. | subscription-service | backend API, billing, workers, payment state | P0 | Ready |
| `feature/backend-subscription-occurrence-generator` | Occurrence generation automation for subscription fulfillment cycles. | subscription-service | backend API, scheduling, workers, domain logic | P0 | Ready |
| `feature/backend-subscription-order-fulfillment` | Subscription-to-order fulfillment handoff and dispatch. | subscription-service / order-service | backend API, integration, order orchestration | P0 | Ready |
| `feature/backend-subscription-payment-intents` | Payment intent creation for subscriptions. | subscription-service / integration-service | backend API, payments, subscription billing | P0 | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumes payment status updates for subscription billing lifecycle. | subscription-service | backend API, event consumer, payment processing | P0 | Ready |
| `feature/backend-subscription-plan-schedules` | Subscription plan scheduling and calendar logic. | subscription-service | backend API, schedules, chef plans, policy | P1 | Ready |
| `feat/customer-web-semantic-reference-landing` | Semantic landing reference implementation for frontend discovery. | customer-web-next | frontend, landing page, content structure | P2 | Needs Review |
| `copilot/research-task-repository-analysis` | Research/analysis branch, likely non-deliverable unless promoted. | docs/research | documentation, analysis | P3 | Do Not Merge |
| `accidental-ignore-7` | Accidental or scratch branch; unsafe default assumption. | unknown | misc, unsorted | P3 | Do Not Merge |
| `do-not-use` | Explicitly marked as unsafe for merge. | unknown | misc, unsorted | P3 | Do Not Merge |
| `dispatch-craves-v4` | Dispatch or automation trigger branch. | release automation | automation, dispatch | P3 | Do Not Merge |
| `dispatch-craves-v4-issue-trigger` | Dispatch issue trigger automation branch. | release automation | automation, issue workflow | P3 | Do Not Merge |
| `dispatch-craves-v4-reopen-trigger` | Dispatch reopen trigger automation branch. | release automation | automation, issue workflow | P3 | Do Not Merge |
| `dispatch-craves-v4-run-2` | Dispatch automation run branch 2. | release automation | automation, dispatch | P3 | Do Not Merge |
| `dispatch-craves-v4-run-3` | Dispatch automation run branch 3. | release automation | automation, dispatch | P3 | Do Not Merge |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | release automation | automation, scheduler | P3 | Do Not Merge |

---

## Complete branch inventory

For audit completeness, these are all 97 branches returned by GitHub for the repository at the time of documentation:

- `accidental-ignore-7`
- `agent/apim-gateway-domain-fix`
- `agent/backend-completion-guarded-release`
- `agent/backend-internal-admin-rbac`
- `agent/customer-web-connected-ui`
- `agent/disable-afd-edge-compression`
- `agent/disable-origin-gzip-for-cold-loading`
- `agent/fix-backend-connected-signed-in-flows`
- `agent/fix-chef-entry-and-session-routing`
- `agent/fix-chef-orders-and-customer-palette`
- `agent/fix-chef-registration-and-checkout-contract`
- `agent/fix-chef-release-traffic-verification`
- `agent/fix-cold-device-static-loading`
- `agent/fix-customer-web-proxy-origin`
- `agent/fix-front-door-cache-validation-cli-288`
- `agent/fix-front-door-cli-288`
- `agent/fix-front-door-gzip-cache-bypass`
- `agent/fix-front-door-gzip-rule-validation`
- `agent/fix-front-door-secret-rest`
- `agent/fix-front-door-security-policy-cli-288`
- `agent/fix-full-frontend-backend-integration`
- `agent/fix-static-gzip-cold-loading`
- `agent/landing-body-07cm-inset`
- `agent/landing-body-11cm-inset`
- `agent/nearby-kitchens-first-discovery`
- `agent/nearby-kitchens-first-discovery-v2`
- `agent/normalize-empty-front-door-cache-cli-288`
- `agent/order-flyway-v14-checksum`
- `agent/parallel-front-door-domain-provisioning`
- `agent/preserve-afd-custom-domain-waf`
- `agent/razorpay-payment-switch`
- `agent/unify-chef-panel-customer-ui`
- `android-build`
- `backend-customer-favorites-20260816`
- `backend-customer-reorder-20260816`
- `backup/customer-web-before-landing-v2-20260808`
- `backup/mobile-ui-before-home-refinement-2026-08-16`
- `build/qa-mobile-apk-2026-08-20`
- `chatgpt/backend-customer-chef-journey-20260819`
- `ci/subscription-service-predeploy-gate`
- `copilot/research-task-repository-analysis`
- `craves-master-guide-v1`
- `craves-v5-patch-repack`
- `dispatch-craves-v4`
- `dispatch-craves-v4-issue-trigger`
- `dispatch-craves-v4-reopen-trigger`
- `dispatch-craves-v4-run-2`
- `dispatch-craves-v4-run-3`
- `dispatch-craves-v4-schedule`
- `do-not-use`
- `docs/production-release-audit-20260821`
- `feat/chef-complete-uiux`
- `feat/customer-cart-checkout-payment-uiux`
- `feat/customer-chef-uiux-foundation`
- `feat/customer-landing-discovery-uiux`
- `feat/customer-landing-v2-clean-20260808`
- `feat/customer-orders-tracking-uiux`
- `feat/customer-web-semantic-reference-landing`
- `feat/landing-reference-20260811`
- `feat/landing-reference-refresh`
- `feature/address-final-work`
- `feature/address-final-work-2`
- `feature/address-final-work-3`
- `feature/address-final-work-4`
- `feature/admin-account-intervention-apim`
- `feature/admin-account-intervention-web`
- `feature/admin-chef-review`
- `feature/admin-control-center-global-search`
- `feature/admin-customer-360-document-review`
- `feature/admin-dashboard-v2`
- `feature/admin-notification-recovery-apim`
- `feature/admin-notification-recovery-web`
- `feature/admin-operational-investigations-apim`
- `feature/admin-operational-investigations-web`
- `feature/admin-subscription-operations`
- `feature/admin-subscription-plans`
- `feature/admin-web-operations-shell`
- `feature/admin-web-shell`
- `feature/advanced-search-smart-filters`
- `feature/azure-maps-address-autofill`
- `feature/backend-admin-account-intervention`
- `feature/backend-admin-investigation-apis`
- `feature/backend-admin-operations-audit`
- `feature/backend-cashfree-production-hardening`
- `feature/backend-chef-financial-ledger`
- `feature/backend-delivery-provider-production-readiness`
- `feature/backend-internal-admin-rbac-v2`
- `feature/backend-launch-policy-enforcement`
- `feature/backend-notification-production-delivery`
- `feature/backend-notification-recovery-operations`
- `feature/backend-production-readiness-completion`
- `feature/backend-redis-abuse-revocation`
- `feature/backend-refund-production-readiness`
- `feature/backend-subscription-billing-lifecycle`
- `feature/backend-subscription-occurrence-generator`
- `feature/backend-subscription-order-fulfillment`
- `feature/backend-subscription-payment-intents`
- `feature/backend-subscription-payment-status-consumer`
- `feature/backend-subscription-plan-schedules`
- `feature/cashfree-production-closeout-20260815`

---

## Suggested merge sequence

1. `agent/apim-gateway-domain-fix`
2. Front Door and compression fixes:
   - `agent/disable-afd-edge-compression`
   - `agent/disable-origin-gzip-for-cold-loading`
   - `agent/fix-front-door-cache-validation-cli-288`
   - `agent/fix-front-door-gzip-cache-bypass`
   - `agent/fix-front-door-gzip-rule-validation`
   - `agent/fix-front-door-security-policy-cli-288`
   - `agent/normalize-empty-front-door-cache-cli-288`
   - `agent/preserve-afd-custom-domain-waf`
3. Payment and production hardening:
   - `feature/backend-cashfree-production-hardening`
   - `feature/backend-refund-production-readiness`
   - `feature/backend-delivery-provider-production-readiness`
   - `feature/cashfree-production-closeout-20260815`
   - `agent/razorpay-payment-switch`
4. Auth and admin security:
   - `feature/backend-redis-abuse-revocation`
   - `agent/backend-internal-admin-rbac`
   - `feature/backend-internal-admin-rbac-v2`
   - `feature/backend-admin-account-intervention`
   - `feature/admin-account-intervention-apim`
   - `feature/admin-account-intervention-web`
5. Notification operations:
   - `feature/backend-notification-production-delivery`
   - `feature/backend-notification-recovery-operations`
   - `feature/admin-notification-recovery-apim`
   - `feature/admin-notification-recovery-web`
6. Subscription stack:
   - `ci/subscription-service-predeploy-gate`
   - `feature/backend-subscription-billing-lifecycle`
   - `feature/backend-subscription-occurrence-generator`
   - `feature/backend-subscription-payment-intents`
   - `feature/backend-subscription-payment-status-consumer`
   - `feature/backend-subscription-plan-schedules`
   - `feature/backend-subscription-order-fulfillment`
   - `feature/admin-subscription-plans`
   - `feature/admin-subscription-operations`
7. Order, catalog, chef, and customer experience:
   - `feature/backend-launch-policy-enforcement`
   - `backend-customer-reorder-20260816`
   - `backend-customer-favorites-20260816`
   - `feature/advanced-search-smart-filters`
   - `feature/azure-maps-address-autofill`
   - `feature/admin-chef-review`
   - customer and chef UI branches after contract verification
8. Merge admin shell and broader frontend integration branches only after API stability.
9. Do not merge backup, dispatch, accidental, or explicitly unsafe branches without explicit promotion.
