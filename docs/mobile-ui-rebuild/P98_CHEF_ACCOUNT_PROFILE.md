# P98 — Chef Account Profile

**Status:** PARTIAL at full Guide completion scope; the exact currently available Chef mobile/backend boundary is implemented without inventing missing contracts.

**Guide reference:** Screen 47 — Chef Account Profile, source page 39 / `image47.jpeg`.

**Phase start:** `d036180e10a014ef3cf6babe7e5511dfbd3e18b8`  
**Implementation/code end:** `4c96b4b5c355b2b601f4289c79c8b63490d01b65`

## Authorized scope implemented

- Replaced the generic Chef Profile tab boundary with the real Chef account/profile hub.
- Registered the typed logical route `ChefProfileHome` inside a dedicated Chef Profile stack while preserving the existing Chef bottom navigation.
- Added an exact typed/read-only Chef kitchen profile integration for the existing `GET /api/v1/kitchens/me` contract.
- Added strict fail-closed parsing for the kitchen profile response and focused parser tests.
- Reused authenticated identity/account-resolution state for Chef identity and approved-Chef access status instead of fabricating a second account model.
- Reused the existing Chef Dashboard operational model for synchronized Profile summary values:
  - active orders,
  - sellable menu items,
  - unread Chef notifications.
- Metric tiles drill into the existing Chef Orders/Menu tabs where a real destination exists.
- Added real business/kitchen status presentation for `DRAFT`, `ACTIVE`, `INACTIVE`, and `SUSPENDED`.
- Added prominent operational-attention UI when the signed-in identity or kitchen is suspended.
- Added loading, refresh, retry/error, and unavailable states without substituting zeroes for unknown values.
- Added grouped Business, Settings & support, and Account rows with accessible press feedback.
- Every row either performs a real current action/destination or exposes an explicit unavailable-contract/route blocker.
- Added confirmed logout using the existing `completeLogout` coordinator, which clears private query/mutation and sensitive client state before returning to Auth.
- Added confirmed Chef -> Customer role switch for identities that actually own the Customer role. The switch first clears Chef-private query state and fails closed if isolation cannot complete; only then is Customer account resolution requested.
- No customer cart/View Cart state is rendered in the Chef Profile experience.
- P99 Chef Edit Profile and later Chef profile child screens were not implemented.

## Exact contracts reused

### Chef profile / business summary

Existing approved route:

- `GET /api/v1/kitchens/me`

Existing response fields used:

- `id`
- `identityId`
- `kitchenName`
- `displayName`
- `description`
- `phoneNumber`
- `email`
- address/city/state/postal fields
- latitude/longitude
- `status`
- created/updated timestamps

The mobile parser recognizes only the backend `KitchenStatus` values currently present in the repository: `DRAFT`, `ACTIVE`, `INACTIVE`, `SUSPENDED`.

### Metrics / notifications

P98 does not create a new Profile aggregate endpoint. It reuses the existing exact P82/P83 Dashboard/operational sources so Profile does not drift from Dashboard/Menu/Orders:

- Chef operational orders -> active order count.
- Chef Menu exact list -> sellable-item count.
- Chef operational notices -> unread-notification count.

Unknown/error sources render `—`, not a manufactured zero.

### Authentication/session

- Existing authenticated `Identity` remains the account identity source.
- Existing `AccountResolution` remains the approved-Chef access source.
- Existing `completeLogout` remains the session logout coordinator.
- Existing role-scoped React Query cache keys/cleanup are reused before Chef -> Customer root re-resolution.

## Explicit blockers retained

The Guide asks for more capabilities than the exact repository contracts currently expose. P98 intentionally does not fabricate them:

1. **Separate Chef/business verification status:** no approved standalone verification read contract was found. The UI distinguishes approved Chef access from business verification and explicitly marks separate verification data unavailable.
2. **Chef subscription summary:** only subscription back-office/APIM support was found; no approved Chef-facing subscription-summary route/model was found. The row is a visible explicit blocker.
3. **Payout history / payout destination / payout eligibility:** the existing earnings ledger is not an approved payout-history or payout-initiation contract. The Payout row remains blocked for its later dedicated phase.
4. **Chef Edit Profile:** Guide Screen 48 / P99 is a separate phase and was not authorized. The Edit Profile control is visible but explicitly blocked rather than incorrectly opening the customer editor or pre-building P99.
5. **Chef Business Information editing:** later dedicated Guide screen/phase; not pre-implemented.
6. **Chef App Preferences:** later dedicated Guide screen/phase; not pre-implemented.
7. **Chef-specific Security and Help/Support child routes:** no approved registered Chef child-route contract exists in the current branch; rows explicitly report that boundary.
8. **Pixel-level reference verification / motion completion:** the embedded Screen-47 reference image is not available as a directly executable/device comparison surface in the connector-only environment, so pixel-level Android verification and the full reference animation gate are not claimed.

## Changed code files

- `apps/mobile/src/app/navigation/types.ts`
- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/features/chefProfile/api/chefProfileApi.ts`
- `apps/mobile/src/features/chefProfile/api/chefProfileApi.test.ts`
- `apps/mobile/src/features/chefProfile/state/useChefProfileModel.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileRoleSwitch.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileRoleSwitch.test.ts`
- `apps/mobile/src/features/chefProfile/screens/ChefProfileScreen.tsx`

## Validation / guard state

- `GitHub.compare_commits` from phase start `d036180e10a014ef3cf6babe7e5511dfbd3e18b8` to code end `4c96b4b5c355b2b601f4289c79c8b63490d01b65` is fast-forward only and reports exactly the eight P98 mobile files listed above.
- No `services/`, `openapi/`, `infra/`, APIM, deployment, workflow, package/dependency, customer, or P99+ Chef source changed in the implementation diff.
- Exact backend/APIM source was inspected before the mobile API path/model was added; P98 does not invent an endpoint URL.
- Focused test source covers strict kitchen-profile parsing and role-switch cache isolation/root re-resolution behavior.
- GitHub Actions are intentionally not used as a P98 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Project dependency install, full TypeScript 6.0.3 strict typecheck, ESLint, Jest execution, Android bundle/build, emulator/device behavior, and pixel-level Screen-47 visual comparison are **not claimed as passing or failing** from this connector-only implementation run.

## Phase boundary

**P99 — Chef Edit Profile: NOT STARTED.**

Do not register or implement P99+ child screens until separately authorized.
