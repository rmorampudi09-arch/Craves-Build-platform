#!/usr/bin/env bash
# Publishes the routes the Craves chef mobile app calls on the mobile gateway (apim-craves-prodlow-kmqgfy, api.craves.in).
# Contract: docs/superpowers/specs/2026-10-13-chef-app-api-additions.md
#
#   DRY_RUN=true bash scripts/apim/configure-chef-app-routes-apim.sh        prints every API, operation and backend, calls nothing
#   CONFIRM_APIM_WRITE=true bash scripts/apim/configure-chef-app-routes-apim.sh   scoped, idempotent APIM write (az login first)
#
# Each operation is added to the API that already owns its path prefix (found by path at run time, never guessed).
# A prefix nobody owns is created only where the table below says "new". An operation that already exists for the same
# method and URL template keeps its operation id; its policy is replaced by the same Bearer-check + rewrite policy.
# Release order: the backend images that carry the new routes (handed-over, kitchen photos, settings, dish DELETE,
# notification role filter) go out first; this script only wires the gateway. Backend JWT/role checks stay authoritative.
#
# Not published here (older scripts own them; they default to the deleted apim-craves-prodlow-l3ing6, so check kmqgfy):
#   kitchens/me GET|PUT, menu items, per-dish availability and image upload (configure-chef-kitchen-profile / chef-menu /
#   chef-menu-media), chef orders list/get/accept/reject/ready (chef-order-read / chef-order-actions), chef subscription plans
#   (configure-chef-subscription-plan-workflow-apim.sh), chef application and onboarding, chef finance.
# FOLLOW-UP, referral routes are excluded: the live APIM API craves-referral-members-v1 points at the wrong backend
#   (docs/referrals/CHEF_ACTIVATION_20261012.md). Needed by the app once that is fixed:
#   GET /api/v1/referrals/me, /me/code, /me/code/qr, /me/chef-earnings, /me/rewards; POST /api/v1/auth/referrals/enroll.
set -euo pipefail
set +x
: "${CONFIRM_APIM_WRITE:=false}"
: "${DRY_RUN:=false}"
RG=rg-craves-prodlow-centralindia
APIM=apim-craves-prodlow-kmqgfy
API_VERSION=2022-08-01
PUBLIC_HOST=https://api.craves.in
EXPECTED_SUBSCRIPTION=721906c9-4a72-4606-830b-d3e7ace093ff
EXPECTED_TENANT=1e7e43ac-c7f5-4d47-a74f-289a7cc21508
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JSON_POLICY="$ROOT/infra/apim/chef-app-routes/json-policy.xml"
UPLOAD_POLICY="$ROOT/infra/apim/chef-app-routes/upload-policy.xml"
fail() { echo "ERROR: $*" >&2; exit 1; }

