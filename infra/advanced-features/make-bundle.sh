#!/usr/bin/env bash
# Build a bundle of the advanced-features files that differ from origin/main, for the GitHub web upload
# (see docs/advanced-features/PLAYBOOK.md). Usage: make-bundle.sh <bundle-name>
set -euo pipefail
name="${1:?bundle name, e.g. m04-taxonomy}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
out=/mnt/user-data/outputs/bundles
mkdir -p "$out"
paths=(services/advanced-features-service contracts/openapi/advanced infra/advanced-features infra/apim/advanced-features docs/advanced-features scripts/advanced-features
       services/order-service services/integration-service)  # M24/M25 hooks, additive only (bundle-import.yml)
# No fallback to origin/main: when HEAD is behind it (or a shallow fetch cut the history), that diff would revert
# other people's changes in these folders (seen 3 Nov with order-service). Fetch more history instead.
base=$(git merge-base HEAD origin/main) || { echo "No merge base between HEAD and origin/main: run git fetch --depth 50 origin main" >&2; exit 1; }
mapfile -t changed < <( { git diff --name-only "$base" -- "${paths[@]}"; git ls-files --others --exclude-standard -- "${paths[@]}"; } \
  | sort -u | grep -v '/target/' || true)
files=(); deleted=()
for f in "${changed[@]}"; do [ -f "$f" ] && files+=("$f") || deleted+=("$f"); done
[ ${#files[@]} -gt 0 ] || [ ${#deleted[@]} -gt 0 ] || { echo "Nothing changed"; exit 1; }
tar -czf "$out/$name.tgz" --owner=0 --group=0 --numeric-owner -- "${files[@]}"
rm -f "$out/$name.delete"
if [ ${#deleted[@]} -gt 0 ]; then printf '%s\n' "${deleted[@]}" > "$out/$name.delete"; fi
echo "Bundle $out/$name.tgz: ${#files[@]} files, ${#deleted[@]} deletions"
