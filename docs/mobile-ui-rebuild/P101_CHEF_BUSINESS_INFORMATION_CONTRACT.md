# P101 — Chef Business Information Contract

**Status:** PARTIAL at full Guide/product-contract scope; the exact currently available Chef business/verification/document sources are modeled for mobile with fail-closed parsing and explicit gaps for unsupported Reference-49 capabilities.

**Authorized phase:** P101 only. P102 and later phases were not implemented.

**Phase-start branch HEAD:** `c5bb79ed99d9975f12d40a6e3cf2de883f67acde`  
**Implementation/code end before evidence:** `616a8f069306d1288e35dded471f7e0931a38229`

## Sources re-read before implementation

- `agent.md`
- `build.md`
- applicable P101 section of `phases.md`
- `plan.md`
- full 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0`
- Guide Reference 49 / source page 41 / `image49.jpeg`
- `docs/mobile-ui-rebuild/P100_CHEF_EDIT_PROFILE_UI.md`
- current `apps/mobile/src/features/chefProfile/**`
- current shared mobile HTTP client
- exact User-Chef Service Chef application controller/DTO/service/storage/schema sources
- exact Chef application APIM configuration
- current Catalog kitchen contract already established by P99/P100

Guide Reference 49 requires business profile, verification status, documents/renewal state, service areas, cuisines, payout setup status, and secure document behavior. P101 is the contract phase only; P102 owns the Reference-49 UI/document flow.

## Exact current backend/APIM boundary established

### Chef application / verification

`GET /api/v1/chef/application`

- Returns `ChefApplicationResponse`.
- Application statuses are `NOT_SUBMITTED`, `PENDING`, `APPROVED`, and `REJECTED`; `NOT_SUBMITTED` is the service response when no application row exists.
- Existing persisted application rows use `PENDING`, `APPROVED`, or `REJECTED`.
- Review/rejection state remains backend-authoritative.

### Current proof documents

The application response contains the current onboarding/KYC proof list.

- Supported types: `AADHAAR_CARD`, `PAN_CARD`.
- Current persisted document status: `UPLOADED` only.
- Current storage accepts PDF, JPEG, and PNG.
- File-size enforcement is backend-configured; the reviewed service default is 10 MiB.
- One document row exists per application/document type.

`POST /api/v1/chef/application/proof-files`

- Multipart fields: `documentType`, `file`.
- Requires an existing Chef application.
- Replaces the existing row for the same document type before approval.
- The current service rejects document changes after the application is `APPROVED` with `CHEF_ALREADY_APPROVED`.

Therefore this endpoint is a real onboarding source, but it is **not** falsely classified as the approved-Chef document update/resubmission capability required by the full Reference-49 experience.

### Current business/kitchen profile

`GET /api/v1/kitchens/me` and `PUT /api/v1/kitchens/me` remain the exact current Chef-owned kitchen/business identity, contact, address, coordinates, and operational-status boundary established by P99/P100.

They do not define Guide-only service-area collections, cuisine/specialty taxonomy, legal-document lifecycle, or payout setup.

## Implemented P101 boundary

1. Added a dedicated `chefBusinessInformation` feature boundary without creating a screen, route, navigator, store, query client, or duplicate HTTP client.
2. Added a strict safe mobile parser for the exact Chef application/verification response.
3. The parser validates UUID/timestamp/state invariants, application lifecycle combinations, current proof types, current proof status, supported file content types, document uniqueness, and required persisted application fields.
4. `NOT_SUBMITTED`, `PENDING`, `APPROVED`, and `REJECTED` are validated against the exact current service/database lifecycle rather than treated as arbitrary display strings.
5. Added a real deduped verification read using the existing shared HTTP client and exact `GET /api/v1/chef/application` path.
6. Intentionally validate but do not expose `identityId`, `reviewedByIdentityId`, `blobContainer`, or `blobName` through the Business Information mobile model. Reference 49 does not need these internal identifiers/storage locators.
7. Added a typed Guide-49 capability map distinguishing supported sources from missing product contracts.
8. Classified current kitchen profile, application verification status, and current proof metadata as supported exact sources.
9. Classified approved-Chef document upload/update, per-document validity/expiry/rejection/renewal, service areas, cuisines/specialties, and payout setup status as unavailable at the current exact backend boundary.
10. Recorded the real `/proof-files` endpoint as a restricted/source-only onboarding boundary rather than fabricating approved-Chef maintenance semantics.
11. Explicitly records that `GET /api/v1/chef/earnings` is not payout configuration/setup and must not be reclassified to make Reference 49 appear complete.
12. Added focused source tests for parser least privilege, state invariants, document types/status/content types, uniqueness, exact source paths, and missing-capability fail-closed behavior.
13. No logging was added; no sensitive document/storage values are logged.
14. No backend, APIM, OpenAPI, infrastructure, dependency, customer, navigation, screen, or P102 source was changed.

## Changed P101 code files

- `apps/mobile/src/features/chefBusinessInformation/api/chefBusinessInformationApi.ts`
- `apps/mobile/src/features/chefBusinessInformation/api/chefBusinessInformationApi.test.ts`
- `apps/mobile/src/features/chefBusinessInformation/domain/chefBusinessInformationContract.ts`
- `apps/mobile/src/features/chefBusinessInformation/domain/chefBusinessInformationContract.test.ts`

Evidence/ledger:

- `docs/mobile-ui-rebuild/P101_CHEF_BUSINESS_INFORMATION_CONTRACT.md`
- `build.md`

## Contract gaps retained instead of fabricated

1. **Approved-Chef document upload/update/resubmission:** current `/proof-files` upload is blocked after `APPROVED`; it cannot satisfy the Reference-49 maintenance flow.
2. **Document validity lifecycle:** no per-document verified/rejected/expired/renewal state or rejection/renewal reason exists; current persisted document status is only `UPLOADED`.
3. **Service areas:** no approved list/radius/polygon/serviceability management contract; kitchen has only `areaName` and coordinates.
4. **Cuisines/specialties:** no approved Chef taxonomy/read/write contract found.
5. **Payout setup status/configuration:** no approved Chef bank destination/payout configuration/setup-status contract found; earnings history is not payout setup.
6. **Reference-49 UI/document flow:** intentionally not implemented in P101; it belongs to P102.

## Validation / guard state

- `GitHub.compare_commits` from phase-start HEAD `c5bb79ed99d9975f12d40a6e3cf2de883f67acde` to code end `616a8f069306d1288e35dded471f7e0931a38229` shows two fast-forward implementation commits and exactly the four P101 mobile code/test files listed above.
- Source-level review confirms the only runtime network call added is the exact existing `GET /api/v1/chef/application` through the shared authenticated HTTP client; no endpoint, response status, document type, service-area, cuisine, payout, or renewal contract was invented.
- Focused Jest source was added for parser/state/source/capability behavior, but Jest execution is not claimed from this connector-only run.
- No dependency was added.
- GitHub Actions are intentionally not claimed as a P101 pass/fail signal because the account's monthly Actions capacity is exhausted and the user explicitly authorized continuing without it.
- Project dependency installation, project TypeScript 6.0.3 strict typecheck, ESLint, Jest execution, Android bundle/build, and device/reference validation are **not recorded as passing or failing for P101** from this connector-only implementation run.
- P101 remains **PARTIAL** at full Guide/product-contract scope because multiple Reference-49 backend capabilities do not exist and must not be fabricated.

## Stop state

**P101 is the only phase implemented in this run.**  
**P102 — Chef Business Information UI/Document Flow is NOT STARTED.**  
**Next-phase authorization: NONE.**
