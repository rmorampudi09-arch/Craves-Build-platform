# P71 — Coupons / Offers — Active Cart

**Status:** BLOCKED  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Audit baseline:** `8285d6022c48959e366b770e4327fc2a3a6fb3f7`  
**Date:** 2026-08-09

## 1. Phase requirement

P71 requires production active-cart coupon/offer behavior across apply, applied, replace, remove, unavailable/not-eligible, and failure states. Coupon mutations must target the live cart through an approved backend contract, server-recalculated pricing must remain authoritative, and View Cart / Checkout totals must immediately reconcile from that canonical response.

The phase explicitly forbids guessed eligibility/application rules, client-side shadow discount math, and hard-coded coupon outcomes.

## 2. Contract gate result

The exact branch was audited before changing runtime code. No approved executable active-cart coupon/offer contract exists for the required behavior.

Missing contract surface includes:

1. active-cart offer discovery and eligibility for the current cart/context;
2. coupon/offer apply mutation request and response schema;
3. applied coupon/offer identity and authoritative outcome payload;
4. remove mutation request and response schema;
5. replace semantics, including whether replacement is atomic or remove-then-apply;
6. unavailable, expired, not-eligible, conflict, and retryable/server-failure outcome taxonomy;
7. canonical repriced cart response carrying authoritative coupon discount and post-mutation totals needed by View Cart and Checkout.

## 3. Evidence audited

The P71 decision was reconciled against:

- `plan.md`;
- `phases.md` — P71 active-cart coupon/offer requirements and acceptance criteria;
- `agent.md` — no invented backend/product behavior and explicit BLOCKED outcome rules;
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` — Reference 30, Coupons & Offers (Active Cart);
- `shared/contracts/openapi-notes.md`;
- `openapi/`, `services/`, and `infra/apim/` contract surfaces present on the branch;
- `apps/mobile/src/features/cart/domain/cartScreenModel.ts`;
- `apps/mobile/src/features/cart/domain/cartTypes.ts`;
- the exact branch tree at the audit baseline;
- `docs/mobile-ui-rebuild/P70_COUPONS_OFFERS_EMPTY_CART.md`.

The branch still names Coupons only at a logical/module level; there is no concrete typed active-cart mutation/repricing surface to consume. The current cart domain also leaves coupon discount / canonical coupon pricing dependency unavailable rather than exposing an authoritative applied-coupon model.

## 4. Why runtime implementation is blocked

Implementing P71 UI mutations now would necessarily invent at least one production rule or backend detail: endpoint paths, request/response fields, eligibility, replace semantics, outcome/error mapping, or discount/total calculations.

That would violate both P71 and the project governance documents. Checkout creation/payment routes are not repurposed as coupon mutation or quote/reprice routes, and the client is not made a shadow pricing authority.

Therefore P71 is recorded as **BLOCKED**, not as a fake or partially simulated coupon flow.

## 5. Runtime changes

None intentionally.

No coupon screen, local offer catalogue, fake applied state, guessed mutation, hard-coded eligibility, local discount formula, cart-total override, or Checkout pricing override was added.

P72 and all later phases remain untouched.

## 6. Verification

- Static exact-branch contract/tree audit completed.
- P71 acceptance criteria were checked against the currently available cart and API contract boundaries.
- Existing P68 mobile-source validation remains the latest executable mobile CI baseline because P71 changes documentation/ledger only.
- No runtime test suite was triggered for P71 because executable product code was intentionally unchanged.
- No APK/AAB packaging was performed.

## 7. Unblocker

P71 can proceed only after an approved coupons/offers active-cart contract is available that defines, at minimum:

- discovery/eligibility and any required offer/terms source;
- apply, remove, and replace mutation schemas and semantics;
- authoritative applied-coupon/offer outcome state;
- canonical repriced cart response including coupon discount and totals consumed by View Cart / Checkout;
- unavailable/expired/not-eligible/conflict/retryable failure taxonomy.

Once that contract exists, the phase should extend the existing canonical cart state and reconciliation path rather than introduce a parallel coupon/pricing store.
