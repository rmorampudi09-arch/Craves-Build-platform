#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
APP_NAME=${2:?container app name required}
TARGET_IMAGE=${3:?target image required}
SERVICE_KEY=${4:-service}

SMOKE_ATTEMPTS=${SMOKE_ATTEMPTS:-6}
SMOKE_SLEEP_SECONDS=${SMOKE_SLEEP_SECONDS:-5}
READY_ATTEMPTS=${READY_ATTEMPTS:-24}
READY_SLEEP_SECONDS=${READY_SLEEP_SECONDS:-5}
STATUS_READ_FAILURE_LIMIT=${STATUS_READ_FAILURE_LIMIT:-4}

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

show_revision_diagnostics() {
  local revision=$1
  [[ -n "$revision" ]] || return 0

  echo "Revision diagnostics for $revision:" >&2
  az containerapp revision show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --revision "$revision" \
    --query '{name:name,active:properties.active,trafficWeight:properties.trafficWeight,provisioningState:properties.provisioningState,runningState:properties.runningState,healthState:properties.healthState,provisioningError:properties.provisioningError,image:properties.template.containers[0].image}' \
    --output jsonc \
    --only-show-errors >&2 || true
}

show_revision_logs_if_available() {
  local revision=$1
  local logs
  [[ -n "$revision" ]] || return 0

  if logs=$(az containerapp logs show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --revision "$revision" \
    --type console \
    --tail 200 \
    --format text \
    --only-show-errors 2>/dev/null); then
    [[ -z "$logs" ]] || printf '%s\n' "$logs" >&2
  else
    echo "Replica console logs are unavailable for $revision; revision metadata remains the source of truth for this failure." >&2
  fi
}

