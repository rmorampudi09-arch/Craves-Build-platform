# P110 — Deep Link and Notification Routing Audit

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Starting branch HEAD:** `2d5946682ae3e07fae969185f67f183645a507f6`  
**Implementation head before evidence/ledger:** `a5fc7ffa660c7da894a5bfae304deb08e566cc43`  
**Status:** **PARTIAL at full product scope; implemented at the exact currently available route/contract boundary**

## Scope executed

P110 owns the application-wide deep-link and notification-routing audit from `phases.md`: auth-aware allowlisted links for customer, chef, order, offer, and kitchen destinations, with safe handling of expired/deleted/unauthorized resources and protection against duplicate navigation stacks.

The full implementation guide additionally requires signed-out deep links to resume only after session/profile hydration, notification route payloads to be treated as untrusted server data, and notification destinations to be typed and allowlisted rather than executing arbitrary route names from payload metadata.

Only P110 was implemented in this run. P111 process-restoration work was not started.

## Implemented routing boundary

`apps/mobile/src/app/navigation/inboundRouting.ts` is the single P110 product inbound-routing policy. It does not add another navigation container, store, query client, API client, or notification provider.

The canonical custom-scheme allowlist is deliberately narrow:

- `craves://customer`
- `craves://chef`
- `craves://order/<uuid>`
- `craves://offer`
- `craves://kitchen/<uuid>`

Unknown hosts, extra path segments, query strings/fragments, malformed IDs, non-UUID resource IDs, non-canonical casing, surrounding whitespace, and non-`craves` schemes fail closed before React Navigation receives a destination.

### Auth and role resolution

Inbound candidates are not trusted to select an application root.

- Signed-out candidates are held only in memory and deferred while the existing authentication/session flow runs.
- Authenticated sessions with unresolved account/onboarding state defer until the product root is safe to render.
- `CUSTOMER` and `CHEF` root links require the matching authoritative resolved role.
- Order links are role-aware: a resolved Customer routes to the Customer order detail path; an approved/resolved Chef routes to the Chef order detail path.
- Kitchen links are Customer-only and route to the real existing `CustomerKitchenProfile` screen.
- Wrong-role destinations are discarded rather than pushing a screen from another role tree.
- No protected route is registered in the anonymous auth navigator.

The pending candidate is process-memory only. Persisting/restoring arbitrary route stacks after process death remains P111 and was intentionally not implemented here.

## Single root-navigation integration

`apps/mobile/src/app/navigation/AppNavigator.tsx` remains the sole `NavigationContainer`.

P110 adds:

- one root navigation ref for controlled inbound dispatch;
- React Native `Linking.getInitialURL()` handling for cold-start links;
- one `Linking` URL-event listener for already-running app links;
- in-memory deferral until authentication/account resolution/product-root readiness;
- destination-specific dispatch into the existing Customer or Chef navigator;
- a current-leaf-route check so re-opening the exact screen/resource does not push it again;
- the shared P110 destination dedupe gate before navigation.

The existing P11 anonymous auth-route policy remains unchanged; P110 does not weaken or bypass it.

## Notification routing hardening

The existing customer notification model already treated route metadata as untrusted conceptually, but before P110 it accepted any non-empty `targetId`.

P110 now requires a UUID before any notification payload can create a destination and keeps the target-type allowlist explicit:

- `ORDER` -> `CustomerOrderDetail`
- `DELIVERY` -> `CustomerOrderTracking`
- `KITCHEN` -> `CustomerKitchenProfile`

Arbitrary route names, malformed IDs, null IDs, coupons/offers without a real production destination, rewards, account/system labels, and unknown target types do not navigate.

`CustomerNotificationsScreen` now also:

- blocks concurrent opens for the same notification while mark-read/navigation is in flight;
- marks an unread notification before navigation as the existing flow requires;
- uses the shared P110 destination dedupe gate;
- routes Kitchen notifications through the existing typed Profile-stack kitchen route;
- releases the dedupe claim if a navigation dispatch itself fails.

## Duplicate-stack protection

P110 uses two complementary protections rather than relying on timing alone:

1. a shared short-window destination-key dedupe gate blocks rapid repeated external-link/notification taps for the same resource;
2. the root inbound dispatcher checks the currently focused leaf route and resource ID, so the same deep link does not push another copy even after the short dedupe window while that destination is already active.

Notification row opens additionally use a per-notification in-flight set so two taps cannot race mark-read and produce two navigations.

## Expired, deleted, and unauthorized resources

The inbound URL or notification payload never proves resource access. P110 validates only route shape, ID shape, auth/root readiness, and role ownership; the server-backed destination remains authoritative.

Existing destination screens already provide the required safe failure boundary:

