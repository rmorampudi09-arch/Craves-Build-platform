#!/usr/bin/env bash
# Public catalog reads go from Front Door straight to catalog instead of through APIM, whose two gateway machines
# each freeze for up to a second at random (15 Nov 2026). docs/runbooks/production-environment.md,
# "Catalog: straight from Front Door".
#
#   bash scripts/frontdoor/configure-catalog-direct-route.sh                          plan: read only
#   CONFIRM_FRONTDOOR_WRITE=true bash scripts/frontdoor/configure-catalog-direct-route.sh allow-front-door
#       catalog's ingress also accepts Front Door (the web app's afd-* ranges); needs the origin check enforced
#   CONFIRM_FRONTDOOR_WRITE=true bash scripts/frontdoor/configure-catalog-direct-route.sh routes
#       catalog routes and origin group; every request still goes through APIM
#   CONFIRM_FRONTDOOR_WRITE=true bash scripts/frontdoor/configure-catalog-direct-route.sh weight N
#       N of every 1,000 public catalog requests go straight to catalog; 0 sends them all through APIM again (undo)
#
# Front Door applies a change within minutes.
set -Eeuo pipefail

SUB=34eefd95-1a19-416f-b9df-92b326500615
FD_ID=59117d14-1c4f-402e-a98b-0fa1009de276
FD=(-g rg-craves-shared-prod --profile-name afd-craves-prod)
ENDPOINT=craves-prod-api
DOMAIN=api-craves-in
APIM_HOST=apim-craves-prod-34eefd.azure-api.net
GROUP=craves-catalog-origin-group
VIA_APIM=craves-catalog-apim-origin
DIRECT=craves-catalog-direct-origin
ROUTE=craves-catalog-route
KEEP_ROUTE=craves-catalog-apim-route
# Public reads only. Internal and admin catalog paths, sign-in-only discovery and /api/v1/kitchens/me stay on APIM.
DIRECT_PATTERNS='["/api/v1/catalog/*","/api/v1/discovery/kitchens","/api/v1/discovery/menu-items"]'
KEEP_PATTERNS='["/api/v1/catalog/internal/*","/api/v1/catalog/admin/*"]'
CATALOG=(-g rg-craves-catalog-prod -n ca-craves-catalog-prod)
WEB=(-g rg-craves-web-prod -n ca-craves-web-prod)
PROBE='https://api.craves.in/api/v1/catalog/kitchens?page=0&size=1'

fail() { echo "STOP: $*" >&2; exit 1; }
write() { [[ "${CONFIRM_FRONTDOOR_WRITE:-}" == true ]] || fail "plan only; set CONFIRM_FRONTDOOR_WRITE=true to change production"; }
answers() { curl -fsS -o /dev/null --max-time 20 "$PROBE" || fail "catalog through api.craves.in did not answer 200"; echo "catalog through api.craves.in: 200"; }
rules() { az containerapp show "${CATALOG[@]}" --query properties.configuration.ingress.ipSecurityRestrictions -o json; }
front_door_rules() { jq '[.[] | select(.name | startswith("afd-"))] | length'; }

# Every revision taking traffic must refuse other companies' Front Door before catalog accepts Front Door's ranges.
check_enforced() {
  local revision
  for revision in $(az containerapp ingress traffic show "${CATALOG[@]}" --query "[?weight > \`0\`].revisionName" -o tsv); do
    az containerapp revision show "${CATALOG[@]}" --revision "$revision" --query "properties.template.containers[0].env" -o json \
      | jq -e --arg id "$FD_ID" 'any(.[]; .name == "CRAVES_FRONT_DOOR_CHECK" and .value == "enforce")
          and any(.[]; .name == "CRAVES_FRONT_DOOR_ID" and .value == $id)' >/dev/null \
      || fail "$revision does not enforce the Front Door origin check (CRAVES_FRONT_DOOR_CHECK=enforce, CRAVES_FRONT_DOOR_ID=$FD_ID)"
  done
}

plan() {
  local now
  now="$(rules)"
  echo "catalog ingress: $(jq length <<<"$now") rules, $(front_door_rules <<<"$now") of them Front Door"
  az afd origin list "${FD[@]}" --origin-group-name "$GROUP" --query "[].[name, enabledState, weight]" -o tsv 2>/dev/null || echo "$GROUP: not created"
  az afd route list "${FD[@]}" --endpoint-name "$ENDPOINT" --query "[].[name, join(' ', patternsToMatch)]" -o tsv
  answers
}

