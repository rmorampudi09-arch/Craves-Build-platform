# Existing-resource public launch configuration

`azure-pipelines-public-launch-configuration.yml` plans and applies one reviewed
configuration phase. It does not deploy images, create Azure resources, grant
permissions, publish API routes, change replica settings, call an email/payment
provider, or create business/tax/chef/finance records. No bank or Razorpay flag is
written. Use [BANK_ONBOARDING.md](../finance/BANK_ONBOARDING.md) and its existing
configuration pipeline for bank references and the existing Order/Integration
finance posting key. Do not replace that workflow with this one.

Related contracts are [email verification](../auth/EMAIL_VERIFICATION.md),
[Catalog finance eligibility](../finance/CATALOG_SELLING_ELIGIBILITY.md), and
[manual Craves settlement](../finance/MANUAL_CRAVES_SETTLEMENT.md). The combined
reviewed release must contain those modules before activation.

## Reviewed release sequence

1. Refresh the approved repository/PR, main, release head, full CI and runtime.
   Preserve one exact 40-character reviewed SHA through all plans and builds.
   The script rejects a different checkout or modified tracked source.
2. Verify existing approvals and the exclusive lock on
   `Craves-Dev-Service-Connection`; pause other writers for this release window.
   `lockBehavior: sequential` consumes a configured lock; it does not create one.
   Azure updates across apps and Key Vault are not a transaction, and Key Vault
   secret creation has no atomic absent-only CLI option. The script rechecks
   absence immediately before creating a missing key; serialized ownership is
   also mandatory. It never deliberately creates another version of a named key.
3. Run `applyConfiguration=false`, `phase=provision`, with the reviewed
   `expectedReleaseSha`. A missing evidence file permits a read-only plan with
   blockers, never an apply. Inspect all redacted variables, references, hashes,
   running revisions, traffic and blockers in `public-launch-plan.json`.
4. Run the same phase/SHA with `applyConfiguration=true`, the same approved
   redacted evidence secure file and the plan-only `reviewedPlanRunId`. Any
   intervening runtime/configuration/evidence change requires a fresh plan.
   Missing keys and origins are provisioned with **new gates false**. Existing
   explicit gates retain their values so committed reconciliation is not stopped
   by a configuration rerun. Review existing true gates in the plan.
   Provision fails if missing email keys/origins would make an already-enabled
   capability or worker start processing. Review the queue and safely stage that
   capability separately; the script never resets an established worker for you.
5. Deploy compatible dependencies through the existing targeted reviewed
   pipelines. This configuration pipeline deploys no service. Record successful
   source builds, immutable image references, healthy revisions, actual single
   replicas, full traffic, complete matching migration histories and authenticated
   connectivity. Activation requires images pinned as `repository@sha256:...`;
   resolving a mutable registry tag alone is not running-image proof.
6. Obtain a new plan and apply for each activation phase below, using refreshed
   evidence after every revision change. Keep all source/build/configuration SHAs
   identical. Do not synthesize records or provider calls to pass a guard.

| Phase | Changes | Required deployed evidence |
| --- | --- | --- |
| `provision` | Missing four scoped key references, discovered origins, explicit false for absent gates | Actual runtime/migration preflight, privacy, existing identity/permission and release lock |
| `email-processing` | Notification transport, Auth projection worker | Auth→Notification and Auth→User/Chef authenticated connectivity and reviewed queued exposure |
| `email-capability` | Auth email verification capability | Processing already enabled; authenticated public email routes and owner/role denial |
| `finance-processing` | Integration finalization, authoritative source readiness, ledger posting and manual settlement | Saved reviewed DRAFT or ACTIVE finance policy with genuine business/tax evidence; source checkout closed; source/read connectivity and denial |
| `order-checkout` | Order source enabled and dispatch enabled | Compatible Integration gates, saved ACTIVE policy, statement ownership, fresh signed Catalog eligibility matching that policy with at least one eligible chef |

The reviewed policy can be a genuine **DRAFT** while Integration processing is
enabled: policy activation itself requires those compatible gates. Activate the
reviewed policy through the existing authenticated finance workflow next; only
then plan source checkout. This script never activates or edits a policy.

