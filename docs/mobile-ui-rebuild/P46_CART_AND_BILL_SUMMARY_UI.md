# P46 — Cart and Bill Summary UI Evidence

**Phase:** P46 — Cart and Bill Summary UI  
**Status:** PARTIAL  
**Authoritative branch:** `mobile-ui-rebuild-from-scratch`  
**Started from commit:** `2acdaca13e0092639ccaf640f0b1f18b03893bfc`  
**Validated implementation commit:** `8de414d1b70635433b4ac9f7f1164da0c29a6790`  
**Implementation CI:** run `31259171300`, job `93107162275` — **SUCCESS**  
**Guide:** full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Screen 18 / Reference Image 18, pages 75–76, plus global customer cart/navigation/lifecycle rules.

---

## 1. Authorized Boundary

The user authorized exactly one phase after the accepted P45 partial state. Per `phases.md`, that phase is P46 — Cart and Bill Summary UI. No P47 Address Selection for Commerce implementation is included.

P46 consumes the P45 cart-screen data/pricing model and the earlier P28–P30 authoritative shared cart state/mutations. It does not change backend, APIM, OpenAPI, infrastructure, checkout service behavior, payment behavior, or Android native packaging.

---

## 2. Guide Behavior Implemented Within Current Contracts

### Real `CustomerCart` navigation

- Registered typed logical route `CustomerCart` in each customer tab stack so opening Cart preserves the originating customer tab stack and back returns to that source.
- Home active-cart View Cart now opens the real Cart route.
- Discover Home Chefs active-cart View Cart now opens the same real Cart route instead of the prior unavailable alert.
- Cart route policy keeps the customer bottom navigation visible per the reference while suppressing the redundant floating View Cart overlay on Cart itself.

### Cart composition

- Added a production Cart screen using the existing customer shell, design tokens, shared buttons/lifecycle components, Redux cart domain, and exact cart API adapter.
- Uses a virtualized `SectionList` and groups authoritative cart lines by kitchen without changing server line order.
- Shows item name, kitchen grouping, authoritative unit price, quantity, and authoritative line total.
- The current cart contract has no dish-image field, so the UI does not invent or fetch unrelated media; it uses a deterministic branded text fallback.

### Quantity and removal interactions

- Increment/decrement uses P45 target-quantity mapping and the existing P30 `setCartItemQuantity` mutation.
- Quantity reaching zero routes through the existing remove mutation rather than sending an invalid zero quantity to the update endpoint.
- Explicit Remove uses a destructive confirmation before the existing remove mutation.
- Per-line controls are disabled while the line mutation is pending.
- Existing P30 optimistic reconciliation and rollback remain authoritative; P46 surfaces mutation failures without discarding valid lines.
- When the final line is removed, the shared cart reaches zero and Home/Chefs View Cart disappears from the authoritative shared state without a manual refresh.

### Refresh and lifecycle behavior

- Added a cart read refresh thunk over the existing `GET /api/v1/cart` adapter.
- Pull-to-refresh, initial loading, recoverable error, retry, and empty-cart states are wired.
- A recoverable refresh error does not intentionally replace an already valid snapshot; the last valid cart remains available when the shared cart state has one.
- Empty cart uses the reusable terminal-state pattern and provides a real Back to browsing action.
- Cart scrolling uses the existing customer bottom-navigation hide/reveal controller.

### Address, ETA, offers, bill, and checkout fail-closed behavior

The guide requires delivery address, ETA/quote, offers/coupon, complete bill details, and checkout eligibility. P45 proved that the current authoritative cart response does not provide these server-owned values.

P46 therefore:

- shows delivery-address and ETA capability/status cards without fabricating display values;
- keeps the browsing-location selector functional but does not falsely treat browsing location as the commerce delivery-address contract;
- shows Offers & Coupons as unavailable until a real coupon-result/application contract is present rather than creating a fake Apply action;
- provides a real expand/collapse Bill details interaction;
- displays the server-authoritative food subtotal;
- renders platform fee, delivery fee, tax, coupon discount, and payable total as unavailable instead of calculating them locally;
- renders the sticky checkout area from the reference hierarchy but keeps `Proceed to Checkout` disabled while complete server bill and eligibility evidence are unavailable.

