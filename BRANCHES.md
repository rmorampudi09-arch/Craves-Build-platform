# BRANCHES.md

**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Generated on:** 2026-08-25  
**Total branch count:** 100

This document is the working branch inventory for the Craves platform. It groups confirmed GitHub branches into functional domains so engineering, QA, and release owners can prioritise review and merge sequencing into `main`.

## Branch naming convention

Observed branch prefixes in this repository:

- `agent/` — autonomous or assisted implementation/fix branches
- `feature/` — feature delivery branches, generally backend, admin, infra, or platform capabilities
- `feat/` — UI/UX and product-surface feature branches
- `backend-` — targeted backend capability branches
- `build/` — build outputs and packaging branches
- `backup/` — safety snapshot branches before larger changes
- `docs/` — documentation and audit branches
- `ci/` — pipeline and predeploy gating branches
- `dispatch-` — operational dispatch/testing trigger branches
- `chatgpt/`, `copilot/` — research or assisted implementation branches
- unprefixed named branches — ad hoc, mobile, guide, or cautionary branches

Recommended convention going forward:

- `feature/<domain>-<capability>` for product work
- `fix/<domain>-<issue>` for defects
- `docs/<topic>-<date>` for documentation-only work
- `ci/<service>-<pipeline-change>` for pipeline changes
- `backup/<surface>-before-<change>-<date>` for temporary safety branches

## Merge policy

1. Merge **infra/platform fixes first** when they unblock other branches.
2. Merge **backend contract/API branches before frontend UI branches** that depend on them.
3. Merge **admin APIM branches before admin web branches** when API exposure is required.
4. Prefer **squash merge** for short-lived feature branches and **merge commit** for long-running release branches where history matters.
5. Require before merge where applicable:
   - service tests passing
   - frontend build passing
   - API contract compatibility verified
   - Flyway/database migration review completed
   - APIM / Front Door changes validated in non-prod first
6. Treat these as **do-not-merge without explicit review** unless needed for audit/history:
   - `backup/*`
   - `dispatch-*`
   - `do-not-use`
   - `accidental-ignore-7`
7. For branches with duplicated intent, merge the **most recent or most complete** branch and close superseded ones.

## Auth

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/backend-internal-admin-rbac` | Initial internal admin RBAC implementation and access-control hardening. | Auth Service | Spring Boot, Security, JWT, RBAC | High | Review before merge |
| `feature/backend-admin-account-intervention` | Backend support for admin-led account intervention and operational recovery. | Auth Service | Spring Boot, Admin APIs, Security, Data | High | Ready for functional review |
| `feature/backend-internal-admin-rbac-v2` | Follow-on RBAC refinement branch likely superseding earlier admin RBAC work. | Auth Service | Spring Boot, Security, RBAC, Internal APIs | High | Preferred over earlier RBAC branch after diff review |
| `feature/backend-redis-abuse-revocation` | Token/session abuse revocation and Redis-backed protection flows. | Auth Service | Spring Boot, Redis, Security, Session management | High | Ready for backend validation |

## Catalog

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/nearby-kitchens-first-discovery` | Nearby kitchens discovery-first customer experience and feed prioritisation. | Catalog Service | Spring Boot, Next.js, Discovery APIs, Geo | High | Needs contract and UX verification |
| `agent/nearby-kitchens-first-discovery-v2` | Revised iteration of nearby discovery flow, likely preferred over v1 after comparison. | Catalog Service | Spring Boot, Next.js, Discovery APIs, Geo | High | Preferred candidate pending review |
| `backend-customer-favorites-20260816` | Backend support for customer favorites and saved chef/menu relationships. | User/Chef Service + Catalog read side | Spring Boot, Data model, APIs | Medium | Ready for service review |
| `feature/catalog-discovery-apim` | APIM exposure and routing for catalog/discovery endpoints. | Catalog Service / Infra | APIM, Azure, API policies | High | Merge after API validation |
| `feature/smart-personalised-recommendations` | Personalised recommendation feed for customer home surface using order and preference signals. | Catalog Service | Spring Boot, Recommendation APIs, Customer Web UI | High | New feature branch; ready for implementation review |
| `feature/advanced-search-smart-filters` | Enhanced search with richer filters and discovery narrowing. | Catalog Service | Search APIs, Next.js UI, Query/filtering | High | Ready for product and backend review |

