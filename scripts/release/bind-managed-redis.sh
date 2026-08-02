#!/usr/bin/env bash
set -eEuo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
REDIS_NAME=${2:?Azure Managed Redis name required}
KEY_VAULT_NAME=${3:?Key Vault name required}
KEY_VAULT_SECRET_NAME=${4:?Key Vault secret name required}
PACK_FILE=${5:-config/production/production-completion-pack.json}
OUTPUT_DIR=${6:-managed-redis-binding-evidence}
CONFIRMATION=${CONFIRM_REDIS_BINDING:-}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$CONFIRMATION" == 'DEPLOY_MANAGED_REDIS' ]] \
  || fail 'Set CONFIRM_REDIS_BINDING=DEPLOY_MANAGED_REDIS only for the explicitly approved Redis deployment.'
command -v az >/dev/null || fail 'Azure CLI is required.'
command -v jq >/dev/null || fail 'jq is required.'
command -v python3 >/dev/null || fail 'python3 is required.'
[[ -f "$PACK_FILE" ]] || fail "Production completion pack is missing: $PACK_FILE"
jq -e '.schemaVersion == 1 and (.backendServices | length == 7)' "$PACK_FILE" >/dev/null \
  || fail 'Production completion pack is malformed.'

EXPECTED_RG=$(jq -r '.azure.resourceGroup' "$PACK_FILE")
EXPECTED_REDIS=$(jq -r '.azure.managedRedis.name' "$PACK_FILE")
EXPECTED_VAULT=$(jq -r '.azure.keyVault' "$PACK_FILE")
EXPECTED_SECRET=$(jq -r '.azure.managedRedis.keyVaultSecretName' "$PACK_FILE")
CONTAINER_SECRET=$(jq -r '.azure.managedRedis.containerAppSecretName' "$PACK_FILE")
RUNTIME_ENV=$(jq -r '.azure.managedRedis.runtimeEnvironmentVariable' "$PACK_FILE")
PORT=$(jq -r '.azure.managedRedis.port' "$PACK_FILE")

[[ "$RESOURCE_GROUP" == "$EXPECTED_RG" ]] || fail "Resource group must be $EXPECTED_RG"
[[ "$REDIS_NAME" == "$EXPECTED_REDIS" ]] || fail "Redis name must be $EXPECTED_REDIS"
[[ "$KEY_VAULT_NAME" == "$EXPECTED_VAULT" ]] || fail "Key Vault must be $EXPECTED_VAULT"
[[ "$KEY_VAULT_SECRET_NAME" == "$EXPECTED_SECRET" ]] || fail "Key Vault secret name must be $EXPECTED_SECRET"
[[ "$CONTAINER_SECRET" == 'redis-url' ]] || fail 'Unexpected Container App Redis secret name.'
[[ "$RUNTIME_ENV" == 'SPRING_DATA_REDIS_URL' ]] || fail 'Unexpected Spring Redis environment variable name.'
[[ "$PORT" == '10000' ]] || fail 'Unexpected Azure Managed Redis TLS port.'

umask 077
TMP_DIR=$(mktemp -d)
MODIFIED_APPS="$TMP_DIR/modified-apps.tsv"
PREFLIGHT_ROWS="$TMP_DIR/preflight.jsonl"
: >"$MODIFIED_APPS"
: >"$PREFLIGHT_ROWS"
mkdir -p "$OUTPUT_DIR"

SECRET_URI="https://$KEY_VAULT_NAME.vault.azure.net/secrets/$KEY_VAULT_SECRET_NAME"
KV_ID=$(az keyvault show --resource-group "$RESOURCE_GROUP" --name "$KEY_VAULT_NAME" \
  --query id -o tsv --only-show-errors) \
  || fail "Key Vault is unavailable: $KEY_VAULT_NAME"

