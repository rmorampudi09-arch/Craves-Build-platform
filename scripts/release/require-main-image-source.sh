#!/usr/bin/env bash
# Backend images are built only from code on GitHub main (docs/runbooks/live-runtime-safety.md, rule 1).
# Run from the checkout the image is built from, before the first build or push.
set -euo pipefail
set +x
MAIN=https://github.com/rmorampudi09-arch/Craves-Build-platform.git
fail() { echo "ERROR: $*" >&2; exit 1; }
if [[ -n "${TF_BUILD:-}" ]]; then
  [[ "${BUILD_REASON:-}" != PullRequest ]] || fail 'Pull request builds never push images.'
  [[ "${BUILD_SOURCEBRANCH:-}" == refs/heads/main ]] || fail "Images are pushed only from main, not ${BUILD_SOURCEBRANCH:-an unknown branch}."
fi
git diff --quiet HEAD -- || fail 'The image source has tracked changes.'
git fetch --quiet --no-tags "$MAIN" main || fail 'GitHub main could not be read.'
# An ancestor, not only the tip, so a rollback to an older main commit still builds.
git merge-base --is-ancestor HEAD FETCH_HEAD || fail "$(git rev-parse HEAD) is not on GitHub main."
echo "Image source is on GitHub main: $(git rev-parse HEAD)" >&2
