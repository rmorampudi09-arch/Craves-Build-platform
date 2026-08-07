# P26 — Customer Bottom-Nav Scroll Hide/Reveal Evidence

**Phase:** P26 — Customer Bottom-Nav Scroll Hide/Reveal  
**Status:** DONE at implementation/static-navigation level  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Started from commit:** `bcbbcac31ebe8857bfc7f7e5af0c80a9ddf98443`  
**Initial implementation commit:** `3aa720d9d9543a6a45bc6ef13085bcf087e01648`  
**Validated implementation commit:** `613a91be62722ae032ef9d4f9b9124702c8902bd`  
**CI run:** `31228012689` — SUCCESS

## Authoritative requirements used

P26 was implemented against:

- `agent.md` customer smart-UI and phase-discipline rules,
- `plan.md` Customer Bottom Navigation and scroll/restoration rules,
- `phases.md` P26 scope and acceptance criteria,
- `build.md` P25 accepted shell boundary,
- the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` navigation/smart-UI rules.

The guide requires Customer bottom navigation to:

- remain visible when a tab-root list is at the top,
- hide smoothly while scrolling downward,
- reappear while scrolling upward,
- reappear on tab changes and when returning to a tab root,
- preserve tab/list state rather than forcing a reset,
- avoid intercepting interaction while hidden,
- respect Android navigation/safe-area behavior,
- use restrained motion and respect the platform reduced-motion preference.

## Accepted implementation boundary

P26 adds one shared Customer bottom-navigation visibility mechanism inside the existing P25 Customer shell. It does not create a parallel navigator or product screen.

### Scroll-direction state machine

`customerBottomNavScroll.ts` provides the shared pure state machine used by Customer tab-root vertical lists.

Accepted behavior:

- top/Android overscroll resolves to visible navigation,
- deliberate accumulated downward travel hides the bar,
- deliberate accumulated upward travel reveals the bar,
- small scroll jitter does not flap visibility,
- direction changes establish a new threshold anchor,
- tab/root reveal does not reset the preserved list offset,
- invalid/non-finite offsets cannot corrupt visibility state.

The threshold logic is intentionally separate from presentation so Home, Chefs, Orders, and Profile can reuse one behavior instead of implementing separate per-screen scroll rules.

### Shared animated shell controller

`CustomerBottomNavController.tsx` owns the shell-level visibility state and animation.

Accepted behavior:

- reuses the P05 `bottomNavigation` motion definition,
- uses opacity/transform only and the native animation driver,
- uses the project `useReducedMotionPreference()` hook,
- reduced-motion mode changes visibility immediately without interpolation,
- hidden navigation sets `pointerEvents="none"`,
- hidden navigation is removed from the accessibility traversal,
- the actual tab-bar height is measured for the off-screen translation rather than replacing Android safe-area handling with a fixed tab height,
- the existing React Navigation `BottomTabBar` remains the actual tab UI.

### Tab/root return behavior

`CustomerRootNavigator.tsx` now wraps the existing P25 shell in `CustomerBottomNavVisibilityProvider` and uses the stable module-level `CustomerBottomTabBar` renderer.

Accepted behavior:

- tab focus reveals navigation,
- tab presses reveal navigation, including pressing the active tab while the bar is hidden,
- each current tab-root stack screen reveals navigation when it regains focus,
- P25 `lazy: true` and `popToTopOnBlur: false` behavior remains unchanged, so tab stacks remain preserved.

### Feed integration contract for later product-screen phases

`useCustomerBottomNavScroll()` is the single reusable vertical-scroll binding for later Customer tab-root `ScrollView` / `FlatList` / `FlashList` implementations. It supplies the shared `onScroll` behavior and `scrollEventThrottle: 16`, and reveals the nav on screen focus without resetting list position.

P26 deliberately does **not** fabricate a scrollable Home/Chefs/Orders/Profile feed just to demonstrate the animation. Those real product screens are owned by later phases and must attach this shared binding when their vertical root lists are introduced.

## Changed files

Validated implementation changes from P25 head to the P26 implementation commit are limited to:

- `apps/mobile/src/app/navigation/CustomerBottomNavController.tsx` — added shared provider, animated tab renderer, reusable scroll binding, reduced-motion behavior.
- `apps/mobile/src/app/navigation/customerBottomNavScroll.ts` — added pure direction/threshold visibility state machine.
- `apps/mobile/src/app/navigation/customerBottomNavScroll.test.ts` — added focused P26 behavior coverage.
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx` — wired the P26 provider/tab renderer and reveal-on-tab/root-focus behavior into the existing P25 shell.
- `apps/mobile/src/app/navigation/customerTabs.ts` — updated ownership comment; preserved P25 stack-state options unchanged.

No backend service, APIM/OpenAPI definition, infrastructure, database, Android native build configuration, cart domain, View Cart behavior, P27 header/location/notification behavior, or later Customer product screen was changed.

## API / contract impact

**None.** P26 is a Customer navigation-shell interaction phase and uses no new backend/APIM contract.

## Focused tests

`customerBottomNavScroll.test.ts` covers:

1. visible state at top and during negative Android overscroll,
2. accumulated downward travel hides the bar,
3. accumulated upward travel reveals the bar,
4. tiny jitter does not flap visibility,
5. tab/root reveal preserves the prior scroll offset,
6. non-finite offsets are safely ignored.

Existing P25 customer-tab/navigation tests and all prior regression tests remain in the complete Jest suite.

## CI evidence

Workflow: `.github/workflows/mobile-phase1-ci.yml`  
Run: `31228012689`  
Head SHA: `613a91be62722ae032ef9d4f9b9124702c8902bd`  
Conclusion: **SUCCESS**

Successful gates:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including the new P26 direction/threshold tests and prior regressions,
7. production Android JavaScript bundle generation,
8. backend/APIM/infrastructure source-change guard.

No APK/Gradle packaging was run, per the implementation-phase build policy.

## Visual/device QA

Final physical-device/reference certification remains deferred to the later visual QA phases. P26 is accepted at implementation/static-navigation level; no pixel-perfect claim is made here.

## Explicitly not included

P26 does not implement:

- P27 shared Customer header/location/notification badge,
- P28 cart domain,
- P29 View Cart overlay,
- Customer Home/Discovery/Orders/Profile product screens,
- Chef bottom-navigation behavior,
- final device/reference visual certification,
- final APK/AAB packaging.

## Next phase

**P27 — Shared Customer Header/Location/Notification Badge** is next in sequence and is **not authorized** by this evidence record.
