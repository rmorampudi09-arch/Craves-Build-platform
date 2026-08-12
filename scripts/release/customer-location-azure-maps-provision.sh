#!/usr/bin/env bash
set -euo pipefail

: "${CRAVES_CONFIRM_BILLABLE_AZURE_MAPS:=false}"
: "${CRAVES_EXPECTED_SUBSCRIPTION_ID:=4f897b61-9b52-44b4-8cf1-bdac281cc1aa}"
: "${CRAVES_RESOURCE_GROUP:=rg-craves-prodlow-centralindia}"
: "${CRAVES_CUSTOMER_WEB_APP:=ca-craves-web-prodlow}"
: "${CRAVES_AZURE_MAPS_ACCOUNT:=maps-craves-prodlow-l3ing6}"
: "${CRAVES_AZURE_MAPS_LOCATION:=global}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "${CRAVES_CONFIRM_BILLABLE_AZURE_MAPS,,}" == "true" ]] || fail \
  "CRAVES_CONFIRM_BILLABLE_AZURE_MAPS=true is required because Azure Maps is a billable metered resource."

for command in az jq; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

az account set --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID"
ACTIVE_SUBSCRIPTION_ID="$(az account show --query id -o tsv --only-show-errors)"
[[ "$ACTIVE_SUBSCRIPTION_ID" == "$CRAVES_EXPECTED_SUBSCRIPTION_ID" ]] || fail \
  "Azure CLI is using subscription $ACTIVE_SUBSCRIPTION_ID instead of $CRAVES_EXPECTED_SUBSCRIPTION_ID"

RG_LOCATION="$(az group show \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --name "$CRAVES_RESOURCE_GROUP" \
  --query location \
  -o tsv \
  --only-show-errors)" || fail "Resource group $CRAVES_RESOURCE_GROUP was not found"
[[ -n "$RG_LOCATION" ]] || fail "Resource group location could not be resolved"

MAPS_LOCATION="$CRAVES_AZURE_MAPS_LOCATION"
[[ -n "$MAPS_LOCATION" ]] || fail "Azure Maps account location could not be resolved"

APP_JSON="$(az containerapp show \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --resource-group "$CRAVES_RESOURCE_GROUP" \
  --name "$CRAVES_CUSTOMER_WEB_APP" \
  -o json \
  --only-show-errors)"

WEB_PRINCIPAL_ID="$(jq -r '.identity.principalId // ""' <<<"$APP_JSON")"
if [[ -z "$WEB_PRINCIPAL_ID" ]]; then
  echo "Customer web has no system-assigned managed identity. Enabling it now."
  az containerapp identity assign \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --name "$CRAVES_CUSTOMER_WEB_APP" \
    --system-assigned \
    --only-show-errors >/dev/null
  WEB_PRINCIPAL_ID="$(az containerapp show \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --name "$CRAVES_CUSTOMER_WEB_APP" \
    --query identity.principalId \
    -o tsv \
    --only-show-errors)"
fi
[[ -n "$WEB_PRINCIPAL_ID" ]] || fail "Customer web managed identity principal ID could not be resolved"

if az maps account show \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --resource-group "$CRAVES_RESOURCE_GROUP" \
  --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
  --only-show-errors >/dev/null 2>&1; then
  echo "Azure Maps account already exists: $CRAVES_AZURE_MAPS_ACCOUNT"
  MAPS_KIND="$(az maps account show \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
    --query kind -o tsv --only-show-errors)"
  MAPS_SKU="$(az maps account show \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
    --query sku.name -o tsv --only-show-errors)"
  [[ "$MAPS_KIND" == "Gen2" ]] || fail "Existing Azure Maps account is $MAPS_KIND; expected Gen2"
  [[ "$MAPS_SKU" == "G2" ]] || fail "Existing Azure Maps account SKU is $MAPS_SKU; expected G2"
  az maps account update \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
    --sku G2 \
    --kind Gen2 \
    --disable-local-auth true \
    --only-show-errors >/dev/null
else
  echo "Creating BILLABLE Azure Maps Gen2/G2 account: $CRAVES_AZURE_MAPS_ACCOUNT in $MAPS_LOCATION"
  az maps account create \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
    --location "$MAPS_LOCATION" \
    --sku G2 \
    --kind Gen2 \
    --disable-local-auth true \
    --accept-tos \
    --tags application=craves environment=prodlow capability=customer-location \
    --only-show-errors >/dev/null
fi

MAPS_ID="$(az maps account show \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --resource-group "$CRAVES_RESOURCE_GROUP" \
  --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
  --query id -o tsv --only-show-errors)"
