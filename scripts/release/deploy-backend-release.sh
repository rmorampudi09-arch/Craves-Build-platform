#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
PACK_FILE=${2:?backend completion pack required}
IMAGE_MANIFEST=${3:?image manifest required}
OUTPUT_DIR=${4:?evidence output directory required}
EXPECTED_SOURCE_SHA=${5:?expected source SHA required}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CONFIRMATION=${CONFIRM_DEPLOYMENT:-}
BACKUP_CONFIRMATION=${DATABASE_BACKUP_CONFIRMATION:-}
READY_ATTEMPTS=${READY_ATTEMPTS:-150}
READY_SLEEP_SECONDS=${READY_SLEEP_SECONDS:-10}
SINGLE_SERVICE_DEPLOY="$ROOT/scripts/release/deploy-single-service-preserve-runtime.sh"
SMOKE_SCRIPT="$ROOT/scripts/release/smoke-containerapp-health.sh"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$CONFIRMATION" == 'DEPLOY_SEVEN_SERVICES' ]] \
  || fail 'CONFIRM_DEPLOYMENT must be DEPLOY_SEVEN_SERVICES.'
[[ "$BACKUP_CONFIRMATION" == 'DATABASE_BACKUP_VERIFIED' ]] \
  || fail 'DATABASE_BACKUP_CONFIRMATION must be DATABASE_BACKUP_VERIFIED.'
[[ "$READY_ATTEMPTS" =~ ^[0-9]+$ && "$READY_ATTEMPTS" -ge 1 && "$READY_ATTEMPTS" -le 300 ]] \
  || fail 'READY_ATTEMPTS must be an integer between 1 and 300.'
[[ "$READY_SLEEP_SECONDS" =~ ^[0-9]+$ && "$READY_SLEEP_SECONDS" -ge 1 && "$READY_SLEEP_SECONDS" -le 60 ]] \
  || fail 'READY_SLEEP_SECONDS must be an integer between 1 and 60.'
command -v az >/dev/null || fail 'Azure CLI is required.'
command -v jq >/dev/null || fail 'jq is required.'
command -v sha256sum >/dev/null || fail 'sha256sum is required.'
command -v sed >/dev/null || fail 'sed is required.'
[[ -s "$PACK_FILE" ]] || fail "Backend completion pack is missing: $PACK_FILE"
[[ -s "$IMAGE_MANIFEST" ]] || fail "Image manifest is missing: $IMAGE_MANIFEST"
[[ -s "$SINGLE_SERVICE_DEPLOY" ]] || fail "Shared single-service deployment helper is missing: $SINGLE_SERVICE_DEPLOY"
[[ -s "$SMOKE_SCRIPT" ]] || fail "Health smoke helper is missing: $SMOKE_SCRIPT"

EXPECTED_RG=$(jq -r '.azure.resourceGroup' "$PACK_FILE")
ACR_NAME=$(jq -r '.azure.containerRegistry' "$PACK_FILE")
ACR_LOGIN=$(jq -r '.azure.containerRegistryLoginServer' "$PACK_FILE")
[[ "$RESOURCE_GROUP" == "$EXPECTED_RG" ]] \
  || fail "Resource group must match the backend completion pack: $EXPECTED_RG"

jq -e \
  --arg registry "$ACR_NAME" \
  --arg sourceSha "$EXPECTED_SOURCE_SHA" '
    .schemaVersion == 1
    and .registry == $registry
    and .sourceSha == $sourceSha
    and (.images | length == 7)
    and ([.images[].serviceKey] | length == (unique | length))
    and ([.images[].repository] | length == (unique | length))
    and ([.images[].digest] | all(test("^sha256:[0-9a-f]{64}$")))
  ' "$IMAGE_MANIFEST" >/dev/null || fail 'Image manifest validation failed.'

