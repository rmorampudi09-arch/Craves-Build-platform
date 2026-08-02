#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group is required}
KEY_VAULT_NAME=${2:?Key Vault name is required}
STORAGE_ACCOUNT_NAME=${3:?storage account name is required}
POSTGRES_SERVER_NAME=${4:?PostgreSQL server name is required}
INVENTORY=${5:-config/production/azure-resource-inventory.json}
OUTPUT_DIR=${6:-credential-rotation-readiness}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v az >/dev/null || fail 'Azure CLI is required'
command -v jq >/dev/null || fail 'jq is required'
command -v python3 >/dev/null || fail 'python3 is required'
[[ -f "$INVENTORY" ]] || fail "inventory file is missing: $INVENTORY"
jq -e '.schemaVersion == 1 and (.containerApps | length == 7)' "$INVENTORY" >/dev/null \
  || fail 'production inventory is malformed or does not contain seven Container Apps'

mkdir -p "$OUTPUT_DIR"
REPORT="$OUTPUT_DIR/credential-rotation-readiness.md"
SNAPSHOT="$OUTPUT_DIR/credential-rotation-readiness.json"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
APP_ROWS="$TMP_DIR/apps.jsonl"
: >"$APP_ROWS"

BLOCKERS=0
WARNINGS=0

add_blocker() {
  BLOCKERS=$((BLOCKERS + 1))
  printf '%s\n' "$*" >>"$TMP_DIR/blockers.txt"
}

add_warning() {
  WARNINGS=$((WARNINGS + 1))
  printf '%s\n' "$*" >>"$TMP_DIR/warnings.txt"
}

RG_ID=$(az group show --name "$RESOURCE_GROUP" --query id -o tsv 2>/dev/null) \
  || fail "resource group was not found or is not readable: $RESOURCE_GROUP"
KV_JSON=$(az keyvault show --resource-group "$RESOURCE_GROUP" --name "$KEY_VAULT_NAME" \
  --query '{id:id,vaultUri:properties.vaultUri,rbac:properties.enableRbacAuthorization}' -o json 2>/dev/null) \
  || fail "Key Vault was not found or is not readable: $KEY_VAULT_NAME"
KV_ID=$(jq -r '.id' <<<"$KV_JSON")
KV_URI=$(jq -r '.vaultUri' <<<"$KV_JSON")
KV_RBAC=$(jq -r '.rbac' <<<"$KV_JSON")
[[ "$KV_RBAC" == 'true' ]] || add_blocker "Key Vault $KEY_VAULT_NAME is not using Azure RBAC authorization."

STORAGE_ID=$(az storage account show --resource-group "$RESOURCE_GROUP" --name "$STORAGE_ACCOUNT_NAME" \
  --query id -o tsv 2>/dev/null) \
  || fail "Storage account was not found or is not readable: $STORAGE_ACCOUNT_NAME"

POSTGRES_JSON=$(az postgres flexible-server show --resource-group "$RESOURCE_GROUP" --name "$POSTGRES_SERVER_NAME" \
  --query '{id:id,state:state,version:version,administratorLogin:administratorLogin}' -o json 2>/dev/null) \
  || fail "PostgreSQL Flexible Server was not found or is not readable: $POSTGRES_SERVER_NAME"
POSTGRES_ID=$(jq -r '.id' <<<"$POSTGRES_JSON")
POSTGRES_STATE=$(jq -r '.state' <<<"$POSTGRES_JSON")
[[ "$POSTGRES_STATE" == 'Ready' ]] || add_blocker "PostgreSQL server $POSTGRES_SERVER_NAME is not Ready; current state is $POSTGRES_STATE."

SIGNED_IN_NAME=$(az account show --query user.name -o tsv 2>/dev/null || true)
SIGNED_IN_TYPE=$(az account show --query user.type -o tsv 2>/dev/null || true)
SIGNED_IN_OBJECT_ID=''
if [[ "$SIGNED_IN_TYPE" == 'servicePrincipal' && -n "$SIGNED_IN_NAME" ]]; then
  SIGNED_IN_OBJECT_ID=$(az ad sp show --id "$SIGNED_IN_NAME" --query id -o tsv 2>/dev/null || true)
fi

