#!/usr/bin/env bash
set -euo pipefail

: "${CRAVES_BASE_URL:=https://craves.in}"
: "${CRAVES_TEST_LATITUDE:=17.4483}"
: "${CRAVES_TEST_LONGITUDE:=78.3915}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for command in curl jq; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

BASE_URL="${CRAVES_BASE_URL%/}"
ORIGIN="$BASE_URL"
BODY_FILE="/tmp/craves-location-runtime-smoke-body.json"
HEADERS_FILE="/tmp/craves-location-runtime-smoke-headers.txt"
rm -f "$BODY_FILE" "$HEADERS_FILE"

HTTP_CODE="$(curl \
  --silent \
  --show-error \
  --location \
  --max-time 30 \
  --dump-header "$HEADERS_FILE" \
  --output "$BODY_FILE" \
  --write-out '%{http_code}' \
  --request POST \
  --header "Origin: $ORIGIN" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data "$(jq -nc \
    --argjson latitude "$CRAVES_TEST_LATITUDE" \
    --argjson longitude "$CRAVES_TEST_LONGITUDE" \
    '{latitude:$latitude,longitude:$longitude}')" \
  "$BASE_URL/api/location/reverse-geocode")"

[[ "$HTTP_CODE" == "200" ]] || {
  cat "$BODY_FILE" >&2 || true
  fail "Live reverse-geocoding BFF returned HTTP $HTTP_CODE"
}

jq -e '
  (.formattedAddress | type == "string" and length > 0) and
  (.preciseHouseNumber | type == "boolean") and
  ((has("latitude") or has("longitude")) | not)
' "$BODY_FILE" >/dev/null || {
  cat "$BODY_FILE" >&2
  fail "Live reverse-geocoding response did not match the sanitized Craves contract"
}

CACHE_CONTROL="$(tr -d '\r' < "$HEADERS_FILE" | awk -F': ' 'tolower($1)=="cache-control" {print tolower($2)}' | tail -1)"
[[ "$CACHE_CONTROL" == *"no-store"* ]] || fail "Reverse-geocoding response must be no-store"

FORMATTED_ADDRESS="$(jq -r '.formattedAddress' "$BODY_FILE")"
AREA="$(jq -r '.area // empty' "$BODY_FILE")"
CITY="$(jq -r '.city // empty' "$BODY_FILE")"
DISTRICT="$(jq -r '.district // empty' "$BODY_FILE")"
STATE="$(jq -r '.state // empty' "$BODY_FILE")"
POSTAL_CODE="$(jq -r '.postalCode // empty' "$BODY_FILE")"

SEARCH_QUERY="${CRAVES_TEST_SEARCH_QUERY:-Madhapur}"
HTTP_CODE="$(curl \
  --silent \
  --show-error \
  --max-time 30 \
  --output "$BODY_FILE" \
  --write-out '%{http_code}' \
  --request POST \
  --header "Origin: $ORIGIN" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data "$(jq -nc \
    --arg query "$SEARCH_QUERY" \
    --argjson latitude "$CRAVES_TEST_LATITUDE" \
    --argjson longitude "$CRAVES_TEST_LONGITUDE" \
    '{query:$query,latitude:$latitude,longitude:$longitude}')" \
  "$BASE_URL/api/location/search")"
[[ "$HTTP_CODE" == "200" ]] || fail "Live location search BFF returned HTTP $HTTP_CODE"
jq -e '
  (.results | type == "array" and length > 0) and
  all(.results[]; (.formattedAddress | type == "string") and (.latitude | type == "number") and (.longitude | type == "number"))
' "$BODY_FILE" >/dev/null || fail "Live location search returned no usable suggestions for $SEARCH_QUERY"
FIRST_SUGGESTION="$(jq -r '.results[0].formattedAddress' "$BODY_FILE")"
SUGGESTION_COUNT="$(jq -r '.results | length' "$BODY_FILE")"

IMAGE_FILE="/tmp/craves-location-runtime-smoke-map.bin"
IMAGE_RESULT="$(curl \
  --silent \
  --show-error \
  --max-time 30 \
  --output "$IMAGE_FILE" \
  --write-out '%{http_code} %{content_type}' \
  --header "Referer: $ORIGIN/profile/addresses" \
  --header 'Sec-Fetch-Site: same-origin' \
  "$BASE_URL/api/location/map-image?latitude=$CRAVES_TEST_LATITUDE&longitude=$CRAVES_TEST_LONGITUDE&zoom=17")"
[[ "$IMAGE_RESULT" == "200 image/png" || "$IMAGE_RESULT" == "200 image/jpeg" ]] \
  || fail "Live static map returned $IMAGE_RESULT"
IMAGE_BYTES="$(wc -c < "$IMAGE_FILE" | tr -d ' ')"
[[ "$IMAGE_BYTES" -gt 1000 ]] || fail "Live static map image is unexpectedly small ($IMAGE_BYTES bytes)"

cat <<EOF
Live Craves location smoke passed.
Base URL: $BASE_URL
Formatted address: $FORMATTED_ADDRESS
Area: ${AREA:-provider-not-returned}
City: ${CITY:-provider-not-returned}
District: ${DISTRICT:-provider-not-returned}
State: ${STATE:-provider-not-returned}
Pincode: ${POSTAL_CODE:-provider-not-returned}
Raw latitude/longitude fields exposed to browser response: no
Cache-Control includes no-store: yes
Search "$SEARCH_QUERY": $SUGGESTION_COUNT suggestions, first: $FIRST_SUGGESTION
Static map: $IMAGE_RESULT, $IMAGE_BYTES bytes
EOF
