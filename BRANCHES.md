# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Date:** 2026-08-25  
**Total branch count:** 100

This document is the branch inventory and merge handover for the Craves platform. It categorises every currently listed GitHub branch returned from `github_list_branches` page 1 with `per_page=100`, groups them by functional domain, and provides merge guidance based on branch naming, codebase context, and known platform architecture.

## Branch naming convention

Craves currently uses a mixed but understandable branch taxonomy:

- `main` — primary integration branch for production-ready changes. Not returned in the requested branch listing page, but this document is committed there.
- `agent/*` — autonomous or assisted implementation/fix branches, commonly infra, release, UI integration, Front Door, or environment hardening.
- `feature/*` — scoped feature delivery branches, usually product or backend capability work.
- `feat/*` — frontend/UIUX feature or reference branches.
- `backend-*` — backend implementation spikes or feature completions.
- `backup/*` — safety snapshot branches before major UI or refactor work.
- `build/*` — build artifact or QA packaging branches.
- `ci/*` — CI/CD guardrail or deployment pipeline branches.
- `docs/*` — documentation and audit branches.
- `dispatch-*` — workflow/automation/dispatch orchestration branches.
- `chatgpt/*`, `copilot/*` — research or AI-assisted branches.
- ad hoc branches like `android-build`, `do-not-use`, `accidental-ignore-7` — temporary, cautionary, or operational branches.

## Merge policy

### Default merge order

1. **Infra and release safety branches first**
   - Front Door, APIM, compression, cache, domain, security-policy, guarded release, CI gates.
2. **Core auth and platform safety branches**
   - RBAC, admin account intervention, redis abuse revocation, backend readiness hardening.
3. **Backend domain branches**
   - Catalog, orders, notifications, chef/user, subscription, integration/payment.
4. **Frontend/BFF branches**
   - Customer web, landing, chef/admin shell, connected UI, tracking, checkout UX.
5. **Backup, experimental, and temporary branches last**
   - backup, dispatch, accidental, do-not-use, ad hoc build branches.

### Merge expectations

- Prefer **PR merge to `main` after rebase/sync with latest main**.
- Require **service-level smoke validation** for touched domains:
  - auth-service
  - catalog-service
  - order-service
  - user-chef-service
  - notification-service
  - integration-service
  - subscription-service
  - apps/customer-web-next
- For `agent/fix-*`, `agent/disable-*`, and infra branches, validate environment and edge behavior before merge.
- For `feature/backend-*` and customer-facing `feature/*` branches, validate Flyway version sequencing and API contract compatibility.
- For duplicate or iterative branches (`*-v2`, `*-2`, `*-3`, `*-4`), merge only the most complete branch after diff comparison; close superseded branches.
- Do **not** merge `do-not-use`, `accidental-ignore-7`, or backup branches without explicit incident/recovery reason.

### Merge readiness legend

- **Ready** — branch appears scoped, named clearly, and likely suitable for PR review.
- **Review** — mergeable after normal code review and targeted testing.
- **Caution** — likely environment-sensitive, iterative, backup, or operational.
- **Hold** — should not be merged without explicit owner confirmation.

### Priority legend

- **P0** — production/platform critical
- **P1** — high business value or release-critical
- **P2** — normal feature delivery
- **P3** — exploratory, backup, or low urgency

---

## Auth branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Internal admin RBAC implementation or patch for secured admin capabilities. | auth-service | backend, security, RBAC, API | P1 | Review |
| `feature/admin-account-intervention-apim` | APIM exposure and routing for admin account intervention flows. | auth-service / APIM | infra, api-management, security | P1 | Review |
| `feature/admin-account-intervention-web` | Admin web UI for account disable/enable/session revoke operations. | apps/customer-web-next (admin) | frontend, BFF, admin UI | P1 | Review |
| `feature/backend-admin-account-intervention` | Backend support for account intervention workflows and auditability. | auth-service | backend, security, admin API, audit | P1 | Review |
| `feature/backend-internal-admin-rbac-v2` | Follow-up RBAC hardening/expansion for internal admin roles. | auth-service | backend, security, RBAC | P1 | Review |
| `feature/backend-redis-abuse-revocation` | Abuse controls and token/session revocation hardening using Redis. | auth-service | backend, redis, security, auth filter | P0 | Ready |