RELEASE_MODE=$(jq -r '.releaseMode // "DEPLOY_BACKEND"' "$IMAGE_MANIFEST")
EXPECTED_DEPLOY_COUNT=7
case "$RELEASE_MODE" in
  DEPLOY_BACKEND)
    ;;
  REPAIR_CATALOG_HEALTH_AND_DEPLOY)
    EXPECTED_DEPLOY_COUNT=1
    ;;
  *)
    fail "Unsupported deployment release mode: $RELEASE_MODE"
    ;;
esac

mkdir -p "$OUTPUT_DIR/service-logs"
EVENTS="$OUTPUT_DIR/deployment-events.jsonl"
ROLLBACK_MAP="$OUTPUT_DIR/rollback-map.jsonl"
: >"$EVENTS"
: >"$ROLLBACK_MAP"

declare -a COMPLETED_KEYS=()
declare -A APP_BY_KEY=()
declare -A PREVIOUS_IMAGE_BY_KEY=()
declare -A PREVIOUS_REVISION_BY_KEY=()

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

materialize_evidence() {
  local release_status=$1
  local failure_reason=${2:-}
  local events_json rollback_json

  events_json=$(jq -s '.' "$EVENTS" 2>/dev/null || printf '[]')
  rollback_json=$(jq -s '.' "$ROLLBACK_MAP" 2>/dev/null || printf '[]')
  printf '%s\n' "$events_json" >"$OUTPUT_DIR/deployment-events.json"
  printf '%s\n' "$rollback_json" >"$OUTPUT_DIR/rollback-map.json"

  jq -n \
    --arg resourceGroup "$RESOURCE_GROUP" \
    --arg sourceSha "$EXPECTED_SOURCE_SHA" \
    --arg releaseMode "$RELEASE_MODE" \
    --arg releaseStatus "$release_status" \
    --arg failureReason "$failure_reason" \
    --argjson expectedDeployCount "$EXPECTED_DEPLOY_COUNT" \
    --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson deploymentEvents "$events_json" \
    --argjson rollbackMap "$rollback_json" \
    '{
      schemaVersion:1,
      resourceGroup:$resourceGroup,
      sourceSha:$sourceSha,
      releaseMode:$releaseMode,
      releaseStatus:$releaseStatus,
      failureReason:(if $failureReason == "" then null else $failureReason end),
      expectedDeployCount:$expectedDeployCount,
      generatedAt:$generatedAt,
      runtimeConfigurationPreservationEnforced:true,
      stepOneDormantFlagsVerified:true,
      externalProvidersActivated:false,
      secretsReadOrChanged:false,
      deploymentEvents:$deploymentEvents,
      rollbackMap:$rollbackMap
    }' >"$OUTPUT_DIR/backend-deployment-manifest.json"
}

redact_stream() {
  sed -E \
    -e 's/([Aa]uthorization[[:space:]]*[:=][[:space:]]*)[^[:space:],;]+/\1***REDACTED***/g' \
    -e 's/((password|secret|token|api[-_]?key|client[-_]?key)[[:space:]]*[:=][[:space:]]*)[^[:space:],;]+/\1***REDACTED***/Ig'
}

