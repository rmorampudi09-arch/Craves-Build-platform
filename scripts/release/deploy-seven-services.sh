#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
IMAGE_TAG=${2:?immutable image tag required}
PACK_FILE=${3:-config/production/production-completion-pack.json}
OUTPUT_DIR=${4:-seven-service-deployment-evidence}
CONFIRMATION=${CONFIRM_DEPLOYMENT:-}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$CONFIRMATION" == 'DEPLOY_SEVEN_SERVICES' ]] \
  || fail 'Set CONFIRM_DEPLOYMENT=DEPLOY_SEVEN_SERVICES only after reviewing the deployment plan.'
[[ "$IMAGE_TAG" != 'latest' ]] || fail 'The mutable latest tag is forbidden.'
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]{7,128}$ ]] || fail 'Image tag contains unsupported characters or is too short.'
command -v az >/dev/null || fail 'Azure CLI is required.'
command -v jq >/dev/null || fail 'jq is required.'
[[ -f "$PACK_FILE" ]] || fail "Completion pack is missing: $PACK_FILE"
jq -e '.schemaVersion == 1 and (.backendServices | length == 7)' "$PACK_FILE" >/dev/null \
  || fail 'Completion pack is malformed.'

ACR_NAME=$(jq -r '.azure.containerRegistry' "$PACK_FILE")
ACR_LOGIN=$(jq -r '.azure.containerRegistryLoginServer' "$PACK_FILE")
EXPECTED_RG=$(jq -r '.azure.resourceGroup' "$PACK_FILE")
[[ "$RESOURCE_GROUP" == "$EXPECTED_RG" ]] \
  || fail "Resource group must match the canonical pack: $EXPECTED_RG"

mkdir -p "$OUTPUT_DIR"
EVENTS="$OUTPUT_DIR/deployment-events.jsonl"
ROLLBACK="$OUTPUT_DIR/rollback-map.jsonl"
: >"$EVENTS"
: >"$ROLLBACK"

record_event() {
  local service_key=$1
  local app_name=$2
  local phase=$3
  local status=$4
  local image=$5
  local revision=$6
  jq -cn \
    --arg serviceKey "$service_key" \
    --arg containerApp "$app_name" \
    --arg phase "$phase" \
    --arg status "$status" \
    --arg image "$image" \
    --arg revision "$revision" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{serviceKey:$serviceKey,containerApp:$containerApp,phase:$phase,status:$status,image:$image,revision:$revision,timestamp:$timestamp}' \
    >>"$EVENTS"
}

wait_ready() {
  local app_name=$1
  local expected_image=$2
  local attempts=${3:-36}
  local sleep_seconds=${4:-10}
  local i current_image latest ready running

  for ((i=1; i<=attempts; i++)); do
    current_image=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app_name" \
      --query 'properties.template.containers[0].image' -o tsv --only-show-errors 2>/dev/null || true)
    latest=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app_name" \
      --query 'properties.latestRevisionName' -o tsv --only-show-errors 2>/dev/null || true)
    ready=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app_name" \
      --query 'properties.latestReadyRevisionName' -o tsv --only-show-errors 2>/dev/null || true)
    running=$(az containerapp show -g "$RESOURCE_GROUP" -n "$app_name" \
      --query 'properties.runningStatus' -o tsv --only-show-errors 2>/dev/null || true)

    if [[ "$current_image" == "$expected_image" && -n "$latest" && "$latest" == "$ready" && "$running" == 'Running' ]]; then
      printf '%s\n' "$latest"
      return 0
    fi
    echo "Waiting for $app_name readiness ($i/$attempts): running=$running latest=$latest ready=$ready" >&2
    sleep "$sleep_seconds"
  done
  return 1
}

rollback_image_only() {
  local service_key=$1
  local app_name=$2
  local previous_image=$3
  [[ -n "$previous_image" ]] || return 1
  echo "Rolling back $app_name to its previous image. Disabled safety flags remain false." >&2
  az containerapp update -g "$RESOURCE_GROUP" -n "$app_name" \
    --image "$previous_image" \
    --only-show-errors >/dev/null
  local rollback_revision
  rollback_revision=$(wait_ready "$app_name" "$previous_image" 36 10) \
    || fail "Rollback did not reach a ready revision for $app_name"
  record_event "$service_key" "$app_name" 'rollback' 'ready' "$previous_image" "$rollback_revision"
}

