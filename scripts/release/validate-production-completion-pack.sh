#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACK="$ROOT/config/production/production-completion-pack.json"
INVENTORY="$ROOT/config/production/azure-resource-inventory.json"
READINESS="$ROOT/config/production/backend-production-readiness.json"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v jq >/dev/null || fail 'jq is required'
command -v python3 >/dev/null || fail 'python3 is required'
[[ -f "$PACK" ]] || fail "missing production completion pack: $PACK"
[[ -f "$INVENTORY" ]] || fail "missing Azure resource inventory: $INVENTORY"
[[ -f "$READINESS" ]] || fail "missing backend production readiness manifest: $READINESS"

jq -e '
  .schemaVersion == 1
  and .sourceOnlyBuild == true
  and .liveExecutionDeferred == true
  and (.backendServices | length == 7)
  and .keyVaultFirstPolicy.newSecretValuesAllowedInGit == false
  and .keyVaultFirstPolicy.newSecretValuesAllowedInPipelineParameters == false
  and .keyVaultFirstPolicy.newSecretValuesAllowedInNormalPipelineVariables == false
  and .keyVaultFirstPolicy.newSecretValuesAllowedAsPlaintextContainerAppEnvironment == false
  and .keyVaultFirstPolicy.existingCredentialRotationDeferred == true
' "$PACK" >/dev/null || fail 'production completion pack policy validation failed'

PACK_APPS=$(jq -S '.backendServices | map({key, value: .containerApp}) | from_entries' "$PACK")
INVENTORY_APPS=$(jq -S '.containerApps' "$INVENTORY")
[[ "$PACK_APPS" == "$INVENTORY_APPS" ]] \
  || fail 'Container App names in the completion pack differ from the canonical production inventory'

mapfile -t SERVICES < <(jq -r '.backendServices[].path' "$PACK")
for service in "${SERVICES[@]}"; do
  [[ -d "$ROOT/$service" ]] || fail "missing service directory: $service"
  [[ -s "$ROOT/$service/pom.xml" ]] || fail "missing Maven descriptor: $service/pom.xml"
  [[ -s "$ROOT/$service/Dockerfile" ]] || fail "missing Dockerfile: $service/Dockerfile"
done

WEB_PATH=$(jq -r '.web.path' "$PACK")
MOBILE_PATH=$(jq -r '.mobile.path' "$PACK")
[[ -s "$ROOT/$WEB_PATH/package.json" ]] || fail "missing Next.js package.json: $WEB_PATH/package.json"
[[ -s "$ROOT/$WEB_PATH/Dockerfile" ]] || fail "missing Next.js Dockerfile: $WEB_PATH/Dockerfile"
[[ -s "$ROOT/$MOBILE_PATH/package.json" ]] || fail "missing React Native package.json: $MOBILE_PATH/package.json"
[[ -s "$ROOT/$(jq -r '.mobile.nativeBootstrapScript' "$PACK")" ]] || fail 'missing mobile native bootstrap script'

declare -a PIPELINES=(
  azure-pipelines-production-source-completion.yml
  azure-pipelines-seven-service-image-build.yml
  azure-pipelines-seven-service-deploy.yml
  azure-pipelines-customer-web-image-build.yml
  azure-pipelines-customer-web-deploy.yml
  azure-pipelines-mobile-native-readiness.yml
  azure-pipelines-production-completion-orchestrator.yml
  azure-pipelines-release-readiness-orchestrator.yml
  pipelines/azure-pipelines-infra.yml
)

for pipeline in "${PIPELINES[@]}"; do
  [[ -s "$ROOT/$pipeline" ]] || fail "missing pipeline: $pipeline"
done

python3 - "$ROOT" "${PIPELINES[@]}" <<'PY'
import sys
from pathlib import Path

root = Path(sys.argv[1])
files = [root / item for item in sys.argv[2:]]
try:
    import yaml
except ImportError as exc:
    raise SystemExit('PyYAML is required for pipeline validation') from exc

for path in files:
    try:
        yaml.safe_load(path.read_text(encoding='utf-8'))
    except Exception as exc:
        raise SystemExit(f'Invalid YAML in {path.relative_to(root)}: {exc}') from exc
    print(f'VALID YAML: {path.relative_to(root)}')
