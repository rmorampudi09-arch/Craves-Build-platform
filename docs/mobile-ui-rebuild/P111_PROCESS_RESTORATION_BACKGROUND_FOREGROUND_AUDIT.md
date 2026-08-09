# P111 — Process Restoration and Background/Foreground Audit Evidence

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase start:** `e2ae2805eb72f35135b1580d6ef6e1cfbc9bb7c6`  
**Initial implementation head:** `a2422e615a8d574fcc273ebd3f3f4104ee4d89b8`  
**Final runtime hardening head:** `ae90152e0d715dc41785a53957733c9c90d6c663`  
**Status:** PARTIAL at full device/product-lifecycle scope; the safe restoration/session/provider boundary is implemented and audited at the exact currently approved mobile boundary.  
**Next phase:** P112 — Lifecycle-State Matrix Completion — NOT STARTED.

## Authorized scope

P111 is limited to the application-wide process restoration and background/foreground boundary described in `phases.md`:

- safe Customer/Chef root, selected-tab, and supported nested-route restoration;
- session restoration/refresh behavior across foreground/background transitions;
- active payment-provider flow protection;
- safe handling of draft-bearing screens.

P112 lifecycle-state matrix work was not started.

## Guide and repository inputs

Re-read before implementation:

- `agent.md`;
- `build.md`;
- `phases.md`;
- `plan.md`;
- the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`;
- P110 deep-link/notification evidence and current inbound-routing code;
- the current Customer and Chef navigator trees;
- auth bootstrap/session lifecycle/session manager/secure refresh-token storage boundaries;
- current Chef profile/menu draft behavior;
- checkout/payment handoff and payment recovery boundaries.

Guide requirements used here include preserving intended navigation/work where safe, keeping global route restoration distinct from local transient screen state, versioning persisted state, storing only approved non-sensitive state, keeping refresh credentials in secure storage, clearing private state on logout/role change, and exercising background/foreground/process-recreation behavior.

## Implemented restoration boundary

### Versioned minimal restoration contract

Added `processRestoration.ts` as a strict, versioned, role-scoped restoration policy instead of serializing raw React Navigation state.

The persisted shape can contain only:

- restoration schema version;
- authoritative product-role label (`CUSTOMER` or `CHEF`) used only as a match guard;
- an allowlisted Customer/Chef tab or supported nested route;
- bounded resource identifiers required by supported detail routes.

It cannot contain arbitrary navigation params, access/refresh tokens, payment credentials, Cashfree provider session data, full server responses, form values, or media payloads.

Customer restoration supports safe tab roots and registered non-draft screens such as dish/kitchen/order detail/tracking, cart/payment-method list entry, profile utility/settings destinations, favorites, addresses, and notifications. Chef restoration supports Dashboard/Menu/Analytics/Profile tab roots, Chef order-state tabs, safe profile children, Chef Order Detail, and read-only Menu Item Detail.

Mutable/draft-bearing routes intentionally collapse to their safe owning tab rather than serializing the draft:

- Customer Profile Edit / transient filter forms -> owning Customer tab;
- Chef Add/Edit Menu Item -> Chef Menu;
- Chef Edit Profile -> Chef Profile.

This preserves safe product context without pretending that unapproved sensitive/transient draft contents survived process death.

### Storage and invalid-state handling

Added `processRestorationStorage.ts` using the already-installed AsyncStorage dependency only for the non-sensitive allowlisted snapshot.

- Storage key is versioned: `@craves/process-restoration/v1`.
- Reads parse fail-closed; malformed/obsolete snapshots are deleted and startup continues safely.
- Writes re-validate before serialization.
- Customer tab/screen ownership is checked so a corrupted snapshot cannot navigate a Profile-only route through another Customer stack.
- No new dependency, backend route, APIM operation, or alternate navigation container was introduced.

### Root/role authority, navigator readiness, and deep-link precedence

`AppNavigator.tsx` now loads the safe restoration snapshot but does not use it to choose a product root.

- Existing backend account resolution remains the sole authority for Customer vs Chef ownership.
- Restoration waits until authentication/account resolution marks the product shell ready **and** the matching Customer/Chef navigator is actually registered.
- Chef restoration therefore does not settle during the existing `isolateChefRole` gate before `ChefProductNavigator` mounts.
- The same role-navigator readiness gate protects deferred P110 inbound links so a Chef cold-start link is not consumed before `ChefTabs` exists.
- A stored snapshot whose role differs from the authoritative resolved role is cleared rather than rendered.
- Anonymous/sign-out state clears persisted restoration state and resets the inbound-route dedupe cache.
- P110 cold-start deep links are checked before process restoration; a valid initial inbound destination wins instead of being overwritten by stale saved navigation.
- Restoration dispatches through the existing single `NavigationContainer` and existing nested navigators; no duplicate stack architecture was added.

This keeps the P111 acceptance boundary that persisted state can never select the wrong Customer/Chef root, and it prevents restoration/inbound work from being prematurely consumed while the role navigator is not yet mounted.

## Background/foreground and session audit

No replacement session subsystem was added because the existing implementation already owns the required lifecycle correctly:

- `useBootstrap` restores the session before rendering a product root.
- access tokens remain only in `tokenMemory`;
- refresh credentials remain in the existing secure refresh-token store;
- `sessionManager.refresh()` coalesces refresh attempts behind one in-flight promise;
- `useSessionLifecycle` pauses refresh timers while inactive/backgrounded;
- on foreground return it schedules from a still-fresh access token or immediately refreshes a stale token;
- terminal refresh failures sign out and therefore clear the P111 persisted navigation state through the AppNavigator anonymous-state guard.

P111 therefore integrates with this established ownership rather than introducing a second foreground/session mechanism.

## Provider-flow protection audit

The existing Cashfree mobile provider boundary remains fail-closed:

- native provider launch is explicitly blocked by `CASHFREE_NATIVE_PROVIDER_SDK_UNAVAILABLE`;
- native callback adaptation is explicitly blocked by `CASHFREE_NATIVE_PROVIDER_CALLBACK_UNAVAILABLE`;
- `CashfreeHostedHandoff` contains provider/session identifiers used only in memory by the existing handoff/recovery coordinators;
- payment recovery models an `APP_RESUME` trigger, but there is no approved active native provider flow to wire in this phase.

P111 does not persist the handoff, `paymentSessionId`, payment-order provider credentials, raw payment credentials, or transient payment-selection state. A future approved native provider integration must continue from this fail-closed rule rather than restoring provider secrets from AsyncStorage.

## Draft behavior

Current process-alive background/foreground behavior retains mounted local/in-memory drafts naturally, including the existing Chef Edit Profile draft provider. P111 deliberately does **not** persist full Customer/Chef form drafts across process death because the current drafts can contain contact, address, profile, or business/menu content and there is no approved retention/migration policy defining which fields are safe for AsyncStorage.

The implemented process-death behavior restores only the safe owner route/context and excludes those draft values. Full persisted form-draft restoration remains a product/security-policy gap, not something fabricated in this phase.

## Changed files

Production/runtime:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/processRestoration.ts`
- `apps/mobile/src/app/navigation/processRestorationStorage.ts`

