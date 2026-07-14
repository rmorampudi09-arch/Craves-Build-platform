# Delivery Command Orchestration

This module implements the asynchronous delivery flow owned by the Craves Integration Service.
It consumes `CHEF_ACCEPTED_ORDER`, schedules dispatch close to `readyAt`, executes a provider-neutral
quote/create workflow, persists one delivery job per chef sub-order, and publishes
`DELIVERY_STATUS_CHANGED` through the transactional outbox.

The runtime is disabled by default. Deploying the code and Flyway migration does not connect to
Azure Service Bus and does not create provider deliveries until `CRAVES_DELIVERY_COMMAND_ENABLED=true`.

## Architecture rules preserved

- Never create a delivery when payment succeeds.
- Schedule only after the chef accepts the chef-specific sub-order.
- Dispatch at `readyAt - leadTime`, with a default lead of 10 minutes.
- Keep exactly one delivery command and one final delivery job per `chefSubOrderId`.
- Consume Service Bus messages with PeekLock and manual settlement.
- Treat delivery as at-least-once messaging with idempotent business outcomes.
- Quote active provider adapters in bounded parallelism using a dedicated Java 21 virtual-thread executor.
- Rank confirmed quotes by normalized pickup ETA, then delivery fee, then provider ID.
- Attempt create on the next ranked provider when the prior explicit create attempt fails.
- Persist the full quote/create audit snapshot on the delivery job.
- Write `DELIVERY_STATUS_CHANGED` to the database outbox in the same transaction as the job.
- Publish outbox rows separately and recover abandoned processing leases.
- Dead-letter invalid or exhausted Service Bus messages with an actionable reason.

## Service Bus topology

```text
Topic: craves-domain-events
  Subscription: integration-service-chef-accepted
    SQL filter: event_type = 'CHEF_ACCEPTED_ORDER'

Queue: delivery-command
  Built-in DLQ: delivery-command/$DeadLetterQueue
```

The Integration Service requires send access to the topic and queue, and receive access to the
subscription and queue. The preferred production authentication is the Container App's system-assigned
managed identity with Azure Service Bus Data Sender and Azure Service Bus Data Receiver roles.
A connection string is supported only as a temporary development fallback.

## Event envelope

The Order Service must publish a versioned envelope:

```json
{
  "eventId": "11111111-1111-1111-1111-111111111111",
  "eventType": "CHEF_ACCEPTED_ORDER",
  "eventVersion": "1.0",
  "occurredAt": "2026-07-14T13:00:00Z",
  "correlationId": "22222222-2222-2222-2222-222222222222",
  "causationId": null,
  "source": "order-service",
  "subject": "chef-sub-order/33333333-3333-3333-3333-333333333333",
  "data": {
    "orderId": "22222222-2222-2222-2222-222222222222",
    "chefSubOrderId": "33333333-3333-3333-3333-333333333333",
    "readyAt": "2026-07-14T13:30:00Z",
    "deliveryRequest": {
      "matter": "Freshly prepared packaged food",
      "totalWeightKg": 2,
      "thermoboxRequired": true,
      "pickup": {
        "address": "Madhapur, Hyderabad, Telangana, India",
        "contactName": "Craves Test Chef",
        "contactPhone": "919999999991",
        "latitude": 17.4483,
        "longitude": 78.3915,
        "requiredStart": null,
        "requiredFinish": null,
        "note": "Pickup"
      },
      "dropoff": {
        "address": "Gachibowli, Hyderabad, Telangana, India",
        "contactName": "Craves Test Customer",
        "contactPhone": "919999999992",
        "latitude": 17.4401,
        "longitude": 78.3489,
        "requiredStart": null,
        "requiredFinish": null,
        "note": "Dropoff"
      }
    }
  }
}
```

The Service Bus message must also contain the application property:

```text
event_type=CHEF_ACCEPTED_ORDER
```

## Processing flow

```text
CHEF_ACCEPTED_ORDER subscription
        |
        v
DeliveryCommandScheduler
  - validate event envelope
  - calculate dispatchAt
  - insert delivery_command idempotently
  - schedule delivery-command message natively in Service Bus
        |
        v
DeliveryCommandWorker
  - atomically claim command
  - skip when delivery_job already exists
  - load active delivery_provider rows
  - quote deployed adapters concurrently with timeout
  - rank ETA -> fee -> provider ID
  - create with bounded fallback
        |
        v
DeliveryCommandCompletionService (one DB transaction)
  - insert delivery_job and routing audit snapshot
  - insert DELIVERY_STATUS_CHANGED into delivery_outbox
  - mark delivery_command completed
        |
        v
DeliveryOutboxPublisher
  - claim due rows with SKIP LOCKED
  - publish to craves-domain-events
  - mark published or retry/dead-letter
```

## Runtime variables