while IFS= read -r service; do
  SERVICE_KEY=$(jq -r '.key' <<<"$service")
  APP_NAME=$(jq -r '.containerApp' <<<"$service")
  IMAGE_REPOSITORY=$(jq -r '.imageRepository' <<<"$service")
  TARGET_IMAGE="$ACR_LOGIN/$IMAGE_REPOSITORY:$IMAGE_TAG"

  echo "========== DEPLOY $SERVICE_KEY -> $APP_NAME =========="
  az containerapp show -g "$RESOURCE_GROUP" -n "$APP_NAME" --only-show-errors >/dev/null \
    || fail "Container App not found: $APP_NAME"

  TAG_EXISTS=$(az acr repository show-tags --name "$ACR_NAME" --repository "$IMAGE_REPOSITORY" \
    --query "[?@=='$IMAGE_TAG'] | [0]" -o tsv --only-show-errors 2>/dev/null || true)
  [[ "$TAG_EXISTS" == "$IMAGE_TAG" ]] \
    || fail "Image tag does not exist in ACR: $IMAGE_REPOSITORY:$IMAGE_TAG"

  PREVIOUS_IMAGE=$(az containerapp show -g "$RESOURCE_GROUP" -n "$APP_NAME" \
    --query 'properties.template.containers[0].image' -o tsv --only-show-errors)
  PREVIOUS_REVISION=$(az containerapp show -g "$RESOURCE_GROUP" -n "$APP_NAME" \
    --query 'properties.latestReadyRevisionName' -o tsv --only-show-errors)

  jq -cn \
    --arg serviceKey "$SERVICE_KEY" \
    --arg containerApp "$APP_NAME" \
    --arg previousImage "$PREVIOUS_IMAGE" \
    --arg previousReadyRevision "$PREVIOUS_REVISION" \
    '{serviceKey:$serviceKey,containerApp:$containerApp,previousImage:$previousImage,previousReadyRevision:$previousReadyRevision,safetyRollbackRule:"restore image only; keep newly disabled execution flags false"}' \
    >>"$ROLLBACK"
  record_event "$SERVICE_KEY" "$APP_NAME" 'before' 'ready' "$PREVIOUS_IMAGE" "$PREVIOUS_REVISION"

  mapfile -t FLAGS < <(jq -r '.disabledFlags[]' <<<"$service")
  ENV_ARGS=()
  for flag in "${FLAGS[@]}"; do
    ENV_ARGS+=("$flag=false")
  done

  set +e
  az containerapp update -g "$RESOURCE_GROUP" -n "$APP_NAME" \
    --image "$TARGET_IMAGE" \
    --set-env-vars "${ENV_ARGS[@]}" \
    --only-show-errors >/dev/null
  UPDATE_RC=$?
  set -e
  if [[ "$UPDATE_RC" -ne 0 ]]; then
    record_event "$SERVICE_KEY" "$APP_NAME" 'update' 'failed' "$TARGET_IMAGE" ''
    rollback_image_only "$SERVICE_KEY" "$APP_NAME" "$PREVIOUS_IMAGE" || true
    fail "Container App update failed for $APP_NAME"
  fi

  if ! NEW_REVISION=$(wait_ready "$APP_NAME" "$TARGET_IMAGE" 36 10); then
    record_event "$SERVICE_KEY" "$APP_NAME" 'readiness' 'failed' "$TARGET_IMAGE" ''
    rollback_image_only "$SERVICE_KEY" "$APP_NAME" "$PREVIOUS_IMAGE"
    fail "New revision did not become ready for $APP_NAME"
  fi

  record_event "$SERVICE_KEY" "$APP_NAME" 'readiness' 'ready' "$TARGET_IMAGE" "$NEW_REVISION"

  if ! scripts/release/smoke-containerapp-health.sh "$RESOURCE_GROUP" "$APP_NAME"; then
    record_event "$SERVICE_KEY" "$APP_NAME" 'health' 'failed' "$TARGET_IMAGE" "$NEW_REVISION"
    rollback_image_only "$SERVICE_KEY" "$APP_NAME" "$PREVIOUS_IMAGE"
    fail "Health smoke failed for $APP_NAME"
  fi

  record_event "$SERVICE_KEY" "$APP_NAME" 'health' 'passed' "$TARGET_IMAGE" "$NEW_REVISION"
done < <(jq -c '.backendServices[]' "$PACK_FILE")

jq -s '.' "$EVENTS" >"$OUTPUT_DIR/deployment-events.json"
jq -s '.' "$ROLLBACK" >"$OUTPUT_DIR/rollback-map.json"
rm -f "$EVENTS" "$ROLLBACK"

jq -n \
  --arg resourceGroup "$RESOURCE_GROUP" \
  --arg imageTag "$IMAGE_TAG" \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson deploymentEvents "$(cat "$OUTPUT_DIR/deployment-events.json")" \
  --argjson rollbackMap "$(cat "$OUTPUT_DIR/rollback-map.json")" \
  '{schemaVersion:1,resourceGroup:$resourceGroup,imageTag:$imageTag,generatedAt:$generatedAt,secretsReadOrChanged:false,credentialRotationExecuted:false,allExecutionFlagsForcedFalse:true,deploymentEvents:$deploymentEvents,rollbackMap:$rollbackMap}' \
  >"$OUTPUT_DIR/seven-service-deployment-manifest.json"

jq -e '.credentialRotationExecuted == false and .secretsReadOrChanged == false and .allExecutionFlagsForcedFalse == true and (.deploymentEvents | length >= 21)' \
  "$OUTPUT_DIR/seven-service-deployment-manifest.json" >/dev/null \
  || fail 'Deployment evidence validation failed.'

echo 'SUCCESS: seven services deployed sequentially with execution flags disabled.'
