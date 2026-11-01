# Kitchen photos release runbook (2026-10-14)

Ships: user-chef-service (new internal route, no migration) and catalog-service (migration V10, kitchen photo slots,
lock, import). No new gateway (APIM) routes; the chef photo upload route must already be live (checked in step 1). Run everything in Azure Cloud Shell
(Bash), one line at a time. Commands that change production are marked **(Enter is yours)**.

## 0. Variables and code

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 CATALOG_APP=ca-craves-catalog-service-prodlo ORDER_APP=ca-craves-order-service-prodlow SHA=<MERGED_SHA>; export TAG=$SHA; export USERCHEF_APP=$(az containerapp list -g $RG --query "[?contains(name,'user-chef')].name | [0]" -o tsv); echo "user-chef app: $USERCHEF_APP"
```
```bash
rm -rf ~/c8 && mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA && git checkout -q --detach FETCH_HEAD && git rev-parse HEAD
```
Record the rollback images:
```bash
for a in $USERCHEF_APP $CATALOG_APP; do echo "$a $(az containerapp show -g $RG -n $a --query 'properties.template.containers[0].image' -o tsv)"; done
```

## 1. Settings check (read-only)

The chef photo upload route must reach catalog through the gateway (published by the 10-13 runbook Step 6):
```bash
curl -s -o /dev/null -w '%{http_code}
' -X POST "https://api.craves.in/api/v1/kitchens/me/photos?kind=KITCHEN"
```
Expect `403` (it reached catalog, which refuses a request without sign-in; checked 14 Oct). `404` means the gateway
lacks the route: run 10-13 Step 6 first.

Catalog needs user-chef's internal address (order-service already has it) and the same internal secret user-chef
checks. Catalog falls back to its own `CRAVES_INTERNAL_SERVICE_SECRET`, so first confirm the two apps hold the same
secret. This prints the Key Vault reference or a short hash, never the secret:
```bash
for a in $USERCHEF_APP $CATALOG_APP; do s=$(az containerapp show -g $RG -n $a --query "properties.template.containers[0].env[?name=='CRAVES_INTERNAL_SERVICE_SECRET'].secretRef | [0]" -o tsv); kv=$( [ -n "$s" ] && az containerapp show -g $RG -n $a --query "properties.configuration.secrets[?name=='$s'].keyVaultUrl | [0]" -o tsv); if [ -n "$kv" ]; then echo "$a keyvault $kv"; else v=$( [ -n "$s" ] && az containerapp secret show -g $RG -n $a --secret-name "$s" --query value -o tsv || az containerapp show -g $RG -n $a --query "properties.template.containers[0].env[?name=='CRAVES_INTERNAL_SERVICE_SECRET'].value | [0]" -o tsv); [ -n "$v" ] && echo "$a value $(printf %s "$v" | sha256sum | cut -c1-12)" || echo "$a EMPTY"; fi; done; unset s kv v
```
Both lines must match after the app name (`keyvault <same URL>`, or `value <same hash>`). `EMPTY`, a mismatch, or one
Key Vault and one value: stop and send the two lines to Claude.
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

The chef cannot replace a photo. Support empties the slot, then the chef adds a new photo in the app. Load the
catalog internal key (Key Vault or plain secret) without printing it:
```bash
export CATALOG_FQDN=$(az containerapp show -g $RG -n $CATALOG_APP --query properties.configuration.ingress.fqdn -o tsv); s=$(az containerapp show -g $RG -n $CATALOG_APP --query "properties.template.containers[0].env[?name=='CRAVES_INTERNAL_SERVICE_SECRET'].secretRef | [0]" -o tsv); kv=$(az containerapp show -g $RG -n $CATALOG_APP --query "properties.configuration.secrets[?name=='$s'].keyVaultUrl | [0]" -o tsv); K=$( [ -n "$kv" ] && az keyvault secret show --id "$kv" --query value -o tsv || az containerapp secret show -g $RG -n $CATALOG_APP --secret-name "$s" --query value -o tsv); [ -n "$K" ] && echo "key loaded" || echo "NO KEY: stop"; unset s kv
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
