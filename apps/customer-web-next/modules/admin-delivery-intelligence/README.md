# Craves Admin Delivery Intelligence

## Purpose

This module gives authenticated Craves administrators a read-only operational view of the existing Intelligent Delivery engine. It does not create, cancel, reassign, price, score, or otherwise mutate deliveries. The UI renders persisted delivery decisions and provider-neutral telemetry that already exist in Integration Service.

## Production route

```text
/admin/delivery-intelligence
```

Browser BFF routes:

```text
GET  /api/admin/delivery-intelligence/summary?windowHours=24|168|720
POST /api/admin/delivery-intelligence/investigate
```

Integration Service routes behind APIM:

```text
GET /api/v1/admin/operations/delivery-intelligence/summary?windowHours=...
GET /api/v1/admin/operations/delivery-intelligence/orders/{orderId}
```

## What the overview shows

- assignment/routing decision count;
- delivered and currently active delivery jobs;
- fallback count, defined from persisted selected candidate rank > 1;
- failed jobs, dead-letter commands and failed/rejected webhook processing counts;
- assignment/delivery trend for 24 hours, 7 days or 30 days;
- provider selection counts and persisted outcome/stored scores;
- recent engine decisions, newest first;
- recent failed/dead-letter commands.

The dashboard never marks a delivery provider as production-ready using static UI text. Provider names and activity shown here are derived from runtime delivery records/provider registry state.

## Order investigation

An administrator supplies a Craves order UUID and a 10-500 character reason. The backend appends the access to `payment_schema.admin_investigation_audit` with a correlation ID.

The detail view joins the existing delivery evidence for that order:

- `delivery_assignment`;
- `delivery_assignment_candidate` ranking/audit;
- `delivery_command` attempts and reconciliation state;
- `delivery_job` booking/tracking state;
- provider-neutral telemetry projection from V112;
- normalized `delivery_event` history;
- final `delivery_score_hot` outcome when available.

Raw webhook bodies, raw provider payloads, secrets and request-context JSON are deliberately not returned to the browser.

## Administrator access

The dashboard route is available to the same five Craves Integration Service administrator roles already permitted by `/api/v1/admin/**`:

```text
PLATFORM_ADMIN
SUPPORT_ADMIN
PAYMENTS_ADMIN
OPERATIONS_ADMIN
AUDIT_ADMIN
```

Exact courier coordinates are additionally field-redacted unless the authenticated principal has `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, or `OPERATIONS_ADMIN`. Other admin roles still receive delivery status, telemetry timestamps/source and ETA windows.

## Local setup

From `apps/customer-web-next`:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm run test
npm run build
npm run dev
```

Use the normal existing admin-web environment variables. Do not paste credentials into chat or commit them:

```text
CRAVES_API_BASE_URL
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY
```

Production image build uses `Dockerfile.delivery-intelligence-admin`, `NEXT_PUBLIC_RAZORPAY_MODE=production`, and catalog fallback disabled. Payment configuration is not changed by this module.

From `services/integration-service`:

```bash
mvn -B -ntp clean verify
```

For a local end-to-end investigation, point `CRAVES_API_BASE_URL` to a TLS-enabled gateway/local proxy that exposes the existing authenticated admin-operations API and sign in with an administrator account.

## Deployment

Use the existing Azure DevOps pipeline backed by:

```text
azure-pipelines-admin-dashboard.yml
```

The pipeline now performs the entire release in one run:

1. verifies immutable Integration Flyway history;
2. runs full Integration Service Maven verification;
3. lints/typechecks/tests/builds the Next.js application;
4. builds/pushes immutable `craves/integration-service:<BuildId>`;
5. builds/pushes immutable `craves/admin-delivery-intelligence:<BuildId>`;
6. updates Integration Service using the existing preserve-runtime deployment guard;
7. adds/verifies the two Delivery Intelligence operations in the existing admin APIM API;
8. updates the existing Admin Container App image only;
9. smoke-tests `/admin/delivery-intelligence` and signed-out API guards.

The pipeline does **not** create a new Azure Container App or APIM instance. If the existing admin Container App is missing, deployment fails closed instead of silently creating a billable resource.

## Azure resources reused

```text
Resource group: rg-craves-prodlow-centralindia
ACR: cravesprodlowacr82121
Integration Container App: ca-craves-integration-service-pr
Admin Container App: ca-craves-admin-web-prodlow
Admin APIM API: craves-admin-operational-investigations-v1
Azure service connection: Craves-Dev-Service-Connection
```

## Rollback

The Integration Service deployment uses `scripts/release/deploy-single-service-preserve-runtime.sh`, which validates the immutable image revision and protects existing runtime configuration/key-vault secret references.

The Admin deployment records the previous immutable image before update and prints it in the pipeline output. If the new admin revision cannot become healthy, the stage fails and reports that previous image rather than creating a replacement Azure resource.

## Figma source

Design file:

```text
Craves Delivery Intelligence Admin Dashboard
https://www.figma.com/design/e7FYj4WYLr3OWgFxTHSX73
```

The source contains editable desktop frames for the operational overview and per-order investigation workflow. The implemented Next.js UI intentionally reuses the existing `AdminWorkspace` and `CravesLogo` rather than introducing a second brand system.
