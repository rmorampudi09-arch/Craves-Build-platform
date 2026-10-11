#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
APP_NAME=${2:?container app name required}
TARGET_IMAGE=${3:?target image required}
SERVICE_KEY=${4:-service}

SMOKE_ATTEMPTS=${SMOKE_ATTEMPTS:-6}
SMOKE_SLEEP_SECONDS=${SMOKE_SLEEP_SECONDS:-5}
# Azure Container Apps control-plane readiness can lag a healthy revision by several minutes.
# Use a five-minute default window while still failing immediately on an explicit unhealthy state.
READY_ATTEMPTS=${READY_ATTEMPTS:-60}
READY_SLEEP_SECONDS=${READY_SLEEP_SECONDS:-5}
STATUS_READ_FAILURE_LIMIT=${STATUS_READ_FAILURE_LIMIT:-4}
DEPLOY_PREFLIGHT_ONLY=${DEPLOY_PREFLIGHT_ONLY:-false}
DEPLOY_RECOVERY_ONLY=${DEPLOY_RECOVERY_ONLY:-false}
DEPLOY_RECEIPT_FILE=${DEPLOY_RECEIPT_FILE:-}
MUTATION_SUBMITTED=false
OBSERVED_REVISION=''
RESTORED_REVISION=''
RECEIPT_STATUS=not-submitted
RECEIPT_REASON=''
STATE_HASH_BEFORE=''
TEMPLATE_HASH_BEFORE=''
SECRET_HASH_BEFORE=''
PREVIOUS_REVISION=''
PREVIOUS_IMAGE=''

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v az >/dev/null 2>&1 || fail 'Azure CLI is required.'
command -v jq >/dev/null 2>&1 || fail 'jq is required.'
command -v sha256sum >/dev/null 2>&1 || fail 'sha256sum is required.'
command -v curl >/dev/null 2>&1 || fail 'curl is required.'
[[ "$DEPLOY_PREFLIGHT_ONLY" == true || "$DEPLOY_PREFLIGHT_ONLY" == false ]] \
  || fail 'DEPLOY_PREFLIGHT_ONLY must be true or false.'
[[ "$DEPLOY_RECOVERY_ONLY" == true || "$DEPLOY_RECOVERY_ONLY" == false ]] \
  || fail 'DEPLOY_RECOVERY_ONLY must be true or false.'

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

    # `az containerapp update --no-wait` can return before latestRevisionName/latest image advance.
    # Never classify an older failed revision as the outcome of this deployment. Readiness and
    # explicit failure are authoritative only after the exact immutable target image is visible.
    if [[ "$latest_image" != "$expected_image" ]]; then
      sleep "$READY_SLEEP_SECONDS"
      continue
    fi

    # runningState is diagnostic-only. A healthy active revision can legitimately be scaled to zero
    # (and Azure may transiently omit aggregate running-state fields). The HTTP smoke test below
    # is the application-level proof that the Spring Boot process can scale up and answer requests.
    if [[ -n "$latest" \
      && "$provisioning" == 'Provisioned' \
      && "$health" == 'Healthy' \
      && "$active" == 'true' \
      && ( -z "$forbidden_revision" || "$latest" != "$forbidden_revision" ) ]]; then
      printf '%s\n' "$latest"
      return 0
    fi

    if [[ -n "$latest" \
      && ( -z "$forbidden_revision" || "$latest" != "$forbidden_revision" ) \
      && ( "$provisioning" == 'Failed' \
        || "$running" == 'Failed' \
        || "$running" == 'Degraded' \
        || "$running" == 'ActivationFailed' \
        || "$health" == 'Unhealthy' ) ]]; then
      show_revision_diagnostics "$latest"
      show_revision_logs_if_available "$latest"
      printf '%s\n' "$latest"
      return 10
    fi

    sleep "$READY_SLEEP_SECONDS"
  done

  # Inconclusive telemetry is not an application failure and must not attempt replica logs,
  # because a healthy scale-to-zero revision intentionally has no replica to query.
  show_revision_diagnostics "$latest"
  return 20
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


