# Kitchen launch alerts release runbook (2026-10-24)

Ships: user-chef-service migration V21 (`customer_kitchen_launch_alert`) and `GET`/`PUT /api/v1/customer/launch-alerts`,
the Home "Notify me" button on app 1.35.4 when no home kitchen cooks near the customer's address. It only stores the
request; sending the notification when a kitchen opens is a later release. Run everything in Azure Cloud Shell (Bash),
one line at a time. Commands that change production are marked **(Enter is yours)**.

## 0. Variables, code and rollback image

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 APIM=apim-craves-prodlow-kmqgfy SHA=<MERGED_SHA>; export TAG=$SHA USERCHEF_APP=$(az containerapp list -g $RG --query "[?contains(name,'user-chef')].name | [0]" -o tsv); echo "user-chef app: $USERCHEF_APP"
```
```bash
rm -rf ~/c8 && mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA && git checkout -q --detach FETCH_HEAD && git rev-parse HEAD
```
```bash
az containerapp show -g $RG -n $USERCHEF_APP --query 'properties.template.containers[0].image' -o tsv
```
Keep that line: it is the rollback image. If its tag is `7ee75e7c…` (the 14 Oct release), this deploy also ships the
user-chef changes merged since then: rider road distance with migration V20 (`cf85f64f9`, `e4143d211`, `ee1dbec75`),
the Hikari pool budget (`e28aede73`, `8332148c0`) and #496. Check with
`git -C ~/c8 log --oneline 7ee75e7cfbe94b915eeff5f442a12900892e7a97..HEAD -- services/user-chef-service` (the fetch is shallow, so
run `git -C ~/c8 fetch -q --unshallow` first) and stop if anything there should not go live yet.

## 1. Build user-chef (Enter is yours)

```bash
cd ~/c8 && az acr build -r $ACR -t craves/user-chef-service:$TAG services/user-chef-service
```
Check the tag really exists before deploying (an empty answer means the build did not run):
```bash
az acr repository show-tags -n $ACR --repository craves/user-chef-service --query "[?@=='$TAG']" -o tsv
```

## 2. Deploy user-chef (Enter is yours)

```bash
az containerapp update -g $RG -n $USERCHEF_APP --image $ACR.azurecr.io/craves/user-chef-service:$TAG
```
```bash
az containerapp revision list -g $RG -n $USERCHEF_APP --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
The new revision must be Healthy with 100% traffic. The log should show Flyway applying V21:
```bash
az containerapp logs show -g $RG -n $USERCHEF_APP --type console --tail 300 --format text | grep -E "Flyway|Migrating|ERROR|LIVE_RUNTIME_LOCK" | tail -10
```

## 3. Publish the two gateway routes (Enter is yours)

```bash
cd ~/c8 && APIM=$APIM bash scripts/apim/configure-customer-launch-alerts-apim.sh
```
It ends with `SUCCESS: Customer launch alert GET/PUT operations configured`.

## 4. Check (read-only)

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://api.craves.in/api/v1/customer/launch-alerts?latitude=17.46&longitude=78.36"
```
Expect `401` (the gateway route exists and wants sign-in). `404` means step 3 did not publish it. Then on the phone, pick an
address with no kitchens, tap Notify me, and check that it turns into "You'll get a notification when it opens".

## Rollback

Routes first, then the image. V21 only adds a table, so the previous image runs with it in place.
```bash
cd ~/c8 && CONFIRM_LAUNCH_ALERTS_APIM_ROLLBACK=true APIM=$APIM bash scripts/apim/rollback-customer-launch-alerts-apim.sh
```
```bash
az containerapp update -g $RG -n $USERCHEF_APP --image <PREVIOUS_USERCHEF_IMAGE>
```
