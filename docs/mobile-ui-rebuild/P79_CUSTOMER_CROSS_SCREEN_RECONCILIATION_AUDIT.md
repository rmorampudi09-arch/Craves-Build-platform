# P79 — Customer Cross-Screen Reconciliation Audit

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P79 only  
**Guide source:** Full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`  
**Phase acceptance:** A supported customer-domain mutation must update every required customer surface without a manual refresh.

## 1. Audit result

P79 audited the shared customer state named by `phases.md`: cart, browsing location, notification badge, favorites, order counts, rewards/profile summary, and tab/query/scroll restoration.

The existing implementation already uses the intended shared ownership for most supported domains:

- **Cart:** one Redux cart snapshot/selectors drive View Cart, item count, subtotal and cart-aware customer wrappers. Successful cart mutations accept the authoritative server snapshot into that one store, so mounted customer surfaces re-render from the same source.
- **Notification badge:** the customer header derives unread count from the same React Query notification list used by Notifications. Mark-read writes that shared query cache, so the header badge changes without a separate refresh.
- **Profile identity:** profile edit writes the authoritative update response into the canonical customer-profile query and invalidates it for server revalidation.
- **Orders:** order detail reconciliation writes an updated order back into the canonical recent-orders snapshot. The current profile contract deliberately does not expose aggregate order counters.
- **Search/query/scroll restoration:** discovery search query draft and scroll offset are Redux-owned per search surface/scope; tab stacks remain React Navigation-owned instead of being recreated by domain mutations.

One concrete stale-state defect was found in the saved-address/location path and is fixed by this phase.

## 2. P79 location reconciliation fix

Before P79, selecting a location invalidated only Home feed data, while editing the already-selected saved address invalidated address queries but left `customerShell.selectedLocation` holding the old display name/coordinates. Deleting the selected address was reconciled only by the Addresses screen caller rather than by the mutation boundary itself.

P79 adds one narrow reconciliation boundary:

- `customerLocationReconciliation.ts` owns invalidation of every currently contract-backed location-dependent customer discovery domain: Home nearby dishes and Nearby Chefs.
- Header/location selection now uses that shared invalidation boundary.
- Successful saved-address updates immediately write the updated address into the canonical address query cache.
- If the updated address is the active browsing location, the authoritative returned address is converted into the shared browsing-location model and dispatched into `customerShell` immediately.
- Successful address deletion immediately removes the address from the canonical address cache and clears the selected browsing location when that exact address was active.
- Address/saved-location queries are still invalidated after the immediate write so server truth remains authoritative.

This prevents the header, Home discovery and Chefs discovery from waiting for a manual refresh after supported address/location mutations.

## 3. Contract-blocked reconciliation surfaces

P79 does not fabricate missing domains merely to make the audit read as complete:

- **Favorites:** the approved mobile/backend contract still exposes no favorite list/search/count/remove/membership synchronization capability. P60/P61 blockers remain authoritative.
- **Rewards:** the current approved customer-profile contract explicitly reports rewards as unsupported; there is no rewards mutation/summary contract to reconcile.
- **Profile order counters:** aggregate order counters are explicitly unsupported by the current customer-profile contract. The real Orders list/detail cache remains synchronized, but P79 cannot invent a profile counter API or mutation.
- **Offers/coupons/reviews:** their earlier exact-contract blockers remain unchanged and are not converted into local account truth.
- **Address-aware delivery quote/reprice:** remains unavailable; P79 does not invent serviceability/fee/ETA repricing.

Because these required guide capabilities remain contract-blocked, P79 is **PARTIAL at the exact contract-backed scope**, not falsely marked fully DONE.

## 4. Files changed

- `apps/mobile/src/features/customerShell/query/customerLocationReconciliation.ts`
- `apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts`
- `apps/mobile/src/features/customerAddresses/query/customerAddressQueries.ts`
- `apps/mobile/src/features/customerShell/customerCrossScreenReconciliation.test.ts`
- `docs/mobile-ui-rebuild/P79_CUSTOMER_CROSS_SCREEN_RECONCILIATION_AUDIT.md`
- `build.md`

No backend, APIM, infrastructure, database, or Chef experience source is changed by P79.

## 5. Validation coverage

Focused P79 coverage verifies:

- an authoritative edit replaces the selected global browsing location only when the edited address is the selected address;
- deleting the selected address clears shared location state, while deleting another address does not;
- a location change invalidates both Home nearby-dish and Nearby-Chef query domains.

Existing phase tests continue to cover:

- cart selectors/active-vs-empty View Cart behavior;
- unread notification derivation and mark-read cache reconciliation;
- customer profile query write/revalidation;
- order detail-to-list reconciliation;
- search query and scroll-offset restoration.

The repository implementation CI remains the required code-level gate: dependency install, strict TypeScript, ESLint, Jest, production Android JavaScript bundle and backend/APIM/infrastructure source guard.

## 6. Phase boundary

P79 changes customer reconciliation only. **P80 Chef Root Shell and Role Isolation is not started or touched.**