# Receipts contain only identities and hashes, never runtime values or secrets.
# Persist intent before submission: a nonzero az exit cannot prove no mutation.
write_receipt() {
  local tmp="${DEPLOY_RECEIPT_FILE}.tmp.$$"
  jq -n --arg resourceGroup "$RESOURCE_GROUP" --arg containerApp "$APP_NAME" \
    --arg serviceKey "$SERVICE_KEY" --arg targetImage "$TARGET_IMAGE" \
    --arg previousImage "$PREVIOUS_IMAGE" --arg previousRevision "$PREVIOUS_REVISION" \
    --arg observedRevision "$OBSERVED_REVISION" --arg restoredRevision "$RESTORED_REVISION" \
    --arg stateHash "$STATE_HASH_BEFORE" --arg templateHash "$TEMPLATE_HASH_BEFORE" \
    --arg secretHash "$SECRET_HASH_BEFORE" --arg status "$RECEIPT_STATUS" \
    --arg reason "$RECEIPT_REASON" --argjson submitted "$MUTATION_SUBMITTED" \
    '{schemaVersion:1,resourceGroup:$resourceGroup,containerApp:$containerApp,serviceKey:$serviceKey,
      targetImage:$targetImage,previousImage:$previousImage,previousRevision:$previousRevision,
      observedRevision:$observedRevision,restoredRevision:$restoredRevision,
      stateHash:$stateHash,templateHash:$templateHash,secretHash:$secretHash,
      submitted:$submitted,status:$status,reason:$reason}' >"$tmp" && mv "$tmp" "$DEPLOY_RECEIPT_FILE"
}

