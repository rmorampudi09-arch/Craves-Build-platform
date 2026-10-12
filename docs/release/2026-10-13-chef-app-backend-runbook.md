# Chef app backend release runbook (2026-10-13)

Branch `feat/chef-app-backend` (base `1ddfd1c1f`, commits `7e9053b6b`..`869d96c04`). Backs the chef mobile app 1.31.0. Written without access to Azure: no command below has been run against production. You run every command in Azure Cloud Shell (Bash, no storage). Every command is a single line; paste one line at a time and press Enter separately (Cloud Shell drops newlines in multi-line paste).

## What ships

| Order | Service | Container app | Migration | New behaviour |
|---|---|---|---|---|
| 1 | catalog-service | `ca-craves-catalog-service-prodlo` | catalog `V9__kitchen_storefront_and_chef_settings.sql` | kitchen photos, cuisines, areas, social links, chef settings (auto-accept, default prep), dish archive (`DELETE /kitchens/me/menu-items/{id}`, status `ARCHIVED`) |
| 2 | notification-service | `ca-craves-notification-service-p` | none | optional `role=CHEF\|CUSTOMER` on in-app list, page, unread-count, read-all |
| 3 | subscription-service | `ca-craves-subscription-service-p` | none | `activeSubscriberCount` on chef plan responses (ACTIVE only; PAUSED not counted) |
| 4 | order-service | `ca-craves-order-service-prodlow` | order `V37__chef_order_details.sql` | chef order deadline, customer note, status history, delivery partner, `POST /chef/orders/{id}/handed-over`, kitchen auto-accept |
| 5 | APIM script | `apim-craves-prodlow-kmqgfy` | none | publishes 28 chef-app routes on api.craves.in (only creates what is missing) |

Not deployed, on purpose: **auth-service and integration-service**. Production runs patches that are not on main (central OTP; Pidge coordinate routing + Borzo handoff); deploying either from main would remove them. Consequence: "Log out other devices" and live courier data stay "Coming soon" in the app.

Release order and why: merge to main, then catalog, notification, subscription, order, and APIM last. APIM last so a new route never points at code that is not deployed. Catalog before the dish-DELETE route is published so an older catalog image never meets an `ARCHIVED` row.

## Placeholders and variables (fill these first)

| Placeholder | Meaning |
|---|---|
| `<MERGED_SHA>` | full 40-character SHA of the merge commit on main that contains this branch |
| `<PG_HOST>` | Postgres FQDN; normally `pg-craves-prodlow-kmqgfy.postgres.database.azure.com` (unverified; look it up with the command in Step 0) |
| `<PREV_CATALOG_IMAGE>`, `<PREV_NOTIFICATION_IMAGE>`, `<PREV_SUBSCRIPTION_IMAGE>`, `<PREV_ORDER_IMAGE>` | the image each app runs today, recorded in Step 0 BEFORE any deploy |
| `<API_ID>`, `<OP_ID>` | only in the APIM undo commands: an API id or operation id printed by the APIM script |
| `<KITCHEN_ID>` | any live kitchen id, for the optional public read check |
| `<REGRESSION_RUN_ID>` | only for the Azure DevOps route: a successful `launch-regression-ci.yml` run id for `<MERGED_SHA>` |

Fixed production values (verified in earlier sessions; do not change): subscription `721906c9-4a72-4606-830b-d3e7ace093ff`, resource group `rg-craves-prodlow-centralindia`, registry `cravesrm09prodlow6bf632` (not `cravesprodlowacr82121`), APIM `apim-craves-prodlow-kmqgfy` (not `l3ing6`), public host `api.craves.in`, Postgres `pg-craves-prodlow-kmqgfy`, Key Vault `kvcravesprodlowkmqgfy` secret `pg-pass` (read only; never reset it, that causes an outage).

