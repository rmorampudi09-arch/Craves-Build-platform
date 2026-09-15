#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ACTION="${ACTION:-discover}"
RG="${RESOURCE_GROUP:-rg-craves-prodlow-centralindia}"
PROFILE="${FRONT_DOOR_PROFILE:-afd-craves-prodlow}"
ADMIN_APP="${ADMIN_CONTAINER_APP:-ca-craves-admin-web-prodlow}"
ADMIN_HOSTNAME="${ADMIN_HOSTNAME:-admin.craves.in}"
ADMIN_DOMAIN_RESOURCE="${ADMIN_DOMAIN_RESOURCE:-admin-craves-in}"
ADMIN_ORIGIN_GROUP="${ADMIN_ORIGIN_GROUP:-craves-admin-origin-group}"
ADMIN_ORIGIN="${ADMIN_ORIGIN:-craves-admin-origin}"
ADMIN_ROUTE="${ADMIN_ROUTE:-craves-admin-route}"
ADMIN_RULESET="${ADMIN_RULESET:-cravesadminsecurityheaders}"
ADMIN_RULE="${ADMIN_RULE:-adminsecurityheaders}"
ADMIN_SECURITY_POLICY="${ADMIN_SECURITY_POLICY:-craves-admin-security}"
CONFIRM_WRITE="${CONFIRM_FRONTDOOR_WRITE:-false}"
OUT="${ARTIFACT_DIR:-./craves-admin-frontdoor-status}"
mkdir -p "$OUT"

fail(){ echo "ERROR: $*" >&2; exit 1; }
info(){ echo "INFO: $*"; }

case "$ACTION" in discover|prepare|associate|smoke) ;; *) fail "Unsupported ACTION=$ACTION" ;; esac
for cmd in az jq curl dig; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done
az account show >/dev/null
az extension add -n cdn --upgrade --yes --only-show-errors >/dev/null
az extension add -n front-door --upgrade --yes --only-show-errors >/dev/null || true

SUB="$(az account show --query id -o tsv)"
SUFFIX="$(tr -d '-' <<<"$SUB" | cut -c1-8 | tr '[:upper:]' '[:lower:]')"
ENDPOINT="${FRONT_DOOR_ENDPOINT_NAME:-craves-prodlow-$SUFFIX}"
WAF="${WAF_POLICY_NAME:-craveswaf$SUFFIX}"

require_write(){
  [[ "$CONFIRM_WRITE" == true || "$CONFIRM_WRITE" == True ]] || fail "Mutation refused. Set CONFIRM_FRONTDOOR_WRITE=true."
}

require_existing_platform(){
  [[ "$(az afd profile show -g "$RG" --profile-name "$PROFILE" --query sku.name -o tsv)" == Premium_AzureFrontDoor ]] || fail "Expected existing Premium Front Door profile $PROFILE"
  az afd endpoint show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" >/dev/null || fail "Front Door endpoint $ENDPOINT not found"
  az network front-door waf-policy show -g "$RG" -n "$WAF" >/dev/null || fail "Existing WAF policy $WAF not found"
}

load_admin_origin(){
  local json latest ready running external image
  json="$(az containerapp show -g "$RG" -n "$ADMIN_APP" -o json)"
  ADMIN_ORIGIN_FQDN="$(jq -r '.properties.configuration.ingress.fqdn // empty' <<<"$json")"
  latest="$(jq -r '.properties.latestRevisionName // empty' <<<"$json")"
  ready="$(jq -r '.properties.latestReadyRevisionName // empty' <<<"$json")"
  running="$(jq -r '.properties.runningStatus // empty' <<<"$json")"
  external="$(jq -r '.properties.configuration.ingress.external // false' <<<"$json")"
  image="$(jq -r '.properties.template.containers[0].image // empty' <<<"$json")"
  [[ -n "$ADMIN_ORIGIN_FQDN" ]] || fail "$ADMIN_APP has no ingress FQDN"
  [[ "$external" == true ]] || fail "$ADMIN_APP external ingress is not enabled"
  [[ "$latest" == "$ready" ]] || fail "$ADMIN_APP latest revision is not ready: latest=$latest ready=$ready"
  [[ "$running" == Running ]] || fail "$ADMIN_APP is not Running: $running"
  [[ "$image" == */craves/admin-web:* ]] || fail "$ADMIN_APP is not using the dedicated admin image: $image"
  info "Admin origin ready: $ADMIN_ORIGIN_FQDN revision=$ready image=$image"
}