allow_front_door() {
  local now web new id
  write; check_enforced
  now="$(rules)"
  web="$(az containerapp show "${WEB[@]}" --query properties.configuration.ingress.ipSecurityRestrictions -o json)"
  (( $(front_door_rules <<<"$web") > 100 )) || fail "the web app's Front Door ranges look incomplete"
  # Keep every rule catalog has; add the web app's Front Door ranges it lacks.
  new="$(jq -c --argjson web "$web" '(map(.ipAddressRange)) as $have
    | . + [$web[] | select((.name | startswith("afd-")) and (.ipAddressRange as $r | $have | index($r) | not))]' <<<"$now")"
  id="$(az containerapp show "${CATALOG[@]}" --query id -o tsv)"
  az rest -m patch -u "https://management.azure.com$id?api-version=2024-03-01" \
    --body "$(jq -c '{properties: {configuration: {ingress: {ipSecurityRestrictions: .}}}}' <<<"$new")" -o none
  for _ in $(seq 30); do [[ "$(rules | jq length)" == "$(jq length <<<"$new")" ]] && break; sleep 10; done
  jq -e --argjson after "$(rules)" 'all(.[]; .ipAddressRange as $r | ($after | map(.ipAddressRange) | index($r)) != null)' \
    <<<"$new" >/dev/null || fail "catalog's ingress rules are not what was sent; check them now"
  echo "catalog ingress: $(rules | jq length) rules"
  answers
}

origin() { # name host state weight
  local verb=create
  az afd origin show "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$1" -o none 2>/dev/null && verb=update
  az afd origin "$verb" "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$1" --host-name "$2" --origin-host-header "$2" \
    --priority 1 --weight "$4" --enabled-state "$3" --http-port 80 --https-port 443 --enforce-certificate-name-check true -o none
}

route() { # name origin-group patterns
  local verb=create domain
  domain="$(az afd custom-domain show "${FD[@]}" --custom-domain-name "$DOMAIN" --query id -o tsv)"
  az afd route show "${FD[@]}" --endpoint-name "$ENDPOINT" --route-name "$1" -o none 2>/dev/null && verb=update
  # As craves-api-route: HTTPS to the origin, no caching, no rule sets; the WAF covers the whole domain.
  az afd route "$verb" "${FD[@]}" --endpoint-name "$ENDPOINT" --route-name "$1" --origin-group "$2" --patterns-to-match "$3" \
    --formatted-custom-domains "[{\"id\":\"$domain\"}]" --supported-protocols '["Http","Https"]' --forwarding-protocol HttpsOnly \
    --https-redirect Enabled --link-to-default-domain Enabled --enabled-state Enabled -o none
}

routes() {
  write
  az afd origin-group show "${FD[@]}" --origin-group-name "$GROUP" -o none 2>/dev/null \
    || az afd origin-group create "${FD[@]}" --origin-group-name "$GROUP" --probe-request-type GET --probe-protocol Https \
      --probe-path /api/v1/catalog/kitchens --probe-interval-in-seconds 120 --sample-size 4 --successful-samples-required 3 \
      --additional-latency-in-milliseconds 1000 -o none # wide, so the weights decide the split, not probe latency
  origin "$VIA_APIM" "$APIM_HOST" Enabled 1000
  origin "$DIRECT" "$(az containerapp show "${CATALOG[@]}" --query properties.configuration.ingress.fqdn -o tsv)" Disabled 1
  route "$KEEP_ROUTE" craves-api-origin-group "$KEEP_PATTERNS" # first, so internal and admin paths never leave APIM
  route "$ROUTE" "$GROUP" "$DIRECT_PATTERNS"
  plan
}

weight() {
  local n=${1:-}
  write
  [[ "$n" =~ ^[0-9]+$ ]] && (( n <= 1000 )) || fail "weight is 0 to 1000"
  # Enable before disabling, so the group never has no origin.
  if (( n == 0 )); then
    az afd origin update "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$VIA_APIM" --enabled-state Enabled --weight 1000 -o none
    az afd origin update "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$DIRECT" --enabled-state Disabled -o none
  else
    (( $(rules | front_door_rules) > 100 )) || fail "catalog does not accept Front Door yet; run allow-front-door first"
    check_enforced
    az afd origin update "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$DIRECT" --enabled-state Enabled --weight "$n" -o none
    if (( n == 1000 )); then
      az afd origin update "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$VIA_APIM" --enabled-state Disabled -o none
    else
      az afd origin update "${FD[@]}" --origin-group-name "$GROUP" --origin-name "$VIA_APIM" --enabled-state Enabled --weight $((1000 - n)) -o none
    fi
  fi
  plan
}

[[ "$(az account show --query id -o tsv)" == "$SUB" ]] || fail "switch to subscription $SUB first"
case "${1:-plan}" in
  plan) plan ;;
  allow-front-door) allow_front_door ;;
  routes) routes ;;
  weight) weight "${2:-}" ;;
  *) fail "usage: $0 [plan | allow-front-door | routes | weight N]" ;;
esac
