# P116 — List/Image/Memory Performance Audit

**Status:** PARTIAL at full acceptance/product-contract scope; authorized mobile hardening implemented  
**Starting branch HEAD:** `5c923d7b3a568bdc7f9d1ec57cbb98a38b8f1507`  
**Branch:** `mobile-ui-rebuild-from-scratch`

## Authorized boundary

P116 is limited to list virtualization, image sizing/cache behavior, paging retention, and memory-retention patterns. It does not redesign screens, change backend/APIM contracts, alter auth/session/navigation ownership, or begin P117 networking-performance work.

The master guide requires long collections to be virtualized/paged, server collections to remain in the query/cache layer, images to be cached/lazy-loaded and decoded at appropriate display sizes, and production histories/media pages to remain bounded in memory.

## Audit findings and remediation

### Customer Home nearby dishes

- The production screen already uses `FlatList`, stable dish IDs, incremental `fetchNextPage`, and abortable query requests.
- The TanStack infinite-query cache had no page-retention ceiling, so a sufficiently long browsing session could retain every fetched page.
- P116 adds `HOME_FEED_MAX_RETAINED_PAGES = 10` and wires it through `useInfiniteQuery.maxPages`.
- The current screen requests 20 rows per page, so the current normal configuration retains at most 200 loaded dish rows for that query key. The bound is page-based, so it remains explicit if the page size later changes.

### Discover Home Chefs

- The production screen already uses `FlatList`, stable kitchen IDs, incremental paging, search cancellation, and scroll restoration.
- Its infinite-query cache likewise had no retention ceiling.
- P116 adds `NEARBY_CHEF_DISCOVERY_MAX_RETAINED_PAGES = 10` through `useInfiniteQuery.maxPages`.
- The current screen requests 20 kitchens per page, giving the current normal configuration a maximum of 200 loaded rows for that query key.

### Customer Notifications

- The authoritative notification query was already explicitly bounded to the newest 100 notifications.
- The screen nevertheless rendered the entire bounded collection through a vertical `ScrollView` plus nested `.map()` calls, mounting every row at once.
- P116 keeps the same 100-notification data boundary and replaces only the vertical production list with `SectionList` virtualization. Today/Earlier grouping, category filtering, unread/read behavior, pull-to-refresh, routing validation, loading/error/empty states, and the visible composition remain intact.
- The horizontal category-chip strip remains a bounded horizontal `ScrollView` because it contains only the fixed category set.

### Dish Details media gallery

- The catalog response can contain multiple menu-item images and the inspected backend does not expose an approved numeric per-item image-count limit. P116 therefore does not invent one.
- The previous hero gallery and thumbnail strip each mapped the full image array, potentially mounting/decoding every remote image twice.
- P116 changes both horizontal media strips to virtualized `FlatList` windows. The hero mounts a small window around the active image; thumbnails are likewise windowed.
- Android image rendering now requests resize-before-decode for these gallery images, and the next hero image is prefetched through the native image cache to keep paging responsive without eagerly mounting the entire gallery.
- No URL rewriting, CDN resize parameter, or new media dependency was invented because no such exact mobile/backend contract was established in this phase.

## Exact-contract blocker found during final acceptance review

The final P116 acceptance check found two authoritative production menu collections whose current backend contract is still unpaged:

1. **Chef-owned Menu:** `GET /api/v1/kitchens/me/menu-items` returns a complete `ChefMenuItem[]`. The established P92 contract explicitly records that this route exposes no page, limit, cursor, search, filter, or category query parameters.
2. **Customer/Public Kitchen Menu:** `GET /api/v1/catalog/kitchens/{kitchenId}/menu-items` is parsed as one complete array and likewise has no page/limit/cursor argument in the current mobile transport contract.

Virtualizing the corresponding screen rows reduces mounted-view cost, but it cannot bound the authoritative array already returned by the server and retained in the query/cache layer. Arbitrarily slicing those arrays in the client would hide real menu items and change product behavior; adding server pagination would require backend/APIM/contract work outside the authorized P116 boundary.

Therefore P116 cannot truthfully satisfy the acceptance statement **“No unbounded production list/history retained in memory”** across all current production collections. The phase is recorded as **PARTIAL**, with all safe mobile-side hardening completed and the remaining blocker kept explicit rather than masked with a client-side truncation.

## Reviewed paths that required no production change

- Customer Orders already uses a virtualized list and an explicit newest-order server window.
- Chef Completed Orders already uses `FlatList` with explicit bounded server-page navigation; P116 preserves that implementation.
- Discover Home Chefs and Customer Home already had stable keys and virtualized rows; only their retained query pages were unbounded.
- Contract-blocked/static Favorites and Chef payout/subscription surfaces do not currently hold unbounded production histories.
- Server-owned collections remain in the TanStack query/cache layer; P116 does not duplicate them into Redux/global app state or persistence.

## Bounded-history behavior

The Home and Discover Chef infinite-query caches now retain at most 10 pages per active query key. When forward paging exceeds that ceiling, TanStack Query evicts the oldest retained page rather than allowing memory growth without a limit. This is an intentional P116 memory-retention boundary, not a backend data deletion or product-history truncation. A later query/refetch can still retrieve authoritative server data according to the existing paging contract.

Notifications remain capped at the existing newest-100 query boundary; P116 changes rendering strategy, not the server-visible history contract.

The Chef-owned Menu and Customer/Public Kitchen Menu remain contract-unbounded until an authoritative paged server contract exists; P116 intentionally does not truncate those arrays locally.

## Changed files

Production/runtime:

- `apps/mobile/src/features/home/query/homeFeedQueries.ts`
- `apps/mobile/src/features/chefDiscovery/query/nearbyChefDiscoveryQueries.ts`
- `apps/mobile/src/features/notifications/screens/CustomerNotificationsScreen.tsx`
- `apps/mobile/src/features/dishDetail/screens/CustomerDishDetailScreen.tsx`

Focused test source:

- `apps/mobile/src/core/performanceBoundaries.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P116_LIST_IMAGE_MEMORY_PERFORMANCE_AUDIT.md`
- `build.md`

## Validation and guard state

- The authoritative branch HEAD was rechecked before the phase write.
- Source ownership, existing paging limits, list primitives, media rendering, backend catalog media behavior, and the exact Chef/Public Kitchen menu list contracts were inspected before final classification.
- Focused source coverage asserts the explicit Home/Discover page-retention ceilings and the existing notification-history cap.
- GitHub Actions are not invoked because the account Actions capacity is exhausted.
- No local Jest/typecheck/ESLint/Metro/bundle pass is claimed from this connector-only run.
- No device profiler, heap capture, image-decoder trace, or 60-FPS runtime result is claimed.

## Scope guard

No backend, APIM, OpenAPI, database, authentication, session, navigation hierarchy, route name, role isolation, visual redesign, payment/checkout behavior, or blocked product contract was changed. P117 — Networking Performance and Cancellation Audit — was not started.
