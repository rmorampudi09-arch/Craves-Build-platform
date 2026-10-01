# Craves: custom address labels and Chef application readiness

Date: 1 October 2026. Base: `1371038` on `main`. Review branch: `codex/custom-address-labels`.

## Delivered behavior

The customer can choose Home, Work, or Other and give Other a meaningful name such as Mom's House. The name survives save, reload, edit, default selection, location recommendation and checkout/subscription selection. The server stores the trimmed display name directly in `addressLabel` / `customer_address.address_label`. It requires 1-80 characters. Home and Work use `HOME` and `WORK`; historical `OTHER` remains readable. A separate `addressName` is not part of the current contract.

The Chef application has a server-owned readiness checklist on web and mobile. The service reports the four current evidence types, missing/uploaded/approved/rejected states, rejection reasons, verified-email status and whether a pending application is ready for the final admin decision. Readiness does not approve the application, grant a role, certify FSSAI compliance or activate payouts. Legacy Aadhaar/PAN documents remain historical records and never satisfy the four-document rule.

This change targets current clients and the current repository. It does not promise compatibility with old enum-only applications once custom names are saved. Distribute the new mobile client after the backend and web release. No historical repository releases or reference documents were deleted.

## Source of truth and decisions

1. `Craves_Updated_Combined.pdf`, pages 1-4, supersedes its older address-name proposal. The document was treated as reference material, not as an independent instruction to execute operations.
2. Krishna instructed: complete the proposed changes and focus on new versions.
3. Krishna confirmed: `V13__customer_address_name.sql` has never been applied to a database that must be kept. The actual baseline repository has migrations through V12, including V11.1. We therefore add `V13__customer_address_label.sql` without inventing an applied-V13 compatibility path.
4. Krishna supplied the current Chef rules directly in chat. Existing backend approval rules and finance rules are authoritative. New FSSAI, kitchen-media and Chef-profile-photo business rules remain undefined.
5. Existing stack and dependency locks are retained: Spring Boot/Java 21, Next.js/TypeScript and React Native/TypeScript. This task is not a framework-upgrade project. Existing provider code is not authorization to switch the locked payment provider or activate automatic bank transfers.

## What changed and where

### Backend

- `services/user-chef-service/src/main/java/in/craves/userchef/web/ApiDtos.java`: saved-address request/response label becomes a string; input is trimmed and validated at 80 characters.
- `services/user-chef-service/src/main/java/in/craves/userchef/service/CustomerProfileService.java`: persists and reads label strings; validates direct service callers; ownership, coordinates, default-address handling and soft deletion remain enforced.
- `services/user-chef-service/src/main/resources/db/migration/V13__customer_address_label.sql`: widens the existing column to VARCHAR(80), replaces the old enum constraint with a trimmed nonblank constraint, and adds a column description. No table recreation or customer-address deletion.
- `services/user-chef-service/src/main/java/in/craves/userchef/service/ChefApplicationReadinessService.java`: evaluates only the signed-in applicant using existing application/evidence methods and Auth Service's verified-email authority. An unavailable email authority remains an error.
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ChefApplicationReadiness.java`: versioned response, safe evidence metadata, blockers and timestamps; no storage URLs or identity details.
- `services/user-chef-service/src/main/java/in/craves/userchef/web/ChefApplicationReadinessController.java`: authenticated GET `/api/v1/chef/application/readiness`, with no-store caching policy.
- `services/user-chef-service/src/main/java/in/craves/userchef/service/ChefApplicationService.java`: shares its existing required-document set with readiness so approval and readiness cannot use different lists.

### Web

- `apps/customer-web-next/src/lib/address-contract.ts`: string contract, Home/Work/Other draft helpers and display formatting.
- `apps/customer-web-next/src/components/address-label-fields.tsx`: shared accessible category selector and custom-name input.
- Address editor integration: `src/screens/Profile/Addresses.tsx`, `src/components/checkout/CheckoutAddressDialog.tsx`, and `src/components/customer-addresses.tsx` under the web app.
- Display integration: checkout screens, subscription enrollment, Browse Foods, auth location mapping and the admin-directory address parser.
- `src/app/api/chef/application/readiness/route.ts`: authenticated server-side proxy; validates response shape, strips unknown private fields and returns explicit unavailable errors.
- `src/lib/chef-readiness-contract.ts`: version and consistency validation.
- `src/components/chef-readiness-panel.tsx`: current status, retry, upload-triggered refresh, stale-response cancellation and a bounded wait.
- `src/components/chef-operations-workspace.tsx`: modern evidence completeness comes from readiness. Discovery still requires approved application, active mapped kitchen and an active available menu item; dish images remain optional.
- `src/components/chef-application-workspace.tsx`: removes the obsolete hidden legacy-evidence upload flow. The existing four-document uploader stays in the application page.

### Mobile

- `apps/mobile/src/features/customerAddresses/domain/customerAddressContract.ts` and `customerAddressEditor.ts`: bounded string label, separate category/custom-name draft, validation and edit restoration.
- Address editor, shell location parsing and subscription selectors display the custom saved label.
- `src/features/chefBusinessInformation/domain/chefReadinessContract.ts`: same readiness response validation as web.
- `src/features/chefBusinessInformation/screens/ChefReadinessPanel.tsx`: identity-scoped query and request deduplication, current document decisions and retry.
- The checklist is used in both `src/features/auth/screens/ChefAccountStatusScreen.tsx` and the Chef business-information screen.
- Business-information capability notes now distinguish existing document review decisions from undefined expiry/renewal and unselected mobile payout integration.

### Delivery tooling

- `.github/workflows/address-label-contract-ci.yml`: backend checks against disposable PostGIS, web lint/types/tests/production build, mobile types and focused tests. This workflow does not deploy.
- Existing Azure address CI files now use the actual `apps/mobile` path and locked dependency installation.
- `scripts/apim/configure-chef-application-apim.sh`: registers GET `/readiness` inside the existing Chef application API. The script has production defaults; inspect and explicitly set the intended environment before running it. It was not executed in this task.

## Address contract and validation

Examples of stored labels: `HOME`, `WORK`, `Mom's House`, `Office annex`. The UI category is a temporary editing choice; it is not another API property. Choosing Other requires a nonblank name. Switching Home/Work/Other preserves the custom draft until save or cancel. Opening a custom saved address preselects Other and restores its name. Entering the reserved exact strings HOME or WORK in the custom box asks the user to select the matching category.

