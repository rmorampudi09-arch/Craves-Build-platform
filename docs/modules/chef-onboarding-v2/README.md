# Craves chef onboarding v2

This module changes new web chef applications, their evidence requirements, the admin learning-content workspace and FSSAI help requests. Existing approved chefs stay on their existing screens and keep their approval. Existing legacy pending applications retain their original evidence rules. There is no tax approval, rate, commission, payment, order, delivery or mobile-app change.

## Product decisions recorded

- Personal details: name, DOB, the authenticated phone number, and an email verified through the existing Craves email OTP flow.
- Kitchen: name, description, pickup address/location, and exactly two photo slots.
- Selected proof: Aadhaar or another government ID requires front/back. PAN or bank statement is a single-file alternative, as explicitly selected by the user.
- A missing FSSAI document saves progress and resumes the FSSAI screen at every Chef entry. Learning or support does not complete the document requirement.
- FSSAI step offers licence upload, language-specific learning, and Craves help.
- The existing admin Chef approval is still the final decision. No new finance approval is introduced.
- The bank-statement option is labelled as selected proof; the code does not claim that a bank statement is a government-issued identity document.
- Language selection supports English and the 22 scheduled Indian languages. Content must actually be supplied by administrators in each language; the application does not invent translations.

## Files and ownership

Java code is under services/user-chef-service/src/main/java/in/craves/userchef/onboarding/.
V14__chef_onboarding_v2.sql is additive and preserves existing rows and decision history.
ChefApplicationService applies new requirements only when a v2 draft exists.
The Next.js chef and admin entry points, DTO parsers, safe BFF routes and components are under apps/customer-web-next/src/.
The new admin destination is /admin/chef-onboarding.
The scoped APIM script is scripts/apim/configure-chef-onboarding-v2-apim.sh.
CI is .github/workflows/chef-onboarding-v2-ci.yml. It verifies code and packages complete changed files. It does not deploy.

## Local setup and testing

Use Java 21 and Maven for User/Chef, and Node 24 plus npm for the existing Next.js app.
Run from the repository root:

mvn -B -ntp -f services/user-chef-service/pom.xml verify

In apps/customer-web-next run npm ci, npm run lint, npm run typecheck, npm test and npm run build.
Use the module's GitHub CI PostgreSQL service to run the disposable database suite. That suite intentionally refuses production databases and requires its explicit CI-only database guard.
The existing service README and .env examples remain the source for database, storage and JWT configuration. Do not paste secrets into chat.

## Configuration and manual steps required

- Deploy the User/Chef image containing V14 before enabling the new screens. Confirm migration success and normal aggregate health.
- Configure the new APIM routes using the scoped script or azure-pipelines-chef-onboarding-v2-apim.yml. The pipeline references Craves-RMORAMPUDI09-Service-Connection. Confirm that this Azure DevOps connection reaches the existing Azure subscription owned through Ramkumar's account; do not create or rotate credentials merely to run this release.
- Set CRAVES_CHEF_ONBOARDING_V2_ENABLED=true on User/Chef, customer web and the routed admin web for coordinated activation. It defaults to false.
- Optional contact overrides are CRAVES_ONBOARDING_SUPPORT_PHONE and CRAVES_ONBOARDING_SUPPORT_EMAIL. Defaults match the current repository Contact page: 8367366787 and support@craves.in.
- Reuse CRAVES_STORAGE_ENDPOINT_VALUE and CRAVES_STORAGE_DOCUMENTS_CONTAINER from the service's existing secret binding. No new credential is required.
- For direct admin video uploads, append Azure Blob CORS rules permitting the actual admin origin (and localhost for local testing), PUT/OPTIONS, Content-Type, If-None-Match and x-ms-blob-type. Preserve existing CORS rules for other applications.
- Video files upload directly to the existing private blob container using a 15-minute, create-only SAS. Playback uses a 10-minute read-only SAS. The application never logs or stores SAS URLs in database records.
- No Azure resource is provisioned by this module. Uploaded videos consume storage and bandwidth in the existing paid storage account.
- Administrators must add and publish real FSSAI guidance for each language; empty languages explicitly offer support instead.
- No Firebase, MSG91, Cashfree/Razorpay, DNS, mobile store or signing configuration changes are required.
- Perform a protected preview smoke test with synthetic accounts before routing production traffic.

## Required preview acceptance checks

