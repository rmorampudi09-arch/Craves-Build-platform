# P99 — Chef Edit Profile Domain/Form Evidence

**Branch:** `mobile-ui-rebuild-from-scratch`  
**Phase start:** `483e97116a4ed98bb3798f2f3f6d55f64652f0db`  
**Implementation/code end:** `4f8bb386f889d893a6bfbb4b3cbcf846f4b46fa5`  
**Status:** PARTIAL at full Guide/product-contract scope; exact currently approved domain/form boundary implemented.  
**Next phase:** P100 — Chef Edit Profile UI — NOT STARTED.

## Authorized scope

P99 is the domain/form half of Guide Reference 48. P100 owns the reference-faithful screen and route/UI interactions, so this phase deliberately does not register a Chef Edit Profile route, replace the P98 Edit Profile blocker, or build the visual form.

Implemented P99 responsibilities:

- original/canonical Chef kitchen profile -> editable draft mapping;
- client form validation for fields present in the exact backend request;
- complete replacement request construction for the existing PUT contract;
- dirty-state ownership scoped above future Profile child routes;
- address-child merge behavior that preserves unrelated unsaved edits;
- duplicate-submit prevention and abortable save coordination;
- suspended-kitchen read-only guard matching the established web/profile behavior;
- immediate canonical Chef profile cache replacement plus profile-domain invalidation after successful save;
- explicit typed blockers for Guide capabilities whose backend/mobile contracts do not exist yet.

## Exact backend/APIM contract used

Inspected before implementation:

- `services/catalog-service/src/main/java/in/craves/catalog/web/KitchenController.java`
  - `GET /api/v1/kitchens/me`
  - `PUT /api/v1/kitchens/me`
- `services/catalog-service/src/main/java/in/craves/catalog/web/ApiDtos.java`
  - exact `KitchenProfileRequest` fields: `kitchenName`, `displayName`, `description`, `phoneNumber`, `email`, `addressLine1`, `addressLine2`, `landmark`, `areaName`, `city`, `state`, `postalCode`, `latitude`, `longitude`, `status`;
  - backend-required fields are `kitchenName`, `addressLine1`, `city`, and `state`.
- `services/catalog-service/src/main/java/in/craves/catalog/service/CatalogService.java`
  - PUT is a complete upsert/replacement of the kitchen profile fields;
  - identity ownership comes from the authenticated Chef principal;
  - omitted/null status would default to `DRAFT`, so P99 preserves the canonical existing status explicitly rather than risking an implicit status transition.
- `scripts/apim/configure-chef-kitchen-profile-apim.sh`
  - APIM path owner remains `api/v1/kitchens/me` with GET and PUT operations.
- `docs/handover/2026-07-30-chef-web-kitchen-profile.md`
  - suspended profiles are read-only in UI;
  - coordinates are optional and frontend geocoding/serviceability logic is not defined there;
  - PUT uses the exact `KitchenProfileRequest` fields.

No backend, APIM, OpenAPI, infrastructure, deployment, package/dependency, or service file was changed.

## Domain/form behavior

### Exact replacement mapping

`chefEditProfileForm.ts` defines the form only from fields present in `KitchenProfileRequest`. It trims required values, maps blank optional strings to `null`, and preserves server-owned `latitude`, `longitude`, and `status` from the canonical profile when building the PUT request.

The form does not add guessed `photoUrl`, `cuisines`, `serviceAreas`, `socialLinks`, verification, or other unsupported request fields.

### Draft persistence

`ChefEditProfileDraftProvider` is mounted around the existing Chef Profile stack. It owns:

- `originalProfile`;
- `formDraft`;
- `dirtyState`.

A repeated `BEGIN` for the same profile does not overwrite a dirty draft. Address child selections merge only address-owned fields, so a future P100 child selector can return without destroying edits in name, bio, contact, or other fields. `COMMIT` replaces both canonical/draft state from the server response and clears dirty state.

No P100 route has been registered in this phase.

### Save and synchronization

`useChefEditProfileModel`:

- rejects a second in-flight submit;
- owns an `AbortController` so the future UI can cancel an obsolete write;
- refuses mutation without an authenticated identity or initialized canonical/draft state;
- refuses mutation for a `SUSPENDED` kitchen;
- sends only the exact full replacement request through `PUT /api/v1/kitchens/me`;
- commits only the parsed server response;
- updates the canonical `chef-profile-kitchen` React Query cache immediately;
- invalidates the same complete profile-domain prefix so mounted Chef identity consumers revalidate without manual refresh;
- maps known `AppApiError` responses without inventing structured field keys.

`useChefProfileModel` now consumes the same centralized query-key factory, preventing P98 and P99 from drifting onto separate Chef profile caches.

## Explicit retained contract blockers

Guide Reference 48 includes capabilities that cannot be truthfully completed from the current repository contract:

1. **Chef profile photo upload/remove** — no approved Chef profile photo route was found, and `apps/mobile/package.json` has no approved native image-picker dependency for this flow.
2. **Cuisine metadata/selection** — no approved Chef cuisine metadata read/write contract was found.
3. **Service-area lookup/selection** — the kitchen request exposes `areaName` and raw address/coordinate fields, but no Chef service-area lookup/selection endpoint is present.
4. **Separate business validation/serviceability** — no approved Chef business-validation capability is exposed by the inspected Catalog controller; P99 therefore validates only the exact current request boundary and does not fabricate serviceability results.
5. **Social links** — not present in `KitchenProfileRequest`.

These boundaries are represented in `CHEF_EDIT_PROFILE_BLOCKED_CAPABILITIES` for P100 to render honestly if still unresolved.

## Changed code files

- `apps/mobile/src/app/navigation/ChefRootNavigator.tsx`
- `apps/mobile/src/features/chefProfile/api/chefProfileApi.ts`
- `apps/mobile/src/features/chefProfile/domain/chefEditProfileForm.ts`
- `apps/mobile/src/features/chefProfile/domain/chefEditProfileForm.test.ts`
- `apps/mobile/src/features/chefProfile/state/ChefEditProfileDraftProvider.tsx`
- `apps/mobile/src/features/chefProfile/state/ChefEditProfileDraftProvider.test.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileQuery.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileSynchronization.ts`
- `apps/mobile/src/features/chefProfile/state/chefProfileSynchronization.test.ts`
- `apps/mobile/src/features/chefProfile/state/useChefEditProfileModel.ts`
- `apps/mobile/src/features/chefProfile/state/useChefProfileModel.ts`

## Focused test source added

- form hydration and exact replacement mapping;
- required-field failure;
- suspended read-only behavior;
- address-child merge preserving unrelated dirty values;
- dirty draft survival across a repeated begin/resume;
- canonical server commit clearing dirty state;
- canonical Chef profile query cache replacement and invalidation after save.

## Validation state

`GitHub.compare_commits` from phase start `483e97116a4ed98bb3798f2f3f6d55f64652f0db` to code end `4f8bb386f889d893a6bfbb4b3cbcf846f4b46fa5` reports the branch is fast-forward/ahead and limits the implementation diff to the eleven mobile files listed above.

GitHub Actions were intentionally not used as the phase pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.

From this connector-only implementation run, project dependency install, TypeScript strict compilation, ESLint, Jest execution, Android bundle/build, emulator/device behavior, and Screen-48 pixel/reference verification are **not claimed as passing or failing**.

## Stop boundary

P100 — Chef Edit Profile UI remains NOT STARTED. The existing P98 Edit Profile UI blocker remains in place until P100 is separately authorized. No P100 route, screen, photo UI, selectors, reference-layout work, or later Chef profile child phase was pre-implemented.
