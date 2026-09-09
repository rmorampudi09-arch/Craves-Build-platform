# Craves Delivery Status Visibility Fix — Production Handover

Date: 2026-09-09

## Production defect

A real Borzo production delivery completed successfully for chef sub-order:

`005c348d-dc04-4506-ae45-fda4633232d7`

Integration Service normalized the provider lifecycle through:

`SEARCHING -> COURIER_ASSIGNED -> COURIER_TO_PICKUP -> AT_PICKUP -> PICKED_UP -> IN_TRANSIT -> AT_DROPOFF -> DELIVERED`

The final Integration delivery job state was `DELIVERED` with provider status `finished`. Eight `DELIVERY_STATUS_CHANGED` outbox events were published, and Order Service processed all eight. Order Service's durable delivery projection and history also ended at `DELIVERED`.

However, `order_schema.customer_order.status` remained `READY_FOR_PICKUP`, so existing Customer and Chef APIs/UI continued to render the old commercial status even though `delivery_status=DELIVERED` was correct.

## Root cause of the Craves display defect

The delivery-status consumer intentionally updated only dedicated `delivery_*` columns. Existing customer and chef order contracts render `customer_order.status`, which already contains `OUT_FOR_DELIVERY` and `DELIVERED` states but was never synchronized from the provider-neutral delivery projection.

## Functional fix

Original fix branch: `fix/delivery-status-visible-in-craves`

Merged PR: `#305`

Merge commit: `b4883b4ac6001a1975d02f3884d424c434f4434e`

The fix keeps provider-neutral delivery detail separate while synchronizing only two unambiguous fulfillment milestones already present in the commercial order enum:

- `READY_FOR_PICKUP` + `PICKED_UP`/`IN_TRANSIT`/`AT_DROPOFF` -> `OUT_FOR_DELIVERY`
- `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` + `DELIVERED` -> `DELIVERED`

The synchronization runs inside the same Order Service database transaction as the accepted delivery projection and appends an `order_status_history` row with a system/null actor.

It never changes payment, rejection, cancellation, refund or refund-completion states from provider callbacks.

## Validation before first deployment

The Order Service was validated with Microsoft OpenJDK 21.

Result:

- Java 21 active;
- Maven used Java 21;
- 69 tests executed;
- 0 failures;
- 0 errors;
- 0 skipped;
- `BUILD SUCCESS`.

The Maven-created `target/` directory was the only local untracked output and did not represent a source-code modification.

## First production deployment attempt — FAILED SAFELY

Azure DevOps Order Service pipeline:

`36479`

Pipeline commit:

`b4883b4ac6001a1975d02f3884d424c434f4434e`

Build/test and image publication succeeded. The immutable image was pushed as:

`cravesprodlowacr82121.azurecr.io/craves/order-service:36479`

The new Container App revision was:

`ca-craves-order-service-prodlow--0000075`

The application failed during Flyway validation before becoming healthy.

### Exact failure

Production Order Service schema history already contained an applied Flyway migration at version `20`:

`Applied to database checksum: 182093619`

PR #305 introduced a new local migration also using version `20`:

`Resolved locally checksum: 292549667`

Flyway correctly stopped startup with:

`Migration checksum mismatch for migration version 20`

No Flyway repair was executed and production schema history was not rewritten.

### Automatic rollback proof

The runtime-preserving deployment script detected the explicit unhealthy/ActivationFailed state and automatically restored the previous immutable Order Service image:

`cravesprodlowacr82121.azurecr.io/craves/order-service:36468`

Healthy rollback revision:

`ca-craves-order-service-prodlow--0000076`

This means the failed deployment did not leave the production Order Service on the broken image.

## Correct remediation — V21, not Flyway repair

Corrective branch:

`fix/order-delivery-status-v21`

The commercial-status backfill migration has been moved from the conflicting V20 filename to:

`services/order-service/src/main/resources/db/migration/V21__delivery_commercial_status_projection.sql`

The conflicting file:

`V20__delivery_commercial_status_projection.sql`

is deliberately removed from source.

The V21 migration uses V21-specific deterministic audit IDs and preserves the same narrow backfill logic:

- existing `READY_FOR_PICKUP` + `PICKED_UP`/`IN_TRANSIT`/`AT_DROPOFF` -> `OUT_FOR_DELIVERY`;
- existing `READY_FOR_PICKUP` or `OUT_FOR_DELIVERY` + `DELIVERED` -> `DELIVERED`.

The production-applied V20 is treated as reserved history. We do not overwrite its checksum and do not use `flyway repair` simply to force a new V20 into production.

`DeliveryStatusMigrationTest` now guards this by requiring the conflicting V20 delivery-status migration resource to be absent and the new V21 resource to be present.

## Expected repair for the proven delivered order

After a successful Order Service deployment containing V21, the proven production order should become:

```text
commercial status = DELIVERED
delivery_status   = DELIVERED
```

The migration changes only the commercial status and writes audit history when the durable delivery projection proves the fulfillment milestone. Existing provider IDs, webhook evidence, delivery events and delivery-status history remain intact.

## Production validation after corrective deployment

1. Confirm the deployment pipeline uses the exact corrective merge commit.
2. Confirm the new Order Container App revision becomes healthy.
3. Confirm Flyway no longer reports a V20 checksum mismatch.
4. Confirm V21 is recorded as successfully applied in `order_schema.flyway_schema_history`.
5. Confirm `CRAVES_DELIVERY_STATUS_CONSUMER_ENABLED=true` remains preserved.
6. Confirm order `005c348d-dc04-4506-ae45-fda4633232d7` has both commercial and delivery status `DELIVERED`.
7. Confirm no new Service Bus delivery-status DLQ growth.
8. On the next real delivery, verify `READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED` appears in Craves without manual database edits.

## Separate known item

The Service Bus delivery-status subscription had one pre-existing DLQ message during diagnosis. It did not block the successful production order because all eight events for that order were processed. Inspect that DLQ item separately; do not conflate it with this visibility bug or the Flyway V20 collision.

## Hyperlocal separation

This Order Service fix is independent of Borzo Hyperlocal PR #303. Production Borzo remains on the working `standard` product until Borzo enables/accepts `type=hyperlocal`. Do not mix the Hyperlocal deployment with this Order status visibility remediation.

## Manual actions intentionally not performed

- No production database row was manually edited.
- No Flyway repair was executed.
- No secret was changed.
- No Key Vault setting was changed.
- No Razorpay configuration was changed.
- No Borzo credential or product type was changed.
- No new Azure resource or paid SKU was provisioned.