1. New chef personal details save only after the current email verification passes; no alternate SMS implementation is added.
2. Kitchen details and two images persist. PDF cannot fill either kitchen-photo slot.
3. No FSSAI: save, sign out, sign in and open Chef Mode. Resume at FSSAI with saved details.
4. PAN and bank statement each show one proof slot. Aadhaar/other ID show two.
5. Direct API submission and direct admin approval fail when FSSAI or required evidence is missing.
6. Duplicate help submission returns the same open case. Admin sees the saved contact, DOB, kitchen, location, language and message snapshot.
7. Unpublished content is absent from Chef learning. Publishing only affects the selected language.
8. Upload an actual MP4/WebM via admin, finalize, preview and publish; verify Blob CORS and private access.
9. Approve each required file, then the application. Existing Chef access/finance behavior stays on the previously implemented approval path.
10. Existing approved Chef sign-in, kitchen/menu publishing, customer checkout and current mobile API calls remain unchanged.

## Rollback and limits

Retain the database migration and evidence history. Never run a destructive down migration.
A new draft must not be forced onto the old four-document UI. If rolling back after enrollment, keep the onboarding service/APIM/web path available for those drafts or coordinate a controlled migration first.
The create-only video ticket relies on the existing storage credential being able to issue a service SAS. A storage account that disables shared-key authorization needs a user-delegation SAS adaptation before video uploads can be enabled.
The admin content list currently shows the most recent 100 items and published language lists show the most recent 50. Help requests use cursor pagination.
The new module alone is not evidence of capacity for one million concurrent users; storage streaming helps avoid large video buffers, but capacity and operational load require separate measurement.
This package contains complete changed files for overlay on base commit a79d0d83de730715597956d82da9970b78323152. It is not a standalone replacement for the whole repository.

## Execution status

Implementation is prepared for verification. Production activation, a live OTP flow and an actual Azure video upload must be confirmed separately; they are not assumed from code or unit tests.
The local terminal in this session could not start because the host sandbox reported helper_sandbox_lock_failed. Repository inspection and edits therefore use the connected GitHub repository.

## Reviewed release corrections (8 October 2026)

The migration regression now counts V14 and verifies that applying V14 after V13 preserves saved address labels. The full launch regression and address workflow use separate disposable onboarding databases. Required suite evidence includes all six onboarding database tests and five Chef workspace tests; skips cannot qualify as a release.

The FSSAI Continue action explains a missing 14-digit number or missing licence document. Save progress for later still accepts an incomplete FSSAI step. Neither learning nor help can substitute for evidence.

The APIM script is limited to subscription 721906c9-4a72-4606-830b-d3e7ace093ff, tenant 1e7e43ac-c7f5-4d47-a74f-289a7cc21508 and the current reviewed APIM name apim-craves-prodlow-kmqgfy. Azure live inventory has not been verified in this session; target/account mismatches stop before writes.

Register azure-pipelines-chef-onboarding-v2-web.yml in Azure DevOps rmorampudi09 / Craves if a pipeline using this YAML does not already exist. It builds apps/customer-web-next using the existing guarded release helper, targets ca-craves-web-prodlow in rg-craves-prodlow-centralindia, and reuses cravesrm09prodlow6bf632. Do not use azure-pipelines-customer-web.yml for this release: that file builds the older Vite app.

Choose operation=preflight first. Supply releaseSha as the exact merged-main commit and regressionRunId as its successful Craves complete launch regression CI run. Choose operation=web and confirmDeploy=true for the authorized release only after backend V14 and onboarding APIM routes are ready; then use status. The helper refuses unknown/checksum-conflicting migrations, unapplied V14, missing protected routes, another backend source or unrelated live configuration changes. Feature flags still require coordinated activation on backend, customer web and the admin application that actually serves /admin.

Use the existing focused address-readiness pipeline's backend operation to roll out the matching User/Chef image with the reviewed V14-aware release tools. The scoped onboarding APIM pipeline configures only the new routes. Do not run generic infrastructure/rebuild pipelines for this module.

Local release-guard checks:
python -m unittest discover -s scripts/release/tests -p test_rmorampudi09_preflight.py -v
python -m unittest discover -s scripts/release/tests -p test_active_address_release.py -v

The session can commit to GitHub and launch its CI, but cannot currently open Azure DevOps or execute Azure CLI: the browser/terminal host runtime failed to initialize and the connected workstation is offline. Azure pipeline registration, queueing, live image verification and coordinated feature activation remain pending. No production deployment is claimed.
