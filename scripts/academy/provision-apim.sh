#!/usr/bin/env bash
# Explicit, one-time setup for a NEW academy API. Never run from normal CI.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'Dry run only. Required: AZURE_SUBSCRIPTION_ID, APIM_RESOURCE_GROUP, APIM_SERVICE_NAME, AUTH_SERVICE_ORIGIN. Review the runbook, then pass --apply.'
  exit 0
fi
: "${AZURE_SUBSCRIPTION_ID:?Required}" "${APIM_RESOURCE_GROUP:?Required}" "${APIM_SERVICE_NAME:?Required}" "${AUTH_SERVICE_ORIGIN:?Required}"
python3 - "$AUTH_SERVICE_ORIGIN" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlparse(sys.argv[1])
assert u.scheme=='https' and u.hostname and not u.username and not u.password and u.path in ('','/') and not u.query and not u.fragment, 'Verified HTTPS auth-service origin required'
PY
root="$(cd "$(dirname "$0")/../.." && pwd)"
api_id=craves-academy-v1
temp="$(mktemp -d)"; trap 'rm -rf "$temp"' EXIT
az apim api list --subscription "$AZURE_SUBSCRIPTION_ID" -g "$APIM_RESOURCE_GROUP" --service-name "$APIM_SERVICE_NAME" -o json > "$temp/apis.json"
python3 - "$temp/apis.json" <<'PY'
import json,sys
apis=json.load(open(sys.argv[1]))
assert not any(a.get('name')=='craves-academy-v1' or a.get('path','').strip('/')=='academy' for a in apis), 'Academy API already exists: review and use a revision, do not overwrite it'
PY
python3 "$root/scripts/academy/write-openapi.py" > "$temp/academy.json"
az apim api import --subscription "$AZURE_SUBSCRIPTION_ID" -g "$APIM_RESOURCE_GROUP" --service-name "$APIM_SERVICE_NAME" \
  --api-id "$api_id" --path academy --display-name 'Craves Internal Academy' --specification-format OpenApiJson \
  --specification-path "$temp/academy.json" --service-url "${AUTH_SERVICE_ORIGIN%/}/api/v1/admin/academy" --protocols https --subscription-required false --only-show-errors
# Keep this backend feature DISABLED until inherited JWT/rate/size/no-cache policies are reviewed and denial tests pass.
echo 'New API imported. This does not enable the backend feature. Apply and verify the approved gateway policies and the activation checklist before enabling CRAVES_ACADEMY_ENABLED.'