- Customer Order Detail rejects invalid IDs and renders terminal states for missing/forbidden resources.
- Customer Order Tracking renders explicit 404/403 terminal states and retry/back actions.
- Customer Kitchen Profile rejects invalid IDs and renders terminal/retry/back states when the public kitchen cannot be loaded or is no longer active.
- Chef Order Detail uses the role-private Chef order API and renders an `Order unavailable` recovery state when authoritative detail is unavailable/forbidden/deleted.

P110 therefore does not pre-authorize a UUID locally or cache access authority from the link.

## Native app-link registration

P110 registers the custom `craves` scheme at the existing native app boundary:

- Android `AndroidManifest.xml` adds a `VIEW`/`DEFAULT`/`BROWSABLE` intent filter while preserving the existing `singleTask` activity launch mode.
- iOS `Info.plist` registers `craves` under `CFBundleURLTypes`.
- iOS `AppDelegate.swift` forwards incoming custom URLs through `RCTLinkingManager` so React Native `Linking` receives foreground URL events.

No universal-link domain, associated-domain entitlement, Android App Link host verification, push provider, token-registration flow, backend route, APIM contract, or server notification schema is invented by P110.

## Offer boundary retained from P70/P71

`craves://offer` is recognized as a canonical P110 destination class but intentionally returns `DESTINATION_UNAVAILABLE`.

P70 established that the repository has no authoritative Coupons/Offers list, eligibility, terms, bank-offer, or savings contract and explicitly forbids registering a fake `CustomerCouponsOffers` production route. P110 therefore fails offer links closed instead of creating a placeholder screen or guessed API integration.

This upstream blocker is the reason P110 is recorded as PARTIAL at full product scope rather than falsely marked DONE.

## Files changed

Production/runtime:

- `apps/mobile/src/app/navigation/inboundRouting.ts`
- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/features/notifications/domain/customerNotificationsModel.ts`
- `apps/mobile/src/features/notifications/screens/CustomerNotificationsScreen.tsx`
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/ios/CravesMobile/Info.plist`
- `apps/mobile/ios/CravesMobile/AppDelegate.swift`

Focused tests:

- `apps/mobile/src/app/navigation/inboundRouting.test.ts`
- `apps/mobile/src/features/notifications/customerNotificationsModel.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P110_DEEP_LINK_NOTIFICATION_ROUTING_AUDIT.md`
- `build.md`

## Focused source coverage added

`inboundRouting.test.ts` covers:

- the exact canonical URL allowlist;
- malformed/unknown/non-UUID/query/extra-segment rejection;
- signed-out and product-not-ready deferral;
- role-aware Customer/Chef order routing;
- Customer/Chef root isolation;
- Customer-only Kitchen routing;
- fail-closed Offer behavior;
- destination dedupe timing/release behavior.

`customerNotificationsModel.test.ts` now covers:

- UUID enforcement for notification targets;
- ORDER, DELIVERY, and KITCHEN allowlisted mappings;
- unknown route-name rejection;
- null and malformed target rejection.

## Validation / guard state

- Compared P110 starting HEAD `2d5946682ae3e07fae969185f67f183645a507f6` to implementation head `a5fc7ffa660c7da894a5bfae304deb08e566cc43`.
- The implementation comparison contains only the nine intended mobile/native/test files listed above; no backend, APIM, OpenAPI, database, infrastructure, dependency, secret, workflow, or P111 file is changed.
- Existing Customer order/tracking/kitchen and Chef order error boundaries were re-read to verify that server 404/403/unavailable resources terminate safely after routing.
- Full repository Jest/typecheck/ESLint/bundle execution is not claimed from this connector-only run.
- GitHub Actions are intentionally not used as an acceptance signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Native iOS forwarding follows the React Native Linking integration used by the current RN app structure; device/simulator invocation remains release/integration validation evidence, not claimed here.

## Retained blockers / not fabricated

1. Coupons/Offers remains blocked by the P70/P71 missing authoritative contract and real production destination.
2. The repository still has no approved external push-notification provider/tap-delivery infrastructure to wire; P110 hardens the existing server notification inbox destination metadata and leaves provider creation out of scope.
3. Universal/App Links with verified HTTPS domains are not introduced because no associated-domain/host contract is approved in the repository.
4. Process-death restoration of nested route state remains P111 and is not pre-implemented.

## Handoff

```text
Executed phase: P110 — Deep Link and Notification Routing Audit — PARTIAL at full product scope
Implemented: strict craves:// allowlist, auth/role deferral, Customer/Chef order routing, Customer kitchen routing, shared duplicate-route guard, current-route duplicate prevention, UUID-validated notification routing, Android/iOS custom-scheme registration
Safe failures: malformed/wrong-role/unsupported links fail closed; server-backed deleted/forbidden resources retain terminal destination states
Offer link: recognized but fail-closed because P70/P71 prohibit a fabricated production Offers route
Push provider: not invented; existing notification inbox metadata hardened only
GitHub Actions: not used because account capacity is exhausted
P111 work: NOT STARTED
Next phase: P111 — Process Restoration Regression — NOT STARTED
Authorization for P111: NONE
```
