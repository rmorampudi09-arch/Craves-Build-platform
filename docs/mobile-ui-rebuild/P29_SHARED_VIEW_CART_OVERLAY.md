# P29 — Shared View Cart Overlay

## Status

Implementation committed for CI validation.

## Phase boundary

P29 implements only the shared active-cart overlay described by `phases.md` and the customer active-cart variants in the master implementation guide.

Included:
- authoritative item count and food subtotal from the P28 cart domain;
- hidden-at-zero behavior;
- customer route-policy eligibility and suppression in Auth, Chef, Transactional, and Modal domains;
- Espresso Brown shared action surface;
- animated first appearance using the shared `viewCart` motion intent;
- reduced-motion support;
- required `onOpenCart` interaction contract so the component cannot be consumed as an inert control.

Explicitly not included:
- add/remove/quantity mutations or reconciliation (P30);
- discovery/dish add-to-cart wiring (later discovery phases);
- Cart screen pricing model (P45);
- Cart/Bill Summary screen or a placeholder Cart route (P46);
- checkout/payment work.

## Files

- `apps/mobile/src/features/cart/viewCartOverlayModel.ts`
- `apps/mobile/src/features/cart/components/SharedViewCartOverlay.tsx`
- `apps/mobile/src/features/cart/viewCartOverlayModel.test.ts`

## Architecture notes

The overlay reads `selectCartItemCount` and `selectCartFoodSubtotal`; it does not keep another cart copy and does not recompute server pricing. Visibility also requires `RouteChromePolicy.viewCartEligible`, so transactional/immersive domains remain suppressed by navigation policy.

The current branch intentionally has no Cart product route yet. P29 therefore provides the real reusable overlay with a required `onOpenCart` callback, but does not register a fake destination. The owning Cart UI/navigation phase can mount it with the real navigation action without changing this cart-state or visibility contract.

At item count zero, the overlay is unmounted immediately. For a non-empty eligible cart, its entrance uses `resolveMotion('viewCart', ...)`; reduced-motion users receive the final state without interpolation.

## Validation target

CI must run the repository mobile lint/type/test gates. The focused Jest coverage verifies zero-state hiding, active customer eligibility, Auth/Chef/Transactional/Modal suppression, authoritative-subtotal requirement, and money display formatting.
