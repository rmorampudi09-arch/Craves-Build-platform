# P72 — My Reviews — Empty Cart

**Status:** BLOCKED  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Audit baseline:** `c75b0429a31af3a3fc73476dda49a41ecfbed8a4`  
**Date:** 2026-08-09

## 1. Phase requirement

P72 requires the My Reviews empty-cart reference state from Guide Reference 31. The screen depends on server-owned customer review data: submitted reviews, pending/delivered-item review eligibility, review summary/distribution, and the create/edit/delete review lifecycle.

`phases.md` explicitly requires the exact review-list capability and says to record `BLOCKED` rather than fabricate data when the list/edit contract is missing.

## 2. Contract gate result

The exact branch was audited before changing runtime code. The approved executable backend surface needed by P72 is not present.

Missing contract surface includes:

1. authenticated customer reviews list and pagination;
2. pending review / delivered-item eligibility and duplicate-review authority;
3. customer review summary and rating distribution;
4. create-review mutation tied to an eligible order item;
5. edit-review mutation and server-owned edit-window rules;
6. delete-review mutation;
7. review-media upload capability where supported;
8. canonical response/invalidation behavior needed to refresh dish/kitchen ratings after review mutations.

## 3. Evidence audited

The P72 decision was reconciled against:

- `plan.md` / `PLAN.md` governance and no-invented-contract rule;
- `phases.md` — P72 My Reviews — Empty Cart scope and acceptance;
- `agent.md` — API Contract Workflow and Missing Dependency / Blocker Protocol;
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` — Reference 31, My Reviews — Empty Cart;
- `apps/api/src/routes/` on the exact branch;
- `apps/mobile/src/features/` on the exact branch;
- the exact branch tree at the audit baseline.

At the audit baseline, `apps/api/src/routes/` contains only `admin.ts`, `auth.ts`, `catalog.ts`, and `health.ts`. There is no executable customer reviews/readiness/list/summary route surface there. The current mobile feature tree also has no canonical My Reviews feature/API domain to extend.

The master guide requires customer reviews list/summary, pending review eligibility, create/edit/delete review, order linkage, and server-owned delivered-order/duplicate-review rules. Those logical requirements do not authorize inventing endpoint URLs or schemas.

## 4. Why runtime implementation is blocked

A production My Reviews screen cannot truthfully render submitted reviews, pending-review eligibility, summary values, or mutation outcomes without the missing server contracts. Building the reference UI with mock rows, hard-coded summary values, inferred delivered-order eligibility, guessed REST paths, or local edit/delete behavior would violate both P72 and the master guide.

Therefore P72 is recorded as **BLOCKED**, not as a static or simulated screen.

## 5. Runtime changes

None intentionally.

No `CustomerReviews` route, fake review list, fake pending-review list, hard-coded rating summary, guessed review endpoint, local eligibility rule, placeholder review editor, or mock mutation state was added.

P73 and all later phases remain untouched.

## 6. Verification

- Static exact-branch contract/tree audit completed.
- P72 acceptance criteria were checked against the current backend and mobile capability surfaces.
- Existing P68 mobile-source validation remains the latest executable mobile CI baseline because P72 changes documentation/ledger only.
- No runtime test suite was triggered for P72 because executable product code was intentionally unchanged.
- No APK/AAB packaging was performed.

## 7. Unblocker

P72 can proceed only after approved executable contracts are available that define, at minimum:

- authenticated customer review list + pagination;
- pending review eligibility tied to delivered order items, including duplicate-review authority;
- review summary/distribution;
- create, edit, and delete review request/response/error semantics;
- server-owned edit-window/moderation rules;
- review media upload if the product supports it;
- cache/invalidation linkage needed to refresh affected dish/kitchen ratings after confirmed mutations.

Once those contracts exist, P72 should extend the existing customer navigation/query architecture and reuse the canonical cart-empty state rather than introduce a parallel review or cart store.
