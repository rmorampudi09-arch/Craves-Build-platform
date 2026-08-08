# P37 — Search Query Orchestration Evidence

## Status

**PARTIAL**

P37's supported client-side orchestration is implemented and CI-validated. Full phase acceptance cannot be claimed because the authoritative current branch does not expose a dish/chef server-search route or search query parameter/model, and the later detail routes required for a literal detail/back navigation proof are not registered yet.

## Authorization and phase boundary

- User authorized exactly the next single phase after P36.
- Started from branch head `06fb86bb6d6d1e3e85e709e2bccaaf35345225da`.
- P36 remains correctly recorded **PARTIAL**.
- P38 Filter and Sort was not started.
- No backend, OpenAPI, APIM, infrastructure, database, Android native build configuration, Cart, checkout/payment, public kitchen-profile, or later-phase feature was changed.

## Guide and governance used

P37 follows the global implementation-guide requirements that:

- back navigation should preserve prior search/list state where appropriate;
- user input should be debounced;
- obsolete searches should be cancellable;
- lists remain paginated and memory-bounded;
- stale responses must not overwrite the current request/query state;
- existing repository architecture and exact backend/APIM contracts remain authoritative;
- missing backend contracts must be recorded rather than invented.

`plan.md`, `phases.md`, and `agent.md` were also rechecked before implementation.

## Exact current contract boundary

The current branch exposes the following nearby discovery operations:

- `GET /api/v1/discovery/menu-items`
  - `latitude`
  - `longitude`
  - `radiusMeters`
  - `page`
  - `size`
- `GET /api/v1/discovery/kitchens`
  - `latitude`
  - `longitude`
  - `radiusMeters`
  - `page`
  - `size`

The corresponding Catalog controller and current mobile API adapters do **not** define a free-text search parameter, a dedicated dish-search route, a dedicated chef/kitchen-search route, or server-search response models. P37 therefore does not fabricate a `query`, `q`, `search`, or similar parameter.

## Implemented behavior

### Shared search orchestration state

- Added one shared `discoverySearch` Redux slice instead of creating parallel per-screen search stores.
- Keeps independent `HOME` and `CHEFS` sessions.
- Stores controlled search draft and list scroll offset.
- Scopes restoration by authenticated identity + selected saved-address ID.
- Changing identity/location scope resets the prior query and scroll offset so one browsing context cannot leak into another.
- Changing the search draft resets the restored result position to the top.

### Debounce and query normalization

- Added a shared `250 ms` debounce boundary.
- Normalizes leading/trailing and repeated whitespace for matching without mutating the user's visible draft while typing.
- Both Home dish discovery and nearby-chef discovery now use the same orchestration path.

### Cancellation and stale-result protection

- Existing TanStack infinite-query functions already receive React Query's `AbortSignal` and pass it through the typed API/HTTP layer.
- P37 exposes exact-query cancellation from the Home and nearby-chef query hooks.
- A pending next-page request is cancelled when the user changes or clears the current search draft.
- The active search query lives independently from page-arrival state, so a late page cannot replace the user's newer query text or restore an obsolete query state.
- Query/session state is keyed to the current user/location scope rather than a mutable global result array.

### Pagination while searching

Because the server currently supports only location/radius pagination, search is truthfully applied to the live pages that have actually been retrieved; it is not described as a server-wide search.

- Search no longer disables pagination.
- The common pagination guard blocks duplicate next-page work while a page request or debounce transition is active.
- When no local match exists but the authoritative response says another page exists, the UI offers `Search next page` rather than falsely claiming that no matching item exists anywhere.
- Normal list `onEndReached` pagination remains available while the current search is active.
- Page data remains in the existing TanStack Query cache rather than being copied into Redux.

### Restoration

- Search draft and list scroll offset are retained outside transient screen-local state.
- Re-entering the same Home/Chefs browsing scope can restore the previous query and offset.
- The state boundary is ready for later Dish/Kitchen detail routes to preserve search/back context without placing mutable result objects in route params.

## Files changed

Implementation:

- `apps/mobile/src/features/discoverySearch/state/discoverySearchSlice.ts`
- `apps/mobile/src/features/discoverySearch/discoverySearchOrchestration.ts`
- `apps/mobile/src/features/discoverySearch/hooks/useDiscoverySearchSession.ts`
- `apps/mobile/src/features/discoverySearch/components/DiscoverySearchInput.tsx`
- `apps/mobile/src/app/store/store.ts`
- `apps/mobile/src/features/home/query/homeFeedQueries.ts`
- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`
- `apps/mobile/src/features/chefDiscovery/query/nearbyChefDiscoveryQueries.ts`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx`

Tests:

- `apps/mobile/src/features/discoverySearch/discoverySearchOrchestration.test.ts`

## Validation

Initial implementation commit:

- `764636d530952f06d9b252200731d225033f02a1`

The first CI run exposed only lint-gate issues in the new screen callbacks/effect dependency list; those were corrected without changing the P37 scope.

Validated implementation commit:

- `1d9e084c8825faab7d2578e481c9fdd4cc6ae865`

Final GitHub Actions validation:

- Workflow: `CRAVES Mobile Implementation CI`
- Run ID: `31250802472`
- Job ID: `93086759138`
- Conclusion: **SUCCESS**

Passed gates:

1. dependency install from lockfile;
2. strict TypeScript (`tsc --noEmit`);
3. ESLint with zero-warning gate;
4. Jest;
5. production Android JavaScript bundle generation;
6. backend/APIM/infrastructure source-change guard.

No per-phase APK/Gradle packaging was performed, consistent with the rebuild policy.

## Acceptance assessment

### Completed supported subset

- Search input state: implemented.
- Debounce: implemented.
- Cancellation of obsolete in-flight page work: implemented using the existing TanStack/AbortSignal transport path.
- Query restoration: implemented as scoped shared state.
- Scroll restoration state: implemented as scoped shared state.
- Pagination during active search: implemented without duplicate requests.
- Stale-result protection for current client query/session state: implemented.
- No fabricated server-search endpoint/parameter: verified.

### Remaining blockers

1. **Exact server dish/chef search contract is missing.** P37's API requirement calls for exact dish/chef search routes and models, but the current branch only defines radius/location pagination for `/discovery/menu-items` and `/discovery/kitchens`.
2. **Literal detail/back acceptance cannot yet be exercised end-to-end.** Dish detail and public kitchen-profile destinations are owned by later phases and are not registered in the current Customer product navigation. The P37 search/restoration state is prepared for those routes without pre-implementing them.

Because those dependencies are outside the authorized P37 mobile boundary, P37 is recorded **PARTIAL**, not DONE.

## Next phase

**P38 — Filter and Sort: NOT STARTED.**

No next phase is authorized by this evidence record.