MAPS_CLIENT_ID="$(az maps account show \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --resource-group "$CRAVES_RESOURCE_GROUP" \
  --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
  --query properties.uniqueId -o tsv --only-show-errors)"
[[ -n "$MAPS_ID" && -n "$MAPS_CLIENT_ID" ]] || fail "Azure Maps account ID/unique client ID could not be resolved"

ROLE_EXISTS="$(az role assignment list \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --assignee-object-id "$WEB_PRINCIPAL_ID" \
  --scope "$MAPS_ID" \
  --query "[?roleDefinitionName=='Azure Maps Data Reader'] | length(@)" \
  -o tsv \
  --only-show-errors)"
if [[ "$ROLE_EXISTS" == "0" ]]; then
  echo "Granting customer-web managed identity Azure Maps Data Reader at the Maps account scope."
  az role assignment create \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --assignee-object-id "$WEB_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Azure Maps Data Reader" \
    --scope "$MAPS_ID" \
    --only-show-errors >/dev/null
else
  echo "Azure Maps Data Reader role assignment already exists."
fi

for attempt in $(seq 1 12); do
  ROLE_COUNT="$(az role assignment list \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --assignee-object-id "$WEB_PRINCIPAL_ID" \
    --scope "$MAPS_ID" \
    --query "[?roleDefinitionName=='Azure Maps Data Reader'] | length(@)" \
    -o tsv \
    --only-show-errors || true)"
  [[ "$ROLE_COUNT" != "0" && -n "$ROLE_COUNT" ]] && break
  [[ "$attempt" -lt 12 ]] && sleep 10
done
[[ "${ROLE_COUNT:-0}" != "0" ]] || fail "Azure Maps Data Reader role assignment did not become visible"

echo "Binding non-secret Azure Maps configuration to customer web Container App."
az containerapp update \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --resource-group "$CRAVES_RESOURCE_GROUP" \
  --name "$CRAVES_CUSTOMER_WEB_APP" \
  --set-env-vars \
    "AZURE_MAPS_CLIENT_ID=$MAPS_CLIENT_ID" \
    "AZURE_MAPS_ENDPOINT=https://atlas.microsoft.com" \
  --only-show-errors >/dev/null

for attempt in $(seq 1 40); do
  APP_JSON="$(az containerapp show \
    --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
    --resource-group "$CRAVES_RESOURCE_GROUP" \
    --name "$CRAVES_CUSTOMER_WEB_APP" \
    -o json --only-show-errors)"
  LATEST_REVISION="$(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON")"
  LATEST_READY_REVISION="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON")"
  if [[ -n "$LATEST_REVISION" && "$LATEST_READY_REVISION" == "$LATEST_REVISION" ]]; then
    break
  fi
  [[ "$attempt" -lt 40 ]] && sleep 10
done
[[ -n "${LATEST_REVISION:-}" && "$LATEST_READY_REVISION" == "$LATEST_REVISION" ]] || fail \
  "Customer web did not report the new revision Ready after Azure Maps configuration"

CONFIGURED_CLIENT_ID="$(jq -r '[.properties.template.containers[0].env[]? | select(.name == "AZURE_MAPS_CLIENT_ID") | .value][0] // ""' <<<"$APP_JSON")"
CONFIGURED_ENDPOINT="$(jq -r '[.properties.template.containers[0].env[]? | select(.name == "AZURE_MAPS_ENDPOINT") | .value][0] // ""' <<<"$APP_JSON")"
[[ "$CONFIGURED_CLIENT_ID" == "$MAPS_CLIENT_ID" ]] || fail "AZURE_MAPS_CLIENT_ID was not bound correctly"
[[ "$CONFIGURED_ENDPOINT" == "https://atlas.microsoft.com" ]] || fail "AZURE_MAPS_ENDPOINT was not bound correctly"

LOCAL_AUTH_DISABLED="$(az maps account show \
  --subscription "$CRAVES_EXPECTED_SUBSCRIPTION_ID" \
  --resource-group "$CRAVES_RESOURCE_GROUP" \
  --account-name "$CRAVES_AZURE_MAPS_ACCOUNT" \
  --query properties.disableLocalAuth -o tsv --only-show-errors)"
[[ "${LOCAL_AUTH_DISABLED,,}" == "true" ]] || fail "Azure Maps local/shared-key authentication is not disabled"

cat <<EOF
Azure Maps location foundation is configured.
Maps account: $CRAVES_AZURE_MAPS_ACCOUNT
Maps region: $MAPS_LOCATION
Maps kind/SKU: Gen2/G2
Shared-key auth: disabled
Customer web managed identity: $WEB_PRINCIPAL_ID
Role: Azure Maps Data Reader
Container App revision: $LATEST_READY_REVISION
Browser-exposed map credential: none
EOF
