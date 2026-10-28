#!/usr/bin/env bash
# Voice support line (Exotel -> voice-support-gateway -> Azure AI Foundry Voice Live) production wiring.
#
# OPERATION:
#   status   read-only: Foundry resource, Key Vault secret presence (names only), container app, bindings, health
#   create   first time only: the Foundry resource (Voice Live, Central India), the two Key Vault secrets it needs,
#            the gateway image from this commit and the container app with Key Vault-backed secrets
#   deploy   build the gateway image from this commit and roll the app to it; restores the previous image on failure
#   disable  kill switch: turn the app's ingress off, so Exotel cannot reach the agent (its flow then hangs up)
#   enable   turn ingress back on
#
# Secret values are never printed. The Foundry key is copied straight from Azure into Key Vault; the Exotel stream
# password is generated here and stored in Key Vault, where an operator reads it once to put it in the Exotel applet URL.
set -Eeuo pipefail
set +x

OPERATION="${OPERATION:-status}"
CONFIRM="${CONFIRM:-false}"
SOURCE_SHA="${SOURCE_SHA:-}"
SUBSCRIPTION="${SUBSCRIPTION:-721906c9-4a72-4606-830b-d3e7ace093ff}"
RG="${RG:-rg-craves-prodlow-centralindia}"
LOCATION="${LOCATION:-centralindia}"
ENVIRONMENT="${CONTAINERAPP_ENVIRONMENT:-cae-craves-prodlow-kmqgfy}"
REGISTRY="${REGISTRY:-cravesrm09prodlow6bf632}"
VAULT="${KEY_VAULT_NAME:-kvcravesprodlowkmqgfy}"
CHEF_APP="${CHEF_APP:-ca-craves-user-chef-service-prod}"
APP="${VOICE_APP:-ca-craves-voice-prodlow}"
FOUNDRY="${FOUNDRY_NAME:-ais-craves-voice-prodlow}"
MODEL="${VOICE_LIVE_MODEL:-gpt-4.1}"
REPOSITORY=craves/voice-support-gateway
DOCKERFILE=services/voice-support-gateway/Dockerfile
SECRET_VOICE=voice-live-api-key
SECRET_EXOTEL=exotel-stream-password
SECRET_INTERNAL=craves-internal-service-secret
KV_HOST="https://$VAULT.vault.azure.net"