PY

for script in \
  scripts/release/validate-production-completion-pack.sh \
  scripts/release/deploy-seven-services.sh \
  scripts/release/deploy-customer-web.sh; do
  [[ -s "$ROOT/$script" ]] || fail "missing release script: $script"
  bash -n "$ROOT/$script"
done

NEW_PIPELINE_CONTENT=$(cat \
  "$ROOT/azure-pipelines-production-source-completion.yml" \
  "$ROOT/azure-pipelines-seven-service-image-build.yml" \
  "$ROOT/azure-pipelines-seven-service-deploy.yml" \
  "$ROOT/azure-pipelines-customer-web-image-build.yml" \
  "$ROOT/azure-pipelines-customer-web-deploy.yml" \
  "$ROOT/azure-pipelines-mobile-native-readiness.yml" \
  "$ROOT/azure-pipelines-production-completion-orchestrator.yml" \
  "$ROOT/pipelines/azure-pipelines-infra.yml")

if grep -Eiq 'AzureStaticWebApp|static web app|Microsoft\.Web/staticSites' <<<"$NEW_PIPELINE_CONTENT"; then
  fail 'Static Web Apps are forbidden in the production completion pack'
fi

if grep -Eq ':[[:space:]]*latest([[:space:]]|$)|--image[^\n]*:latest' <<<"$NEW_PIPELINE_CONTENT"; then
  fail 'Mutable latest image tags are forbidden in production pipelines'
fi

if grep -Eq 'azureSubscription:[[:space:]]*\$\(AZURE_SERVICE_CONNECTION\)' <<<"$NEW_PIPELINE_CONTENT"; then
  fail 'New pipelines must use the exact authorized Craves service connection name'
fi

if grep -Eq 'POSTGRES_ADMIN_PASSWORD|AccountKey=|SharedAccessKey=|SharedAccessSignature=|accesskey=|-----BEGIN [A-Z ]*PRIVATE KEY-----' <<<"$NEW_PIPELINE_CONTENT"; then
  fail 'A secret value pattern or legacy plaintext bootstrap variable exists in the new pipeline pack'
fi

EXPECTED_CONNECTION=$(jq -r '.azure.serviceConnection' "$PACK")
if ! grep -R -F "azureSubscription: $EXPECTED_CONNECTION" \
  "$ROOT/azure-pipelines-seven-service-image-build.yml" \
  "$ROOT/azure-pipelines-seven-service-deploy.yml" \
  "$ROOT/azure-pipelines-customer-web-image-build.yml" \
  "$ROOT/azure-pipelines-customer-web-deploy.yml" \
  "$ROOT/pipelines/azure-pipelines-infra.yml" >/dev/null; then
  fail 'The exact authorized service connection is missing from one or more Azure pipelines'
fi

jq -e --argjson expected "$(jq '.requiredDisabledByDefaultFlags | unique | sort' "$READINESS")" '
  ([.backendServices[].disabledFlags[]] | unique | sort) as $actual
  | ($expected - $actual) == []
' "$PACK" >/dev/null || fail 'Completion pack does not cover every required disabled-by-default backend flag'

for secret_name in $(jq -r '.web.publicBuildConfigurationKeyVaultSecrets[]' "$PACK"); do
  [[ "$secret_name" =~ ^[a-z0-9-]+$ ]] || fail "invalid Key Vault secret name: $secret_name"
done

if [[ -f "$ROOT/$WEB_PATH/package-lock.json" ]]; then
  jq -e '.lockfileVersion >= 2' "$ROOT/$WEB_PATH/package-lock.json" >/dev/null \
    || fail 'Next.js package-lock.json is malformed'
else
  echo 'WARNING: Next.js package-lock.json is not present; image build will use npm install and publish a reproducibility warning.' >&2
fi

if [[ -f "$ROOT/$MOBILE_PATH/package-lock.json" ]]; then
  jq -e '.lockfileVersion >= 2' "$ROOT/$MOBILE_PATH/package-lock.json" >/dev/null \
    || fail 'React Native package-lock.json is malformed'
else
  echo 'WARNING: React Native package-lock.json is not present; mobile readiness will use npm install and publish a reproducibility warning.' >&2
fi

echo 'SUCCESS: production completion pack source contracts passed.'
