# Kitchen launch notifications release runbook (2026-10-24)

Ships: user-chef-service `KitchenLaunchAlertJob`. Every 15 minutes it checks each spot where customers tapped
**Notify me** on the Home coming-soon page (app 1.35.4+). When catalog discovery now finds a kitchen within 10 km (the
same question Home asks), each waiting customer gets one **in-app** notification: "Home chefs now cook near <area>" /
"<kitchen> now delivers to your address. Tap to see the menu." Tapping it opens that kitchen's page; the app already
supports this, so no app release is needed. No push, no Firebase, no migration, no gateway change.

Run everything in Azure Cloud Shell (Bash), one line at a time. Commands that change production are marked
**(Enter is yours)**.

## 0. Variables, code and rollback image

```bash
export RG=rg-craves-prodlow-centralindia ACR=cravesrm09prodlow6bf632 SHA=<MERGED_SHA>; export TAG=$SHA USERCHEF_APP=$(az containerapp list -g $RG --query "[?contains(name,'user-chef')].name | [0]" -o tsv); echo "user-chef app: $USERCHEF_APP"
```
```bash
rm -rf ~/c8 && mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q https://github.com/rmorampudi09-arch/Craves-Build-platform.git $SHA && git checkout -q --detach FETCH_HEAD && git rev-parse HEAD
```
```bash
az containerapp show -g $RG -n $USERCHEF_APP --query 'properties.template.containers[0].image' -o tsv
```
Keep that line: it is the rollback image (on 24 Oct it was the tag `04f652a6f3903cf0669e74222560bf25c1cbd0eb`).

## 1. Build (Enter is yours)

```bash
cd ~/c8 && az acr build -r $ACR -t craves/user-chef-service:$TAG services/user-chef-service
```
```bash
az acr repository show-tags -n $ACR --repository craves/user-chef-service --query "[?@=='$TAG']" -o tsv
```
An empty answer means the build did not run: stop.

## 2. Deploy with the job switched on (Enter is yours)

```bash
az containerapp update -g $RG -n $USERCHEF_APP --image $ACR.azurecr.io/craves/user-chef-service:$TAG --set-env-vars CRAVES_DISCOVERY_BASE_URL=https://api.craves.in CRAVES_KITCHEN_LAUNCH_ALERTS_ENABLED=true -o none && echo DEPLOY-SENT
```
```bash
az containerapp revision list -g $RG -n $USERCHEF_APP --query "[?properties.active].{name:name,health:properties.healthState,traffic:properties.trafficWeight,image:properties.template.containers[0].image}" -o table
```
The new revision must be Healthy with 100% traffic.

## 3. Check (read-only)

The first run starts 2 minutes after the app starts. Nothing is logged while no waiting spot has a kitchen yet. When a
kitchen opens near a waiting customer, the log shows `Kitchen launch alerts sent to N customers`; a catalog problem shows
`Kitchen launch alerts paused this run`.
```bash
az containerapp logs show -g $RG -n $USERCHEF_APP --type console --tail 300 --format text | grep -oE "Kitchen launch alerts.{0,80}|Notification dispatch failed.{0,120}" | tail -5
```

## Switch off or roll back

Switch the job off and keep the image:
```bash
az containerapp update -g $RG -n $USERCHEF_APP --set-env-vars CRAVES_KITCHEN_LAUNCH_ALERTS_ENABLED=false -o none
```
Or go back to the previous image:
```bash
az containerapp update -g $RG -n $USERCHEF_APP --image <PREVIOUS_USERCHEF_IMAGE> -o none
```