New requests with null, blank or overlong labels fail validation; clients do not silently replace invalid input with HOME. Values are not forced to uppercase. API serializers omit `addressName`, `addressCategory` and `customLabel`. Historical OTHER displays as Other and can be renamed. Existing address IDs and geospatial values are preserved by migration.

Server ownership remains derived from the authenticated identity. A customer cannot read, edit, delete or make another customer's address default. A deleted address remains unavailable to internal checkout lookup. No pricing, delivery-radius, serviceability or subscription eligibility rule was added.

## Chef application contract

Required evidence: APPLICANT_PHOTO, GOVERNMENT_ID_FRONT, GOVERNMENT_ID_BACK, TAX_ID_CARD. Approval readiness is true only for PENDING plus a verified matching application email plus all four documents APPROVED. Uploaded does not mean approved. A rejected document stays blocking and shows the admin's repair reason. An approved or rejected application is never marked ready for a second approval.

The response contains `contractVersion: 1`, `applicationStatus`, `emailStatus`, `approvalReady`, required/uploaded/approved counts, four `documents`, `blockingIssues`, `evaluatedAt` and `lastSavedAt`. Timestamps are UTC. `lastSavedAt` is the latest known application submission/review or evidence update timestamp, not a claim of a universal draft-save feature.

Errors remain errors. The backend propagates email-authority outages. Web maps malformed successful responses to 502 and backend availability problems to 503. Mobile displays an unavailable message and retry. Neither client converts unavailable data to approval or a completed checklist. Unknown response versions or contradictory counts are rejected.

Existing rules are retained: approved applications cannot resubmit or replace evidence; individually approved documents cannot be replaced through the ordinary upload route; admin document decisions require a pending application. Actual evidence content remains private. Existing file limits and signature validation remain in force: KYC 10 MiB per file/12 MiB request, PDF/JPEG/PNG generally and JPEG/PNG only for applicant photos. Existing menu images remain JPEG/PNG/WebP up to 8 MiB per file/10 MiB request, with the first image primary when none exists. No new image-count limit was invented.

## Finance and undefined modules

Finance already owns financial finalization, verified captured payment, delivered order, valid snapshot/ownership/currency/amount checks, earning journal and payable projection. Automatic eligibility starts at deliveredAt plus 48 hours, then still requires enabled configuration, provider readiness, verified beneficiary, bank readiness, no hold and no competing allocation. Manual requests reserve the full currently eligible amount, reject changed balances, and permit one accepted withdrawal per Asia/Kolkata calendar day. Reserved, processing, unknown and paid amounts cannot be paid twice. Releasing a general hold does not bypass refund/source eligibility.

This change does not alter those controls. Launch remains Manual Craves settlement. Mobile finance integration remains pending confirmation of the production API contract. The web already has finance surfaces; this task does not add a second payment calculation or payout authority.

