#!/usr/bin/env bash
set -euo pipefail

RG="${1:?resource group required}"
APPS_CSV="${2:?comma-separated app names required}"
IFS=',' read -r -a APPS <<<"$APPS_CSV"

failures=0
for app in "${APPS[@]}"; do
  app="${app//[[:space:]]/}"
  [[ -n "$app" ]] || continue
  fqdn=$(az containerapp show -g "$RG" -n "$app" --query properties.configuration.ingress.fqdn -o tsv --only-show-errors)
  [[ -n "$fqdn" ]] || { echo "ERROR: $app has no ingress FQDN." >&2; failures=$((failures+1)); continue; }

  success=false
  for path in /actuator/health/readiness /actuator/health /health; do
    body_file=$(mktemp)
    code=$(curl --silent --show-error --location --max-time 15 --connect-timeout 5 \
      --output "$body_file" --write-out '%{http_code}' "https://$fqdn$path" || true)
    if [[ "$code" == "200" ]] && jq -e '(.status? == "UP") or (.status? == "running") or (.healthy? == true)' "$body_file" >/dev/null 2>&1; then
      echo "SUCCESS: $app https://$fqdn$path"
      success=true
      rm -f "$body_file"
      break
    fi
    rm -f "$body_file"
  done
  if [[ "$success" != "true" ]]; then
    echo "ERROR: no supported health endpoint returned a healthy HTTP 200 response for $app." >&2
    failures=$((failures+1))
  fi
done

(( failures == 0 )) || { echo "FAILED: $failures service health smoke issue(s)." >&2; exit 1; }
echo 'SUCCESS: all requested service health endpoints passed.'