declare -A APP=(
  [catalog]=ca-craves-catalog-service-prodlo
  [order]=ca-craves-order-service-prodlow
  [userchef]=ca-craves-user-chef-service-prod
  [notification]=ca-craves-notification-service-p
)
# key|gateway path|api id if created|display name if created|backend app|existing = must already exist (never created), new = create if absent
APIS=(
  'kitchen|api/v1/kitchens/me|-|-|catalog|existing'
  'orders|api/v1/chef/orders|-|-|order|existing'
  'scheduled|api/v1/chef/scheduled-orders|craves-chef-scheduled-orders-v1|Craves Chef Scheduled Orders API|order|new'
  'reviews|api/v1/chef/reviews|craves-chef-reviews-v1|Craves Chef Reviews API|order|new'
  'support|api/v1/support|craves-support|Craves Support|userchef|new'
  'notifications|api/v1/notifications|-|-|notification|existing'
)
# api key|operation id|method|url template (gateway path = backend path)|policy: json (64 KB cap) or upload (multipart)
ROUTES=(
  'kitchen|chef-app-get-schedule|GET|/schedule|json'
  'kitchen|chef-app-put-schedule|PUT|/schedule|json'
  'kitchen|chef-app-get-schedule-override|GET|/schedule/overrides/{serviceDate}|json'
  'kitchen|chef-app-put-schedule-override|PUT|/schedule/overrides/{serviceDate}|json'
  'kitchen|chef-app-delete-schedule-override|DELETE|/schedule/overrides/{serviceDate}|json'
  'kitchen|chef-app-bulk-menu-availability|PATCH|/menu-items/availability|json'
  'kitchen|chef-app-delete-menu-image|DELETE|/menu-items/{menuItemId}/images/{imageId}|json'
  'kitchen|chef-app-set-menu-cover-image|PUT|/menu-items/{menuItemId}/images/{imageId}/primary|json'
  'kitchen|chef-app-delete-menu-item|DELETE|/menu-items/{menuItemId}|json'
  'kitchen|chef-app-upload-kitchen-photo|POST|/photos|upload'
  'kitchen|chef-app-delete-kitchen-photo|DELETE|/photos/{kind}|json'
  'kitchen|chef-app-get-kitchen-settings|GET|/settings|json'
  'kitchen|chef-app-put-kitchen-settings|PUT|/settings|json'
  'orders|chef-app-order-history-page|GET|/page|json'
  'orders|chef-app-order-handed-over|POST|/{orderId}/handed-over|json'
  'scheduled|chef-app-list-scheduled-orders|GET|/|json'
  'scheduled|chef-app-respond-scheduled-order|PUT|/{scheduleRequestId}/orders/{orderId}/response|json'
  'reviews|chef-app-list-reviews|GET|/|json'
  'reviews|chef-app-kitchen-review-summary|GET|/kitchens/{kitchenId}/summary|json'
  'support|chef-app-create-support-case|POST|/cases|json'
  'support|chef-app-list-support-cases|GET|/cases|json'
  'support|chef-app-get-support-case|GET|/cases/{caseId}|json'
  'support|chef-app-add-support-message|POST|/cases/{caseId}/messages|json'
  'notifications|chef-app-list-in-app|GET|/in-app|json'
  'notifications|chef-app-in-app-page|GET|/in-app/page|json'
  'notifications|chef-app-in-app-unread-count|GET|/in-app/unread-count|json'
  'notifications|chef-app-in-app-read-all|PATCH|/in-app/read-all|json'
  'notifications|chef-app-get-preferences|GET|/preferences|json'
  'notifications|chef-app-put-preference|PUT|/preferences/{channel}|json'
)

api_field() { local ROW f; for ROW in "${APIS[@]}"; do IFS='|' read -r -a f <<<"$ROW"; [[ "${f[0]}" == "$1" ]] && { echo "${f[$2]}"; return; }; done; fail "unknown api key $1"; }
target_path() { local T="$2"; [[ "$T" == / ]] && T=''; echo "/$(api_field "$1" 1)$T"; }

print_table() {
  local ROW f
  echo "APIM $APIM (rg $RG), public gateway $PUBLIC_HOST"
  echo; echo "Backends (FQDN is read from the container app at run time):"
  for K in catalog order userchef notification; do printf '  %-12s %s\n' "$K" "${APP[$K]}"; done
  echo; echo "APIs (looked up by path; an existing owner is reused, never replaced):"
  for ROW in "${APIS[@]}"; do
    IFS='|' read -r -a f <<<"$ROW"
    printf '  %-14s /%-30s backend=%-12s %s\n' "${f[0]}" "${f[1]}" "${f[4]}" \
      "$([[ "${f[5]}" == new ]] && echo "create ${f[2]} if absent" || echo 'must already exist, never created here')"
  done
  echo; echo "Operations (${#ROUTES[@]}):"
  printf '  %-14s %-7s %-80s %-12s %s\n' API METHOD 'GATEWAY PATH = BACKEND PATH' BACKEND POLICY
  for ROW in "${ROUTES[@]}"; do
    IFS='|' read -r -a f <<<"$ROW"
    printf '  %-14s %-7s %-80s %-12s %s\n' "${f[0]}" "${f[2]}" "$(target_path "${f[0]}" "${f[3]}")" "$(api_field "${f[0]}" 4)" "${f[4]}"
  done
  echo
}