```text
CRAVES_DELIVERY_COMMAND_ENABLED=false
SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE=
SERVICE_BUS_CONNECTION_STRING=
SERVICE_BUS_TOPIC_NAME=craves-domain-events
SERVICE_BUS_CHEF_ACCEPTED_SUBSCRIPTION=integration-service-chef-accepted
SERVICE_BUS_DELIVERY_COMMAND_QUEUE=delivery-command
CRAVES_DELIVERY_COMMAND_LEAD_TIME_MINUTES=10
CRAVES_DELIVERY_QUOTE_TIMEOUT_SECONDS=4
CRAVES_DELIVERY_MAX_PROVIDER_ATTEMPTS=3
CRAVES_DELIVERY_MAX_DELIVERY_ATTEMPTS=5
CRAVES_DELIVERY_MAX_CONCURRENT_MESSAGES=4
CRAVES_DELIVERY_PREFETCH_COUNT=8
CRAVES_DELIVERY_MAX_AUTO_LOCK_RENEW_MINUTES=5
CRAVES_DELIVERY_OUTBOX_BATCH_SIZE=20
CRAVES_DELIVERY_OUTBOX_PUBLISH_INTERVAL_MS=5000
```

Use exactly one Service Bus authentication mechanism:

- Preferred: `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE` plus managed identity.
- Temporary fallback: `SERVICE_BUS_CONNECTION_STRING` stored as a Container App secret reference.

Do not set a connection string in source control, pipeline YAML, or plain environment-variable value.

## Database migration

`V4__delivery_command_orchestration.sql` adds:

- source event identity for event-level idempotency;
- scheduled Service Bus sequence number and message ID;
- command processing lease for crash recovery;
- outbox processing lease for crash recovery;
- supporting unique and due-work indexes.

The existing V2 tables remain authoritative:

- `delivery_schema.delivery_provider`
- `delivery_schema.delivery_command`
- `delivery_schema.delivery_job`
- `delivery_schema.delivery_event`
- `delivery_schema.delivery_webhook_inbox`
- `delivery_schema.delivery_outbox`

## Internal controlled-test endpoint

The endpoint exists only while delivery commands are enabled:

```http
POST /internal/v1/delivery-orchestration/chef-accepted
X-Craves-Internal-Secret: <CRAVES_INTERNAL_SERVICE_KEY>
Content-Type: application/json
```

It accepts the same envelope as Service Bus and is intended only for sandbox validation before the
Order Service publisher is wired. It must not be exposed through a public APIM product.

## Files

```text
src/main/java/in/craves/integration/delivery/command/DeliveryCommandProperties.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandModels.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryProviderCatalogRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryJobRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryOutboxRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryProviderRouter.java
src/main/java/in/craves/integration/delivery/command/DeliveryServiceBusConfiguration.java
src/main/java/in/craves/integration/delivery/command/DeliveryServiceBusPublisher.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandScheduler.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandWorker.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandCompletionService.java
src/main/java/in/craves/integration/delivery/command/DeliveryServiceBusProcessors.java
src/main/java/in/craves/integration/delivery/command/DeliveryOutboxPublisher.java
src/main/java/in/craves/integration/web/DeliveryOrchestrationInternalController.java
src/main/resources/db/migration/V4__delivery_command_orchestration.sql
```

## Local tests

```bash
cd services/integration-service
mvn -B clean test
```

The default configuration keeps Service Bus disabled, so unit tests and normal local startup do not need
Azure credentials.

## Safe rollout

1. Deploy code and V4 with `CRAVES_DELIVERY_COMMAND_ENABLED=false`.
2. Confirm Maven tests, Flyway V4, Spring startup, and `/actuator/health`.
3. Provision a Standard Service Bus namespace, topic, subscription/filter, and queue.
4. Enable the Container App system-assigned identity and assign data sender/receiver roles.
5. Set only namespace/entity names and keep orchestration disabled.
6. Restart and confirm health remains UP.
7. Activate Borzo only for the controlled sandbox window and mark only Borzo active in the provider registry.
8. Set `CRAVES_DELIVERY_COMMAND_ENABLED=true` and verify both processors start.
9. Submit one internal sandbox chef-accepted event with a future `readyAt`.
10. Confirm exactly one command, one provider delivery, one job, and one published outbox event.
11. Repeat the identical event and confirm no second command or delivery is created.
12. Disable Borzo outbound calls after the test; keep orchestration disabled until Order Service publishing is ready.

## Current limitations and launch blockers

- Order Service does not yet publish `CHEF_ACCEPTED_ORDER`; the internal endpoint is only a controlled bridge.
- Borzo remains sandbox-only and disabled outside controlled tests.
- Borzo does not document `client_order_id` as a guaranteed provider idempotency key. An ambiguous network timeout
  still requires provider reconciliation before production automatic retry is considered safe.
- The provider-neutral quote contract does not yet contain a first-class pickup ETA field. The router reads known
  normalized ETA keys from provider metadata. Add a mandatory normalized ETA before enabling multiple providers.
- Only adapters with both an active database row and deployed Java adapter are eligible.
- Webhook inbox ingestion works, but the asynchronous inbox-to-delivery-job/status/outbox processor is a later module.
- Support-required state propagation to Order/Admin is pending the Order Service event consumer.
- Private ingress/APIM restrictions and Key Vault references are still pending hardening items.
- Production activation requires business registration, provider KYC, written SLA/commercial terms, and a controlled
  Hyderabad pilot with at least two independent live providers.