This follows the guide requirement that final totals remain server-authoritative and that missing contracts be explicitly gated instead of invented.

---

## 3. Exact Existing Contracts Used

P46 adds no endpoint. It uses the existing cart transport and P45/P30 domain boundaries:

```http
GET    /api/v1/cart
POST   /api/v1/cart/items
PUT    /api/v1/cart/items/{id}
DELETE /api/v1/cart/items/{id}
```

Current cart line data used by the UI remains the validated response model containing line identity, menu/kitchen identity and names, unit price, quantity, line total, and timestamps.

Current totals remain limited to the server food subtotal/currency. P46 does not derive platform fee, tax, delivery fee, coupon discount, or grand total on-device.

`POST /api/v1/checkout` is not used as a quote endpoint because it is side-effecting. `POST /api/v1/cart/validate` remains insufficient for the missing complete pre-checkout pricing/eligibility composition identified by P45.

---

## 4. Changed Implementation Files

Navigation / route policy:

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`

Customer entry surfaces:

- `apps/mobile/src/features/home/screens/CustomerHomeRouteScreen.tsx`
- `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen.tsx`

Cart UI/model support:

- `apps/mobile/src/features/cart/screens/CustomerCartScreen.tsx`
- `apps/mobile/src/features/cart/cartUiModel.ts`
- `apps/mobile/src/features/cart/state/cartRefresh.ts`
- `apps/mobile/src/features/cart/cartUiModel.test.ts`

No backend/APIM/infrastructure source file is changed by the validated implementation.

---

## 5. Validation Evidence

Validated implementation commit: `8de414d1b70635433b4ac9f7f1164da0c29a6790`.

GitHub Actions workflow `.github/workflows/mobile-phase1-ci.yml`:

- Run: `31259171300`
- Job: `93107162275`
- Dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- Production Android JavaScript bundle: **SUCCESS**
- Backend/APIM/infrastructure source guard: **SUCCESS**
- Overall job conclusion: **SUCCESS**

The first implementation commit `c6c7e2938a24d256eb61e6642baf961a8e3ec6ad` passed TypeScript but the first CI run `31259071209` stopped at seven `no-void` lint warnings in the new Cart screen. Commit `8de414d1b70635433b4ac9f7f1164da0c29a6790` corrected only those lint violations; the full rerun above passed every required gate.

No APK/AAB was built, consistent with the phase policy.

---

## 6. Why P46 Is PARTIAL

P46 cannot meet the complete Screen 18 acceptance gate without server-owned data/contracts that P45 already identified as absent. Current blockers are:

- complete pre-checkout platform fee/tax/delivery fee/grand total;
- commerce delivery-address display/snapshot and exact Cart address-selection result;
- delivery ETA/serviceability quote suitable for Cart;
- coupon application/result and discount amount;
- explicit checkout eligibility/ineligibility evidence;
- cart-line media/image if exact reference fidelity requires it;
- physical Android/reference-image certification for Reference Image 18.

Because those values and interactions must not be fabricated, P46 implements all safely supportable current-contract UI and fails closed for unavailable commerce capabilities. Full visual/transactional acceptance remains pending the owning contract/later phases and final device/reference QA.

---

## 7. Out of Scope / Not Implemented

- P47 — Address Selection for Commerce.
- New address/serviceability backend contracts.
- Coupon backend/application flow.
- New pre-checkout quote/pricing endpoint.
- Checkout creation or payment initiation.
- Orders or payment screens.
- Backend, APIM, OpenAPI, database, infrastructure changes.
- Per-phase APK/AAB packaging.

**Next phase:** NONE AUTHORIZED — waiting for user.