SERVICE_CONNECTION_RG_ROLES='[]'
SERVICE_CONNECTION_KV_ROLES='[]'
if [[ -n "$SIGNED_IN_OBJECT_ID" ]]; then
  SERVICE_CONNECTION_RG_ROLES=$(az role assignment list \
    --assignee-object-id "$SIGNED_IN_OBJECT_ID" \
    --scope "$RG_ID" \
    --include-inherited \
    --fill-principal-name false \
    --query '[].roleDefinitionName' -o json 2>/dev/null || printf '[]')
  SERVICE_CONNECTION_KV_ROLES=$(az role assignment list \
    --assignee-object-id "$SIGNED_IN_OBJECT_ID" \
    --scope "$KV_ID" \
    --include-inherited \
    --fill-principal-name false \
    --query '[].roleDefinitionName' -o json 2>/dev/null || printf '[]')
else
  add_warning 'Could not resolve the Azure service-connection object ID; write-role verification is incomplete.'
fi

has_any_role() {
  local roles_json=$1
  shift
  local role
  for role in "$@"; do
    if jq -e --arg role "$role" 'index($role) != null' <<<"$roles_json" >/dev/null; then
      return 0
    fi
  done
  return 1
}

if [[ -n "$SIGNED_IN_OBJECT_ID" ]]; then
  has_any_role "$SERVICE_CONNECTION_RG_ROLES" 'Owner' 'Contributor' \
    || add_blocker 'Azure service connection does not have Owner or Contributor at the resource-group scope.'
  has_any_role "$SERVICE_CONNECTION_KV_ROLES" 'Owner' 'Key Vault Administrator' 'Key Vault Secrets Officer' \
    || add_blocker 'Azure service connection does not have Key Vault Secrets Officer, Key Vault Administrator, or Owner for the Key Vault.'
fi

classify_binding() {
  local env_name=$1
  local env_json=$2
  local secret_json=$3
  local present secret_ref key_vault_url
  present=$(jq -r --arg name "$env_name" '[.[] | select(.name == $name)] | length' <<<"$env_json")
  if [[ "$present" == '0' ]]; then
    printf 'missing\t\t\n'
    return
  fi
  secret_ref=$(jq -r --arg name "$env_name" '.[] | select(.name == $name) | (.secretRef // "")' <<<"$env_json" | head -n1)
  if [[ -z "$secret_ref" ]]; then
    printf 'plaintext\t\t\n'
    return
  fi
  key_vault_url=$(jq -r --arg ref "$secret_ref" '.[] | select(.name == $ref) | (.keyVaultUrl // "")' <<<"$secret_json" | head -n1)
  if [[ -n "$key_vault_url" ]]; then
    printf 'key-vault\t%s\t%s\n' "$secret_ref" "$key_vault_url"
  else
    printf 'container-app-secret\t%s\t\n' "$secret_ref"
  fi
}