wait_ready() {
  local app=$1
  local attempts=${2:-36}
  local latest ready running
  for attempt in $(seq 1 "$attempts"); do
    latest=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app" \
      --query properties.latestRevisionName -o tsv --only-show-errors 2>/dev/null || true)
    ready=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app" \
      --query properties.latestReadyRevisionName -o tsv --only-show-errors 2>/dev/null || true)
    running=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app" \
      --query properties.runningStatus -o tsv --only-show-errors 2>/dev/null || true)
    if [[ -n "$latest" && "$latest" == "$ready" && "$running" == 'Running' ]]; then
      printf '%s\n' "$ready"
      return 0
    fi
    echo "Waiting for $app readiness ($attempt/$attempts): running=$running latest=$latest ready=$ready" >&2
    sleep 10
  done
  return 1
}

flags_for_service() {
  local key=$1
  printf '%s\n' 'CRAVES_TOKEN_REVOCATION_ENABLED=false'
  if [[ "$key" == 'auth' ]]; then
    printf '%s\n' 'CRAVES_TOKEN_REVOCATION_PUBLISHER_ENABLED=false'
    printf '%s\n' 'CRAVES_AUTH_RATE_LIMIT_ENABLED=false'
  fi
}

rollback_modified_apps() {
  local original_rc=$1
  trap - ERR
  set +e
  echo 'Redis binding failed. Removing only bindings created by this run; safety flags remain false.' >&2

  if [[ -s "$MODIFIED_APPS" ]]; then
    tac "$MODIFIED_APPS" | while IFS=$'\t' read -r key app; do
      [[ -n "$app" ]] || continue
      mapfile -t flag_args < <(flags_for_service "$key")
      az containerapp update -g "$RESOURCE_GROUP" -n "$app" \
        --remove-env-vars "$RUNTIME_ENV" \
        --set-env-vars "${flag_args[@]}" \
        --only-show-errors >/dev/null 2>&1
      wait_ready "$app" 24 >/dev/null 2>&1
      az containerapp secret remove -g "$RESOURCE_GROUP" -n "$app" \
        --secret-names "$CONTAINER_SECRET" \
        --only-show-errors >/dev/null 2>&1
    done
  fi

  jq -n \
    --arg redisName "$REDIS_NAME" \
    --arg keyVaultSecretName "$KEY_VAULT_SECRET_NAME" \
    --arg failedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson originalExitCode "$original_rc" \
    '{schemaVersion:1,redisName:$redisName,keyVaultSecretName:$keyVaultSecretName,originalExitCode:$originalExitCode,partialContainerAppBindingsRemoved:true,safetyFlagsRemainDisabled:true,keyVaultSecretRetainedForControlledRetry:true,secretValuePublished:false,existingCredentialRotationExecuted:false,failedAt:$failedAt}' \
    >"$OUTPUT_DIR/rollback.json"
  rm -rf "$TMP_DIR"
  exit "$original_rc"
}

cleanup_success() {
  rm -rf "$TMP_DIR"
}
trap 'rollback_modified_apps $?' ERR

# Preflight every app before retrieving or creating the Redis credential.
while IFS= read -r service; do
  KEY=$(jq -r '.key' <<<"$service")
  APP=$(jq -r '.containerApp' <<<"$service")
  PRINCIPAL_ID=$(az containerapp show -g "$RESOURCE_GROUP" -n "$APP" \
    --query identity.principalId -o tsv --only-show-errors)
  [[ -n "$PRINCIPAL_ID" ]] || fail "$APP has no system-assigned managed identity."

  ENV_JSON=$(az containerapp show -g "$RESOURCE_GROUP" -n "$APP" \
    --query "properties.template.containers[0].env[?name=='$RUNTIME_ENV'].{name:name,secretRef:secretRef}" \
    -o json --only-show-errors)
  SECRET_JSON=$(az containerapp secret list -g "$RESOURCE_GROUP" -n "$APP" \
    --query "[?name=='$CONTAINER_SECRET'].{name:name,keyVaultUrl:keyVaultUrl,identity:identity}" \
    -o json --only-show-errors 2>/dev/null || printf '[]')

  ENV_COUNT=$(jq 'length' <<<"$ENV_JSON")
  SECRET_COUNT=$(jq 'length' <<<"$SECRET_JSON")
  [[ "$ENV_COUNT" -le 1 && "$SECRET_COUNT" -le 1 ]] \
    || fail "$APP has duplicate Redis environment or secret metadata."

  ALREADY_BOUND=false
  if [[ "$ENV_COUNT" == '1' || "$SECRET_COUNT" == '1' ]]; then
    ENV_SECRET_REF=$(jq -r '.[0].secretRef // ""' <<<"$ENV_JSON")
    KV_URL=$(jq -r '.[0].keyVaultUrl // ""' <<<"$SECRET_JSON")
    [[ "$ENV_COUNT" == '1' && "$SECRET_COUNT" == '1' ]] \
      || fail "$APP has a partial pre-existing Redis binding; resolve it before this pipeline."
    [[ "$ENV_SECRET_REF" == "$CONTAINER_SECRET" ]] \
      || fail "$APP Redis environment variable points to an unexpected secret reference."
    [[ "$KV_URL" == "$SECRET_URI" ]] \
      || fail "$APP Redis secret points to an unexpected Key Vault URL."
    ALREADY_BOUND=true
  fi

  jq -cn \
    --arg serviceKey "$KEY" \
    --arg containerApp "$APP" \
    --arg principalId "$PRINCIPAL_ID" \
    --argjson alreadyBound "$ALREADY_BOUND" \
    '{serviceKey:$serviceKey,containerApp:$containerApp,principalId:$principalId,alreadyBound:$alreadyBound}' \
    >>"$PREFLIGHT_ROWS"