## Catalog branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchen-first discovery improvements for customer browsing. | catalog-service / customer-web | backend, discovery, frontend integration | P1 | Review |
| `agent/nearby-kitchens-first-discovery-v2` | Second iteration of kitchen-first discovery; likely supersedes original branch. | catalog-service / customer-web | backend, discovery, ranking, frontend integration | P1 | Caution |
| `backend-customer-favorites-20260816` | Backend work for customer favorites feeding home/discovery experiences. | user-chef-service / catalog-service internal integration | backend, favorites, internal API | P2 | Review |
| `feature/advanced-search-smart-filters` | Smart search and advanced filters across catalog/discovery surfaces. | catalog-service / customer-web | backend, search, filters, frontend | P1 | Ready |

## Orders branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-orders-and-customer-palette` | Fixes chef order views and related customer-facing UI consistency. | order-service / customer-web | backend, frontend, chef UI, orders | P1 | Review |
| `agent/fix-chef-registration-and-checkout-contract` | Resolves contract mismatches affecting chef registration and checkout flow. | order-service / user-chef-service / web BFF | backend, API contract, checkout, frontend integration | P0 | Review |
| `agent/order-flyway-v14-checksum` | Corrects Flyway checksum issue in order-service migration chain. | order-service | backend, database, flyway | P0 | Ready |
| `backend-customer-reorder-20260816` | Reorder/repeat order capability for customers. | order-service | backend, orders, checkout | P2 | Ready |

## Notifications branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-notification-recovery-apim` | APIM route and policy support for admin notification recovery operations. | notification-service / APIM | infra, api-management, admin ops | P1 | Review |
| `feature/admin-notification-recovery-web` | Admin recovery UI for notification retry and operational remediation. | apps/customer-web-next (admin) | frontend, admin UI, BFF, operations | P1 | Review |
| `feature/backend-notification-production-delivery` | Production-grade delivery channel hardening for notifications. | notification-service | backend, delivery, email/push, ops | P1 | Ready |
| `feature/backend-notification-recovery-operations` | Recovery workflows, retry controls, and operations support for failed notifications. | notification-service | backend, operations, recovery, persistence | P1 | Ready |

## Chef branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entrypoint navigation and authenticated session routing. | apps/customer-web-next / auth-service | frontend, routing, auth session, BFF | P1 | Review |
| `agent/fix-chef-release-traffic-verification` | Release validation for chef traffic paths after deployment or routing changes. | chef web / edge routing | frontend, infra, release verification | P1 | Caution |
| `feat/chef-complete-uiux` | Complete chef experience UI/UX branch for chef workflows. | apps/customer-web-next (chef) | frontend, UX, pages, BFF | P1 | Review |
| `feature/admin-chef-review` | Admin/backoffice chef application review workflow. | user-chef-service / admin web | backend, admin, review workflow, frontend | P1 | Ready |
| `feature/backend-chef-financial-ledger` | Chef financial ledger and earnings backend support. | integration-service | backend, payments, ledger, finance | P1 | Ready |