show_runtime_diagnostics() {
  local service_key=$1
  local app_name=$2
  local expected_image=$3
  local app_json revisions_json target_revision latest_revision

  echo "========== SAFE RUNTIME DIAGNOSTICS $service_key -> $app_name ==========" >&2
  app_json=$(az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$app_name" \
    --output json \
    --only-show-errors 2>/dev/null || true)

  if [[ -n "$app_json" ]] && jq -e . >/dev/null 2>&1 <<<"$app_json"; then
    jq '{
      name:.name,
      provisioningState:.properties.provisioningState,
      provisioningError:.properties.provisioningError,
      runningStatus:.properties.runningStatus,
      activeRevisionsMode:.properties.configuration.activeRevisionsMode,
      latestRevisionName:.properties.latestRevisionName,
      latestReadyRevisionName:.properties.latestReadyRevisionName,
      latestRevisionFqdn:.properties.latestRevisionFqdn,
      configuredImage:.properties.template.containers[0].image,
      minReplicas:(.properties.template.scale.minReplicas // 0),
      maxReplicas:(.properties.template.scale.maxReplicas // 10),
      ingressExternal:(.properties.configuration.ingress.external // false),
      ingressTargetPort:.properties.configuration.ingress.targetPort
    }' <<<"$app_json" >&2 || true
    latest_revision=$(jq -r '.properties.latestRevisionName // ""' <<<"$app_json")
  else
    echo 'Container App control-plane JSON is unavailable.' >&2
    latest_revision=''
  fi

  revisions_json=$(az containerapp revision list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$app_name" \
    --output json \
    --only-show-errors 2>/dev/null || true)

  target_revision=''
  if [[ -n "$revisions_json" ]] && jq -e . >/dev/null 2>&1 <<<"$revisions_json"; then
    jq '[.[] | {
      name:.name,
      createdTime:.properties.createdTime,
      active:.properties.active,
      trafficWeight:.properties.trafficWeight,
      provisioningState:.properties.provisioningState,
      provisioningError:.properties.provisioningError,
      runningState:.properties.runningState,
      runningStateDetails:.properties.runningStateDetails,
      healthState:.properties.healthState,
      replicas:.properties.replicas,
      image:.properties.template.containers[0].image
    }] | sort_by(.createdTime) | reverse | .[:8]' <<<"$revisions_json" >&2 || true
    target_revision=$(jq -r --arg image "$expected_image" '
      [.[] | select(.properties.template.containers[0].image == $image)]
      | sort_by(.properties.createdTime // "")
      | last
      | .name // ""
    ' <<<"$revisions_json")
  fi

  [[ -n "$target_revision" ]] || target_revision=$latest_revision
  if [[ -n "$target_revision" ]]; then
    echo "Target/latest revision diagnostics: $target_revision" >&2
    az containerapp revision show \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --revision "$target_revision" \
      --query '{
        name:name,
        active:properties.active,
        trafficWeight:properties.trafficWeight,
        provisioningState:properties.provisioningState,
        provisioningError:properties.provisioningError,
        runningState:properties.runningState,
        runningStateDetails:properties.runningStateDetails,
        healthState:properties.healthState,
        replicas:properties.replicas,
        image:properties.template.containers[0].image,
        resources:properties.template.containers[0].resources,
        probes:properties.template.containers[0].probes,
        scale:properties.template.scale
      }' \
      --output jsonc \
      --only-show-errors >&2 2>/dev/null || true

    echo 'Replica diagnostics:' >&2
    az containerapp replica list \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --revision "$target_revision" \
      --query '[].{
        name:name,
        runningState:properties.runningState,
        runningStateDetails:properties.runningStateDetails,
        containers:properties.containers[].{name:name,ready:ready,restartCount:restartCount,runningState:runningState,runningStateDetails:runningStateDetails}
      }' \
      --output jsonc \
      --only-show-errors >&2 2>/dev/null || true

    echo 'Sanitized application console logs:' >&2
    az containerapp logs show \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app_name" \
      --revision "$target_revision" \
      --type console \
      --tail 200 \
      --format text \
      --only-show-errors 2>/dev/null | redact_stream >&2 || true
  fi

  echo 'Sanitized Container Apps system logs:' >&2
  az containerapp logs show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$app_name" \
    --type system \
    --tail 100 \
    --format text \
    --only-show-errors 2>/dev/null | redact_stream >&2 || true
  echo "========== END SAFE RUNTIME DIAGNOSTICS $service_key ==========" >&2
}

ready_revision_snapshot() {
  local app_name=$1
  local app_json ready revision_json

  app_json=$(az containerapp show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$app_name" \
    --output json \
    --only-show-errors 2>/dev/null || true)
  [[ -n "$app_json" ]] && jq -e . >/dev/null 2>&1 <<<"$app_json" || return 1

  ready=$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$app_json")
  [[ -n "$ready" ]] || return 1

  revision_json=$(az containerapp revision show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$app_name" \
    --revision "$ready" \
    --output json \
    --only-show-errors 2>/dev/null || true)
  [[ -n "$revision_json" ]] && jq -e . >/dev/null 2>&1 <<<"$revision_json" || return 1

  jq -cn \
    --arg revision "$ready" \
    --arg image "$(jq -r '.properties.template.containers[0].image // ""' <<<"$revision_json")" \
    --arg health "$(jq -r '.properties.healthState // ""' <<<"$revision_json")" \
    --arg provisioning "$(jq -r '.properties.provisioningState // ""' <<<"$revision_json")" \
    --arg active "$(jq -r '.properties.active // false' <<<"$revision_json")" \
    '{revision:$revision,image:$image,health:$health,provisioning:$provisioning,active:($active|ascii_downcase)}'
}

is_ready_image() {
  local app_name=$1
  local expected_image=$2
  local snapshot

  snapshot=$(ready_revision_snapshot "$app_name" 2>/dev/null || true)
  [[ -n "$snapshot" ]] || return 1
  [[ "$(jq -r '.image' <<<"$snapshot")" == "$expected_image" ]] || return 1
  [[ "$(jq -r '.health' <<<"$snapshot")" == 'Healthy' ]] || return 1
  case "$(jq -r '.provisioning' <<<"$snapshot")" in
    Provisioned|Succeeded) ;;
    *) return 1 ;;
  esac
  [[ "$(jq -r '.active' <<<"$snapshot")" == 'true' ]] || return 1
}

verify_step_one_dormant_flags() {
  local dormant service_key flag_name app env_json flag_row flag_value secret_ref normalized

  while IFS= read -r dormant; do
    service_key=$(jq -r '.serviceKey' <<<"$dormant")
    flag_name=$(jq -r '.name' <<<"$dormant")
    [[ "$service_key" =~ ^[A-Za-z][A-Za-z0-9]*$ ]] \
      || fail "Invalid step-one dormant service key: $service_key"
    [[ "$flag_name" =~ ^[A-Z][A-Z0-9_]*$ ]] \
      || fail "Invalid step-one dormant flag name: $flag_name"

    app=$(jq -r --arg key "$service_key" '.services[] | select(.key == $key) | .containerApp' "$PACK_FILE")
    [[ -n "$app" && "$app" != 'null' ]] \
      || fail "Step-one dormant flag references an unknown service: $service_key"

    env_json=$(az containerapp show \
      --resource-group "$RESOURCE_GROUP" \
      --name "$app" \
      --query 'properties.template.containers[0].env' \
      --output json \
      --only-show-errors)
    flag_row=$(jq -c --arg name "$flag_name" '[.[]? | select(.name == $name)][0] // null' <<<"$env_json")

    if [[ "$flag_row" == 'null' ]]; then
      record_event "$service_key" "$app" 'dormant-flag' 'source-default-false' "$flag_name" ''
      continue
    fi

    secret_ref=$(jq -r '.secretRef // ""' <<<"$flag_row")
    [[ -z "$secret_ref" ]] \
      || fail "Step-one dormant flag $flag_name on $app uses a secret reference and cannot be verified safely."
    flag_value=$(jq -r '.value // ""' <<<"$flag_row")
    normalized=$(printf '%s' "$flag_value" | tr '[:upper:]' '[:lower:]' | xargs)
    case "$normalized" in
      ''|false|0|no|off)
        record_event "$service_key" "$app" 'dormant-flag' 'verified-false' "$flag_name" ''
        ;;
      *)
        fail "Step-one dormant flag $flag_name must be absent or false before deployment; current value is not false."
        ;;
    esac
  done < <(jq -c '.stepOneDormantFlags[]' "$PACK_FILE")
}

