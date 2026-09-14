#!/usr/bin/env bash
set -euo pipefail
set +x

IMAGE=${1:?digest-pinned image required}
fail() { echo "ERROR: $*" >&2; exit 1; }
[[ "${EXPECTED_RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || fail 'An exact reviewed source SHA is required.'
[[ "$IMAGE" =~ ^[a-z0-9]+\.azurecr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ ]] \
  || fail 'Reviewed releases require an immutable ACR image digest.'
# Pull by digest again at deployment. Never re-resolve a mutable tag here.
docker pull "$IMAGE" >&2
SOURCE=$(docker image inspect "$IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
[[ "$SOURCE" == "$EXPECTED_RELEASE_SHA" ]] || fail 'Published image source label differs from the reviewed SHA.'
if [[ -n "${EXPECTED_IMAGE_CONFIG_ID:-}" ]]; then
  [[ "$EXPECTED_IMAGE_CONFIG_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Expected local image config ID is invalid.'
  ACTUAL_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')
  [[ "$ACTUAL_ID" == "$EXPECTED_IMAGE_CONFIG_ID" ]] || fail 'Published image differs from the locally built image.'
fi
echo "Reviewed image verified: $IMAGE source=$SOURCE" >&2