## Orders

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-orders-and-customer-palette` | Fixes chef order views and customer-facing UI consistency. | Order Service / Customer Web | Spring Boot, Next.js, UI polish | High | Merge after regression testing |
| `agent/fix-chef-registration-and-checkout-contract` | Aligns chef registration and checkout contracts across frontend/backend. | Order Service / User-Chef Service | APIs, Contracts, Next.js, Spring Boot | High | Needs contract verification |
| `agent/order-flyway-v14-checksum` | Flyway checksum repair for order-service migration sequence. | Order Service | Spring Boot, Flyway, PostgreSQL | High | Merge if migration mismatch persists |
| `agent/razorpay-payment-switch` | Payment gateway switch or integration fallback toward Razorpay. | Integration Service / Order checkout | Spring Boot, Payments, External provider | High | Needs finance and payment QA |
| `backend-customer-reorder-20260816` | Customer reorder/repeat-order backend support. | Order Service | Spring Boot, Orders, APIs | Medium | Ready for service review |
| `feature/backend-launch-policy-enforcement` | Launch and release policy enforcement across order/checkout flows. | Order Service | Spring Boot, Policy checks, Release gates | High | Ready for backend validation |
| `feature/backend-refund-production-readiness` | Refund lifecycle hardening for production operations. | Integration Service / Order Service | Spring Boot, Payments, Refund events | High | Ready for prod-readiness review |
| `feature/cashfree-production-closeout-20260815` | Final production closeout work for Cashfree payment rollout. | Integration Service / Order checkout | Spring Boot, Cashfree, Ops | High | Merge after payment validation |
| `feature/offer-engine` | Central offer validation and applicable coupon/promotions flow for cart and checkout. | Order Service | Spring Boot, Pricing logic, Customer Web UI | High | New feature branch; ready for implementation review |
| `feature/realtime-order-tracking-timeline` | Detailed live order timeline for customers from acceptance to delivery. | Order Service | Spring Boot, Timeline APIs, Customer Web UI | High | New feature branch; ready for implementation review |
| `feature/scheduled-ordering` | Scheduled ordering and slot reservation for future meal delivery. | Order Service | Spring Boot, Scheduling APIs, Customer Web UI | High | New feature branch; ready for implementation review |

## Notifications

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `feature/admin-notification-recovery-apim` | APIM layer for admin notification recovery endpoints. | Notification Service / Infra | APIM, Azure policies, Admin APIs | Medium | Merge before corresponding web branch |
| `feature/admin-notification-recovery-web` | Admin UI for retrying, inspecting, and recovering failed notifications. | Notification Service / Admin Web | Next.js/Admin UI, API integration | Medium | Merge after APIM/API branch |
| `feature/backend-notification-production-delivery` | Production delivery hardening for email/push/in-app notifications. | Notification Service | Spring Boot, FCM, ACS email, workers | High | Ready for backend review |
| `feature/backend-notification-recovery-operations` | Operational recovery workflows for failed notification delivery. | Notification Service | Spring Boot, Admin APIs, Recovery jobs | High | Ready for operations review |

## Chef

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/fix-chef-entry-and-session-routing` | Fixes chef entry points, auth/session routing, and panel access behaviour. | User/Chef Service / Customer Web | Next.js routing, Auth, Session handling | High | Merge after smoke testing |
| `agent/fix-chef-release-traffic-verification` | Release verification branch for chef traffic and production rollout behaviour. | User/Chef Service / Infra | Frontend routing, Release validation, Azure | Medium | Needs release verification evidence |
| `agent/unify-chef-panel-customer-ui` | Unifies chef panel and customer UI design/interaction patterns. | Customer Web / Chef surface | Next.js, UI system, Navigation | Medium | Needs UX sign-off |
| `chatgpt/backend-customer-chef-journey-20260819` | Assisted implementation branch for end-to-end customer and chef journey backend alignment. | User/Chef Service / Order Service | Spring Boot, Contracts, Journey orchestration | Medium | Review contents before merge |
| `feat/chef-complete-uiux` | Full chef UI/UX implementation branch across chef journeys. | Chef Web surface | Next.js/React, Tailwind, UX | High | Ready for design and QA review |
| `feat/customer-chef-uiux-foundation` | Shared customer-chef UX foundation, layouts, and component baseline. | Customer Web / Chef surface | Next.js/React, Tailwind, Design system | High | Good foundational merge candidate |
| `feature/admin-chef-review` | Admin workflow for chef application or document review. | User/Chef Service / Admin Web | Next.js admin, Spring Boot admin APIs | High | Ready for cross-team review |
| `feature/backend-chef-financial-ledger` | Chef payout/financial ledger backend capability. | Integration Service / User-Chef Service | Spring Boot, Ledger, Finance workflows | High | Needs finance review |

