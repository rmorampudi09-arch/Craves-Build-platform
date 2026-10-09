# Verified delivery handoff projection

## Scope

This source change repairs the existing Borzo-to-Pidge delivery-status contract. It does not enable a handoff, book or cancel a courier, change provider routing, update runtime flags, or change Chef action/commercial-state eligibility. The existing `commercialStatusForDelivery` policy is unchanged.

Order retains the original eight event fields and adds the three optional fields already emitted by Integration: `handoffFromProviderId`, `handoffFromProviderDeliveryId`, and `handoffContinuation`. Event version remains `1.0`; the canonical JSON schema admits these optional fields with strict Borzo-to-Pidge structural relationships while keeping `additionalProperties: false`. Schema conformance alone never authorizes a binding change. Existing ordinary-provider events need no proof lookup.

## Authority and proof

The optional event fields are not authority to change the pinned provider. For an event with handoff provenance, Order first validates the existing accepted/eligible order, checkout and delivery-job identity, original Borzo binding (or the already-applied Pidge binding), and supported provenance. Only a Borzo-to-Pidge binding transition then reads:

`GET /internal/v1/delivery-handoff-proof/{deliveryJobId}/events/{eventId}`

Integration authorizes this read using its existing `InternalRequestAuthorizer` and `X-Craves-Internal-Secret` header before accessing the database. One read snapshot joins the existing handoff journal, logical delivery job and delivery outbox. It requires a completed journal, recorded cancellation intent and cancellation confirmation, same-clock cancellation/completion ordering, the committed Pidge binding, and matching event/job/order/suborder/old/new-provider identities. The lookup uses the payload event ID, not the separate outbox row ID. Missing, ineligible or ambiguous evidence returns the versioned `NOT_CONFIRMED` result.

Order compares the returned committed event to the complete received JSON payload. Changed status, URLs, timestamps or provenance cannot authorize a switch. Proof is available once the transaction commits; outbox `PUBLISHED` is deliberately not required because consumption can occur before the publisher records its acknowledgement. There is no cross-service database read or new grant. After the exact Pidge job/provider-delivery binding is established, continuation events use the unchanged same-provider guards without another proof lookup. Their optional provenance remains structurally validated; it grants no additional authority.

A verified switch with unchanged status and URL still updates the pinned provider. Existing stale timestamp, terminal delivery state, cancellation/refund, replay and customer-notification guards remain in effect. Continuation events can perform the same verified switch when delivered before the initial handoff event. If the original Order binding has not arrived, the handoff is retryable without projection writes. A late Borzo event cannot restore the superseded binding.

## Additional nullable-fee SQL defect

The fail-first PostgreSQL fixture also exposed an existing producer failure when a confirmed Pidge response has no delivery fee: PostgreSQL cannot infer the type of an untyped null parameter inside `jsonb_build_object`. The only producer change is `CAST(? AS numeric)` for that snapshot field in `DeliveryJobRepository.switchToPidge`. This preserves JSON null, zero and exact non-null numeric values; it does not substitute a fee, add validation, or change quote selection, prices, booking/cancellation, correlation or routing. Transactional rollback remains required if any subsequent step fails.

## Required deployment checks

Before a deployment is approved, configure and verify `CRAVES_DELIVERY_HANDOFF_INTEGRATION_ORIGIN` on Order as the explicitly approved Integration HTTPS service origin, with no path, query, fragment or user information. There is no default origin. The existing `CRAVES_INTERNAL_SERVICE_KEY` must already be available and match Integration's existing shared service authority. No new credential is introduced and no finance key is reused. This patch does not write environment values, change pipeline manifests, expose a public APIM operation, or enable a runtime flag. Hosted CI wiring only adds a dedicated disposable test database and enforces the new suite minima.

The outbox has no aggregate/event lookup index. Each binding transition therefore has a potentially volume-dependent scan, isolated in a read-only transaction with a PostgreSQL-local three-second statement timeout (and four-second transaction deadline). A query timeout is a retryable dependency failure, not negative evidence. This bounds work but does not establish scalability; large retained outboxes can prevent a transition until an independently reviewed index/retention plan is in place. Verify the query plan and backlog volume before deployment. No index or schema migration is included in this patch.

The endpoint/client must be deployed together under the normal separate approval process. A missing origin/key, route, authorization, malformed response or dependency outage fails closed and raises the existing retryable delivery exception. Existing consumer retry/dead-letter behavior remains unchanged, so exhausted messages remain in the durable dead-letter queue for operator review/replay; they are not acknowledged as success. Verify queue recovery before activation. A well-formed authenticated `NOT_CONFIRMED` response or a changed committed event is a non-retryable invalid event.

The client requires HTTPS, does not follow redirects, bounds connection/header/body waits, caps proof bodies at 64 KiB, and does not include credentials, service URLs or response bodies in failure messages. Runtime flags, deployed configuration and production backlog were not inspected by this offline change.

## Verification

Offline PostgreSQL tests exercise the real completion and continuation producers, serialized payloads, actual Order consumer and authenticated proof endpoint. Local HTTPS tests cover redirects and bounded response/header/body failures. No provider HTTP, real booking, cancellation, secret extraction, deployment or live data mutation is part of these checks.
