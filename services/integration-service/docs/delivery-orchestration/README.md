# Delivery Command Orchestration

This module implements the asynchronous delivery flow owned by the Craves Integration Service.
It consumes `CHEF_ACCEPTED_ORDER`, schedules dispatch close to `readyAt`, requests quotes from all
active and deployed delivery adapters, sends the quote candidates through the persisted Delivery
Intelligence engine, attempts delivery creation in intelligent rank order, persists one final delivery
job per chef sub-order, and publishes `DELIVERY_STATUS_CHANGED` through the transactional outbox.

The runtime remains disabled until:

```text
CRAVES_DELIVERY_COMMAND_ENABLED=true
```

Deploying the code while the flag is false does not start Service Bus processors and does not create
provider deliveries.

## Architecture rules preserved

- Never create delivery when payment succeeds.
- Schedule only after the chef accepts the chef-specific sub-order.
- Dispatch at `readyAt - leadTime`, with a default lead of 10 minutes.
- Keep exactly one delivery command, intelligence assignment, and final delivery job per
  `chefSubOrderId`.
- Consume Service Bus messages with PeekLock and manual settlement.
- Treat delivery as at-least-once messaging with idempotent business outcomes.
- Request provider quotes concurrently with a bounded timeout.
- Submit all quoted candidates to the Delivery Intelligence engine.
- Persist predicted success, live and stored performance, momentum, Thompson-sampling exploration,
  proximity, provider quality, final score, and the selected candidate.
- Attempt creation with the intelligence-selected provider first.
- Use the remaining persisted intelligence ranking as bounded fallback order.
- Persist the actual accepted fallback candidate and mark failed provider attempts.
- Store the complete quote, intelligence, and create audit snapshot on `delivery_job`.
- Write `DELIVERY_STATUS_CHANGED` to the database outbox in the same transaction as the delivery job.
- Recover abandoned command and outbox processing leases.
- Dead-letter invalid or exhausted Service Bus messages with an actionable reason.

## Intelligent partner-assignment formula

The existing Java port of the supplied delivery-intelligence code is now in the automatic path.
For every available provider candidate:

```text
predictedSuccessProbability
+ seven-day live performance
+ faded historical performance
+ momentum
+ Thompson-sampling exploration
= providerQualityScore

providerQualityScore
+ pickup proximity or pickup ETA
= finalScore
```

Default quality weights:

```text
Predictor:     55%
Rolling score: 35%
Exploration:   10%
```

Default final-ranking weights:

```text
Proximity or pickup ETA: 60%
Provider quality:         40%
```

The default selection strategy remains stochastic softmax. This prevents a new provider from being
permanently excluded while still favouring stronger candidates. `GREEDY` remains available for
controlled use.

### Provider APIs without pre-booking rider ETA

Some provider APIs, including the current Borzo calculate-order response, return price and
serviceability but do not expose the rider-to-pickup ETA before order creation. The system must not
fabricate rider locations or claim a false ETA.

For such candidates:

- `pickupDistanceKm` remains null.
- `pickupEtaMinutes` remains null.
- The engine uses the configurable neutral proximity score.
- Provider quality, historical performance, momentum, exploration, availability, service area and
  quoted cost remain persisted.

Default:

```text
CRAVES_DELIVERY_UNKNOWN_PROXIMITY_SCORE=50.0
CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED=false
CRAVES_DELIVERY_BORZO_REFUSALS=verify
CRAVES_DELIVERY_COURIER_CANCEL_ENABLED=false
```

When a future adapter supplies a genuine normalized pickup distance or ETA, the full proximity formula
is applied automatically.

## Service Bus topology

```text
Topic: craves-domain-events
  Subscription: integration-service-chef-accepted
    SQL filter: event_type = 'CHEF_ACCEPTED_ORDER'

Queue: delivery-command
  Built-in DLQ: delivery-command/$DeadLetterQueue
```

The Integration Service uses its system-assigned managed identity:

```text
Azure Service Bus Data Sender
  - craves-domain-events topic
  - delivery-command queue

Azure Service Bus Data Receiver
  - integration-service-chef-accepted subscription
  - delivery-command queue
```

A Service Bus connection string is supported only as a temporary local-development fallback. The
Azure deployment must use `SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE` and managed identity.

## Chef-accepted event envelope

The Order Service must publish this versioned envelope:

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
    "distanceKm": 4.6,
    "area": "Madhapur",
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

The Service Bus message must also contain:

```text
event_type=CHEF_ACCEPTED_ORDER
```

### Deterministic routing context

- `distanceKm` may be supplied by Order Service.
- When omitted, Integration Service calculates straight-line distance from pickup and dropoff
  coordinates using the Haversine formula.
- `area` may be supplied explicitly.
- When omitted, the first comma-separated pickup-address component is used, for example
  `Madhapur, Hyderabad` becomes `Madhapur`.
- `orderHour` and `dayOfWeek` are calculated once from `occurredAt` in `Asia/Kolkata` and stored in the
  delivery command. Monday is `0` and Sunday is `6`, matching the supplied predictor convention.

The event is rejected when distance cannot be supplied or calculated, or when an area cannot be
resolved.

## Processing flow

```text
CHEF_ACCEPTED_ORDER subscription
        |
        v
DeliveryCommandScheduler
  - validate event envelope
  - calculate deterministic intelligence context
  - calculate dispatchAt
  - insert delivery_command idempotently
  - schedule delivery-command message natively in Service Bus
        |
        v
DeliveryCommandWorker
  - atomically claim command
  - skip when delivery_job already exists
        |
        v
DeliveryProviderRouter
  - load active delivery_provider rows
  - quote deployed adapters concurrently
  - normalize genuine provider pickup ETA/distance when available
  - call DeliveryIntelligenceService.assign
  - use persisted selected provider first
  - use persisted ranked candidates as bounded fallback
        |
        v
DeliveryCommandCompletionService (one database transaction)
  - mark actual assignment candidate ACCEPTED
  - mark failed create candidates FAILED
  - update assignment status to ASSIGNED
  - insert delivery_job with assignment_id and complete audit snapshot
  - insert DELIVERY_STATUS_CHANGED into delivery_outbox
  - mark delivery_command COMPLETED
        |
        v
DeliveryOutboxPublisher
  - claim due rows with SKIP LOCKED
  - publish to craves-domain-events
  - mark published or retry/dead-letter
```

