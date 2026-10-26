# Chef app backend release runbook (2026-10-13)

Branch `feat/chef-app-backend` (base `1ddfd1c1f`; its commits are `origin/main..feat/chef-app-backend`, listed by `git log --oneline 1ddfd1c1f..feat/chef-app-backend`). Backs the chef mobile app 1.31.0. Written without access to Azure: no command below has been run against production. You run every command in Azure Cloud Shell (Bash, no storage). Every command is a single line; paste one line at a time and press Enter separately (Cloud Shell drops newlines in multi-line paste).

## What ships

| Order | Service | Container app | Migration | New behaviour |
|---|---|---|---|---|
| 1 | catalog-service | `ca-craves-catalog-service-prodlo` | catalog `V9__kitchen_storefront_and_chef_settings.sql` | kitchen photos, cuisines, areas, social links, chef settings (auto-accept, default prep), dish archive (`DELETE /kitchens/me/menu-items/{id}`, status `ARCHIVED`), chef picture: `PUT /kitchens/me/chef-avatar` picks one of 18 hosted Craves faces (uploaded in 1.3a), `chefPhotoUrl` on the nearby and public kitchen lists, real chef-photo uploads answer 400 `CHEF_PHOTO_UPLOAD_DISABLED` |
| 2 | notification-service | `ca-craves-notification-service-p` | none | optional `role=CHEF\|CUSTOMER` on in-app list, page, unread-count, read-all |
| 3 | subscription-service | `ca-craves-subscription-service-p` | none | `activeSubscriberCount` on chef plan responses (ACTIVE only; PAUSED not counted) |
| 4 | order-service | `ca-craves-order-service-prodlow` | order `V37__chef_order_details.sql` | chef order deadline, customer note, status history, delivery partner, `POST /chef/orders/{id}/handed-over`, kitchen auto-accept |
| 5 | APIM script | `apim-craves-prodlow-kmqgfy` | none | publishes 29 chef-app routes on api.craves.in (only creates what is missing) |

Not deployed, on purpose: **auth-service and integration-service**. Production runs patches that are not on main (central OTP; Pidge coordinate routing + Borzo handoff); deploying either from main would remove them. Consequence: "Log out other devices" and live courier data stay "Coming soon" in the app.

Release order and why: merge to main, then catalog, notification, subscription, order, and APIM last. APIM last so a new route never points at code that is not deployed. Catalog before the dish-DELETE route is published so an older catalog image never meets an `ARCHIVED` row.

## Placeholders and variables (fill these first)