fail() { echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done
case "$OPERATION" in status|create|deploy|disable|enable) ;; *) fail "Unknown OPERATION $OPERATION" ;; esac
[[ "$OPERATION" == status || "${CONFIRM,,}" == true ]] || fail "OPERATION=$OPERATION changes production; set CONFIRM=true"
[[ "$OPERATION" != create && "$OPERATION" != deploy || "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "SOURCE_SHA must be the 40-character commit being released"

az account set --subscription "$SUBSCRIPTION"
[[ "$(az account show --query id -o tsv --only-show-errors)" == "$SUBSCRIPTION" ]] || fail "Unexpected Azure subscription"

app_json() { az containerapp show -g "$RG" -n "$1" -o json --only-show-errors 2>/dev/null || echo '{}'; }
secret_meta() { az containerapp secret list -g "$RG" -n "$1" -o json --only-show-errors 2>/dev/null || echo '[]'; }
vault_has() { az keyvault secret list --vault-name "$VAULT" --query "[?name=='$1'] | length(@)" -o tsv --only-show-errors; }
foundry_json() { az cognitiveservices account show -g "$RG" -n "$FOUNDRY" -o json --only-show-errors 2>/dev/null || echo '{}'; }
fqdn_of() { app_json "$1" | jq -r '.properties.configuration.ingress.fqdn // ""'; }

env_report() {
  app_json "$APP" | jq '[.properties.template.containers[0].env[]? | {name, secretRef, value: (if .secretRef then null elif .value then .value else null end)}]'
}

wait_ready() {
  local json latest ready health fqdn
  for _ in $(seq 1 60); do
    json=$(app_json "$APP")
    latest=$(jq -r '.properties.latestRevisionName // ""' <<<"$json")
    ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$json")
    if [[ -n "$latest" && "$latest" == "$ready" ]]; then
      health=$(az containerapp revision show -g "$RG" -n "$APP" --revision "$latest" --query properties.healthState -o tsv --only-show-errors || true)
      fqdn=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$json")
      if [[ "$health" == Healthy && -n "$fqdn" ]] && curl --fail --silent --max-time 10 "https://$fqdn/healthz" >/dev/null; then
        echo "$APP revision $latest is ready, healthy and configured."
        return 0
      fi
    fi
    sleep 10
  done
  return 1
}

build_image() {
  az acr build --registry "$REGISTRY" --image "$REPOSITORY:$SOURCE_SHA" --file "$DOCKERFILE" . --only-show-errors
  local digest
  digest=$(az acr repository show --name "$REGISTRY" --image "$REPOSITORY:$SOURCE_SHA" --query digest -o tsv --only-show-errors)
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || fail "image digest not found after build"
  printf '%s\n' "$REGISTRY.azurecr.io/$REPOSITORY@$digest"
}

store_secret_from_file() {
  # $1 secret name, $2 file holding the value. The service connection may lack Key Vault data rights; say so.
  if az keyvault secret set --vault-name "$VAULT" --name "$1" --file "$2" -o none --only-show-errors; then
    echo "Stored $1 in Key Vault $VAULT."
  else
    fail "Could not write $1 to Key Vault $VAULT (no secret data rights?). Store it in the portal (Key Vault > Secrets > Generate/Import) and run again."
  fi
}

identity_ref() {
  # The identity User/Chef reads this vault with; the gateway reuses it, so no new Key Vault grant is needed.
  secret_meta "$CHEF_APP" | jq -r --arg host "$KV_HOST/" '[.[] | select((.keyVaultUrl // "") | startswith($host)) | .identity // empty][0] // ""'
}

create_foundry() {
  if [[ "$(foundry_json | jq -r '.name // ""')" == "$FOUNDRY" ]]; then
    echo "Foundry resource $FOUNDRY exists."
  else
    echo "Creating Foundry resource $FOUNDRY in $LOCATION (kind AIServices, S0)..."
    az rest --method put --only-show-errors -o none \
      --url "https://management.azure.com/subscriptions/$SUBSCRIPTION/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$FOUNDRY?api-version=2025-06-01" \
      --body "$(jq -n --arg loc "$LOCATION" --arg name "$FOUNDRY" '{location: $loc, kind: "AIServices", sku: {name: "S0"},
        identity: {type: "SystemAssigned"},
        properties: {customSubDomainName: $name, allowProjectManagement: true, publicNetworkAccess: "Enabled"}}')"
    for _ in $(seq 1 30); do
      [[ "$(foundry_json | jq -r '.properties.provisioningState // ""')" == Succeeded ]] && break
      sleep 10
    done
    [[ "$(foundry_json | jq -r '.properties.provisioningState // ""')" == Succeeded ]] || fail "$FOUNDRY did not finish provisioning"
  fi
  if [[ "$(vault_has "$SECRET_VOICE")" == 1 ]]; then
    echo "Key Vault already has $SECRET_VOICE."
  else
    local tmp
    tmp=$(mktemp)
    trap 'rm -f "$tmp"' RETURN
    az cognitiveservices account keys list -g "$RG" -n "$FOUNDRY" --query key1 -o tsv --only-show-errors | tr -d '\n' >"$tmp"
    [[ -s "$tmp" ]] || fail "could not read the Foundry key"
    store_secret_from_file "$SECRET_VOICE" "$tmp"
  fi
}

create_exotel_password() {
  if [[ "$(vault_has "$SECRET_EXOTEL")" == 1 ]]; then
    echo "Key Vault already has $SECRET_EXOTEL."
    return
  fi
  local tmp
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' RETURN
  (umask 077; openssl rand -hex 24 | tr -d '\n' >"$tmp")
  store_secret_from_file "$SECRET_EXOTEL" "$tmp"
}

voice_endpoint() {
  # Foundry resources answer on services.ai.azure.com; the gateway turns https into wss itself.
  printf 'https://%s.services.ai.azure.com\n' "$FOUNDRY"
}

create_app() {
  local image identity chef_fqdn
  identity=$(identity_ref)
  [[ -n "$identity" ]] || fail "$CHEF_APP has no Key Vault-backed secret from $VAULT to copy an identity from"
  [[ "$identity" != system ]] || fail "$CHEF_APP uses its system identity; give the gateway its own Key Vault grant and bind by hand"
  chef_fqdn=$(fqdn_of "$CHEF_APP")
  [[ "$chef_fqdn" =~ ^[a-z0-9.-]+$ ]] || fail "$CHEF_APP has no ingress FQDN"
  [[ "$(vault_has "$SECRET_INTERNAL")" == 1 ]] || fail "Key Vault has no $SECRET_INTERNAL"
  image=$(build_image)
  if [[ "$(app_json "$APP" | jq -r '.name // ""')" == "$APP" ]]; then
    echo "$APP exists; use OPERATION=deploy to roll a new image."
    return
  fi
  echo "Creating $APP..."
  az containerapp create -g "$RG" -n "$APP" --environment "$ENVIRONMENT" --image "$image" -o none --only-show-errors \
    --registry-server "$REGISTRY.azurecr.io" --registry-identity "$identity" --user-assigned "$identity" \
    --ingress external --target-port 8080 --transport auto --min-replicas 1 --max-replicas 2 --cpu 0.5 --memory 1.0Gi \
    --secrets "$SECRET_VOICE=keyvaultref:$KV_HOST/secrets/$SECRET_VOICE,identityref:$identity" \
              "$SECRET_EXOTEL=keyvaultref:$KV_HOST/secrets/$SECRET_EXOTEL,identityref:$identity" \
              "$SECRET_INTERNAL=keyvaultref:$KV_HOST/secrets/$SECRET_INTERNAL,identityref:$identity" \
    --env-vars "VOICE_LIVE_ENDPOINT=$(voice_endpoint)" "VOICE_LIVE_API_KEY=secretref:$SECRET_VOICE" \
               "VOICE_LIVE_MODEL=$MODEL" "EXOTEL_STREAM_PASSWORD=secretref:$SECRET_EXOTEL" \
               "CRAVES_SUPPORT_BACKEND_BASE_URL=https://$chef_fqdn" "CRAVES_INTERNAL_SERVICE_SECRET=secretref:$SECRET_INTERNAL" \
               "MAX_CONCURRENT_CALLS=5" "MAX_CALL_SECONDS=600" "CRAVES_ENVIRONMENT=prodlow"
  wait_ready || fail "$APP did not become healthy; check its console logs (missing settings are listed on /healthz)"
  echo "Exotel Voicebot applet URL (replace PASSWORD with the value of Key Vault secret $SECRET_EXOTEL):"
  echo "  wss://craves:PASSWORD@$(fqdn_of "$APP")/exotel/voice?sample-rate=16000"
}

deploy() {
  local image previous
  [[ "$(app_json "$APP" | jq -r '.name // ""')" == "$APP" ]] || fail "$APP does not exist; run OPERATION=create first"
  previous=$(app_json "$APP" | jq -r '.properties.template.containers[0].image')
  echo "Rollback image: $previous"
  image=$(build_image)
  if az containerapp update -g "$RG" -n "$APP" --image "$image" -o none --only-show-errors && wait_ready; then
    echo "Deployed $image"
  else
    echo "ERROR: release failed; restoring $previous" >&2
    az containerapp update -g "$RG" -n "$APP" --image "$previous" -o none --only-show-errors || true
    wait_ready || true
    exit 1
  fi
}

case "$OPERATION" in
  status)
    echo "Foundry $FOUNDRY: $(foundry_json | jq -r 'if .name then "exists, " + (.properties.provisioningState // "?") + ", endpoint " + (.properties.endpoint // "?") else "missing" end')"
    for s in "$SECRET_VOICE" "$SECRET_EXOTEL" "$SECRET_INTERNAL"; do
      echo "Key Vault $VAULT has $s: $([[ "$(vault_has "$s")" == 1 ]] && echo yes || echo no)"
    done
    if [[ "$(app_json "$APP" | jq -r '.name // ""')" == "$APP" ]]; then
      echo "$APP: image $(app_json "$APP" | jq -r '.properties.template.containers[0].image'), ingress $(app_json "$APP" | jq -r '.properties.configuration.ingress.fqdn // "disabled"')"
      secret_meta "$APP" | jq '[.[] | {name, keyVaultUrl, identity}]'
      env_report
      fqdn=$(fqdn_of "$APP")
      [[ -z "$fqdn" ]] || echo "/healthz: $(curl --silent --max-time 10 "https://$fqdn/healthz" || echo unreachable)"
    else
      echo "$APP: missing (run OPERATION=create)"
    fi
    ;;
  create)
    create_foundry
    create_exotel_password
    create_app
    ;;
  deploy)
    deploy
    ;;
  disable)
    az containerapp ingress disable -g "$RG" -n "$APP" -o none --only-show-errors
    echo "$APP ingress disabled: Exotel cannot reach the agent; its flow falls through to the next applet."
    ;;
  enable)
    az containerapp ingress enable -g "$RG" -n "$APP" --type external --target-port 8080 --transport auto -o none --only-show-errors
    wait_ready || fail "$APP is not healthy after enabling ingress"
    echo "Exotel URL host: $(fqdn_of "$APP")"
    ;;
esac
