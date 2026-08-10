# P125 — Customer Visual QA Refs 19–37

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P125 only  
**Status:** **PARTIAL — deterministic visual-QA preflight/evidence complete; live device/emulator comparison pending**  
**Starting HEAD:** `40f264e7ec77b4847097b1696e716d0c9c992c55`

## Authority and phase boundary

P125 was selected only after reconciling `plan.md`, `phases.md`, `agent.md`, `build.md`, the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, the P124 evidence, and the current production implementation on the target branch.

`phases.md` defines P125 as the device/emulator visual comparison for customer references 19–37, with acceptance requiring both active/empty cart variants and all eight Reference 37 states to be verified. P124 remains only partially certified because live reference-image comparison was not available in the execution environment; that limitation does not authorize skipping P125 or claiming a visual pass from source inspection.

This phase does **not** start P126.

## Deterministic QA target matrix

| Ref | Reference state | Current implementation target | Capability state | Visual certification |
|---:|---|---|---|---|
| 19 | Favorites — Empty Cart | `src/features/favorites/screens/CustomerFavoritesScreen.tsx` | partial-capability | pending-device-comparison |
| 20 | Favorites — Active Cart | `src/features/favorites/screens/CustomerFavoritesScreen.tsx` | partial-capability | pending-device-comparison |
| 21 | Notifications — Empty Cart | `src/features/notifications/screens/CustomerNotificationsScreen.tsx` | partial-capability | pending-device-comparison |
| 22 | Notifications — Active Cart | `src/features/notifications/screens/CustomerNotificationsScreen.tsx` | partial-capability | pending-device-comparison |
| 23 | Edit Customer Profile — Active Cart | `src/features/customerProfile/screens/CustomerProfileEditRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 24 | Edit Customer Profile — Empty Cart | `src/features/customerProfile/screens/CustomerProfileEditRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 25 | My Addresses — Empty Cart | `src/features/customerAddresses/screens/CustomerAddressesRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 26 | My Addresses — Active Cart | `src/features/customerAddresses/screens/CustomerAddressesRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 27 | Add New Address — Empty Cart | `src/features/customerAddresses/screens/CustomerAddressEditorModal.tsx` | partial-capability | pending-device-comparison |
| 28 | Payment Methods — Empty Cart | `src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 29 | Payment Methods — Active Cart | `src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 30 | Add New Card — Empty Cart | no production module | blocked-provider | pending-device-comparison |
| 31 | My Coupons — Empty Cart | no production module | blocked-contract | pending-device-comparison |
| 32 | My Coupons — Active Cart | no production module | blocked-contract | pending-device-comparison |
| 33 | My Reviews — Empty Cart | no production module | blocked-contract | pending-device-comparison |
| 34 | My Reviews — Active Cart | no production module | blocked-contract | pending-device-comparison |
| 35 | Settings — Empty Cart | `src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx` | implemented | pending-device-comparison |
| 36 | Settings — Active Cart | `src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx` | implemented | pending-device-comparison |
| 37 | Customer Empty/Search/Offline/No-Data States Collection | `src/features/customerEmptyStates/components/CustomerEmptyState.tsx` + context hosts | partial-capability | pending-device-comparison |

The blocked rows are intentional and inherited from earlier exact-contract/provider audits. P69 found no approved tokenized-payment-method contract or native provider SDK for Add New Card. P70/P71 found no authoritative coupons/offers contracts. P72/P73 found no authoritative customer review list/write contracts. P125 does not create placeholder screens merely to make the matrix appear complete.

## Active/empty cart pair preflight

The deterministic test locks the required paired lifecycle variants to a single implementation boundary:

- Favorites: refs 19/20;
- Notifications: refs 21/22;
- Edit Customer Profile: refs 24/23 (empty/active ordering normalized in the test);
- My Addresses: refs 25/26;
- Payment Methods: refs 28/29;
- My Coupons: refs 31/32, both contract-blocked rather than fabricated;
- My Reviews: refs 33/34, both contract-blocked rather than fabricated;
- Settings: refs 35/36.

This prevents a later QA pass from accidentally certifying separate active/empty screen implementations or a blocked placeholder as production truth.

## Reference 37 acceptance matrix

P125 locks all eight required Reference 37 states from the master guide and P78:

1. Empty cart
2. No orders
3. No search results
4. No favorites
5. No internet
6. No saved addresses
7. No reviews
8. No coupons

The shared `CustomerEmptyState` system and context adapters exist for all eight. Runtime host activation remains intentionally partial where the underlying domain is blocked: Favorites, Reviews, and Coupons. P78 also records that automatic connectivity recovery still lacks an approved live connectivity event source. These are capability blockers, not reasons to synthesize fake visual states.

## Required live comparison dimensions

When an Android device/emulator and the authoritative guide assets are available, every available P125 target must be compared for:

- safe area;
- hierarchy;
- typography;
- colors;
- spacing;
- radii;
- icons;
- image crops;
- vertical rhythm;
- overlays and active-cart clearance.

Any deviation must be fixed or explicitly accepted before the target can move from `pending-device-comparison` to visually certified.

## Deterministic guard added

`apps/mobile/__tests__/visual/P125CustomerVisualQATargets.test.ts` now verifies:

- refs 19–37 are represented exactly once and in sequence;
- all active/empty cart pairs remain on one implementation/capability boundary;
- blocked refs 30–34 have no invented production module path;
- all non-blocked targets are pinned to an existing reviewed implementation path;
- all eight Reference 37 states are locked;
- no target can be represented as visually certified by this preflight;
- the complete visual comparison dimension set remains explicit.

The test is a deterministic source-level QA guard only. It is **not** a substitute for screenshot comparison.

## Why P125 remains PARTIAL

P125 cannot truthfully satisfy the device/emulator comparison acceptance gate in this execution environment because no live Android render/reference screenshot-comparison channel is available here. In addition, refs 30–34 cannot be visually certified as production experiences until their earlier contract/provider blockers are resolved and real routes exist.

Therefore this phase records the maximum safe executable/preflight work without producing false visual-certification claims.

## Files changed

- `apps/mobile/__tests__/visual/P125CustomerVisualQATargets.test.ts`
- `docs/mobile-ui-rebuild/P125_CUSTOMER_VISUAL_QA_REFS_19_37.md`

No customer production screen, backend, APIM, OpenAPI, database, infrastructure, Chef surface, Android native source, Gradle, APK, or AAB configuration is changed by P125.

## Validation boundary

The new Jest test has been added to the repository test suite. A live device/emulator visual run and reference screenshot comparison were not available in this session, so they are not claimed as passed. No GitHub Actions run is intentionally triggered by this phase execution.

## Handoff

P125 is the only phase executed. It is **PARTIAL** pending live Android/reference comparison and the inherited production-capability blockers described above.

**P126 — Chef Visual QA Refs 2,4,38–52 is NOT STARTED and was not touched.**
