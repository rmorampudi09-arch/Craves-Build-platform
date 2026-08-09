# P102 — Chef Business Information UI / Document Flow

**Guide reference:** 49 — Chef Business Information  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Authorized phase only:** P102  
**Start commit:** `59a2f19a8b097a74408b715d468e5e8cd2732a2c`  
**Final code commit:** `4c8ec13d22fe91e4b688536e7118f1a3e512283f`

## Implemented boundary

P102 adds the registered `ChefBusinessInformation` child route under the existing Chef Profile stack and makes the existing **Business information** row navigate to it.

The screen reads only the exact already-reviewed backend sources established by P101:

- `GET /api/v1/kitchens/me` through the existing Chef kitchen/profile client.
- `GET /api/v1/chef/application` through the P101 Chef business verification client.

No backend, APIM, infrastructure, database, or server-source changes are part of P102.

## UI and state implemented

- Chef Business Information route reachable from Chef Profile.
- Existing Chef header/notification behavior retained, with an explicit back-to-Profile control.
- Pull-to-refresh over the two independent server sources while retaining last valid query data when available.
- Initial skeleton, independent partial-source loading states, source-specific recoverable errors, retry controls, populated state, and empty-document state.
- A partial-source result never labels a still-pending source as failed; verification and kitchen loading states remain independent.
- Verification banner driven only by `NOT_SUBMITTED`, `PENDING`, `APPROVED`, or `REJECTED` from the Chef application service.
- Application-level rejection reason is shown when the backend returns one.
- Business overview tiles use only authoritative/derived values: application verification state, proof metadata count, and kitchen status.
- Business overview uses a readable warm surface/border treatment so heading/metric hierarchy remains accessible with the existing Espresso/Flame token system.
- Aadhaar/PAN proof rows show only the safe metadata exposed by the P101 mobile model: file name, content type, size, persisted `UPLOADED` metadata state, and timestamps.
- Proof rows expand/collapse to show metadata details.
- The screen explicitly does **not** reinterpret `UPLOADED` as document-level verified/valid/rejected/expired state.
- Business kitchen/address edit actions reuse the existing P100 Chef Edit Profile flow and full replacement draft behavior.
- Service area displays only the existing kitchen `areaName` as a profile-area label and does not invent serviceability semantics.
- Cuisine/specialty and payout-setup rows expose explicit backend-contract-unavailable outcomes rather than fake navigation or data.
- Learn-more guidance explains the authoritative data boundary and sensitive-document handling.
- Sensitive storage locators, reviewer identity identifiers, and document content are not exposed or logged.

## Document upload/update security boundary

Guide Reference 49 expects secure file selection/validation/progress/retry and document renewal/resubmission behavior. The reviewed backend does not currently provide a complete approved-Chef business-document maintenance contract:

- `POST /api/v1/chef/application/proof-files` is the existing onboarding/KYC proof upload/replacement source.
- Approved applications cannot change proofs through that endpoint.
- No Chef-facing endpoint provides document-content read access for this Business Information surface.
- No per-document verification/rejection reason/expiry/renewal/resubmission lifecycle exists; persisted proof status is only `UPLOADED`.

Therefore P102 does not open a native file picker or transmit a selected file. **Upload New Document**, **Open file**, and **Update** have real handlers that explain the exact unavailable capability and leave sensitive data untouched. This is intentionally fail-closed; wiring the onboarding-only endpoint here would create a false product capability and would fail for an approved Chef.

## Other backend blockers retained from P101

- No approved Chef service-area management contract (list/radius/polygon/lookup/update).
- No approved Chef cuisine/specialty taxonomy or read/write contract.
- No approved Chef payout-configuration or payout-setup-status contract. Earnings history is not reclassified as payout setup.

## Focused validation added

`chefBusinessInformationPresentation.test.ts` covers:

- application verification presentation without promoting proof metadata to document-level verification;
- backend application rejection reason presentation;
- safe proof file-size/date formatting;
- business-address formatting from existing kitchen fields;
- kitchen status labels.

Source-level compare from the P102 start commit confirms the implementation is limited to the Business Information feature, Chef Profile entry/navigation, typed route registration, tests, phase evidence, and the phase ledger.

GitHub Actions execution is not claimed because the account's monthly Actions capacity is exhausted. Project dependency installation, strict TypeScript execution, ESLint, Jest execution, Android bundle/build, emulator/device behavior, and Reference-49 pixel comparison are not recorded as passing or failing from this connector-only implementation run.

## Phase status

**PARTIAL at full Guide Reference 49 product scope; COMPLETE at the exact currently available backend contract boundary.**

The missing Guide acceptance items require new/extended backend contracts and are not safe to fabricate in mobile code. P103 payout work is not included or authorized by this phase.
