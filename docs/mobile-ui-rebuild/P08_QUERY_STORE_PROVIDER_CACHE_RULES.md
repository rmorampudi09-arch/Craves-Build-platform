# P08 — Query/Store Provider and Cache Rules

**Status:** DONE

**Repository:** `rmorampudi09-arch/Craves-Build-platform`

**Branch:** `mobile-ui-rebuild-from-scratch`

**Phase start HEAD:** `6b41ad1f72b1d9723e7abe0f140ddf959cdc680c`

**Validated implementation HEAD:** `c87828bf0d8378cd6dcd5738a36a4db2850d5d0c`

**CI run:** `31205887901` — **SUCCESS**

---

## 1. Phase Boundary

P08 confirms and hardens the existing server-state/global-state architecture. It does not implement P09 HTTP-client behavior, new feature APIs, Customer/Chef marketplace screens, logout orchestration, or backend/APIM changes.

Authoritative P08 requirements:

- TanStack Query remains the single server/query-state layer.
- Redux Toolkit remains the single global application-state layer.
- Server collections are not copied into arbitrary Redux arrays.
- Query keys carry the context that can change the authoritative result.
- Private query data has an explicit cancellation/removal mechanism.
- Query and paging retention are bounded by shared policy.

The full 183-page master guide additionally requires stable query identity, relevant user/location/filter/entity/pagination context, private-cache clearing, and bounded client memory. P08 establishes those reusable rules without inventing feature-specific backend pagination semantics.

---

## 2. Existing Architecture Confirmed

### 2.1 Server state

`@tanstack/react-query` remains the only server-state cache. No second query client, cache library, or feature-local server collection store was introduced.

`apps/mobile/src/app/providers/AppProviders.tsx` still owns the single `QueryClientProvider`, but the client construction/default policy now lives in the dedicated application query boundary rather than inline in provider composition.

### 2.2 Global application state

`apps/mobile/src/app/store/store.ts` remains the only Redux Toolkit store. The current store still contains only the existing `auth` slice because Customer/Chef marketplace global domains have not reached their implementation phases.

No catalog, chef, dish, order, notification, review, offer, address, payout, subscription, analytics, or other server collection was added to Redux in P08.

---

## 3. Query Client Policy

New owner: `apps/mobile/src/app/query/queryClient.ts`.

The application has one shared `appQueryClient`, created through `createAppQueryClient()` for production use and isolated tests.

Shared defaults are defined in `queryPolicy.ts`:

- read query retry count: `1`,
- mutation retry count: `0`,
- default stale time: `30,000 ms`,
- default garbage-collection time: `600,000 ms` (10 minutes),
- refetch on reconnect: enabled.

This preserves the previously accepted provider defaults while making cache lifetime explicit and bounded. Feature phases may define safer/more appropriate stale times where the product/contract requires them, but they must extend this single query architecture rather than create another client.

P09 remains responsible for HTTP transport retry/cancellation/error rules. P08 does not alter Axios, bearer injection, correlation IDs, HTTP timeouts, or auth refresh behavior.

---

## 4. Stable Cache-Key Strategy

New owner: `apps/mobile/src/app/query/queryKeys.ts`.

Two shared key families are provided:

- `createPublicQueryKey(...)`
- `createPrivateQueryKey(...)`

All generated keys are namespaced/versioned under `craves / v1` and distinguish `public` from `private` cache ownership.

Supported result-defining context includes:

- authenticated `userId` for private data,
- authenticated role (`CUSTOMER` / `CHEF`) for private data,
- `locationKey`,
- filter records,
- `entityId`,
- paging/cursor/page context.

Filter/paging object keys are canonicalized recursively so equivalent context objects produce stable equivalent query keys regardless of object property insertion order.

Blank domain/user/location/entity identifiers are rejected instead of silently creating ambiguous cache identity.

Feature-specific keys must include every context dimension that changes the authoritative server result. A field should not be added merely because it exists; it belongs in the key only when it partitions query ownership or response identity.