ensure_admin_headers(){
  az afd rule-set show -g "$RG" --profile-name "$PROFILE" --rule-set-name "$ADMIN_RULESET" >/dev/null 2>&1 || \
    az afd rule-set create -g "$RG" --profile-name "$PROFILE" --rule-set-name "$ADMIN_RULESET" --only-show-errors >/dev/null

  local uri body
  uri="https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Cdn/profiles/${PROFILE}/ruleSets/${ADMIN_RULESET}/rules/${ADMIN_RULE}?api-version=2025-04-15"
  body="$(jq -nc '{properties:{order:1,conditions:[],actions:[
    {name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:"Strict-Transport-Security",typeName:"DeliveryRuleHeaderActionParameters",value:"max-age=31536000; includeSubDomains"}},
    {name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:"X-Content-Type-Options",typeName:"DeliveryRuleHeaderActionParameters",value:"nosniff"}},
    {name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:"X-Frame-Options",typeName:"DeliveryRuleHeaderActionParameters",value:"DENY"}},
    {name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:"Referrer-Policy",typeName:"DeliveryRuleHeaderActionParameters",value:"no-referrer"}},
    {name:"ModifyResponseHeader",parameters:{headerAction:"Overwrite",headerName:"Permissions-Policy",typeName:"DeliveryRuleHeaderActionParameters",value:"camera=(), microphone=(), geolocation=()"}}
  ],matchProcessingBehavior:"Continue"}}')"
  az rest --method put --uri "$uri" --headers Content-Type=application/json --body "$body" --only-show-errors >/dev/null
}

ensure_admin_origin(){
  az afd origin-group show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" >/dev/null 2>&1 || \
    az afd origin-group create -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" \
      --probe-request-type HEAD --probe-protocol Https --probe-path /admin --probe-interval-in-seconds 120 \
      --sample-size 4 --successful-samples-required 3 --additional-latency-in-milliseconds 50 --only-show-errors >/dev/null

  if az afd origin show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" --origin-name "$ADMIN_ORIGIN" >/dev/null 2>&1; then
    az afd origin update -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" --origin-name "$ADMIN_ORIGIN" \
      --host-name "$ADMIN_ORIGIN_FQDN" --origin-host-header "$ADMIN_ORIGIN_FQDN" --priority 1 --weight 1000 \
      --enabled-state Enabled --http-port 80 --https-port 443 --enforce-certificate-name-check true --only-show-errors >/dev/null
  else
    az afd origin create -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" --origin-name "$ADMIN_ORIGIN" \
      --host-name "$ADMIN_ORIGIN_FQDN" --origin-host-header "$ADMIN_ORIGIN_FQDN" --priority 1 --weight 1000 \
      --enabled-state Enabled --http-port 80 --https-port 443 --enforce-certificate-name-check true --only-show-errors >/dev/null
  fi

  ensure_admin_headers
}

ensure_admin_route(){
  local domain_id ogid rsid rules domains
  domain_id="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query id -o tsv)"
  ogid="$(az afd origin-group show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" --query id -o tsv)"
  rsid="$(az afd rule-set show -g "$RG" --profile-name "$PROFILE" --rule-set-name "$ADMIN_RULESET" --query id -o tsv)"
  rules="[{id:${rsid}}]"
  domains="[{id:${domain_id}}]"

  if az afd route show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ADMIN_ROUTE" >/dev/null 2>&1; then
    az afd route update -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ADMIN_ROUTE" \
      --origin-group "$ogid" --patterns-to-match '/*' --supported-protocols Http Https --forwarding-protocol HttpsOnly \
      --https-redirect Enabled --link-to-default-domain Disabled --formatted-rule-sets "$rules" --formatted-custom-domains "$domains" \
      --enabled-state Enabled --only-show-errors >/dev/null
  else
    az afd route create -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ADMIN_ROUTE" \
      --origin-group "$ogid" --patterns-to-match '/*' --supported-protocols Http Https --forwarding-protocol HttpsOnly \
      --https-redirect Enabled --link-to-default-domain Disabled --formatted-rule-sets "$rules" --formatted-custom-domains "$domains" \
      --enabled-state Enabled --only-show-errors >/dev/null
  fi
}