## Customer branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Connects customer web UI to live backend/BFF flows. | apps/customer-web-next | frontend, BFF, API integration | P1 | Ready |
| `agent/fix-backend-connected-signed-in-flows` | Repairs authenticated customer journeys across connected backend flows. | auth-service / customer-web / BFF | frontend, backend integration, auth | P0 | Review |
| `agent/fix-customer-web-proxy-origin` | Fixes customer web proxy/origin behavior. | apps/customer-web-next / edge | frontend, proxy, networking | P1 | Review |
| `agent/fix-full-frontend-backend-integration` | End-to-end customer and app integration fixes between frontend and backend. | apps/customer-web-next / platform | frontend, backend integration, BFF | P0 | Ready |
| `agent/landing-body-07cm-inset` | Landing page layout variation with 07cm inset adjustments. | apps/customer-web-next | frontend, marketing UI, CSS/layout | P3 | Caution |
| `agent/landing-body-11cm-inset` | Landing page layout variation with 11cm inset adjustments. | apps/customer-web-next | frontend, marketing UI, CSS/layout | P3 | Caution |
| `agent/unify-chef-panel-customer-ui` | Unifies shared UI patterns between chef panel and customer UI surfaces. | apps/customer-web-next | frontend, design system, UX | P2 | Review |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment UI/UX enhancements. | apps/customer-web-next | frontend, checkout, payment UI, BFF | P1 | Ready |
| `feat/customer-chef-uiux-foundation` | Shared UX foundation spanning customer and chef surfaces. | apps/customer-web-next | frontend, design system, app shell | P2 | Review |
| `feat/customer-landing-discovery-uiux` | Landing and discovery customer UI/UX work. | apps/customer-web-next | frontend, landing, discovery | P2 | Review |
| `feat/customer-landing-v2-clean-20260808` | Cleaner v2 customer landing experience branch. | apps/customer-web-next | frontend, landing page, marketing UX | P2 | Review |
| `feat/customer-orders-tracking-uiux` | Customer order history and live tracking UI/UX. | apps/customer-web-next / order-service | frontend, tracking, orders, BFF | P1 | Ready |
| `feat/customer-web-semantic-reference-landing` | Semantic/structured customer landing reference implementation. | apps/customer-web-next | frontend, SEO, landing | P3 | Caution |
| `feature/address-final-work` | Address flow completion branch, likely customer address CRUD/polish. | user-chef-service / customer-web | frontend, backend, address management, maps | P1 | Review |
| `feature/address-final-work-2` | Iteration 2 of address completion work. | user-chef-service / customer-web | frontend, backend, address management | P1 | Caution |
| `feature/address-final-work-3` | Iteration 3 of address completion work. | user-chef-service / customer-web | frontend, backend, address management | P1 | Caution |
| `feature/address-final-work-4` | Iteration 4 of address completion work; likely latest of the series. | user-chef-service / customer-web | frontend, backend, address management | P1 | Caution |
| `feature/azure-maps-address-autofill` | Azure Maps powered address autofill and suggestion experience. | user-chef-service / customer-web | frontend, maps, backend geocoding, BFF | P1 | Ready |