rollback_completed_services() {
  local reason=$1
  local index key app previous_image current_snapshot current_revision log_file helper_rc
  echo "Rolling back ${#COMPLETED_KEYS[@]} completed service(s) in reverse order: $reason" >&2

  for ((index=${#COMPLETED_KEYS[@]}-1; index>=0; index--)); do
    key=${COMPLETED_KEYS[$index]}
    app=${APP_BY_KEY[$key]}
    previous_image=${PREVIOUS_IMAGE_BY_KEY[$key]}
    log_file="$OUTPUT_DIR/service-logs/${key}-rollback.log"

    if is_ready_image "$app" "$previous_image"; then
      current_snapshot=$(ready_revision_snapshot "$app")
      current_revision=$(jq -r '.revision' <<<"$current_snapshot")
      record_event "$key" "$app" 'rollback' 'already-restored' "$previous_image" "$current_revision"
      continue
    fi

    set +e
    READY_ATTEMPTS="$READY_ATTEMPTS" \
    READY_SLEEP_SECONDS="$READY_SLEEP_SECONDS" \
    bash "$SINGLE_SERVICE_DEPLOY" "$RESOURCE_GROUP" "$app" "$previous_image" "$key-rollback" \
      2>&1 | tee "$log_file"
    helper_rc=${PIPESTATUS[0]}
    set -e

    if [[ "$helper_rc" -eq 0 ]] && is_ready_image "$app" "$previous_image"; then
      current_snapshot=$(ready_revision_snapshot "$app")
      current_revision=$(jq -r '.revision' <<<"$current_snapshot")
      record_event "$key" "$app" 'rollback' 'ready' "$previous_image" "$current_revision"
    else
      record_event "$key" "$app" 'rollback' 'failed' "$previous_image" ''
      show_runtime_diagnostics "$key-rollback" "$app" "$previous_image"
    fi
  done
}

abort_release() {
  local message=$1
  rollback_completed_services "$message"
  materialize_evidence 'FAILED' "$message"
  fail "$message"
}

# Complete every read-only check before the first Container App mutation.
while IFS= read -r service; do
  key=$(jq -r '.key' <<<"$service")
  app=$(jq -r '.containerApp' <<<"$service")
  repository=$(jq -r '.imageRepository' <<<"$service")
  digest=$(jq -r --arg key "$key" '.images[] | select(.serviceKey == $key) | .digest' "$IMAGE_MANIFEST")
  manifest_repository=$(jq -r --arg key "$key" '.images[] | select(.serviceKey == $key) | .repository' "$IMAGE_MANIFEST")

  echo "Preflight: $key app=$app image=$repository@$digest"
  [[ "$manifest_repository" == "$repository" ]] \
    || fail "Image repository mismatch for $key."
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "Image digest is missing or malformed for $key."
  az containerapp show -g "$RESOURCE_GROUP" -n "$app" --only-show-errors >/dev/null \
    || fail "Container App not found: $app"
  az acr repository show --name "$ACR_NAME" --image "$repository@$digest" --only-show-errors >/dev/null \
    || fail "Image digest is not present in ACR: $repository@$digest"
done < <(jq -c '.services[]' "$PACK_FILE")

verify_step_one_dormant_flags

while IFS= read -r service; do
  key=$(jq -r '.key' <<<"$service")
  app=$(jq -r '.containerApp' <<<"$service")
  repository=$(jq -r '.imageRepository' <<<"$service")

  if [[ "$RELEASE_MODE" == 'REPAIR_CATALOG_HEALTH_AND_DEPLOY' && "$key" != 'catalog' ]]; then
    echo "Skipping unchanged service in Catalog repair mode: $key"
    continue
  fi

  digest=$(jq -r --arg key "$key" '.images[] | select(.serviceKey == $key) | .digest' "$IMAGE_MANIFEST")
  target_image="$ACR_LOGIN/$repository@$digest"
  before_snapshot=$(ready_revision_snapshot "$app") \
    || abort_release "Previous ready revision could not be resolved for $app."
  previous_revision=$(jq -r '.revision' <<<"$before_snapshot")
  previous_image=$(jq -r '.image' <<<"$before_snapshot")

  APP_BY_KEY[$key]=$app
  PREVIOUS_IMAGE_BY_KEY[$key]=$previous_image
  PREVIOUS_REVISION_BY_KEY[$key]=$previous_revision

  jq -cn \
    --arg serviceKey "$key" \
    --arg containerApp "$app" \
    --arg previousImage "$previous_image" \
    --arg previousReadyRevision "$previous_revision" \
    '{serviceKey:$serviceKey,containerApp:$containerApp,previousImage:$previousImage,previousReadyRevision:$previousReadyRevision}' \
    >>"$ROLLBACK_MAP"
  record_event "$key" "$app" 'before' 'ready' "$previous_image" "$previous_revision"

  if is_ready_image "$app" "$target_image"; then
    echo "========== RESUME $key -> target image already ready =========="
    if ! bash "$SMOKE_SCRIPT" "$RESOURCE_GROUP" "$app"; then
      show_runtime_diagnostics "$key" "$app" "$target_image"
      abort_release "Target image was already ready but health smoke failed for $app."
    fi
    current_snapshot=$(ready_revision_snapshot "$app")
    current_revision=$(jq -r '.revision' <<<"$current_snapshot")
    record_event "$key" "$app" 'readiness' 'already-ready' "$target_image" "$current_revision"
    record_event "$key" "$app" 'configuration' 'preserved-no-update' "$target_image" "$current_revision"
    record_event "$key" "$app" 'health' 'passed' "$target_image" "$current_revision"
    continue
  fi

  echo "========== DEPLOY $key -> $app =========="
  log_file="$OUTPUT_DIR/service-logs/${key}-deployment.log"
  set +e
  READY_ATTEMPTS="$READY_ATTEMPTS" \
  READY_SLEEP_SECONDS="$READY_SLEEP_SECONDS" \
  bash "$SINGLE_SERVICE_DEPLOY" "$RESOURCE_GROUP" "$app" "$target_image" "$key" \
    2>&1 | tee "$log_file"
  helper_rc=${PIPESTATUS[0]}
  set -e

  if [[ "$helper_rc" -ne 0 ]]; then
    record_event "$key" "$app" 'deployment' 'failed' "$target_image" ''
    show_runtime_diagnostics "$key" "$app" "$target_image"
    abort_release "New revision did not become ready for $app; see the published safe diagnostics and service log."
  fi

  if ! is_ready_image "$app" "$target_image"; then
    record_event "$key" "$app" 'deployment' 'verification-failed' "$target_image" ''
    show_runtime_diagnostics "$key" "$app" "$target_image"
    abort_release "Shared deployment helper returned success but the exact target image is not the healthy ready revision for $app."
  fi

  current_snapshot=$(ready_revision_snapshot "$app")
  current_revision=$(jq -r '.revision' <<<"$current_snapshot")
  COMPLETED_KEYS+=("$key")
  record_event "$key" "$app" 'readiness' 'ready' "$target_image" "$current_revision"
  record_event "$key" "$app" 'configuration' 'preserved' "$target_image" "$current_revision"
  record_event "$key" "$app" 'health' 'passed' "$target_image" "$current_revision"
done < <(jq -c '.services[]' "$PACK_FILE")

materialize_evidence 'SUCCEEDED' ''

jq -e \
  --argjson expectedDeployCount "$EXPECTED_DEPLOY_COUNT" '
  .releaseStatus == "SUCCEEDED"
  and .runtimeConfigurationPreservationEnforced == true
  and .stepOneDormantFlagsVerified == true
  and .externalProvidersActivated == false
  and .secretsReadOrChanged == false
  and .expectedDeployCount == $expectedDeployCount
  and (.rollbackMap | length == $expectedDeployCount)
  and ([.deploymentEvents[] | select(.phase == "health" and .status == "passed")] | length == $expectedDeployCount)
  and ([.deploymentEvents[] | select(.phase == "dormant-flag")] | length > 0)
  and ([.deploymentEvents[] | select(.phase == "rollback" and (.status == "failed" or .status == "readiness-failed" or .status == "environment-mismatch"))] | length == 0)
' "$OUTPUT_DIR/backend-deployment-manifest.json" >/dev/null \
  || fail 'Final backend deployment evidence validation failed.'

echo 'SUCCESS: backend services are on the exact digest-pinned images; the shared runtime-preserving helper proved readiness, configuration preservation and health.'