ensure_admin_domain(){
  if ! az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" >/dev/null 2>&1; then
    az afd custom-domain create -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" \
      --host-name "$ADMIN_HOSTNAME" --minimum-tls-version TLS12 --certificate-type ManagedCertificate --no-wait --only-show-errors >/dev/null
  fi

  local token provisioning
  token=''
  provisioning=''
  for _ in $(seq 1 40); do
    token="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query validationProperties.validationToken -o tsv 2>/dev/null || true)"
    provisioning="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query provisioningState -o tsv 2>/dev/null || true)"
    [[ "$provisioning" == Failed ]] && fail "Admin custom-domain provisioning failed"
    [[ -n "$token" ]] && return
    sleep 5
  done
  fail "Admin custom-domain validation token was not issued"
}

write_dns_handoff(){
  local token endpoint_host cname txt
  token="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query validationProperties.validationToken -o tsv 2>/dev/null || true)"
  endpoint_host="$(az afd endpoint show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --query hostName -o tsv)"
  cname="$(dig +short CNAME "$ADMIN_HOSTNAME" | sed 's/\.$//' | head -n1 || true)"
  txt="$(dig +short TXT "_dnsauth.$ADMIN_HOSTNAME" | tr -d '"' | head -n1 || true)"
  cat > "$OUT/admin-frontdoor-dns-required.md" <<DNS
# Craves Admin Portal DNS

Required public DNS records for the dedicated admin hostname:

- CNAME admin -> $endpoint_host
- TXT _dnsauth.admin -> $token

Current observed values:

- CNAME $ADMIN_HOSTNAME -> ${cname:-<missing>}
- TXT _dnsauth.$ADMIN_HOSTNAME -> ${txt:-<missing>}

Do not change craves.in, www.craves.in, or api.craves.in for this rollout.
DNS
  cat "$OUT/admin-frontdoor-dns-required.md"
}

require_domain_approved(){
  local state provisioning
  state="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query domainValidationState -o tsv 2>/dev/null || true)"
  provisioning="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query provisioningState -o tsv 2>/dev/null || true)"
  [[ "$provisioning" == Succeeded ]] || fail "Admin custom domain provisioning is not complete: $provisioning"
  [[ "$state" == Approved ]] || fail "Admin domain is not Azure-approved yet: $state. Apply the DNS handoff first."
}

