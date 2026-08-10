# P124 — Customer Visual QA Refs 1–18

## Scope

P124 is the customer visual-certification phase defined in `phases.md`:

- compare refs **1, 3, 5–18** on a real Android device/emulator;
- compare customer authentication states;
- inspect **safe-area, hierarchy, typography, colors, spacing, radii, icons, crops, vertical rhythm, and overlays**;
- fix deviations only when they are established by reference comparison, or record an explicit approval.

The authoritative visual source remains `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` / the 52 embedded source references. Runtime architecture and API contracts remain authoritative for integration behavior.

## Starting evidence

- Branch: `mobile-ui-rebuild-from-scratch`
- P124 starting head: `515a440c627e0e9014bfb3147dc8a6228ac9e8b6`
- P123 at that head: **PARTIAL at full device/native E2E scope**, with deterministic supportable critical-journey coverage already recorded.
- P124 phase definition: refs 1, 3, 5–18; device/emulator screenshot comparison.
- P125 is outside this execution and remains untouched.

## Reference-to-runtime capture matrix

| Ref | Source image | Required reference state | Current runtime implementation | P124 status |
|---:|---|---|---|---|
| 1 | `image1.jpeg` | Customer Phone Number Sign-In | `apps/mobile/src/features/auth/screens/PhoneSignInScreen.tsx` | Pending device/emulator comparison |
| 3 | `image3.jpeg` | Customer Email and Password Sign-In | `apps/mobile/src/features/auth/screens/EmailSignInScreen.tsx` | Pending device/emulator comparison |
| 5 | `image5.jpeg` | Customer Home — Empty Cart | `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx` | Pending device/emulator comparison |
| 6 | `image6.jpeg` | Customer Home — Active Cart | `apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx` | Pending device/emulator comparison |
| 7 | `image7.jpeg` | Discover Home Chefs — Empty Cart | `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx` | Pending device/emulator comparison |
| 8 | `image8.jpeg` | Discover Home Chefs — Active Cart | `apps/mobile/src/features/chefDiscovery/screens/DiscoverHomeChefsScreen.tsx` | Pending device/emulator comparison |
| 9 | `image9.jpeg` | My Orders — Empty Cart | `apps/mobile/src/features/customerOrders/screens/CustomerOrdersScreen.tsx` | Pending device/emulator comparison |
| 10 | `image10.jpeg` | My Orders — Active Cart | `apps/mobile/src/features/customerOrders/screens/CustomerOrdersScreen.tsx` | Pending device/emulator comparison |
| 11 | `image11.jpeg` | Customer Profile — Empty Cart | `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx` | Pending device/emulator comparison |
| 12 | `image12.jpeg` | Customer Profile — Active Cart | `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx` | Pending device/emulator comparison |
| 13 | `image13.jpeg` | Dish Detail | `apps/mobile/src/features/dishDetail/screens/CustomerDishDetailScreen.tsx` | Pending device/emulator comparison |
| 14 | `image14.jpeg` | Dish Ingredients | `apps/mobile/src/features/dishDetail/screens/CustomerDishIngredientsScreen.tsx` | Pending device/emulator comparison |
| 15 | `image15.jpeg` | Customer Kitchen Profile | `apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx` | Pending device/emulator comparison |
| 16 | `image16.jpeg` | Customer Kitchen All Dishes | `apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenDishesScreen.tsx` | Pending device/emulator comparison |
| 17 | `image17.jpeg` | Customer Filter and Sort | `apps/mobile/src/features/discoveryFilters/screens/CustomerFilterSortScreen.tsx` | Pending device/emulator comparison |
| 18 | `image18.jpeg` | Customer Cart | `apps/mobile/src/features/cart/screens/CustomerCartScreen.tsx` | Pending device/emulator comparison |

## Deterministic P124 preflight added

`apps/mobile/__tests__/visual/P124CustomerVisualQATargets.test.ts` now guards the QA matrix before any visual pass can be claimed. Repository inspection established that the mapped modules above are the current customer implementations, and the guard:

1. locks the P124 set to exactly refs `1, 3, 5–18`;
2. locks each reference to the reviewed current customer implementation module path;
3. keeps refs `5/6`, `7/8`, `9/10`, and `11/12` as state variants of the same implementation instead of duplicate static screens;
4. keeps customer auth refs `1` and `3` classified as authenticated-chrome-hidden states;
5. keeps every target explicitly `pending-device-comparison` so deterministic coverage cannot be mistaken for a pixel/visual pass;
6. locks the comparison dimensions to the P124 acceptance list from `phases.md`.

Commit history for the preflight:

- initial guard: `53527c88c003172bfba0cef6f8b70b7cd6935132`;
- CI run **#474 / ID `31383219128`** correctly rejected that first version at TypeScript strict check because the mobile TypeScript environment does not expose Node `fs/path/__dirname` types;
- corrected mobile-environment-safe guard: `0527a5a382dfb8b820b5168320c6449a030cfb39`;
- corrected guard validated successfully by **CRAVES Mobile Implementation CI #475 / ID `31383374630`**: dependency install, TypeScript strict check, ESLint, Jest, production Android JavaScript bundle, and backend/APIM/infrastructure source guard all passed.

The failed initial CI attempt is retained here as evidence rather than hidden; the corrected guard removes the Node-only dependency instead of widening the production TypeScript environment for a QA test.

## Device/emulator comparison protocol

For each row above, QA must render the exact reference state on representative **compact, standard, and large Android** device/emulator sizes, then compare the implementation beside the supplied reference. At minimum record:

- safe-area and system-gesture clearance;
- content hierarchy and vertical rhythm;
- typography family/style/weight/size/line-height and wrapping;
- Flame Red / Espresso Brown and supporting surface/semantic colors;
- spacing, padding, card gaps, radii, borders, and elevation;
- icon choice, size, alignment, selected state, and accessibility-safe placement;
- food/profile image aspect ratio, focal crop, clipping, and fallback behavior;
- bottom navigation, View Cart, sticky CTA, modal/sheet, and other overlays in the exact reference state.

A mismatch should be changed only after direct visual evidence establishes the deviation. The corrected screen must then be recaptured in the same state/device class. Approved intentional deviations must be recorded with the approver/change-control reference.

## Environment limitation and certification result

This GitHub/File-Library connector execution can inspect repository source and the guide's parsed reference index, but it **does not provide an Android emulator/device capture surface or usable bitmap extraction for the embedded reference images**. Therefore this run cannot honestly produce the side-by-side screenshot evidence required by P124 acceptance.

Consequences:

- No reference-backed visual mismatch was established, so no speculative product UI redesign/fix was made.
- No screen is marked pixel-perfect or visually passed from code inspection alone.
- The reference matrix and deterministic preflight are complete, committed, and CI validated.
- The actual device/emulator screenshot comparison remains an external QA dependency.
- **P124 status: PARTIAL / QA PENDING** until the required screenshots are captured, compared, and any deviations are fixed or explicitly approved.
- **P125: NOT STARTED.**

## Completion gate

P124 may move to `DONE` only when all 16 target rows have concrete device/emulator comparison evidence and every observed deviation is either:

1. fixed and recaptured successfully; or
2. explicitly approved and linked in the evidence record.
