#!/usr/bin/env bash
set -euo pipefail
set +x

RG="${RG:-rg-craves-prodlow-centralindia}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
ORDER_APP="${ORDER_APP:-ca-craves-order-service-prodlow}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail(){ echo "ERROR: $*" >&2; exit 1; }
for tool in az jq curl; do command -v "$tool" >/dev/null || fail "$tool is required"; done

RG="$RG" CATALOG_APP="$CATALOG_APP" ORDER_APP="$ORDER_APP" \
  bash "$ROOT/scripts/release/verify-catalog-order-internal-secret-binding.sh"

BEFORE="$(az containerapp show -g "$RG" -n "$CATALOG_APP" -o json --only-show-errors)"
IMAGE_BEFORE="$(jq -r '.properties.template.containers[0].image // ""' <<<"$BEFORE")"
[[ -n "$IMAGE_BEFORE" ]] || fail "Catalog image could not be resolved"

az containerapp update \
  -g "$RG" \
  -n "$CATALOG_APP" \
  --set-env-vars CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED=true \
  -o none \
  --only-show-errors

AFTER="$(az containerapp show -g "$RG" -n "$CATALOG_APP" -o json --only-show-errors)"
LATEST="$(jq -r '.properties.latestRevisionName // ""' <<<"$AFTER")"
READY="$(jq -r '.properties.latestReadyRevisionName // ""' <<<"$AFTER")"
RUNNING="$(jq -r '.properties.runningStatus // ""' <<<"$AFTER")"
IMAGE_AFTER="$(jq -r '.properties.template.containers[0].image // ""' <<<"$AFTER")"
PRIVACY_VALUE="$(jq -r '[.properties.template.containers[0].env[]? | select(.name == "CRAVES_PUBLIC_CATALOG_PRIVACY_ENFORCEMENT_ENABLED")][0].value // ""' <<<"$AFTER")"

[[ "$IMAGE_AFTER" == "$IMAGE_BEFORE" ]] || fail "Privacy activation unexpectedly changed the Catalog image"
[[ "$PRIVACY_VALUE" == "true" ]] || fail "Catalog privacy flag was not activated"
[[ -n "$LATEST" && "$LATEST" == "$READY" ]] || fail "Catalog privacy revision is not Ready"
[[ "$RUNNING" == "Running" ]] || fail "Catalog is not Running after privacy activation"
FQDN="$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$AFTER")"
[[ -n "$FQDN" ]] || fail "Catalog FQDN could not be resolved"
curl -sS --fail --max-time 30 "https://$FQDN/actuator/health" >/dev/null

echo '============================================================'
echo 'CATALOG PUBLIC HOME-CHEF PRIVACY: ACTIVATED'
echo '============================================================'
echo "Catalog app:   $CATALOG_APP"
echo "Ready revision:$READY"
echo "Image:         $IMAGE_AFTER"
echo 'Exact public kitchen coordinates/contact/address are now redacted.'
echo 'Internal Order pickup reads continue through the key-protected Catalog route.'
echo '============================================================'
