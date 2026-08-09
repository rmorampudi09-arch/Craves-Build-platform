# P74 — Customer Settings Active/Empty Visuals

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Guide refs:** 33 and 34  
**Status:** **IMPLEMENTED — CI CHECK NOT AVAILABLE ON DIRECT BRANCH PUSH**

## Scope executed

P74 implements only the Customer Settings active-cart / empty-cart surface defined in `phases.md`. P75 Customer Settings child flows were not started.

Implemented:

- Typed `CustomerSettings` route inside the existing customer Profile stack.
- Explicit Settings entry point from the existing customer Profile surface.
- One shared Settings screen for both guide references 33 and 34.
- Account summary sourced from the approved customer-profile query contract: display name, email, masked registered phone state, and current browsing/saved-location label.
- Language, notifications, and appearance preference controls backed by per-identity AsyncStorage persistence rather than hard-coded success state.
- Existing saved-location selector reused for the Location row; no parallel location store or fabricated device-location permission flow was added.
- Notification bell reuses the current customer notification state and unread badge.
- Empty-cart header state keeps the cart action visible without a badge.
- Active-cart header state derives the badge count directly from the canonical cart selector and opens the existing `CustomerCart` route without clearing/replacing cart state.
- Settings hides the customer bottom tab bar while focused and restores it when leaving the route, matching the settings reference chrome.
- Terms & Conditions, Privacy Policy, and Get Support rows are present as required visual destinations but remain explicit unavailable-child alerts because their deeper routes are owned by P75/P76 and are not authorized in P74.
- About Craves exposes only local app information; it does not invent a backend/content contract.
- Logout reuses the established P24 `completeLogout` coordinator.
- Save Changes persists only P74-owned lightweight UI preferences for the authenticated identity.

## No-fabrication / phase boundary

P74 does not implement the deeper Settings child flows reserved for P75. In particular it does not invent:

- notification-preference backend mutations;
- privacy/security/account-management endpoints;
- password-change routes;
- legal-document/content endpoints;
- share/referral/subscription routes;
- app-wide theme/localization application rules that are not already established by the runtime.

The P74 settings values are device-local UI preferences scoped to the signed-in identity. Saved location uses the already established customer-shell location mechanism. Logout uses P24.

## Files owned/changed for P74

- `apps/mobile/src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`
- `apps/mobile/src/features/customerProfile/screens/CustomerProfileRouteScreen.tsx`
- `docs/mobile-ui-rebuild/P74_CUSTOMER_SETTINGS_ACTIVE_EMPTY_VISUALS.md`

No backend, APIM, OpenAPI, database, infrastructure, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P74.

## Validation status

The GitHub connector reported no pull-request workflow run and no commit-status checks for the direct branch implementation head at the time of the P74 checkpoint. Therefore this evidence does **not** claim CI success that did not run.

Static implementation checks performed against the branch contracts:

- route name added to `CustomerProfileStackParamList`;
- route registered in `CustomerRootNavigator`;
- Profile entry point navigates to the typed route;
- canonical cart selector drives active/empty cart badge state;
- cart action uses the existing `CustomerCart` route;
- account data uses `useCustomerProfileQuery`;
- location uses `useCustomerHeaderState` / `CustomerLocationSelector`;
- logout uses `completeLogout`;
- preferences use the already installed `@react-native-async-storage/async-storage` dependency;
- P75/P76 child flows remain unimplemented and explicitly blocked.

No Gradle/APK packaging was performed, consistent with the implementation-phase policy.

## Handoff

```text
Executed phase: P74 — Customer Settings Active/Empty Visuals
Implemented: Settings route; account summary; persisted language/notification/appearance values; existing location selector; notification badge; empty/active cart header states; real cart navigation; legal/about/support rows; P24 logout; Save Changes; hidden bottom nav
Validation: direct branch push has no associated PR workflow/status check in the connector, so CI success is not claimed
Deferred by phase boundary: P75 Customer Settings Child Flows; P76/P77 Help and Support flows
Next phase: P75 — Customer Settings Child Flows — NOT STARTED
Authorization for P75: NONE
```