## Infra branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fixes APIM gateway custom domain or hostname behavior. | platform infra / APIM | infra, api-management, networking | P0 | Ready |
| `agent/backend-completion-guarded-release` | Guarded backend release branch to complete production rollout safely. | platform backend | release, backend, deployment | P0 | Review |
| `agent/disable-afd-edge-compression` | Disables Azure Front Door edge compression to resolve client/cache issues. | platform edge | infra, CDN, compression | P0 | Review |
| `agent/disable-origin-gzip-for-cold-loading` | Disables origin gzip for cold-load correctness. | platform edge / origin | infra, caching, compression, performance | P0 | Review |
| `agent/fix-cold-device-static-loading` | Fixes slow or broken static asset loading on cold devices. | web platform | frontend delivery, edge, caching | P1 | Review |
| `agent/fix-front-door-cache-validation-cli-288` | Fixes Front Door cache validation issue tied to CLI-288. | platform edge | infra, cache, front-door | P0 | Review |
| `agent/fix-front-door-cli-288` | Main Front Door remediation branch for CLI-288. | platform edge | infra, routing, front-door | P0 | Review |
| `agent/fix-front-door-gzip-cache-bypass` | Fixes gzip-related cache bypass behavior at Front Door. | platform edge | infra, cache, compression | P0 | Review |
| `agent/fix-front-door-gzip-rule-validation` | Corrects Front Door gzip rule validation behavior. | platform edge | infra, rules, compression | P0 | Review |
| `agent/fix-front-door-secret-rest` | Restores or fixes Front Door secret handling. | platform infra | infra, secrets, front-door | P0 | Review |
| `agent/fix-front-door-security-policy-cli-288` | Corrects Front Door security policy configuration for CLI-288. | platform edge / security | infra, security, WAF/policy | P0 | Review |
| `agent/fix-static-gzip-cold-loading` | Static asset gzip loading fix for cold load scenarios. | web platform | infra, assets, compression, frontend delivery | P1 | Review |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalizes empty cache config states in Front Door related to CLI-288. | platform edge | infra, cache, front-door | P0 | Review |
| `agent/parallel-front-door-domain-provisioning` | Parallelizes Front Door custom domain provisioning for faster setup. | platform infra | infra, automation, front-door, domains | P1 | Review |
| `agent/preserve-afd-custom-domain-waf` | Preserves WAF policy while updating AFD custom domains. | platform edge / security | infra, WAF, domains, policy | P0 | Ready |
| `android-build` | Android build or packaging line branch. | mobile/build | build, android, packaging | P2 | Caution |
| `build/qa-mobile-apk-2026-08-20` | QA APK build branch for mobile validation. | mobile/build | build, QA, android artifact | P2 | Caution |
| `ci/subscription-service-predeploy-gate` | CI gate before subscription-service deployment. | CI/CD / subscription-service | ci, deployment, test gate | P0 | Ready |
| `docs/production-release-audit-20260821` | Production release audit and release documentation. | platform docs | documentation, audit, release | P2 | Ready |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree payment integration. | integration-service | backend, payments, hardening, ops | P0 | Ready |
| `feature/backend-delivery-provider-production-readiness` | Delivery provider operational readiness and hardening. | integration-service | backend, delivery integration, ops | P0 | Ready |
| `feature/backend-launch-policy-enforcement` | Enforces launch policies for controlled rollout or guardrails. | order-service / platform | backend, policy, release safety | P1 | Ready |
| `feature/backend-production-readiness-completion` | Final backend production readiness completion branch. | platform backend | backend, readiness, release | P0 | Ready |
| `feature/backend-refund-production-readiness` | Hardens refund lifecycle behavior in production. | integration-service / order-service | backend, refunds, ops | P1 | Ready |
| `feature/cashfree-production-closeout-20260815` | Cashfree production closeout and finalization tasks. | integration-service | backend, payments, release closeout | P1 | Review |

