#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACK="$ROOT/config/production/backend-completion-pack.json"
INVENTORY="$ROOT/config/production/azure-resource-inventory.json"
PIPELINE="$ROOT/azure-pipelines-backend-completion.yml"
DEPLOY_SCRIPT="$ROOT/scripts/release/deploy-backend-release.sh"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v jq >/dev/null || fail 'jq is required'
command -v python3 >/dev/null || fail 'python3 is required'
[[ -s "$PACK" ]] || fail "missing backend completion pack: $PACK"
[[ -s "$INVENTORY" ]] || fail "missing Azure resource inventory: $INVENTORY"
[[ -s "$PIPELINE" ]] || fail "missing backend completion pipeline: $PIPELINE"
[[ -s "$DEPLOY_SCRIPT" ]] || fail "missing backend deployment script: $DEPLOY_SCRIPT"

jq -e '
  .schemaVersion == 1
  and .sourceVerificationOnlyByDefault == true
  and .preserveRuntimeEnvironmentOnDeployment == true
  and .externalProviderActivationDeferred == true
  and (.services | length == 7)
  and ([.services[].key] | length == (unique | length))
  and ([.services[].path] | length == (unique | length))
  and ([.services[].imageRepository] | length == (unique | length))
  and ([.services[].containerApp] | length == (unique | length))
  and ([.services[].deployOrder] == ([.services[].deployOrder] | sort))
' "$PACK" >/dev/null || fail 'backend completion pack structure is invalid'

[[ "$(jq -r '.azure.resourceGroup' "$PACK")" == "$(jq -r '.resourceGroup' "$INVENTORY")" ]] \
  || fail 'resource group differs from the canonical Azure inventory'
[[ "$(jq -r '.azure.containerRegistry' "$PACK")" == "$(jq -r '.containerRegistry' "$INVENTORY")" ]] \
  || fail 'container registry differs from the canonical Azure inventory'

PACK_APPS=$(jq -S '.services | map({key, value: .containerApp}) | from_entries' "$PACK")
INVENTORY_APPS=$(jq -S '.containerApps' "$INVENTORY")
[[ "$PACK_APPS" == "$INVENTORY_APPS" ]] \
  || fail 'Container App names differ from the canonical Azure inventory'

while IFS= read -r service; do
  path=$(jq -r '.path' <<<"$service")
  service_root="$ROOT/$path"
  [[ -s "$service_root/pom.xml" ]] || fail "missing Maven descriptor: $path/pom.xml"
  [[ -s "$service_root/Dockerfile" ]] || fail "missing Dockerfile: $path/Dockerfile"
  grep -F '<java.version>21</java.version>' "$service_root/pom.xml" >/dev/null \
    || fail "$path does not target Java 21"
  grep -Eq '^FROM maven:3\.9\.[0-9]+-eclipse-temurin-21 AS ' "$service_root/Dockerfile" \
    || fail "$path Dockerfile does not build its own JAR with Maven and Java 21"
  grep -Eq '^USER[[:space:]]+10001:10001$' "$service_root/Dockerfile" \
    || fail "$path Dockerfile does not use the required non-root runtime identity"

  while IFS= read -r flag; do
    [[ -z "$flag" ]] && continue
    grep -R -F --include='*.yml' --include='*.yaml' --include='*.java' \
      "${flag}:false" "$service_root/src/main" >/dev/null \
      || fail "$path does not explicitly default $flag to false"
  done < <(jq -r '.defaultFalseFlags[]' <<<"$service")
done < <(jq -c '.services[]' "$PACK")

python3 - "$PIPELINE" <<'PY'
import sys
from pathlib import Path
try:
    import yaml
except ImportError as exc:
    raise SystemExit('ERROR: PyYAML is required') from exc
path = Path(sys.argv[1])
try:
    yaml.safe_load(path.read_text(encoding='utf-8'))
except Exception as exc:
    raise SystemExit(f'ERROR: invalid Azure Pipeline YAML: {exc}') from exc
PY

bash -n "$DEPLOY_SCRIPT"

if grep -En 'apps/customer-web|apps/mobile|managed-redis|customer-web' "$PACK" "$PIPELINE" "$DEPLOY_SCRIPT"; then
  fail 'backend completion files must not include web, mobile, or Managed Redis work'
fi

if grep -En -- '--set-env-vars|--replace-env-vars|secret set|--secrets' "$DEPLOY_SCRIPT"; then
  fail 'backend deployment must preserve the live environment and secret bindings'
fi

if grep -En ':latest([[:space:]]|$)' "$PIPELINE" "$DEPLOY_SCRIPT"; then
  fail 'mutable latest image tags are forbidden'
fi

echo 'SUCCESS: backend completion pack contracts passed.'