while IFS=$'\t' read -r SERVICE_KEY APP_NAME; do
  APP_SUMMARY=$(az containerapp show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
    --query '{name:name,runningStatus:properties.runningStatus,latestRevisionName:properties.latestRevisionName,latestReadyRevisionName:properties.latestReadyRevisionName,identityType:identity.type,principalId:identity.principalId}' \
    -o json 2>/dev/null) || {
      add_blocker "Container App $APP_NAME is not readable."
      continue
    }

  RUNNING_STATUS=$(jq -r '.runningStatus // "Unknown"' <<<"$APP_SUMMARY")
  LATEST_REVISION=$(jq -r '.latestRevisionName // ""' <<<"$APP_SUMMARY")
  LATEST_READY_REVISION=$(jq -r '.latestReadyRevisionName // ""' <<<"$APP_SUMMARY")
  IDENTITY_TYPE=$(jq -r '.identityType // "None"' <<<"$APP_SUMMARY")
  PRINCIPAL_ID=$(jq -r '.principalId // ""' <<<"$APP_SUMMARY")

  [[ "$RUNNING_STATUS" == 'Running' ]] \
    || add_blocker "Container App $APP_NAME is not Running; current status is $RUNNING_STATUS."
  [[ -n "$LATEST_REVISION" && "$LATEST_REVISION" == "$LATEST_READY_REVISION" ]] \
    || add_blocker "Container App $APP_NAME latest revision is not the latest ready revision."
  [[ -n "$PRINCIPAL_ID" ]] \
    || add_blocker "Container App $APP_NAME has no system-assigned managed identity principal ID."

  KV_ROLE_NAMES='[]'
  if [[ -n "$PRINCIPAL_ID" ]]; then
    KV_ROLE_NAMES=$(az role assignment list \
      --assignee-object-id "$PRINCIPAL_ID" \
      --scope "$KV_ID" \
      --include-inherited \
      --fill-principal-name false \
      --query '[].roleDefinitionName' -o json 2>/dev/null || printf '[]')
    has_any_role "$KV_ROLE_NAMES" 'Owner' 'Key Vault Administrator' 'Key Vault Secrets Officer' 'Key Vault Secrets User' \
      || add_blocker "Container App $APP_NAME managed identity does not have Key Vault Secrets User access."
  fi

  ENV_JSON=$(az containerapp show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
    --query 'properties.template.containers[0].env[].{name:name,secretRef:secretRef}' -o json 2>/dev/null || printf '[]')
  SECRET_JSON=$(az containerapp secret list --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
    --query '[].{name:name,keyVaultUrl:keyVaultUrl,identity:identity}' -o json 2>/dev/null || printf '[]')

  IFS=$'\t' read -r DB_BINDING DB_SECRET_REF DB_KV_URL \
    < <(classify_binding 'SPRING_DATASOURCE_PASSWORD' "$ENV_JSON" "$SECRET_JSON")
  [[ "$DB_BINDING" != 'missing' ]] \
    || add_blocker "Container App $APP_NAME has no SPRING_DATASOURCE_PASSWORD binding."

  STORAGE_BINDING='not-applicable'
  STORAGE_SECRET_REF=''
  STORAGE_KV_URL=''
  STORAGE_ENV_COUNT=$(jq -r '[.[] | select(.name == "CRAVES_STORAGE_ENDPOINT_VALUE")] | length' <<<"$ENV_JSON")
  if [[ "$STORAGE_ENV_COUNT" != '0' ]]; then
    IFS=$'\t' read -r STORAGE_BINDING STORAGE_SECRET_REF STORAGE_KV_URL \
      < <(classify_binding 'CRAVES_STORAGE_ENDPOINT_VALUE' "$ENV_JSON" "$SECRET_JSON")
  fi

  jq -n \
    --arg serviceKey "$SERVICE_KEY" \
    --arg appName "$APP_NAME" \
    --arg runningStatus "$RUNNING_STATUS" \
    --arg latestRevisionName "$LATEST_REVISION" \
    --arg latestReadyRevisionName "$LATEST_READY_REVISION" \
    --arg identityType "$IDENTITY_TYPE" \
    --arg principalId "$PRINCIPAL_ID" \
    --argjson keyVaultRoles "$KV_ROLE_NAMES" \
    --arg databaseBinding "$DB_BINDING" \
    --arg databaseSecretRef "$DB_SECRET_REF" \
    --arg databaseKeyVaultUrl "$DB_KV_URL" \
    --arg storageBinding "$STORAGE_BINDING" \
    --arg storageSecretRef "$STORAGE_SECRET_REF" \
    --arg storageKeyVaultUrl "$STORAGE_KV_URL" \
    '{serviceKey:$serviceKey,appName:$appName,runningStatus:$runningStatus,latestRevisionName:$latestRevisionName,latestReadyRevisionName:$latestReadyRevisionName,identityType:$identityType,principalId:$principalId,keyVaultRoles:$keyVaultRoles,database:{binding:$databaseBinding,secretRef:$databaseSecretRef,keyVaultUrl:$databaseKeyVaultUrl},storage:{binding:$storageBinding,secretRef:$storageSecretRef,keyVaultUrl:$storageKeyVaultUrl}}' \
    >>"$APP_ROWS"
done < <(jq -r '.containerApps | to_entries[] | [.key, .value] | @tsv' "$INVENTORY")

python3 - "$APP_ROWS" "$SNAPSHOT" "$TMP_DIR/blockers.txt" "$TMP_DIR/warnings.txt" <<'PY'
import json
import sys
from pathlib import Path

