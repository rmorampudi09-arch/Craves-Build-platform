# Craves Delivery Milestone — READY_FOR_PICKUP → Borzo Production Create

Date: 2026-09-09 (IST)

## Milestone status

This milestone records the first verified Craves production flow in which a chef-ready event accelerated an already scheduled delivery command and Craves successfully created a real Borzo production delivery.

The test order was intentionally cancelled by the operator later because the verification was performed late at night. Therefore this milestone proves production booking/create, immediate READY_FOR_PICKUP acceleration, webhook ingress and reconciliation through the observed SEARCHING/planned state. It does **not** claim a completed courier-assignment → pickup → transit → delivered lifecycle.

## Production proof

Chef sub-order:

- `e135eb2e-cf31-4ad3-a53f-f5b1d7f993ae`

Observed sequence:

1. Chef acceptance persisted at approximately `2026-09-08 21:35:17 UTC`.
2. `CHEF_ACCEPTED_ORDER` was published successfully.
3. Chef marked the order `READY_FOR_PICKUP` at approximately `2026-09-08 21:35:34 UTC`.
4. `ORDER_READY_FOR_PICKUP` was published successfully.
5. Integration Service accelerated the existing untouched scheduled delivery command to immediate dispatch at approximately `2026-09-08 21:35:38 UTC`.
6. The command completed with `attempt_count = 1`.
7. Borzo quote succeeded at ₹50.
8. Borzo production create succeeded and returned a real provider order/delivery identifier plus tracking URL.
9. Craves persisted one delivery job for the chef sub-order.
10. Borzo webhook traffic reached Craves and delivery tracking reconciliation continued running.
11. No duplicate Craves delivery command or delivery job was observed for this chef sub-order.

## READY_FOR_PICKUP result

PASS.

The order became ready and the delivery command was accelerated within a few seconds instead of waiting until the original estimated preparation/dispatch time.

This validates the production rollout introduced through PR #302:

- transactional `ORDER_READY_FOR_PICKUP` outbox event;
- Service Bus subscription rule for the ready event;
- Integration Service ready-event consumer;
- atomic acceleration of an untouched scheduled delivery command;
- immediate Service Bus delivery-command message;
- idempotent protection against the superseded scheduled message.

## Borzo product-type caveat

The successful production booking in this milestone was created using Borzo API request `type=standard`.

Craves' product requirement is now to use Borzo `type=hyperlocal` only. PR #303 changes Borzo quote/create requests to send `type=hyperlocal` with **no silent fallback to `standard`**.

The Hyperlocal-only code has passed local Integration Service verification and Azure Integration CI run `36469` on commit `1d9dd8dde851146f2816ddda0c807179ecc9aa6f`.

However, a safe production `/calculate-order` request using `type=hyperlocal` returned HTTP `400` with `is_successful=false`. No `/create-order` call was made during that entitlement test, so no courier booking was created by the test.

This confirms the current blocker is external to the Craves code path: Borzo production account/product entitlement or provider-side Hyperlocal enablement is still required. PR #303 must not be deployed until Borzo accepts a production `type=hyperlocal` calculation.

## Cancellation note

The operator cancelled the real Borzo booking after the above milestone evidence was captured because the test was being performed late at night. This cancellation does not invalidate the READY_FOR_PICKUP acceleration or successful provider-create proof, but it means courier assignment, pickup, transit and delivery completion remain pending for a future daytime end-to-end test.

## Production state at milestone

Verified:

- Order Service READY_FOR_PICKUP persistence: PASS
- `ORDER_READY_FOR_PICKUP` outbox publication: PASS
- Service Bus ready-event routing: PASS
- Integration Service immediate acceleration: PASS
- one delivery-command attempt: PASS
- Borzo quote using `type=standard`: PASS
- Borzo production create using `type=standard`: PASS
- delivery job persistence: PASS
- Borzo webhook ingress: PASS
- tracking reconciliation: PASS
- no duplicate Craves booking observed: PASS
- Borzo Hyperlocal-only code implementation: PASS
- local Integration Service tests for Hyperlocal-only adapter: PASS
- Azure Integration CI run 36469: PASS

Blocked / pending:

- Borzo production `type=hyperlocal` acceptance: BLOCKED — HTTP 400 from safe `/calculate-order`
- Borzo Hyperlocal account/product entitlement: provider-side action required
- PR #303 production deployment: blocked until Hyperlocal calculation passes
- courier assignment
- pickup lifecycle
- in-transit lifecycle
- delivered lifecycle
- final provider-to-Order-Service projection evidence through terminal delivery status

## Next verification

After Borzo enables Hyperlocal for the production account, rerun the safe production `/calculate-order` using `type=hyperlocal`. Only after that returns successful should PR #303 be merged and deployed.

Then, during a daytime test, create exactly one fresh normal customer order and prove:

`Order → chef acceptance → early READY_FOR_PICKUP → immediate dispatch → Borzo hyperlocal create → courier assignment → pickup → transit → delivered → normalized Craves delivery status`, with one provider booking only.
