# Referral operations, scaling and recovery

## Execution model

The scheduled worker is bounded and restart-safe because progress is in PostgreSQL, not an in-memory queue. When explicitly enabled, a cycle processes bounded inbound facts, eligible seller/customer awards, post-hold credits and weekly payout plans. Source inbox and Finance outbox preserve original IDs and body fingerprints; locks, uniqueness and lease fencing protect duplicate/concurrent execution.

The post-hold enrolment cutoff advances hourly, but pages drain throughout the hour: each tick can enrol up to 1,000 previously unscheduled eligible rewards and attempt a bounded credit page. This avoids stranding all rewards after the first thousand. Stale Finance evidence continues to block credit even under backlog pressure. Default worker delay is 15 seconds; this is configuration, **not a promised completion time or measured throughput**.

Cashout planning uses the weekly UTC cutoff in `PayoutBatchPlanner`. Member displays use IST. Review the weekly cutoff with Finance; do not promise an exact bank-credit date. Retries depend on source completeness, funding, freshness, review and provider reconciliation.

## Capacity and availability

Start only at the approved deployment profile. The provided isolated template keeps min/max replicas at one per active revision, database pool at eight and ingress private. One replica is not high availability and a rollout may transiently have old/new revisions. No current application is scaled or reconfigured by this delivery.

Before expansion, measure actual incoming events, worker backlog age, transaction duration, lock waits, pool utilisation, query plans, storage/index growth and downstream Finance capacity. For N replicas, budget at least N × configured pool connections plus migration/operations/source-owner headroom. Increase replica count, CPU/memory or DB allocation only through an approved capacity change; protect the existing Craves workload. Retest worker races and queue fairness under the chosen profile. Neither the CI backlog case nor bounded batch sizes establish a production throughput ceiling or service-level guarantee.

## Monitoring to configure manually

Run the added `observability.sql` with a read-only, referral-schema-scoped operator role or consume the authenticated administrator overview. These diagnostics are not an installed alerting system.

| Signal | Proposed action; thresholds require operator approval |
| --- | --- |
| Wallet projection differs from immutable journal | Critical: stop new awards/spending/cashout submissions, preserve records and investigate. No automatic balance rewrite. |
| Seller-chain cap breach or impossible money invariant | Critical: isolate offending source/policy path; no recalculation of historic paid entries. |
| UNKNOWN payout or conflicting original attempt | Finance review of original provider reference. Never auto-create a replacement. |
| DEAD inbox/outbox record | Investigate safe reason code/source. Repair dependency or mapping; replay original record with evidence through admin controls. |
| Oldest pending/leased work grows | Check Finance freshness, missing parent/order bindings, budgets, review holds, worker heartbeat and DB contention before scaling. |
| Insufficient CUSTOMER/DISCOUNT budget | Notify Finance/product; stop promising unavailable benefits. Budget top-ups require real authorised funding IDs. |
| Rising open fraud cases / review age | Staff adjudication, not automatic deletion of history or public downline exposure. |
| Revocation verification outage / 401/403 spike | Restore trusted Auth/Redis path. Do not disable token-version checks to make the dashboard load. |
| Pool saturation, statement timeout or disk pressure | Bounded retries, query-plan review and approved scaling; never drop append-only history to free space. |

Log only safe codes and non-sensitive correlation identifiers. Do not log JWTs, HMACs, bank destination details, source body payloads, raw fingerprints or exported audit content. Review retention for pseudonymous identifiers as well as personal data. Private operational dashboards, alert destinations, owners and on-call escalation are manual configuration still required.

## Recovery playbooks

### Unknown payment

Keep the reservation locked in SUBMITTED/UNKNOWN. Finance looks up the original provider/idempotency reference, records authoritative outcome version/evidence and replays the same event. If the provider cannot determine the result, retain UNKNOWN and escalate. An elapsed timeout, user refresh or missing webhook is not proof that a payment failed. Do not issue a second transfer, manually mark paid from the web console, cancel submitted funds or generate a replacement request UUID.

### Event delivery or worker failure

A producer retries the exact persisted envelope with its original event ID and newly valid transport timestamp/signature. Never manufacture a new event ID to evade a duplicate/conflict. Receipt does not imply processing. Missing dependencies may arrive later; safe, bounded retry is expected. DEAD events require an evidence-backed repair/replay. A Finance consumer acknowledges only after its own durable handling and uses the original outbox event, lease token and payment-attempt identity.

### Fraud and manual reversal

A reviewer records the case outcome and evidence. Clearing one case does not authorise ignoring other holds. Manual reversal uses a unique persisted operation ID and exact paise, not an editable historic amount. Record a safe reason code without private documents in the code field. Reconcile any already reserved/spent/paid amount through existing clawback and Finance processes.

### Disable or roll back

First stop new public enrolment/benefit promotion and new awards/spend/cashout submissions through the reviewed flags/owner rollout. Keep controlled authoritative refund/outcome processing and read-only history available where safe so liabilities do not disappear. Do not indiscriminately stop a Finance reconciliation job mid-submission; fence/reconcile its outstanding attempts.

Roll back the new service image or unmount the new feature only after schema compatibility review. Keep `referral_schema`, journal, rewards, inbox/outbox, reservations and evidence intact. Do not use destructive down migrations or reset live history to the seeded draft. A database restore is disaster recovery to an isolated target followed by reconciliation of events/outstanding payments, not an ordinary way to undo a release.

### Separate legacy programmes

Repository branch/route names suggest other referral/loyalty work may exist. No such branch is merged or activated here. Inventory current production consumers and incentive ownership before enabling v2, and prove that one order cannot accidentally trigger a second legacy percentage chain. Existing `CustomerSettingsReferral` is the intended reviewed native insertion point, not proof of a live referral backend.

## Evidence ownership

Engineering owns source mapping and API contracts. Finance owns budgets, recipient assessments, tax/withholding and payment evidence. Security/privacy own identity, least privilege and fingerprint policy. Platform owns isolated deployment, backups, telemetry and capacity. A release approver reconciles these independent records before public activation; the document itself is not their approval.