## Feature branches

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Temporary or accidental branch; not intended as a delivery line. | unknown / temporary | temporary | P3 | Hold |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before customer landing v2 work. | apps/customer-web-next | backup, frontend, recovery | P3 | Hold |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home UI refinement. | mobile/UI | backup, mobile, recovery | P3 | Hold |
| `chatgpt/backend-customer-chef-journey-20260819` | AI-assisted backend/customer-chef journey exploration or implementation branch. | multi-service | backend, research, product flow | P2 | Caution |
| `copilot/research-task-repository-analysis` | Repository analysis and research branch. | documentation / research | research, docs | P3 | Hold |
| `craves-master-guide-v1` | Master guide or project-wide reference branch. | docs / platform | docs, reference | P3 | Caution |
| `craves-v5-patch-repack` | Patch repackaging branch for Craves v5 artifacts. | release/build | build, packaging, release | P2 | Caution |
| `dispatch-craves-v4` | Dispatch automation baseline branch. | automation/ops | automation, workflow | P3 | Caution |
| `dispatch-craves-v4-issue-trigger` | Dispatch workflow branch for issue-triggered runs. | automation/ops | automation, workflow, issues | P3 | Caution |
| `dispatch-craves-v4-reopen-trigger` | Dispatch workflow branch for reopen-triggered runs. | automation/ops | automation, workflow | P3 | Caution |
| `dispatch-craves-v4-run-2` | Iterative dispatch workflow run branch. | automation/ops | automation, workflow | P3 | Caution |
| `dispatch-craves-v4-run-3` | Iterative dispatch workflow run branch. | automation/ops | automation, workflow | P3 | Caution |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | automation/ops | automation, scheduler | P3 | Caution |
| `do-not-use` | Explicit non-merge branch. | temporary | temporary | P3 | Hold |
| `feat/landing-reference-20260811` | Landing page reference implementation snapshot. | apps/customer-web-next | frontend, reference, marketing | P3 | Caution |
| `feat/landing-reference-refresh` | Refreshed landing reference implementation. | apps/customer-web-next | frontend, reference, marketing | P3 | Caution |
| `feature/admin-control-center-global-search` | Global search in admin control center. | admin web / user-chef-service / order-service | frontend, backend, search, admin | P1 | Ready |
| `feature/admin-customer-360-document-review` | Customer 360 admin review capabilities with document inspection. | admin web / user-chef-service / auth-service | frontend, backend, admin operations | P1 | Review |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard experience and metrics surface. | admin web / order-service | frontend, backend, dashboard, admin | P1 | Ready |
| `feature/admin-operational-investigations-apim` | APIM support for admin operational investigations APIs. | order-service / integration-service / APIM | backend, infra, admin ops, api-management | P1 | Review |
| `feature/admin-operational-investigations-web` | Admin web operational investigations workflow. | apps/customer-web-next (admin) | frontend, admin UI, investigations, BFF | P1 | Review |
| `feature/admin-subscription-operations` | Admin operational tooling for subscriptions. | subscription-service / admin web | backend, admin ops, frontend | P1 | Ready |
| `feature/admin-subscription-plans` | Admin review and management of subscription plans. | subscription-service / admin web | backend, admin workflow, frontend | P1 | Ready |
| `feature/admin-web-operations-shell` | Operations-focused admin shell scaffold. | apps/customer-web-next (admin) | frontend, shell, admin UX | P2 | Review |
| `feature/admin-web-shell` | Base admin web shell scaffold. | apps/customer-web-next (admin) | frontend, shell, app architecture | P2 | Review |
| `feature/backend-admin-investigation-apis` | Backend APIs for operational/admin investigations. | order-service / integration-service | backend, admin API, audit | P1 | Ready |
| `feature/backend-admin-operations-audit` | Operational audit trail backend capability. | integration-service / order-service | backend, audit, admin ops | P1 | Ready |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle management backend. | subscription-service | backend, billing, lifecycle | P1 | Ready |
| `feature/backend-subscription-occurrence-generator` | Occurrence generation engine for subscriptions. | subscription-service | backend, scheduler, subscription engine | P1 | Ready |
| `feature/backend-subscription-order-fulfillment` | Order dispatch and fulfillment for subscription occurrences. | subscription-service / order-service | backend, subscriptions, order integration | P1 | Ready |
| `feature/backend-subscription-payment-intents` | Subscription payment intent creation and management. | integration-service / subscription-service | backend, payments, subscriptions | P1 | Ready |
| `feature/backend-subscription-payment-status-consumer` | Consumes payment status events for subscription billing state. | subscription-service | backend, events, payments, subscriptions | P1 | Ready |
| `feature/backend-subscription-plan-schedules` | Subscription plan schedule management and publication. | subscription-service | backend, scheduling, plan policy | P1 | Ready |
| `agent/razorpay-payment-switch` | Payment provider switch or routing update toward Razorpay. | integration-service / customer-web | backend, payments, frontend integration | P1 | Review |

---

## Inventory summary by category

| Category | Branch count |
|---|---:|
| Auth | 6 |
| Catalog | 4 |
| Orders | 4 |
| Notifications | 4 |
| Chef | 5 |
| Customer | 17 |
| Infra | 24 |
| Feature | 36 |
| **Total** | **100** |

## Recommended merge sequence

1. `ci/subscription-service-predeploy-gate`
2. `agent/apim-gateway-domain-fix`
3. Front Door / compression / cache fix branches
4. `feature/backend-redis-abuse-revocation`
5. `feature/backend-production-readiness-completion`
6. payment and delivery hardening branches
7. auth/admin backend branches
8. order and notification backend branches
9. subscription backend branches
10. customer/chef/admin web branches
11. backup, dispatch, and temporary branches only if explicitly required

## Notes

- This inventory reflects the real branch names returned by the GitHub branch listing used for this task.
- The requested branch list returned **100 branches** on page 1; this document therefore inventories those 100 branches.
- Some branches are clearly iterative or overlapping. Before merge, compare diffs and prefer the latest or broadest-complete branch.
- Branches created from feature strategy context but not present in the returned listing page are intentionally not included, because this document is based on the actual branch list retrieved in the task.
