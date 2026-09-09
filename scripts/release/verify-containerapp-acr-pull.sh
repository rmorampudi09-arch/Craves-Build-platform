#!/usr/bin/env bash
# Read-only deployment prerequisite: never grant the CI identity RBAC write access.
set -Eeuo pipefail
set +x

ACR_ID="${1:?ACR resource ID is required}"
PRINCIPAL_ID="${2:?Container App principal ID is required}"
ACR_PULL_ROLE='7f951dda-4ed3-4680-a7ca-43fe172d538d'

if ! assignments="$(az role assignment list --scope "$ACR_ID" --include-inherited --only-show-errors -o json)"; then
  echo 'ERROR: Could not read registry role assignments. Check the Azure error above; this is not an identity propagation timeout.' >&2
  exit 1
fi

if ! jq -e --arg principal "$PRINCIPAL_ID" --arg role "$ACR_PULL_ROLE" '
  any(.[];
    ((.principalId // "") | ascii_downcase) == ($principal | ascii_downcase)
    and ((.roleDefinitionId // "") | ascii_downcase | endswith("/" + $role))
    and ((.condition // "") == "")
  )
' <<<"$assignments" >/dev/null; then
  echo "ERROR: Registry-scoped or inherited AcrPull is missing for Container App principal $PRINCIPAL_ID." >&2
  echo "Have a resource owner provision AcrPull at $ACR_ID, then rerun. Contributor deployment credentials cannot create role assignments." >&2
  exit 1
fi

echo 'SUCCESS: Existing Container App AcrPull assignment verified; no role assignments were changed.'