## Customer

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/customer-web-connected-ui` | Customer web wired to real backend flows rather than static/mock UI. | Customer Web | Next.js, API integration, Auth/session | High | Strong merge candidate after E2E check |
| `agent/fix-backend-connected-signed-in-flows` | Repairs signed-in user journeys against connected backend APIs. | Customer Web / Auth / Orders | Next.js, Auth, API integration | High | Merge after auth regression testing |
| `agent/fix-full-frontend-backend-integration` | Full-stack integration repair across customer frontend and backend services. | Customer Web / Platform | Next.js, Spring Boot, API contracts | High | High-value merge candidate |
| `backup/customer-web-before-landing-v2-20260808` | Backup snapshot before customer landing v2 changes. | Customer Web | Git backup snapshot | Low | Do not merge unless restoring state |
| `feat/customer-cart-checkout-payment-uiux` | Customer cart, checkout, and payment experience refresh. | Customer Web / Order checkout | Next.js, Tailwind, Payment UX | High | Merge after checkout API verification |
| `feat/customer-landing-discovery-uiux` | Discovery-led landing experience refresh for customer web. | Customer Web / Catalog | Next.js, Tailwind, Discovery UX | High | Ready for UX review |
| `feat/customer-landing-v2-clean-20260808` | Cleaned up customer landing v2 implementation. | Customer Web | Next.js, UI cleanup, content layout | Medium | Candidate if not superseded |
| `feat/customer-orders-tracking-uiux` | Order history and tracking visual experience improvements. | Customer Web / Order Service | Next.js, Timeline UI, API integration | High | Merge after order API alignment |
| `feat/customer-web-semantic-reference-landing` | Semantic/content reference branch for landing page structure. | Customer Web | Next.js, Semantic HTML, SEO/content | Medium | Merge if needed as reference baseline |
| `feature/address-final-work` | Customer address workflow completion branch. | User/Chef Service / Customer Web | Maps, forms, APIs, address management | High | Likely superseded set; compare variants |
| `feature/address-final-work-2` | Follow-up iteration of address workflow implementation. | User/Chef Service / Customer Web | Maps, forms, APIs | High | Compare against latest variant |
| `feature/address-final-work-3` | Third address workflow refinement branch. | User/Chef Service / Customer Web | Maps, forms, APIs | High | Compare against latest variant |
| `feature/address-final-work-4` | Fourth and likely latest address implementation refinement. | User/Chef Service / Customer Web | Maps, forms, APIs | High | Preferred candidate pending diff review |
| `feature/azure-maps-address-autofill` | Address autofill using Azure Maps/geocoding integration. | User/Chef Service / Customer Web | Azure Maps, Spring Boot, Next.js | High | Ready for integration review |
| `feature/loyalty-coins-wallet` | Loyalty coins and wallet-style rewards balance for customers. | Customer platform | Wallet logic, customer UI, rewards APIs | High | Existing strategic feature; needs full review |
| `feature/ratings-and-reviews` | Ratings and reviews capability for chefs, dishes, and customer trust signals. | Customer platform / Catalog | Review APIs, UI, moderation considerations | High | Existing strategic feature; needs full review |
| `feature/referral-program` | Customer referral acquisition and referral reward workflow. | Customer platform | Referral logic, rewards, customer UI | Medium | Branch exists but commit completeness should be checked |
| `feature/universal-search` | Cross-surface search for chefs, dishes, cuisines, and maybe admin/global entities. | Customer platform / Catalog | Search APIs, UI, indexing | High | Existing strategic feature; needs full review |

## Infra

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `agent/apim-gateway-domain-fix` | Fixes APIM custom domain or gateway routing configuration. | Platform Infra | APIM, Azure networking, DNS | High | Ready for infra validation |
| `agent/disable-afd-edge-compression` | Disables Azure Front Door edge compression to resolve caching/loading issues. | Platform Infra | Azure Front Door, CDN behaviour | Medium | Merge with cache validation evidence |
| `agent/disable-origin-gzip-for-cold-loading` | Adjusts gzip at origin to fix cold load failures. | Platform Infra | Front Door, origin config, static delivery | Medium | Merge after non-prod verification |
| `agent/fix-cold-device-static-loading` | Fixes static asset loading for cold-start devices. | Platform Infra / Frontend delivery | Front Door, caching, static assets | High | Good infra fix candidate |
| `agent/fix-customer-web-proxy-origin` | Corrects proxy/origin settings for customer web routing. | Platform Infra | Reverse proxy, Front Door, web hosting | High | Ready for environment verification |
| `agent/fix-front-door-cache-validation-cli-288` | Front Door cache rule validation fix for CLI/API issue 288 context. | Platform Infra | Azure Front Door, CLI, cache rules | Medium | Merge after rule validation |
| `agent/fix-front-door-cli-288` | General Front Door CLI issue remediation. | Platform Infra | Azure CLI, Front Door | Medium | Merge after infra smoke tests |
| `agent/fix-front-door-gzip-cache-bypass` | Gzip cache bypass adjustments in Front Door. | Platform Infra | Front Door, compression, caching | Medium | Merge with cache test evidence |
| `agent/fix-front-door-gzip-rule-validation` | Fixes Front Door gzip rule validation mismatch. | Platform Infra | Front Door rules engine | Medium | Ready for infra review |
| `agent/fix-front-door-secret-rest` | Secret or REST configuration repair for Front Door automation. | Platform Infra | Azure secrets, Front Door automation | Medium | Needs secret/config review |
| `agent/fix-front-door-security-policy-cli-288` | Security policy remediation in Front Door tied to CLI issue path. | Platform Infra | WAF/Security policy, Azure Front Door | High | Merge after security review |
| `agent/fix-static-gzip-cold-loading` | Static gzip and cold loading fix branch for web delivery. | Platform Infra | Static hosting, compression, cache | Medium | Merge if still reproducing |
| `agent/normalize-empty-front-door-cache-cli-288` | Normalises empty-cache configuration for Front Door. | Platform Infra | Front Door cache config | Low | Merge only if linked issue remains open |
| `agent/parallel-front-door-domain-provisioning` | Parallelises Front Door domain provisioning process. | Platform Infra | Azure automation, DNS, Front Door | Medium | Ready for infra process review |
| `agent/preserve-afd-custom-domain-waf` | Protects custom domain and WAF configuration during AFD updates. | Platform Infra | Azure Front Door, WAF, domain config | High | High-value infra safety branch |
| `build/qa-mobile-apk-2026-08-20` | QA mobile APK packaging/output branch. | Mobile Build / CI | Android build, packaging, pipeline artifacts | Medium | Do not merge to main unless intentional |
| `ci/subscription-service-predeploy-gate` | Subscription-service predeploy pipeline gate. | CI/CD | Pipelines, validation gates, Azure DevOps | High | Ready for pipeline review |
| `docs/production-release-audit-20260821` | Production release audit findings and evidence branch. | Release / Docs | Markdown/docs, audit notes | Medium | Merge if docs should live on main |
| `feature/admin-account-intervention-apim` | APIM exposure for admin account intervention endpoints. | Infra / Auth admin APIs | APIM, policies, Azure | Medium | Merge before admin web consumers |
| `feature/admin-operational-investigations-apim` | APIM exposure for operational investigation APIs. | Infra / Admin backend | APIM, Azure, API policies | Medium | Merge before web consumer branch |
| `feature/backend-cashfree-production-hardening` | Production hardening for Cashfree backend integration and deployment path. | Integration Service / Infra | Spring Boot, Azure config, payments | High | Strong prod-readiness candidate |
| `feature/backend-delivery-provider-production-readiness` | Production-readiness branch for delivery provider integration operations. | Integration Service / Infra | Spring Boot, provider adapters, ops | High | Ready for backend/ops review |
| `feature/backend-production-readiness-completion` | Broad backend readiness closeout branch for release completion. | Platform Backend | Spring Boot, ops, deployment, checks | High | Merge near release freeze |

## Feature

| Branch name | Purpose | Owning service | Tech layers | Priority | Merge readiness |
|---|---|---|---|---|---|
| `accidental-ignore-7` | Ad hoc branch with unclear purpose; likely accidental or temporary. | Unknown | Miscellaneous | Low | Do not merge without inspection |
| `android-build` | Android/mobile build-related branch. | Mobile Build | Android, CI/build tooling | Medium | Merge only if source changes are intended |
| `backup/mobile-ui-before-home-refinement-2026-08-16` | Backup snapshot before mobile home refinement. | Mobile UI | Git backup snapshot | Low | Do not merge unless restoring state |
| `copilot/research-task-repository-analysis` | Research/analysis branch generated from repository study. | Docs / Analysis | Documentation, analysis | Low | Do not merge unless docs are desired |
| `craves-master-guide-v1` | Master guide or platform handbook branch. | Documentation | Markdown/docs | Medium | Merge if guide should be canonical |
| `craves-v5-patch-repack` | Patch repackaging or release assembly branch. | Release Engineering | Packaging, release ops | Medium | Merge only with release owner approval |
| `dispatch-craves-v4` | Dispatch/testing orchestration branch for Craves v4. | Ops / Automation | Dispatch automation, release ops | Low | Do not merge |
| `dispatch-craves-v4-issue-trigger` | Trigger branch for dispatch issue automation. | Ops / Automation | Workflow automation | Low | Do not merge |
| `dispatch-craves-v4-reopen-trigger` | Trigger branch for reopen workflow automation. | Ops / Automation | Workflow automation | Low | Do not merge |
| `dispatch-craves-v4-run-2` | Operational run branch for dispatch workflow execution. | Ops / Automation | Workflow automation | Low | Do not merge |
| `dispatch-craves-v4-run-3` | Operational run branch for dispatch workflow execution. | Ops / Automation | Workflow automation | Low | Do not merge |
| `dispatch-craves-v4-schedule` | Scheduled dispatch automation branch. | Ops / Automation | Workflow automation | Low | Do not merge |
| `do-not-use` | Explicitly non-mergeable branch. | Unknown | Miscellaneous | Low | Do not merge |
| `feat/landing-reference-20260811` | Landing page reference implementation branch. | Customer Web | Next.js, reference UX | Medium | Merge only if still the chosen reference |
| `feat/landing-reference-refresh` | Refreshed landing reference iteration. | Customer Web | Next.js, UI refresh | Medium | Compare against latest landing branches |
| `feature/admin-account-intervention-web` | Admin web surface for account intervention operations. | Admin Web | Next.js admin, API integration | High | Merge after APIM/backend branches |
| `feature/admin-control-center-global-search` | Global search for admin control center across entities and investigations. | Admin Web / Backend | Next.js admin, search APIs | High | Ready for product review |
| `feature/admin-customer-360-document-review` | Admin 360 and document review capabilities for customer support/ops. | Admin Web / Backend | Admin UI, Spring Boot APIs, document review | High | Ready for cross-functional review |
| `feature/admin-dashboard-v2` | Second-generation admin dashboard with improved ops visibility. | Admin Web | Next.js admin, dashboards, APIs | High | Strong admin merge candidate |
| `feature/admin-operational-investigations-web` | Admin UI for operational investigations. | Admin Web | Next.js admin, API integration | High | Merge after APIM/backend alignment |
| `feature/admin-subscription-operations` | Admin tooling for subscription operations and intervention. | Subscription Service / Admin Web | Next.js admin, Spring Boot APIs | High | Ready for product/ops review |
| `feature/admin-subscription-plans` | Admin management UI for subscription plans and schedules. | Subscription Service / Admin Web | Next.js admin, plan APIs | High | Ready for merge review |
| `feature/admin-web-operations-shell` | Shared admin shell for operations-focused pages. | Admin Web | Next.js, layout shell, navigation | High | Good foundational merge candidate |
| `feature/admin-web-shell` | Base admin shell and navigation framework. | Admin Web | Next.js, layout shell | High | Merge early before feature pages |
| `feature/backend-admin-investigation-apis` | Backend APIs for admin investigations and support tooling. | Integration Service / Order Service | Spring Boot, admin APIs, data access | High | Merge before dependent admin UI branches |
| `feature/backend-admin-operations-audit` | Backend operational audit logs and compliance visibility. | Platform Backend | Spring Boot, audit logging, admin APIs | High | Ready for backend review |
| `feature/backend-subscription-billing-lifecycle` | Subscription billing lifecycle orchestration backend. | Subscription Service | Spring Boot, billing, events | High | Ready for backend review |
| `feature/backend-subscription-occurrence-generator` | Generates subscription occurrences/orders on schedule. | Subscription Service | Spring Boot, schedulers, data processing | High | Ready for backend review |
| `feature/backend-subscription-order-fulfillment` | Subscription-to-order fulfillment bridge. | Subscription Service / Order Service | Spring Boot, events, fulfillment orchestration | High | Ready for integration review |
| `feature/backend-subscription-payment-intents` | Creates and manages payment intents for subscriptions. | Subscription Service / Integration Service | Spring Boot, payments, APIs | High | Ready for payment review |
| `feature/backend-subscription-payment-status-consumer` | Consumes payment status events for subscription lifecycle updates. | Subscription Service | Spring Boot, event consumer, payments | High | Ready for eventing review |
| `feature/backend-subscription-plan-schedules` | Plan schedule authoring and schedule APIs for subscriptions. | Subscription Service | Spring Boot, scheduling, APIs | High | Ready for backend review |

## Confirmed branch inventory

The following 100 branches were confirmed from the GitHub branch listing used to generate this document:

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
- `dispatch-craves-v4-issue-trigger`
- `dispatch-craves-v4-reopen-trigger`
- `dispatch-craves-v4-run-2`
- `dispatch-craves-v4-run-3`
- `dispatch-craves-v4-schedule`
- `dispatch-craves-v4`
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
- `feature/scheduled-ordering`
- `feature/realtime-order-tracking-timeline`
- `feature/smart-personalised-recommendations`
- `feature/offer-engine`
- `feature/referral-program`
- `feature/universal-search`
- `feature/loyalty-coins-wallet`
- `feature/ratings-and-reviews`

## Suggested merge order

1. **Infra unblockers**
   - `agent/apim-gateway-domain-fix`
   - Front Door fix branches actually required in production
   - `feature/catalog-discovery-apim`
   - `feature/admin-account-intervention-apim`
   - `feature/admin-operational-investigations-apim`
   - `feature/admin-notification-recovery-apim`
2. **Backend platform and safety**
   - auth/admin/security branches
   - payment/refund/readiness branches
   - subscription backend branches
   - notification backend branches
3. **Customer and chef connected experience**
   - `agent/customer-web-connected-ui`
   - `agent/fix-backend-connected-signed-in-flows`
   - `agent/fix-full-frontend-backend-integration`
   - foundational UI branches
4. **Admin web surfaces**
   - `feature/admin-web-shell`
   - `feature/admin-web-operations-shell`
   - admin feature pages
5. **Net-new product features**
   - `feature/scheduled-ordering`
   - `feature/realtime-order-tracking-timeline`
   - `feature/smart-personalised-recommendations`
   - `feature/offer-engine`
   - `feature/universal-search`
   - `feature/loyalty-coins-wallet`
   - `feature/ratings-and-reviews`
   - `feature/referral-program`
6. **Close/archive only**
   - backups, dispatch branches, and `do-not-use`
