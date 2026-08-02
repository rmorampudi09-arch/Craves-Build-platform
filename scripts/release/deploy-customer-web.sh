#!/usr/bin/env bash
set -euo pipefail
set +x

RESOURCE_GROUP=${1:?resource group required}
CONTAINER_APP=${2:?web Container App name required}
IMAGE_TAG=${3:?immutable image tag required}
PACK_FILE=${4:-config/production/production-completion-pack.json}
OUTPUT_DIR=${5:-customer-web-deployment-evidence}
CONFIRMATION=${CONFIRM_WEB_DEPLOYMENT:-}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ "$CONFIRMATION" == 'DEPLOY_CUSTOMER_WEB' ]] \
  || fail 'Set CONFIRM_WEB_DEPLOYMENT=DEPLOY_CUSTOMER_WEB after reviewing the web deployment plan.'
[[ "$IMAGE_TAG" != 'latest' ]] || fail 'The mutable latest tag is forbidden.'
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]{7,128}$ ]] || fail 'Image tag contains unsupported characters or is too short.'
command -v az >/dev/null || fail 'Azure CLI is required.'
command -v jq >/dev/null || fail 'jq is required.'
[[ -f "$PACK_FILE" ]] || fail "Completion pack is missing: $PACK_FILE"

EXPECTED_RG=$(jq -r '.azure.resourceGroup' "$PACK_FILE")
ACR_NAME=$(jq -r '.azure.containerRegistry' "$PACK_FILE")
ACR_LOGIN=$(jq -r '.azure.containerRegistryLoginServer' "$PACK_FILE")
IMAGE_REPOSITORY=$(jq -r '.web.imageRepository' "$PACK_FILE")
EXPECTED_APP=$(jq -r '.web.containerApp' "$PACK_FILE")
TARGET_PORT=$(jq -r '.web.targetPort' "$PACK_FILE")
API_BASE_URL=$(jq -r '.web.apiBaseUrl' "$PACK_FILE")
[[ "$RESOURCE_GROUP" == "$EXPECTED_RG" ]] || fail "Resource group must be $EXPECTED_RG"
[[ "$CONTAINER_APP" == "$EXPECTED_APP" ]] || fail "Web Container App must be $EXPECTED_APP"
[[ "$API_BASE_URL" == https://* ]] || fail 'Customer web API base URL must use HTTPS.'

TARGET_IMAGE="$ACR_LOGIN/$IMAGE_REPOSITORY:$IMAGE_TAG"
TAG_EXISTS=$(az acr repository show-tags --name "$ACR_NAME" --repository "$IMAGE_REPOSITORY" \
  --query "[?@=='$IMAGE_TAG'] | [0]" -o tsv --only-show-errors 2>/dev/null || true)
[[ "$TAG_EXISTS" == "$IMAGE_TAG" ]] || fail "Web image tag does not exist: $IMAGE_REPOSITORY:$IMAGE_TAG"

az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" --only-show-errors >/dev/null \
  || fail "Web Container App does not exist: $CONTAINER_APP. Resource creation is a separate billable/manual action."

mkdir -p "$OUTPUT_DIR"
PREVIOUS_IMAGE=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
  --query 'properties.template.containers[0].image' -o tsv --only-show-errors)
PREVIOUS_REVISION=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
  --query 'properties.latestReadyRevisionName' -o tsv --only-show-errors)

jq -n \
  --arg app "$CONTAINER_APP" \
  --arg previousImage "$PREVIOUS_IMAGE" \
  --arg previousReadyRevision "$PREVIOUS_REVISION" \
  '{containerApp:$app,previousImage:$previousImage,previousReadyRevision:$previousReadyRevision}' \
  >"$OUTPUT_DIR/rollback-map.json"

az containerapp ingress update -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
  --target-port "$TARGET_PORT" \
  --transport auto \
  --allow-insecure false \
  --only-show-errors >/dev/null

set +e
az containerapp update -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
  --image "$TARGET_IMAGE" \
  --set-env-vars NODE_ENV=production PORT="$TARGET_PORT" NEXT_TELEMETRY_DISABLED=1 CRAVES_API_BASE_URL="$API_BASE_URL" \
  --only-show-errors >/dev/null
UPDATE_RC=$?
set -e

rollback() {
  echo "Rolling back web image to $PREVIOUS_IMAGE" >&2
  az containerapp update -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
    --image "$PREVIOUS_IMAGE" \
    --only-show-errors >/dev/null || true
}

[[ "$UPDATE_RC" -eq 0 ]] || {
  rollback
  fail 'Customer web Container App update failed.'
}

NEW_REVISION=''
for attempt in $(seq 1 36); do
  CURRENT_IMAGE=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
    --query 'properties.template.containers[0].image' -o tsv --only-show-errors 2>/dev/null || true)
  LATEST=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
    --query 'properties.latestRevisionName' -o tsv --only-show-errors 2>/dev/null || true)
  READY=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
    --query 'properties.latestReadyRevisionName' -o tsv --only-show-errors 2>/dev/null || true)
  RUNNING=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
    --query 'properties.runningStatus' -o tsv --only-show-errors 2>/dev/null || true)
  if [[ "$CURRENT_IMAGE" == "$TARGET_IMAGE" && -n "$LATEST" && "$LATEST" == "$READY" && "$RUNNING" == 'Running' ]]; then
    NEW_REVISION="$LATEST"
    break
  fi
  echo "Waiting for customer web readiness ($attempt/36): running=$RUNNING latest=$LATEST ready=$READY" >&2
  sleep 10
done

[[ -n "$NEW_REVISION" ]] || {
  rollback
  fail 'Customer web revision did not become ready.'
}

FQDN=$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP" \
  --query 'properties.configuration.ingress.fqdn' -o tsv --only-show-errors)
[[ -n "$FQDN" ]] || {
  rollback
  fail 'Customer web has no ingress FQDN.'
}

HTTP_CODE=''
for attempt in $(seq 1 18); do
  HTTP_CODE=$(curl --silent --show-error --location --max-time 20 --connect-timeout 5 \
    --output "$OUTPUT_DIR/home-response.html" --write-out '%{http_code}' "https://$FQDN/" || true)
  [[ "$HTTP_CODE" == '200' ]] && break
  echo "Waiting for customer web HTTP 200 ($attempt/18): code=$HTTP_CODE" >&2
  sleep 10
done

[[ "$HTTP_CODE" == '200' ]] || {
  rollback
  fail 'Customer web root route did not return HTTP 200.'
}
rm -f "$OUTPUT_DIR/home-response.html"

jq -n \
  --arg containerApp "$CONTAINER_APP" \
  --arg image "$TARGET_IMAGE" \
  --arg revision "$NEW_REVISION" \
  --arg fqdn "$FQDN" \
  --arg apiBaseUrl "$API_BASE_URL" \
  --arg deployedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,containerApp:$containerApp,image:$image,revision:$revision,fqdn:$fqdn,apiBaseUrl:$apiBaseUrl,httpStatus:200,deployedAt:$deployedAt,secretsReadOrChanged:false,credentialRotationExecuted:false}' \
  >"$OUTPUT_DIR/customer-web-deployment-manifest.json"

jq -e '.httpStatus == 200 and .secretsReadOrChanged == false and .credentialRotationExecuted == false' \
  "$OUTPUT_DIR/customer-web-deployment-manifest.json" >/dev/null \
  || fail 'Customer web evidence validation failed.'

echo 'SUCCESS: customer web image deployed and returned HTTP 200.'