Set the shell variables once per Cloud Shell session (re-run this if the session times out). Replace only `<MERGED_SHA>` and `<PG_HOST>`:

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 APIM=apim-craves-prodlow-kmqgfy CATALOG_APP=ca-craves-catalog-service-prodlo NOTIF_APP=ca-craves-notification-service-p SUB_APP=ca-craves-subscription-service-p ORDER_APP=ca-craves-order-service-prodlow SHA=<MERGED_SHA> PGH=<PG_HOST> PGDB=craves_business_db; export TAG=chefapp-${SHA:0:9}
```

Read-only database helper (reads `pg-pass` from Key Vault, never prints or changes it). Defined once per session:

```bash
psqlro() { PGPASSWORD="$(az keyvault secret show --vault-name kvcravesprodlowkmqgfy -n pg-pass --query value -o tsv)" PGSSLMODE=require psql -h "$PGH" -U cravesadmin -d "$PGDB" -c "$1"; }
```

Gateway probe helper for unauthenticated checks (prints the HTTP status, method and path; a route is fine when the status is 401):

```bash
gw() { local r m p c; for r in "$@"; do m=${r%% *}; p=${r#* }; case $m in GET|DELETE) c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X $m "https://api.craves.in$p");; *) c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X $m -H 'Content-Type: application/json' --data '{}' "https://api.craves.in$p");; esac; echo "$c $m $p"; done; }
```

## Step 0. Before anything is deployed

0.1 Merge the PR to main (the branch is local and unpushed; pushing and merging are yours). Wait for CI. Watch `catalog-finance-eligibility-ci`: the nearby-discovery tests ran locally only against a PostGIS stand-in, real PostGIS runs only there. Note that `ChefOrderDetailsDatabaseTest`, `ChefAutoAcceptDatabaseTest` and `AppNoticeRoleFilterDbTest` are not in any CI test list, so a green CI does not exercise them (they passed locally against PostgreSQL 16.4).

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

0.6 Migration state before (read-only). Order must show V34 applied (checksum `1014493939`, from the prod image that holds the handoff code) and V35 applied or absent, V36 applied or pending (it applies with this deploy), V37 absent, and no row with `success = f`. Catalog must show V8 as the latest.

```bash
psqlro "SELECT installed_rank, version, description, checksum, success FROM order_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 6;"
```
```bash
psqlro "SELECT installed_rank, version, description, success FROM catalog_schema.flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"
```
If prod order shows V34 with a different checksum, or any failed row, stop and look at it before Step 4 (a checksum mismatch crash-looped a previous order deploy).

0.7 Do not overlap another Craves release (pipelines, other Cloud Shell sessions) while this runs.

## Step 1. catalog-service (migration V9)

Applies V9: seven additive columns on `catalog_schema.kitchen_profile` (`chef_photo_url`, `kitchen_photo_url`, `cuisines`, `service_areas`, `social_links`, `auto_accept_orders` default false, `default_prep_minutes`), constant defaults so metadata-only, `lock_timeout 5s`. `ARCHIVED` needs no DDL. The old catalog image keeps working against the new columns.

1.1 Prerequisite, kitchen photos reuse the dish-photo storage (read-only; expect `CRAVES_STORAGE_ENDPOINT_VALUE` with a secretRef and the media container):

```bash
az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_STORAGE_ENDPOINT_VALUE' || name=='CRAVES_STORAGE_MEDIA_CONTAINER' || name=='CRAVES_MEDIA_PUBLIC_BASE_URL'].{Name:name,Value:value,SecretRef:secretRef}" -o table
```

1.2 Baseline for a route prod may depend on. order-service calls `POST /internal/menu-items/resolve` on the catalog (cart preflight) and main's catalog does not serve it (it existed on older branches, commit `1ef06939c`). If prod's catalog image still serves it, this deploy would remove it. Record the status now (403 means the route exists and is guarded; 404 or 405 means it is not served):

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-time 30 -X POST -H 'Content-Type: application/json' -H 'X-Craves-Internal-Key: probe' --data '{"menuItemIds":["00000000-0000-0000-0000-000000000000"]}' https://api.craves.in/api/v1/catalog/internal/menu-items/resolve
```

1.3 Build:

```bash
cd ~/c8 && az acr build -r $ACR -t craves/catalog-service:$TAG services/catalog-service
```

1.4 Deploy. Catalog carries a plain app secret (`media-storage`), so the preserve-runtime script will most likely refuse it with "is not Key Vault-backed". Run the preflight (read-only) to find out:

```bash
cd ~/c8 && DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $CATALOG_APP $ACR.azurecr.io/craves/catalog-service:$TAG catalog
```
Route A, preflight printed SUCCESS (the script preserves runtime config, health-checks, and auto-rolls back):

```bash
cd ~/c8 && READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10 bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $CATALOG_APP $ACR.azurecr.io/craves/catalog-service:$TAG catalog
```
Route B, preflight refused (image-only update; secrets and env are untouched; no automatic rollback, so verify in 1.5):

```bash
az containerapp show -g $RG -n $CATALOG_APP --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,mode:properties.configuration.activeRevisionsMode}" -o jsonc
```
Proceed only when `latest` equals `ready` and mode is `Single`, then:

```bash
az containerapp update -g $RG -n $CATALOG_APP --image $ACR.azurecr.io/craves/catalog-service:$TAG
```
Route C (alternative to A or B): Azure DevOps pipeline `Craves (14)` (definition 14, `azure-pipelines-chef-onboarding-release.yml`) with `operation=catalog`, `releaseSha=<MERGED_SHA>`, `regressionRunId=<REGRESSION_RUN_ID>`, `confirmDeploy=true`. It does an image-only swap and restores the previous image if the revision does not settle. Confirm the definition's `operation` list includes `catalog` first (an older copy of the YAML may not).

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
Expect `9 | kitchen_storefront_and_chef_settings | t`. Re-run the 1.2 probe: it must return the same status as the baseline. **If it flipped from 403 to 404/405, roll back catalog now (1.7).** This is safe only while no dish has been archived, which cannot happen until the APIM step publishes the DELETE route.

Optional public read check (new keys present, settings keys never public):

```bash
curl -s https://api.craves.in/api/v1/catalog/kitchens/<KITCHEN_ID> | jq 'keys'
```
Expect `chefPhotoUrl`, `kitchenPhotoUrl`, `cuisines`, `serviceAreas`, `socialLinks`; and no `autoAcceptOrders` or `defaultPrepMinutes`.

1.6 Smoke: the kitchen routes are not on the gateway until Step 6, so here only health, the migration row and the probe above. Customer discovery and menu in the live customer app must still load.

1.7 Rollback catalog (image only; V9 columns stay, which is harmless):

```bash
az containerapp update -g $RG -n $CATALOG_APP --image <PREV_CATALOG_IMAGE>
```
**Never roll catalog back to a pre-V9 image once any dish has been archived**: the old image throws on the `ARCHIVED` status and chef dish lists fail. Check first (read-only); if the count is above 0, fix forward instead:

```bash
psqlro "SELECT count(*) AS archived_dishes FROM catalog_schema.menu_item WHERE status = 'ARCHIVED';"
```

## Step 2. notification-service (no migration)

Adds the optional `role` filter. No schema change. Its ACS secret is a plain app secret, so expect the preserve-runtime script to refuse it and use Route B (the repo's own release script says the same). An older notification image silently ignores `role`, so the app would show customer and chef notices mixed until this is live.

```bash
cd ~/c8 && az acr build -r $ACR -t craves/notification-service:$TAG services/notification-service
```
```bash
cd ~/c8 && DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $NOTIF_APP $ACR.azurecr.io/craves/notification-service:$TAG notification
```
Route A (only if the preflight printed SUCCESS):

```bash
cd ~/c8 && READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10 bash scripts/release/deploy-single-service-preserve-runtime.sh $RG $NOTIF_APP $ACR.azurecr.io/craves/notification-service:$TAG notification
```
Route B (preflight refused). Check no rollout is running (`latest` equals `ready`, mode `Single`), then update:

```bash
az containerapp show -g $RG -n $NOTIF_APP --query "{latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,mode:properties.configuration.activeRevisionsMode}" -o jsonc
```
```bash
az containerapp update -g $RG -n $NOTIF_APP --image $ACR.azurecr.io/craves/notification-service:$TAG
```
Verify (Healthy, traffic 100, new image):

```bash
az containerapp revision list -g $RG -n $NOTIF_APP --query "[?properties.active].{name:name,health:properties.healthState,running:properties.runningState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
Smoke: `/in-app` routes are already on the gateway, so unauthenticated calls must answer 401, and the app's Notifications screen must still load:

```bash
gw "GET /api/v1/notifications/in-app/unread-count?role=CHEF" "GET /api/v1/notifications/in-app/page?role=CHEF"
```
Rollback (no data change, safe at any time):

```bash
az containerapp update -g $RG -n $NOTIF_APP --image <PREV_NOTIFICATION_IMAGE>
```
Behaviour to know: `role=` empty or any value other than CHEF/CUSTOMER (including ADMIN) answers 400 by design. Notices stored with a NULL `recipient_role` are excluded from any role-filtered list (they still show without the parameter).

## Step 3. subscription-service (no migration)

Adds `activeSubscriberCount` (one correlated COUNT inside the existing plan SELECT; ACTIVE only). The preserve-runtime route worked for this service on 2026-10-12 (V18).

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

Kitchen auto-accept only works when order-service has `CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=true` (default false). Auto-accept rides the same worker as the chef "New order received" notification (30 s tick), so it is not instant. That flag ALSO turns on the 30-minute auto-reject with refund and the 10 and 20 minute reminders. Do not flip it casually. Read the current values first (no value shown means the default, false):

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
Refund deploy scripts reset it to false (`azure-pipelines-refund-combined-deploy.yml:202`, `scripts/refund/activate-refund-stage.sh:298`): after any refund-stage deploy, re-read the value above. An image-only order deploy (Step 4) does not change it. Meal-plan (subscription) orders are never auto-accepted: accept sets `ready_at = now + prep` and integration books the courier from it, so an accept at creation would dispatch hours early; meal-plan chefs still accept by hand.

## Step 6. APIM routes (last)

Only after Steps 1 to 4 are healthy. The script (`scripts/apim/configure-chef-app-routes-apim.sh`) pins the subscription, tenant, RG and APIM `apim-craves-prodlow-kmqgfy`, runs a read-only Phase 1 (apps Running and `/actuator/health` UP, API owners by path, subscription key not required, which operations already exist), and only then Phase 2 writes: it creates missing APIs and missing operations and never touches an existing operation or its policy. It then reads back every operation and sends an unauthenticated probe that must answer 401.

6.1 Prerequisites (read-only). These API paths must already exist on kmqgfy: `api/v1/kitchens/me`, `api/v1/chef/orders`, `api/v1/notifications` (the script stops before any write and names the script to run if one is missing). Created if absent: `api/v1/chef/scheduled-orders`, `api/v1/chef/reviews`, `api/v1/support`.

```bash
az apim api list -g $RG --service-name $APIM --query "[?path=='api/v1/kitchens/me' || path=='api/v1/chef/orders' || path=='api/v1/notifications' || path=='api/v1/chef/scheduled-orders' || path=='api/v1/chef/reviews' || path=='api/v1/support'].[name,path,subscriptionRequired]" -o tsv
```
If `kitchens/me` or `chef/orders` is missing, run `scripts/apim/configure-chef-kitchen-profile-apim.sh` / `configure-chef-order-read-apim.sh` with `APIM=apim-craves-prodlow-kmqgfy` (these older scripts default to the deleted `l3ing6`; read each one first for its own confirm flag). No script in the repo publishes `api/v1/notifications`; if it is missing, stop and ask. The script does not publish: kitchen `GET/PUT /kitchens/me`, menu items, per-dish availability, image upload, chef order list/get/accept/reject/ready, chef subscription plans, chef application and finance (older scripts own them; run those with `APIM=apim-craves-prodlow-kmqgfy`). Check they are live (expect 401, a 404 means not published):

```bash
gw "GET /api/v1/kitchens/me" "PUT /api/v1/kitchens/me" "GET /api/v1/kitchens/me/menu-items" "PUT /api/v1/kitchens/me/menu-items/probe" "PATCH /api/v1/kitchens/me/menu-items/probe/availability" "POST /api/v1/kitchens/me/menu-items/probe/images" "GET /api/v1/chef/orders" "GET /api/v1/chef/orders/probe" "POST /api/v1/chef/orders/probe/accept" "POST /api/v1/chef/orders/probe/reject" "POST /api/v1/chef/orders/probe/ready-for-pickup" "GET /api/v1/chef/subscription-plans" "PATCH /api/v1/notifications/in-app/probe/read"
```

6.2 Validate the assets (real `xmllint` was not available when the script was written; run where it exists) and preview the route table. The dry run makes no Azure call:

```bash
cd ~/c8 && command -v xmllint && bash scripts/release/validate-apim-assets.sh
```
```bash
cd ~/c8 && DRY_RUN=true bash scripts/apim/configure-chef-app-routes-apim.sh
```
Expect 28 operations on 6 APIs.

6.3 Run it (Enter is yours; this writes to the live gateway). Read the Phase 1 lines first: which APIs "exist" and which "will be created", then KEEP/CREATE per route and 28 `OK ... (401 unauthenticated)` lines. The real `az` and `jq` calls had only been exercised through stubs, so Phase 1 is the first real test; any failure there wrote nothing.

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
gw "GET /api/v1/kitchens/me/schedule" "PUT /api/v1/kitchens/me/schedule" "GET /api/v1/kitchens/me/schedule/overrides/probe" "PUT /api/v1/kitchens/me/schedule/overrides/probe" "DELETE /api/v1/kitchens/me/schedule/overrides/probe" "PATCH /api/v1/kitchens/me/menu-items/availability" "DELETE /api/v1/kitchens/me/menu-items/probe/images/probe" "PUT /api/v1/kitchens/me/menu-items/probe/images/probe/primary" "DELETE /api/v1/kitchens/me/menu-items/probe" "POST /api/v1/kitchens/me/photos" "DELETE /api/v1/kitchens/me/photos/CHEF" "GET /api/v1/kitchens/me/settings" "PUT /api/v1/kitchens/me/settings" "GET /api/v1/chef/orders/page" "POST /api/v1/chef/orders/probe/handed-over" "GET /api/v1/chef/scheduled-orders" "PUT /api/v1/chef/scheduled-orders/probe/orders/probe/response" "GET /api/v1/chef/reviews" "GET /api/v1/chef/reviews/kitchens/probe/summary" "POST /api/v1/support/cases" "GET /api/v1/support/cases" "GET /api/v1/support/cases/probe" "POST /api/v1/support/cases/probe/messages" "GET /api/v1/notifications/in-app/page" "GET /api/v1/notifications/in-app/unread-count" "PATCH /api/v1/notifications/in-app/read-all" "GET /api/v1/notifications/preferences" "PUT /api/v1/notifications/preferences/probe" | grep -v '^401 ' || echo ALL-401
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
2. Kitchen profile: upload a chef photo and a kitchen photo (JPEG/PNG/WebP up to 8 MiB), replace one, delete one; save cuisines (max 10, 40 chars each), delivery areas, and social links. **The app must always send all four social links** (the object replaces all four; https only). Public kitchen page shows the photos.
3. Settings: toggle auto-accept and default prep (5 to 120). Remember Step 5 decides whether it does anything.
4. Menu: archive a dish with the delete action; it disappears from the chef list and from the customer menu, discovery and favourites; the other dishes are untouched.
5. Notifications: the chef app shows only chef notices; unread count and "mark all read" with `role=CHEF` leave customer notices unread.
6. Meal plans: each plan shows its subscriber count (ACTIVE only).
7. Existing clients keep working: craves.in web, admin, and the customer app (menu, cart, order screen), and the old chef app 1.30.0 (new fields are optional and ignored).
8. If Step 5 was done: place a test order for a kitchen with auto-accept on; within about a minute it becomes ACCEPTED with history reason "Accepted automatically", and the customer is told.

## Rollback summary

| Service | Command | Warning |
|---|---|---|
| catalog | `az containerapp update -g $RG -n $CATALOG_APP --image <PREV_CATALOG_IMAGE>` | never to a pre-V9 image after any dish is archived (old image throws on `ARCHIVED`); fix forward instead |
| notification | `az containerapp update -g $RG -n $NOTIF_APP --image <PREV_NOTIFICATION_IMAGE>` | none |
| subscription | `az containerapp update -g $RG -n $SUB_APP --image <PREV_SUBSCRIPTION_IMAGE>` | none |
| order | `az containerapp update -g $RG -n $ORDER_APP --image <PREV_ORDER_IMAGE>` | chef detail fields, handed-over and auto-accept vanish from responses; data stays |
| auto-accept flag | `az containerapp update -g $RG -n $ORDER_APP --set-env-vars CRAVES_CHEF_ACCEPTANCE_WORKER_ENABLED=false` | also stops the 30-minute auto-reject and reminders |
| APIM | delete only the operations the script created (6.6) | the backends keep working without the routes |

Flyway migrations V9 (catalog) and V37 (order) are additive: rollback is the previous image, the columns stay. Roll back in reverse order (APIM routes, order, subscription, notification, catalog), and roll back only the service that is at fault.

## Risks and findings for you

Decisions and gaps you should know before releasing:

- **Possible cause of the cart bill-preview 403 (finding).** order-service `CatalogClient` calls `POST /internal/menu-items/resolve` (cart preflight, through `CRAVES_CATALOG_BASE_URL`, default `https://api.craves.in/api/v1/catalog`). Catalog on main does not serve it (added in `1ef06939c`, later dropped). This release does not fix it; Step 1.2 tells you whether prod serves it today and whether the catalog deploy removed it. If it is served by a prod-only patch, archived dishes could also pass cart preflight (it needs the same `status = 'ACTIVE'` filter).
- **Meal plans using a dish the chef later archives fail at their next subscription order** (`PlanCatalogClient` reads `GET /menu-items/{id}`). Not handled. Tell chefs not to archive a dish that is in an active plan, or accept the failure.
- **Archived dishes in a customer's saved or favourite items now read as MISSING.**
- **Auto-accept needs the worker flag** and that flag also enables auto-reject with refund and reminders (Step 5). A kitchen whose catalog image predates V9 returns no settings, so auto-accept stays off (safe), which is why catalog goes first. Auto-accept happens on the next 30 s tick, tries once (if the dish lookup fails it uses the kitchen default prep then 15 minutes; if the accept itself fails the order stays pending and the chef is notified normally), and its history reason "Accepted automatically" is free text a chef could also type. The customer notification after the commit can be lost if the process dies at that moment (the order status is still correct). Each auto-accept makes about 4+N catalog calls on the single scheduler thread and the catalog client has no timeouts, so a slow catalog can stall that worker (timeouts and reminders included). A failing `order_source` read propagates and the worker retries on the next tick.
- **Order notes:** a checkout note over 500 characters is cut to its first 500 code points (the plan said reject, but notes up to 2000 were accepted before and existing clients must keep working), so very long notes lose their tail.
- **Chef order list `/chef/orders/page` is not extended** (no deadline or note there); the app uses it for Past history only.
- **Customer and admin order JSON now carries `"chefHandedOverAt": null`** (always serialised).
- **Courier data:** `deliveryPartner` stays absent until integration-service sends courier fields (out of scope, it is not deployed from main). Courier phone and photo URL are stored as unbounded text with no URL validation (the app treats `photoUrl` as untrusted); the phone also lands in `delivery_status_inbox.payload` (existing raw payload storage). A same-status ("no change") delivery report can overwrite a newer courier ETA or name with older values (low impact, accepted).
- **Catalog edges:** the `socialLinks` object replaces all four links (the app must always send all four); `https://user:pw@host` is accepted; internationalised and underscore hostnames are rejected. A kitchen photo blob can be orphaned if the DB update fails after upload; no test asserts the real blob path; `updateAvailability` can race and set `is_available` on an `ARCHIVED` row (invisible to customers).
- **Notifications:** `role=` empty is a 400; rows with NULL `recipient_role` drop out of role-filtered lists; the service README does not mention `role`; no EXPLAIN was run on real volumes (role is a residual filter on one user's rows).
- **Subscriber count:** counts ACTIVE only (PAUSED, PENDING_PAYMENT and the rest excluded); it uses a correlated COUNT, not a literal GROUP BY; no HTTP-layer assertion.
- **APIM:** a new operation id (`chef-app-*`) is not checked against an operation with a different method or template, so a PUT could overwrite (unlikely); existing operations keep their policy and do not get the new no-store header; the three older scripts for `kitchens/me`, `chef/orders` (and the unscripted `notifications`) must already be live.
- **Follow-up, referral routes are not published** because the live APIM API `craves-referral-members-v1` points at the wrong backend (`docs/referrals/CHEF_ACTIVATION_20261012.md`). The app needs, once that is fixed: `GET /api/v1/referrals/me`, `/me/code`, `/me/code/qr`, `/me/chef-earnings`, `/me/rewards` and `POST /api/v1/auth/referrals/enroll`.
- **Excluded by design:** auth-service ("Log out other devices") and integration-service (live courier data) stay "Coming soon".
- **Unverified by me:** everything in this file was written from the repo only. Not checked against Azure: the Postgres FQDN, the catalog database name, whether catalog and notification really hold plain secrets (the preflight will tell you), whether prod serves the internal resolve route, the current value of the worker flag, Flyway tolerating applied-newer migrations on rollback, and the real `az`/`jq`/`xmllint` behaviour of the APIM script.

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
| Internal resolve probe: before / after | |
| Worker flag decision (value before / after) | |
| APIM run (kept / created / probes OK) | |
| App 1.31.0 smoke result | |
