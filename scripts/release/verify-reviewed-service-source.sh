#!/usr/bin/env bash
set -euo pipefail
set +x

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ "${EXPECTED_RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || fail 'An exact reviewed 40-character source SHA is required.'
[[ "${BUILD_SOURCEVERSION:-}" == "$EXPECTED_RELEASE_SHA" ]] || fail 'Build.SourceVersion differs from the reviewed source SHA.'
[[ "${REQUESTED_IMAGE_TAG:-}" == "$EXPECTED_RELEASE_SHA" ]] || fail 'imageTag must equal the full reviewed source SHA.'
[[ "$(git rev-parse HEAD)" == "$EXPECTED_RELEASE_SHA" ]] || fail 'The checkout differs from the reviewed source SHA.'
git diff --quiet HEAD -- || fail 'The reviewed checkout has tracked source changes.'
echo "Reviewed source verified: $EXPECTED_RELEASE_SHA" >&2
