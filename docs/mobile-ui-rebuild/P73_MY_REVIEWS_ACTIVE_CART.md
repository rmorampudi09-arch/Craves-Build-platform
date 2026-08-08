# P73 — My Reviews (Active Cart + Review Actions)

**Status:** BLOCKED  
**Guide reference:** 32 — My Reviews — Active Cart Reference State  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Audited baseline:** `e5d77ebfe9458997887d266becfe40b28d8cbce9`

## 1. Authorized scope

P73 is the single authorized phase after P72. It requires the shared My Reviews experience in its active-cart state, including the synchronized active View Cart affordance and all real review actions required by Guide Reference 32.

P74 and later phases are outside this checkpoint and remain untouched.

## 2. Guide requirements checked

Reference 32 requires:

- the shared logical `CustomerReviews` route/state rather than a duplicate active-cart screen;
- Reviews composition plus the active View Cart pill;
- synchronized active-cart summary without disturbing review drafts/tab state;
- real review interactions/actions, including write/edit/delete and related navigation/mutation outcomes;
- server-owned review data through the project query layer and idempotent mutations through approved typed contracts;
- no invented endpoint URLs, mock-only controls, placeholder handlers, or fabricated data;
- the review editor to behave as an immersive form and hide bottom navigation/cart controls while open.

## 3. Existing reusable cart capability

The branch already has canonical active-cart behavior used by prior customer screens, including the shared View Cart overlay behavior. That capability can satisfy the cart-state portion of Reference 32 once a real shared Reviews route exists.

The cart capability does **not** supply or authorize the missing review-domain data/actions.

## 4. Blocking review contract gap

The audited branch still has no executable customer review contract to drive Reference 32 truthfully:

- `apps/api/src/routes/` exposes `admin.ts`, `auth.ts`, `catalog.ts`, and `health.ts`; there is no authenticated customer reviews route;
- there is no approved customer review list/pagination response contract;
- there is no approved pending-review/delivered-item review-readiness capability;
- there is no approved customer rating summary/distribution capability;
- there is no approved create/edit/delete review mutation contract;
- there is no approved edit-window, moderation, duplicate-review, conflict, or mutation-outcome model;
- there is no approved review-media upload contract for this flow;
- `apps/mobile/src/features/` has no canonical Reviews API/domain/feature implementation to extend.

These are the same review-domain prerequisites that blocked P72, and P73 adds review actions rather than removing that dependency.

## 5. No-fabrication decision

Implementing Reference 32 now would require one or more prohibited substitutions:

- static/fake review rows or rating summaries;
- locally invented pending-review eligibility;
- guessed REST/APIM endpoint paths or request/response schemas;
- no-op or placeholder write/edit/delete controls;
- client-owned duplicate/edit/delete policy;
- local optimistic review mutations without an approved authoritative mutation contract.

`agent.md` and the master guide explicitly require missing contracts to be flagged instead of fabricated. Therefore no product runtime source is changed for P73.

## 6. Phase result

**P73 status: BLOCKED.**

The active-cart/View Cart portion is reusable, but the shared Reviews route and its required server-backed data/actions cannot be implemented or certified until the review contract exists. Adding only the cart pill to a fake/static Reviews screen would not satisfy the phase and would violate the completion gate.

## 7. Validation/evidence

Checked for this checkpoint:

- `plan.md`
- `phases.md`
- `agent.md`
- `build.md`
- `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Guide Reference 32
- `apps/api/src/routes/`
- `apps/mobile/src/features/`
- P72 evidence and inherited review blockers

No mobile/backend/APIM/OpenAPI/database/infrastructure source was changed. No mobile CI run is expected for this docs/ledger-only blocked checkpoint.

## 8. Handoff boundary

- P73: **BLOCKED** at exact review-contract capability scope.
- P74: **NOT STARTED**.
- Do not pre-implement P74 without explicit user authorization.