done < <(jq -c '.backendServices[]' "$PACK_FILE")

az extension add --name redisenterprise --upgrade --yes --only-show-errors >/dev/null
az redisenterprise wait \
  --resource-group "$RESOURCE_GROUP" \
  --name "$REDIS_NAME" \
  --created \
  --interval 20 \
  --timeout 3600 \
  --only-show-errors

HOST=$(az redisenterprise show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$REDIS_NAME" \
  --query hostName -o tsv --only-show-errors)
PRIMARY_KEY=$(az redisenterprise database list-keys \
  --resource-group "$RESOURCE_GROUP" \
  --cluster-name "$REDIS_NAME" \
  --query primaryKey -o tsv --only-show-errors)
[[ -n "$HOST" && -n "$PRIMARY_KEY" ]] \
  || fail 'Redis endpoint or access key was unavailable.'

REDIS_HOST="$HOST" REDIS_KEY="$PRIMARY_KEY" REDIS_PORT="$PORT" \
  python3 - "$TMP_DIR/redis-url.txt" <<'PY'
import os
import sys
from pathlib import Path
from urllib.parse import quote

host = os.environ['REDIS_HOST']
port = os.environ['REDIS_PORT']
key = quote(os.environ['REDIS_KEY'], safe='')
Path(sys.argv[1]).write_text(f'rediss://:{key}@{host}:{port}', encoding='utf-8')
PY
unset PRIMARY_KEY REDIS_KEY

az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "$KEY_VAULT_SECRET_NAME" \
  --file "$TMP_DIR/redis-url.txt" \
  --encoding utf-8 \
  --content-type 'Spring Data Redis TLS URL' \
  --only-show-errors \
  --query id -o tsv >"$TMP_DIR/secret-versioned-id.txt"
rm -f "$TMP_DIR/redis-url.txt"

: >"$OUTPUT_DIR/apps.jsonl"
while IFS= read -r row; do
  KEY=$(jq -r '.serviceKey' <<<"$row")
  APP=$(jq -r '.containerApp' <<<"$row")
  PRINCIPAL_ID=$(jq -r '.principalId' <<<"$row")
  ALREADY_BOUND=$(jq -r '.alreadyBound' <<<"$row")

  ROLE_EXISTS=$(az role assignment list \
    --assignee-object-id "$PRINCIPAL_ID" \
    --scope "$KV_ID" \
    --include-inherited \
    --query "[?roleDefinitionName=='Key Vault Secrets User'] | length(@)" \
    -o tsv --only-show-errors 2>/dev/null || printf '0')
  if [[ "$ROLE_EXISTS" == '0' ]]; then
    az role assignment create \
      --assignee-object-id "$PRINCIPAL_ID" \
      --assignee-principal-type ServicePrincipal \
      --role 'Key Vault Secrets User' \
      --scope "$KV_ID" \
      --only-show-errors >/dev/null
    for attempt in $(seq 1 12); do
      ROLE_EXISTS=$(az role assignment list \
        --assignee-object-id "$PRINCIPAL_ID" \
        --scope "$KV_ID" \
        --include-inherited \
        --query "[?roleDefinitionName=='Key Vault Secrets User'] | length(@)" \
        -o tsv --only-show-errors 2>/dev/null || printf '0')
      [[ "$ROLE_EXISTS" != '0' ]] && break
      sleep 10
    done
    [[ "$ROLE_EXISTS" != '0' ]] || fail "Key Vault role did not propagate for $APP."
  fi

  if [[ "$ALREADY_BOUND" != 'true' ]]; then
    # Track before the first mutation so an interrupted update is still cleaned up.
    printf '%s\t%s\n' "$KEY" "$APP" >>"$MODIFIED_APPS"
    az containerapp secret set -g "$RESOURCE_GROUP" -n "$APP" \
      --secrets "$CONTAINER_SECRET=keyvaultref:$SECRET_URI,identityref:system" \
      --only-show-errors >/dev/null
  fi

  mapfile -t ENV_ARGS < <(flags_for_service "$KEY")
  ENV_ARGS+=("$RUNTIME_ENV=secretref:$CONTAINER_SECRET")
  az containerapp update -g "$RESOURCE_GROUP" -n "$APP" \
    --set-env-vars "${ENV_ARGS[@]}" \
    --only-show-errors >/dev/null

  READY_REVISION=$(wait_ready "$APP" 36) \
    || fail "$APP did not become ready after Redis binding."

  jq -cn \
    --arg serviceKey "$KEY" \
    --arg containerApp "$APP" \
    --arg readyRevision "$READY_REVISION" \
    --arg secretName "$CONTAINER_SECRET" \
    --arg keyVaultSecretUri "$SECRET_URI" \
    --argjson alreadyBoundBefore "$ALREADY_BOUND" \
    '{serviceKey:$serviceKey,containerApp:$containerApp,readyRevision:$readyRevision,secretName:$secretName,keyVaultSecretUri:$keyVaultSecretUri,alreadyBoundBefore:$alreadyBoundBefore,tokenRevocationEnabled:false,authRateLimitEnabled:false}' \
    >>"$OUTPUT_DIR/apps.jsonl"
done <"$PREFLIGHT_ROWS"

APPS=$(jq -r '[.backendServices[].containerApp] | join(",")' "$PACK_FILE")
scripts/release/smoke-containerapp-health.sh "$RESOURCE_GROUP" "$APPS"
jq -s '.' "$OUTPUT_DIR/apps.jsonl" >"$OUTPUT_DIR/apps.json"
rm -f "$OUTPUT_DIR/apps.jsonl"

jq -n \
  --arg redisName "$REDIS_NAME" \
  --arg hostName "$HOST" \
  --argjson port "$PORT" \
  --arg keyVaultSecretName "$KEY_VAULT_SECRET_NAME" \
  --arg keyVaultSecretUri "$SECRET_URI" \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson apps "$(cat "$OUTPUT_DIR/apps.json")" \
  '{schemaVersion:1,redisName:$redisName,hostName:$hostName,port:$port,tls:true,keyVaultSecretName:$keyVaultSecretName,keyVaultSecretUri:$keyVaultSecretUri,secretValuePublished:false,existingCredentialRotationExecuted:false,runtimeControlsEnabled:false,partialFailureRollbackConfigured:true,generatedAt:$generatedAt,apps:$apps}' \
  >"$OUTPUT_DIR/manifest.json"

jq -e '.secretValuePublished == false and .existingCredentialRotationExecuted == false and .runtimeControlsEnabled == false and .partialFailureRollbackConfigured == true and (.apps | length == 7)' \
  "$OUTPUT_DIR/manifest.json" >/dev/null \
  || fail 'Managed Redis binding evidence validation failed.'

trap - ERR
cleanup_success
echo 'SUCCESS: Managed Redis was bound through Key Vault to all seven apps with runtime controls disabled.'
