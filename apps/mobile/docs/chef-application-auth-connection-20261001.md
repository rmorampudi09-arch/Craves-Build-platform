# Chef Application Address Submission: Auth Connection v1

Recorded 2026-10-01, Asia/Calcutta. User request: fix Chef application submission
failing to save the entered address. This is a live configuration correction,
not a screen redesign, address-policy change or new APK.

## Cause

The existing mobile `ChefRegistrationScreen` sends the expected application
fields to `POST /api/v1/chef/application`. Required address line 1, city and state,
plus optional address line 2, landmark and postal code, match the backend DTO
and database limits. Coordinates are optional. No incorrect JSON field mapping
was found that would justify rewriting the form.

The live Chef service instead had this setting:

```text
CRAVES_AUTH_INTERNAL_BASE_URL=https://apim-craves-prodlow-kmqgfy.azure-api.net/api/v1/auth
```

The exact running backend's `AuthInternalClient.requireVerifiedEmail` permits
only an HTTPS service origin without a non-root path, credentials, query or
fragment. It rejects this `/api/v1/auth` path with `503 EMAIL_AUTHORITY_UNAVAILABLE`.
`ChefApplicationService.submitApplication` invokes that check before reading the
existing application status or performing the application INSERT/UPDATE. Thus
the connection misconfiguration prevents the address and other fields saving;
changing the submitted address cannot repair it. The app safely presents 5xx
failures as temporary unavailability instead of exposing internal exceptions.

This cause was confirmed against the deployed JAR's actual class disassembly,
not just an assumption that the local backend matches production. The supplied
phone account's email-status read was also working; email verification was not
removed or bypassed. The user's exact failed submission response was not
captured, so this is a confirmed backend blocker, not proof it is the only
possible cause for every applicant.

## Exact Live Correction

| Item | Value |
| --- | --- |
| Subscription | `721906c9-4a72-4606-830b-d3e7ace093ff` |
| Resource group | `rg-craves-prodlow-centralindia` |
| Existing Chef service | `ca-craves-user-chef-service-prod` |
| Original revision | `ca-craves-user-chef-service-prod--0000008` |
| Corrected revision | `ca-craves-user-chef-service-prod--chef-auth-20261001` |
| Changed setting | `CRAVES_AUTH_INTERNAL_BASE_URL` |
| New value | `https://ca-craves-auth-service-prodlow.yellowdesert-9c7110ab.centralindia.azurecontainerapps.io` |
| Retained image | `cravesrm09prodlow6bf632.azurecr.io/craves/user-chef-service:activate-69` |
| Image digest inspected | `sha256:cd5b819909bedef99065269cca6dd69346865d3d40b45ddb33d3206ac74fb6da` |
| Running JAR SHA-256 | `BA15B7E06E7309025AACA6E7EB3E4ACFC75305ECA7CBD5EDCDB8223E16F724AD` |
| Auth client class SHA-256 | `8831EB544C8C8466513AA148AA89D1DA935008D183273D5A485537805B04AF95` |

Both services already belong to the same existing Azure environment. Their
`svc-secret` references resolve to the same existing Key Vault secret; no secret
value was printed, replaced, stored in this receipt or requested in chat.

The initial update was rejected because the combined service/revision name was
too long. Original revision and Auth URL were read back unchanged before retrying
with the shorter successful suffix. No rejected-name deployment is claimed live.

## Verification And Change Audit

- Final revision: Succeeded/Running/Healthy, active, one replica and 100% traffic.
- Liveness and readiness returned HTTP 200 with `{"status":"UP"}`.
- Inside the corrected revision, a signed read used its actual configured
  Auth URL and existing service credential. A nonexistent all-zero identity
  received `400 IDENTITY_NOT_FOUND`. This verifies TLS routing, service-secret
  authentication and access to the Auth lookup; it is not a real verified-email
  success, account enrolment or application-save claim.
- Anonymous application GET and POST return HTTP 401. The gateway was not edited
  and no anonymous application access was introduced.
- TypeScript passed with no app source changes.
- Mobile targeted tests: `profileApi.test.ts`, `chefApplicationOnboarding.test.ts`
  and `validation.test.ts`: 3 suites / 10 tests passed, 98.467s.
- Existing backend `AuthCanonicalEmailTest` and `AuthEmailHttpTest`: 6 tests
  passed, zero failures/errors/skips, build success in 1m 37s. These source tests
  preserve active-owner, verified/matching-email and safe transport guards;
  they are not production application POST tests.

The before/after **revision** templates were compared using the same API view.
After neutralizing only the changed Auth URL and revision suffix, and sorting
environment entries by name, both hashes equal:

```text
5E01A0C584E3E5ED4AEC3EF418938BE3F81FF1DB2DD48216AC6984C1793C77AA
```