---

## 5. Private-Cache Clearing

New owner: `apps/mobile/src/app/query/queryCache.ts`.

`clearPrivateQueryCache(queryClient, scope?)`:

1. identifies only keys in the versioned private-query namespace,
2. optionally scopes by `userId`, `role`, or both,
3. cancels matching in-flight queries first,
4. removes matching private cache entries,
5. leaves public cache entries untouched.

Focused tests verify scoped user/role clearing and full private clearing while public data remains available.

P08 establishes the cache-clearing mechanism. The actual logout/revoke/role-transition orchestration is intentionally not pre-implemented here because `phases.md` assigns that product flow to **P24 — Logout, Revoke, and Role-State Cleanup**. P24 must call this accepted mechanism as part of its authenticated-data cleanup.

---

## 6. Bounded Paging Convention

Shared paging policy in `queryPolicy.ts`:

- default requested page size: `20`,
- maximum requested page size: `50`,
- maximum retained pages for future paginated/infinite-query implementations: `8`.

`clampPageSize(...)` provides the shared request-size bound.

Exact cursor/page-number/request fields remain contract-specific. P08 does not invent those fields. When a later exact feature contract uses TanStack infinite queries, that feature must apply the shared retained-page ceiling (for example through the library's bounded-page option) unless an explicitly approved feature requirement records a different bounded value.

This is a memory-safety convention, not an invented backend pagination contract.

---

## 7. Files Changed

- `apps/mobile/src/app/providers/AppProviders.tsx`
- `apps/mobile/src/app/query/index.ts`
- `apps/mobile/src/app/query/queryClient.ts`
- `apps/mobile/src/app/query/queryPolicy.ts`
- `apps/mobile/src/app/query/queryKeys.ts`
- `apps/mobile/src/app/query/queryCache.ts`
- `apps/mobile/src/app/query/queryFoundation.test.ts`
- `docs/mobile-ui-rebuild/P08_QUERY_STORE_PROVIDER_CACHE_RULES.md`
- `build.md` (phase ledger record, committed separately after this evidence artifact)

No backend, APIM, infrastructure, database, HTTP-client, auth transport, or product-screen source is part of P08.

---

## 8. Validation Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Accepted run: `31205887901`

Validated implementation HEAD: `c87828bf0d8378cd6dcd5738a36a4db2850d5d0c`

Successful steps:

1. dependency install from lockfile,
2. strict TypeScript check (`tsc --noEmit`),
3. ESLint with zero warnings allowed,
4. Jest including P08 query/cache regression tests,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

An earlier P08 candidate was rejected by CI for a TypeScript recursive-type definition and corrected before acceptance. A subsequent test-lifecycle issue was also corrected by clearing test-only QueryClient instances so TanStack Query GC timers do not keep Jest alive. Neither correction changes production cache semantics.

No APK/Gradle packaging was run because the project policy intentionally reserves final Android artifacts for the final release phase.

---

## 9. Acceptance Result

### Server collections are not duplicated as arbitrary global arrays — PASS

Redux remains the established global-state owner and still contains only current cross-screen auth state. Server collections remain assigned to TanStack Query.

### Cache keys include relevant user/location/filter/entity context — PASS

The shared public/private key builders explicitly model user/role, location, filters, entity identity, and paging context with deterministic canonicalization.

### Private-cache clearing — PASS

The application now has a tested private-query cancellation/removal boundary with optional user/role scoping and public-cache preservation.

### Bounded paging/cache conventions — PASS

Default query garbage collection is finite, request page size is bounded, and future paginated query retention has an explicit finite shared ceiling.

---

## 10. Next Phase Boundary

P08 is complete.

The next phase in sequence is **P09 — Typed HTTP Client Foundation**.

P09 is **not authorized or started by this phase**. Stop after recording P08 and wait for explicit user authorization before changing P09 HTTP-client behavior.