print_table
if [[ "${DRY_RUN,,}" == true ]]; then
  echo "DRY_RUN complete: ${#ROUTES[@]} operations on ${#APIS[@]} APIs. No az or curl call was made; nothing was written."
  exit 0
fi

[[ "${CONFIRM_APIM_WRITE,,}" == true ]] || fail 'Set CONFIRM_APIM_WRITE=true for the scoped APIM update (or DRY_RUN=true to preview).'
for tool in az jq curl sed awk; do command -v "$tool" >/dev/null || fail "$tool is required"; done
[[ -f "$JSON_POLICY" && -f "$UPLOAD_POLICY" ]] || fail 'Policy templates are missing under infra/apim/chef-app-routes'

SUB=$(az account show --query id -o tsv --only-show-errors)
TENANT=$(az account show --query tenantId -o tsv --only-show-errors)
[[ "$SUB" == "$EXPECTED_SUBSCRIPTION" && "$TENANT" == "$EXPECTED_TENANT" ]] || fail 'Wrong Azure subscription or tenant; no update applied.'
az apim show -g "$RG" -n "$APIM" -o none --only-show-errors

declare -A FQDN
for K in catalog order userchef notification; do
  APP_JSON=$(az containerapp show -g "$RG" -n "${APP[$K]}" -o json --only-show-errors)
  FQDN[$K]=$(jq -r '.properties.configuration.ingress.fqdn // ""' <<<"$APP_JSON")
  [[ -n "${FQDN[$K]}" && $(jq -r '.properties.runningStatus // ""' <<<"$APP_JSON") == Running &&
    $(jq -r '.properties.latestRevisionName // ""' <<<"$APP_JSON") == $(jq -r '.properties.latestReadyRevisionName // ""' <<<"$APP_JSON") ]] ||
    fail "${APP[$K]} is not ready; no update applied."
  curl --fail --silent --show-error --max-time 30 "https://${FQDN[$K]}/actuator/health" | jq -e '.status=="UP"' >/dev/null ||
    fail "${APP[$K]} health is not UP; no update applied."
done

