#!/usr/bin/env bash
# Ola Maps (Krutrim) runtime wiring for the customer web and User/Chef Container Apps.
#
# OPERATION:
#   inspect            read-only: Key Vault secret presence (metadata only), identities, bindings, legacy Azure Maps settings
#   bind               reference the Key Vault secret from both apps and bind OLA_MAPS_API_KEY / CRAVES_LOCATION_SEARCH_CENTER
#   apim               add/refresh the customer-address APIM operations, including POST /addresses/location-search
#   remove-azure-maps  remove the retired AZURE_MAPS_CLIENT_ID / AZURE_MAPS_ENDPOINT settings once Ola is verified live
#
# The key itself is never read, printed or accepted here: an operator stores it once in the environment
# Key Vault as secret "ola-maps-api-key". Run mutating operations only while no other Craves release
# pipeline is in progress; the guarded release scripts stop when runtime settings change mid-release.
set -Eeuo pipefail
set +x

OPERATION="${OPERATION:-inspect}"
CONFIRM="${CONFIRM:-false}"
SUBSCRIPTION="${SUBSCRIPTION:-721906c9-4a72-4606-830b-d3e7ace093ff}"
RG="${RG:-rg-craves-prodlow-centralindia}"
WEB_APP="${WEB_APP:-ca-craves-web-prodlow}"
CHEF_APP="${CHEF_APP:-ca-craves-user-chef-service-prod}"
APIM="${APIM:-apim-craves-prodlow-kmqgfy}"
SECRET_NAME="${SECRET_NAME:-ola-maps-api-key}"
SEARCH_CENTER="${SEARCH_CENTER:-17.3850,78.4867}"
KEY_VAULT_NAME="${KEY_VAULT_NAME:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done
case "$OPERATION" in inspect|bind|apim|remove-azure-maps) ;; *) fail "Unknown OPERATION $OPERATION" ;; esac
[[ "$OPERATION" == inspect || "${CONFIRM,,}" == true ]] || fail "OPERATION=$OPERATION changes production; set CONFIRM=true"
[[ "$SEARCH_CENTER" =~ ^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$ ]] || fail "SEARCH_CENTER must be latitude,longitude"
[[ "$SECRET_NAME" =~ ^[a-z0-9]([a-z0-9-]{0,18}[a-z0-9])?$ ]] || fail "SECRET_NAME must be a Container App secret name of at most 20 characters"
[[ -z "$KEY_VAULT_NAME" || "$KEY_VAULT_NAME" =~ ^[a-zA-Z0-9-]{3,24}$ ]] || fail "KEY_VAULT_NAME is invalid"

az account set --subscription "$SUBSCRIPTION"
[[ "$(az account show --query id -o tsv --only-show-errors)" == "$SUBSCRIPTION" ]] || fail "Unexpected Azure subscription"

app_json() { az containerapp show -g "$RG" -n "$1" -o json --only-show-errors; }
# Secret metadata only (names, Key Vault URLs, identities); values are never requested.
secret_meta() { az containerapp secret list -g "$RG" -n "$1" -o json --only-show-errors; }

