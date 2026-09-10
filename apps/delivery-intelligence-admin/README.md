# Craves Delivery Intelligence Admin

Read-only operational dashboard for Craves delivery orchestration. The application is a standalone Next.js container mounted at `/delivery-intelligence` behind the existing `admin.craves.in` Azure Front Door hostname.

## What it shows

- recent delivery command/job/event volume
- delivered and active delivery counts
- provider-selection share from persisted `delivery_assignment` evidence
- retry, reconciliation, provider-wait and dead-letter indicators
- newest-first operational activity
- order investigation by Craves order ID, chef sub-order ID, delivery command/job/assignment ID, provider delivery reference, or linked provider event reference
- candidate ranking/scoring, selected provider, command recovery state, normalized tracking/webhook events, and provider-neutral courier/ETA telemetry

The UI is intentionally read-only. It does not cancel, dispatch, retry, reassign, activate, or switch delivery providers.

## Security

The browser never receives the Craves bearer token. The existing `craves_access_token` HTTP-only cookie is read only by Next.js BFF routes and forwarded server-to-server to the existing Craves API. Backend authorization remains under the existing `/api/v1/admin/**` Spring Security boundary, with the Delivery Intelligence path explicitly available to active Craves admin roles. Order investigations are written to the existing append-only `payment_schema.admin_investigation_audit` table.

Raw webhook payloads, webhook signature hashes, provider secrets, access tokens, tracking URLs, and provider error text are not returned to this dashboard.

## Local setup

Requirements:

- Node.js 24
- npm
- a checkout of the full `Craves-Build-platform` repository, because the approved logo source is reused from `apps/customer-web-next/scripts/assets`

From the repository root:

```bash
cd apps/delivery-intelligence-admin
npm ci --ignore-scripts --no-audit --no-fund
export CRAVES_API_BASE_URL=https://api.craves.in/api/v1
npm run dev
```

Open:

```text
http://localhost:3000/delivery-intelligence
```

A real authenticated Craves admin cookie is required for API data. For source validation without a session:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CRAVES_API_BASE_URL` | yes | Server-only HTTPS API Management base including `/api/v1`; production value is `https://api.craves.in/api/v1` |

No Firebase secret, provider secret, database password, or payment credential belongs in this web container.

## Canonical deployment status

The source on this branch is intentionally **source-only**. Do not run the old `azure-pipelines-delivery-intelligence-admin.yml` from the long-diverged backend consolidation branch. That pipeline could deploy an unreconciled Integration Service image, apply Flyway, write APIM/Front Door, and create a billable Container App.

Before any future dashboard deployment:

1. map the currently deployed Integration Service image and revision to its exact Git source;
2. reconcile the complete Integration Service runtime tree against canonical `main`;
3. verify every applied Flyway version and checksum, including V115 and V116;
4. create and validate a new main-based immutable-image deployment pipeline;
5. preserve the current Integration Service and dashboard image references for rollback;
6. require explicit APIM, Front Door and any billable Container App approvals;
7. perform an authenticated admin smoke test after deployment.

The established Azure DevOps service connection remains `Craves-Dev-Service-Connection`. No secret value belongs in source control or chat.

## Backend code paths

```text
services/integration-service/src/main/java/in/craves/integration/admin/deliveryintelligence/
services/integration-service/src/main/resources/db/migration/V115__razorpay_webhook_delivery_guard.sql
services/integration-service/src/main/resources/db/migration/V116__delivery_intelligence_admin_read_indexes.sql
services/integration-service/src/main/resources/db/migration/V116__delivery_intelligence_admin_read_indexes.sql.conf
scripts/apim/configure-delivery-intelligence-admin-apim.sh
scripts/frontdoor/configure-delivery-intelligence-admin-route.sh
```

## API contracts

```text
GET /api/v1/admin/operations/delivery-intelligence/overview?hours=24&limit=30
GET /api/v1/admin/operations/delivery-intelligence/orders/{reference}
```

The frontend exposes only same-origin BFF equivalents beneath `/delivery-intelligence/api/...`.
