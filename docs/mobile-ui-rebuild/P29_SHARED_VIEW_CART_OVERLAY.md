# P29 — Shared View Cart Overlay

## Status

**DONE at implementation/static-contract level.** Final physical-device/reference certification remains part of later visual QA.

- Started from accepted P28 ledger head: `2c90cead1350728e0e56a21c20512f94a6d19732`.
- Validated implementation commit: `3413d329aee34acdc8c6057cfd22ed5a227d15dd`.
- GitHub Actions run: `31230836784` — **SUCCESS**.

## Phase boundary

P29 implements only the shared active-cart overlay described by `phases.md` and the customer active-cart variants in the master implementation guide.

Included:
- authoritative item count and food subtotal from the P28 cart domain;
- hidden-at-zero behavior;
- customer route-policy eligibility and suppression in Auth, Chef, Transactional, and Modal domains;
- Espresso Brown shared action surface;
- animated appearance for an eligible non-empty cart using the shared `viewCart` motion intent;
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

The overlay reads `selectCartItemCount` and `selectCartFoodSubtotal`; it does not keep another cart copy and does not recompute server pricing. Visibility also requires `RouteChromePolicy.viewCartEligible`, so Auth, Chef, Transactional, Modal, checkout/payment-style immersive contexts remain suppressed by navigation policy.

The current branch intentionally has no Cart product route yet. P29 therefore provides the real reusable overlay with a required `onOpenCart` callback, but does not register a fake destination. The owning Cart UI/navigation phase can mount it with the real navigation action without changing this cart-state or visibility contract.

At item count zero, the overlay is unmounted immediately. For a non-empty eligible cart, its entrance uses `resolveMotion('viewCart', ...)`; reduced-motion users receive the final state without interpolation.

## Validation

GitHub Actions run `31230836784` passed:

1. checkout of `mobile-ui-rebuild-from-scratch`;
2. Node setup and `npm ci`;
3. strict TypeScript check;
4. ESLint;
5. Jest, including focused P29 visibility/model coverage and prior regressions;
6. production React Native JavaScript bundle;
7. backend/APIM/infrastructure source-change guard.

Focused P29 coverage verifies zero-state hiding, active customer eligibility, Auth/Chef/Transactional/Modal suppression, authoritative-subtotal requirement, and money display formatting.

## Next phase

**P30 — Cart Add/Remove/Quantity Reconciliation. NONE AUTHORIZED.** Stop after P29 until explicitly requested.