The whole app configuration fingerprint also stayed identical:
`E98623E17EC6931BFEDEAE6F501459E140DB73DAD574440D776CF36CD3AFCE1D`.
Thus the actual running image, non-target environment values/references, probes,
resources and scale remained unchanged; ingress, identities/registry and secret
configuration were not edited. No new resource, database tier change, migration,
production SQL write, payment or financial policy change was made in this turn.

Earlier guards compared app-template and revision-detail representations, which
render optional/default fields differently. Those failed comparisons are retained
in the evidence directory and are explicitly superseded by the like-for-like
runtime comparison, not rewritten as successful tests. The original approved
revision remains a historical rollback record, not a working application URL.

## Source And Phone Checkpoints

Local repository/branch: `C:\mscratch` / `KUSHIRAVI-app-build`, clean before
investigation. Only this receipt and `C:\mscratch\apps\mobile\KUSHIRAVI_VERSION.md`
are updated and committed locally. Configuration checkpoint tag:
`KUSHIRAVI-chef-application-auth-v1`; this tag records the connection correction,
not a new Android binary. No GitHub push or original-source-branch edit.

Phone remains `com.cravesapp`, versionCode 29 / versionName 1.18, installed from
`KUSHIRAVI-app-v1.18`, source `f1d6ad5a3a30e3920dcaa88d628eb4ec24cdde0a`.
APK: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18.apk`.
Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-app-v1.18-source.zip`.
Neither artifact, tag, app data, login state nor screen layout was changed.
The corrected server setting applies to the existing app; no reinstall needed.

Relevant unchanged source paths:

- `C:\mscratch\apps\mobile\src\features\auth\screens\ChefRegistrationScreen.tsx`
- `C:\mscratch\apps\mobile\src\features\auth\api\profileApi.ts`
- `C:\mscratch\apps\mobile\src\features\auth\domain\chefApplicationOnboarding.ts`
- `C:\mscratch\apps\mobile\src\utils\validation.ts`
- Main backend reference: `services/user-chef-service/src/main/java/in/craves/userchef/service/AuthInternalClient.java`
- Main backend reference: `services/user-chef-service/src/main/java/in/craves/userchef/service/ChefApplicationService.java`

Main branch was inspected read-only at `13710384b90d09c76ea5bed64fdfe6342975e697`;
the deployed JAR, not that branch alone, established the running guard behaviour.
The separate backend worktree `C:\mscratch-referral-backend` was used only for
existing focused tests and remains unchanged in Git.

## Manual Acceptance And Rollback

1. Use a genuine new or rejected Chef applicant, not an already approved Chef.
2. Reopen the existing Become a Chef application screen and verify the entered
   Chef email through the normal flow if it is not already verified.
3. Enter the real required address, city and state, then Submit for review.
4. Confirm application status PENDING, then verify the application readback
   contains that exact address and optional details. No approval is implied.
5. For a rejected application, correct the real details and confirm resubmission
   clears the old review state according to the existing backend flow.

This real-applicant save/PENDING/readback check remains pending. The connected
phone account already has approved Chef access; it was not overwritten, signed
out, granted another role or used to fabricate a new successful application.
No OTP, fake applicant, approval, consent or invitation was created.

For future deployment, keep the internal Auth setting at the service HTTPS
origin, not the public `/api/v1/auth` prefix. The public app API base remains
`https://api.craves.in`; do not replace it with the private/internal service URL.

Emergency configuration rollback, only after investigating a genuine regression:

```powershell
az containerapp update --name ca-craves-user-chef-service-prod `
  --resource-group rg-craves-prodlow-centralindia `
  --subscription 721906c9-4a72-4606-830b-d3e7ace093ff `
  --set-env-vars CRAVES_AUTH_INTERNAL_BASE_URL=https://apim-craves-prodlow-kmqgfy.azure-api.net/api/v1/auth `
  --revision-suffix chef-auth-rollback -o none
```

Warning: this restores the original known-bad connection and reintroduces the
verified-email submission blocker. It is not a recommended routine action.
Switching an Android tag does not undo a live server configuration change.

## Evidence

Directory: `C:\mscratch\artifacts\chef-application-fix-20261001`.

- `service-before.json`: sanitized original revision, URL and fingerprints.
- `service-after.json`: rollout readback and original failed strict view guard.
- `template-semantic-diff.json`: failed mixed-API-view diagnostic comparison.
- `revision-runtime-verified.json`: final same-view runtime equality, health,
  active replica and traffic result. This is the authoritative change guard.
- `app\app.jar`, `AuthInternalClient.class`, `ChefApplicationService.class`:
  inspected immutable-image runtime; not rebuilt or deployed modified.
- Focused backend reports retained in the evidence directory:
  `backend-AuthCanonicalEmailTest.txt` and `backend-AuthEmailHttpTest.txt`.
  Only newly generated, non-ignored test output is removed from the backend
  worktree after retaining these reports; existing ignored build files remain.

No bearer token, ACR credential or shared-service secret is saved in these
receipts. Registry authentication was handled in process memory only; container
diagnostic shells were closed. Off-app phone content was not used as evidence
of Chef application behaviour.
