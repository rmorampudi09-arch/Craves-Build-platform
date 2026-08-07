# P11 — Root Navigation and Typed Route Policy

## Scope

P11 establishes the root-navigation boundary required by `phases.md`, `plan.md`, `agent.md`, and the full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` without implementing later customer, chef, commerce, or authentication UI phases.

The master guide requires separate Auth, Customer, Chef, Transactional, and Modal navigation domains; serializable typed route parameters; role-separated authenticated roots; route-policy ownership for bottom navigation and View Cart visibility; intentional immersive-screen behavior; and a fail-closed deep-link allowlist.

P11 does not implement customer bottom tabs, chef bottom tabs, View Cart UI, marketplace screens, checkout/payment screens, modal product screens, role-selection visual acceptance, or any P12+ phase.

## Starting point

- Branch: `mobile-ui-rebuild-from-scratch`
- P11 started from branch HEAD: `26be99d71c9f7ded7fa5c14561e8c36507a35141`
- P10 validated implementation parent: `1870aa30172574ad5bb2e192798bbe4f96b736e8`
- P10 completion-record commit: `26be99d71c9f7ded7fa5c14561e8c36507a35141`

## Navigation ownership implemented

### One navigation container

`apps/mobile/src/app/navigation/AppNavigator.tsx` remains the sole application `NavigationContainer`. P11 does not add a parallel navigation system.

The registered routes are now separated into three bounded navigator registries:

- anonymous Auth routes,
- authenticated Customer account-resolution routes,
- authenticated Chef account-resolution routes.

The authenticated navigator is selected from the existing session role. Customer registration/status routes are not registered in the Chef root, and Chef registration/status routes are not registered in the Customer root.

This separation is intentionally limited to routes that already exist. Customer marketplace and Chef operational shells remain later-phase work.

### Typed domain model

`apps/mobile/src/app/navigation/types.ts` now defines:

- `AuthStackParamList`,
- `CustomerAccountStackParamList`,
- `ChefAccountStackParamList`,
- `NavigationDomainParamLists`,
- `NavigationDomain`,
- `RegisteredRouteName`.

The domain model explicitly reserves Auth, Customer, Chef, Transactional, and Modal ownership. Transactional and Modal route lists remain deliberately unregistered until real screens are implemented by their owning phases; P11 does not create placeholder routes.

Existing route parameters remain serializable primitives/objects containing role, phone, email, status, or message values. No mutable domain entity is introduced as a route parameter.

## Route chrome policy

`apps/mobile/src/app/navigation/navigationPolicy.ts` provides one shared policy boundary for later shell components.

Domain defaults are:

- Auth — bottom navigation hidden, View Cart ineligible, immersive.
- Customer — bottom navigation eligible, View Cart eligible, non-immersive by default.
- Chef — bottom navigation eligible, View Cart never eligible, non-immersive by default.
- Transactional — bottom navigation hidden, View Cart hidden, immersive.
- Modal — bottom navigation hidden, View Cart hidden, immersive by default.

Every route currently registered by the rebuild is still an authentication/account-resolution route and is explicitly immersive. Therefore P11 does not accidentally display future bottom navigation or View Cart UI on current auth/onboarding/status screens.

Later product phases may add narrowly reviewed route-specific exceptions when those real screens exist; they should reuse this policy rather than introduce screen-local visibility conditionals.

## Deep-link allowlist boundary

`apps/mobile/src/app/navigation/deepLinkPolicy.ts` adds a fail-closed validation boundary between a future external URL/notification parser and React Navigation.

P11 allowlists only safe, currently implemented anonymous entry destinations:

- `RoleSelection`,
- `PhoneSignIn`,
- `EmailSignIn`,
- `ForgotPassword`.

Role-bearing parameters accept only `CUSTOMER` or `CHEF`; optional email must be a string; unexpected object keys are rejected. Unknown routes, OTP verification, account-resolution/status routes, malformed parameters, and attempts to redirect an already authenticated session into anonymous auth routes are rejected.

No URL scheme, host, notification payload format, authenticated resource deep link, or backend authorization rule is invented. Product/resource deep links remain blocked until their owning phases can validate authentication, role, resource identity, and access.

## Focused tests

P11 adds:

- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
  - current auth/account routes remain immersive,
  - customer domain default allows shell chrome,
  - chef domain never allows customer View Cart,
  - transactional/modal defaults remain immersive.
- `apps/mobile/src/app/navigation/deepLinkPolicy.test.ts`
  - valid allowlisted anonymous destinations pass,
  - unknown/sensitive destinations fail closed,
  - invalid roles and unexpected object payloads fail closed,
  - authenticated sessions cannot be redirected into anonymous auth entry routes.

## Validation evidence

Validated code completion commit: `b7ac5dfd5cfc86d9f17ffdfe7b217430c5b40b58`.

GitHub Actions run `31209520350` — **SUCCESS**.

Passed checks:

1. dependency install from lockfile,
2. strict TypeScript (`tsc --noEmit`),
3. ESLint with zero warnings,
4. Jest including P11 route/deep-link policy tests and all prior regressions,
5. production Android JavaScript bundle generation,
6. backend/APIM/infrastructure source-change guard.

No Gradle/APK packaging was run, per the implementation-phase build policy.

## Change boundary

Compared with P11 starting commit `26be99d71c9f7ded7fa5c14561e8c36507a35141`, validated implementation commit `b7ac5dfd5cfc86d9f17ffdfe7b217430c5b40b58` changes only:

- `apps/mobile/src/app/navigation/AppNavigator.tsx`
- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.ts`
- `apps/mobile/src/app/navigation/navigationPolicy.test.ts`
- `apps/mobile/src/app/navigation/deepLinkPolicy.ts`
- `apps/mobile/src/app/navigation/deepLinkPolicy.test.ts`

No backend, APIM, infrastructure, database, Android native, product-screen, store, query, HTTP, or session-security source is changed by P11.

## Explicit later-phase boundaries

- P12 owns Role Selection UI/state acceptance.
- P20 owns startup session restoration UX and wrong-root-flash acceptance.
- P21 owns authoritative backend identity/role/onboarding resolution.
- P24 owns full logout/revoke/private-state cleanup.
- P25/P26 own Customer bottom tabs and scroll hide/reveal behavior.
- P29 owns the Customer View Cart overlay.
- Chef shell/product routes remain their later phases.
- Transactional and modal product routes remain their owning later phases.

P11 stops at the navigation foundation and does not pre-implement those phases.
