# P75 — Customer Settings Child Flows

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase:** P75 only  
**Status:** **PARTIAL — implemented to the exact contract-backed boundary; required production capabilities that do not exist in the repository remain explicit blockers.**

## 1. Scope reviewed

P75 was executed after reading the controlling rebuild documents (`plan.md`, `phases.md`, `agent.md`, `build.md`) and the full `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` Settings requirements. P74 was already DONE at its authorized code/CI scope, so this phase did not redo P74 and did not advance into P76.

P75 owns the Settings child-flow surface for:

- notification preferences;
- privacy/security;
- password change;
- language;
- appearance;
- About;
- Share;
- Referral;
- Membership/Subscription;
- Legal/Terms/Privacy;
- the Settings-to-Support boundary.

## 2. Contract audit

The current repository contracts were checked before adding behavior.

### Available and used

- Firebase email/password authentication is already the approved credential provider in the mobile app.
- Existing Craves logout/revoke coordination is available through `completeLogout`.
- React Native native sharing is available through `Share.share`.
- The established customer location selector remains the real location child action on the Settings parent.

### Not available

The current backend/mobile runtime does **not** expose an approved production contract for:

- authenticated customer notification-preference read/write;
- segmented push/email/SMS subscription mutation;
- app-wide locale/i18n preference application;
- app-wide dynamic theme preference application;
- list/revoke other authenticated devices or sessions;
- customer referral code/reward/eligibility;
- customer membership/plan/entitlement management from the mobile client;
- trusted runtime Terms/Privacy content destinations;
- trusted customer support content/contact destination owned by P76/P77;
- runtime app version/build metadata adapter.

No endpoint, URL, pricing, referral code, session row, legal content, or successful support action was invented.

## 3. Implementation

### Typed child routes

`CustomerSettingsChildStackParamList` now registers:

- `CustomerSettingsNotifications`
- `CustomerSettingsPrivacySecurity`
- `CustomerSettingsChangePassword`
- `CustomerSettingsLanguage`
- `CustomerSettingsAppearance`
- `CustomerSettingsAbout`
- `CustomerSettingsShare`
- `CustomerSettingsReferral`
- `CustomerSettingsSupport`
- `CustomerSettingsSubscription`
- `CustomerSettingsLegal`

All routes are registered inside the existing customer Profile stack. No parallel navigator/container was introduced.

### Settings parent integration

The P74 parent Settings route now opens the typed P75 children rather than showing P74 placeholder alerts or maintaining fake local production settings. The established location selector, account summary, notification/cart header state, cart navigation, and real logout behavior remain intact.

### Real password mutation

`firebaseAuth.changePassword` now:

1. requires an active Firebase email/password user;
2. constructs an email credential from the current password;
3. re-authenticates the current Firebase user;
4. updates the Firebase password;
5. refreshes the ID token after the credential change.

The Change Password screen includes current/new/confirm fields, validation, loading/disabled state, recoverable error copy, secure text entry, and success navigation.

### Privacy/security

The Privacy & Security child exposes:

- Change Password through the real Firebase mutation above;
- Sign out this device through the existing `completeLogout` session coordinator.

Other-device/session management stays disabled because no list/revoke-other-session contract exists.

### Share

Share Craves uses the native React Native share sheet. No referral link or server-issued code is synthesized.

### Capability-gated children

Notification preferences, Language, Appearance, Referral, Membership, Legal, About build metadata, and Support render explicit unavailable-capability states where their production contract/runtime layer is absent. Notification channel rows remain separated rather than collapsing push/email/SMS into a local boolean that would diverge from backend delivery state.

Support is intentionally only a P75 route boundary. P76 Help and Support — Empty Cart was **not** implemented.

## 4. Explicit blockers

- `CUSTOMER_NOTIFICATION_PREFERENCES_CONTRACT_UNAVAILABLE`
- `CUSTOMER_APP_LANGUAGE_RUNTIME_CONTRACT_UNAVAILABLE`
- `CUSTOMER_APP_THEME_RUNTIME_CONTRACT_UNAVAILABLE`
- `CUSTOMER_DEVICE_SESSION_LIST_REVOKE_CONTRACT_UNAVAILABLE`
- `CUSTOMER_REFERRAL_CONTRACT_UNAVAILABLE`
- `CUSTOMER_MEMBERSHIP_MOBILE_CONTRACT_UNAVAILABLE`
- `CUSTOMER_LEGAL_CONTENT_DESTINATION_UNAVAILABLE`
- `CUSTOMER_SUPPORT_DESTINATION_UNAVAILABLE`
- `CUSTOMER_RUNTIME_BUILD_METADATA_UNAVAILABLE`

These blockers prevent P75 from being marked fully DONE against the guide’s production acceptance requirements.

## 5. Files changed

- `apps/mobile/src/features/customerSettings/domain/customerSettingsChildModel.ts`
- `apps/mobile/src/features/customerSettings/domain/customerSettingsChildModel.test.ts`
- `apps/mobile/src/features/customerSettings/screens/CustomerSettingsChildScreens.tsx`
- `apps/mobile/src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx`
- `apps/mobile/src/features/auth/firebase/firebaseAuth.ts`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/CustomerRootNavigator.tsx`

## 6. Validation

GitHub Actions mobile implementation run `31287591983`, job `93179133618`, was triggered for mobile head `f5be75bef913d33492dc872af325f9a51d692f39`.

At evidence creation time:

- dependency install: PASS;
- TypeScript strict check: PASS;
- ESLint: PASS;
- Jest: in progress;
- production Android JavaScript bundle: pending;
- backend/APIM/infrastructure source guard: pending.

The final ledger must record the completed outcome before this phase is handed off as validated.

No APK/AAB was produced. Physical Android/reference-image certification remains a later visual-QA gate and is not claimed by this phase.

## 7. Phase boundary

P75 stops here. **P76 — Help and Support — Empty Cart has not been started.**
