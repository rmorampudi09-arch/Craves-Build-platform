#!/usr/bin/env bash
set -euo pipefail
set +x

ACR=${1:?registry name required}
REPOSITORY=${2:?repository required}
EXPECTED_IMAGE_CONFIG_ID=${3:?locally built image config ID required}
export EXPECTED_IMAGE_CONFIG_ID
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fail() { echo "ERROR: $*" >&2; exit 1; }
bash "$HERE/verify-reviewed-service-source.sh"
[[ "$ACR" =~ ^[a-zA-Z0-9]+$ && "$REPOSITORY" =~ ^[a-z0-9][a-z0-9._/-]*$ ]] || fail 'Invalid image repository identity.'
LOGIN_SERVER=$(az acr show --name "$ACR" --query loginServer -o tsv --only-show-errors)
[[ "$LOGIN_SERVER" =~ ^[a-z0-9]+\.azurecr\.io$ ]] || fail 'The actual ACR login server was not resolved.'
DIGEST=$(az acr repository show --name "$ACR" --image "$REPOSITORY:$EXPECTED_RELEASE_SHA" --query digest -o tsv --only-show-errors)
[[ "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'The published image digest was not resolved.'
IMAGE="$LOGIN_SERVER/$REPOSITORY@$DIGEST"
bash "$HERE/verify-reviewed-service-image.sh" "$IMAGE"
printf '%s\n' "$IMAGE"
