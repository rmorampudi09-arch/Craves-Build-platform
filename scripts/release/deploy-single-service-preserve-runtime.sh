#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
APP_NAME=${2:?container app name required}
TARGET_IMAGE=${3:?target image required}
SERVICE_KEY=${4:-service}

SMOKE_ATTEMPTS=${SMOKE_ATTEMPTS:-18}
SMOKE_SLEEP_SECONDS=${SMOKE_SLEEP_SECONDS:-10}
READY_ATTEMPTS=${READY_ATTEMPTS:-60}
READY_SLEEP_SECONDS=${READY_SLEEP_SECONDS:-10}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v az >/dev/null 2>&1 || fail 'Azure CLI is required.'
command -v jq >/dev/null 2>&1 || fail 'jq is required.'
command -v sha256sum >/dev/null 2>&1 || fail 'sha256sum is required.'
command -v curl >/dev/null 2>&1 || fail 'curl is required.'

runtime_template_hash() {
  local revision=$1
  az containerapp revision show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --revision "$revision" \
    --output json \
    --only-show-errors \
  | jq -S '
      .properties.template
      | del(.revisionSuffix)
      | (.containers // []) |= map(del(.image))
    ' \
  | sha256sum \
  | cut -d' ' -f1
}

configuration_hash() {
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --output json \
    --only-show-errors \
  | jq -S '
      .properties.configuration
      | if .ingress then .ingress |= del(.traffic) else . end
    ' \
  | sha256sum \
  | cut -d' ' -f1
}

identity_hash() {
  az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --output json \
    --only-show-errors \
  | jq -S '.identity // {}' \
  | sha256sum \
  | cut -d' ' -f1
}

secret_metadata_json() {
  az containerapp secret list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --output json \
    --only-show-errors \
  | jq -S '
      map({
        name: .name,
        keyVaultUrl: (.keyVaultUrl // null),
        identity: (.identity // null)
      })
      | sort_by(.name)
    '
}

secret_metadata_hash() {
  secret_metadata_json \
  | sha256sum \
  | cut -d' ' -f1
}

verify_active_secret_refs_are_key_vault_backed() {
  local app_json=$1
  local secret_meta=$2
  local ref kv_url identity
  local count=0

  while IFS= read -r ref; do
    [[ -n "$ref" ]] || continue
    count=$((count + 1))

    kv_url=$(jq -r --arg N "$ref" '[.[] | select(.name == $N)][0].keyVaultUrl // ""' <<<"$secret_meta")
    identity=$(jq -r --arg N "$ref" '[.[] | select(.name == $N)][0].identity // ""' <<<"$secret_meta")

    [[ "$kv_url" == https://*.vault.azure.net/secrets/* ]] || \
      fail "Active secret reference '$ref' is not Key Vault-backed. Deployment refused."
    [[ "$identity" == 'system' || "$identity" == /subscriptions/* ]] || \
      fail "Active Key Vault secret '$ref' has no supported managed-identity reference."
  done < <(
    jq -r '
      .properties.template.containers[]?.env[]?
      | select((.secretRef // "") != "")
      | .secretRef
    ' <<<"$app_json" | sort -u
  )

  [[ "$count" -gt 0 ]] || fail 'No active secret references were found; refusing an unexpected runtime shape.'
  echo "Active Key Vault-backed secret references verified: $count"
}

wait_for_image() {
  local expected_image=$1
  local forbidden_revision=${2:-}
  local attempt json latest ready running health latest_image

  for attempt in $(seq 1 "$READY_ATTEMPTS"); do
    json=$(az containerapp show \
      --resource-group "$RESOURCE_GROUP" \
      --name "$APP_NAME" \
      --output json \
      --only-show-errors 2>/dev/null || true)

    latest=$(jq -r '.properties.latestRevisionName // ""' <<<"${json:-{}}")
    ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"${json:-{}}")
    running=$(jq -r '.properties.runningStatus // ""' <<<"${json:-{}}")
    health=''
    latest_image=''

    if [[ -n "$latest" ]]; then
      latest_image=$(az containerapp revision show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --revision "$latest" \
        --query 'properties.template.containers[0].image' \
        --output tsv \
        --only-show-errors 2>/dev/null || true)

      health=$(az containerapp revision show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --revision "$latest" \
        --query properties.healthState \
        --output tsv \
        --only-show-errors 2>/dev/null || true)
    fi

    echo "Attempt $attempt/$READY_ATTEMPTS latest=$latest ready=$ready running=$running health=$health image=$latest_image" >&2

    if [[ "$latest_image" == "$expected_image" \
      && -n "$latest" \
      && "$latest" == "$ready" \
      && "$running" == 'Running' \
      && "$health" == 'Healthy' \
      && ( -z "$forbidden_revision" || "$latest" != "$forbidden_revision" ) ]]; then
      printf '%s\n' "$latest"
      return 0
    fi

    if [[ "$running" == 'Failed' || "$health" == 'Unhealthy' ]]; then
      if [[ -n "$latest" ]]; then
        az containerapp logs show \
          --resource-group "$RESOURCE_GROUP" \
          --name "$APP_NAME" \
          --revision "$latest" \
          --type console \
          --tail 200 \
          --format text \
          --only-show-errors >&2 || true
      fi
      return 1
    fi

    sleep "$READY_SLEEP_SECONDS"
  done

  return 1
}

smoke_health() {
  local app_json=$1
  local external fqdn path attempt body code

  external=$(jq -r '.properties.configuration.ingress.external // false' <<<"$app_json")
  fqdn=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$app_json")

  if [[ "$external" != 'true' ]]; then
    echo 'External HTTP smoke skipped: Container App ingress is not external.'
    return 0
  fi

  [[ -n "$fqdn" ]] || fail 'External ingress is enabled but the FQDN is missing.'

  for path in '/actuator/health/liveness' '/actuator/health/readiness'; do
    local ok=false

    for attempt in $(seq 1 "$SMOKE_ATTEMPTS"); do
      body=$(mktemp)
      code=$(curl \
        --silent \
        --show-error \
        --connect-timeout 10 \
        --max-time 30 \
        --output "$body" \
        --write-out '%{http_code}' \
        "https://$fqdn$path" || true)

      if [[ "$code" == '200' ]] && jq -e '.status == "UP"' "$body" >/dev/null 2>&1; then
        ok=true
        rm -f "$body"
        break
      fi

      echo "$path attempt $attempt/$SMOKE_ATTEMPTS -> HTTP ${code:-curl-error}" >&2
      rm -f "$body"
      sleep "$SMOKE_SLEEP_SECONDS"
    done

    [[ "$ok" == true ]] || return 1
    echo "$path -> UP"
  done
}

BEFORE=$(az containerapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --output json \
  --only-show-errors) || fail "Container App not found: $APP_NAME"

PREVIOUS_REVISION=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$BEFORE")
PREVIOUS_IMAGE=$(jq -r '.properties.template.containers[0].image // ""' <<<"$BEFORE")

[[ -n "$PREVIOUS_REVISION" ]] || fail 'Previous ready revision was not resolved.'
[[ -n "$PREVIOUS_IMAGE" ]] || fail 'Previous image was not resolved.'
[[ "$PREVIOUS_IMAGE" != "$TARGET_IMAGE" ]] || fail 'Target image is already deployed; use a new immutable tag.'

SECRET_META_BEFORE=$(secret_metadata_json)
verify_active_secret_refs_are_key_vault_backed "$BEFORE" "$SECRET_META_BEFORE"

TEMPLATE_HASH_BEFORE=$(runtime_template_hash "$PREVIOUS_REVISION")
CONFIG_HASH_BEFORE=$(configuration_hash)
IDENTITY_HASH_BEFORE=$(identity_hash)
SECRET_HASH_BEFORE=$(secret_metadata_hash)

cat <<EOF
============================================================
CRAVES SINGLE-SERVICE RUNTIME-PRESERVING DEPLOYMENT
============================================================
Service:                    $SERVICE_KEY
Container App:              $APP_NAME
Previous ready revision:    $PREVIOUS_REVISION
Previous image:             $PREVIOUS_IMAGE
Target image:               $TARGET_IMAGE
Runtime template hash:      $TEMPLATE_HASH_BEFORE
Configuration hash:         $CONFIG_HASH_BEFORE
Identity hash:              $IDENTITY_HASH_BEFORE
Secret metadata hash:       $SECRET_HASH_BEFORE
Credential values read:     NO
Credential values changed:  NO
============================================================
EOF

rollback() {
  local reason=$1
  local rollback_revision

  echo "ROLLBACK: $reason" >&2
  echo "Restoring image only: $PREVIOUS_IMAGE" >&2

  az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --image "$PREVIOUS_IMAGE" \
    --no-wait \
    --only-show-errors >/dev/null || fail 'Rollback image update failed.'

  rollback_revision=$(wait_for_image "$PREVIOUS_IMAGE" '') || fail 'Rollback revision did not become healthy.'

  [[ "$(runtime_template_hash "$rollback_revision")" == "$TEMPLATE_HASH_BEFORE" ]] || \
    fail 'Rollback runtime template differs from the pre-deployment state.'
  [[ "$(configuration_hash)" == "$CONFIG_HASH_BEFORE" ]] || \
    fail 'Rollback Container App configuration differs from the pre-deployment state.'
  [[ "$(identity_hash)" == "$IDENTITY_HASH_BEFORE" ]] || \
    fail 'Rollback managed identity differs from the pre-deployment state.'
  [[ "$(secret_metadata_hash)" == "$SECRET_HASH_BEFORE" ]] || \
    fail 'Rollback secret metadata differs from the pre-deployment state.'

  echo "Rollback completed: $rollback_revision" >&2
  exit 1
}

echo 'Deploying image only. Runtime env, flags, ingress, scaling, identity and secrets are not being modified.'

az containerapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --image "$TARGET_IMAGE" \
  --no-wait \
  --only-show-errors >/dev/null || fail 'Image update failed before a new revision was created.'

NEW_REVISION=$(wait_for_image "$TARGET_IMAGE" "$PREVIOUS_REVISION") || \
  rollback 'New revision did not become healthy.'

[[ "$(runtime_template_hash "$NEW_REVISION")" == "$TEMPLATE_HASH_BEFORE" ]] || \
  rollback 'Runtime template changed unexpectedly.'
[[ "$(configuration_hash)" == "$CONFIG_HASH_BEFORE" ]] || \
  rollback 'Container App configuration changed unexpectedly.'
[[ "$(identity_hash)" == "$IDENTITY_HASH_BEFORE" ]] || \
  rollback 'Managed identity changed unexpectedly.'
[[ "$(secret_metadata_hash)" == "$SECRET_HASH_BEFORE" ]] || \
  rollback 'Secret metadata changed unexpectedly.'

AFTER=$(az containerapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --output json \
  --only-show-errors)
SECRET_META_AFTER=$(secret_metadata_json)
verify_active_secret_refs_are_key_vault_backed "$AFTER" "$SECRET_META_AFTER"

smoke_health "$AFTER" || rollback 'Liveness/readiness smoke check failed.'

cat <<EOF
============================================================
SINGLE-SERVICE DEPLOYMENT RESULT: PASS
============================================================
Service:                       $SERVICE_KEY
Container App:                 $APP_NAME
New revision:                  $NEW_REVISION
Image:                         $TARGET_IMAGE
Runtime environment preserved: YES
Feature/provider flags kept:   YES
Ingress configuration kept:    YES
Scaling configuration kept:    YES
Managed identity preserved:    YES
Key Vault metadata preserved:  YES
Credential values read:        NO
Credential values changed:     NO
Secret objects changed:        NO
============================================================
EOF
