# Craves Delivery Intelligence Admin

Read-only operational dashboard for Craves delivery orchestration. The application is a standalone Next.js container mounted at `/delivery-intelligence` behind the existing `admin.craves.in` Azure Front Door hostname.

## What it shows

- delivery command/job/event volume across all persisted history by default
- delivered and active delivery counts
- provider-selection share from persisted `delivery_assignment` evidence
- retry, reconciliation, provider-wait and dead-letter indicators
- newest-first or oldest-first activity, with independent activity and attention pagination
- order investigation by Craves order ID, chef sub-order ID, delivery command/job/assignment ID, provider delivery reference, or linked provider event reference
- candidate ranking/scoring, selected provider, command recovery state, normalized tracking/webhook events, and provider-neutral courier/ETA telemetry

The UI is intentionally read-only. It does not cancel, dispatch, retry, reassign, activate, or switch delivery providers.

## History controls

The dashboard supports all history, the last 24 hours, seven days, thirty days, and custom calendar dates in IST. Both custom dates include their full day. Apply filters reloads the first page of both lists. Pages contain 5, 25, 50 or 100 records; the default is 25. No attention items are hidden behind a separate six-item display cap.

Moving through either list preserves the other list's offset and the selected time boundary. Automatic polling pauses while browsing that history window; Show latest returns both lists to the first page with the same filters. This stabilizes pagination against newly timestamped events, not late-arriving records or changes to existing operational evidence. Filters remain in memory while opening and leaving order investigation.

The activity chart groups longer histories into at most 48 groups while preserving every returned command/event count. It does not discard all but the last 24 hourly buckets. Timestamps include dates, years and IST so older records remain distinguishable.

Regression checks in `src/lib/delivery-history.test.ts` cover all-history defaults, presets, inclusive IST dates, invalid inputs, independent offsets, fixed paging windows and whole-period chart totals. Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` before release.

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

The canonical main-based maintenance pipeline is now Azure definition 119, `azure-pipelines-delivery-intelligence-admin.yml`. It validates the exact source and live Auth session policy, builds a digest-pinned image and updates only the existing Delivery Intelligence app with min/max replicas one. It preserves the previous image for rollback and requires `confirmProductionDeploy=true`. It does not deploy Integration Service or modify APIM, Front Door or provider settings. The older consolidation-branch pipeline must not be used.

The previous production acceptance, including successful run 38899, is recorded in `docs/runbooks/2026-09-13-admin-portal-repair.md`. That deployment restored authenticated access but exposed the older fixed-24-hour frontend. This history correction connects the current UI to the already-present history API. Auth session renewal and operation permissions are preserved.

The established Azure DevOps service connection remains `Craves-Dev-Service-Connection`. No secret value belongs in source control or chat.

## Backend code paths

```text
services/integration-service/src/main/java/in/craves/integration/admin/deliveryintelligence/
services/integration-service/src/main/resources/db/migration/V115__razorpay_webhook_delivery_guard.sql
services/integration-service/src/main/resources/db/migration/V116__shadowfax_hyperlocal_marketplace_contract.sql
services/integration-service/src/main/resources/db/migration/V117__delivery_intelligence_admin_read_indexes.sql
services/integration-service/src/main/resources/db/migration/V117__delivery_intelligence_admin_read_indexes.sql.conf
scripts/apim/configure-delivery-intelligence-admin-apim.sh
scripts/frontdoor/configure-delivery-intelligence-admin-route.sh
```

## API contracts

```text
GET /api/v1/admin/operations/delivery-intelligence/overview?hours=24&limit=30
GET /api/v1/admin/operations/delivery-intelligence/orders/{reference}
```

The frontend exposes only same-origin BFF equivalents beneath `/delivery-intelligence/api/...`.

Production migration history: V116 is the Shadowfax contract migration. V117 is the already-applied startup-safe marker; optional online dashboard indexes require a separate maintenance job. Do not renumber or edit these applied migrations.