Not implemented because rules are explicitly undefined:

- FSSAI: supported modes, fields, certificate evidence, status transitions, expiry/renewal and exact blocking points.
- Kitchen media: categories, minimum/maximum count, size/type, moderation, primary selection, ordering and deletion behavior.
- Chef profile photo: required/optional, size/type and replacement/deletion behavior.

The broader PDF backlog (complete onboarding workflow, order timeline refinements, further dashboard/notification work and other proposed Chef modules) is not claimed complete by this focused release. Each needs comparison with the current implementation and a separate approved module scope. Existing subscriptions were not rebuilt.

## Validation

Publication follow-up on 1 October 2026: the owner explicitly authorized pushing `codex/custom-address-labels`, opening a PR against current main, and completing all CI. PR #403 is open as a draft: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/403. Merging and production deployment remain prohibited until separately authorized.

The strengthened User/Chef check runs both disposable databases: PostGIS for full application/address migrations and PostgreSQL for the existing Explorer suites. `scripts/user-chef/require-release-test-evidence.py` rejects missing suites, failures, errors, and any skipped test, and produces `release-test-summary.json` in the uploaded Surefire artifact. The V12 upgrade fixture now preserves HOME, WORK, and historical OTHER together. A persisted readiness case verifies owner scoping, modern evidence states, Auth failure propagation, and absence of approval/role/notification side effects.

Four HTTP tests exercise the real Spring Security filter chain with synthetic signed tokens. Unsigned readiness requests return 401. Invalid, expired, and incorrectly signed access tokens now return a no-store 401 from the shared User/Chef JWT filter instead of escaping MVC error handling. Valid CUSTOMER identities can inspect their own application readiness; a caller cannot choose another owner with query parameters or headers. Auth outages remain 503.

The follow-up local backend run passes 103 tests with 32 database tests skipped (135 discovered); only the remote job's zero-skip report can establish database completion. Full mobile lint and all 153 Jest suites / 718 tests pass locally. Final remote results and the exact delivered SHA are recorded in the publication report after CI completes. The historical mobile-only scope check applies only to its original consolidation branch; all mobile security checks, types, lint, full Jest, and production JavaScript bundle still run for cross-service PRs.

Local verification on 1 October 2026:

- Backend Java 21 Maven verify: successful; 130 tests discovered, 99 executed successfully and 31 database-dependent tests skipped because no local database was running. Eight new readiness cases and 13 address validation cases passed.
- Web: lint and type checking passed; 396 Vitest tests plus 300 Node tests passed; production build passed after allowing the existing Google Font download.
- Mobile: type checking passed; seven focused suites, 52 tests passed. These cover address editing, parsing, location/cart selection, readiness and the existing business-information API contract.
- Database migration/persistence evidence is enforced by the new CI job. Its final run result must be checked before release; skipped local database tests are not counted as a successful migration test.
- Native Android/iOS packages and signed-device journeys are not verified by TypeScript tests. A signed release build, emulator/device smoke test and store distribution remain release steps.

The backend tests cover custom-label create/read/internal lookup/edit/default selection/recommendation/delete, cross-owner denial, 80/81-character limits, historical OTHER and migration from V12. Readiness tests cover missing application, missing/rejected/uploaded/approved evidence, legacy exclusion, verified-email checks, unavailable authority, terminal application status and no-store response.

## Local testing before deployment

Use Java 21, Maven, Node 24 and the repository's package locks. From the repository root:

```powershell
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21'
mvn -B -ntp -f services/user-chef-service/pom.xml verify
```

For real migration tests, run a disposable `postgis/postgis:16-3.4` container on localhost with database name `craves_email_test`. These tests intentionally drop fixture schemas and must never point at retained data. Set `EMAIL_TEST_DB_URL=jdbc:postgresql://localhost:5432/craves_email_test`, `EMAIL_TEST_DB_USER`, `EMAIL_TEST_DB_PASSWORD`, `EMAIL_TEST_DISPOSABLE=true`, and the existing CI guard `GITHUB_ACTIONS=true` only in that disposable test shell. Also run a separate disposable `postgres:16` instance on port 5433 with database `craves_explorer_test`, username/password `postgres`, and set `EXPLORER_TEST_DB_URL=jdbc:postgresql://127.0.0.1:5433/craves_explorer_test`. Then run the Maven command above, `python scripts/email/require-email-test-evidence.py user-chef-service`, and `python scripts/user-chef/require-release-test-evidence.py`. The provided workflow configures these disposable environments automatically and needs no production secrets.

Web, from `apps/customer-web-next`: `npm ci --ignore-scripts`, then `npm run verify`. For interactive local use, configure `.env.local` from `.env.example` and run `npm run dev`. Use a test identity and a test backend with V13 and readiness deployed.