The policy guard retains a 7% chef service fee, separately approved fee GST,
requested ledger start date `2026-09-14`, 48 elapsed hours for automatic payout
eligibility, and manual-only payouts for this launch. Actual activation time and
the first covered accepted checkout are separate evidence. Existing orders and
delivery timestamps are never rewritten. The manual-withdrawal per-IST-day and
concurrency rules remain in the finance service, verified by its acceptance CI.
RazorpayX production approval, Razorpay worker and bank provider gates must stay
absent/default false or explicitly false during manual finance activation.

## Runtime and secret guards

The script discovers origins and the shared existing vault from these existing
apps in `rg-craves-prodlow-centralindia`; no hostname is supplied by an operator:

| Role | Existing app |
| --- | --- |
| Auth | `ca-craves-auth-service-prodlow` |
| User/Chef | `ca-craves-user-chef-service-prod` |
| Notification | `ca-craves-notification-service-p` |
| Integration | `ca-craves-integration-service-pr` |
| Catalog | `ca-craves-catalog-service-prodlo` |
| Order | `ca-craves-order-service-prodlow` |
| Web (read only) | `ca-craves-web-prodlow` |

Every app must have one container, `minReplicas=maxReplicas=1`, exactly one healthy
active running revision, existing `activeRevisionsMode=Single`, one actual replica
and 100% traffic to that revision. The entire normalized running template,
including environment variables/gates, must match the current app template;
matching the image alone cannot prove new configuration is running. The image
must match the existing
`cravesprodlowacr82121` registry in the same subscription/resource group. The
provision plan labels a tag lookup `existing-registry-resolution`; activation
requires `immutable-image-reference`. Post-update read-only readiness waits up to
60 seconds, including the reads; a warming or unhealthy readback then fails
closed. Wait for normal health and refresh the plan/evidence instead of relaxing
the guard or increasing replicas.

Three independent email keys serve Auth-only hashing, Auth/Notification signed
transport, and Auth/User/Chef projection. A fourth independent key serves
Catalog/Integration read-only eligibility. Each must also differ from the
existing Order/Integration finance posting key. Reuse compatible existing pinned
Key Vault versions. Inline or versionless dedicated keys, conflicting shared
values, disabled/expired/short keys, ambiguous identities, alias/name collisions,
unreviewed custom/conditional permissions, or absent access fail closed. Working
customer payment, ACS, Firebase, document and bank encryption references are
preserved; no provider credentials appear in plans or logs.

Missing values use cryptographic randomness and a temporary mode-0600 file passed
to Azure CLI, never a command-line secret value. Azure stdout/stderr is captured.
Before and after each app write, hashes cover all unrelated app settings,
identities, tags, resources, images, traffic and protected secret values/versions.
Only owned settings and Azure-computed status/revision metadata are excluded.
Any unrelated drift stops subsequent work. Existing keys and history are retained
even if a later app fails.

## Approved preflight evidence

Supply a bounded JSON object (maximum 512 KiB) as an approved Azure secure file.
It contains redacted observations from authenticated runtime/database/release
inspection, not secret values, cookies, bank bodies, OTPs or full account data.
The evidence is hashed into the plan but is not published with the artifact.
Every `checkedAt` is a genuine UTC ISO timestamp no more than two hours old.
All hashes below are lowercase SHA-256 hex of retained restricted evidence.
Do not fill synthetic/example data into a real approval record.

| Field | Required contents |
| --- | --- |
| `schema`, `sourceSha`, `checkedAt` | `1`, exact reviewed SHA, fresh observation time |
| `releaseControl` | `protectedResource="Craves-Dev-Service-Connection"`, verified `exclusiveLockEnabled=true`, `otherReleaseWritersPaused=true`, `checkedAt`, `reviewedEvidenceHash` |
| `services.<role>` | Actual `revision`, `image`; every backend also `appliedMigrations` |
| `appliedMigrations[]` | Exactly `version` (numeric string), `checksum` (signed integer Flyway checksum), `success=true`; every applied version must match the selected source SQL |
| Each service during activation | `buildSourceSha`, `imageDigest`, numeric `pipelineRunId`, matching current immutable image/revision |
| `connectivity.<name>` | `result="PASS"`, exact `sourceSha`, `checkedAt`, `evidenceHash` for the phase's actual authenticated success and denial checks |
| `queuedExposure` | `checkedAt`, `reviewedEvidenceHash`, exact `counts` and `approvedMaximums` objects; integers, nonnegative, counts within approved bounds |
| `financePolicy` | Actual saved `savedPolicyId` UUID, `state`, nonnegative `revision`, `contentHash`, `reviewedBusinessEvidenceHash`, `checkedAt`, actual reviewed `settings` |

