# P78 — Customer Empty/Search/Offline/No-Data System

Status: PARTIAL at exact contract-backed implementation scope. Mobile CI is green for the implemented code boundary; runtime Android comparison against Guide Reference 37, a live approved connectivity event source, and contract-blocked Favorites/Reviews/Coupons host activation remain outstanding.

## Authority

- Branch: `mobile-ui-rebuild-from-scratch`
- Phase: P78 only
- Guide reference: 37 — Customer Empty, Search, Offline, and No-Data States Collection
- Existing repository architecture and exact APIM/backend contracts remain authoritative.
- P79 — Customer Cross-Screen Reconciliation Audit is not implemented by this phase.

## Implemented

- Adds one typed configurable customer empty/no-data model covering all eight Guide Reference 37 states:
  - Empty Cart
  - No Orders
  - No Search Results
  - No Favorites
  - No Internet
  - No Saved Addresses
  - No Reviews
  - No Coupons
- Adds small context adapters rather than eight duplicated screen implementations.
- Adds one reusable `CustomerEmptyState` presentation component with context illustration, title, explanatory copy, primary/secondary actions, optional preserved search query display, accessibility semantics, action pending state, and test hooks.
- Adds restrained illustration fade/scale motion while honoring the platform reduced-motion setting.
- Extends the existing shared SVG icon component with the exact state illustration primitives required by the new reusable shell.
- Preserves the exact applied search query for the no-results state instead of trimming or replacing it.
- Adds a typed connectivity recovery edge policy that fires only on `OFFLINE -> ONLINE`; repeated `ONLINE -> ONLINE` or `OFFLINE -> OFFLINE` states do not trigger recovery, preventing a retry loop.
- Keeps offline browsing and current-location recovery actions conditional. They are only exposed when the host has an approved safe cached-content path or approved permission/location handling.
- Integrates the shared system into currently authoritative hosts:
  - Cart: Empty Cart plus initial no-network/no-snapshot state.
  - Orders: No Orders plus initial no-network/no-snapshot state.
  - Home discovery: No Search Results plus initial no-network/no-data state.
  - Saved Addresses: No Saved Addresses with the existing manual Add Address recovery path.
- Keeps the existing Home next-page search behavior when another authoritative server page is available, so the app does not falsely declare a final no-results state while more data can still be requested.
- Keeps lifecycle-contract-blocked Orders tabs honest rather than replacing them with fabricated emptiness.
- Preserves the canonical zero-item View Cart rule. Empty Cart does not create a second cart visibility state or override the shared route policy.
- Adds focused unit coverage for all eight state models, contextual origins/actions, exact search-query preservation, optional location/offline actions, and connectivity edge behavior.
- Backend/APIM/infrastructure source remains unchanged.

## Exact contract and runtime boundaries

P78 deliberately does not fabricate data or platform capability to make the composite reference look complete:

- Favorites host activation remains blocked by the exact Favorites contract gaps inherited from P60/P61. The P78 No Favorites adapter is ready, but the app does not claim that an unavailable Favorites service returned an empty list.
- Coupons host activation remains blocked by P70/P71 because authoritative offers/eligibility/apply/remove/reprice contracts are absent. The P78 No Coupons adapter is ready but is not backed by invented coupon data.
- Reviews host activation remains blocked by P72/P73 because customer review list/readiness/write contracts are absent. The P78 No Reviews adapter is ready but is not backed by invented review data.
- `Use current location` is not exposed from the live Saved Addresses host because P67's native current-location/geocode integration is still unavailable. The adapter exposes that action only when a future host has approved permission handling.
- The current mobile dependency/runtime stack does not expose an approved live connectivity event source. P78 therefore implements source-agnostic `OFFLINE -> ONLINE` recovery semantics without adding an unapproved native dependency or polling loop. Automatic reconnect sensing is not claimed.
- Runtime Android visual/interaction comparison against the actual Guide Reference 37 asset remains outstanding. No pixel-perfect/device-certified claim is made from source and CI alone.

## Acceptance mapping

- **Correct contextual CTA(s) and origin route:** implemented in the shared eight-state models and in the authoritative Cart, Orders, Home Search, Offline, and Addresses hosts. Contract-blocked Favorites/Reviews/Coupons remain adapters only rather than fabricated runtime emptiness.
- **Search query preserved:** implemented; the exact applied query is stored/displayed and clear/browse recovery remains contextual.
- **Connectivity recovery has no retry loop:** implemented as an explicit recovery edge (`OFFLINE -> ONLINE`) with no repeated same-state trigger. A live approved connectivity event source is still required for full runtime auto-recovery.
- **Empty cart removes View Cart globally:** preserved through the existing canonical shared cart visibility rule (`itemCount > 0`), with no parallel P78 cart state.

## Validation

Validated mobile code head: `3e3a1c9926c449473fc8bf96a64c731c2b7db025`.

- Workflow run `31299091228`, job `93208855335` — SUCCESS.
- Dependency install — SUCCESS.
- TypeScript strict check — SUCCESS.
- ESLint — SUCCESS.
- Jest — SUCCESS.
- Production Android JavaScript bundle — SUCCESS.
- Backend/APIM/infrastructure source guard — SUCCESS.
- No Gradle/APK packaging was performed, consistent with implementation-phase build policy.

## Completion boundary

P78 remains PARTIAL until the missing approved connectivity/runtime integration and contract-blocked host capabilities are available where required, and the actual Android implementation is visually/interaction-certified against Guide Reference 37.

## Handoff

- Current executed phase: P78 — PARTIAL at exact contract-backed scope.
- Validated mobile code head: `3e3a1c9926c449473fc8bf96a64c731c2b7db025`.
- Evidence: `docs/mobile-ui-rebuild/P78_CUSTOMER_EMPTY_SEARCH_OFFLINE_NO_DATA_SYSTEM.md`.
- CI: run `31299091228`, job `93208855335` — SUCCESS.
- Next phase in sequence: P79 — Customer Cross-Screen Reconciliation Audit.
- P79 authorization: none; stop after P78.
