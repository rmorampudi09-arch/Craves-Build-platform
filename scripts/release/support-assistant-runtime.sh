#!/usr/bin/env bash
# Support assistant (Claude) runtime wiring for the User/Chef Container App.
#
# OPERATION:
#   inspect  read-only: Key Vault secret presence (name only), current bindings
#   bind     bind ANTHROPIC_API_KEY to the Key Vault secret "anthropic-api-key" and point
#            CRAVES_SUPPORT_ORDER_BASE_URL at order-service; rolls back if the revision is unhealthy
#   unbind   kill switch: remove the key binding; the chat endpoint then answers 503 and the apps
#            show "email support@craves.in"
#
# The key itself is never read, printed or accepted here: an operator stores it once in Key Vault
# as secret "anthropic-api-key" (Azure Portal > Key Vault > Secrets > Generate/Import).
set -Eeuo pipefail
set +x

OPERATION="${OPERATION:-inspect}"
CONFIRM="${CONFIRM:-false}"
SUBSCRIPTION="${SUBSCRIPTION:-721906c9-4a72-4606-830b-d3e7ace093ff}"
RG="${RG:-rg-craves-prodlow-centralindia}"
CHEF_APP="${CHEF_APP:-ca-craves-user-chef-service-prod}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
VAULT="${KEY_VAULT_NAME:-kvcravesprodlowkmqgfy}"
SECRET_NAME=anthropic-api-key
ENV_KEY=ANTHROPIC_API_KEY
ENV_ORDER=CRAVES_SUPPORT_ORDER_BASE_URL

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done
case "$OPERATION" in inspect|bind|unbind) ;; *) fail "Unknown OPERATION $OPERATION" ;; esac
[[ "$OPERATION" == inspect || "${CONFIRM,,}" == true ]] || fail "OPERATION=$OPERATION changes production; set CONFIRM=true"
[[ "$VAULT" =~ ^[a-zA-Z0-9-]{3,24}$ ]] || fail "KEY_VAULT_NAME is invalid"

az account set --subscription "$SUBSCRIPTION"
[[ "$(az account show --query id -o tsv --only-show-errors)" == "$SUBSCRIPTION" ]] || fail "Unexpected Azure subscription"

app_json() { az containerapp show -g "$RG" -n "$1" -o json --only-show-errors; }
# Secret metadata only (names, Key Vault URLs, identities); values are never requested.
secret_meta() { az containerapp secret list -g "$RG" -n "$CHEF_APP" -o json --only-show-errors; }
# Only the order URL value is shown; a plain-text key (which should never exist) is reported, not printed.
env_report() {
  app_json "$CHEF_APP" | jq --arg key "$ENV_KEY" --arg order "$ENV_ORDER" '[.properties.template.containers[0].env[]?
    | select(.name == $key or .name == $order)
    | {name, secretRef, value: (if .name == $order then .value elif .value then "<plain value hidden>" else null end)}]'
}
# Listing returns secret ids only; `secret show` would return the value, so it is never used.
vault_has_secret() {
  az keyvault secret list --vault-name "$VAULT" --query "[?name=='$SECRET_NAME'] | length(@)" -o tsv --only-show-errors
}

wait_ready() {
  local json latest ready health
  for _ in $(seq 1 60); do
    json=$(app_json "$CHEF_APP")
    latest=$(jq -r '.properties.latestRevisionName // ""' <<<"$json")
    ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$json")
    if [[ -n "$latest" && "$latest" == "$ready" ]]; then
      health=$(az containerapp revision show -g "$RG" -n "$CHEF_APP" --revision "$latest" \
        --query properties.healthState -o tsv --only-show-errors || true)
      [[ "$health" != Healthy ]] || { echo "$CHEF_APP revision $latest is ready and healthy."; return 0; }
    fi
    sleep 10
  done
  return 1
}

case "$OPERATION" in
  inspect)
    echo "Key Vault $VAULT has $SECRET_NAME: $([[ "$(vault_has_secret)" == 1 ]] && echo yes || echo no)"
    secret_meta | jq --arg s "$SECRET_NAME" '[.[] | select(.name == $s) | {name, keyVaultUrl, identity}]'
    env_report
    ;;
  bind)
    [[ "$(vault_has_secret)" == 1 ]] || fail "Store the key in Key Vault $VAULT as secret $SECRET_NAME first"
    ORDER_FQDN=$(app_json "$ORDER_APP" | jq -r '.properties.configuration.ingress.fqdn // ""')
    [[ "$ORDER_FQDN" =~ ^[a-z0-9.-]+$ ]] || fail "$ORDER_APP has no ingress FQDN"
    # Reuse the identity User/Chef already reads this vault with (deploys refuse non-Key Vault secrets).
    IDENTITY=$(secret_meta | jq -r --arg host "https://$VAULT.vault.azure.net/" \
      '[.[] | select((.keyVaultUrl // "") | startswith($host)) | .identity // empty][0] // ""')
    [[ -n "$IDENTITY" ]] || fail "$CHEF_APP has no Key Vault-backed secret from $VAULT to copy an identity from"
    BEFORE_SECRET=$(secret_meta | jq --arg s "$SECRET_NAME" 'any(.[]; .name == $s)')
    BEFORE_ENV=$(env_report)
    if az containerapp secret set -g "$RG" -n "$CHEF_APP" -o none --only-show-errors \
         --secrets "$SECRET_NAME=keyvaultref:https://$VAULT.vault.azure.net/secrets/$SECRET_NAME,identityref:$IDENTITY" \
      && az containerapp update -g "$RG" -n "$CHEF_APP" -o none --only-show-errors \
         --set-env-vars "$ENV_KEY=secretref:$SECRET_NAME" "$ENV_ORDER=https://$ORDER_FQDN" \
      && wait_ready \
      && env_report | jq -e --arg ref "$SECRET_NAME" 'any(.[]; .name == "'"$ENV_KEY"'" and .secretRef == $ref)' >/dev/null; then
      env_report
      echo "Support assistant bound. Disable it any time with OPERATION=unbind."
    else
      echo "ERROR: binding failed; restoring previous settings." >&2
      mapfile -t NEW_VARS < <(jq -r --arg key "$ENV_KEY" --arg order "$ENV_ORDER" \
        '[$key, $order] - [.[].name] | .[]' <<<"$BEFORE_ENV")
      if (( ${#NEW_VARS[@]} > 0 )); then
        az containerapp update -g "$RG" -n "$CHEF_APP" -o none --only-show-errors --remove-env-vars "${NEW_VARS[@]}" || true
      fi
      if [[ "$BEFORE_SECRET" == false ]]; then
        az containerapp secret remove -g "$RG" -n "$CHEF_APP" -o none --only-show-errors --secret-names "$SECRET_NAME" || true
      fi
      wait_ready || true
      exit 1
    fi
    ;;
  unbind)
    az containerapp update -g "$RG" -n "$CHEF_APP" -o none --only-show-errors --remove-env-vars "$ENV_KEY"
    wait_ready || fail "$CHEF_APP did not become healthy after unbind"
    az containerapp secret remove -g "$RG" -n "$CHEF_APP" -o none --only-show-errors --secret-names "$SECRET_NAME" || true
    env_report
    echo "Support assistant disabled; the chat endpoint now returns 503 SUPPORT_CHAT_UNAVAILABLE."
    ;;
esac
