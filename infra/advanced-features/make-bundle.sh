#!/usr/bin/env bash
# Build a bundle of the advanced-features files that differ from origin/main, for the GitHub web upload
# (see docs/advanced-features/PLAYBOOK.md). Usage: make-bundle.sh <bundle-name>
set -euo pipefail
name="${1:?bundle name, e.g. m04-taxonomy}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
out=/mnt/user-data/outputs/bundles
mkdir -p "$out"
paths=(services/advanced-features-service contracts/openapi/advanced infra/advanced-features infra/apim/advanced-features docs/advanced-features scripts/advanced-features)
base=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse origin/main)
mapfile -t changed < <( { git diff --name-only "$base" -- "${paths[@]}"; git ls-files --others --exclude-standard -- "${paths[@]}"; } \
  | sort -u | grep -v '/target/' || true)
files=(); deleted=()
for f in "${changed[@]}"; do [ -f "$f" ] && files+=("$f") || deleted+=("$f"); done
[ ${#files[@]} -gt 0 ] || [ ${#deleted[@]} -gt 0 ] || { echo "Nothing changed"; exit 1; }
tar -czf "$out/$name.tgz" --owner=0 --group=0 --numeric-owner -- "${files[@]}"
rm -f "$out/$name.delete"
if [ ${#deleted[@]} -gt 0 ]; then printf '%s\n' "${deleted[@]}" > "$out/$name.delete"; fi
echo "Bundle $out/$name.tgz: ${#files[@]} files, ${#deleted[@]} deletions"
