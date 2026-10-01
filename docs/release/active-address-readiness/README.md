# Active Azure address/readiness release

A GitHub merge updates source control. It does not automatically update the live
Azure site. The active Azure pipeline was reading a different repository branch.
This release bridge builds the reviewed GitHub commit directly and uses the
existing Azure DevOps service connection.

## Verified environment (2 October 2026 IST)

| Setting | Active value |
| --- | --- |
| Azure DevOps organization / project | `rmorampudi09 / Craves` |
| Pipeline | `Craves-RMORAMPUDI09-Product-Activation`, definition 3 |
| Focused pipeline branch in Azure Repos | `codex/address-readiness-release-20261002` |
| Service connection | `Craves-RMORAMPUDI09-Service-Connection` |
| Azure subscription | `721906c9-4a72-4606-830b-d3e7ace093ff` |
| Tenant | `1e7e43ac-c7f5-4d47-a74f-289a7cc21508` |
| Resource group | `rg-craves-prodlow-centralindia` |
| Container registry | `cravesrm09prodlow6bf632` |
| User/Chef app | `ca-craves-user-chef-service-prod` |
| Web app | `ca-craves-web-prodlow` |
| API gateway | `apim-craves-prodlow-kmqgfy` |
| PostgreSQL server | `pg-craves-prodlow-kmqgfy` |
| User/Chef database | `craves_business_db` |

Read-only Azure run 155 confirmed matching V1-V12 migration checksums and no
applied V13. PostgreSQL reported seven-day backup retention and earliest restore
time `2026-09-24T22:12:04.155521+00:00`. This is provider metadata, not a restore
rehearsal or proof of a particular recovery point's data consistency.

Run 154 deployed Azure Repos web commit
`0472d7e58f9c205c60b55ca7d7475a3953f056c1`. The public version endpoint still
reported that commit during inspection. GitHub PR #400 was already merged as
`33f796e087f0260d2e72d96a2f9f67fe8c4c51ea`; its exact-main regression run
`36905723693` passed. These are separate facts: the merge was not a deployment.

## Correct execution order