declare -A API_ID OPS
for ROW in "${APIS[@]}"; do
  IFS='|' read -r KEY PATH_PART NEW_ID NAME BACKEND HOW <<<"$ROW"
  OWNERS=$(az apim api list -g "$RG" --service-name "$APIM" --query "[?path=='$PATH_PART'].name" -o tsv --only-show-errors)
  mapfile -t MATCHES < <(grep . <<<"$OWNERS" || true)
  (( ${#MATCHES[@]} <= 1 )) || fail "Ambiguous APIM path $PATH_PART; no further update applied."
  if (( ${#MATCHES[@]} == 1 )); then
    API_ID[$KEY]="${MATCHES[0]}"
    [[ $(az apim api show -g "$RG" --service-name "$APIM" --api-id "${API_ID[$KEY]}" --query subscriptionRequired -o tsv --only-show-errors) == [Ff]alse ]] ||
      fail "Existing API ${API_ID[$KEY]} ($PATH_PART) requires a subscription key; review it before release."
  elif [[ "$HOW" == new ]]; then
    az apim api create -g "$RG" --service-name "$APIM" --api-id "$NEW_ID" --display-name "$NAME" \
      --path "$PATH_PART" --protocols https --subscription-required false -o none --only-show-errors
    API_ID[$KEY]="$NEW_ID"
  else
    fail "No APIM API owns $PATH_PART on $APIM; publish its base routes with the older script first (never created here)."
  fi
  # name, method, template per existing operation; templates normalised so {id} and {orderId} compare equal.
  OPS[$KEY]=$(az apim api operation list -g "$RG" --service-name "$APIM" --api-id "${API_ID[$KEY]}" \
    --query '[].[name,method,urlTemplate]' -o tsv --only-show-errors | sed -E 's/\{[^}]*\}/{}/g')
  echo "API $KEY: ${API_ID[$KEY]} (/$PATH_PART)"
done

TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
FAILED_PROBES=0
for ROW in "${ROUTES[@]}"; do
  IFS='|' read -r KEY ID METHOD TEMPLATE KIND <<<"$ROW"
  API="${API_ID[$KEY]}"
  mapfile -t SAME < <(awk -F'\t' -v m="$METHOD" -v t="$(sed -E 's/\{[^}]*\}/{}/g' <<<"$TEMPLATE")" 'toupper($2)==m && $3==t {print $1}' <<<"${OPS[$KEY]}")
  (( ${#SAME[@]} <= 1 )) || fail "Several operations own $METHOD $TEMPLATE on $API; resolve by hand."
  OP="${SAME[0]:-$ID}"
  TARGET=$(target_path "$KEY" "$TEMPLATE")
  PARAMS=''
  for NAME in $(grep -oE '\{[A-Za-z]+\}' <<<"$TEMPLATE" | tr -d '{}' || true); do
    PARAMS+="${PARAMS:+,}{\"name\":\"$NAME\",\"type\":\"string\",\"required\":true}"
  done
  MGMT="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.ApiManagement/service/$APIM/apis/$API"
  printf '{"properties":{"displayName":"%s","method":"%s","urlTemplate":"%s","templateParameters":[%s],"responses":[]}}' \
    "$OP" "$METHOD" "$TEMPLATE" "$PARAMS" >"$TEMP_DIR/operation.json"
  az rest --method put --url "$MGMT/operations/$OP?api-version=$API_VERSION" --body @"$TEMP_DIR/operation.json" -o none --only-show-errors
  TEMPLATE_FILE="$JSON_POLICY"; [[ "$KIND" == upload ]] && TEMPLATE_FILE="$UPLOAD_POLICY"
  sed -e "s|__BACKEND_BASE_URL__|https://${FQDN[$(api_field "$KEY" 4)]}|" -e "s|__REWRITE_TEMPLATE__|$TARGET|" "$TEMPLATE_FILE" >"$TEMP_DIR/policy.xml"
  jq -Rs '{properties:{format:"rawxml",value:.}}' "$TEMP_DIR/policy.xml" >"$TEMP_DIR/policy.json"
  az rest --method put --url "$MGMT/operations/$OP/policies/policy?api-version=$API_VERSION" --body @"$TEMP_DIR/policy.json" -o none --only-show-errors
  # Read-back: the operation exists and its policy carries the Bearer check, this backend and this rewrite target.
  az apim api operation show -g "$RG" --service-name "$APIM" --api-id "$API" --operation-id "$OP" -o none --only-show-errors
  POLICY=$(az rest --method get --url "$MGMT/operations/$OP/policies/policy?api-version=$API_VERSION" --query properties.value -o tsv --only-show-errors)
  [[ "$POLICY" == *"https://${FQDN[$(api_field "$KEY" 4)]}"* && "$POLICY" == *"$TARGET"* && "$POLICY" == *Bearer* ]] || fail "Policy read-back failed for $METHOD $TARGET on $API."
  # Unauthenticated probe through the public gateway proves the route exists and is guarded (the policy answers before any backend call).
  PROBE_URL="$PUBLIC_HOST$(sed -E 's/\{[^}]*\}/probe/g' <<<"$TARGET")"
  BODY_ARGS=(); [[ "$METHOD" == POST || "$METHOD" == PUT || "$METHOD" == PATCH ]] && BODY_ARGS=(-H 'Content-Type: application/json' --data '{}')
  STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 -X "$METHOD" ${BODY_ARGS[@]+"${BODY_ARGS[@]}"} "$PROBE_URL" || true)
  if [[ "$STATUS" == 401 ]]; then echo "OK   $METHOD $TARGET -> $API/$OP (401 unauthenticated)"
  else echo "FAIL $METHOD $TARGET -> $API/$OP expected 401 from the unauthenticated probe, got ${STATUS:-none}" >&2; FAILED_PROBES=$((FAILED_PROBES+1)); fi
done
(( FAILED_PROBES == 0 )) || fail "$FAILED_PROBES route(s) did not answer 401 unauthenticated; review the gateway before release."
echo "Chef app APIM operations configured (${#ROUTES[@]} routes). Backend JWT verification and role checks remain authoritative."
