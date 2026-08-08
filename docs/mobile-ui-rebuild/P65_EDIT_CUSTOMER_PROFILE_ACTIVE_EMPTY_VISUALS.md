# P65 — Edit Customer Profile Active/Empty Visuals

## Status

**PARTIAL** at implementation/static-contract scope. Physical Android/reference-image certification is deferred to the later visual-QA phases, and several guide-visible profile capabilities remain blocked by missing approved backend contracts.

## Authorization and scope

This record covers only **P65 — Edit Customer Profile Active/Empty Visuals** for guide references **23 and 24**. It does not start P66.

P65 acceptance in `phases.md`:

- Both reference variants use one shared route/form.
- Active cart remains synchronized/preserved.
- Successful save refreshes profile/header identity surfaces.

## Guide requirements checked

Authoritative guide: full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`.

Reference 23 requires the shared Edit Profile route with active cart state, including the conditional View Cart control, unsaved-change protection, changed-field save semantics where supported, secure account actions, and synchronized cart state.

Reference 24 is the same Edit Profile route with an empty cart; View Cart must be absent while profile save/back behavior remains identical. Successful save must refresh the profile hub and header identity data.

## Existing P64/P65 implementation audited

The current branch already contained the P64 domain/form and P65 route work when this phase was authorized. P65 was completed by auditing and accepting the existing shared implementation rather than creating a duplicate screen.

Implemented ownership:

- `CustomerProfileEditScreen` owns the shared edit form and lifecycle states.
- `CustomerProfileEditRouteScreen` owns active/empty cart chrome only.
- `CustomerProfileEdit` is registered once in the existing Profile stack.
- Profile `Edit Profile` opens the real shared route.
- `SharedViewCartOverlay` is reused rather than copied.
- Cart count/subtotal come from the authoritative cart selectors.
- `isViewCartOverlayVisible` applies the existing route policy.
- Dynamic content clearance is added only while View Cart is visible.
- `CustomerCart` remains the real cart destination.
- The profile update mutation writes the returned profile into the shared profile query and invalidates the profile query after success so profile/header identity surfaces revalidate.
- Empty-cart state uses the same route and automatically removes View Cart when item count reaches zero.

## Exact accepted profile contract boundary

P65 does not add or invent any backend/APIM contract. It reuses the exact P64/P57 customer profile boundary already present on the branch.

Supported profile update behavior is limited to the approved customer-profile read/update contract already mapped by the mobile feature. The current update contract is a full PUT-style request for supported identity fields, so the client does **not** fabricate partial PATCH semantics.

Still unavailable from the approved repository contract and therefore not falsely implemented as successful production actions:

- profile photo upload/remove;
- rewards balance/history capability needed by the reference;
- dedicated password-management route/contract from this profile surface;
- login-device list/revoke capability;
- protected account-deletion initiation/verification flow.

Those remain explicit blockers for full reference completion.

## Focused coverage

`customerProfileEditVisuals.test.ts` verifies:

- active cart makes View Cart eligible on `CustomerProfileEdit`;
- active state gets the shared bottom clearance;
- zero-item state removes View Cart and the extra clearance;
- both references use the same standard customer route policy rather than separate active/empty routes.

The existing P64 tests continue to cover draft/original state, dirty-field detection, validation, save planning, server-validation mapping, API update mapping, query-cache behavior, and unsaved-change rules.

## Acceptance result

- **One shared route/form for refs 23/24: PASSED.**
- **Active cart synchronization/preservation: PASSED at implemented client scope.** The edit route only reads cart selectors and never creates, replaces, or clears cart state.
- **Successful save refreshes profile/header identity surfaces: PASSED at implemented client/query-cache scope.** The update mutation writes the returned profile and invalidates the shared profile query.
- **Full visual/reference completion: NOT CERTIFIED.** Device/reference comparison remains deferred.
- **All guide-visible profile capabilities end-to-end: BLOCKED/PARTIAL.** Missing approved photo/rewards/security/device/delete-account contracts are not fabricated.

## Files already forming the accepted P65 implementation

- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileScreen.tsx`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileEditScreen.tsx`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileEditRouteScreen.tsx`
- `apps/mobile/src/features/customerProfile/query/customerProfileQueries.ts`
- `apps/mobile/src/features/customerProfile/customerProfileEditVisuals.test.ts`

P64-owned form/API modules remain prerequisites and are not reclassified as new P65 work.

## Validation posture

No APK/Gradle release build is required for this phase. The project policy requires the implementation CI gates (dependency install, strict TypeScript, ESLint, Jest, production Android JS bundle, backend/APIM guard). CI evidence should be attached to the P65 ledger entry when the workflow run for the accepted P65 head is available.

## Handoff

P65 is the only phase handled here. **Do not start P66 without explicit user authorization.**