Open [the active pipeline](https://dev.azure.com/rmorampudi09/Craves/_build?definitionId=3).
Choose **Run pipeline** and select the focused Azure Repos branch above. Do not
leave the branch on `codex/rmorampudi09-rebuild`: that branch has the older broad
product-activation operations. The focused branch shows `operation`,
`confirmDeploy`, `releaseSha`, and `regressionRunId`.

Use the same current merged GitHub main SHA and its successful **main** full
regression run ID for every step. The source verifier rejects stale main evidence,
PR-only evidence, missing jobs and expired aggregate evidence. If main changes,
select and validate the new main commit before continuing.

| Order | operation | confirmDeploy | Required result |
| --- | --- | --- | --- |
| 1 | `preflight` | false | Source evidence, V12/V13 compatibility, backup metadata and existing Key Vault references pass |
| 2 | `backend` | true | Reviewed User/Chef image healthy; final V13 recorded with matching checksum |
| 3 | `apim` | true | Reviewed backend confirmed; dedicated readiness operation registered; unsigned response 401 |
| 4 | `web` | true | Backend/V13/APIM guards pass; reviewed web image and public version verified |
| 5 | `status` | false | Current public source, payment readiness, protected routes and web replica health pass |

Run one operation at a time and wait for its successful result. Preflight reports
the missing readiness route as an expected pending rollout finding before steps
2-3. It does not claim the new application is live. A database/history failure
or invalid secret binding remains a hard failure. The web operation requires V13
to be applied and the readiness route to respond correctly first.

After step 2, use an authorized test customer to save/read/edit a custom label,
set the default, and verify checkout selects that address. After step 3, use an
authorized applicant to verify the signed readiness response and no-store
headers. These authenticated acceptance checks cannot be replaced by an unsigned
HTTP probe. Complete login, discovery, cart, checkout, order and Chef readiness
smoke checks after the web release. Avoid creating real payments merely to test
page loading. Mobile distribution follows web/backend acceptance.

## Files and safeguards

- `azure-pipelines-rmorampudi09-address-readiness.yml` is the reusable pipeline
  source. The existing Azure Repos pipeline path is a bridge to pinned GitHub
  tooling; the Azure DevOps branch contains its concrete tool commit.
- `scripts/release/rmorampudi09_preflight.py` performs scoped Azure reads and a
  read-only Flyway query. Passwords stay in process memory, use the existing Key
  Vault binding, and are not included in logs or artifacts.
- `scripts/release/active_address_release.py` enforces the target account,
  reviewed source, migration order, digest-pinned images and runtime preservation.
- `scripts/release/tests/test_rmorampudi09_preflight.py` checks migration conflicts,
  redaction and rejection of Azure writes.
- `scripts/release/tests/test_active_address_release.py` checks order, confirmation,
  concurrent releases and protection of payment/secret/scale settings.
- `.github/workflows/active-release-preflight-ci.yml` runs the focused tests.

Backend deployment reuses the existing runtime-preserving helper and checks its
Key Vault prerequisites before building. Web deployment changes only the image
and `CRAVES_BUILD_SHA`. It captures the previous immutable image and source,
guards against concurrent changes, and attempts guarded recovery when a web
rollout cannot be verified. The release remains failed even after successful
recovery. Database migrations are never rolled back by restoring an image.

The pipeline does not rebuild infrastructure, change scale bounds, enable an
ACR administrator, rotate bank/JWT/provider secrets, change payment modes, or
enable payouts. Existing production Razorpay settings remain production. No
FSSAI, kitchen-media or Chef-profile-photo rules are added.

## Remaining independent issues

The old GitHub Azure OIDC verification failed with `No subscriptions found`.
The working Azure DevOps service connection above is independent of those GitHub
secrets. The Azure DevOps read-only workflow now points to the current
organization, but this does not grant its old identity access to the new
subscription or organization.

If GitHub-to-Azure deployment is retained, an authorized administrator must verify
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` in GitHub repository
secrets and `AZURE_RESOURCE_GROUP` in repository variables. Use the intended
existing identity and federated trust; do not create broad permissions to silence
a failure. `AZURE_DEVOPS_ORGANIZATION=rmorampudi09` and
`AZURE_DEVOPS_PROJECT=Craves` are optional repository-variable overrides. Never
paste secret values into chat.

The Admin Analytics Explorer provenance failure is separate. Its recorded Auth
release does not match the complete Auth source tree. No Auth runtime change or
invented deployment metadata is included here. Reconcile the actual running Auth
image and reviewed source before changing the manifest. This is not a reason to
run the broad product-activation pipeline.

Dependency security alerts are also separate from the focused deployment fix.
Existing Dependabot PR #404 handles mobile Axios. Do not describe all repository
security findings as fixed by this pipeline work.

## Local verification and manual steps

Run from the repository root with Python 3.12 or newer:

```text
python -m unittest discover -s scripts/release/tests -p test_rmorampudi09_preflight.py -v
python -m unittest discover -s scripts/release/tests -p test_active_address_release.py -v
```

Azure operations run on the existing hosted Linux runner, which supplies Azure
CLI, Git, Docker, Python, Bash and PostgreSQL client tools. Local Azure credentials
are unnecessary for the unit tests. Full application regression must also pass on
the exact merged release SHA; lightweight unit checks alone do not authorize an
application release.

Manual checklist:

- Select the focused branch and exact successful main source/run pair in Azure
  DevOps, then execute the operation order above.
- Review current database recovery metadata before backend deployment.
- Complete authenticated address/readiness acceptance using intended test accounts.
- Repair the optional GitHub Azure identity separately if that path will be used.
- No new Azure resources, DNS changes, Firebase project, merchant account,
  credential rotation, store signing or billing changes are required by this fix.
