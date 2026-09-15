# Automatic delivery outcome feedback

Terminal delivery jobs now feed the existing provider metrics and Thompson-sampling state. The predictor remains HEURISTIC_V1; this does not introduce an offline trained model.

V120 captures terminal job inserts/updates in the same PostgreSQL transaction, including webhook, tracking and creation paths and mixed application revisions. A dedicated scheduler claims bounded work with SKIP LOCKED and a fencing token. Each outcome receipt, hot score, bandit increment and queue completion commits together. Duplicate delivery IDs cannot add another sample. Crashes recover after 120 seconds; eight failed attempts become visible dead letters. Errors log only job UUID, attempt and exception class.

Automatic OBSERVED_TERMINAL_V1 scoring includes actual completion and, when available, a real applied PICKED_UP event compared with the selected candidate pickup promise. The job pickup timestamp is not used because older status code can infer it from a later event. Missing timing, price, customer rating and complaint facts remain absent. Available component weights are normalized; completion-only 100 means completion was successful, not that unmeasured service quality was perfect. Unknown-cause cancellations are SKIPPED; FAILED and RETURNED count as noncompletion. Invalid assignment identity/context cannot train and is retried/dead-lettered.

This release captures terminal transitions after migration. It does not fabricate or backfill historical outcomes. Receipts are immutable; later ratings or corrected terminal outcomes require a separately designed correction path, not a second sample.

Controls: CRAVES_DELIVERY_FEEDBACK_ENABLED (default true, also requires existing CRAVES_DELIVERY_INTELLIGENCE_ENABLED), CRAVES_DELIVERY_FEEDBACK_BATCH_SIZE (default 50, max 200), CRAVES_DELIVERY_FEEDBACK_MAX_ATTEMPTS (default 8, max 20). One item is leased at a time in production; work per poll is bounded. The existing default scheduler remains separate and retains Spring scheduling configuration.

GET /internal/v1/delivery-intelligence/feedback/readiness uses the existing internal service key and returns worker heartbeat, trigger state and capped outstanding/dead-letter counts. Investigate stale heartbeat, overdue backlog and any dead letter; do not blindly requeue bad evidence.

The Pidge CI workflow requires a disposable PostgreSQL 16 database, exercises the actual V2/V102/V120 migrations, transaction rollback, crash recovery, fencing, cancellation exclusion, duplicate capture, and 10,000 outcomes / 40,000 duplicate updates / eight consumers. Test fixtures are guarded to localhost and a dedicated test database. No provider or production order is called by tests. This establishes the tested feedback workload, not unlimited order throughput or a production SLA.

Release through existing Integration pipeline with verifyDeliveryFeedback=true. The preflight checks the existing intelligence flag; postflight checks authentication, capture trigger, an advancing worker heartbeat, no dead letters and preserved Pidge activation. No new Azure resource, provider credential, payment or rider dispatch is needed.

Rollback: disable CRAVES_DELIVERY_FEEDBACK_ENABLED or restore the previous application image. Keep the additive migration and durable queue so outcomes remain recoverable. Do not delete production receipts, rewrite provider scores, or drop the capture trigger during an incident without evidence review.

Production remains at exactly one replica at the owner’s request. No scale rule or replica limit is changed. The multiworker test proves duplicate/concurrency behavior in the disposable database; it does not claim production has eight workers or equivalent throughput.

Routing regression fixes: honor the intelligence-selected candidate before ranked fallbacks (including stochastic exploration) and exclude SKIPPED/FAILED candidates from fallback. The original router sorted all candidates only by rank, which could ignore exploration and reintroduce ineligible providers.
