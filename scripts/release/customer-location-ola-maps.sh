#!/usr/bin/env bash
# Ola Maps (Krutrim) runtime wiring for the customer web and User/Chef Container Apps.
#
# OPERATION:
#   inspect            read-only: Key Vault secret presence (metadata only), identities, bindings, legacy Azure Maps settings
#   bind               give both apps the "ola-maps-api-key" secret (an operator-created app secret is reused, else a Key
#                      Vault reference is added) and bind OLA_MAPS_API_KEY / CRAVES_LOCATION_SEARCH_CENTER
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

VAULT_NAMES='[.[] | .keyVaultUrl // empty | select(test("^https://[a-z0-9-]+\\.vault\\.azure\\.net/secrets/"))
  | capture("^https://(?<v>[a-z0-9-]+)\\.").v] | unique'

vault_name() {
  if [[ -n "$KEY_VAULT_NAME" ]]; then printf '%s\n' "$KEY_VAULT_NAME"; return; fi
  # A vault both apps already reference, else the only vault either app references.
  local -a web chef common all
  mapfile -t web < <(secret_meta "$WEB_APP" | jq -r "$VAULT_NAMES | .[]")
  mapfile -t chef < <(secret_meta "$CHEF_APP" | jq -r "$VAULT_NAMES | .[]")
  mapfile -t common < <(comm -12 <(printf '%s\n' "${web[@]}" | sort -u) <(printf '%s\n' "${chef[@]}" | sort -u) | grep .)
  mapfile -t all < <(printf '%s\n' "${web[@]}" "${chef[@]}" | sort -u | grep .)
  if [[ ${#common[@]} -eq 1 ]]; then printf '%s\n' "${common[0]}"; return; fi
  [[ ${#common[@]} -eq 0 && ${#all[@]} -eq 1 ]] \
    || fail "Cannot choose one Key Vault from the apps' existing references (${all[*]:-none}); set KEY_VAULT_NAME"
  printf '%s\n' "${all[0]}"
}

has_app_secret() { secret_meta "$1" | jq -e --arg s "$SECRET_NAME" 'any(.[]; .name == $s)' >/dev/null; }
# Backend releases (deploy-single-service-preserve-runtime.sh) refuse any active secret that is not Key Vault-backed.
kv_required() { [[ "$1" == "$CHEF_APP" ]] && echo true || echo false; }

identity_ref() {
  # The identity the app already uses for this vault, else for any vault, else its system identity.
  local app=$1 vault=$2 meta ref
  meta=$(secret_meta "$app")
  ref=$(jq -r --arg host "https://$vault.vault.azure.net/" \
    '[.[] | select((.keyVaultUrl // "") | startswith($host)) | .identity // empty][0] // ""' <<<"$meta")
  [[ -n "$ref" ]] || ref=$(jq -r '[.[] | select((.keyVaultUrl // "") != "") | .identity // empty][0] // ""' <<<"$meta")
  if [[ -z "$ref" ]]; then
    [[ "$(app_json "$app" | jq -r '.identity.type // ""')" == *SystemAssigned* ]] \
      || fail "$app has no managed identity that can read Key Vault"
    ref=system
  fi
  printf '%s\n' "$ref"
}

principal_id() {
  local app=$1 identity=$2
  if [[ "$identity" == system ]]; then
    app_json "$app" | jq -r '.identity.principalId // ""'
  else
    app_json "$app" | jq -r --arg id "${identity,,}" \
      '[(.identity.userAssignedIdentities // {}) | to_entries[] | select((.key | ascii_downcase) == $id) | .value.principalId][0] // ""'
  fi
}

can_read_vault() {
  # true/false/unknown from role assignments or legacy access policies (metadata only, never secret values).
  local principal=$1 vault=$2 kv assignments
  [[ -n "$principal" ]] || { echo false; return; }
  kv=$(az keyvault show -n "$vault" -o json --only-show-errors 2>/dev/null) || { echo unknown; return; }
  if [[ "$(jq -r '.properties.enableRbacAuthorization // false' <<<"$kv")" == true ]]; then
    assignments=$(az role assignment list --scope "$(jq -r .id <<<"$kv")" --include-inherited \
      -o json --only-show-errors 2>/dev/null) || { echo unknown; return; }
    # shortcut: built-in data roles only; a custom role reads as false, so grant a built-in role or bind manually.
    jq -r --arg p "$principal" '[.[] | select(.principalId == $p) | .roleDefinitionName]
      | any(. == "Key Vault Secrets User" or . == "Key Vault Secrets Officer" or . == "Key Vault Administrator")' <<<"$assignments"
  else
    jq -r --arg p "$principal" '[.properties.accessPolicies[]? | select(.objectId == $p)
      | .permissions.secrets[]? | ascii_downcase] | any(. == "get" or . == "all")' <<<"$kv"
  fi
}

bind_app() {
  # identity "existing" reuses an operator-created app secret; otherwise a Key Vault reference is created.
  # Returns non-zero after restoring a first-time binding that did not become healthy.
  local app=$1 identity=$2 had_secret had_env
  had_secret=$(secret_meta "$app" | jq --arg s "$SECRET_NAME" 'any(.[]; .name == $s)')
  had_env=$(app_json "$app" | jq '[.properties.template.containers[0].env[]?
    | select(.name == "OLA_MAPS_API_KEY" or .name == "CRAVES_LOCATION_SEARCH_CENTER")] | length > 0')
  if { [[ "$identity" == existing ]] || az containerapp secret set -g "$RG" -n "$app" -o none --only-show-errors \
         --secrets "$SECRET_NAME=keyvaultref:https://$VAULT.vault.azure.net/secrets/$SECRET_NAME,identityref:$identity"; } \
    && az containerapp update -g "$RG" -n "$app" -o none --only-show-errors \
       --set-env-vars "OLA_MAPS_API_KEY=secretref:$SECRET_NAME" "CRAVES_LOCATION_SEARCH_CENTER=$SEARCH_CENTER" \
    && wait_ready "$app" \
    && binding_report "$app" | tee /dev/stderr | jq -e --arg ref "secretref:$SECRET_NAME" --argjson kv "$(kv_required "$app")" \
       '.olaKeyBinding == $ref and .olaSecretReference != null and (($kv | not) or .olaSecretReference.keyVaultBacked)' >/dev/null; then
    return 0
  fi
  echo "ERROR: $app Ola binding failed; restoring its previous settings." >&2
  if [[ "$had_env" == false ]]; then
    az containerapp update -g "$RG" -n "$app" -o none --only-show-errors \
      --remove-env-vars OLA_MAPS_API_KEY CRAVES_LOCATION_SEARCH_CENTER || true
  fi
  if [[ "$had_secret" == false ]]; then
    az containerapp secret remove -g "$RG" -n "$app" -o none --only-show-errors --secret-names "$SECRET_NAME" || true
  fi
  wait_ready "$app" || true
  return 1
}

binding_report() {
  local app=$1
  jq -n --arg app "$app" --arg secret "$SECRET_NAME" --argjson app_json "$(app_json "$app")" --argjson meta "$(secret_meta "$app")" '
    ($app_json.properties.template.containers[0].env // []) as $env |
    {
      app: $app,
      identityType: ($app_json.identity.type // "None"),
      keyVaults: ($meta | '"$VAULT_NAMES"'),
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
  echo "ERROR: $app did not report a ready, healthy revision (the previous revision keeps serving)." >&2
  return 1
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
    for app in "$WEB_APP" "$CHEF_APP"; do binding_report "$app"; done
    VAULT=$(vault_name) || VAULT=''
    if [[ -n "$VAULT" ]]; then
      key_vault_report "$VAULT"
      for app in "$WEB_APP" "$CHEF_APP"; do
        identity=$(identity_ref "$app" "$VAULT") || identity=''
        jq -n --arg app "$app" --arg vault "$VAULT" --arg identity "${identity##*/}" \
          --arg access "$(can_read_vault "$(principal_id "$app" "$identity")" "$VAULT")" \
          '{app: $app, vault: $vault, identity: $identity, canReadSecrets: $access}'
      done
    fi
    ;;
  bind)
    # Prefer a Key Vault reference wherever the app identity can read the key (one place to rotate it);
    # otherwise reuse an operator-created Container App secret, never on User/Chef (backend releases refuse it).
    VAULT=$(vault_name) || VAULT=''
    present=false
    [[ -z "$VAULT" ]] || present=$(key_vault_report "$VAULT" | jq -r '.present')
    declare -A IDENTITY=()
    for app in "$WEB_APP" "$CHEF_APP"; do
      identity='' access=false
      if [[ "$present" != false ]]; then
        identity=$(identity_ref "$app" "$VAULT") || identity=''
        [[ -z "$identity" ]] || access=$(can_read_vault "$(principal_id "$app" "$identity")" "$VAULT")
      fi
      hint="Grant it Key Vault Secrets User on $SECRET_NAME"
      [[ "$(kv_required "$app")" == true ]] || hint+=", or add the Container App secret $SECRET_NAME to $app"
      if [[ "$access" == true ]]; then
        IDENTITY[$app]=$identity
      elif [[ "$(kv_required "$app")" == false ]] && has_app_secret "$app"; then
        IDENTITY[$app]=existing
      elif [[ "$access" == unknown ]]; then
        echo "WARNING: could not confirm $app read access to $VAULT; a failed bind is rolled back." >&2
        IDENTITY[$app]=$identity
      elif [[ -z "$VAULT" ]]; then
        fail "No Key Vault could be chosen for $app; set KEY_VAULT_NAME"
      elif [[ "$present" == false ]]; then
        fail "Key Vault $VAULT has no secret $SECRET_NAME; store the Ola API key there first"
      else
        fail "$app identity ${identity##*/} cannot read secrets in $VAULT. $hint, then re-run"
      fi
    done
    for app in "$WEB_APP" "$CHEF_APP"; do
      if [[ "${IDENTITY[$app]}" == existing ]]; then
        echo "Using the existing Container App secret $SECRET_NAME on $app."
      else
        echo "Referencing Key Vault secret $SECRET_NAME in $VAULT from $app (identity: ${IDENTITY[$app]##*/})."
      fi
      bind_app "$app" "${IDENTITY[$app]}" || fail "$app Ola binding failed and its previous settings were restored"
    done
    echo "Ola Maps key bound to $WEB_APP and $CHEF_APP as secretref:$SECRET_NAME."
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
      wait_ready "$app" || fail "$app did not become healthy after removing $names"
      echo "Removed $names from $app."
    done
    echo "The Azure Maps account and its role assignments were not changed (owner decision; see the migration document)."
    ;;
esac
