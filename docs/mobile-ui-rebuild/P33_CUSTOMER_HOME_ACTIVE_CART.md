# P33 — Customer Home — Active Cart

**Project:** CRAVES Mobile Rebuild  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase:** P33 only  
**Status:** **PARTIAL — supported Home cart quantity/reconciliation path implemented and CI-validated; View Cart remains blocked by the not-yet-owned Cart product route**  
**Started from branch head:** `8a8d3cf42ac8240f1363e28a4e0a8c322d0f55d9`  
**Validated implementation commit:** `bcb25866df664a77c8b83fa50c029f967d72a9be`  
**Guide reference:** 6 — Customer Home — Active Cart Reference State

---

## 1. Authority Reviewed

P33 was executed after reviewing:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`

P32 remains correctly recorded as PARTIAL. This phase does not backfill P32's missing favorite/search/category/cuisine/recommendation contracts or later product routes.

---

## 2. P33 Scope and Acceptance

`phases.md` defines P33 as **Customer Home — Active Cart** on the same Home implementation, with synchronized View Cart/badge/quantities/total and no duplicate screen architecture.

Reference 06 additionally requires:

- live active-cart quantities on Home,
- add/remove changes reflected immediately without refetching the Home feed,
- animated View Cart count/price state,
- `View Cart -> Cart`,
- removal of the active-cart state when the final item leaves the cart,
- no empty/inert handlers or unregistered placeholder routes.

---

## 3. Implemented Behavior

### Same Customer Home route

P33 extends the existing `CustomerHomeScreen`; it does not create a second active-cart Home screen or parallel cart state.

The generic screen test ID is now `customer-home` rather than encoding the P32 empty-cart state into the route surface.

### Canonical cart-to-dish reconciliation

Home reads the existing P28/P30 authoritative cart snapshot and mutation registry.

For loaded nearby dishes:

- a dish with no canonical cart line continues to show the real `Add` action,
- a dish with a positive canonical cart quantity switches to a quantity selector,
- the line is matched by the authoritative `menuItemId`,
- Home does not maintain a local quantity copy.

### Quantity mutation behavior

The active quantity selector is connected to the existing P30 mutation boundary:

- `+` dispatches `setCartItemQuantity` with the canonical line ID and next quantity,
- `-` dispatches `setCartItemQuantity` while quantity is greater than one,
- decrementing quantity one dispatches `removeCartItem`,
- the line-scoped pending state disables both quantity controls to protect duplicate taps,
- mutation failures continue through the existing recoverable Home error banner.

P30's existing optimistic snapshot and rollback rules provide immediate quantity feedback while preserving server reconciliation. Home does not refetch the discovery feed for cart-only mutations.

### Return to empty-cart card behavior

When the final unit of a Home dish is removed, the optimistic authoritative cart snapshot removes that line immediately. The same card therefore returns to `Add` without a Home-feed refresh. If the server mutation fails, P30 rolls the previous cart snapshot back and Home returns to the valid quantity state.

---

## 4. Deliberately Blocked P33 Surface

### View Cart cannot be wired safely yet

Reference 06 requires the Espresso Brown View Cart control to be visible for an active cart and for that control to open the Cart route.

The current branch has:

- the reusable P29 `SharedViewCartOverlay`,
- canonical P28/P30 live cart count/total state,
- **no registered Customer Cart product route in the current navigator/types**.

`phases.md` explicitly reserves:

- P45 for Cart screen data/pricing model extensions,
- P46 for Cart and Bill Summary UI and its product navigation destination.

The guide and `agent.md` prohibit empty handlers, unreachable routes, placeholder screens, and invented route contracts. Therefore P33 does **not** mount `SharedViewCartOverlay` with a no-op callback and does **not** pre-implement the P46 Cart screen merely to satisfy this visual state.

Consequently these P33 acceptance items remain blocked together:

- visible View Cart pill on Home,
- View Cart live count/total presentation on Home,
- View Cart -> Cart navigation,
- active View Cart bottom-content inset/collision verification.

The cart snapshot itself remains synchronized; the missing part is the functional visible destination-bound control.

---

## 5. Changed Files

Implementation:

- `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx`

Evidence:

- `docs/mobile-ui-rebuild/P33_CUSTOMER_HOME_ACTIVE_CART.md`

No backend, OpenAPI, APIM, infrastructure, database, native Android build configuration, Cart product route/UI, checkout/payment, P34 nearby-chef work, or other later phase was changed.

---

## 6. Validation Evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Successful run:

- run ID: `31248405375`
- job ID: `93080699835`
- head SHA: `bcb25866df664a77c8b83fa50c029f967d72a9be`
- conclusion: **SUCCESS**

Passed gates:

1. checkout + Node `22.13.0`,
2. `npm ci`,
3. strict TypeScript `tsc --noEmit`,
4. ESLint with zero warnings,
5. Jest — **37 suites / 179 tests passed**, including the existing cart mutation/domain regression coverage,
6. production Android JavaScript bundle generation,
7. backend/APIM/infrastructure source guard.

The implementation workflow does not build an APK/AAB by project policy.

---

## 7. Acceptance Assessment

| P33 requirement | Result |
|---|---|
| Same Home implementation for active cart | **IMPLEMENTED / VALIDATED** |
| Canonical cart quantity reflected on loaded Home dish card | **IMPLEMENTED / VALIDATED** |
| Increment quantity | **IMPLEMENTED / VALIDATED** through P30 mutation boundary |
| Decrement quantity | **IMPLEMENTED / VALIDATED** through P30 mutation boundary |
| Remove line at quantity one | **IMPLEMENTED / VALIDATED** through P30 mutation boundary |
| Duplicate quantity taps protected | **IMPLEMENTED / VALIDATED** through line pending state |
| Mutation rollback/error reconciliation | **IMPLEMENTED / VALIDATED** through P30 mutation boundary |
| Last-item removal returns Home card to Add | **IMPLEMENTED / VALIDATED** from authoritative snapshot |
| No Home feed refetch required for cart mutation | **IMPLEMENTED** |
| Visible View Cart/count/total | **BLOCKED** — functional destination requires Cart product route |
| View Cart -> Cart | **BLOCKED** — Cart product route/UI is reserved for P45/P46 and is not registered |
| View Cart content inset/collision behavior | **BLOCKED** with the destination-bound View Cart surface |

Because the route-required View Cart acceptance cannot be implemented without an inert control or pre-implementing a later phase, P33 is recorded as **PARTIAL**, not DONE.

---

## 8. Visual / Runtime QA

Code-level styling uses the accepted CRAVES tokens, 44px+ quantity touch targets, accessible button labels/states, and the existing Home card composition. No emulator/physical-device Reference 06 overlay comparison was performed, so pixel-perfect certification is **not claimed**.

Live APIM/device runtime certification is also not claimed by this CI-only record.

---

## 9. Stop State

P34 — Nearby Chef Discovery Contract was **not started**.

**Next phase authorization:** **NONE — stop after P33 and wait for explicit user direction.**