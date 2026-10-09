#!/usr/bin/env bash
# Source-only boundary: this script performs no Azure/authentication/network calls.
# Naming and acknowledgment cannot prove live isolation. Independently verify
# existing test resources and service-connection scope before any future run.
set -euo pipefail
set +x

fail() { echo "ERROR: $*" >&2; exit 1; }
RG=${DIAGNOSTIC_RESOURCE_GROUP:-}
APP=${DIAGNOSTIC_CONTAINER_APP:-}
ACR=${DIAGNOSTIC_REGISTRY:-}
ACK=${CONFIRM_ISOLATED_DIAGNOSTIC_TARGETS:-false}
TAG=${DIAGNOSTIC_IMAGE_TAG:-}

[[ "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ && "${TAG,,}" != latest ]] \
  || fail 'Supply a non-latest image tag using only letters, digits, underscores, periods and hyphens (1-128 characters).'

[[ -n "$RG" && -n "$APP" && -n "$ACR" ]] \
  || fail 'Explicit existing test resource group, Container App and registry are required; there are no default targets.'
[[ "${ACK,,}" == true ]] \
  || fail 'Confirm that all three supplied destinations are isolated nonproduction test resources.'

# Azure resource identities are case-insensitive. Reject the documented
# production names and aliases before applying bare-identifier validation.
case "${APP,,}" in
  ca-craves-web-prodlow|ca-craves-admin-web-prodlow)
    fail 'Production Container Apps are forbidden for diagnostic pipelines.' ;;
esac
case "${RG,,}" in
  rg-craves-prodlow-centralindia)
    fail 'The production resource group is forbidden for diagnostic pipelines.' ;;
esac
case "${ACR,,}" in
  cravesprodlowacr82121|cravesprodlowacr82121.azurecr.io|https://cravesprodlowacr82121.azurecr.io)
    fail 'The production registry is forbidden for diagnostic pipelines.' ;;
esac
# Deliberately conservative supplementary guard, never an allow-production escape.
for target in "$RG" "$APP" "$ACR"; do
  [[ "${target,,}" != *prod* ]] || fail 'Production-named destinations are forbidden for diagnostic pipelines.'
done

[[ "$RG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,89}$ ]] || fail 'Supply a bare test resource-group identifier.'
[[ "$APP" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || fail 'Supply a bare lowercase test Container App identifier.'
[[ "$ACR" =~ ^[A-Za-z0-9]{5,50}$ ]] || fail 'Supply a bare test registry name, not a URL or login-server alias.'
echo 'SUCCESS: explicit isolated diagnostic destinations passed source checks; live resource isolation remains a deployment prerequisite.'
