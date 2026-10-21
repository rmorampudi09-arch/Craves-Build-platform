# Craves Notification Service

Production foundation for Craves transactional notifications.

## What this service owns

- In-app notification inbox records for customer and chef apps
- Notification request audit trail
- Delivery attempt log for email, SMS and push channels
- Template seed data for core order/payment/chef events

## Current channel behavior

- `IN_APP`: persisted and marked `SENT`
- `EMAIL`, `SMS`, `PUSH`: persisted as `PENDING` until provider adapters are enabled

Phone OTP remains with Firebase Authentication and the Craves Auth Service. Auth-owned email verification uses a separate signed, bounded ACS transport; see [email verification](modules/email-verification/README.md). The normal notification queue never stores an email verification code.

## Database

Uses `craves_business_db` with schema `notification_schema`.

Required environment variables:

```bash
SPRING_DATASOURCE_URL=jdbc:postgresql://<server>:5432/craves_business_db?sslmode=require
SPRING_DATASOURCE_USERNAME=<db-user>
SPRING_DATASOURCE_PASSWORD=<db-password>
CRAVES_INTERNAL_SERVICE_KEY=<shared-service-key>
```

## Local run

```bash
cd services/notification-service
mvn spring-boot:run
```

Health check:

```bash
curl http://localhost:8080/actuator/health
```

## Internal create notification API

```bash
curl -X POST http://localhost:8080/internal/v1/notifications \
  -H "X-Craves-Internal-Key: $CRAVES_INTERNAL_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requestKey":"test-001",
    "sourceService":"manual-test",
    "eventType":"ORDER_CREATED",
    "userId":"00000000-0000-0000-0000-000000000001",
    "userRole":"CUSTOMER",
    "channel":"IN_APP",
    "title":"Order created",
    "body":"Your order has been created.",
    "targetType":"ORDER"
  }'
```

## Rider realtime API (integration-service only)

Both routes take `X-Craves-Internal-Key` like the route above (403 when missing or wrong).

- `POST /internal/v1/push/realtime` sends one high-priority FCM data message to a rider phone while the caller waits, with a TTL equal to the seconds left on the offer, and never after it. Off unless `CRAVES_REALTIME_PUSH_ENABLED=true` (503 `PUSH_DISABLED`); it uses the same `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`.
- `POST /internal/v1/ops-alerts` emails the ops leads in `CRAVES_OPS_ALERT_EMAILS` (comma-separated) through the ACS settings above and logs `CRAVES_ALERT alert=OPS_ALERT`. Empty list or no ACS: 503 `OPS_ALERT_NOT_CONFIGURED`.

Device tokens carry an `app` column (`customer` or `rider`); the queued push worker sends only to `customer` tokens.

## In-app inbox API

For the current foundation, APIM or an internal caller must pass the resolved Craves identity ID as `X-Craves-Identity-Id`. Before public production exposure, this must be moved behind APIM JWT validation and identity-header injection.

```bash
curl http://localhost:8080/api/v1/notifications/in-app \
  -H "X-Craves-Identity-Id: 00000000-0000-0000-0000-000000000001"
```

## Deployment

Use `azure-pipelines-notification-service.yml`. The pipeline expects the Azure DevOps variable:

```text
AZURE_SERVICE_CONNECTION=Craves-Dev-Service-Connection
```

Container App runtime env vars must be configured separately using Azure Container App secrets/env vars. Do not paste live secrets into source control.
