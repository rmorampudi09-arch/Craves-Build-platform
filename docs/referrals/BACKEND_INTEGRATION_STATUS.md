# Backend integration status and release contract

## Acceptance status

NOT COMPLETE / NOT DEPLOYED. This is a concrete backend integration candidate, not production acceptance. No frontend was implemented. Exact CI results belong to the tested commit, not to the original uploaded archive or an older green build.

## What is implemented

| Owner | Implemented connection | Execution boundary |
| --- | --- | --- |
| Auth | Optional explicit referral terms consent on new Firebase identity creation; original registration timestamp; verified signed first-touch token; contact HMAC; immutable local enrollment and same-transaction source outbox | `CRAVES_REFERRAL_SOURCE_ENABLED=false` by default; no existing user automatically enrolled |
| Auth | Authenticated root enrollment for an existing active account with current token version and explicit terms consent | Existing users cannot choose or change a parent |
| Auth | Enrolled account active/status changes write monotonic source events in the original database transaction | Publishers can stop while durable source history continues |
| Order | Existing financial checkout transaction is wrapped by a referral binding aspect; private lookup checks enrolled participants and policy; original snapshots and amounts are retained | Requires existing `CRAVES_FINANCE_SOURCE_ENABLED=true`; absent in inspected runtime |
| Order | Bound delivery and full-refund events; source-history first qualifying checkout check across all buyer orders; replay-safe source keys | Partial or unsupported refunds create a source exception and are not assigned invented food amounts |
| Finance | Takes durable ownership of referral outbox events before ACK, then separately retries application by original event ID | A receipt means durable handling, not payout or reward completion |
| Finance | Matches bound orders to immutable issued financial snapshots; reads verified capture, delivery earning and refund records; publishes fresh finance evidence | Unknown/partial refund allocation fails referral finance eligibility; it does not rewrite an existing refund |
| Finance | Every referral economic journal entry is mirrored once into balanced Finance accounts | Selling-chef payable lines are not used to fund referral rewards |
| Finance | Stores original payout instructions in `AWAITING_PROVIDER_REVIEW` | No provider execution is implemented or represented as paid |
| Referral engine | New private readiness lookup; exact transaction journal/binding events | Original ledger, attribution, settlement, cashout and spending state-machine protections remain |

## Changes to existing source

Only two existing production Java files change: Auth's exchange request DTO gains an optional `referral` JSON field and AuthService invokes enrollment inside new-identity creation. The two-argument request constructor remains. Order and Finance integrations are new conditional components. Existing owner schemas receive new migration files; historical migration files are not edited.

Existing test changes update explicit expected migration inventories and add one checkout fixture hook. Those inventory assertions are increased to account for the new migrations; historical identity, refund, cart, tax and payable assertions remain. No existing CI workflow, service configuration, frontend, dependency manifest or provider client is edited. The dedicated scope gate enumerates allowed existing-file edits and additive paths.

## Source durability and recovery

Each owner persists the event UUID, business key, original serialized envelope and content hash in the originating transaction. Duplicate keys with different content fail. Updates/deletes/truncates cannot rewrite source identity or payload. Workers claim with PostgreSQL SKIP LOCKED, use bounded requests and response bodies, and fence receipts by a still-valid lease. Timeouts replay the original ID/body. Bounded retries eventually become DEAD, which is an operational incident, never an instruction to generate a replacement economic event.

The engine similarly leases Finance outbox events. Finance stores their immutable type and payload before ACK. Its application transaction posts the journal/projection together. A failed application rolls back money and retains retryable source evidence. Capture/refund/earning changes wake only explicitly bound referral observations.

Before activation, configure owner outbox and consumer DEAD-count, oldest-unreceived-age, stale-evidence and wallet/Finance-journal drift alerts. Validate replay procedures and alert delivery against the deployed restricted role. These operational integrations are pending; table durability alone is not an alerting system.

## Configuration

All three owners use `CRAVES_REFERRAL_SOURCE_ENABLED` (default false), `CRAVES_REFERRAL_SERVICE_ORIGIN` (explicit private HTTPS origin), and `CRAVES_REFERRAL_SOURCE_HMAC_BASE64` (different source secret per owner). Auth additionally requires current `CRAVES_REFERRAL_TERMS_VERSION`, distinct contact and attribution HMAC keys, and an approved retention decision before accepting first-touch tokens. Never put these secrets into frontend code, source control, command logs, reports or PR descriptions.