Queue categories are `emailChallengesPending`, `emailProjectionPending`,
`bankValidationsQueued`, `payoutsQueued`, `sourceEventsQueued`, `sourceExceptions`,
and `unknownTransfers`. Review each count and permitted bound before activation;
a one-owner acceptance session never authorizes all queued provider work.

Connectivity names are `auth-notification`, `auth-user-chef`,
`authenticated-email-routes`, `order-integration-source`,
`catalog-integration-read`, `finance-auth-owner-denial`, and
`statement-owner-denial`. Phase requirements are in the table and guard source.
These receipts must represent deployed tests, not mocked CI. An anonymous 401
alone does not satisfy an authenticated success/denial receipt.

Required policy settings are `ledgerStartDate`, `ledgerEnabled`,
`manualWithdrawalsEnabled`, `automaticPayoutsEnabled`, `automaticPayoutDelayHours`,
`chefFeeTaxTreatment`, `chefFeePercent`, and a nonempty genuine
`taxApprovalReference`. The reviewed evidence must substantiate the complete
saved policy and real business/chef records, not just those mechanically checked
fields. The script does not invent or infer tax rates, turnover, consent or
approvals. Activation requires all checked-in migrations for all six backends;
provision permits a matching applied subset before deployment. No SQL is changed
and no Flyway repair is performed.

## Privacy, evidence and recovery

Existing APIM shared global ancestors and every nonexcluded API/product/operation
policy and diagnostic are read and hashed, regardless of public API name. The
same metadata-only delivery/provider exclusion as the authorized runtime audit
is applied before API/operation policy reads. Excluded scopes are recorded by
metadata hash, left unchanged, and never claimed to have passed this privacy
review. Message bodies, cookies, authorization/signature/internal-key headers
must not be logged. The private email transport/projection, finance quote/event/
eligibility and chef-bank identity contracts must not have public operations or
rewrites. The historical Catalog internal kitchen read and existing delivery
routes are preserved; their controller authorization remains mandatory. No route
is added or modified. Public bank leaf routes still use the bank pipeline;
other public Auth/finance leaf routes require separately reviewed configuration.

This pipeline also does not configure Auth request protection or the operational
Explorer. Before public activation, separately verify the reviewed Auth
`CRAVES_AUTH_RATE_LIMIT_MODE=postgres`, explicit protection gate, bounded limits
and migrated PostgreSQL limiter, preserving existing Redis settings. Separately
configure the delivered Explorer feature gates and authenticated private
read-only service routes according to their reviewed modules, with owner/role
denial evidence. Their deployment/configuration/route acceptance remains part of
the combined release, not a completed side effect of these email/finance phases.

The only application request this script can make is the final phase's signed,
read-only Catalog eligibility probe against the discovered Integration origin.
It follows no redirects, caps the response at 64 KiB, has an eight-second total
deadline, verifies raw-response HMAC and freshness, rejects partial/empty/duplicate
chef lists and correlates the saved active policy. It creates no provider request,
order, financial snapshot, transfer or email.

Plans and per-app readbacks are exclusive-create mode-0600 files. Preserve the
pipeline artifacts and prior healthy immutable revisions as the rollback point.
After partial failure, stop new unsafe capability/source work, retain keys and
immutable records, inspect completed readbacks and re-plan from actual state.
Keep reconciliation for previously sent transfers and committed projections.
Do not reuse a stale plan, delete history, reset all flags, or restore an image
that can overwrite canonical email or bypass current financial holds.

Missing runtime inputs are the verified lock/approval state, exact build receipts,
fresh database histories, authenticated route/connectivity evidence, reviewed
queue counts/bounds, genuine saved policy/tax/terms records and active eligible
chefs. Required existing permissions include ARM/ACR/APIM/Key Vault reads, app
configuration writes, assigned-identity secret reads and service-principal secret
set only if a dedicated key is missing. Custom permissions require review; no
permissions are granted by this workflow. Never paste credentials into chat.

Tests use only in-memory Azure fixtures and mocked signed responses; they make no
cloud/provider request. Run `python3 -m unittest discover -s scripts/launch -p
'test_*.py' -v` and the existing bank configuration tests. Passing them is guard
regression evidence, not deployment or real email/payment acceptance.

Azure references: [approvals and exclusive locks](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/approvals?view=azure-devops)
and [specific-run artifact download](https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/download-pipeline-artifact-v2?view=azure-pipelines).
