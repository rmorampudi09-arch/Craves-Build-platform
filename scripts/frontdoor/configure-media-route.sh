#!/usr/bin/env bash
# Serves dish photos through the existing craves.in Front Door endpoint instead of straight from blob storage.
#
#   OPERATION=inspect  read-only: finds the Front Door endpoint serving craves.in and reports the /media route.
#   OPERATION=apply    creates/updates the blob origin and a cached /media/* route on the same domains, proves a
#                      real photo loads through it, then points Catalog at it (CRAVES_MEDIA_PUBLIC_BASE_URL).
#                      Catalog's photo relocator then rewrites stored photo links (and shrinks oversized photos)
#                      on its next start. Run apply only after the Catalog release that contains that change.
set -Eeuo pipefail
set +x

OPERATION="${OPERATION:-inspect}"
CONFIRM="${CONFIRM:-false}"
RG="${RESOURCE_GROUP:-rg-craves-prodlow-centralindia}"
SITE_HOST="${SITE_HOST:-craves.in}"
MEDIA_ACCOUNT="${MEDIA_ACCOUNT:-stcravesmediakmqgfy}"
MEDIA_CONTAINER="${MEDIA_CONTAINER:-media}"
CATALOG_APP="${CATALOG_APP:-ca-craves-catalog-service-prodlo}"
ORIGIN_GROUP="${MEDIA_ORIGIN_GROUP:-craves-media-origin-group}"
ORIGIN="${MEDIA_ORIGIN:-craves-media-origin}"
ROUTE="${MEDIA_ROUTE:-craves-media-route}"
DISCOVERY_POINT="${DISCOVERY_POINT:-latitude=17.3850&longitude=78.4867}"

MEDIA_HOST="$MEDIA_ACCOUNT.blob.core.windows.net"
PUBLIC_BASE="https://$SITE_HOST/$MEDIA_CONTAINER"
BLOB_BASE="https://$MEDIA_HOST/$MEDIA_CONTAINER"

fail() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }
for tool in az jq curl; do command -v "$tool" >/dev/null || fail "$tool is required"; done
case "$OPERATION" in inspect|apply) ;; *) fail "OPERATION must be inspect or apply" ;; esac
az account show >/dev/null
az extension add -n containerapp --upgrade --yes --only-show-errors >/dev/null 2>&1 || true

