# P117 — Networking Performance and Cancellation Audit

**Status:** DONE at authorized code/CI audit scope  
**Starting branch HEAD:** `861babfc0368fe63f5d498c80970f96f66979d3c`  
**Implementation commit:** `6295d7b5697a0cfa2902750f9fcc52de00f68871`  
**Branch:** `mobile-ui-rebuild-from-scratch`

## Authorization and scope

This run is authorized for **P117 only**. P118 is not started or pre-implemented.

P117 scope from `phases.md`:

- request deduplication;
- cancellation;
- input debounce;
- cache stale times;
- retry/backoff;
- mutation replay rules.

P117 acceptance:

1. stale responses cannot overwrite newer query state;
2. non-idempotent mutations are not blindly retried.

## Sources reviewed

Before changing code, the phase re-read and reconciled:

- `plan.md`;
- `phases.md`;
- `agent.md`;
- `build.md`;
- the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`;
- P116 evidence and the current Customer/Chef query boundaries;
- shared Axios transport/error/retry/dedupe code;
- TanStack Query client/policy/key/cache ownership;
- discovery search debounce/cancellation orchestration;
- auth refresh/session deduplication and replay behavior.

The implementation stays inside the mobile networking/query layer and does not change backend, APIM, OpenAPI, infrastructure, route contracts, auth ownership, navigation, or product UI.

## Audit findings and implementation

### 1. Request deduplication

The existing architecture already has two valid dedupe layers and they are retained rather than replaced:

- TanStack Query coalesces observers for the same stable query key;
- `runDedupedRequest(...)` provides explicit in-flight promise coalescing for operations that intentionally opt into a stable dedupe key;
- auth refresh is separately coalesced through the existing single `refreshPromise`, preventing simultaneous 401s from starting parallel token rotations.

P117 does **not** add global mutation deduplication or silently collapse distinct writes.

### 2. Cancellation and stale-response protection

Existing server-backed query functions already consume TanStack Query's `AbortSignal`, and discovery exposes `cancelQueries(...)` for obsolete in-flight work. P117 hardens the remaining replay window:

- new shared `requestRetry.ts` provides abort-aware retry backoff;
- if the signal is aborted while waiting to retry, the timer is cleared and the request is **not replayed**;
- the authenticated 401 recovery path checks the original signal after refresh and refuses to replay an already-cancelled request;
- cancellation remains normalized as `REQUEST_CANCELLED` with `cancelled=true` and `retriable=false`.

Stable contextual query keys continue to isolate identity, role, location, filters, entity and paging state. Obsolete work cannot be committed into a newer key, and cancelled work is not resurrected by retry backoff.

### 3. Search debounce

The existing discovery search implementation is already compliant and is retained:

- `DISCOVERY_SEARCH_DEBOUNCE_MS = 250`;
- debounce state is scoped to the current discovery session/location identity;
- changing or clearing the search cancels an in-flight next-page request;
- next-page fetching is blocked while the search draft is still debouncing.

No second debounce layer was added.

### 4. Cache stale-time policy

The existing behavior is made explicit through shared tiers:

- default server query stale time: **30 seconds**;
- discovery/feed stale time: **5 minutes**;
- default garbage-collection time remains **10 minutes**;
- reconnect refetch remains enabled.

Home Feed and Nearby Chef Discovery now consume the shared discovery stale-time constant rather than owning duplicate literals.

### 5. Retry and backoff

The authenticated and public Axios clients now use the same shared bounded safe-read retry interceptor.

Transport policy remains conservative:

- generic transport retries are limited to `GET`, `HEAD`, and `OPTIONS`;
- `POST`, `PUT`, `PATCH`, and `DELETE` are never retried by the generic transient-failure interceptor;
- transport retry count remains bounded to one retry;
- transport backoff starts at 250 ms and is capped at 1,000 ms;
- retryable transient conditions continue to be the already-approved network codes and bounded 408/429/5xx status set;
- cancellation stops retry immediately.

TanStack Query is also hardened:

- the previous numeric `retry: 1` behavior is replaced with `shouldRetryQuery(...)`;
- only errors normalized as `retriable=true` and `cancelled=false` are retried;
- terminal validation/auth/not-found/permission/cancellation failures are not replayed;
- query retry remains bounded to one retry;
- query retry backoff starts at 500 ms and is capped at 2,000 ms.

The transport and query retry layers remain bounded. P117 does not introduce infinite retry loops.

### 6. Mutation replay rules

Non-idempotent writes remain fail-safe:

- TanStack mutation default remains `retry: 0`;
- the generic Axios retry policy is safe-read-only, so transient POST/PUT/PATCH/DELETE failures are not blindly replayed;
- the existing one-time 401 auth recovery is an explicit guarded authentication recovery path, not a generic transient mutation retry;
- `_cravesAuthRetried` prevents repeated 401 replay loops;
- a request cancelled while auth refresh is occurring is not replayed after refresh.

This preserves mutation correctness without fabricating idempotency contracts that the backend does not expose.

## Acceptance result

### Stale response cannot overwrite new query state — PASS

- stable contextual query keys isolate new state from old state;
- query functions consume cancellation signals;
- obsolete discovery paging is explicitly cancelled;
- retry backoff is abort-aware and cannot resurrect cancelled work;
- auth recovery refuses to replay an aborted request.

### Non-idempotent mutations are not blindly retried — PASS

- generic HTTP retries remain restricted to safe read methods;
- TanStack mutations retain zero automatic retries;
- one-time 401 replay remains explicitly guarded and cancellation-aware.

## Changed files

Production/runtime:

- `apps/mobile/src/core/http/requestRetry.ts` — new shared abort-aware safe-read retry interceptor.
- `apps/mobile/src/core/http/apiClient.ts` — shared retry use plus cancellation-safe post-refresh replay.
- `apps/mobile/src/core/http/transport.ts` — public client now receives the same bounded safe-read retry behavior.
- `apps/mobile/src/app/query/queryPolicy.ts` — explicit stale tiers, retriable-only query retry predicate, bounded query backoff.
- `apps/mobile/src/app/query/queryClient.ts` — uses the retriable-only query retry policy and delay.
- `apps/mobile/src/features/home/query/homeFeedQueries.ts` — shared discovery stale-time tier.
- `apps/mobile/src/features/chefDiscovery/query/nearbyChefDiscoveryQueries.ts` — shared discovery stale-time tier.

Focused tests:

- `apps/mobile/src/core/http/httpFoundation.test.ts` — safe-read retry, mutation no-replay, and abort-during-backoff coverage.
- `apps/mobile/src/app/query/queryFoundation.test.ts` — retriable-only query retry, cancellation/terminal no-retry, mutation retry zero, stale tiers.

Evidence/ledger:

- `docs/mobile-ui-rebuild/P117_NETWORKING_PERFORMANCE_CANCELLATION_AUDIT.md`
- `build.md`

## Validation

Implementation commit `6295d7b5697a0cfa2902750f9fcc52de00f68871` automatically triggered **CRAVES Mobile Implementation CI**, run **#446** / run ID **31365988783**. The run completed successfully.

Successful CI steps:

- dependency installation with `npm ci`;
- TypeScript strict compilation with `npx tsc --noEmit`;
- ESLint with zero warnings allowed by the workflow command;
- Jest completed successfully, including the P117 networking/query foundation coverage;
- Android production JavaScript bundle generation completed successfully;
- backend/APIM/infrastructure source guard passed.

The implementation commit was also compared directly with the P117 starting HEAD and changes only the nine intended `apps/mobile/**` source/test files. No backend/APIM/OpenAPI/infrastructure file changed.

No real-device packet-loss simulation, radio/network throttling profile, proxy trace, or production latency benchmark is claimed by this code-level audit. Those are runtime performance measurements rather than prerequisites for the two P117 correctness acceptance statements.

## Preserved boundaries

- P116 remains **PARTIAL** because Chef-owned Menu and Customer/Public Kitchen Menu remain authoritative unpaged arrays under current backend contracts. P117 does not reclassify or hide that blocker.
- Existing contract-blocked product capabilities remain blocked.
- No new API, idempotency key contract, queueing protocol, offline mutation replay system, or backend retry semantics were invented.

## Stop boundary

**Next phase in sequence:** **P118 — Security/Privacy/Logging Audit — NOT STARTED**.  
**Next phase authorization:** **NONE AUTHORIZED in this run**.  

Stop here. Do not pre-implement P118.