# Recovery includes traffic and desired template state, unlike the deployment
# comparison that deliberately ignores normal ingress traffic bookkeeping.
# Only the deployed container's image and revision suffix may differ.
safe_state_hash() {
  jq -eS '
    if (.properties.configuration | type) != "object" or
       (.properties.template.containers | type) != "array" or
       (.properties.template.containers | length) == 0
    then error("Incomplete runtime state") else
      {identity:(.identity // {}), configuration:.properties.configuration,
       environmentId:.properties.environmentId, workloadProfileName:.properties.workloadProfileName,
       template:(.properties.template | del(.revisionSuffix) | del(.containers[0].image))}
    end' <<<"$1" | sha256sum | cut -d' ' -f1
}

recovery_blocked() {
  RECEIPT_STATUS=operator-required
  RECEIPT_REASON=$1
  write_receipt || echo 'ERROR: Could not persist recovery outcome; receipt remains unresolved.' >&2
  echo "ERROR: Recovery is operator-required: $1. Receipt: $DEPLOY_RECEIPT_FILE" >&2
  return 1
}

verify_recovery_state() {
  local expected_image=$1 expected_revision=$2 app_json revision_json current_state current_template current_secrets
  app_json=$(az containerapp show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" --output json --only-show-errors) || return 1
  jq -e --arg image "$expected_image" --arg revision "$expected_revision" '
    .properties.latestRevisionName == $revision and
    .properties.template.containers[0].image == $image
  ' <<<"$app_json" >/dev/null || return 1
  current_state=$(safe_state_hash "$app_json") || return 1
  [[ "$current_state" == "$STATE_HASH_BEFORE" ]] || return 1
  revision_json=$(az containerapp revision show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" --revision "$expected_revision" --output json --only-show-errors) || return 1
  jq -e --arg image "$expected_image" '
    (.properties.template | type) == "object" and
    .properties.template.containers[0].image == $image
  ' <<<"$revision_json" >/dev/null || return 1
  current_template=$(jq -S '.properties.template | del(.revisionSuffix) | (.containers // []) |= map(del(.image))' <<<"$revision_json" | sha256sum | cut -d' ' -f1) || return 1
  [[ "$current_template" == "$TEMPLATE_HASH_BEFORE" ]] || return 1
  current_secrets=$(secret_metadata_hash) || return 1
  [[ "$current_secrets" == "$SECRET_HASH_BEFORE" ]] || return 1
}

guarded_recovery() {
  local rollback_rc verified_revision
  [[ "$MUTATION_SUBMITTED" == true ]] || return 0
  # An earlier failed recovery is not permission to retry another mutation.
  [[ "$RECEIPT_STATUS" != operator-required ]] || return 1
  if [[ "$RECEIPT_STATUS" == restored ]]; then
    verify_recovery_state "$PREVIOUS_IMAGE" "$RESTORED_REVISION" \
      || { recovery_blocked 'Previously restored state changed or is unreadable'; return 1; }
    verified_revision=$(wait_for_image "$PREVIOUS_IMAGE" "$OBSERVED_REVISION") \
      || { recovery_blocked 'Previously restored readiness is no longer verified'; return 1; }
    [[ "$verified_revision" == "$RESTORED_REVISION" ]] \
      || { recovery_blocked 'Previously restored revision changed'; return 1; }
    return 0
  fi
  [[ -n "$OBSERVED_REVISION" ]] \
    || { recovery_blocked 'Submission outcome or target revision ownership is unknown'; return 1; }
  verify_recovery_state "$TARGET_IMAGE" "$OBSERVED_REVISION" \
    || { recovery_blocked 'Current image, revision, runtime, or secret metadata changed or is unreadable'; return 1; }
  # This is a read/compare/update guard, not an Azure atomic compare-and-swap.
  # Any observed drift blocks recovery; a write after the final read remains a
  # control-plane concurrency limitation and requires operational serialization.
  RECEIPT_STATUS=restore-submitted
  RECEIPT_REASON='Guarded image-only recovery submitted'
  write_receipt || { recovery_blocked 'Recovery intent could not be persisted'; return 1; }
  az containerapp update --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
    --image "$PREVIOUS_IMAGE" --no-wait --only-show-errors >/dev/null \
    || { recovery_blocked 'Restore submission failed or its outcome is unknown'; return 1; }
  if RESTORED_REVISION=$(wait_for_image "$PREVIOUS_IMAGE" "$OBSERVED_REVISION"); then
    rollback_rc=0
  else
    rollback_rc=$?
  fi
  [[ "$rollback_rc" -eq 0 ]] \
    || { recovery_blocked 'Restore readiness could not be verified'; return 1; }
  verify_recovery_state "$PREVIOUS_IMAGE" "$RESTORED_REVISION" \
    || { recovery_blocked 'Restored runtime could not be verified unchanged'; return 1; }
  RECEIPT_STATUS=restored
  RECEIPT_REASON='Previous image restored and original runtime fingerprints verified'
  write_receipt || { recovery_blocked 'Restored outcome could not be persisted'; return 1; }
  echo "Previous image restored as $RESTORED_REVISION. Receipt: $DEPLOY_RECEIPT_FILE" >&2
}

on_deploy_exit() {
  local rc=$?
  trap - EXIT
  if [[ "$rc" -ne 0 && "$MUTATION_SUBMITTED" == true ]]; then
    set +e
    guarded_recovery
  fi
  exit "$rc"
}

if [[ "$DEPLOY_RECOVERY_ONLY" == true ]]; then
  [[ -n "$DEPLOY_RECEIPT_FILE" && -s "$DEPLOY_RECEIPT_FILE" ]] || fail 'Original deployment receipt is required for recovery.'
  jq -e --arg rg "$RESOURCE_GROUP" --arg app "$APP_NAME" --arg key "$SERVICE_KEY" --arg image "$TARGET_IMAGE" '
    .schemaVersion == 1 and .resourceGroup == $rg and .containerApp == $app and
    .serviceKey == $key and .targetImage == $image and (.submitted | type == "boolean") and
    (.status | IN("not-submitted", "submitted", "deployment-verified", "restored", "restore-submitted", "operator-required")) and
    (if .submitted then
      ([.stateHash,.templateHash,.secretHash] | all(type == "string" and test("^[0-9a-f]{64}$"))) and
      ([.previousImage,.previousRevision] | all(type == "string" and length > 0))
     else true end)
  ' "$DEPLOY_RECEIPT_FILE" >/dev/null || fail 'Recovery receipt identity or evidence is invalid; manual recovery is required.'
  MUTATION_SUBMITTED=$(jq -r '.submitted' "$DEPLOY_RECEIPT_FILE")
  PREVIOUS_IMAGE=$(jq -r '.previousImage' "$DEPLOY_RECEIPT_FILE")
  PREVIOUS_REVISION=$(jq -r '.previousRevision' "$DEPLOY_RECEIPT_FILE")
  OBSERVED_REVISION=$(jq -r '.observedRevision' "$DEPLOY_RECEIPT_FILE")
  RESTORED_REVISION=$(jq -r '.restoredRevision' "$DEPLOY_RECEIPT_FILE")
  STATE_HASH_BEFORE=$(jq -r '.stateHash' "$DEPLOY_RECEIPT_FILE")
  TEMPLATE_HASH_BEFORE=$(jq -r '.templateHash' "$DEPLOY_RECEIPT_FILE")
  SECRET_HASH_BEFORE=$(jq -r '.secretHash' "$DEPLOY_RECEIPT_FILE")
  RECEIPT_STATUS=$(jq -r '.status' "$DEPLOY_RECEIPT_FILE")
  RECEIPT_REASON=$(jq -r '.reason' "$DEPLOY_RECEIPT_FILE")
  if [[ "$RECEIPT_STATUS" == restore-submitted ]]; then
    recovery_blocked 'An earlier restore outcome is unknown; do not resubmit blindly'
    exit 1
  fi
  guarded_recovery
  exit $?
fi

if [[ "$DEPLOY_PREFLIGHT_ONLY" != true ]]; then
  [[ -n "$DEPLOY_RECEIPT_FILE" ]] || DEPLOY_RECEIPT_FILE=$(mktemp)
  write_receipt || fail 'Deployment receipt cannot be written; no mutation attempted.'
  echo "Deployment receipt: $DEPLOY_RECEIPT_FILE"
  trap on_deploy_exit EXIT
fi

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

# Optional exact-image gate for isolated repairs; never overwrite another release.
if [[ -n "${EXPECTED_PREVIOUS_IMAGE:-}" ]]; then
  [[ "$PREVIOUS_IMAGE" == "$EXPECTED_PREVIOUS_IMAGE" ]] || fail 'Previous image changed; review the concurrent release before deploying.'
  [[ "$(jq -r '.properties.latestRevisionName' <<<"$BEFORE")" == "$PREVIOUS_REVISION" ]] || fail 'Another rollout is in progress.'
  [[ "$(jq -r '.properties.template.containers[0].image' <<<"$BEFORE")" == "$EXPECTED_PREVIOUS_IMAGE" ]] || fail 'Desired image already changed.'
fi

SECRET_META_BEFORE=$(secret_metadata_json)
verify_active_secret_refs_are_key_vault_backed "$BEFORE" "$SECRET_META_BEFORE"

# The full-release wrapper invokes the same read-only prerequisites for every
# service before it changes the first image. Keep the Key Vault guard identical
# here and immediately before deployment; never migrate secrets in this helper.
if [[ "$DEPLOY_PREFLIGHT_ONLY" == true ]]; then
  echo "SUCCESS: $SERVICE_KEY deployment preflight passed; no runtime mutation attempted."
  exit 0
fi

[[ "$PREVIOUS_IMAGE" != "$TARGET_IMAGE" ]] || fail 'Target image is already the current ready image; use a new immutable tag.'

[[ "$(jq -r '.properties.latestRevisionName // ""' <<<"$BEFORE")" == "$PREVIOUS_REVISION" ]] || fail 'Another rollout is in progress; no mutation attempted.'
[[ "$(jq -r '.properties.template.containers[0].image // ""' <<<"$BEFORE")" == "$PREVIOUS_IMAGE" ]] || fail 'Desired image changed; no mutation attempted.'
STATE_HASH_BEFORE=$(safe_state_hash "$BEFORE")
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
============================================================
EOF

# Recheck the captured baseline immediately before submission. This narrows, but
# cannot eliminate, the control-plane read/write race.
verify_recovery_state "$PREVIOUS_IMAGE" "$PREVIOUS_REVISION" || fail 'Runtime changed or became unreadable before submission; no mutation attempted.'
# Fail before the first mutation if durable recovery evidence cannot be saved.
MUTATION_SUBMITTED=true
RECEIPT_STATUS=submitted
write_receipt || { MUTATION_SUBMITTED=false; fail 'Submission intent could not be persisted; no mutation attempted.'; }
az containerapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --image "$TARGET_IMAGE" \
  --no-wait \
  --only-show-errors >/dev/null

set +e
NEW_REVISION=$(wait_for_image "$TARGET_IMAGE" "$PREVIOUS_REVISION")
WAIT_RC=$?
set -e

if [[ "$WAIT_RC" -eq 0 || "$WAIT_RC" -eq 10 ]]; then
  OBSERVED_REVISION=$NEW_REVISION
  write_receipt || fail 'Observed target revision could not be persisted.'
fi
[[ "$WAIT_RC" -eq 0 ]] || fail "Deployment verification failed or was inconclusive (status $WAIT_RC); recovery will use the original receipt."

AFTER=$(az containerapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --output json \
  --only-show-errors)

jq -e . >/dev/null 2>&1 <<<"$AFTER" || fail 'Container App post-deployment state was not valid JSON.'

SECRET_META_AFTER=$(secret_metadata_json)
verify_active_secret_refs_are_key_vault_backed "$AFTER" "$SECRET_META_AFTER"

TEMPLATE_HASH_AFTER=$(runtime_template_hash "$NEW_REVISION")
CONFIG_HASH_AFTER=$(configuration_hash)
IDENTITY_HASH_AFTER=$(identity_hash)
SECRET_HASH_AFTER=$(secret_metadata_hash)

[[ "$TEMPLATE_HASH_AFTER" == "$TEMPLATE_HASH_BEFORE" ]] || \
  fail 'Runtime template drift detected after image deployment; non-image settings changed.'
[[ "$CONFIG_HASH_AFTER" == "$CONFIG_HASH_BEFORE" ]] || \
  fail 'Container App configuration drift detected after image deployment.'
[[ "$IDENTITY_HASH_AFTER" == "$IDENTITY_HASH_BEFORE" ]] || \
  fail 'Managed identity drift detected after image deployment.'
[[ "$SECRET_HASH_AFTER" == "$SECRET_HASH_BEFORE" ]] || \
  fail 'Container App secret metadata drift detected after image deployment.'

# Also detect changed desired image/revision and recovery-sensitive traffic.
verify_recovery_state "$TARGET_IMAGE" "$OBSERVED_REVISION" || fail 'Post-deployment identity or runtime state changed or is unreadable.'
smoke_health "$AFTER" || fail 'New revision failed HTTP liveness/readiness smoke.'
RECEIPT_STATUS=deployment-verified
RECEIPT_REASON='Target readiness, runtime preservation and applicable health checks passed'
write_receipt || fail 'Verified deployment outcome could not be persisted.'

echo "SUCCESS: $SERVICE_KEY deployed as $TARGET_IMAGE on revision $NEW_REVISION with runtime configuration preserved."