Mobile, from `apps/mobile`: `npm ci --ignore-scripts`, `npx tsc --noEmit`, then `npm test -- --runInBand --runTestsByPath` with the seven file paths in the workflow. Start Metro with `npm start` and use `npm run android` on an Android SDK/emulator environment. iOS requires macOS/Xcode and the existing CocoaPods setup.

Manual journey: create Mom's House under Other, reload, edit and make default; select it from checkout and subscriptions; switch Home/Work/Other during editing; verify blank/81-character custom input cannot save. Repeat in the current mobile build. For Chef readiness, test no application, pending with missing files, uploaded files awaiting review, a rejected file, all four approved awaiting admin decision, approved application and a temporary Auth Service outage. Confirm a dish without an image still does not block discovery.

## Manual steps required

- [ ] Review the branch/PR and require the disposable PostGIS job to pass before release.
- [ ] Back up the target database using the existing operational process. Confirm Flyway has no previously applied V13 address-name migration; the owner has stated none exists. Stop if the actual target contradicts that fact rather than rewriting Flyway history.
- [ ] Deploy the User/Chef Service through the existing selected pipeline. Flyway applies V13 on startup. Verify service health, successful V13 history and a saved custom address round trip.
- [ ] Register the added Chef application readiness operation in the intended APIM environment with the existing script. APIM is the public gateway that forwards this authenticated request to User/Chef Service. Confirm unsigned calls return 401 and signed calls return the current applicant's checklist.
- [ ] Deploy the web build, then build/test/distribute the new mobile version. Do not restore an old enum-only backend after custom labels exist; use a reviewed forward fix or a planned data-safe rollback.
- [ ] Set new mobile versionCode/versionName for the intended store release according to the release owner's version policy. No store build number was guessed here.
- [ ] Complete device tests and use the existing Play Console / App Store signing and distribution process.

No new secret keys are required by this feature. Existing backend settings include `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, `CRAVES_JWT_VERIFICATION_PEM_BASE64`, `CRAVES_AUTH_INTERNAL_BASE_URL` and `CRAVES_INTERNAL_SERVICE_SECRET`. Keep values in the existing Azure secret configuration/Key Vault or secured pipeline variables, never in chat or source.

Web uses existing `CRAVES_API_BASE_URL` and public `NEXT_PUBLIC_FIREBASE_*` SDK settings. Mobile uses `CRAVES_ENVIRONMENT`, `CRAVES_API_BASE_URL` and the authorized Firebase mobile configuration. Android signing uses the existing exact keys `CRAVES_ANDROID_KEYSTORE_PATH`, `CRAVES_ANDROID_KEYSTORE_PASSWORD`, `CRAVES_ANDROID_KEY_ALIAS`, `CRAVES_ANDROID_KEY_PASSWORD` in the secure build environment. No DNS changes, new Azure resources, paid-resource creation, Firebase-provider changes or Cashfree merchant actions were performed or required by this code change.

## Operational limitations and next decisions

No million-concurrent-user capacity claim is made. This readiness endpoint performs database reads and an Auth Service call on demand; it does not poll continuously. Load tests, connection limits and dependency timeouts must be reviewed as part of launch sizing. A new four-step readiness checklist is not a full persisted multi-step onboarding engine.

The project instructions mention App Service/AKS and Cashfree, while the current repository contains Container Apps and Razorpay-related code. This task preserves the current deploy scripts and does not choose a new infrastructure or payment architecture. The owner must settle those platform/provider choices before a broader deployment redesign.

Next module decisions: freeze the FSSAI functional contract; freeze kitchen/profile-media rules; confirm the production finance API for mobile. Then implement and validate one module at a time. The handover PDF includes a source appendix; the source ZIP contains runnable files rather than truncated snippets.

## Conversation record and evidence limits

User request: inspect `Craves_Updated_Combined.pdf` and explain what needs to be done. Follow-up: complete the proposed changes, focus on new versions and disregard the older proposal. Migration clarification: "No, it has never been applied." Chef clarification: the four current evidence types and verified email are authoritative; discovery has four operational conditions; FSSAI and new kitchen/profile-media rules are undefined; existing KYC/menu-image limits and finance eligibility rules must be preserved; mobile payout integration needs the production contract selected.

The assistant inspected the PDF and current repository, implemented the address contract, added current application readiness, corrected stale evidence UI/capability claims, added focused verification and prepared release instructions. This is an auditable decision record of the available conversation, not a fabricated verbatim transcript of unseen earlier chats. Tool logs and secrets are intentionally excluded. Final artifact validation and remote CI results are recorded separately when available.