## Idempotency model

```text
Source event:       unique source_event_id
Chef sub-order:     unique delivery_command.chef_sub_order_id
Assignment:         unique delivery_assignment.chef_sub_order_id
Final delivery job: unique delivery_job.chef_sub_order_id
Provider delivery:  unique provider_id + provider_delivery_id
Outbox:             durable row with retry state
```

The intelligence engine seeds stochastic selection from `chefSubOrderId` and `orderId` and persists the
first assignment. A retry returns the same assignment instead of re-randomizing.

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
CRAVES_DELIVERY_UNKNOWN_PROXIMITY_SCORE=50.0
CRAVES_DELIVERY_WEBHOOK_FIRST_TRACKING_ENABLED=false
CRAVES_DELIVERY_TRACKING_QUIET_SEARCHING_SECONDS=120
CRAVES_DELIVERY_TRACKING_QUIET_ASSIGNED_SECONDS=180
CRAVES_DELIVERY_TRACKING_QUIET_PICKED_UP_SECONDS=300
CRAVES_DELIVERY_TRACKING_SAFETY_POLL_SECONDS=900
CRAVES_DELIVERY_PROVIDER_API_USAGE_ENABLED=false
CRAVES_DELIVERY_PROVIDER_API_USAGE_ALERT_PERCENT=70
CRAVES_DELIVERY_BORZO_DAILY_API_CAP=5000
CRAVES_DELIVERY_PIDGE_DAILY_API_CAP=0
CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED=false
CRAVES_COURIER_BREAKER_ENABLED=false
CRAVES_COURIER_BREAKER_BOOKING_FAILURES=3
CRAVES_COURIER_BREAKER_QUOTE_FAILURES=5
CRAVES_COURIER_BREAKER_HALF_OPEN_SECONDS=30
```

Do not store `SERVICE_BUS_CONNECTION_STRING` in Azure for the managed-identity deployment.

## Internal controlled-test endpoint

The endpoint exists only when delivery commands are enabled:

```http
POST /internal/v1/delivery-orchestration/chef-accepted
X-Craves-Internal-Secret: <CRAVES_INTERNAL_SERVICE_KEY>
Content-Type: application/json
```

It accepts the same envelope as Service Bus and is only for controlled sandbox validation before the
Order Service publisher is wired. It must not be exposed through a public APIM product.

## Main source files

```text
src/main/java/in/craves/integration/delivery/DeliveryIntelligenceService.java
src/main/java/in/craves/integration/delivery/DeliveryAssignmentRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandModels.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandProperties.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandScheduler.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandWorker.java
src/main/java/in/craves/integration/delivery/command/DeliveryProviderRouter.java
src/main/java/in/craves/integration/delivery/command/DeliveryCommandCompletionService.java
src/main/java/in/craves/integration/delivery/command/DeliveryJobRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryOutboxRepository.java
src/main/java/in/craves/integration/delivery/command/DeliveryOutboxPublisher.java
src/main/java/in/craves/integration/delivery/command/DeliveryServiceBusConfiguration.java
src/main/java/in/craves/integration/delivery/command/DeliveryServiceBusProcessors.java
src/main/java/in/craves/integration/web/DeliveryOrchestrationInternalController.java
src/main/resources/db/migration/V4__delivery_command_orchestration.sql
```

## Tests

```bash
cd services/integration-service
mvn -B clean test
```

Coverage includes:

- Scheduling before `readyAt`.
- Haversine distance and area fallback.
- Persisted intelligence context.
- Intelligent selected-provider execution.
- Ranked provider fallback without re-quoting.
- Neutral proximity for provider APIs without pre-booking rider ETA.
- Transactional final assignment and delivery-job completion.
- Worker redelivery idempotency.

## Booking journal

`CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED` (default `false`). Off, nothing below happens and couriers are booked as before.

On, every courier booking attempt is one row in `delivery_schema.provider_create_attempt` (V191), committed before the
courier is called. Each attempt sends its own reference: the order id in base 36 plus the attempt number, 27 characters.

| State | Meaning |
|---|---|
| `INTENT` | The call is about to be made, or was made and no answer was recorded. |
| `CONFIRMED` | Booked, and it is the order's delivery job (set in the job's transaction). |
| `REJECTED` | The courier has no booking: it refused, or a lookup found none. |
| `UNKNOWN` | The answer was lost. The reconciliation worker looks the booking up. |
| `ADOPTED` | A lookup found the booking and it became the delivery job. |
| `ORPHAN_SUSPECT` | A booking may exist that the order does not use. Re-checked for 2 hours. |
| `CANCELLED` | The booking was made and then cancelled with the courier: by the handoff when the order stopped being eligible, or because it was a stray booking (below). |

What changes for an order:

- **A refusal moves on at once.** A Borzo answer that its API document lists as "nothing was created" is `REJECTED`, and
  the next pass, a second later, books Pidge. Borzo is not booked again for that order in the same window. A courier that
  refused an order three times is not tried for it again.
- **A lost answer is looked up.** The first look is 20 seconds after the call. "Not found" moves the order on. Found: the
  booking becomes the job. Still unknown after four looks (about 2 minutes): if another courier can be booked, the row
  becomes `ORPHAN_SUSPECT` and the order moves on; if not, the order keeps waiting on the old schedule, so a late
  confirmation is still adopted.
- **Nothing is booked while an attempt for the order is unresolved.**
- **Checks afterwards.** One lookup 20 seconds after each refusal, one 5 minutes after each "not found", and orphan
  suspects after 60 seconds and then every 5 minutes.
- **A pass that stops answering is taken over after 3 minutes, not 10.** The pass that takes over books nobody: the
  unresolved attempt is looked up first, and a booking the first pass made is adopted without a second call.
- **Only the pass that holds the command writes.** Each claim's `processing_started_at` is its lease token. Completing the
  command, and moving it to a wait, to reconciliation, to failed or to dead letter, change nothing once another pass has
  claimed it. A pass that finds this out after it booked leaves the booking to the lookup; if a lookup had already
  written its attempt off, the booking id is kept on the attempt and `COURIER_REJECTED_BOOKING_EXISTS` or
  `COURIER_ORPHAN_BOOKING_FOUND` is logged at once.
- **A booking is matched to its attempt by its reference**, not only by order and courier.
- **The Borzo-to-Pidge handoff journals its Pidge booking.** It books under an attempt's reference, continues that
  attempt after a lost answer, and marks it `CONFIRMED` or `ADOPTED` in the transaction that moves the job to Pidge.
  An attempt Pidge rejected or cancelled ends the handoff as before (`DELIVERY_HANDOFF_NO_COURIER`). Borzo is not
  cancelled while Pidge may not be booked for the order (an earlier Pidge booking still on record, or three refusals).

- **A handoff that can never book Pidge goes to a person at once.** When the order's Pidge attempts are used up, or a
  Pidge booking for it was confirmed or cancelled earlier, the handoff moves to `MANUAL_REVIEW` and Borzo is kept. While a
  Pidge attempt is still an orphan suspect it is tried again, as before.

### Stray bookings

A stray booking is an `ORPHAN_SUSPECT` attempt that names the courier's booking id: the journal gave the attempt up, or
another job got there first, and the booking exists. The journal check (every 15 seconds, one replica per row, at most
every 5 minutes per row, for 2 hours) reads the booking from the courier and then:

| The courier and the order say | What happens |
|---|---|
| The booking is already cancelled | The attempt becomes `CANCELLED` |
| The order has no delivery job, and its command is `SCHEDULED`, `WAITING_FOR_PROVIDER` or `FAILED` | The booking becomes the job (`ADOPTED`) and the command completes, unless order-service cancelled the order meanwhile (checked again under the lock). Adoption and a pass claiming the command exclude each other |
| No job, and the command is `PROCESSING` or `RECONCILIATION_PENDING` | Looked at again at the next check |
| No job, and the command is `DEAD_LETTER` | Left to a person, as `COURIER_ORPHAN_BOOKING_FOUND` said |
| The order has a job (or was cancelled by order-service) | The booking is cancelled with the courier and read again. Cancelled: `CANCELLED`. Not cancelled: `COURIER_STRAY_BOOKING_UNSETTLED`, once, and no further try |
| The order's own courier is gone (its job is cancelled, failed or returned, or a handoff cancelled Borzo and did not finish) | Not cancelled: `COURIER_STRAY_BOOKING_UNSETTLED` |
| The stray courier has picked up, or its booking has ended | Never cancelled, also when the order was cancelled: `COURIER_STRAY_BOOKING_UNSETTLED` |
| No job, and it is a Pidge order still `PENDING` (created, never dispatched) | Cancelled with Pidge, not adopted |
| A Borzo-to-Pidge handoff is in progress for the job | Looked at again at the next check |

An attempt recorded as `REJECTED` whose booking exists is not touched: `COURIER_REJECTED_BOOKING_EXISTS` and a person.

### Callbacks for a booking that is not a delivery job

Without the journal such a callback is retried 10 times and then dead-lettered. With it, for Borzo and Pidge:

- The booking is read from the courier, and the reference it was made under is looked up in the journal. A callback's
  own content decides nothing.
- **The attempt is `INTENT` or `UNKNOWN`** (the pass, the lookup or the handoff has yet to record the booking): the
  callback waits. It is tried again every 30 seconds without counting an attempt, for up to 30 minutes from when it
  arrived, and is applied in the ordinary way once the job exists. This covers a callback that arrives before its
  booking is committed, and a Pidge callback during a Borzo-to-Pidge handoff.
- **The attempt is `ORPHAN_SUSPECT`**: the booking id is put on the attempt (with `COURIER_ORPHAN_BOOKING_FOUND`), which
  makes it a stray booking, and the callback waits the same way.
- **The attempt is `CANCELLED`**: the callback is marked processed (`STRAY_BOOKING_CANCELLED`).
- Anything else (no such booking, a booking made before the journal, another courier, the courier unreachable, a callback
  older than 30 minutes): retried and dead-lettered as before.

Not covered yet: moving a job to a stray booking when the job's own courier is gone (a person is told instead),
courier cancels while the fleet is off, and confirming order and ops cancels by reading the booking
back. The reconciliation worker's own lease is still `CRAVES_DELIVERY_RECONCILIATION_STALE_MINUTES`.

`CRAVES_DELIVERY_BORZO_REFUSALS` is read only with the journal on:

| Value | A Borzo refusal is |
|---|---|
| `verify` (default) | `REJECTED`, then looked up once |
| `trust` | `REJECTED`, no lookup (after the first weeks, to save Borzo API calls) |
| `unknown` | "outcome unknown", as with the journal off |

Alerts (`CRAVES_ALERT alert=<CODE> ...` log lines; the rules are in `infra/monitoring`):

| Code | Meaning | What to do |
|---|---|---|
| `COURIER_ACCOUNT_REFUSED` | A courier refused for its key, contract or balance | Fix the key or top up. Orders go to the next courier meanwhile |
| `COURIER_ORPHAN_BOOKING_FOUND` | A courier holds a booking the order does not use | Nothing yet: Craves cancels it or makes it the order's delivery within a minute, and says so if it cannot (next row). Only if `orderHasJob=false` and `commandStatus=DEAD_LETTER` is it left alone as the order's only courier: keep it and tell engineering |
| `COURIER_STRAY_BOOKING_UNSETTLED` | Craves could not cancel or adopt a stray booking; `reason` says why | Look at booking `providerRef` in that courier's dashboard. Cancel it there or call the courier; if `reason` says it may be the order's only courier, keep it and tell engineering |
| `COURIER_REJECTED_BOOKING_EXISTS` | A booking recorded as refused or not found exists | Cancel booking `providerRef` in that courier's dashboard (this one is not cancelled automatically). Also set `CRAVES_DELIVERY_BORZO_REFUSALS=unknown` and tell engineering |
| `COURIER_UNRESOLVED_BOOKING` | An attempt has been unresolved for over 10 minutes | Run the query below; look for the reference in the courier's dashboard |
| `COURIER_REJECTED_RATE` | A courier refused over 20% of at least 3 bookings in 15 minutes | Check that courier's account and status |

```sql
SELECT chef_sub_order_id, provider_id, attempt_no, client_ref, state, provider_ref, error, created_at, updated_at
FROM delivery_schema.provider_create_attempt
WHERE state IN ('INTENT', 'UNKNOWN', 'ORPHAN_SUSPECT') ORDER BY created_at;
```

Before switching it on in production:

1. Deploy the alert rules (`infra/monitoring`, `deployAlerts=true`) and see one test line reach a person.
2. Run `scripts/delivery/borzo-sandbox-order-list-check.py` once against Borzo's sandbox. The lookup trusts Borzo's order
   list to be newest first and to show a new order within 20 seconds.
3. Confirm `CRAVES_DELIVERY_COMMAND_ENABLED` and `CRAVES_DELIVERY_RECONCILIATION_ENABLED` are on.
4. Have someone watch the alerts. A stray booking is cancelled automatically; one that could not be is `COURIER_STRAY_BOOKING_UNSETTLED`.

Rollback: unset the flag. Orders already waiting on a lookup finish on the old path with the reference they sent. Journal
rows stay; if the flag goes on again, an unresolved row is looked up before its order is booked. One check first: with
the flag off the handoff no longer sees a Pidge booking it began under the journal, so switch off only when this returns
nothing (or wait a minute and run it again):

```sql
SELECT delivery_job_id, state, attempt_count FROM delivery_schema.delivery_borzo_pidge_handoff
WHERE state IN ('BORZO_CANCELLED', 'PROCESSING_PIDGE', 'PIDGE_RECONCILIATION_PENDING');
```

## Courier cancel for cancelled orders

`CRAVES_DELIVERY_COURIER_CANCEL_ENABLED` (default `false`). Off, nothing below happens: a cancelled order's Borzo or Pidge
courier is cancelled only while the fleet is on (`FleetCourierCancel`), on the courier's answer alone.

On (`CourierCancel`), fleet on or off:

*   Every 5 s, each live Borzo or Pidge booking of an order order-service cancelled (`ORDER_CANCELLED`; a
    refund alone never cancels a courier) gets one attempt. Ops cancelling a delivery (fleet admin) goes the same way and
    gets the reason back at once when it fails.
*   One attempt, claimed in `delivery_schema.courier_cancel` before any call so two replicas never both act:

| Step | Outcome |
|---|---|
| Fetch the booking | Cannot be read: the attempt failed, nothing is cancelled |
| It is already cancelled | Recorded; the delivery job hears it at once |
| The courier has picked up, is in transit or at drop-off, or the booking is over | Never cancelled. `COURIER_CANCEL_UNCONFIRMED`, once, and no further attempt |
| Cancel, then fetch again | Cancelled only when the courier's record says so, whatever the cancel call answered. Otherwise the attempt failed |

*   A failed attempt is tried again after 3 minutes, 3 times in all; after the third, `COURIER_CANCEL_UNCONFIRMED`, once.
    With the fleet on, ops's app gets the same push as before.
*   A Borzo booking waiting for its switch to Pidge stops waiting first; one mid-switch is left to finish, then cancelled.

| Alert | Means | Do |
|---|---|---|
| `COURIER_CANCEL_UNCONFIRMED` | The order was cancelled (or ops cancelled the delivery) and the courier still shows booking `delivery` live; `reason` says why | Cancel it in that courier's dashboard or call them. If their courier has the food, call the courier |

Not covered: the Borzo-to-Pidge handoff's own cancels and the manual Borzo endpoint, which work as before.

Rollback: unset the flag. `courier_cancel` rows stay and both paths read them.

## Status rank guard

`CRAVES_DELIVERY_STATUS_RANK_GUARD` = `off` (default) | `shadow` | `enforce`. Off, nothing below happens and no new
statement runs. It sits in `DeliveryStatusUpdateService`, after today's checks and under the job's row lock, so it covers
every courier status update: callbacks, the tracking poll, and the updates `CourierCancel`, the handoff worker and the
fleet bridge pass on. A new booking (first insert, the switch to Pidge, a fleet handover) starts again and is not judged.

| Status | Rank |
|---|---|
| PENDING | 10 |
| SEARCHING | 20 |
| COURIER_ASSIGNED | 30 |
| COURIER_TO_PICKUP | 35 |
| AT_PICKUP | 40 |
| PICKED_UP | 50 |
| IN_TRANSIT | 60 |
| AT_DROPOFF | 70 |
| RETURNING | 80 |
| DELIVERED, RETURNED, CANCELLED, FAILED | 100 (final) |

*   An update to a lower rank is `STALE_RANK`.
*   Except, before pickup only, from COURIER_ASSIGNED, COURIER_TO_PICKUP or AT_PICKUP:

| Back to | Why it is allowed |
|---|---|
| PENDING, SEARCHING | The courier dropped the job and the provider is searching again |
| COURIER_ASSIGNED | The provider gave the job to another rider without a search; the new rider's name, phone and tracking link must reach the order. Neither the Borzo nor the Pidge mapper marks a reassignment, so this is allowed on the status alone, not on proof that either reports it this way |

*   A final status lands from any stage. A final job stays as it is (`TERMINAL_STATUS_PROTECTED`, as before).
*   DELAYED is not a stage: it is applied as before. A job that is DELAYED counts as PICKED_UP once `picked_up_at` is
    set, otherwise as PENDING.

Courier-side end: a CANCELLED or FAILED applied to a live job of Borzo or Pidge, when Craves holds no
`courier_cancel` row for that booking and no `order_cancelled` row for the order.

| Mode | Earlier stage | Courier-side end |
|---|---|---|
| `shadow` | Applied as today; one `decision=STALE_RANK` line | Applied as today; one `decision=COURIER_ENDED` line |
| `enforce` | Not applied. A callback is kept in `delivery_event` with `applied = false`, `ignored_reason = STALE_RANK`; a poll just waits for the next one. The same line with `mode=enforce` | Applied, then one `delivery_exception_case` (`PROVIDER_CANCELLED`, `OPEN`, opened by `00000000-0000-0000-0000-000000000000`) in the same transaction, and `COURIER_ENDED_DELIVERY` once. No case when the job already has an active one |

The line (WARN, one per update):

```text
DELIVERY_STATUS_RANK_GUARD mode=shadow decision=STALE_RANK source=WEBHOOK provider=borzo jobId=<uuid> delivery=<booking id> from=PICKED_UP to=COURIER_ASSIGNED providerStatus=courier_assigned
```

The guard's own statements (the `picked_up_at` read, the `courier_cancel`/`order_cancelled` read, opening the case) run
in a savepoint inside the status update's transaction. If one fails, it alone is rolled back, the status update goes on
as it would with the flag off, and one ERROR line says which (`step=PICKED_UP_READ`, `CRAVES_ENDED_READ` or `CASE_OPEN`):

```text
DELIVERY_STATUS_RANK_GUARD mode=enforce decision=GUARD_FAILED step=CASE_OPEN jobId=<uuid> error=<message>
```

A `CASE_OPEN` failure means a courier-side end got no case and no page: open the case by hand for that job.

The flag's value is trimmed and read in any case; empty is `off`; any other word stops start-up.

| Alert | Means | Do |
|---|---|---|
| `COURIER_ENDED_DELIVERY` | `provider` cancelled or failed booking `delivery` on its own (`was` is the stage it had reached) and the order is still live | Open the case in the admin's delivery exceptions. Before pickup: book another courier or cancel the order. After pickup (`was` is PICKED_UP or later): call the courier first, the food is with their rider |

Reading a shadow week:

```kusto
ContainerAppConsoleLogs_CL
| where Log_s contains "DELIVERY_STATUS_RANK_GUARD mode=shadow"
| parse Log_s with * "decision=" decision " source=" source " provider=" provider " jobId=" * " from=" from " to=" to " providerStatus=" providerStatus
| summarize count() by decision, provider, source, from, to, providerStatus
```

*   `STALE_RANK` rows are updates enforce will drop. Each `from`/`to` pair must be explained: a late callback or a poll
    behind a callback is expected; a courier that really steps back after pickup (for example Borzo's
    `reattempt_courier_assigned` after a failed drop-off) is not, and needs the table changed before enforce.
*   `GUARD_FAILED` rows must be zero before enforce.
*   `COURIER_ENDED` rows are the cases and pages enforce will open. Check each was really the courier's own doing.

Switch on: set `shadow` for a week of real deliveries; explain every pair; set `enforce`. Rollback: set `off`. Cases
already opened stay for ops to close.

Not in this guard yet: provider clocks (`status_provider_at`, so a late re-match is told from a real one and a forward
callback stamped before a poll is no longer dropped as stale), `attempt_no`/`rematched_at`, `delayed_at`,
and booking the next courier automatically after a courier-side end. The manual Borzo cancel
endpoint writes no `courier_cancel` row, so its cancel opens a case under enforce.

## Command sweeper and courier wait cap

`CRAVES_DELIVERY_COMMAND_SWEEPER_ENABLED` (default `false`). Off, nothing below happens. On, it also needs
`CRAVES_DELIVERY_COMMAND_ENABLED` and `CRAVES_DELIVERY_RECONCILIATION_ENABLED`: the sweep is the last step of the
create-reconciliation tick (`DeliveryCreateReconciliationWorker`, every 15 s), on every replica, so a tick with slow
courier lookups delays it. No migration.

| Setting | Default | Meaning |
|---|---|---|
| `CRAVES_DELIVERY_COMMAND_SWEEPER_MARGIN_SECONDS` | 15 (5 to 3600) | How long a command must be due and unwritten before it is re-sent, and the least time between two re-sends of one command |
| `CRAVES_DELIVERY_COURIER_WAIT_CAP_MINUTES` | 20 (1 to 1440) | How long after its promised ready time a command may still be without a courier |

A delivery command is run by Service Bus messages. One whose message never comes, or is dropped as a repeated id, stays
where it is. Each tick the sweeper (`DeliveryCommandSweeper`) looks at commands dispatched in the last 24 hours:

| Status | Re-sent when, plus the margin |
|---|---|
| `SCHEDULED` | `dispatch_at` has passed. With food-timed dispatch on and no ready tap: the later of `dispatch_at` and promised ready + 15 min, the longest a hold can run |
| `WAITING_FOR_PROVIDER` | `next_provider_retry_at` has passed |
| `FAILED` | its retry delay (30 s doubling to 600 s by attempt) has passed since it failed |
| `PROCESSING` | its lease has passed (10 min; 3 min with the booking journal) |

*   **Re-send.** One replica claims the command (`FOR UPDATE SKIP LOCKED`, then `updated_at = now()`), then sends one
    message with a new id `delivery-sweep:<command>:<uuid>` and logs `DELIVERY_COMMAND_SWEPT`. It changes no status:
    the worker claims, takes over after the lease, or dead-letters at the attempt limit, as for any message. A send
    that fails is logged with `sent=false` and tried again one margin later.
*   **Cap.** A command still `WAITING_FOR_PROVIDER`, or due with nobody working on it, once its promised ready time is
    older than the cap becomes `DEAD_LETTER` with `last_error = COURIER_WAIT_CAP`, is not sent again, and
    `DELIVERY_COURIER_WAIT_CAP` is logged. Not while Craves riders are deciding (an open `CRAVES_FLEET` stage), not
    a command a pass holds inside its lease, and never an order that has a delivery job or a booking call whose answer
    is not known yet (journal `INTENT` or `UNKNOWN`, or an `ORPHAN_SUSPECT` in its 2 hours of lookups): those are
    re-sent instead, and the takeover or the reconciliation worker finishes them. A
    message still on its way for it completes without a Service Bus dead letter. Fleet ops can still give the order to
    a rider; a courier is booked by hand.
*   **Not swept:** `RECONCILIATION_PENDING` (the reconciliation worker polls it and ends it after its looks), and
    commands dispatched over 24 hours ago, which stay as they are.
*   While riders decide, the command's own message runs each round, so a command whose message is lost there is
    re-sent like any other. A healthy round rewrites the command every 5 to 10 s and is never re-sent.
*   A re-sent command's `updated_at` moves, so `DELIVERY_COMMAND_STALLED` (10 minutes unwritten) no longer shows it;
    `DELIVERY_COMMAND_SWEPT` does, each time.

| Alert | Means | Do |
|---|---|---|
| `DELIVERY_COMMAND_SWEPT` | A due command had no message and was sent one (`status=` says where it stood) | Nothing for one. Many at once: check the Service Bus queue and the delivery-command consumer. `sent=false`: the send failed, check Service Bus |
| `DELIVERY_COURIER_WAIT_CAP` | No courier `capMinutes` after the promised ready time; the command has stopped (`was=` its status) | Book a courier by hand or cancel the order with the customer |

Switch on: count what the first ticks will end, then set the flag.

```sql
SELECT status, count(*) FROM delivery_schema.delivery_command
WHERE status IN ('SCHEDULED', 'WAITING_FOR_PROVIDER', 'FAILED', 'PROCESSING') AND dispatch_at > now() - INTERVAL '24 hours'
  AND COALESCE(promised_ready_at, ready_at, dispatch_at) < now() - INTERVAL '20 minutes'
