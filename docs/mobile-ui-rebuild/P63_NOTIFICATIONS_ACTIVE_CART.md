# P63 — Notifications — Active Cart

## Status

**PARTIAL** at the implementation/static-contract scope defined by `phases.md`.

This evidence records only P63. **P64 — Edit Customer Profile Domain/Form was not implemented.**

## Authorization and authoritative inputs

The user authorized exactly one next phase on `mobile-ui-rebuild-from-scratch` after asking to verify the current state. `build.md` recorded P62 as PARTIAL and P63 as the next phase, so the authorized phase was P63.

Inputs checked before implementation:

- `agent.md`
- `build.md`
- applicable P63/P64 sequence in `phases.md`
- `plan.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, Reference 22 — Notifications — Active Cart
- P62 Notifications inbox/query/read/deep-link ownership
- existing shared cart selectors and `SharedViewCartOverlay`
- current route chrome policy and Profile stack ownership
- accepted P61 active-cart wrapper pattern
- current branch HEAD immediately before implementation

## Starting and validated revisions

- Branch starting SHA before P63 work: `fd5bde0502b4d59209ed380484ceb00fef4002c9`
- Validated P63 implementation SHA: `c22b216e36d8fe3b35f9480768d58789ec197b7d`

## Reference 22 requirements reviewed

Reference 22 defines the active-cart state as the same logical `CustomerNotifications` route with:

- the Notifications composition plus active View Cart pill;
- live cart summary derived from the shared cart domain;
- View Cart navigation to Cart;
- notification read/deep-link interactions continuing normally while the cart remains active;
- no cart loss/reset when navigating from a notification to an allowlisted destination;
- dynamic bottom clearance so active cart/navigation controls do not cover the final notification content;
- zero-item fallback to the empty-cart Notifications state without a duplicate screen.

`phases.md` P63 acceptance requires notification actions to avoid silently resetting cart/tab state.

## Contract boundary retained from P62

P63 does not widen or fabricate the P62 Notifications server contract. The accepted operations remain:

- `GET /api/v1/notifications/in-app` with a bounded `limit`;
- `PATCH /api/v1/notifications/in-app/{noticeId}/read` for a UUID notice identifier.

The unchanged P62 blockers remain:

- no cursor/page-token/offset pagination contract;
- no authoritative global unread-count endpoint;
- no authoritative category-count endpoint;
- no aggregate mark-all-read operation;
- no trusted arbitrary client route/URL deep-link field;
- no dedicated current Notifications APIM policy/source found in the accepted `infra/apim/**` evidence.

P63 introduces no endpoint, request/response model, notification store, cart store, or backend/APIM change.

## P63 implementation completed

P63 implements the contract-independent active-cart boundary for Reference 22:

- `CustomerNotificationsRouteScreen` now owns state-driven active-cart chrome around the existing P62 `CustomerNotificationsScreen`; no duplicate Notifications screen was created.
- The wrapper reads the existing authoritative `selectCartItemCount` and `selectCartFoodSubtotal` selectors; Notifications does not copy or mutate cart state.
- The existing route policy for `CustomerNotifications` remains a standard Customer route and is eligible for the shared View Cart control.
- `SharedViewCartOverlay` renders automatically when the authoritative cart is active and disappears immediately when item count returns to zero.
- View Cart opens the existing `CustomerCart` destination in the same Profile stack.
- The shared overlay continues to own live item count/subtotal display, Espresso Brown presentation, animation, and reduced-motion behavior.
- A Notifications-specific presentation helper adds bottom clearance only while the overlay is visible, preventing the floating cart control from obscuring the final inbox content.
- Notification read-on-open still updates only the shared notification query cache; no cart state is reset or rewritten.
- ORDER/DELIVERY notification destinations still push the existing detail/tracking routes inside the Profile stack, so Back returns to the same Notifications route rather than resetting the customer root/tab.
- When the cart becomes empty, the overlay and added clearance disappear and the same route immediately returns to the P62 empty-cart presentation.

## Acceptance result

The P63 acceptance condition **“Notification actions do not silently reset cart/tab state” passes** at the implemented client scope:

- notification read mutation has no cart reducer/store write;
- the active-cart wrapper consumes shared selectors read-only;
- notification child destinations use the existing Profile stack rather than root reset/replace navigation;
- View Cart uses normal stack navigation to the existing `CustomerCart` route;
- no second Notifications route, notification store, cart store, or customer tab root was introduced.

## Why P63 remains PARTIAL

The Reference 22 active-cart shell is implemented and validated, but P63 inherits the unresolved P62 Notifications contract limitations. The phase remains PARTIAL because the complete Notifications capability still lacks:

1. true server pagination/cursor semantics;
2. authoritative global unread/category aggregate counts;
3. aggregate mark-all-read;
4. dedicated current Notifications APIM provenance in the audited repository evidence;
5. physical-device/reference-image certification, intentionally deferred by the rebuild policy.

No missing contract was fabricated to force a DONE status.

## Focused tests

`customerNotificationsActiveCart.test.ts` covers:

- View Cart eligibility/visibility for an active cart on `CustomerNotifications`;
- active-cart bottom-clearance switching;
- immediate return to the P62 empty-cart state when cart item count reaches zero.

The existing P62 tests continue to cover notification stable-ID ordering, category/group behavior, read-state application, and ORDER/DELIVERY destination allowlisting.

## CI evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`

Validated run:

- Run ID: `31274568039`
- Job ID: `93145968430`
- Head SHA: `c22b216e36d8fe3b35f9480768d58789ec197b7d`
- Conclusion: **SUCCESS**
- dependency install: **SUCCESS**
- TypeScript strict check: **SUCCESS**
- ESLint zero-warning gate: **SUCCESS**
- Jest: **SUCCESS**
- production Android JavaScript bundle: **SUCCESS**
- backend/APIM/infrastructure source guard: **SUCCESS**

No Java/Gradle/APK/AAB packaging was performed.

## Changed files

Implementation/test:

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/notifications/customerNotificationsActiveCart.ts`
- `apps/mobile/src/features/notifications/customerNotificationsActiveCart.test.ts`
- `apps/mobile/src/features/notifications/screens/CustomerNotificationsRouteScreen.tsx`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P63_NOTIFICATIONS_ACTIVE_CART.md`
- `build.md`

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle, APK, or AAB file was changed.

## Stop boundary

P63 is the only phase implemented in this authorization.

**P64 — Edit Customer Profile Domain/Form remains NOT STARTED.** Do not begin P64 until a later explicit authorization.