rows_path, snapshot_path, blockers_path, warnings_path = map(Path, sys.argv[1:])
apps = []
if rows_path.exists():
    for line in rows_path.read_text(encoding='utf-8').splitlines():
        if line.strip():
            apps.append(json.loads(line))

def read_lines(path: Path):
    if not path.exists():
        return []
    return [line for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]

payload = {
    'schemaVersion': 1,
    'azureMutationExecuted': False,
    'secretValuesReadOrPublished': False,
    'apps': apps,
    'blockers': read_lines(blockers_path),
    'warnings': read_lines(warnings_path),
}
snapshot_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding='utf-8')
PY

{
  echo '# Craves credential-rotation readiness'
  echo
  echo '> Read-only preflight. No secret value is requested, printed, published, changed, or rotated.'
  echo
  echo "- Resource group: \`$RESOURCE_GROUP\`"
  echo "- Key Vault: \`$KEY_VAULT_NAME\`"
  echo "- Key Vault URI: \`$KV_URI\`"
  echo "- Storage account: \`$STORAGE_ACCOUNT_NAME\`"
  echo "- PostgreSQL server: \`$POSTGRES_SERVER_NAME\`"
  echo "- PostgreSQL state: \`$POSTGRES_STATE\`"
  echo "- Signed-in principal type: \`${SIGNED_IN_TYPE:-unknown}\`"
  echo "- Azure mutation executed: **none**"
  echo
  echo '## Service-connection effective roles'
  echo
  echo "- Resource-group roles: \`$(jq -c '.' <<<"$SERVICE_CONNECTION_RG_ROLES")\`"
  echo "- Key Vault roles: \`$(jq -c '.' <<<"$SERVICE_CONNECTION_KV_ROLES")\`"
  echo
  echo '## Container App readiness and current bindings'
  echo
  echo '| Service | App | Running/latest-ready | Managed identity | Key Vault access | Database password | Storage endpoint |'
  echo '|---|---|---|---|---|---|---|'
  while IFS= read -r row; do
    service=$(jq -r '.serviceKey' <<<"$row")
    app=$(jq -r '.appName' <<<"$row")
    running=$(jq -r 'if .runningStatus == "Running" and .latestRevisionName == .latestReadyRevisionName then "ready" else "not-ready" end' <<<"$row")
    identity=$(jq -r 'if (.principalId | length) > 0 then .identityType else "missing" end' <<<"$row")
    kv_access=$(jq -r 'if (.keyVaultRoles | length) > 0 then (.keyVaultRoles | join(", ")) else "missing" end' <<<"$row")
    db=$(jq -r '.database.binding' <<<"$row")
    storage=$(jq -r '.storage.binding' <<<"$row")
    echo "| \`$service\` | \`$app\` | \`$running\` | \`$identity\` | \`$kv_access\` | \`$db\` | \`$storage\` |"
  done <"$APP_ROWS"
  echo
  echo '## Blockers'
  echo
  if [[ -s "$TMP_DIR/blockers.txt" ]]; then
    sed 's/^/- /' "$TMP_DIR/blockers.txt"
  else
    echo '- None.'
  fi
  echo
  echo '## Warnings'
  echo
  if [[ -s "$TMP_DIR/warnings.txt" ]]; then
    sed 's/^/- /' "$TMP_DIR/warnings.txt"
  else
    echo '- None.'
  fi
  echo
  echo '## Security boundary'
  echo
  echo '- Environment-variable values are never requested; only names and `secretRef` metadata are queried.'
  echo '- Container App secret values are never requested; only secret names, Key Vault URLs, and identity metadata are queried.'
  echo '- Storage keys, PostgreSQL passwords, Key Vault secret values, tokens, and connection strings are never requested or published.'
  echo '- This preflight performs Azure read operations only.'
} >"$REPORT"

jq -e '.schemaVersion == 1 and .azureMutationExecuted == false and .secretValuesReadOrPublished == false and (.apps | length == 7)' "$SNAPSHOT" >/dev/null \
  || fail 'readiness snapshot validation failed'

printf 'Credential-rotation readiness completed: %s blocker(s), %s warning(s).\n' "$BLOCKERS" "$WARNINGS"
[[ "$BLOCKERS" -eq 0 ]]