Focused test source:

- `apps/mobile/src/app/navigation/processRestoration.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P111_PROCESS_RESTORATION_BACKGROUND_FOREGROUND_AUDIT.md`
- `build.md`

No backend, APIM, OpenAPI, infrastructure, payment-provider, native-provider, dependency, or unrelated screen file was changed.

## Focused regression source added

`processRestoration.test.ts` covers:

- Customer selected-tab + nested resource capture;
- Customer draft route collapsing without serializing contact/draft values;
- Chef mutable menu form collapsing without serializing draft/provider-looking values;
- Chef nested order-tab restoration payloads;
- role-mismatched persisted state rejection;
- extra payment/provider-shaped persisted fields rejection;
- malformed resource-param fallback.

## Validation / guard state

- The initial implementation boundary from phase start `e2ae2805eb72f35135b1580d6ef6e1cfbc9bb7c6` to `a2422e615a8d574fcc273ebd3f3f4104ee4d89b8` changes only the four intended mobile navigation/test files.
- Follow-up P111 review found and corrected the Chef isolation timing edge: final runtime hardening commit `ae90152e0d715dc41785a53957733c9c90d6c663` gates both restoration and deferred inbound routing on actual role-navigator registration.
- The current session lifecycle, secure refresh storage, Cashfree handoff/recovery blockers, Customer/Chef navigator ownership, and P110 initial-link routing were re-read against the new restoration boundary.
- GitHub Actions are intentionally not used as a P111 acceptance signal because the account's monthly Actions capacity is exhausted and this run was explicitly authorized to continue without it.
- From this connector-only run, project dependency install, TypeScript strict compilation, ESLint, Jest execution, Android/iOS process-recreation behavior, real background/foreground device behavior, and native provider callback behavior are **not claimed as passing or failing**.

## Retained gaps / why status is PARTIAL at full lifecycle scope

1. Device/emulator process recreation and background/foreground execution were not available from this connector-only run, so runtime lifecycle verification is not claimed.
2. Full form-draft persistence across process death remains intentionally unsupported until an approved field-retention/security/migration policy identifies genuinely safe draft content.
3. Active Cashfree provider launch/callback lifecycle cannot be completed or process-restored because the approved native provider SDK/callback adapter is still absent; provider credentials remain intentionally non-persisted.

These gaps do not weaken the safety acceptance boundary: sensitive payment/provider credentials are not part of the restoration schema, and authoritative auth/account resolution continues to own the Customer/Chef root.

## Stop boundary

P112 — Lifecycle-State Matrix Completion remains **NOT STARTED**. No P112 server-state audit, accessibility work, responsive work, later hardening phase, or unrelated UI change was pre-implemented.