GROUP BY status;
```

Rollback: unset the flag. Nothing is re-sent or capped from the next tick. Commands already ended stay `DEAD_LETTER`;
a late message for one is then dead-lettered as for any dead command.

Not in this yet: a count of re-sends per command (a command is bounded by the margin, its 5 attempts and the cap
instead), an ops case row for an order that has no delivery job, the stored hold time of a food-timed command, and the
caps on a retained Borzo search and on the handoff's Pidge phase.

## Webhook-first tracking

`CRAVES_DELIVERY_WEBHOOK_FIRST_TRACKING_ENABLED` = `false` (default) | `true`. Off, nothing below happens and no new
statement runs: every live job is polled every `CRAVES_DELIVERY_TRACKING_POLL_SECONDS` (60), and a Borzo poll is two
calls (`GET /orders`, `GET /courier`), about 80 calls for a 40-minute delivery.

On, the tracking worker (`DeliveryTrackingReconciliationWorker`, still every 15 s) polls a job only when it has been
quiet, and callbacks set the pace:

| Job is | Polled after this long with no callback and no poll | Variable |
|---|---|---|
| before a rider (PENDING, SEARCHING, DELAYED) | 120 s | `CRAVES_DELIVERY_TRACKING_QUIET_SEARCHING_SECONDS` |
| COURIER_ASSIGNED to AT_PICKUP | 180 s | `CRAVES_DELIVERY_TRACKING_QUIET_ASSIGNED_SECONDS` |
| PICKED_UP and after | 300 s | `CRAVES_DELIVERY_TRACKING_QUIET_PICKED_UP_SECONDS` |

*   A poll, whatever it finds, sets the next poll one quiet period later and writes `delivery_job.last_polled_at`.
*   A callback for the job, applied or ignored, writes `last_webhook_at` and sets the next poll to one quiet period
    later, but never later than `CRAVES_DELIVERY_TRACKING_SAFETY_POLL_SECONDS` (900) after the last poll. So a courier
    whose callbacks keep arriving is still polled every 15 minutes, and a lost callback is found one quiet period after
    the courier goes silent.
*   A job waiting to retry a failed poll keeps its retry time; a callback does not shorten it.
*   A Borzo poll reads the courier (`GET /courier`) only when the order it just read differs from the job and has a
    rider. A poll that finds nothing new is one call. Status events that carry the rider's name and phone today still do.
*   `DELIVERY_TRACKING_POLL_SAW_FIRST provider=… jobId=… from=… to=…` is logged when a poll, not a callback, brings a
    change. A rising count for one courier means its callbacks are not arriving.
*   The schedule statement in a callback runs in a savepoint and the one in the worker on its own: if either fails, the
    status update goes on as without it and `DELIVERY_WEBHOOK_FIRST_TRACKING step=… failed` is logged.

The test `WebhookFirstTrackingDatabaseTest` runs 300 Borzo deliveries of 40 minutes through the real worker, status
service and Borzo client, one in five with no callbacks and one in five with every other callback lost: 2,880 tracking
calls, 3,480 with a quote and a booking each (today: about 24,000), and every delivery reaches DELIVERED.

Switch on: set the flag; watch `DELIVERY_TRACKING_POLL_SAW_FIRST` and the day's row in `provider_api_usage` (below).
Rollback: set it to `false`; the 60-second poll is back from each job's next poll. `last_webhook_at` and
`last_polled_at` (V194) are then no longer written or read.

Not in this yet: one `GET /courier` per assignment whoever saw it (needs a stored courier reference), an executor and
shorter timeouts per courier so one hanging courier cannot delay the others' polls, an alert for a live job with no
callback for 20 minutes, and the courier's name in a timed-out quote's log line.

## Courier API usage

Every HTTP request to Borzo and Pidge is counted in memory in the replica that sends it (`CourierApiUsage`).
Counting writes nothing and cannot fail a call. Shiprocket is not in use and is not counted.

`CRAVES_DELIVERY_PROVIDER_API_USAGE_ENABLED` = `false` (default) | `true`. On, `IntegrationAlertMonitor` (every 5
minutes, in each replica) adds the replica's count to `delivery_schema.provider_api_usage`, one row per courier per day
in India, so the row is the total over all replicas, at most one run behind. It is one write per courier per run, not
one per call. A replica that stops loses the calls it had not yet added (at most 5 minutes of its own).

| Alert | Raised | Do |
|---|---|---|
| `COURIER_API_USAGE_HIGH provider= calls= cap= percent=` | Once per courier per day, when the day's calls reach `CRAVES_DELIVERY_PROVIDER_API_USAGE_ALERT_PERCENT` (70) of the courier's cap | Check webhook-first tracking is on and `DELIVERY_TRACKING_POLL_SAW_FIRST` is not climbing; ask the courier for a higher cap. Past the cap, quotes and bookings for that courier are refused |
| `COURIER_API_RATE_LIMITED provider= count=` | By each replica, each run in which the courier answered HTTP 429 | The same; the courier is already refusing calls |

Caps, in calls a day: `CRAVES_DELIVERY_BORZO_DAILY_API_CAP` (5000), `CRAVES_DELIVERY_PIDGE_DAILY_API_CAP` (0).
0 counts without alerting. Borzo's cap is per 24 hours, not per
calendar day, and it also allows 100 calls a minute, which is not counted: `COURIER_API_RATE_LIMITED` covers both.

```sql
SELECT * FROM delivery_schema.provider_api_usage ORDER BY day DESC, provider_id;
```

Switch on: set the flag. Rollback: set it to `false`; the table keeps its rows and nothing reads them.

## Courier webhook secret rotation

`BORZO_CALLBACK_TOKEN_PREVIOUS` and `PIDGE_WEBHOOK_TOKEN_PREVIOUS` are optional and empty by default. When one is set,
that courier's webhook check also accepts the previous value and writes
`COURIER_WEBHOOK_PREVIOUS_SECRET_USED provider=<borzo|pidge>` (no values) for each callback that matched it. Steps are
in `docs/SECRETS.md`. Empty: only the current value is accepted.

## Shared courier breaker

`CRAVES_COURIER_BREAKER_ENABLED` = `false` (default) | `true`. Off, the `CourierBreaker` bean does not exist and no
statement runs. On, it is used only while `CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED` is on too: without the journal a
courier's refusal of one order cannot be told from a failing courier.

One row per courier in `delivery_schema.provider_breaker` (V195, V196) is the breaker for every replica. The row is written on
a courier's first failure; a courier that has not failed has no row and costs one primary-key read per routing pass.

| State | Row | A routing pass |
|---|---|---|
| Closed | none, or `opened_at IS NULL` | quotes and books the courier |
| Open | `opened_at` set | does not call the courier; the quote audit says `Courier breaker is open` |
| Half-open | open for `CRAVES_COURIER_BREAKER_HALF_OPEN_SECONDS` (30), and no probe claimed in that time | the one replica whose update sets `probe_at` calls the courier for its order; the others still skip it |

- **Opens** after `CRAVES_COURIER_BREAKER_BOOKING_FAILURES` (3) failed bookings in a row, or
  `CRAVES_COURIER_BREAKER_QUOTE_FAILURES` (5) failed quotes in a row, counted over all replicas with no time window.
- **One order's failed quotes count once.** A waiting order is quoted again on every pass; the row remembers the order
  counted last (`quote_failed_order`) and the same order failing again adds nothing, so it takes different orders to
  open the breaker on quotes. Bookings are already limited per order by the journal.
- **A failure** is no answer, a timeout, HTTP 5xx or 429, a booking whose answer was lost or unusable, or a quote slower
  than `CRAVES_DELIVERY_QUOTE_TIMEOUT_SECONDS`. A courier's refusal of one order (any other 4xx, `is_successful: false`,
  a failed validation) is not counted and changes nothing.
- **A success** sets the count to zero. An answered quote, available or not, is a success for quotes only: it does not
  close a breaker that failed bookings opened. A booking closes it.
- **A failed probe** keeps the breaker open; the next probe is `HALF_OPEN_SECONDS` after that one was claimed. So is the
  next probe after a booking that gave no verdict.
- **A probe that was not used is given back.** A pass that took the probe, was quoted by the courier and then booked
  another courier or nobody clears `probe_at`, so the next pass that can book takes the probe at once. It clears only
  its own claim, never one another replica has taken since.
- **While Borzo's breaker is open** in the timed policy, Borzo's window is closed for the order being routed and Pidge is
  quoted at once. While Pidge's is open, or every courier's, the command waits as it does when nobody quotes, up to the
  courier wait cap.
- The fleet cost guard's courier quote is skipped while the breaker is open and never takes the probe: only a pass that
  can book does.
- A lost booking answer is counted and still goes to the reconciliation lookup; the breaker never books again.
- Not covered: reconciliation lookups, tracking polls, cancels and the Borzo-to-Pidge handoff's own Pidge booking.

If the row cannot be read the courier is called as if there were no breaker; a result that cannot be written is
dropped with a warning. The breaker never fails a routing pass. A pass waits at most 1 second for the read, the wait
for a database connection included: the read runs on up to 8 threads of its own (no second connection pool), and a
pass that finds all 8 busy does not wait at all. Each statement is also limited to 2 seconds.

| Alert | Raised | Do |
|---|---|---|
| `COURIER_BREAKER_OPEN provider= failed=bookings\|quotes halfOpenSeconds=` | Once, by the replica whose write opened the breaker | Check the courier's status and `COURIER_API_RATE_LIMITED` / `COURIER_ACCOUNT_REFUSED`. Orders go to the next courier meanwhile; the breaker closes itself on the first good probe (`Courier breaker closed provider=` at WARN) |

```sql
SELECT * FROM delivery_schema.provider_breaker;
-- Close one by hand:
UPDATE delivery_schema.provider_breaker SET booking_failures = 0, quote_failures = 0, opened_at = NULL, probe_at = NULL WHERE provider_id = 'borzo';
```

Switch on: the booking journal first, then set the flag. Rollback: set it to `false`; the table keeps its rows and
nothing reads them. `CRAVES_PROVIDER_RESILIENCE_ENABLED` (`ProviderGuard`, per replica, quotes only) is separate and
unchanged; both may be on.

## Courier capabilities

`CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED` = `false` (default) | `true`. Off, nothing below happens: every courier is
asked for every order and the Borzo-to-Pidge handoff runs as before. No migration; it needs no other flag.

Each courier adapter declares what it offers (`DeliveryProviderAdapter.capabilities()`). Unknown counts as not offered.

| Courier | `THERMOBOX` (hot-food box) | `PROVIDER_EVENT_TIME` (its own time on status events) |
|---|---|---|
| Borzo | yes: `is_thermobox_required` on the order, sent today | yes: `event_datetime` |
| Pidge | no: its API has no such field and `PidgeApiClient` refuses such an order | yes: `updated_at` |

An order needs `THERMOBOX` when its delivery request says `thermoboxRequired`. Nothing reads `PROVIDER_EVENT_TIME` yet.
Thermobox needs no other code: Borzo is already sent the field, and Pidge is never asked.

On:

- **Routing.** A courier that lacks what the order needs is not quoted; the quote audit says
  `Courier cannot carry this order: needs [THERMOBOX]`. The fleet cost guard's quote skips it too.
- **No capable courier.** In the timed policy, once Borzo's window is over (or Borzo refused, or is switched off) and
  Pidge cannot carry the order, the command ends at once instead of waiting on Pidge: `DEAD_LETTER` with
  `last_error = NO_CAPABLE_COURIER`, and one alert. Without the timed policy the same happens when no active courier can
  carry it. A later message for that command is acknowledged as done. While only Borzo's shared breaker keeps the order
  from Borzo, the order waits out Borzo's window first.
- **Borzo down for its whole window.** A hot-box order waits inside Borzo's 120 seconds (no quote, breaker open) and is
  ended as `NO_CAPABLE_COURIER` on the first pass after them: Borzo's window is its only chance, and waiting longer
  would only retry Pidge, which can never take it.
- **Never while a booking of the order may exist.** An attempt whose answer is unknown sends the command to the
  reconciliation lookup first, as for any order. While an attempt is an orphan suspect still being looked up (2 hours),
  or a refused booking was later found at its courier (the stray-booking path adopts or cancels it), the command waits
  instead of ending (the courier wait cap then ends a wait that goes on too long, and it too spares an orphan suspect
  still being looked up). It is ended as `NO_CAPABLE_COURIER` only when its
  attempts are none, refused outright or cancelled.
- **No ops case row for it.** `delivery_exception_case` belongs to a delivery job and this order has none, so, like the
  courier wait cap, the dead letter and the paged alert are what ops act on.
- **Borzo kept (handoff).** When Borzo's 120 seconds pass without a courier and Pidge cannot carry the order, Borzo is
  not cancelled: the handoff ends as `RETAINED_BORZO` and Borzo goes on searching. If it still has no courier when the
  promised ready time is `CRAVES_DELIVERY_COURIER_WAIT_CAP_MINUTES` (20) old, one `delivery_exception_case`
  (`RIDER_NOT_ASSIGNED`, opened by the system) is opened for the job and `DELIVERY_COURIER_WAIT_CAP ... was=RETAINED_BORZO`
  is logged, once per job; a job ops already holds an active case for is left alone. Checked on the handoff worker's
  tick; no new job.
- **The handoff's Pidge phase ends.** Off, it retries for ever. On:
  - while Pidge may hold a booking the handoff rests in `PIDGE_RECONCILIATION_PENDING` and each later try only looks the
    booking up (Pidge is not asked to book again), up to 20 tries. That covers a lost answer and a booking that exists
    while a later step fails: Pidge shows it as not ready yet, the job could not be switched, or its cancel is not
    confirmed. `pidge_booking` (written before Pidge is called) decides; the phase is never ended as "not booked" then;
  - when nothing was sent to Pidge (no quote, order check failing) the phase ends at its tenth try;
  - tries are the Pidge phase's own: `pidge_phase_first_attempt` (V196) keeps the claim number of its first failed try;
  - the end is `MANUAL_REVIEW`, `DELIVERY_HANDOFF_NO_COURIER`, and one `delivery_exception_case` (`RIDER_NOT_ASSIGNED`)
    whose note says either that nothing was booked with Pidge or to check Pidge first because a booking may exist.
    `DELIVERY_HANDOFF_STALLED` still fires at claim 7.

| Alert | Raised | Do |
|---|---|---|
| `NO_CAPABLE_COURIER commandId= chefSubOrderId= orderId= reason=` | Once, when the command is ended. Pages | Book a courier by hand or cancel the order; the command will not run again |
| `DELIVERY_COURIER_WAIT_CAP jobId= ... was=RETAINED_BORZO` | Once per job | Open the job's case: Borzo is still searching |

```sql
SELECT id, chef_sub_order_id, updated_at FROM delivery_schema.delivery_command
WHERE status = 'DEAD_LETTER' AND last_error = 'NO_CAPABLE_COURIER' ORDER BY updated_at DESC;
```

Switch on: set the flag. Rollback: set it to `false`; ended commands stay ended, a handoff resting in
`PIDGE_RECONCILIATION_PENDING` is picked up by the old loop (it claims that state already), and kept Borzo bookings stay.

Not in this yet: an unanswered Borzo booking for a hot-box order is still given up as an orphan suspect after its
lookups, as for any order; the command then waits while the suspect is looked up for 2 more hours.

## Safe rollout

1. Deploy and test with `CRAVES_DELIVERY_COMMAND_ENABLED=false`.
2. Confirm Spring startup and `/actuator/health`.
3. Keep `BORZO_API_ENABLED=false` outside a controlled sandbox window.
4. Register only technically and commercially approved providers as active.
5. Activate one sandbox provider and orchestration for one controlled future `readyAt` event.
6. Confirm one command, one assignment, one provider delivery, one job and one published outbox event.
7. Repeat the identical event and confirm no second assignment or delivery.
8. Disable Borzo and orchestration after the controlled test.
9. Wire Order Service publishing only after the controlled test is documented.

## Remaining launch blockers

- Order Service does not yet publish `CHEF_ACCEPTED_ORDER`.
- Borzo remains sandbox-only outside a contracted production account.
- Additional providers need real adapters and normalized pickup ETA/distance fields where their APIs
  expose them.
- Private ingress/APIM restrictions and Key Vault references remain hardening items.
- Production requires provider KYC, written commercial/SLA terms, monitoring, support runbooks, and a
  controlled Hyderabad pilot with at least two independent live providers.