The standalone engine has separate ENABLED, PUBLIC_ACCESS, WORKERS, AWARDS, SETTLEMENT, WITHDRAWALS and SPENDING switches, all default false. Runtime has no automatic Flyway DDL; its migration entry point uses separate credentials and requires verified PostgreSQL TLS remotely. Its cashout minimum, annual KYC threshold and lifetime review threshold default to zero and deliberately block eligibility until actual reviewed positive values are configured.

## Bash verification

The dedicated workflow provisions disposable PostgreSQL and named `referral_test`, `referral_owner_test`, `chef_ledger_test`, and `craves_email_test` databases. It runs Maven verify for the four affected services, checks the actual executable referral jar/SBOM/migration resources, and rejects absent, failed or skipped required suites.

Required tests cover the original referral engine, signed HTTP boundaries, private lookup, same-transaction economic outbox, Auth consent and status rollback, owner duplicate/conflict and concurrent lease fencing, original checkout totals/cart rollback with the new aspect, Finance journal balancing/deduplication and invalid source retries, full owner migration chains, existing finance settlement, and email/rate-limit persistence.

Local Bash tests compile and execute unit/regression suites with an explicit JVM test agent. Local database suites are intentionally skipped without disposable fixture variables; their local result is not sufficient evidence. In CI, the required database suites must execute. HTTP tests use mocked Redis and source checkout tests use a mocked private HTTPS client; live private DNS/TLS, Redis revocation projection and the full multi-service transport still need staging acceptance. No real customer/provider transaction is used as a test fixture.

## Observed Azure baseline

Subscription: Craves-Dev (`4f897b61-9b52-44b4-8cf1-bdac281cc1aa`). Resource group: `rg-craves-prodlow-centralindia`.

Azure Portal and DevOps project `Craves` were accessed through the signed-in cloud browser. Bash observations showed all 11 existing applications Succeeded / Running at the same ready revision as the initial read. Auth revision `0000041`, Order `0000088`, and Integration `0000156` also reported Healthy / Provisioned / RunningAtMaxScale. These are Azure platform observations, not a synthetic purchase or payout test.

Auth and Order production pipelines use `release/admin-explorer-consumption-v1`; Integration uses main-based commit `cc39599908bc0dd213270d8863b6c6fae436184d`. The current main branch contains additional Auth/Order changes absent from that release. Do not replace those service images with an arbitrary current-main build: first reconcile the actual deployed source and preserve unrelated service behavior.

There is no referral Container App. No resource, secret, role, migration, scaling setting, production flag, payment or deployment was changed in this session. No live enrollment or reward was created.

## Work still required before completion

1. Finish Order wallet reserve/consume/release/refund and invitee-discount application against authoritative payment amounts, including mixed-chef allocation and uncertain payment recovery. The engine's operation API is implemented; the existing checkout/payment owner integration is not.
2. Implement Finance recipient/funding approval sources and original-attempt provider execution/reconciliation. Stored instructions are not transfers. Unknown outcomes must remain reserved. Provider, bank ownership, KYC and tax evidence must be real.
3. Supply reviewed terms, retention policy, legal/tax/privacy/funding/mixed-chef/payout references, actual cashout/annual-KYC/lifetime thresholds, pilot cohort and budget. The supplied archive contains placeholders/test fixtures, which cannot become production approval evidence.
4. Reconcile each owner's deployed source baseline; review and test the combined financial-source enablement before changing Order pricing behavior.
5. Provision the isolated service with separate migration/runtime roles, private ingress and DNS/TLS, distinct versioned Key Vault source keys, existing verified JWT/revocation semantics, backups, restore rehearsal and load/alert acceptance.
6. Run staging end-to-end signup → immutable ancestry → actual checkout → delivery → captured Finance evidence → hold → settled journal → refund, followed by wallet, discount and payout recovery paths. Use deterministic provider sandboxes; do not shorten the production hold as proof.
7. Build/scan/pin exact images; validate migration what-if and rollback; deploy only the reviewed candidate; compare all existing applications against the frozen baseline and execute authenticated smoke checks. Leave public launch/cashout disabled until its gates pass.

The user has already authorized engineering work. The remaining programme evidence must be supplied as actual business data, and the remaining code/runtime gates must be implemented and verified; they are not an extra permission request or a claim that sign-in alone finishes the integration.
