# P67 — Add/Edit Address and Location Permission

**Status:** PARTIAL  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Validated implementation head:** `fe7a263095a138d546c851908cbec166bd30b8b0`  
**CI:** `31279558033` / `93158570541` — **SUCCESS**

## Implemented client boundary

P67 adds a shared address editor inside the existing My Addresses surface without introducing a second address store or an unverified backend operation.

Implemented and validated:

- Add and Edit entry points from the existing `CustomerAddressesScreen`.
- One shared `CustomerAddressEditorModal` for manual address entry and existing-address editing.
- HOME / WORK / OTHER label selection.
- Recipient, phone, address lines, landmark, area, city, state, and pincode inputs.
- Controlled six-digit pincode validation.
- Semantic duplicate detection using normalized street/area/city/state/pincode and ignoring the address currently being edited.
- First-address default rule in the form domain.
- Existing default address cannot be unset by editing it; choosing another existing address as default continues to use the already-supported server behavior.
- Unsaved-change confirmation when dismissing a dirty editor.
- Existing-address editing persists through the repository-established full `PUT /api/v1/customer/addresses/{id}` update shape and invalidates both address-management and saved-location queries after success.
- The existing Set Default behavior is refactored to reuse the same validated update helper rather than duplicate transport logic.
- Current-location action fails closed with an explicit manual-entry fallback instead of dead-ending or simulating permission/geocode success.
- Pincode lookup absence keeps city/state manually editable and exposes a controlled fallback instead of inventing a lookup result.
- Valid Add submissions are intentionally blocked at persistence when the create contract is absent; no fake local save is written into the private server-state cache.

## Deferred backend/platform contracts

P67 remains PARTIAL because the current branch does not expose all contracts required for end-to-end acceptance:

1. `CUSTOMER_ADDRESS_CREATE_CONTRACT_UNAVAILABLE` — no approved create-address POST contract is implemented in the current executable repository boundary, so a new address cannot yet be persisted.
2. `CUSTOMER_ADDRESS_PINCODE_LOOKUP_UNAVAILABLE` — no approved pincode-to-city/state/geocode contract is implemented, so city and state remain manually editable after local pincode validation.
3. `CUSTOMER_ADDRESS_CURRENT_LOCATION_UNAVAILABLE` — the mobile package does not currently include the approved native current-location permission/geocode integration; the UI provides a controlled fallback to manual entry and does not pretend permission was granted.

The inherited P66 delivery quote/serviceability blocker is unchanged and remains P66-owned.

## Validation evidence

GitHub Actions workflow: `.github/workflows/mobile-phase1-ci.yml`

- Run: `31279558033`
- Job: `93158570541`
- Dependency install: SUCCESS
- TypeScript strict check: SUCCESS
- ESLint: SUCCESS
- Jest: SUCCESS
- Production JavaScript bundle: SUCCESS
- Backend/APIM/infrastructure source guard: SUCCESS
- Gradle/APK packaging: not run, per implementation-phase policy

Focused P67 tests are in `apps/mobile/src/features/customerAddresses/customerAddressEditor.test.ts` and cover invalid pincode, duplicate detection, edit-self exclusion, first/default consistency, valid full-PUT edit planning, deferred Add persistence, and duplicate-before-create blocking.

## Changed files

- `apps/mobile/src/features/customerAddresses/domain/customerAddressEditor.ts`
- `apps/mobile/src/features/customerAddresses/api/customerAddressesApi.ts`
- `apps/mobile/src/features/customerAddresses/query/customerAddressQueries.ts`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressEditorModal.tsx`
- `apps/mobile/src/features/customerAddresses/screens/CustomerAddressesScreen.tsx`
- `apps/mobile/src/features/customerAddresses/customerAddressEditor.test.ts`
- `docs/mobile-ui-rebuild/P67_ADD_EDIT_ADDRESS_LOCATION_PERMISSION.md`
- `build.md` (ledger update follows this evidence record)

No backend, APIM, OpenAPI, database, infrastructure, package dependency, Android native source, Gradle/APK, or AAB configuration was intentionally changed for P67.

## Handoff

P67 is intentionally recorded as **PARTIAL**, not DONE. Later backend completion can connect the existing editor domain/UI to the approved create, pincode/geocode, current-location permission, and address-aware delivery-quote capabilities without replacing this form architecture.

Do not begin P68 until explicitly authorized.