# --- Find the profile, endpoint and catch-all route that serve SITE_HOST today -----------------------------
PROFILE="" ENDPOINT="" WEB_ROUTE_JSON=""
for profile in ${FRONT_DOOR_PROFILE:-$(az afd profile list -g "$RG" --query '[].name' -o tsv)}; do
  domain_id="$(az afd custom-domain list -g "$RG" --profile-name "$profile" -o json \
    | jq -r --arg h "$SITE_HOST" 'map(select((.hostName // .properties.hostName) == $h)) | .[0].id // empty')"
  [[ -n "$domain_id" ]] || continue
  for endpoint in $(az afd endpoint list -g "$RG" --profile-name "$profile" --query '[].name' -o tsv); do
    route="$(az afd route list -g "$RG" --profile-name "$profile" --endpoint-name "$endpoint" -o json | jq -c --arg d "${domain_id,,}" '
      map(select(((.patternsToMatch // .properties.patternsToMatch // []) | index("/*")) != null
        and ((.customDomains // .properties.customDomains // []) | map(.id | ascii_downcase) | index($d)) != null)) | .[0] // empty')"
    if [[ -n "$route" ]]; then PROFILE="$profile" ENDPOINT="$endpoint" WEB_ROUTE_JSON="$route"; break 2; fi
  done
done
[[ -n "$PROFILE" ]] || fail "No Front Door route in $RG serves https://$SITE_HOST/* (set FRONT_DOOR_PROFILE / RESOURCE_GROUP)"
DOMAINS="$(jq -c '[(.customDomains // .properties.customDomains // [])[] | {id}]' <<<"$WEB_ROUTE_JSON")"
info "Front Door profile=$PROFILE endpoint=$ENDPOINT site route=$(jq -r .name <<<"$WEB_ROUTE_JSON") domains=$(jq length <<<"$DOMAINS")"

# --- A real dish photo, taken from the public discovery API ---------------------------------------------------
discovery() { curl -fsS --max-time 30 "https://$SITE_HOST/api/discovery/menu-items?$DISCOVERY_POINT&radiusMeters=50000&size=50" || true; }
sample_path() { # awk, not head: with pipefail an early exit would fail the pipeline
  grep -oE "https://($MEDIA_HOST|$SITE_HOST)/$MEDIA_CONTAINER/[^\"]+" <<<"$(discovery)" | awk 'NR==1' | sed -E "s#^https://[^/]+/$MEDIA_CONTAINER/##"
}
# Blob URLs from Catalog encode "/" as %2F; the Front Door path uses plain segments, like Catalog will.
SAMPLE="$(sample_path || true)"
SAMPLE="${SAMPLE//%2F//}"
[[ -n "$SAMPLE" ]] && info "Sample photo: $SAMPLE" || info "No dish photo found through the discovery API"

check_photo() { # prints HTTP status, content type and Front Door cache state
  curl -sS -o /dev/null --max-time 30 -D - "$1" | tr -d '\r' | awk -F': ' '
    tolower($1) ~ /^http\// {split($0,s," "); code=s[2]} tolower($1)=="content-type" {ct=$2} tolower($1)=="x-cache" {xc=$2}
    END {print code, ct, (xc==""?"-":xc)}'
}

route_exists() { az afd route show -g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ROUTE" >/dev/null 2>&1; }
current_base() {
  az containerapp show -g "$RG" -n "$CATALOG_APP" -o json \
    | jq -r '[.properties.template.containers[].env[]? | select(.name=="CRAVES_MEDIA_PUBLIC_BASE_URL") | .value][0] // ""'
}

if [[ "$OPERATION" == inspect ]]; then
  route_exists && info "Route $ROUTE exists" || info "Route $ROUTE does not exist yet"
  info "Catalog CRAVES_MEDIA_PUBLIC_BASE_URL='$(current_base)'"
  [[ -z "$SAMPLE" ]] || info "Blob direct: $(check_photo "$BLOB_BASE/$SAMPLE")   Front Door: $(check_photo "$PUBLIC_BASE/$SAMPLE")"
  exit 0
fi

[[ "${CONFIRM,,}" == true ]] || fail "Set CONFIRM=true for the production Front Door and Catalog change"
[[ -n "$SAMPLE" ]] || fail "A dish photo is needed to prove the route before Catalog is switched"
curl -fsS -o /dev/null --max-time 30 "$BLOB_BASE/$SAMPLE" || fail "Sample photo is not publicly readable from $MEDIA_HOST"

# --- Origin group, origin and cached route ---------------------------------------------------------------------
# One origin only, so no health probe: a failing probe on a single origin would only add noise.
az afd origin-group show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" >/dev/null 2>&1 \
  || az afd origin-group create -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" \
       --sample-size 4 --successful-samples-required 3 --additional-latency-in-milliseconds 50 --only-show-errors >/dev/null

origin_args=(-g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" --origin-name "$ORIGIN"
  --host-name "$MEDIA_HOST" --origin-host-header "$MEDIA_HOST" --priority 1 --weight 1000 --enabled-state Enabled
  --http-port 80 --https-port 443 --enforce-certificate-name-check true --only-show-errors)
if az afd origin show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" --origin-name "$ORIGIN" >/dev/null 2>&1; then
  az afd origin update "${origin_args[@]}" >/dev/null
else
  az afd origin create "${origin_args[@]}" >/dev/null
fi

OG_ID="$(az afd origin-group show -g "$RG" --profile-name "$PROFILE" --origin-group-name "$ORIGIN_GROUP" --query id -o tsv)"
# Photos are already compressed; Catalog stores them with Cache-Control "public, max-age=31536000, immutable".
CACHE='{compression-settings:{content-types-to-compress:[image/svg+xml],is-compression-enabled:false},query-string-caching-behavior:IgnoreQueryString}'
route_args=(-g "$RG" --profile-name "$PROFILE" --endpoint-name "$ENDPOINT" --route-name "$ROUTE"
  --origin-group "$OG_ID" --patterns-to-match "/$MEDIA_CONTAINER/*" --supported-protocols Http Https
  --forwarding-protocol HttpsOnly --https-redirect Enabled --link-to-default-domain Enabled
  --formatted-custom-domains "$DOMAINS" --cache-configuration "$CACHE" --enabled-state Enabled --only-show-errors)
if route_exists; then az afd route update "${route_args[@]}" >/dev/null; else az afd route create "${route_args[@]}" >/dev/null; fi
info "Route $ROUTE configured for /$MEDIA_CONTAINER/* on $(jq length <<<"$DOMAINS") domain(s)"

# --- Prove a real photo loads through Front Door before Catalog starts handing out the new links ---------------
ok=""
for attempt in $(seq 1 30); do # Front Door changes can take several minutes to reach every edge
  read -r code type cache <<<"$(check_photo "$PUBLIC_BASE/$SAMPLE")"
  if [[ "$code" == 200 && "$type" == image/* ]]; then ok=1; info "Front Door serves the photo ($type, x-cache=$cache)"; break; fi
  info "Waiting for the route (attempt $attempt: HTTP ${code:-none} ${type:-})"; sleep 30
done
[[ -n "$ok" ]] || fail "https://$SITE_HOST/$MEDIA_CONTAINER/... did not return the photo; Catalog was not switched"

# --- Point Catalog at the Front Door path; its relocator rewrites existing links on start -----------------------
if [[ "$(current_base)" != "$PUBLIC_BASE" ]]; then
  az containerapp update -g "$RG" -n "$CATALOG_APP" --set-env-vars "CRAVES_MEDIA_PUBLIC_BASE_URL=$PUBLIC_BASE" --only-show-errors -o none
  info "Catalog CRAVES_MEDIA_PUBLIC_BASE_URL set to $PUBLIC_BASE (new revision rolling out)"
fi

moved=""
for attempt in $(seq 1 40); do
  if grep -q "https://$SITE_HOST/$MEDIA_CONTAINER/" <<<"$(discovery)"; then moved=1; break; fi
  info "Waiting for Catalog to rewrite photo links (attempt $attempt)"; sleep 30
done
[[ -n "$moved" ]] || fail "Catalog is still returning blob links; check the Catalog revision logs for 'Relocated'"
NEW_SAMPLE="$(sample_path || true)"
info "Photo through Front Door: $(check_photo "$PUBLIC_BASE/$NEW_SAMPLE")"
echo "SUCCESS: dish photos are served from $PUBLIC_BASE through Front Door."
