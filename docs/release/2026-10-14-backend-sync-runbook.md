# Backend sync release: auth, user-chef, order (and catalog) from main (2026-10-14)

Why: the admin explorer release record (`docs/admin/explorer/backend-release.json`) must name the auth, user-chef and
order code that is live, and CI ("Explorer release contracts") requires main's code for those three services to be
exactly that code. Today none of them runs main's code, so the check is red. This release puts all three live from
one merged main commit; afterwards Claude records that commit and the check turns green.

What goes live (from main, after PR #504 is merged):

| Service | Live today | New from main | Risk |
|---|---|---|---|
| auth | image of 6 Oct (`email-test-pairs-87eddd1c4563`) | live runtime lock (#491); the rest of main's auth is byte-identical to live (see `docs/runbooks/live-runtime-safety.md`) | low, no new migration (V19 already applied) |
| user-chef | image of 13 Oct (support assistant, #492) | live runtime lock (#491), kitchen photo route (#504) | low, no new migration |
| catalog | `chefapp-0d3f1912d` | kitchen photos (#504), migration V10 | low (see the kitchen photos runbook) |
| order | build `186` of 2 Oct | meal-plan fixes #487 (V36, jobs stay off), runtime lock #491, chef order details #493 (V37) | **medium**: two additive migrations, first main build since #489 restored 186's handoff code |

Images are tagged with the **full merged commit SHA**: the release record and the admin pinning script require
`tag == source`. Run in Azure Cloud Shell (Bash), one line at a time. **(Enter is yours)** marks production writes.
Go in this order and stop at the first problem: user-chef, catalog, auth, order.

## 0. Variables, code, rollback images

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 AUTH_APP=ca-craves-auth-service-prodlow USERCHEF_APP=ca-craves-user-chef-service-prod CATALOG_APP=ca-craves-catalog-service-prodlo ORDER_APP=ca-craves-order-service-prodlow SHA=<MERGED_SHA_FULL_40_CHARS>; export TAG=$SHA PGH=pg-craves-prodlow-kmqgfy.postgres.database.azure.com; echo "$TAG" | grep -qE '^[0-9a-f]{40}$' && echo "SHA ok" || echo "SHA must be the full 40-character commit"
```
```bash
rm -rf ~/c8 && mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA && git checkout -q --detach FETCH_HEAD && git rev-parse HEAD
```
```bash
for a in $AUTH_APP $USERCHEF_APP $CATALOG_APP $ORDER_APP; do echo "$a $(az containerapp show -g $RG -n $a --query 'properties.template.containers[0].image' -o tsv)"; done
```
Paste these four lines into the release notes: they are the rollback images.

Read-only database helper (never writes; reads the password from Key Vault without printing it):
```bash
psqlro() { PGPASSWORD="$(az keyvault secret show --vault-name kvcravesprodlowkmqgfy -n pg-pass --query value -o tsv)" PGSSLMODE=require PGOPTIONS='-c default_transaction_read_only=on' psql -h "$PGH" -U cravesadmin -d "$1" -c "$2"; }
```
Order migrations before (expect V34 checksum `1014493939`, V35 `-1559739371`, V36 applied or absent, no V37, no `f`):
```bash
psqlro craves_business_db "SELECT version, description, checksum, success FROM order_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"
```
Auth migrations before (expect V19 on top, all `t`):
```bash
psqlro craves_auth_db "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"
```
Anything else: stop and send the output to Claude.

## 1. Build all four images (no production change)

```bash
cd ~/c8 && for s in user-chef catalog auth order; do az acr build -r $ACR -t craves/$s-service:$TAG services/$s-service --no-logs -o none && echo "built $s" || { echo "BUILD FAILED: $s"; break; }; done
```
Expect `built user-chef`, `built catalog`, `built auth`, `built order`.

## 2. user-chef, then catalog

Follow `docs/release/2026-10-14-kitchen-photos-runbook.md` sections 1 to 3 with these variables already set (its
`TAG` is now the full SHA too; skip its `az acr build` lines, the images exist). Do not continue until catalog shows
the backfill log line and kitchens still load.

## 3. auth

**(Enter is yours)** image only, settings and secrets stay:
```bash
az containerapp update -g $RG -n $AUTH_APP --image $ACR.azurecr.io/craves/auth-service:$TAG -o none && az containerapp revision list -g $RG -n $AUTH_APP --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
Re-run the revision list until the new one is Healthy with traffic 100. Then sign in once on the app with a phone OTP
(customer and chef) and confirm it works. A start that fails with `LIVE_RUNTIME_LOCK` in the logs means the build lacks
live code: roll back (section 6) and send the log line to Claude.

## 4. order (last, the riskiest)

Check no rollout is running (`latest` equals `ready`, mode `Single`):
```bash
az containerapp show -g $RG -n $ORDER_APP --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,mode:properties.configuration.activeRevisionsMode}" -o jsonc
```
**(Enter is yours)** image only, keeps the handoff flags and secrets:
```bash
az containerapp update -g $RG -n $ORDER_APP --image $ACR.azurecr.io/craves/order-service:$TAG -o none
```
```bash
az containerapp revision list -g $RG -n $ORDER_APP --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
```bash
psqlro craves_business_db "SELECT version, description, checksum, success FROM order_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"
```
Expect V37 `chef_order_details` `t` on top, V36 `t`, V35 and V34 unchanged. A checksum mismatch or lock timeout means
the new revision never became ready and 186 keeps serving: send the logs to Claude, then roll back. Smoke: place a
small order in the customer app, accept it in the chef app (order details now show the deadline and note), and watch
the delivery handoff happen as before.

## 5. Tell Claude

Send the merged SHA and the four new revision names. Claude then opens a small PR that records
`{"source": "<SHA>"}` for auth, user-chef and order in `docs/admin/explorer/backend-release.json`; "Explorer release
contracts" goes green on it and stays green on main until one of those three services changes again.

## 6. Rollback (image only, per service)

```bash
az containerapp update -g $RG -n <APP> --image <ROLLBACK IMAGE FROM SECTION 0>
```
Migrations V10 (catalog), V36 and V37 (order) only add columns and stay after a rollback. Roll back only the service
at fault, in reverse order (order, auth, catalog, user-chef).