vault_name() {
  if [[ -n "$KEY_VAULT_NAME" ]]; then printf '%s\n' "$KEY_VAULT_NAME"; return; fi
  # Reuse the vault that already backs the User/Chef secrets.
  local url
  url=$(secret_meta "$CHEF_APP" | jq -r '[.[] | .keyVaultUrl // empty | select(test("^https://[a-z0-9-]+\\.vault\\.azure\\.net/secrets/"))][0] // ""')
  [[ -n "$url" ]] || fail "No Key Vault-backed secret found on $CHEF_APP; set KEY_VAULT_NAME"
  url=${url#https://}
  printf '%s\n' "${url%%.vault.azure.net/*}"
}

identity_ref() {
  # Same identity the app already uses for Key Vault references (system or a user-assigned resource ID).
  local app=$1 ref
  ref=$(secret_meta "$app" | jq -r '[.[] | select((.keyVaultUrl // "") != "") | .identity // empty][0] // ""')
  if [[ -z "$ref" ]]; then
    [[ "$(app_json "$app" | jq -r '.identity.type // ""')" == *SystemAssigned* ]] \
      || fail "$app has no managed identity that can read Key Vault"
    ref=system
  fi
  printf '%s\n' "$ref"
}

binding_report() {
  local app=$1
  jq -n --arg app "$app" --arg secret "$SECRET_NAME" --argjson app_json "$(app_json "$app")" --argjson meta "$(secret_meta "$app")" '
    ($app_json.properties.template.containers[0].env // []) as $env |
    {
      app: $app,
      identityType: ($app_json.identity.type // "None"),
      latestRevision: $app_json.properties.latestRevisionName,
      latestReadyRevision: $app_json.properties.latestReadyRevisionName,
      olaSecretReference: ([$meta[] | select(.name == $secret) | {
        keyVaultBacked: ((.keyVaultUrl // "") | test("^https://[a-z0-9-]+\\.vault\\.azure\\.net/secrets/")),
        identity: (.identity // null)
      }][0] // null),
      olaKeyBinding: ([$env[] | select(.name == "OLA_MAPS_API_KEY")
        | if (.secretRef // "") != "" then "secretref:" + .secretRef else "PLAIN VALUE - unsafe, rebind" end][0] // null),
      searchCenter: ([$env[] | select(.name == "CRAVES_LOCATION_SEARCH_CENTER") | .value][0] // null),
      legacyAzureMapsSettings: [$env[] | select(.name | startswith("AZURE_MAPS_")) | .name]
    }'
}

wait_ready() {
  local app=$1 json latest ready health
  for _ in $(seq 1 90); do
    json=$(app_json "$app")
    latest=$(jq -r '.properties.latestRevisionName // ""' <<<"$json")
    ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$json")
    if [[ -n "$latest" && "$latest" == "$ready" ]]; then
      health=$(az containerapp revision show -g "$RG" -n "$app" --revision "$latest" \
        --query properties.healthState -o tsv --only-show-errors || true)
      if [[ "$health" == Healthy ]]; then
        echo "$app revision $latest is ready and healthy."
        return
      fi
    fi
    sleep 10
  done
  fail "$app did not report a ready, healthy revision (the previous revision keeps serving; inspect revisions)"
}

key_vault_report() {
  local vault=$1 present
  # `secret list` returns metadata only, never values.
  present=$(az keyvault secret list --vault-name "$vault" --query "[?name=='$SECRET_NAME'] | length(@)" \
    -o tsv --only-show-errors 2>/dev/null || echo unknown)
  jq -n --arg vault "$vault" --arg secret "$SECRET_NAME" --arg present "$present" \
    '{keyVault: $vault, secret: $secret, present: (if $present == "unknown" then "unknown (no list permission)" else ($present != "0") end)}'
}

case "$OPERATION" in
  inspect)
    VAULT=$(vault_name)
    key_vault_report "$VAULT"
    for app in "$WEB_APP" "$CHEF_APP"; do binding_report "$app"; done
    ;;
  bind)
    VAULT=$(vault_name)
    [[ "$(key_vault_report "$VAULT" | jq -r '.present')" != false ]] \
      || fail "Key Vault $VAULT has no secret $SECRET_NAME; store the Ola API key there first"
    for app in "$WEB_APP" "$CHEF_APP"; do
      identity=$(identity_ref "$app")
      echo "Referencing Key Vault secret $SECRET_NAME from $app (identity: ${identity##*/})."
      az containerapp secret set -g "$RG" -n "$app" -o none --only-show-errors \
        --secrets "$SECRET_NAME=keyvaultref:https://$VAULT.vault.azure.net/secrets/$SECRET_NAME,identityref:$identity"
      az containerapp update -g "$RG" -n "$app" -o none --only-show-errors \
        --set-env-vars "OLA_MAPS_API_KEY=secretref:$SECRET_NAME" "CRAVES_LOCATION_SEARCH_CENTER=$SEARCH_CENTER"
      wait_ready "$app"
      binding_report "$app" | tee /dev/stderr | jq -e --arg ref "secretref:$SECRET_NAME" \
        '.olaKeyBinding == $ref and .olaSecretReference.keyVaultBacked == true' >/dev/null \
        || fail "$app Ola binding verification failed"
    done
    echo "Ola Maps key bound to $WEB_APP and $CHEF_APP as secretref:$SECRET_NAME (Key Vault $VAULT)."
    ;;
  apim)
    RG="$RG" APIM="$APIM" USER_APP="$CHEF_APP" bash "$ROOT/scripts/apim/configure-customer-addresses-apim.sh"
    GATEWAY=$(az apim show -g "$RG" -n "$APIM" --query gatewayUrl -o tsv --only-show-errors)
    [[ "$GATEWAY" == https://* ]] || fail "APIM gateway URL was not resolved"
    CODE=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d '{"query":"Madhapur"}' "$GATEWAY/api/v1/customer/addresses/location-search" || true)
    [[ "$CODE" == 401 ]] || fail "Unsigned location-search probe expected HTTP 401, received $CODE"
    echo "APIM location-search operation exists and requires a Bearer token."
    ;;
  remove-azure-maps)
    for app in "$WEB_APP" "$CHEF_APP"; do
      report=$(binding_report "$app")
      names=$(jq -r '.legacyAzureMapsSettings | join(" ")' <<<"$report")
      if [[ -z "$names" ]]; then echo "$app has no legacy Azure Maps settings."; continue; fi
      jq -e '(.olaKeyBinding // "") | startswith("secretref:")' <<<"$report" >/dev/null \
        || fail "$app is not bound to Ola Maps yet; refusing to remove Azure Maps settings"
      # shellcheck disable=SC2086 # names are validated AZURE_MAPS_* identifiers
      az containerapp update -g "$RG" -n "$app" -o none --only-show-errors --remove-env-vars $names
      wait_ready "$app"
      echo "Removed $names from $app."
    done
    echo "The Azure Maps account and its role assignments were not changed (owner decision; see the migration document)."
    ;;
esac
