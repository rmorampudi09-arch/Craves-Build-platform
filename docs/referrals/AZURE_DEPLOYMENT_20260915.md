# Azure referral backend deployment — 2026-09-15

Backend artifacts are deployed privately. Referral programme activation and full production acceptance remain pending. No frontend was implemented. Both PRs remain draft and unmerged.

## Deployed versions

| Component | Azure run | Application source | Final ready revision |
| --- | --- | --- | --- |
| Auth | [39022](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39022) | `151c36cb2afaaf7b8482ee784704d983f7d87324` | `ca-craves-auth-service-prodlow--0000042` |
| Order | [39024](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39024) | `151c36cb2afaaf7b8482ee784704d983f7d87324` | `ca-craves-order-service-prodlow--0000089` |
| Integration | [39025](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39025) | `036b3211b2e81465699766f7d8104a4199c67723` | `ca-craves-integration-service-pr--0000157` |
| Referral | [39033](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=39033) | `036b3211b2e81465699766f7d8104a4199c67723` | `ca-craves-referral-prodlow--0000001` |

Private app: `ca-craves-referral-prodlow`, resource group `rg-craves-prodlow-centralindia`.

Image: `cravesprodlowacr82121.azurecr.io/craves/referral-service@sha256:9b110d10541e976462c792e1d8b749754b2d8ba214fa85c7875d9d8346a2f2d0`.

The new isolated database is `craves_referral_db`; runtime role `craves_referral_runtime` has restricted DML privileges and no migration-history or Auth identity access. All nine SQL migrations applied. Its managed identity has registry pull and access to seven individual Key Vault secrets; no migration-password grant. Ingress is private, all seven programme flags are false, and source adapters remain disabled.

## Verification

- Full candidate Bash / Java 21 / PostgreSQL 16: 1,008 tests, 924 passed, 84 unrelated skips, zero failures/errors. Required suites had zero skips. Workflow 34965959043; 18 successful candidate workflows.
- Deployed Auth/Order compatibility candidate: 279 tests, 226 passed, 53 unrelated skips, zero failures/errors. Required suites had zero skips. Workflow 34965504797; five successful candidate workflows. These overlap with the full candidate and are not additive unique tests.
- Existing Auth, Order and Integration Azure pipelines repeated build/tests and rollout verification.
- Seven deployment-plan tests passed. Corrected Bicep compiled successfully in Azure Cloud Shell. Python and Bash syntax checks passed.
- Seven existing Java readiness endpoints returned 200/UP, three existing web roots returned 200, and delivery intelligence was Running at the control plane. Eight unrelated apps retained their ready revisions.
- Final comparison at 2026-09-15T13:37:02.677141+00:00 confirmed all 11 existing app runtime-configuration hashes unchanged from the pre-core baseline. Use the standard Azure CLI output format for hashes: the preview containerapp extension returns a different schema.
- Referral final revision is Healthy / RunningAtMaxScale (one configured replica), with latestReadyRevisionName matching latestRevisionName.

## Live startup correction and private smoke

Run 39033 provisioned the private app but its initial revision later failed activation. The private smoke job found the failure; Java rejected an empty Redis host in AUTH_HTTP mode. Removing the four unused SPRING_DATA_REDIS_* overrides from only the referral app created revision `0000001`; application image, programme flags, secrets, database and other apps were unchanged. Bicep now only binds Redis settings in REDIS mode. The deployment script now requires three consecutive healthy runtime observations before reporting success.

The first smoke execution `cj-craves-referral-check-39033-blspo4j` failed before the correction. The repeat `cj-craves-referral-check-39033-oeniz77` succeeded, 13:33:51–13:34:14 UTC. Bash ran inside the same private environment using the exact referral image, with certificate and hostname verification enabled:

```text
2026-09-15T13:34:06.065921671Z PASS GET /actuator/health/liveness HTTP=200 marker="status":"UP"
2026-09-15T13:34:06.173810498Z PASS GET /actuator/health/readiness HTTP=200 marker="status":"UP"
2026-09-15T13:34:06.261155439Z PASS POST /internal/v1/referrals/events HTTP=401 marker=INVALID_SOURCE_HEADERS
2026-09-15T13:34:06.352590630Z PASS POST /internal/v1/referrals/operations HTTP=401 marker=INVALID_SOURCE_HEADERS
2026-09-15T13:34:06.456895368Z PASS GET /api/v1/referrals/me HTTP=503 marker=REFERRALS_DISABLED
2026-09-15T13:34:06.561438172Z PASS GET /api/v1/referrals/admin/policies HTTP=503 marker=REFERRALS_DISABLED
2026-09-15T13:34:06.561468681Z REFERRAL_PRIVATE_SMOKE_PASS checks=6 no_business_writes=true
```

The manual test job `cj-craves-referral-check-39033` has no schedule and is no longer executing. It accepts no production secrets and performs no business writes. Its scripts are `scripts/referrals/run-private-smoke.py` and `scripts/referrals/smoke-private-backend.sh`. The creation wrapper deliberately refuses an existing job; reruns use Azure's job start command after checking the image, flags and current healthy revision.

Earlier provisioning-only stops were resolved: Flyway schema-record counting, scoped identity grants, Azure resource-ID case, and region formatting. Failed attempts did not enable programme flags or alter other apps. Do not rerun the first-deployment script against the existing app: its safety guard intentionally refuses replacement.

## Still required before activation

Supply actual programme review/terms/funding records, reviewed financial thresholds, two distinct eligible administrator approvals, beneficiary/KYC/tax evidence, and separate production RazorpayX payout configuration. Complete source origin/HMAC bindings, approved routing and authenticated cross-service acceptance before enabling customer referral activity. Collection credentials were not repurposed; no live-money transaction was performed.

Load/capacity, alert delivery, backup restore and rollback/drain rehearsal against agreed targets remain unverified. The shared PostgreSQL service remains Burstable Standard_B1ms with seven-day backups. This deployment is not certification of full production capacity. Full child refunds for chef decline/acceptance timeout are in the verified contract; arbitrary partial/post-delivery refunds are outside it.
