# Craves Documentation Evidence Ledger

Snapshot date: **14 August 2026**  
Repository: **rmorampudi09-arch/Craves-Build-platform**  
Branch: **main**  
Observed commit: **3225f7fa531a6b07185fb5e034f7930f8bd8b571**

## Primary evidence

### platform
Craves is a two-sided food marketplace connecting customers with home-chef supply. The repository contains a newer Next.js customer/chef web application, seven Spring Boot services, APIM guidance, legacy web/admin/API paths, infrastructure assets and milestone handovers.

Sources: `README.md; apps/customer-web-next/README.md; services/*/README.md; infra/apim/README.md; docs/handover/`

### frontend
The primary customer-facing web implementation is apps/customer-web-next, a Next.js 14 App Router application containing customer, chef and newer admin/support modules.

Sources: `apps/customer-web-next/README.md; apps/customer-web-next/src/app/; apps/customer-web-next/src/components/; apps/customer-web-next/src/features/`

### backend
The active backend target is seven Spring Boot services: auth, user-chef, catalog, order, subscription, integration and notification.

Sources: `services/auth-service/README.md; services/user-chef-service/README.md; services/catalog-service/README.md; services/order-service/README.md; services/subscription-service/README.md; services/integration-service/README.md; services/notification-service/README.md`

### auth
Authentication proves who the caller is; authorization decides what that caller may do. Craves uses phone OTP for the current web and JWT-based authorization in backend services, with Entra External ID/PKCE documented for the mobile milestone.

Sources: `apps/customer-web-next/README.md; services/user-chef-service/README.md; services/order-service/README.md; docs/handover/2026-07-30-customer-mobile-auth-foundation.md`

### chef
Chef mode is the supply side of the marketplace: onboarding, verification, menus, kitchen/order operations and earnings.

Sources: `services/user-chef-service/README.md; apps/customer-web-next/src/components/chef/; apps/customer-web-next/src/components/chef-mode/`

### catalog
Catalog is the source of browseable meal and cuisine information used by discovery and commerce validation.

Sources: `services/catalog-service/README.md; apps/customer-web-next/src/components/discovery/; apps/customer-web-next/src/components/meals/; infra/apim/README.md`

### checkout
Checkout turns a basket into a validated purchase attempt and combines address, authoritative quote, order creation and hosted payment.

Sources: `apps/customer-web-next/README.md; apps/customer-web-next/src/components/cart/; apps/customer-web-next/src/components/checkout/; services/order-service/README.md`

### order
Order management is the transactional spine of Craves: create, retrieve, status, cancellation/refund, delivery state, ETA/shortage, proof and administrative controls.

Sources: `services/order-service/README.md; apps/customer-web-next/src/components/order-history/; apps/customer-web-next/src/components/order-tracking/`

### payment
Payments are separated from raw card handling so the Craves UI can use provider-hosted entry while the backend protects order/payment state.

Sources: `apps/customer-web-next/README.md; apps/customer-web-next/src/lib/cashfree/; services/order-service/README.md; services/integration-service/README.md`

### subscription
Subscriptions support repeat service and entitlements on top of one-off ordering.

Sources: `services/subscription-service/README.md; apps/customer-web-next/src/components/plans/; apps/customer-web-next/src/components/subscriptions/; commit 3225f7fa`

### notification
Notifications centralize email, SMS and push so domain services do not each implement vendor logic.

Sources: `services/notification-service/README.md; apps/customer-web-next/src/components/notifications/`

### location
Location/address features help a customer provide a deliverable address while retaining manual fallback when device permission or geocoding fails.

Sources: `apps/customer-web-next/src/components/location/; apps/customer-web-next/src/components/maps/; apps/customer-web-next/src/lib/location/; docs/handover/2026-08-06-customer-chef-precise-ui-address-dialog.md`

### apim
Azure API Management is the intended policy and routing front door between clients/BFFs and backend services.

Sources: `infra/apim/README.md`

### integration
integration-service is the provider boundary so third-party APIs do not leak provider-specific rules into every domain.

Sources: `services/integration-service/README.md; services/integration-service/**/README.md`

### privacy
Privacy capability includes consent preferences plus recent customer data export/deletion implementation on main.

Sources: `commit 188385e; commit 93ebfa4; commit 5dd7971; apps/customer-web-next/`

### ai
Craves includes a governed semantic meal concierge for assisted discovery rather than an authority that can bypass commerce rules.

Sources: `apps/customer-web-next/docs/signalr-ai-concierge.md; commit 71e795b`

### admin
Administrative tooling lets authorized staff review marketplace state unavailable to ordinary customers and chefs.

Sources: `apps/admin/README.md; apps/customer-web-next/src/features/admin/; apps/customer-web-next/src/features/chef-review/; infra/apim/README.md`

### mobile
Native mobile is proven mainly through milestone identity/API/CI contracts rather than a clearly complete runnable app on the reviewed main snapshot.

Sources: `docs/handover/2026-07-30-customer-mobile-auth-foundation.md; docs/handover/2026-07-30-mobile-ci-foundation.md`

### devops
The repository has broad CI/CD references across backend, frontend, mobile, APIM, data, privacy, security, smoke and release controls.

Sources: `apps/customer-web-next/README.md; repository YAML search; docs/handover/`

### security
Security is layered: identity proof, token validation, role/ownership checks, secret isolation, provider-signature checks and deployment gates address different failure modes.

Sources: `infra/apim/README.md; services/user-chef-service/README.md; services/order-service/README.md; apps/customer-web-next/README.md`

### errors
A useful failure model separates user input/state conflicts, identity/permission failures, dependency outages, data faults and deployment/configuration incidents.

Sources: `services/order-service/README.md; services/notification-service/README.md; apps/customer-web-next/README.md`

### legacy
Older web/admin/Node API paths remain useful for migration history but are not automatically treated as the preferred current architecture.

Sources: `README.md; apps/web/README.md; apps/admin/README.md`

## Explicit gaps
- APIM README cites infra/apim/craves-openapi.yaml, but that literal artifact was not resolvable on main during this evidence snapshot.
- customer-web-next README names azure-pipelines-customer-web-next.yml, but that literal root path was not resolvable; deployment behavior described by the README is retained while trigger/variable details are not invented.
- Native mobile has strong milestone identity/API/CI evidence, but a clearly complete runnable React Native application was not established on the reviewed main snapshot.
- Legacy preview URLs prove historical deployment references rather than current production routing.
- Commercial values such as commissions, payout percentages, subscription pricing, catering thresholds and SLAs are not fabricated where source is silent.