| Placeholder | Meaning |
|---|---|
| `<MERGED_SHA>` | full 40-character SHA of the merge commit on main that contains this branch |
| `<PG_HOST>` | Postgres FQDN; normally `pg-craves-prodlow-kmqgfy.postgres.database.azure.com` (unverified; look it up with the command in Step 0) |
| `<PREV_CATALOG_IMAGE>`, `<PREV_NOTIFICATION_IMAGE>`, `<PREV_SUBSCRIPTION_IMAGE>`, `<PREV_ORDER_IMAGE>` | the image each app runs today, recorded in Step 0 BEFORE any deploy |
| `<PREV_SHA>` | the main commit the image currently running for that service was built from (its tag or your release notes; images built by the repo's pipelines carry the label `org.opencontainers.image.revision`). Used only for the ride-along review in 0.8 and in each step |
| `<API_ID>`, `<OP_ID>` | only in the APIM undo commands: an API id or operation id printed by the APIM script |
| `<KITCHEN_ID>` | any live kitchen id, for the optional public read check |
| `<REGRESSION_RUN_ID>` | only for the Azure DevOps route: a successful `launch-regression-ci.yml` run id for `<MERGED_SHA>` |

Fixed production values (verified in earlier sessions; do not change): subscription `721906c9-4a72-4606-830b-d3e7ace093ff`, resource group `rg-craves-prodlow-centralindia`, registry `cravesrm09prodlow6bf632`, APIM `apim-craves-prodlow-kmqgfy`, public host `api.craves.in`, Postgres `pg-craves-prodlow-kmqgfy`, Key Vault `kvcravesprodlowkmqgfy` secret `pg-pass` (read only; never reset it, that causes an outage).

Set the shell variables once per Cloud Shell session (re-run this if the session times out). Replace only `<MERGED_SHA>` and `<PG_HOST>`:

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 APIM=apim-craves-prodlow-kmqgfy CATALOG_APP=ca-craves-catalog-service-prodlo NOTIF_APP=ca-craves-notification-service-p SUB_APP=ca-craves-subscription-service-p ORDER_APP=ca-craves-order-service-prodlow SHA=<MERGED_SHA> PGH=<PG_HOST> PGDB=craves_business_db; export TAG=chefapp-${SHA:0:9}
```

Read-only database helper (reads `pg-pass` from Key Vault, never prints or changes it; the session is also forced read-only with `default_transaction_read_only=on`, so a typo cannot write). Defined once per session:

```bash
psqlro() { PGPASSWORD="$(az keyvault secret show --vault-name kvcravesprodlowkmqgfy -n pg-pass --query value -o tsv)" PGSSLMODE=require PGOPTIONS='-c default_transaction_read_only=on' psql -h "$PGH" -U cravesadmin -d "$PGDB" -c "$1"; }
```

Gateway probe helper for unauthenticated checks (prints the HTTP status, method and path; a route is fine when the status is 401):

```bash
gw() { local r m p c; for r in "$@"; do m=${r%% *}; p=${r#* }; case $m in GET|DELETE) c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X $m "https://api.craves.in$p");; *) c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X $m -H 'Content-Type: application/json' --data '{}' "https://api.craves.in$p");; esac; echo "$c $m $p"; done; }
```

## Step 0. Before anything is deployed

0.1 Merge the PR to main (the branch is local and unpushed; pushing and merging are yours). Wait for CI. Watch `catalog-finance-eligibility-ci`: the nearby-discovery tests ran locally only against a PostGIS stand-in, real PostGIS runs only there. `ChefOrderDetailsDatabaseTest` and `ChefAutoAcceptDatabaseTest` DO run in CI: `chef-ledger-ci` (it runs on pull requests that touch `services/order-service/**`) sets `LEDGER_TEST_JDBC_URL` and runs `mvn -f services/order-service/pom.xml verify`, so a failure there is real and must be read, not dismissed. `AppNoticeRoleFilterDbTest` runs in CI on the disposable `pdf_module_test` database (`DOCUMENT_TEST_JDBC_URL`, the same one the other notification DB tests use), including the exact-release regression's notification-service run.

0.2 Cloud Shell: confirm the account, then fetch the exact merged SHA into a fresh checkout.

```bash
az account show --query "{sub:id,tenant:tenantId}" -o json
```
Expect sub `721906c9-4a72-4606-830b-d3e7ace093ff`. If not: `az account set --subscription 721906c9-4a72-4606-830b-d3e7ace093ff`.

```bash
mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA && git checkout -q --detach FETCH_HEAD
```

0.3 Source guards (all must print what is expected, otherwise stop):

```bash
cd ~/c8 && git rev-parse HEAD && ls services/order-service/src/main/resources/db/migration | sort -V | tail -4 && ls services/catalog-service/src/main/resources/db/migration | sort -V | tail -2 && test -f services/order-service/src/main/java/in/craves/order/delivery/DeliveryHandoffEligibilityService.java && test -f services/order-service/src/main/resources/db/migration/V34__delivery_handoff_inbox_buffer.sql && echo PR489-HANDOFF-CODE-PRESENT
```
Expect: the SHA you set, order `V34 V35 V36 V37`, catalog `V8 V9`, and `PR489-HANDOFF-CODE-PRESENT`. If the handoff line is missing, STOP: prod order-service runs live delivery-handoff code (V34/V35, PR #489) and an order image without it fails Flyway and removes the handoff.

0.4 Find the Postgres FQDN and which database each service uses (read-only):

```bash
az postgres flexible-server show -g $RG -n pg-craves-prodlow-kmqgfy --query fullyQualifiedDomainName -o tsv
```
```bash
for a in $CATALOG_APP $ORDER_APP; do echo $a; az containerapp show -g $RG -n $a --query "properties.template.containers[0].env[?name=='SPRING_DATASOURCE_URL'].[value,secretRef]" -o tsv; done
```
Order uses `craves_business_db` (verified earlier). Catalog's database is not verified: its repo default is also `craves_business_db`. If the URL is a secretRef (blank value), the SELECTs below assume `craves_business_db`; if a SELECT shows no `catalog_schema` table, the catalog uses another database, set `PGDB` accordingly.

0.5 Record the current image of every app (this is your rollback target; also paste them into the log at the bottom):

```bash
for a in $CATALOG_APP $NOTIF_APP $SUB_APP $ORDER_APP; do echo "$a $(az containerapp show -g $RG -n $a --query 'properties.template.containers[0].image' -o tsv)"; done
```
```bash
for a in $CATALOG_APP $NOTIF_APP $SUB_APP $ORDER_APP; do echo "== $a"; az containerapp revision list -g $RG -n $a --query "[?properties.active].{name:name,created:properties.createdTime,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table; done
```

0.6 Migration state before (read-only). Order must show V34 applied with checksum `1014493939` and V35 applied with checksum `-1559739371` (both from the prod image that holds the handoff code; if V35 is absent that is also fine, it then applies from main), V36 applied or pending (it applies with this deploy), V37 absent, and no row with `success = f`. Catalog must show V8 as the latest. **If catalog shows V7 as the latest, V8 (`V8__admin_home_banners.sql`, new home-banner tables from a different change set) has not been applied in prod and this deploy applies it first, together with V9: read that file and the ride-along log in 0.8 before going on.**

```bash
psqlro "SELECT installed_rank, version, description, checksum, success FROM order_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 6;"
```
```bash
psqlro "SELECT installed_rank, version, description, success FROM catalog_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"
```
If prod order shows V34 or V35 with a different checksum, or any failed row, stop and look at it before Step 4 (a checksum mismatch crash-looped a previous order deploy).

0.7 Do not overlap another Craves release (pipelines, other Cloud Shell sessions) while this runs.

0.8 Ride-along review. Deploying a service from main ships every commit that touched it since the image prod runs now, not only this branch. For each service, before building it, list what else goes out. The checkout in `~/c8` is shallow, so fetch the full history once (or run the same `git log` lines in a full local clone):

```bash
cd ~/c8 && git fetch -q --unshallow https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA
```
Each step has its own line of the form `git log --oneline <PREV_SHA>..$SHA -- services/<svc>`. Anything that is not from this branch (see "What ships") needs a look: new migrations, new env vars it expects, behaviour changes. If `<PREV_SHA>` is not an ancestor of `$SHA` (the running image was built from a branch), the list is meaningless: ask Claude before deploying that service.

## Step 1. catalog-service (migration V9)

Applies V9: seven additive columns on `catalog_schema.kitchen_profile` (`chef_photo_url`, `kitchen_photo_url`, `cuisines`, `service_areas`, `social_links`, `auto_accept_orders` default false, `default_prep_minutes`), constant defaults so metadata-only, `lock_timeout 5s`. `ARCHIVED` needs no DDL. The old catalog image keeps working against the new columns.

1.1 Prerequisite, kitchen photos reuse the dish-photo storage (read-only; expect `CRAVES_STORAGE_ENDPOINT_VALUE` with a secretRef and the media container):

```bash
az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_STORAGE_ENDPOINT_VALUE' || name=='CRAVES_STORAGE_MEDIA_CONTAINER' || name=='CRAVES_MEDIA_PUBLIC_BASE_URL'].{Name:name,Value:value,SecretRef:secretRef}" -o table
```

1.2 **GO / NO-GO GATE, do this before building or deploying anything.** order-service calls `POST /internal/menu-items/resolve` on the catalog (cart preflight) and main's catalog does not serve it (it existed on older branches, commit `1ef06939c`). If prod's catalog image still serves it, deploying catalog from main would remove it and break cart preflight. Probe the catalog app itself (not api.craves.in, which can answer for other reasons). First see how order-service reaches the catalog (if its `CRAVES_CATALOG_BASE_URL` is a secretRef or blank it uses the default `https://api.craves.in/api/v1/catalog`):

```bash
az containerapp show -g $RG -n $ORDER_APP --query "properties.template.containers[0].env[?name=='CRAVES_CATALOG_BASE_URL'].[value,secretRef]" -o tsv
```
```bash
export CATALOG_FQDN=$(az containerapp show -g $RG -n $CATALOG_APP --query properties.configuration.ingress.fqdn -o tsv); echo $CATALOG_FQDN
```
Define the probe (one line; it only defines a function, nothing is sent yet):

```bash
probe() { curl -s -w '\nHTTP %{http_code}' --max-time 30 -X POST -H 'Content-Type: application/json' -H 'X-Craves-Internal-Key: probe' --data '{"menuItemIds":["00000000-0000-0000-0000-000000000000"]}' "https://$CATALOG_FQDN/api/v1/catalog/internal/$1"; }
```
Send the real probe and a control probe (same headers and body, on a sibling path that surely does not exist), and print both:

```bash
R=$(probe menu-items/resolve); C=$(probe zz-unmapped-probe); echo "REAL: $R"; echo "CONTROL: $C"
```
Print the verdict:

```bash
if echo "$R $C" | grep -q '"code"'; then echo "NO-GO: the catalog answered with its own error code, so it serves this route"; elif [ "${R##*HTTP }" = "${C##*HTTP }" ] && [ "${R##*HTTP }" != "000" ]; then echo "GO: the route answers exactly like a path that does not exist"; else echo "NO-GO: the real and control answers differ, or there was no answer"; fi
```
Read only the verdict line:
- It starts with `GO:`. The app does not serve the route. Continue with 1.3, and write the `REAL` and `CONTROL` status lines in the release log.
- It starts with `NO-GO:`. **STOP. Do not build or deploy catalog.** Send the whole `REAL:` and `CONTROL:` output to Claude and wait. Nothing has been changed at this point.

Do not judge by the status number alone. A bare 403 or 404 with an empty body is how this catalog answers a path it does not serve (Spring Security turns an unknown path into an empty-body 403), and the control probe shows what that looks like today. The route is served when its answer carries the app's own error code, `"code":"INTERNAL_ACCESS_DENIED"` (403) or `"code":"INTERNAL_ACCESS_NOT_CONFIGURED"` (503), or when it differs from the control. Example: REAL `HTTP 403` with an empty body next to CONTROL `HTTP 403` with an empty body is GO; REAL showing `INTERNAL_ACCESS_DENIED` is NO-GO even though both are 403.

The route needs the internal key and carries no secret here (`probe` is not a key), so the probe cannot read data.

1.3 Ride-along review and build. List what else goes out with this catalog image besides this branch (see 0.8), then build:

```bash
cd ~/c8 && git log --oneline <PREV_SHA>..$SHA -- services/catalog-service
```
```bash
cd ~/c8 && az acr build -r $ACR -t craves/catalog-service:$TAG services/catalog-service
```

1.3a Chef pictures, upload the 18 hosted faces (new files only, nothing existing is touched; do it before the deploy so the faces are already live when the new image starts handing out their links). `PUT /api/v1/kitchens/me/chef-avatar` stores `<public media base>/public/chef-avatars/chef-avatar-NN.jpg` for the chef who picks face NN, and real chef-photo uploads (`POST /kitchens/me/photos?kind=CHEF`) now answer 400 `CHEF_PHOTO_UPLOAD_DISABLED`; the kitchen photo is unchanged. The faces are the 18 JPEGs (512x512) in `docs/release/chef-avatars` of the `~/c8` checkout. Step 1.1 shows only the names of the storage settings, so read the real values from the catalog app (read-only). First the name of the secret that holds the storage connection string:

```bash
MEDIA_SECRET=$(az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_STORAGE_ENDPOINT_VALUE'].secretRef | [0]" -o tsv); echo "secret: $MEDIA_SECRET"
```
Then that secret, read into a plain shell variable (no `export`, so no command started later inherits the key) without printing it (the second half prints only the protocol and account name, never the key):

```bash
MEDIA_CS=$(az containerapp secret show -g $RG -n $CATALOG_APP --secret-name $MEDIA_SECRET --query value -o tsv); echo "$MEDIA_CS" | tr ';' '\n' | grep -E '^(DefaultEndpointsProtocol|AccountName)='
```
Expect `DefaultEndpointsProtocol=https` and an `AccountName=`; the repo's release scripts name the media account `stcravesmediakmqgfy` (`scripts/release/chef_onboarding_release.py`), so it should match. If the secret name is empty or nothing is printed, STOP: run `unset MEDIA_CS MEDIA_SECRET` first, then send what you saw to Claude. Then the container and the public media base the catalog uses:

```bash
export MEDIA_CONTAINER=$(az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_STORAGE_MEDIA_CONTAINER'].value | [0]" -o tsv); echo "container: $MEDIA_CONTAINER"
```
```bash
export MEDIA_BASE=$(az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_MEDIA_PUBLIC_BASE_URL'].value | [0]" -o tsv); echo "base: $MEDIA_BASE"
```
Expect `media` and `https://craves.in/media` (the catalog README gives the base for production; the container's app default is `media`). If the container is blank the app default `media` applies: `export MEDIA_CONTAINER=media`. If the base is blank the app links straight at the blob container: `export MEDIA_BASE=https://<AccountName printed above>.blob.core.windows.net/$MEDIA_CONTAINER`. Upload (Enter is yours; this writes 18 new blobs under `public/chef-avatars/` of the media container, the content never changes and `--overwrite` lets a re-run replace the same bytes instead of failing with a blob-exists error, so a re-run is harmless; if the upload fails, run `unset MEDIA_CS MEDIA_SECRET` first, then send the error to Claude):

```bash
cd ~/c8 && az storage blob upload-batch --connection-string "$MEDIA_CS" -d $MEDIA_CONTAINER -s docs/release/chef-avatars --destination-path public/chef-avatars --pattern "*.jpg" --overwrite --content-type image/jpeg --content-cache-control "public, max-age=31536000, immutable"
```
Check one file through the public address, then all 18:

```bash
curl -sI "$MEDIA_BASE/public/chef-avatars/chef-avatar-01.jpg"
```
```bash
for i in $(seq -w 1 18); do curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$MEDIA_BASE/public/chef-avatars/chef-avatar-$i.jpg"; done | sort | uniq -c
```
Expect `HTTP/2 200` and `content-type: image/jpeg` for the first, and exactly one line `18 200 image/jpeg` for the second. Anything else: do not go on to 1.4, run `unset MEDIA_CS MEDIA_SECRET` first, then send the output to Claude. Last, remove the connection string from the shell:

```bash
unset MEDIA_CS MEDIA_SECRET
```

1.4 Deploy. Catalog's media connection is stored as a plain (non Key Vault) app secret named `media-storage` (`scripts/release/chef_onboarding_release.py:18-21,262-273`; if 1.1 shows `CRAVES_STORAGE_ENDPOINT_VALUE` with a secretRef, it is in use), and `deploy-single-service-preserve-runtime.sh` refuses any plain secret that an env var references ("is not Key Vault-backed"), so **Route A will most likely refuse. Lead with Route B (image-only)**: it changes only the image, secrets and env stay as they are, but it has no automatic rollback, so verify in 1.5. Check no rollout is running:

```bash
az containerapp show -g $RG -n $CATALOG_APP --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,mode:properties.configuration.activeRevisionsMode}" -o jsonc
```
Route B, proceed only when `latest` equals `ready` and mode is `Single`, then:

```bash
az containerapp update -g $RG -n $CATALOG_APP --image $ACR.azurecr.io/craves/catalog-service:$TAG
```
Route A (optional, only if its read-only preflight prints SUCCESS; it preserves runtime config, health-checks and auto-rolls back):

```bash
cd ~/c8 && DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $CATALOG_APP $ACR.azurecr.io/craves/catalog-service:$TAG catalog
```
```bash
cd ~/c8 && READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10 bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $CATALOG_APP $ACR.azurecr.io/craves/catalog-service:$TAG catalog
```
Route C (alternative to A or B; the 1.2 gate still comes first): Azure DevOps pipeline `Craves (14)` (definition 14, `azure-pipelines-chef-onboarding-release.yml`) with `operation=catalog`, `releaseSha=<MERGED_SHA>`, `regressionRunId=<REGRESSION_RUN_ID>`, `confirmDeploy=true`. It does an image-only swap and restores the previous image if the revision does not settle. Confirm the definition's `operation` list includes `catalog` first (an older copy of the YAML may not).

1.5 Verify (re-run the first command until the new image is Healthy with traffic 100; if it is not healthy within about 5 minutes, roll back, see 1.7):

```bash
az containerapp revision list -g $RG -n $CATALOG_APP --query "[?properties.active].{name:name,health:properties.healthState,running:properties.runningState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
```bash
az containerapp logs show -g $RG -n $CATALOG_APP --type console --tail 100 --format text
```
A migration problem shows here (for example `canceling statement due to lock timeout`: nothing is half-applied because Flyway runs the migration in one transaction, retry at a quieter time).

```bash
psqlro "SELECT installed_rank, version, description, success FROM catalog_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"
```
Expect `9 | kitchen_storefront_and_chef_settings | t` (and `8 | admin_home_banners | t` just below it if V8 was pending, see 0.6). The 1.2 gate guaranteed prod did not serve the resolve route, so nothing is lost there; re-running the `R=...` line and the verdict line from 1.2 should still print `GO:`.

Optional public read check (new keys present, settings keys never public):

```bash
curl -s https://api.craves.in/api/v1/catalog/kitchens/<KITCHEN_ID> | jq 'keys'
```
Expect `chefPhotoUrl`, `kitchenPhotoUrl`, `cuisines`, `serviceAreas`, `socialLinks`; and no `autoAcceptOrders` or `defaultPrepMinutes`.

1.6 Smoke: the kitchen routes are not on the gateway until Step 6, so here only health, the migration row and the optional public read above. Customer discovery and menu in the live customer app must still load. Rolling catalog back (1.7) is safe while no dish has been archived, which cannot happen until Step 6 publishes the DELETE route.

1.7 Rollback catalog (image only; V9 columns stay, which is harmless):

```bash
az containerapp update -g $RG -n $CATALOG_APP --image <PREV_CATALOG_IMAGE>
```
Once chefs have picked faces, an image from before this change would DELETE the shared face file when a chef replaces or removes a chef photo (it does not know the faces are shared). After any such rollback, re-run the upload in 1.3a.

**Never roll catalog back to a pre-V9 image once any dish has been archived**: the old image throws on the `ARCHIVED` status and chef dish lists fail. Check first (read-only); if the count is above 0, fix forward instead:

```bash
psqlro "SELECT count(*) AS archived_dishes FROM catalog_schema.menu_item WHERE status = 'ARCHIVED';"
```

## Step 2. notification-service (no migration)

Adds the optional `role` filter. No schema change. Its ACS secret (email verification codes) is a plain app secret (`scripts/release/chef_onboarding_release.py:14-15,238`), and `deploy-single-service-preserve-runtime.sh` refuses plain secrets, so **Route A will most likely refuse. Lead with Route B (image-only)**: only the image changes, secrets and env stay, no automatic rollback, so verify below. An older notification image silently ignores `role`, so the app would show customer and chef notices mixed until this is live.

Ride-along review (see 0.8) and build:

```bash
cd ~/c8 && git log --oneline <PREV_SHA>..$SHA -- services/notification-service
```
```bash
cd ~/c8 && az acr build -r $ACR -t craves/notification-service:$TAG services/notification-service
```
Route B. Check no rollout is running (`latest` equals `ready`, mode `Single`), then update:

```bash
az containerapp show -g $RG -n $NOTIF_APP --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,mode:properties.configuration.activeRevisionsMode}" -o jsonc
```
```bash
az containerapp update -g $RG -n $NOTIF_APP --image $ACR.azurecr.io/craves/notification-service:$TAG
```
Route A (optional, only if its read-only preflight prints SUCCESS):

```bash
cd ~/c8 && DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $NOTIF_APP $ACR.azurecr.io/craves/notification-service:$TAG notification
```
```bash
cd ~/c8 && READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10 bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $NOTIF_APP $ACR.azurecr.io/craves/notification-service:$TAG notification
```
Verify (Healthy, traffic 100, new image):

```bash
az containerapp revision list -g $RG -n $NOTIF_APP --query "[?properties.active].{name:name,health:properties.healthState,running:properties.runningState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
Smoke: only probe the notification routes known to be live today. Unauthenticated calls must answer 401, and the app's Notifications screen must still load:

```bash
gw "GET /api/v1/notifications/in-app?role=CHEF" "PATCH /api/v1/notifications/in-app/probe/read"
```
`GET /api/v1/notifications/in-app/page`, `/in-app/unread-count` and `PATCH /in-app/read-all` are NOT expected to answer 401 yet: they are published by the APIM script in Step 6, so a 404 from the gateway for those three is normal until then (the backend already serves them; the role filter reaches the app through those routes only after Step 6).
Rollback (no data change, safe at any time):

```bash
az containerapp update -g $RG -n $NOTIF_APP --image <PREV_NOTIFICATION_IMAGE>
```
Behaviour to know: `role=` empty or any value other than CHEF/CUSTOMER (including ADMIN) answers 400 by design. Notices stored with a NULL `recipient_role` are excluded from any role-filtered list (they still show without the parameter).

## Step 3. subscription-service (no migration)

Adds `activeSubscriberCount` (one correlated COUNT inside the existing plan SELECT; ACTIVE only). The preserve-runtime route worked for this service on 2026-10-12 (V18).

Ride-along review (see 0.8) and build:

```bash
cd ~/c8 && git log --oneline <PREV_SHA>..$SHA -- services/subscription-service
```
```bash
cd ~/c8 && az acr build -r $ACR -t craves/subscription-service:$TAG services/subscription-service
```
```bash
cd ~/c8 && DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $SUB_APP $ACR.azurecr.io/craves/subscription-service:$TAG subscription
```
```bash
cd ~/c8 && READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10 bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $SUB_APP $ACR.azurecr.io/craves/subscription-service:$TAG subscription
```
If the preflight refuses it, use Route B exactly as in Step 2 with `$SUB_APP`.

Smoke: the script prints SUCCESS and its own liveness/readiness checks. Chef plan routes are already on the gateway:

```bash
gw "GET /api/v1/chef/subscription-plans" "GET /api/v1/chef/subscription-plans/probe"
```
Expect 401. In the app, the chef Meal plans list shows a subscriber count per plan.

Rollback (safe at any time; the script already auto-rolls back an unhealthy revision):

```bash
az containerapp update -g $RG -n $SUB_APP --image <PREV_SUBSCRIPTION_IMAGE>
```

## Step 4. order-service (migration V37)

Applies V37: six nullable columns on `order_schema.customer_order` (`customer_note varchar(500)`, `delivery_partner_name/phone/photo_url`, `delivery_partner_pickup_eta_at`, `chef_handed_over_at`), `lock_timeout 5s`, additive. If prod has not yet applied V36 (`subscription_order_chef_declined_callback`, from PR #487) it applies in the same startup, before V37. The old image keeps working against the new columns.

order-service has two plain secrets (`finance-internal`, `referral-source-hmac`), so `deploy-single-service-preserve-runtime.sh` refuses it. Use the image-only update (it keeps secrets and env, including the handoff flags). Re-check the V34 to V37 guard in 0.3 and the 0.6 order SELECT first.

Ride-along review (see 0.8). Caution: prod's order image (186 as of 2026-10-12) was built outside GitHub and holds the handoff code that PR #489 restored, so it has no source commit on main; if the 0.5 image is still that one, there is no `<PREV_SHA>`: ask Claude for the last main commit known to be in it. Expect at least PR #487 (V36 and the subscription chef-declined callback) in the list; anything else needs a look. Then build:

```bash
cd ~/c8 && git log --oneline <PREV_SHA>..$SHA -- services/order-service
```
```bash
cd ~/c8 && az acr build -r $ACR -t craves/order-service:$TAG services/order-service
```
```bash
az containerapp show -g $RG -n $ORDER_APP --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,mode:properties.configuration.activeRevisionsMode}" -o jsonc
```
Proceed only when `latest` equals `ready` and mode is `Single`:

```bash
az containerapp update -g $RG -n $ORDER_APP --image $ACR.azurecr.io/craves/order-service:$TAG
```
Verify:

```bash
az containerapp revision list -g $RG -n $ORDER_APP --query "[?properties.active].{name:name,health:properties.healthState,running:properties.runningState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
```bash
az containerapp logs show -g $RG -n $ORDER_APP --type console --tail 100 --format text
```
```bash
psqlro "SELECT installed_rank, version, description, checksum, success FROM order_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 4;"
```
Expect `37 | chef_order_details | t` on top, V36 `t`, V35 and V34 unchanged. A failed Flyway start (for example `Migration checksum mismatch for migration version 34`, or a lock timeout) means the new revision never becomes ready and the previous revision keeps serving; read the logs, then roll back (below) or retry later.

Order-service has no new gateway route until Step 6. Smoke here: health, the migration row, and in the customer app the order screen still loads (customer and admin order JSON now also carries `"chefHandedOverAt": null`, an additive key).

Rollback (image only; V37 columns stay; Flyway ignores applied migrations newer than the image by default and this repo does not override that, not yet proven on prod):

```bash
az containerapp update -g $RG -n $ORDER_APP --image <PREV_ORDER_IMAGE>
```
Rolling order back drops the chef detail fields, handed-over and auto-accept from responses but loses no data (customer notes and handed-over times stay in the columns).

## Step 5. Auto-accept (OPTIONAL, your decision, separate from the deploy)

Kitchen auto-accept only works when order-service has `CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=true` (default false). Auto-accept rides the same worker as the chef "New order received" notification (30 s tick), so it is not instant. That flag ALSO turns on the 30-minute auto-reject with refund and the 10 and 20 minute reminders. Do not flip it casually. Precondition: the running order image must be the one built from this branch (Step 4), because it carries the catalog client timeouts (2 s connect, 5 s read); never set the flag on an older order image, where a slow catalog can stall the scheduler thread. Read the current values first (no value shown means the default, false):

```bash
az containerapp show -g $RG -n $ORDER_APP --query "properties.template.containers[0].env[?name=='CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED' || name=='CRAVES_NOTIFICATION_OUTBOX_DISPATCHER_ENABLED' || name=='CRAVES_DOMAIN_EVENT_ENABLED_TYPES'].{Name:name,Value:value,SecretRef:secretRef}" -o table
```
What to weigh before enabling: unaccepted orders will auto-decline after 30 minutes and trigger a refund request, so the refund path must be ready (the July handover says the worker and `CRAVES_DOMAIN_EVENT_ENABLED_TYPES=CHEF_ACCEPTED_ORDER,REFUND_REQUESTED` are enabled together in a controlled pipeline: `docs/handover/2026-07-16-order-chef-acceptance-timeout-refund-trigger.md`, `docs/handover/2026-07-17-refund-end-to-end-rollout.md`); the courier booking after an accept needs `CHEF_ACCEPTED_ORDER` in the enabled event types; customer and chef notifications need the notification outbox dispatcher on. Until the flag is on, the app can save "auto-accept" but nothing happens: tell chefs, or do not announce the feature.

If you decide to enable it (creates a new revision; other env untouched):

```bash
az containerapp update -g $RG -n $ORDER_APP --set-env-vars CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=true
```
Undo:

```bash
az containerapp update -g $RG -n $ORDER_APP --set-env-vars CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=false
```
Refund deploy scripts reset it to false (`azure-pipelines-refund-combined-deploy.yml:202`, `scripts/refund/activate-refund-stage.sh:298`): after any refund-stage deploy, re-read the value above. An image-only order deploy (Step 4) does not change it. Meal-plan (subscription) orders and SCHEDULED orders (`fulfilment_mode = 'SCHEDULED'`) are never auto-accepted: accept sets `ready_at = now + prep` and integration books the courier from it, so an accept at creation would dispatch hours early; chefs still accept those by hand.

## Step 6. APIM routes (last)

Only after Steps 1 to 4 are healthy. The script (`scripts/apim/configure-chef-app-routes-apim.sh`) pins the subscription, tenant, RG and APIM `apim-craves-prodlow-kmqgfy`, runs a read-only Phase 1 (apps Running and `/actuator/health` UP, API owners by path, subscription key not required, which operations already exist), and only then Phase 2 writes: it creates missing APIs and missing operations and never touches an existing operation or its policy. It then reads back every operation and sends an unauthenticated probe that must answer 401.

6.1 Prerequisites (all read-only; nothing here is a go-ahead to publish until every item is clean).

The script's Phase 1 needs all four backends Running, latest revision equal to latest ready revision, and a public `/actuator/health` answering UP: catalog (`ca-craves-catalog-service-prodlo`), order (`ca-craves-order-service-prodlow`), notification (`ca-craves-notification-service-p`) and user-chef (`ca-craves-user-chef-service-prod`, which backs `/api/v1/support/cases`). User-chef is not deployed by this release, so check it separately; if any of them is not ready the script stops before writing anything.

(a) What the gateway has today. List every API under the prefixes this release touches, then its operations, then anything that owns a shorter path covering them (read-only):

```bash
az apim api list -g $RG --service-name $APIM --query "[?starts_with(path,'api/v1/kitchens') || starts_with(path,'api/v1/chef') || starts_with(path,'api/v1/notifications') || starts_with(path,'api/v1/support')].{name:name,path:path}" -o table
```
```bash
for id in $(az apim api list -g $RG --service-name $APIM --query "[?starts_with(path,'api/v1/kitchens') || starts_with(path,'api/v1/chef') || starts_with(path,'api/v1/notifications') || starts_with(path,'api/v1/support')].name" -o tsv); do echo "== $id"; az apim api operation list -g $RG --service-name $APIM --api-id $id --query "[].[method,urlTemplate]" -o tsv; done
```
```bash
az apim api list -g $RG --service-name $APIM --query "[?path=='api/v1' || path=='api' || path==''].{name:name,path:path}" -o table
```
The script must find these paths: `api/v1/kitchens/me`, `api/v1/chef/orders`, `api/v1/notifications` (must already exist, never created) and, if absent, creates `api/v1/chef/scheduled-orders`, `api/v1/chef/reviews`, `api/v1/support`. APIM serves a request from the API with the LONGEST matching path, so a new longer-path API created beneath an existing API that owns a SHORTER path (`api/v1`, `api/v1/kitchens` with wildcard operations, `api/v1/chef`, ...) would shadow every route of that parent which the new API does not define. The first version of the script matched paths exactly and could not see this; the fix is committed in the branch (`a8f82276a`, `31c6a8a80`; the run then prints `covered by wildcard operations of parent ...` and creates nothing when the parent has a wildcard operation for every needed method, and stops when it does not). Confirm the checked-out version has the fix (a count above 0):

```bash
cd ~/c8 && grep -c COVERED scripts/apim/configure-chef-app-routes-apim.sh
```
**If any wildcard or shorter-path owner shows up in the listings for any of the six prefixes, do NOT let a longer-path API be created: STOP and send the three listings to Claude, even if the script has the fix.** If the count is 0 and any such owner exists, do not run the script at all.

(b) If `api/v1/kitchens/me`, `api/v1/chef/orders` or `api/v1/notifications` is missing: **do not run `configure-chef-kitchen-profile-apim.sh` or `configure-chef-order-read-apim.sh` to fill the gap.** They have no dry run and no confirm flag: they create the API if absent and immediately write operations and policies to the gateway (and can overwrite the policy of an operation that already exists), and they default to the production APIM. No script in the repo publishes `api/v1/notifications`. STOP and send the listings to Claude.

(c) The script does not publish these older routes (older scripts own them): kitchen `GET/PUT /kitchens/me`, menu items, per-dish availability, image upload, chef order list/get/accept/reject/ready-for-pickup, chef subscription plans, notification `GET /in-app` and `PATCH /in-app/{id}/read`. The app needs them, so check they are live (expect 401; a 404 means not published, then stop and report, do not publish them blindly):

```bash
gw "GET /api/v1/kitchens/me" "PUT /api/v1/kitchens/me" "GET /api/v1/kitchens/me/menu-items" "PUT /api/v1/kitchens/me/menu-items/probe" "PATCH /api/v1/kitchens/me/menu-items/probe/availability" "POST /api/v1/kitchens/me/menu-items/probe/images" "GET /api/v1/chef/orders" "GET /api/v1/chef/orders/probe" "POST /api/v1/chef/orders/probe/accept" "POST /api/v1/chef/orders/probe/reject" "POST /api/v1/chef/orders/probe/ready-for-pickup" "GET /api/v1/chef/subscription-plans" "GET /api/v1/notifications/in-app" "PATCH /api/v1/notifications/in-app/probe/read"
```

(d) Support routes live on user-chef, which this release does not deploy. Before publishing `/api/v1/support/cases`, check the user-chef app itself answers on that path (unauthenticated, directly, not through the gateway). Expect 401 (or 403: this service only has an explicit 401 entry point for one readiness route, so Spring's default 403 is likely); a 404 or no answer means the app does not serve it, so do not publish the support routes, STOP and report to Claude:

```bash
export UC_FQDN=$(az containerapp show -g $RG -n ca-craves-user-chef-service-prod --query properties.configuration.ingress.fqdn -o tsv); curl -s -o /dev/null -w 'HTTP %{http_code}\n' --max-time 30 https://$UC_FQDN/api/v1/support/cases
```
Limit of this check: that service authenticates every path except a few health and internal ones, so an unmapped path would also answer 401 or 403; it proves the app is up and guarded, not that the controller is mapped. The stronger proof is the same call with a real chef token in `CHEF_TOKEN` (never paste it into chat or a file); it must answer 200, otherwise do not publish the support routes:

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' --max-time 30 -H "Authorization: Bearer $CHEF_TOKEN" https://$UC_FQDN/api/v1/support/cases
```

6.2 Validate the assets (real `xmllint` was not available when the script was written; run where it exists) and preview the route table. The dry run makes no Azure call:

```bash
cd ~/c8 && command -v xmllint && bash scripts/release/validate-apim-assets.sh
```
```bash
cd ~/c8 && DRY_RUN=true bash scripts/apim/configure-chef-app-routes-apim.sh
```
Expect 29 operations on 6 APIs.

6.3 Run it (Enter is yours; this writes to the live gateway). Read the Phase 1 lines first: which APIs "exist", which are "covered by wildcard operations of parent" and which "will be created" (a prefix that has a parent API in your 6.1 listing must never say "will be created": settle 6.1 before you run, do not rely on interrupting the run), then KEEP/COVERED/CREATE per route and 29 `OK ... (401 unauthenticated)` lines. The real `az` and `jq` calls had only been exercised through stubs, so Phase 1 is the first real test; any failure there wrote nothing.

```bash
cd ~/c8 && CONFIRM_APIM_WRITE=true bash scripts/apim/configure-chef-app-routes-apim.sh
```
The script is re-runnable (existing operations are KEPT). If it stops half way in Phase 2, fix the cause and re-run. One gap: if an operation was created but its policy write then failed, a re-run KEEPs the operation without a policy and its 401 probe fails; delete that one operation and re-run (ids are printed by the script):

```bash
az apim api operation delete -g $RG --service-name $APIM --api-id <API_ID> --operation-id <OP_ID> -y
```
(The azure-pipelines-chef-app-routes-apim.yml in the repo does the same run with `confirmProductionChange=true`, but no Azure DevOps definition for it is known to exist; use Cloud Shell.)

6.4 Gateway smoke, independent of the script's own probes (every line must be 401, so nothing is printed except `ALL-401`):

```bash
gw "GET /api/v1/kitchens/me/schedule" "PUT /api/v1/kitchens/me/schedule" "GET /api/v1/kitchens/me/schedule/overrides/probe" "PUT /api/v1/kitchens/me/schedule/overrides/probe" "DELETE /api/v1/kitchens/me/schedule/overrides/probe" "PATCH /api/v1/kitchens/me/menu-items/availability" "DELETE /api/v1/kitchens/me/menu-items/probe/images/probe" "PUT /api/v1/kitchens/me/menu-items/probe/images/probe/primary" "DELETE /api/v1/kitchens/me/menu-items/probe" "POST /api/v1/kitchens/me/photos" "DELETE /api/v1/kitchens/me/photos/CHEF" "PUT /api/v1/kitchens/me/chef-avatar" "GET /api/v1/kitchens/me/settings" "PUT /api/v1/kitchens/me/settings" "GET /api/v1/chef/orders/page" "POST /api/v1/chef/orders/probe/handed-over" "GET /api/v1/chef/scheduled-orders" "PUT /api/v1/chef/scheduled-orders/probe/orders/probe/response" "GET /api/v1/chef/reviews" "GET /api/v1/chef/reviews/kitchens/probe/summary" "POST /api/v1/support/cases" "GET /api/v1/support/cases" "GET /api/v1/support/cases/probe" "POST /api/v1/support/cases/probe/messages" "GET /api/v1/notifications/in-app/page" "GET /api/v1/notifications/in-app/unread-count" "PATCH /api/v1/notifications/in-app/read-all" "GET /api/v1/notifications/preferences" "PUT /api/v1/notifications/preferences/probe" | grep -v '^401 ' || echo ALL-401
```

6.5 Authenticated check per API (the script only proves 401 without a token). Easiest is the app (Step 7). With a chef access token in `CHEF_TOKEN` (never paste it into chat, a file or git), every line should be 200:

```bash
for p in /api/v1/kitchens/me/schedule /api/v1/kitchens/me/settings /api/v1/chef/orders/page /api/v1/chef/scheduled-orders /api/v1/chef/reviews /api/v1/support/cases "/api/v1/notifications/in-app/page?role=CHEF" /api/v1/notifications/preferences; do echo "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -H "Authorization: Bearer $CHEF_TOKEN" "https://api.craves.in$p") $p"; done
```
Check that `GET /api/v1/chef/orders/page` returns a page (a list), not the single-order handler (it sits beside `GET /chef/orders/{orderId}`).

6.6 Undo the gateway (the backends are independent; kept operations were never touched, so there is nothing to restore for them). List what this script created, then delete only those operations, and the three APIs only if Phase 1 said "will be created" for them:

```bash
az apim api operation list -g $RG --service-name $APIM --api-id <API_ID> --query "[?starts_with(name,'chef-app-')].name" -o tsv
```
```bash
az apim api operation delete -g $RG --service-name $APIM --api-id <API_ID> --operation-id <OP_ID> -y
```
```bash
az apim api delete -g $RG --service-name $APIM --api-id craves-chef-scheduled-orders-v1 -y
```
(Same for `craves-chef-reviews-v1` and `craves-support`, only when the script created them.) Existing operations did not get the new `Cache-Control: no-store` response header; that is the price of never overwriting a live policy.

## Step 7. App smoke (chef app 1.31.0, a real chef account on prod)

Do not place real payments or send real OTPs as a smoke test; use your own test order and test kitchen.

1. Orders: a pending order shows the acceptance deadline and the customer note; the detail screen shows status history; accept, mark ready; once it is READY_FOR_PICKUP the "Handed over" action works, shows its time, and a second tap is a no-op. Courier details stay absent (integration-service is not sending them yet).
2. Kitchen profile: upload a kitchen photo (JPEG/PNG/WebP up to 8 MiB), replace it, delete it; save cuisines (max 10, 40 chars each), delivery areas, and social links. **The app must always send all four social links** (the object replaces all four; https only). Public kitchen page shows the kitchen photo. Chef picture: a chef-photo upload now answers 400 `CHEF_PHOTO_UPLOAD_DISABLED`; in the app build that has the picture picker, pick a face and check it shows on the public kitchen page and in the nearby kitchen list (`chefPhotoUrl`).
3. Settings: toggle auto-accept and default prep (5 to 120). Remember Step 5 decides whether it does anything.
4. Menu: archive a dish with the delete action; it disappears from the chef list and from the customer menu, discovery and favourites; the other dishes are untouched.
5. Notifications: the chef app shows only chef notices; unread count and "mark all read" with `role=CHEF` leave customer notices unread.
6. Meal plans: each plan shows its subscriber count (ACTIVE only).
7. Existing clients keep working: craves.in web, admin, and the customer app (menu, cart, order screen), and the old chef app 1.30.0 (new fields are optional and ignored).
8. If Step 5 was done: place a test order for a kitchen with auto-accept on; within about a minute it becomes ACCEPTED with history reason "Accepted automatically", and the customer is told.

## Rollback summary

| Service | Command | Warning |
|---|---|---|
| catalog | `az containerapp update -g $RG -n $CATALOG_APP --image <PREV_CATALOG_IMAGE>` | never to a pre-V9 image after any dish is archived (old image throws on `ARCHIVED`); fix forward instead; an image from before the chef pictures can delete a shared face file (see 1.7) |
| notification | `az containerapp update -g $RG -n $NOTIF_APP --image <PREV_NOTIFICATION_IMAGE>` | none |
| subscription | `az containerapp update -g $RG -n $SUB_APP --image <PREV_SUBSCRIPTION_IMAGE>` | none |
| order | `az containerapp update -g $RG -n $ORDER_APP --image <PREV_ORDER_IMAGE>` | chef detail fields, handed-over and auto-accept vanish from responses; data stays |
| auto-accept flag | `az containerapp update -g $RG -n $ORDER_APP --set-env-vars CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=false` | also stops the 30-minute auto-reject and reminders |
| APIM | delete only the operations the script created (6.6) | the backends keep working without the routes |

Flyway migrations V9 (catalog) and V37 (order) are additive: rollback is the previous image, the columns stay. Roll back in reverse order (APIM routes, order, subscription, notification, catalog), and roll back only the service that is at fault.

## Risks and findings for you

Decisions and gaps you should know before releasing:

- **Possible cause of the cart bill-preview 403 (finding).** order-service `CatalogClient` calls `POST /internal/menu-items/resolve` (cart preflight, through `CRAVES_CATALOG_BASE_URL`, default `https://api.craves.in/api/v1/catalog`). Catalog on main does not serve it (added in `1ef06939c`, later dropped). This release does not fix it. Step 1.2 is a go/no-go gate on the catalog app itself: if prod's catalog serves the route (the app answers with its own `INTERNAL_ACCESS_*` error code, or differently from the control probe on a path that does not exist), the catalog deploy stops, because main's catalog would remove it. If it is served by a prod-only patch, archived dishes could also pass cart preflight (it needs the same `status = 'ACTIVE'` filter). If the gate says GO, prod's catalog does not serve it either, so this is a plausible cause of the existing bill-preview 403 and still open after this release.
- **Meal plans using a dish the chef later archives fail at their next subscription order** (`PlanCatalogClient` reads `GET /menu-items/{id}`). Not handled. Tell chefs not to archive a dish that is in an active plan, or accept the failure.
- **Archived dishes in a customer's saved or favourite items now read as MISSING.**
- **Auto-accept needs the worker flag** and that flag also enables auto-reject with refund and reminders (Step 5). A kitchen whose catalog image predates V9 returns no settings, so auto-accept stays off (safe), which is why catalog goes first. Auto-accept happens on the next 30 s tick, tries once (if the dish lookup fails it uses the kitchen default prep then 15 minutes; if the accept itself fails the order stays pending and the chef is notified normally), and its history reason "Accepted automatically" is free text a chef could also type. The customer notification after the commit can be lost if the process dies at that moment (the order status is still correct). Each auto-accept makes about 4+N catalog calls on the single scheduler thread (order-service has one, shared with its other scheduled jobs). The catalog client now has timeouts (2 s connect, 5 s read; properties `craves.catalog.connect-timeout` and `craves.catalog.read-timeout`, env `CRAVES_CATALOG_CONNECT_TIMEOUT` and `CRAVES_CATALOG_READ_TIMEOUT`), so a slow catalog costs seconds per call instead of stalling that worker. A failing `order_source` read propagates and the worker retries on the next tick.
- **Order notes:** a checkout note over 500 characters is cut to its first 500 code points (the plan said reject, but notes up to 2000 were accepted before and existing clients must keep working), so very long notes lose their tail.
- **Chef order list `/chef/orders/page` is not extended** (no deadline or note there); the app uses it for Past history only.
- **Customer and admin order JSON now carries `"chefHandedOverAt": null`** (always serialised).
- **Courier data:** `deliveryPartner` stays absent until integration-service sends courier fields (out of scope, it is not deployed from main). Courier phone and photo URL are stored as unbounded text with no URL validation (the app treats `photoUrl` as untrusted); the phone also lands in `delivery_status_inbox.payload` (existing raw payload storage). A same-status ("no change") delivery report can overwrite a newer courier ETA or name with older values (low impact, accepted).
- **Catalog edges:** the `socialLinks` object replaces all four links (the app must always send all four); `https://user:pw@host` is accepted; internationalised and underscore hostnames are rejected. A kitchen photo blob can be orphaned if the DB update fails after upload; no test asserts the real blob path; `updateAvailability` can race and set `is_available` on an `ARCHIVED` row (invisible to customers).
- **Notifications:** `role=` empty is a 400; rows with NULL `recipient_role` drop out of role-filtered lists; the service README does not mention `role`; no EXPLAIN was run on real volumes (role is a residual filter on one user's rows).
- **Subscriber count:** counts ACTIVE only (PAUSED, PENDING_PAYMENT and the rest excluded); it uses a correlated COUNT, not a literal GROUP BY; no HTTP-layer assertion.
- **APIM:** a new operation id (`chef-app-*`) is not checked against an operation with a different method or template, so a PUT could overwrite (unlikely); existing operations keep their policy and do not get the new no-store header; `kitchens/me`, `chef/orders` and `notifications` must already be live on kmqgfy, and the older scripts that publish them write to the gateway at once with no confirm flag and can overwrite policies, so a gap means stop and report (6.1b). The script looks for a wildcard owner at a shorter path (since `a8f82276a`): it treats those routes as covered and creates nothing, and it stops when the parent has no wildcard for a needed method (6.1a). The support routes depend on the user-chef app, which this release does not deploy (6.1d).
- **Chef pictures (faces).** The 18 faces are static files in `docs/release/chef-avatars` that you upload once in 1.3a; the picker route `PUT /api/v1/kitchens/me/chef-avatar` is published in Step 6. Chef-photo uploads now answer 400 `CHEF_PHOTO_UPLOAD_DISABLED` for every client, so the current chef app shows an error on its chef-photo upload until the build with the picture picker is installed (kitchen photos are unaffected). A chef who already uploaded a chef photo keeps it until they pick a face. The catalog never deletes a shared face file, but an image from before this change would (see 1.7). Customer apps that do not read `chefPhotoUrl` ignore the new field.
- **Follow-up, referral routes are not published** because the live APIM API `craves-referral-members-v1` points at the wrong backend (`docs/referrals/CHEF_ACTIVATION_20261012.md`). The app needs, once that is fixed: `GET /api/v1/referrals/me`, `/me/code`, `/me/code/qr`, `/me/chef-earnings`, `/me/rewards` and `POST /api/v1/auth/referrals/enroll`.
- **Excluded by design:** auth-service ("Log out other devices") and integration-service (live courier data) stay "Coming soon".
- **Unverified by me:** everything in this file was written from the repo only. Not checked against Azure: the Postgres FQDN, the catalog database name, whether catalog and notification really hold plain secrets (the preflight will tell you), whether prod serves the internal resolve route (the 1.2 gate answers that), the current value of the worker flag, Flyway tolerating applied-newer migrations on rollback, the prod checksums of V34 and V35 (taken from earlier sessions, not re-read), what an unauthenticated call to the user-chef app returns (read from its `SecurityConfig`, not run), `PGOPTIONS` being accepted by the Postgres server, the `git fetch --unshallow` of a bare SHA in Cloud Shell, and the real `az`/`jq`/`xmllint` behaviour of the APIM script.

## Release log (fill in as you go)

| Item | Value |
|---|---|
| Merged SHA / tag | |
| Previous catalog / notification / subscription / order image | |
| Catalog deployed (time, route A/B/C, revision) | |
| Notification deployed | |
| Subscription deployed | |
| Order deployed | |
| Flyway: catalog V9 `t`, order V37 `t` | |
| 1.2 gate: verdict (must be GO) and the REAL / CONTROL status lines | |
| 6.1 prerequisites clean (listings, wildcard owners, user-chef support check) | |
| Worker flag decision (value before / after) | |
| APIM run (kept / created / probes OK) | |
| App 1.31.0 smoke result | |
