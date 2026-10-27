# Production environment: what is current

This is the one place that says which Azure subscription, resources and pipelines are production. If anything else in the repo disagrees, this page wins and the other file is wrong. `scripts/release/tests/test_no_retired_azure_names.py` fails CI if a retired name below comes back.

Checked against live Azure on 26 and 27 Oct 2026 (read only).

## Current

| What | Name |
|---|---|
| Azure subscription | `721906c9-4a72-4606-830b-d3e7ace093ff` ("Azure subscription 1") |
| Tenant | `1e7e43ac-c7f5-4d47-a74f-289a7cc21508` |
| Resource group | `rg-craves-prodlow-centralindia` (Central India) |
| Container Apps environment | `cae-craves-prodlow-kmqgfy`, default domain `yellowdesert-9c7110ab.centralindia.azurecontainerapps.io` |
| Container registry | `cravesrm09prodlow6bf632` (`cravesrm09prodlow6bf632.azurecr.io`) |
| Key Vault | `kvcravesprodlowkmqgfy` |
| API Management | `apim-craves-prodlow-kmqgfy`; public host `api.craves.in` |
| Service Bus | `sb-craves-prodlow-kmqgfy` |
| PostgreSQL | `pg-craves-prodlow-kmqgfy` (`pg-craves-prodlow-kmqgfy.postgres.database.azure.com`) |
| Storage | `stcravesprodlowkmqgfy`; media `stcravesmediakmqgfy` |
| Redis | `amr-craves-prodlow-kmqgfy` |
| Azure Maps | `maps-craves-prodlow-kmqgfy` |
| Log Analytics / App Insights | `law-craves-prodlow-kmqgfy` / `appi-craves-prodlow-kmqgfy` |
| Front Door | profile `afd-craves-prodlow`, endpoint `craves-prodlow-721906c9-cfb3dyb2b7hnhee2.z02.azurefd.net`, WAF policy `craveswaf721906c9` |
| Email | `acs-craves-prodlow-721906c9`, `ecs-craves-prodlow-721906c9` (sender domain `notify.craves.in`) |
| DNS zone | `craves.in`: apex, `www`, `api` and `admin` point at the Front Door endpoint |
| Public hosts | `craves.in`, `www.craves.in`, `api.craves.in`, `admin.craves.in` |
| Migration backup | `stcravesbackup721906` in `rg-craves-migration-backup-centralindia` |
| GitHub repo | `rmorampudi09-arch/Craves-Build-platform` |
| Azure DevOps | org `rmorampudi09`, project `Craves`, service connection `Craves-RMORAMPUDI09-Service-Connection` |

Container apps (all in `cae-craves-prodlow-kmqgfy`, images from `cravesrm09prodlow6bf632`): `ca-craves-auth-service-prodlow`, `ca-craves-user-chef-service-prod`, `ca-craves-catalog-service-prodlo`, `ca-craves-order-service-prodlow`, `ca-craves-subscription-service-p`, `ca-craves-integration-service-pr`, `ca-craves-notification-service-p`, `ca-craves-referral-prodlow`, `ca-craves-delivery-intel-prodlow`, `ca-craves-web-prodlow` (behind `craves.in` and `www`), `ca-craves-admin-r92-ffe80e7c` (the admin portal, behind `admin.craves.in`). `ca-craves-referral-member-read` is internal only: part of the chef referral programme, with no traffic until its screens ship. The names are shortened where Azure limits required it; `config/production/azure-resource-inventory.json` holds the same values for scripts.

Each image tag is the GitHub commit it was built from. For an image pinned by digest, find its tag with `az acr manifest list-metadata -r cravesrm09prodlow6bf632 -n <repository>`. On 27 Oct 2026 every app behind Front Door or APIM ran a commit on `main`.

Leftovers (no traffic, not behind Front Door; do not deploy to them): `ca-craves-admin-web-prodlow`, an admin copy built on 30 Sep from the unmerged branch `fix/admin-operations-production-20260930`; and the manual job `cj-craves-referral-check-39033`, whose image registry `cravesramacr721906` no longer exists.

## Retired: never use

The first environment lived in another Azure account and is gone. Scripts that still use these names fail with "not found"; do not recreate them.

| What | Retired name |
|---|---|
| Subscription | `4f897b61-9b52-44b4-8cf1-bdac281cc1aa` |
| Tenant | `6ac26780-f774-41e0-bf31-45f5e6e7167d` |
| Resources | every name ending `l3ing6`: `cae-craves-prodlow-l3ing6`, `kvcravesprodlowl3ing6`, `apim-craves-prodlow-l3ing6` (`apim-craves-prodlow-l3ing6.azure-api.net`), `sb-craves-prodlow-l3ing6`, `pg-craves-prodlow-l3ing6`, `stcravesprodlowl3ing6` |
| Container registry | `cravesprodlowacr82121` (old release images were not copied) |
| Container Apps default domain | `happysand-aedc7165.centralindia.azurecontainerapps.io` |
| Email | `acs-craves-prodlow-4f897b61`, `ecs-craves-prodlow-4f897b61` |
| Front Door endpoint | `craves-prodlow-4f897b61-d4e6bvhscdbzbgbv.z01.azurefd.net` |
| Static Web App | `lemon-bay-06f924610.7.azurestaticapps.net` |
| Azure DevOps | org `ravitejamorampudi7777`, service connection `Craves-Dev-Service-Connection` |

Kept on purpose (old data or old builds): the mobile app's `LEGACY_PRODUCTION_API_ORIGINS` and the old menu-image URLs in `LegacyMenuImageRelocatorTest`. Dated documents (handovers, dated runbooks and release notes, launch-closure evidence) describe the retired environment and carry a "Historical" line at the top.