associate_admin_domain(){
  require_domain_approved
  local domain_id waf_id uri body
  domain_id="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query id -o tsv)"
  ensure_admin_route

  waf_id="$(az network front-door waf-policy show -g "$RG" -n "$WAF" --query id -o tsv)"
  uri="https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Cdn/profiles/${PROFILE}/securityPolicies/${ADMIN_SECURITY_POLICY}?api-version=2025-04-15"
  body="$(jq -nc --arg waf "$waf_id" --arg domain "$domain_id" '{properties:{parameters:{type:"WebApplicationFirewall",wafPolicy:{id:$waf},associations:[{domains:[{id:$domain}],patternsToMatch:["/*"]}]}}}')"
  az rest --method put --uri "$uri" --headers Content-Type=application/json --body "$body" --only-show-errors >/dev/null
}

http_code_retry(){
  local url="$1" expected_regex="$2" headers_file="${3:-}" code=''
  for _ in $(seq 1 80); do
    if [[ -n "$headers_file" ]]; then
      code="$(curl -sS -D "$headers_file" -o /dev/null -w '%{http_code}' --max-time 30 "$url" || true)"
    else
      code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$url" || true)"
    fi
    [[ "$code" =~ $expected_regex ]] && { printf '%s' "$code"; return 0; }
    sleep 15
  done
  printf '%s' "$code"
  return 1
}

smoke(){
  require_domain_approved
  local domain_id associated origin_code admin_code signin_code me_code root_code www_code headers cname endpoint_host
  domain_id="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" --query id -o tsv)"
  associated="$(az afd route show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ADMIN_ROUTE" -o json | jq -r --arg id "$domain_id" '((.customDomains // .properties.customDomains // []) | map(.id) | index($id)) != null')"
  [[ "$associated" == true ]] || fail "$ADMIN_HOSTNAME is not associated with route $ADMIN_ROUTE"

  endpoint_host="$(az afd endpoint show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --query hostName -o tsv)"
  cname="$(dig +short CNAME "$ADMIN_HOSTNAME" | sed 's/\.$//' | head -n1 || true)"
  [[ "$cname" == "$endpoint_host" ]] || fail "$ADMIN_HOSTNAME CNAME mismatch: expected=$endpoint_host actual=${cname:-missing}"

  origin_code="$(http_code_retry "https://$ADMIN_ORIGIN_FQDN/admin" '^(200|301|302|307|308)$')" || fail "Admin origin /admin failed: HTTP=$origin_code"

  headers="$OUT/admin-public-headers.txt"
  admin_code="$(http_code_retry "https://$ADMIN_HOSTNAME/admin" '^(200|301|302|307|308)$' "$headers")" || fail "Public admin /admin failed: HTTP=$admin_code"
  grep -qi '^x-azure-ref:' "$headers" || fail "Public admin response is not proven to traverse Azure Front Door"
  grep -qi '^strict-transport-security:' "$headers" || fail "Admin HSTS header missing"
  grep -qi '^x-content-type-options:[[:space:]]*nosniff' "$headers" || fail "Admin nosniff header missing"
  grep -qi '^x-frame-options:[[:space:]]*DENY' "$headers" || fail "Admin frame-deny header missing"

  signin_code="$(http_code_retry "https://$ADMIN_HOSTNAME/sign-in" '^(200|301|302|307|308)$')" || fail "Public admin sign-in failed: HTTP=$signin_code"

  me_code="$(http_code_retry "https://$ADMIN_HOSTNAME/api/admin/me" '^(401|403)$')" || fail "Unauthenticated admin identity endpoint must deny access: HTTP=$me_code"

  root_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 https://craves.in/ || true)"
  [[ "$root_code" =~ ^(200|301|302|307|308)$ ]] || fail "Customer apex regression: HTTP=$root_code"
  www_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 https://www.craves.in/ || true)"
  [[ "$www_code" =~ ^(200|301|302|307|308)$ ]] || fail "Customer www regression: HTTP=$www_code"

  info "Admin edge smoke passed: /admin=$admin_code /sign-in=$signin_code /api/admin/me=$me_code; customer apex=$root_code www=$www_code"
}

write_status(){
  local endpoint_host domain='{}' route='{}' origin='{}' policy='{}'
  endpoint_host="$(az afd endpoint show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --query hostName -o tsv 2>/dev/null || true)"
  domain="$(az afd custom-domain show -g "$RG" --profile-name "$PROFILE" --custom-domain-name "$ADMIN_DOMAIN_RESOURCE" -o json 2>/dev/null || echo '{}')"
  route="$(az afd route show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ADMIN_ROUTE" -o json 2>/dev/null || echo '{}')"
  origin="$(az afd origin show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ADMIN_ORIGIN_GROUP" --origin-name "$ADMIN_ORIGIN" -o json 2>/dev/null || echo '{}')"
  policy="$(az rest --method get --uri "https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Cdn/profiles/${PROFILE}/securityPolicies/${ADMIN_SECURITY_POLICY}?api-version=2025-04-15" --only-show-errors 2>/dev/null || echo '{}')"
  jq -n --arg action "$ACTION" --arg hostname "$ADMIN_HOSTNAME" --arg endpoint "$endpoint_host" --arg originFqdn "${ADMIN_ORIGIN_FQDN:-}" --argjson domain "$domain" --argjson route "$route" --argjson origin "$origin" --argjson policy "$policy" '{schemaVersion:1,action:$action,hostname:$hostname,endpointHost:$endpoint,originFqdn:$originFqdn,customDomain:$domain,route:$route,origin:$origin,securityPolicy:$policy}' > "$OUT/admin-frontdoor-status.json"
  jq . "$OUT/admin-frontdoor-status.json"
}

require_existing_platform
load_admin_origin

case "$ACTION" in
  prepare)
    require_write
    ensure_admin_origin
    ensure_admin_domain
    write_dns_handoff
    ;;
  associate)
    require_write
    ensure_admin_origin
    ensure_admin_domain
    write_dns_handoff
    associate_admin_domain
    smoke
    ;;
  smoke)
    smoke
    ;;
  discover)
    write_dns_handoff || true
    ;;
esac

write_status
