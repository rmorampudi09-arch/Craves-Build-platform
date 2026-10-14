# Kitchen photos release runbook (2026-10-14)

Ships: user-chef-service (new internal route, no migration) and catalog-service (migration V10, kitchen photo slots,
lock, import). No gateway (APIM) change: the routes the apps use already exist. Run everything in Azure Cloud Shell
(Bash), one line at a time. Commands that change production are marked **(Enter is yours)**.

## 0. Variables and code

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 CATALOG_APP=ca-craves-catalog-service-prodlo ORDER_APP=ca-craves-order-service-prodlow SHA=<MERGED_SHA>; export TAG=kphotos-${SHA:0:9}; export USERCHEF_APP=$(az containerapp list -g $RG --query "[?contains(name,'user-chef')].name | [0]" -o tsv); echo "user-chef app: $USERCHEF_APP"
```
```bash
rm -rf ~/c8 && mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA && git checkout -q --detach FETCH_HEAD && git rev-parse HEAD
```
Record the rollback images:
```bash
for a in $USERCHEF_APP $CATALOG_APP; do echo "$a $(az containerapp show -g $RG -n $a --query 'properties.template.containers[0].image' -o tsv)"; done
```

## 1. Settings check (read-only)

Catalog needs user-chef's internal address (order-service already has it) and the same internal secret user-chef
checks. Catalog falls back to its own `CRAVES_INTERNAL_SERVICE_SECRET`, so first confirm the two apps hold the same
value. This prints hashes only, never the secret:
```bash
for a in $USERCHEF_APP $CATALOG_APP; do r=$(az containerapp show -g $RG -n $a --query "properties.template.containers[0].env[?name=='CRAVES_INTERNAL_SERVICE_SECRET'] | [0]" -o json); s=$(echo "$r" | jq -r '.secretRef // empty'); v=$( [ -n "$s" ] && az containerapp secret show -g $RG -n $a --secret-name "$s" --query value -o tsv || echo "$r" | jq -r '.value // empty'); echo "$a $(printf %s "$v" | sha256sum | cut -c1-12)"; done; unset r s v
```
Same hash on both lines: nothing to add. Different or empty: stop and send the two lines to Claude.
```bash
az containerapp show -g $RG -n $ORDER_APP --query "properties.template.containers[0].env[?name=='CRAVES_USER_CHEF_INTERNAL_BASE_URL'].[value,secretRef]" -o tsv
```
Keep that value as `UC_URL` (if it prints a secretRef instead, stop and ask Claude):
```bash
export UC_URL=<value printed above>
```

## 2. user-chef-service

```bash
cd ~/c8 && az acr build -r $ACR -t craves/user-chef-service:$TAG services/user-chef-service
```
**(Enter is yours)** image only, settings and secrets stay:
```bash
az containerapp update -g $RG -n $USERCHEF_APP --image $ACR.azurecr.io/craves/user-chef-service:$TAG
```
Re-run until the new revision is Healthy with traffic 100:
```bash
az containerapp revision list -g $RG -n $USERCHEF_APP --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```

## 3. catalog-service

```bash
cd ~/c8 && az acr build -r $ACR -t craves/catalog-service:$TAG services/catalog-service
```
**(Enter is yours)** new image plus the one new setting:
```bash
az containerapp update -g $RG -n $CATALOG_APP --image $ACR.azurecr.io/craves/catalog-service:$TAG --set-env-vars CRAVES_USER_CHEF_INTERNAL_BASE_URL=$UC_URL
```
Verify (re-run the first until Healthy with traffic 100):
```bash
az containerapp revision list -g $RG -n $CATALOG_APP --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
```bash
az containerapp logs show -g $RG -n $CATALOG_APP --type console --tail 300 --format text | grep -E "kitchen photo|Kitchen photo|Flyway|ERROR" | tail -10
```
Expect `Successfully applied 1 migration ... v10` (or "Migrating schema ... to version 10") and
`kitchen photo backfill imported N of M (0 failed, ...)`. A failed count above 0 means user-chef could not answer for
those kitchens; they retry at the next start, nothing is half-written.

Public check (no sign-in), any live kitchen id:
```bash
curl -s https://api.craves.in/api/v1/catalog/kitchens/<KITCHEN_ID> | jq '{kitchenPhotoUrl, kitchenPhotoUrls, email, phoneNumber}'
```
Expect `kitchenPhotoUrls` (a list, empty for chefs without approved registration photos) and `email`/`phoneNumber`
null (public privacy stays on).

## 4. Support: let a chef replace a kitchen photo

The chef cannot replace a photo. Support empties the slot, then the chef adds a new photo in the app.
```bash
export CATALOG_FQDN=$(az containerapp show -g $RG -n $CATALOG_APP --query properties.configuration.ingress.fqdn -o tsv); K=$(az containerapp secret show -g $RG -n $CATALOG_APP --secret-name $(az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_INTERNAL_SERVICE_SECRET'].secretRef | [0]" -o tsv) --query value -o tsv)
```
**(Enter is yours)** slot 1 = overall kitchen, 2 = cooking setup:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "X-Craves-Internal-Key: $K" https://$CATALOG_FQDN/api/v1/catalog/internal/kitchens/<KITCHEN_ID>/photos/<SLOT>; unset K
```
Expect `204`.

## 5. Rollback

Image only; V10's two columns stay and are harmless. Roll back catalog first:
```bash
az containerapp update -g $RG -n $CATALOG_APP --image <PREVIOUS_CATALOG_IMAGE> --remove-env-vars CRAVES_USER_CHEF_INTERNAL_BASE_URL
```
```bash
az containerapp update -g $RG -n $USERCHEF_APP --image <PREVIOUS_USERCHEF_IMAGE>
```
An older catalog image ignores slot 2 and lets chefs replace or remove slot 1 again, and it would delete a replaced
registration photo's file. Kitchen photos are copies, so the registration originals in user-chef stay untouched.
