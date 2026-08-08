# P66 — My Addresses Active/Empty Visuals

## Status

**PARTIAL** at implementation/static-contract scope. The supported saved-address list/default/delete/selection behavior and active/empty cart visuals are implemented and validated. Full P66 acceptance cannot be claimed because the repository still exposes no approved address-aware delivery quote/reprice contract capable of refreshing delivery fee, ETA, and serviceability after `Deliver Here`. Physical Android/reference-image certification also remains deferred.

## Authorization and scope

This record covers only **P66 — My Addresses Active/Empty Visuals** for guide references **25 and 26**. It does not start P67.

P66 acceptance in `phases.md` requires:

- saved-address list/default/delete/`Deliver Here` behavior across both cart states;
- destructive delete confirmation;
- `Deliver Here` to refresh cart delivery fee, ETA, and serviceability.

P67 owns the subsequent Add/Edit Address and location-permission work. P66 therefore does not pre-implement address forms, pincode/geocode behavior, current-location permission, duplicate-address rules, or the P67 validation flow.

## Guide requirements checked

Authoritative guide: full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.

Reference 25 is the empty-cart My Addresses state. Reference 26 is the same address-management route with an active cart and the shared conditional View Cart control. The guide requires real address actions, destructive confirmation, selected/default state, global location consistency, and cart-aware address selection.

The full reference composition also contains Add/Edit address affordances. Those are intentionally not implemented in P66 because `phases.md` assigns their functional implementation to P67.

## Exact supported address contract boundary

P66 uses the existing customer-address backend contract only; no new backend or APIM route was invented.

Supported repository endpoints under `/api/v1/customer` include:

- `GET /addresses`;
- `POST /addresses`;
- `GET /addresses/{addressId}`;
- `PUT /addresses/{addressId}`;
- `DELETE /addresses/{addressId}`;
- `GET /location-recommendation`.

The approved address response exposes identity/address IDs, HOME/WORK/OTHER label, recipient/contact fields, address lines, landmark, area/city/state/postal code, latitude/longitude, default/active flags, and timestamps.

For **Set default**, the current repository contract is a full PUT-style update request. P66 therefore preserves the existing supported address fields and sends `isDefault=true` rather than fabricating a PATCH/default-only endpoint.

## Implemented P66 boundary

- One registered `CustomerAddresses` route serves both refs 25/26.
- The existing customer location selector now exposes a real `My Addresses` management destination.
- Saved addresses load from the exact `/api/v1/customer/addresses` contract through a dedicated private React Query cache.
- Address responses are parsed against the supported UUID, enum, field, coordinate, boolean, and timestamp shape before rendering.
- The list renders supported label/default/selected/recipient/contact/full-address state.
- **Set default** performs the real full PUT update and invalidates both the management query and the existing saved-location query used by customer shell surfaces.
- **Delete** requires an explicit destructive confirmation before calling the real DELETE endpoint.
- Deleting the currently selected browsing address clears the global customer location and invalidates location-sensitive home data.
- Deleting the currently selected cart address clears the cart address dependency and resets its delivery-quote dependency rather than retaining a deleted identifier.
- **Deliver Here** writes the selected address into the existing global `customerShell` location state, invalidates location-sensitive home feed data when changed, and updates the cart address dependency through the existing `resolveCartAddressSelection` transition.
- When cart items exist, `Deliver Here` performs a real read-only cart snapshot refresh through the existing cart API after the address transition.
- The active variant reads the authoritative cart count/subtotal and reuses `SharedViewCartOverlay`; the empty variant automatically removes View Cart at zero items.
- Active-cart bottom clearance is applied only while View Cart is visible.
- View Cart opens the real `CustomerCart` route and address management never clears/replaces the cart snapshot.

## Delivery quote blocker

The existing cart domain explicitly records `DELIVERY_QUOTE_CONTRACT_UNAVAILABLE`: there is no exact approved address-aware delivery quote/reprice endpoint in the repository that can safely refresh delivery fee, ETA, and serviceability from this screen.

P66 therefore fails closed instead of inventing a request or misusing checkout creation as a quote. `Deliver Here` performs every currently supported state transition and cart snapshot refresh, marks the existing delivery quote dependency stale when the address changes, and surfaces the missing quote capability rather than claiming a false successful delivery-price refresh.

This is the reason P66 remains **PARTIAL** despite successful client CI.

## Focused coverage

`apps/mobile/src/features/customerAddresses/customerAddresses.test.ts` verifies:

- exact supported saved-address parsing and mapping to global browsing-location state;
- full PUT payload preservation for Set default;
- unsupported address-label enum rejection;
- active-cart View Cart visibility and required content clearance;
- zero-item View Cart removal and empty-state spacing on the same route.

Existing cart tests continue to cover cart address dependency transitions and delivery-quote invalidation semantics.

## Acceptance result

- **One shared My Addresses route for refs 25/26: PASSED.**
- **Saved-address list/default/delete against approved contracts: PASSED at implemented client/backend-contract scope.**
- **Delete confirmation: PASSED.**
- **Global selected-location synchronization: PASSED at implemented client scope.**
- **Active/empty View Cart behavior and cart preservation: PASSED.**
- **Deliver Here updates cart address dependency and refreshes the real cart snapshot: PASSED at available client/API scope.**
- **Deliver Here refreshes delivery fee/ETA/serviceability: BLOCKED.** No approved address-aware delivery quote/reprice contract exists in the repository.
- **Add/Edit/current-location behavior: NOT STARTED by design.** It belongs to P67.
- **Implementation CI: PASSED.** The exact P66 implementation head `5904af74d25a8070a3834c33fbfb8f7e0c60deea` passed the repository implementation workflow.
- **Physical Android/reference-image certification: DEFERRED.**

## P66 implementation files

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/customerAddresses/api/customerAddressesApi.ts`
- `apps/mobile/src/features/customerAddresses/domain/customerAddressContract.ts`
- `apps/mobile/src/features/customerAddresses/query/customerAddressQueries.ts`
- `apps/mobile/src/features/customerAddresses/customerAddressesActiveCart.ts`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressesScreen.tsx`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressesRouteScreen.tsx`
- `apps/mobile/src/features/customerAddresses/customerAddresses.test.ts`
- `apps/mobile/src/features/customerShell/components/CustomerLocationSelector.tsx`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P66.

## Validation evidence

Implementation workflow: `.github/workflows/mobile-phase1-ci.yml`.

- GitHub Actions run ID: `31277654687`
- Job ID: `93153771794`
- Validated implementation head: `5904af74d25a8070a3834c33fbfb8f7e0c60deea`
- Job conclusion: **SUCCESS**
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## Handoff

P66 is the only phase handled here. **Do not start P67 without explicit user authorization.**
