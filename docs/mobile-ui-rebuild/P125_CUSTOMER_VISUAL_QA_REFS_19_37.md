# P125 — Customer Visual QA Refs 19–37

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P125 only  
**Status:** **PARTIAL — deterministic visual-QA preflight/evidence complete; live device/emulator comparison pending**  
**Starting HEAD:** `40f264e7ec77b4847097b1696e716d0c9c992c55`  
**Corrected mapping head:** `32c61f6cdc08cb8407a6893f21fc96bf209554e8`

## Authority and phase boundary

P125 was selected only after reconciling `plan.md`, `phases.md`, `agent.md`, `build.md`, the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`, the P124 evidence, and the current production implementation on the target branch.

`phases.md` defines P125 as the device/emulator visual comparison for customer references 19–37, with acceptance requiring both active/empty cart variants and all eight Reference 37 states to be verified. The 183-page guide is authoritative for the reference index: refs 27/28 are Payment Methods, refs 29/30 Coupons and Offers, refs 31/32 My Reviews, refs 33/34 Customer Settings, refs 35/36 Help and Support, and ref 37 is the composite customer empty/search/offline/no-data collection.

P124 remains only partially certified because live reference-image comparison was not available in the execution environment; that limitation does not authorize skipping P125 or claiming a visual pass from source inspection.

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
| 27 | Payment Methods — Empty Cart | `src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 28 | Payment Methods — Active Cart | `src/features/payment/screens/CustomerPaymentMethodsRouteScreen.tsx` | partial-capability | pending-device-comparison |
| 29 | Coupons and Offers — Empty Cart | no production module | blocked-contract | pending-device-comparison |
| 30 | Coupons and Offers — Active Cart | no production module | blocked-contract | pending-device-comparison |
| 31 | My Reviews — Empty Cart | no production module | blocked-contract | pending-device-comparison |
| 32 | My Reviews — Active Cart | no production module | blocked-contract | pending-device-comparison |
| 33 | Customer Settings — Empty Cart | `src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx` | implemented | pending-device-comparison |
| 34 | Customer Settings — Active Cart | `src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx` | implemented | pending-device-comparison |
| 35 | Help and Support — Empty Cart | no production module | blocked-contract | pending-device-comparison |
| 36 | Help and Support — Active Cart | no production module | blocked-contract | pending-device-comparison |
| 37 | Customer Empty/Search/Offline/No-Data States Collection | `src/features/customerEmptyStates/components/CustomerEmptyState.tsx` + context hosts | partial-capability | pending-device-comparison |

The blocked rows are intentional and inherited from earlier exact-contract audits. Coupons/offers, customer reviews, and Help/Support do not have an approved production mobile contract/surface at the current branch boundary. P125 does not create placeholder screens merely to make the matrix appear complete.

## Active/empty cart pair preflight

The deterministic test locks the required paired lifecycle variants to a single implementation boundary:

- Favorites: refs 19/20;
- Notifications: refs 21/22;
- Edit Customer Profile: refs 24/23 (empty/active ordering normalized in the test);
- My Addresses: refs 25/26;
- Payment Methods: refs 27/28;
- Coupons and Offers: refs 29/30, both contract-blocked rather than fabricated;
- My Reviews: refs 31/32, both contract-blocked rather than fabricated;
- Customer Settings: refs 33/34;
- Help and Support: refs 35/36, both contract-blocked rather than fabricated.

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

The shared `CustomerEmptyState` system and context adapters exist for all eight. Runtime host activation remains intentionally partial where the underlying domain is blocked. The guide additionally requires connectivity recovery for No Internet without a retry loop, query preservation for No Search Results, contextual recovery routes for No Orders/Favorites/Reviews/Coupons, and global View Cart removal for Empty Cart. P125 does not synthesize missing production domains solely for visual certification.

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

## Deterministic guard added and corrected

`apps/mobile/__tests__/visual/P125CustomerVisualQATargets.test.ts` verifies:

- refs 19–37 are represented exactly once and in sequence;
- the ref names and image numbers align to the authoritative 183-page guide;
- all active/empty cart pairs remain on one implementation/capability boundary;
- contract-blocked refs 29, 30, 31, 32, 35, and 36 have no invented production module path;
- all non-blocked targets are pinned to an existing reviewed implementation path;
- all eight Reference 37 states are locked;
- no target can be represented as visually certified by this preflight;
- the complete visual comparison dimension set remains explicit.

The first P125 matrix had an incorrect ref-27-through-ref-36 shift inherited from a non-authoritative interpretation. Commit `32c61f6cdc08cb8407a6893f21fc96bf209554e8` corrected the test to the full 183-page guide index. This evidence document now matches that correction.

The test is a deterministic source-level QA guard only. It is **not** a substitute for screenshot comparison.

## Why P125 remains PARTIAL

P125 cannot truthfully satisfy the device/emulator comparison acceptance gate in this execution environment because no live Android render/reference screenshot-comparison channel is available here. In addition, refs 29–32 and 35–36 cannot be visually certified as production experiences until their earlier contract/product blockers are resolved and real routes exist.

Therefore this phase records the maximum safe executable/preflight work without producing false visual-certification claims.

## Files changed in P125

- `apps/mobile/__tests__/visual/P125CustomerVisualQATargets.test.ts`
- `docs/mobile-ui-rebuild/P125_CUSTOMER_VISUAL_QA_REFS_19_37.md`

No customer production screen, backend, APIM, OpenAPI, database, infrastructure, Chef surface, Android native source, Gradle, APK, or AAB configuration is changed by P125.

## Validation boundary

The deterministic Jest preflight is part of the repository test suite. Live device/emulator visual comparison is not available in this execution environment and is not claimed. The corrected reference mapping is source-verified against the authoritative 183-page guide index.

## Handoff

P125 is the only phase executed. It is **PARTIAL / QA PENDING** pending live Android/reference comparison and the inherited production-capability blockers described above.

**P126 — Chef Visual QA Refs 2,4,38–52 is NOT STARTED and was not touched.**