wait_for_image() {
  local expected_image=$1
  local forbidden_revision=${2:-}
  local attempt app_json revision_json latest ready app_running provisioning running health active traffic latest_image
  local invalid_reads=0
  local last_signature=''
  local signature

  for attempt in $(seq 1 "$READY_ATTEMPTS"); do
    app_json=$(az containerapp show \
      --resource-group "$RESOURCE_GROUP" \
      --name "$APP_NAME" \
      --output json \
      --only-show-errors 2>/dev/null || true)

    if [[ -z "$app_json" ]] || ! jq -e . >/dev/null 2>&1 <<<"$app_json"; then
      invalid_reads=$((invalid_reads + 1))
      echo "Attempt $attempt/$READY_ATTEMPTS: Container App control-plane JSON unavailable/invalid ($invalid_reads/$STATUS_READ_FAILURE_LIMIT)." >&2
      if (( invalid_reads >= STATUS_READ_FAILURE_LIMIT )); then
        return 20
      fi
      sleep "$READY_SLEEP_SECONDS"
      continue
    fi

    latest=$(jq -r '.properties.latestRevisionName // ""' <<<"$app_json")
    ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$app_json")
    app_running=$(jq -r '.properties.runningStatus // ""' <<<"$app_json")

    provisioning=''
    running=''
    health=''
    active=''
    traffic=''
    latest_image=''
    revision_json=''

    if [[ -n "$latest" ]]; then
      revision_json=$(az containerapp revision show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$APP_NAME" \
        --revision "$latest" \
        --output json \
        --only-show-errors 2>/dev/null || true)
    fi

    if [[ -z "$latest" || -z "$revision_json" ]] || ! jq -e . >/dev/null 2>&1 <<<"${revision_json:-null}"; then
      invalid_reads=$((invalid_reads + 1))
      echo "Attempt $attempt/$READY_ATTEMPTS: latest revision snapshot unavailable/invalid ($invalid_reads/$STATUS_READ_FAILURE_LIMIT). latest=${latest:-none}" >&2
      if (( invalid_reads >= STATUS_READ_FAILURE_LIMIT )); then
        return 20
      fi
      sleep "$READY_SLEEP_SECONDS"
      continue
    fi

    invalid_reads=0
    latest_image=$(jq -r '.properties.template.containers[0].image // ""' <<<"$revision_json")
    provisioning=$(jq -r '.properties.provisioningState // ""' <<<"$revision_json")
    running=$(jq -r '.properties.runningState // ""' <<<"$revision_json")
    health=$(jq -r '.properties.healthState // ""' <<<"$revision_json")
    active=$(jq -r '.properties.active // false' <<<"$revision_json")
    traffic=$(jq -r '.properties.trafficWeight // 0' <<<"$revision_json")
    active=${active,,}

    signature="$latest|$ready|$app_running|$provisioning|$running|$health|$active|$traffic|$latest_image"
    if [[ "$signature" != "$last_signature" ]] || (( attempt == 1 || attempt % 6 == 0 )); then
      echo "Attempt $attempt/$READY_ATTEMPTS latest=$latest ready=${ready:-none} appRunning=${app_running:-none} provisioning=${provisioning:-none} revisionRunning=${running:-none} health=${health:-none} active=${active:-none} traffic=${traffic:-none} image=$latest_image" >&2
      last_signature=$signature
    fi

    # runningState is diagnostic-only. A healthy active revision can legitimately be scaled to zero
    # (and Azure may transiently omit aggregate running-state fields). The HTTP smoke test below
    # is the application-level proof that the Spring Boot process can scale up and answer requests.
    if [[ "$latest_image" == "$expected_image" \
      && -n "$latest" \
      && "$provisioning" == 'Provisioned' \
      && "$health" == 'Healthy' \
      && "$active" == 'true' \
      && ( -z "$forbidden_revision" || "$latest" != "$forbidden_revision" ) ]]; then
      printf '%s\n' "$latest"
      return 0
    fi

    if [[ "$provisioning" == 'Failed' \
      || "$running" == 'Failed' \
      || "$running" == 'Degraded' \
      || "$running" == 'ActivationFailed' \
      || "$health" == 'Unhealthy' ]]; then
      show_revision_diagnostics "$latest"
      show_revision_logs_if_available "$latest"
      return 10
    fi

    sleep "$READY_SLEEP_SECONDS"
  done

  # Inconclusive telemetry is not an application failure and must not attempt replica logs,
  # because a healthy scale-to-zero revision intentionally has no replica to query.
  show_revision_diagnostics "$latest"
  return 20
}

verify_previous_ready_revision_intact() {
  local app_json revision_json mode current_ready previous_image previous_health previous_active

  app_json=$(az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --output json \
    --only-show-errors 2>/dev/null || true)

  [[ -n "$app_json" ]] && jq -e . >/dev/null 2>&1 <<<"$app_json" || return 1

  mode=$(jq -r '.properties.configuration.activeRevisionsMode // ""' <<<"$app_json")
  current_ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$app_json")

  [[ "$mode" == 'Single' ]] || return 1
  [[ "$current_ready" == "$PREVIOUS_REVISION" ]] || return 1

  revision_json=$(az containerapp revision show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --revision "$PREVIOUS_REVISION" \
    --output json \
    --only-show-errors 2>/dev/null || true)

  [[ -n "$revision_json" ]] && jq -e . >/dev/null 2>&1 <<<"$revision_json" || return 1

  previous_image=$(jq -r '.properties.template.containers[0].image // ""' <<<"$revision_json")
  previous_health=$(jq -r '.properties.healthState // ""' <<<"$revision_json")
  previous_active=$(jq -r '.properties.active // false' <<<"$revision_json")
  previous_active=${previous_active,,}

  [[ "$previous_image" == "$PREVIOUS_IMAGE" ]] || return 1
  [[ "$previous_health" == 'Healthy' ]] || return 1
  [[ "$previous_active" == 'true' ]] || return 1

  echo "Single revision mode preserved previous ready revision $PREVIOUS_REVISION on $PREVIOUS_IMAGE; no rollback image update is required." >&2
  return 0
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
        --max-time 20 \
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

jq -e . >/dev/null 2>&1 <<<"$BEFORE" || fail 'Container App pre-deployment state was not valid JSON.'

PREVIOUS_REVISION=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$BEFORE")
[[ -n "$PREVIOUS_REVISION" ]] || fail 'Previous ready revision was not resolved. No deployment was attempted.'

PREVIOUS_IMAGE=$(az containerapp revision show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --revision "$PREVIOUS_REVISION" \
  --query 'properties.template.containers[0].image' \
  --output tsv \
  --only-show-errors)

[[ -n "$PREVIOUS_IMAGE" ]] || fail 'Previous ready revision image was not resolved. No deployment was attempted.'
[[ "$PREVIOUS_IMAGE" != "$TARGET_IMAGE" ]] || fail 'Target image is already the current ready image; use a new immutable tag.'

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
Previous ready image:       $PREVIOUS_IMAGE
Target image:               $TARGET_IMAGE
Runtime template hash:      $TEMPLATE_HASH_BEFORE
Configuration hash:         $CONFIG_HASH_BEFORE
Identity hash:              $IDENTITY_HASH_BEFORE
Secret metadata hash:       $SECRET_HASH_BEFORE
Credential values read:     NO
Credential values changed:  NO
Readiness timeout:          $((READY_ATTEMPTS * READY_SLEEP_SECONDS)) seconds
============================================================
EOF

NEW_REVISION=''

rollback() {
  local reason=$1
  local rollback_revision
  local wait_rc

  echo "ROLLBACK: $reason" >&2
  echo "Restoring image from previous READY revision: $PREVIOUS_IMAGE" >&2

  az containerapp update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME" \
    --image "$PREVIOUS_IMAGE" \
    --no-wait \
    --only-show-errors >/dev/null || fail 'Rollback image update failed.'

  if rollback_revision=$(wait_for_image "$PREVIOUS_IMAGE" "$NEW_REVISION"); then
    :
  else
    wait_rc=$?
    fail "Rollback image update was submitted but could not be confirmed healthy (wait result $wait_rc). Manual Container App verification is required."
  fi

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

if NEW_REVISION=$(wait_for_image "$TARGET_IMAGE" "$PREVIOUS_REVISION"); then
  :
else
  wait_rc=$?
  if [[ "$wait_rc" -eq 10 ]]; then
    if verify_previous_ready_revision_intact; then
      fail 'New revision explicitly failed before readiness. The previous ready revision remains healthy in Single revision mode; no redundant rollback revision was created.'
    fi
    rollback 'New revision explicitly reported a failed/unhealthy state and the previous ready revision could not be proven intact.'
  fi
  fail "Deployment verification was inconclusive after $((READY_ATTEMPTS * READY_SLEEP_SECONDS)) seconds. Automatic rollback was suppressed because Azure did not report an explicit unhealthy state. Inspect the latest revision before retrying."
fi

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
jq -e . >/dev/null 2>&1 <<<"$AFTER" || rollback 'Container App post-deployment state was not valid JSON.'

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
