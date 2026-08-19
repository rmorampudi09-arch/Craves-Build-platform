#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
ENV_NAME="${ENV_NAME:-CRAVES_INTERNAL_SERVICE_SECRET}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq; do command -v "$tool" >/dev/null || fail "$tool is required"; done

binding(){
  local app="$1"
  local app_json secret_ref secrets key_vault_url identity
  app_json="$(az containerapp show -g "$RG" -n "$app" -o json --only-show-errors)"
  secret_ref="$(jq -r --arg N "$ENV_NAME" '
    [.properties.template.containers[0].env[]? | select(.name == $N)][0].secretRef // ""
  ' <<<"$app_json")"
  [[ -n "$secret_ref" ]] || fail "$app does not secret-bind $ENV_NAME"

  secrets="$(az containerapp secret list -g "$RG" -n "$app" -o json --only-show-errors)"
  key_vault_url="$(jq -r --arg N "$secret_ref" '[.[] | select(.name == $N)][0].keyVaultUrl // ""' <<<"$secrets")"
  identity="$(jq -r --arg N "$secret_ref" '[.[] | select(.name == $N)][0].identity // ""' <<<"$secrets")"
  [[ "$key_vault_url" == https://*.vault.azure.net/secrets/* ]] || fail "$app $ENV_NAME is not Key Vault-backed"
  [[ -n "$identity" ]] || fail "$app Key Vault secret binding does not declare a managed identity"

  jq -cn --arg app "$app" --arg secretRef "$secret_ref" --arg keyVaultUrl "$key_vault_url" --arg identity "$identity" \
    '{app:$app,secretRef:$secretRef,keyVaultUrl:$keyVaultUrl,identity:$identity}'
}

CATALOG_BINDING="$(binding "$CATALOG_APP")"
ORDER_BINDING="$(binding "$ORDER_APP")"
CATALOG_URI="$(jq -r '.keyVaultUrl' <<<"$CATALOG_BINDING")"
ORDER_URI="$(jq -r '.keyVaultUrl' <<<"$ORDER_BINDING")"
[[ "$CATALOG_URI" == "$ORDER_URI" ]] || fail "Catalog and Order do not reference the same Key Vault secret URI for $ENV_NAME"

CATALOG_READY="$(az containerapp show -g "$RG" -n "$CATALOG_APP" --query properties.latestReadyRevisionName -o tsv --only-show-errors)"
ORDER_READY="$(az containerapp show -g "$RG" -n "$ORDER_APP" --query properties.latestReadyRevisionName -o tsv --only-show-errors)"
[[ -n "$CATALOG_READY" && -n "$ORDER_READY" ]] || fail "Catalog or Order has no ready revision"

echo '============================================================'
echo 'CATALOG ↔ ORDER INTERNAL ACCESS PREREQUISITE: PASS'
echo '============================================================'
echo "Environment name: $ENV_NAME"
echo "Key Vault URI:    $CATALOG_URI"
echo "Catalog revision: $CATALOG_READY"
echo "Order revision:   $ORDER_READY"
echo 'Secret values read: NO'
echo 'Azure resources created/modified: NO'
echo '============================================================'
