# CRAVES Ola Maps migration: mobile (APK) API handover

Date: 2026-10-09
Audience: Android/APK developer (`apps/mobile`)
Scope: location/address APIs only. Live order tracking is not part of this change.

## 1. TL;DR for the APK

| Question | Answer |
|---|---|
| Did the APK ever call Azure Maps directly? | No. The APK only called the CRAVES endpoint `POST /api/v1/customer/addresses/reverse-geocode`; that endpoint called Azure Maps server-side. |
| Does the APK have to change? | **No.** `reverse-geocode` keeps the same URL, method, request and response contract. It is now served by Ola Maps (Krutrim). |
| What is new? | An optional endpoint for Swiggy/Zomato-style typeahead: `POST /api/v1/customer/addresses/location-search`. |
| Any keys for the APK? | **No.** The Ola key exists only on the CRAVES servers. Never call `api.olamaps.io` from the app and never embed an Ola key. |
| Saved addresses created with Azure Maps? | Unchanged and valid. Latitude/longitude are provider-neutral WGS84 decimal degrees; nothing is re-geocoded. |
| Limits? | Per signed-in customer: 60 `location-search` and 30 `reverse-geocode` calls per minute. Beyond that the API answers `429 LOCATION_RATE_LIMITED` with `Retry-After`. |

## 2. Architecture change

Old:

```text
APK -> APIM (api.craves.in) -> User/Chef Service -> Azure Maps reverseGeocode (managed identity)
Web -> Next.js BFF /api/location/* -> Azure Maps geocode / reverseGeocode / map/static (managed identity)
```

New:

```text
APK -> APIM (api.craves.in) -> User/Chef Service -> Ola Maps places/v1/reverse-geocode, places/v1/autocomplete
Web -> Next.js BFF /api/location/* -> Ola Maps places/v1/autocomplete, places/v1/reverse-geocode, tiles/v1 static map
```

The Ola key (`OLA_MAPS_API_KEY`) is a server-side secret on the User/Chef and customer-web Container Apps (`secretref:ola-maps-api-key`). Provider-specific parsing lives only in `services/user-chef-service/.../location/OlaMapsClient.java` and `apps/customer-web-next/src/lib/server/ola-maps.ts`; clients only see CRAVES contracts.

## 3. API replacement table

| Feature | Old Azure API / endpoint | New CRAVES / Ola endpoint | Method | Request | Response | APK change required |
|---|---|---|---|---|---|---|
| Reverse geocode (GPS point -> address) | CRAVES `/api/v1/customer/addresses/reverse-geocode` -> Azure `GET atlas.microsoft.com/reverseGeocode` | Same CRAVES endpoint -> Ola `GET /places/v1/reverse-geocode` | POST | `{latitude, longitude}` | `ReverseGeocodedAddress` (unchanged, section 4.1) | **None** |
| Autocomplete / place search | Not available to mobile (web BFF -> Azure `GET /geocode`) | **New** `/api/v1/customer/addresses/location-search` -> Ola `GET /places/v1/autocomplete` | POST | `{query, latitude?, longitude?}` | `{results: LocationSuggestion[]}` (section 4.2) | Optional, to add typeahead |
| Forward geocode (text -> coordinates) | Web only (Azure `/geocode`) | Covered by `location-search`: every suggestion carries `latitude`/`longitude` | POST | as above | as above | None |
| Place details | Not used | Not exposed: suggestions already include coordinates, and the final pin is reverse geocoded | - | - | - | None |
| Lat/lng format | WGS84 decimal degrees, JSON numbers | Unchanged | - | - | - | None |
| Address selection / save | `POST /api/v1/customer/addresses`, `PUT /api/v1/customer/addresses/{id}` | Unchanged (no map provider involved) | POST/PUT | unchanged | unchanged | None |
| Saved-location recommendation | `GET /api/v1/customer/addresses/recommendation` (PostGIS) | Unchanged (no map provider involved) | GET | unchanged | unchanged | None |
| Current-location flow | device GPS -> `reverse-geocode` | Unchanged | POST | unchanged | unchanged | None |
| Static map image | Web-only BFF `GET /api/location/map-image` (Azure `map/static`) | Web-only BFF (Ola static tiles). Same-origin protected; **not for the APK** | - | - | - | None |
| Distance / routing | Not connected (checkout serviceability uses haversine; the V14 "road distance" column was never wired) | Not connected in this change | - | - | - | None |

## 4. Exact examples

All examples use synthetic values. Authentication for every endpoint below is the existing customer Bearer access token (same as the saved-address APIs). APIM rejects calls without it.

### 4.1 Reverse geocode (unchanged contract)

```http
POST https://api.craves.in/api/v1/customer/addresses/reverse-geocode
Authorization: Bearer <customer access token>
Content-Type: application/json

{"latitude": 17.4483, "longitude": 78.3915}
```

`200 OK`

```json
{
  "formattedAddress": "Plot 12, Ayyappa Society Main Road, Madhapur, Hyderabad, Telangana, 500081, India",
  "houseNumber": "Plot 12",
  "street": "Ayyappa Society Main Road",
  "area": "Madhapur",
  "city": "Hyderabad",
  "district": "Rangareddy",
  "state": "Telangana",
  "postalCode": "500081",
  "country": "India",
  "confidence": "High",
  "preciseHouseNumber": true
}
```

- Field names, types and nullability are unchanged; the existing `parseResolvedAddress` in `customerAddressesApi.ts` keeps working.
- Any string field except `formattedAddress` may be `null`. `preciseHouseNumber` is `false` when no house/building number was resolved: keep the flat/house field editable and required. CRAVES never invents a house number.
- `confidence` now comes from Ola `location_type`: `rooftop` -> `High`, `range_interpolated`/`geometric_center` -> `Medium`, `approximate` -> `Low`, otherwise `null`.
- Values can differ from Azure for the same point (for example Ola may return `city: "Hyderabad"` where Azure returned `"Serilingampalli"`). Do not hard-code locality names.

Errors (body shape is the existing User/Chef error envelope):

```json
// 400: missing or out-of-range coordinates
{"code": "VALIDATION_FAILED", "message": "Request validation failed", "timestamp": "2026-10-09T10:00:00Z",
 "details": ["latitude: must be less than or equal to 90.0"]}

// 401 (from APIM): no or malformed Bearer token
{"error": "AUTHENTICATION_REQUIRED", "message": "A Bearer access token is required."}

// 429: this customer's budget is spent (30 reverse geocodes per minute); wait Retry-After seconds
{"code": "LOCATION_RATE_LIMITED", "message": "Too many location lookups. Please try again shortly.",
 "timestamp": "2026-10-10T10:00:00Z", "details": []}

// 503: Ola timeout, 4xx, 429 rate limit, 5xx, zero results, or key not configured
{"code": "REVERSE_GEOCODING_UNAVAILABLE",
 "message": "Craves could not identify this address right now. Please try again.",
 "timestamp": "2026-10-09T10:00:00Z", "details": []}
```

### 4.2 Location search (new, optional)

```http
POST https://api.craves.in/api/v1/customer/addresses/location-search
Authorization: Bearer <customer access token>
Content-Type: application/json

{"query": "Madhapur", "latitude": 17.4483, "longitude": 78.3915}
```

Request rules:

- `query`: required, 2-160 characters. The server trims it; fewer than 2 characters after trimming returns an empty list without calling Ola.
- `latitude`/`longitude`: optional **bias** point (send both or neither). Use the current GPS fix or the selected saved address when available. Without it the server biases to the configured service-area centre (Hyderabad). It is a bias, not a filter: other Indian cities still match.

`200 OK`

```json
{
  "results": [
    {
      "id": "ola-platform:5000039498427",
      "title": "Madhapur",
      "subtitle": "Hyderabad, Telangana, India",
      "formattedAddress": "Madhapur, Hyderabad, Telangana, India",
      "latitude": 17.4483,
      "longitude": 78.3915,
      "houseNumber": null,
      "street": null,
      "area": null,
      "district": null,
      "city": null,
      "state": null,
      "postalCode": null
    }
  ]
}
```

- At most 6 results, de-duplicated by `id`. Zero matches return `{"results": []}` with `200`.
- `title`/`subtitle` are display lines (subtitle may be `null`). The structured address fields are always `null` here by design: reverse geocode the chosen pin to fill the form.
- `id` is an opaque provider place id; do not parse or persist it as an address key.

Errors:

```json
// 400: query missing/too short/too long, or only one of latitude/longitude
{"code": "VALIDATION_FAILED", "message": "Request validation failed", "timestamp": "2026-10-09T10:00:00Z",
 "details": ["biasPairComplete: latitude and longitude must be sent together"]}

// 401 (from APIM)
{"error": "AUTHENTICATION_REQUIRED", "message": "A Bearer access token is required."}

// 429: this customer's budget is spent (60 searches per minute); wait Retry-After seconds
{"code": "LOCATION_RATE_LIMITED", "message": "Too many location lookups. Please try again shortly.",
 "timestamp": "2026-10-10T10:00:00Z", "details": []}

// 503: Ola timeout, 4xx, 429 rate limit, 5xx, invalid response, or key not configured
{"code": "LOCATION_SEARCH_UNAVAILABLE", "message": "Address search is unavailable right now. Please try again.",
 "timestamp": "2026-10-09T10:00:00Z", "details": []}
```

Availability: live in production since 2026-10-10 (User/Chef release `0cb1095`; APIM operation `search-customer-address-location`, added by `azure-pipelines-customer-location-ola-maps.yml` operation `apim`). An environment without that APIM operation answers `404` for this path, so keep the UI tolerant of a failed call.

## 5. Deprecated APIs

The APK calls none of these; they were server-side only and are now removed from the code.

```text
DEPRECATED: GET https://atlas.microsoft.com/reverseGeocode   (User/Chef Service, Next.js BFF)
REPLACEMENT: GET https://api.olamaps.io/places/v1/reverse-geocode (server-side only, behind POST /api/v1/customer/addresses/reverse-geocode)

DEPRECATED: GET https://atlas.microsoft.com/geocode          (Next.js BFF search)
REPLACEMENT: GET https://api.olamaps.io/places/v1/autocomplete    (server-side only, behind POST /api/v1/customer/addresses/location-search and the web BFF)

DEPRECATED: GET https://atlas.microsoft.com/map/static       (Next.js BFF map image)
REPLACEMENT: GET https://api.olamaps.io/tiles/v1/styles/default-light-standard/static/{lng},{lat},{zoom}/900x520.png (web BFF only)
```

If any APK build script, test or `.env` mentions `AZURE_MAPS_*`, delete it: no mobile map credential exists or is needed.

## 6. No-change APIs (intentionally backward compatible)

- `POST /api/v1/customer/addresses/reverse-geocode`: same request and response.
- `GET/POST /api/v1/customer/addresses`, `GET/PUT/DELETE /api/v1/customer/addresses/{addressId}`.
- `GET /api/v1/customer/addresses/recommendation`.
- Stored address coordinates and fields: no data migration; Azure-era addresses load and save as before.

## 7. Mobile implementation notes

Must change: **nothing**.

Recommended, to match the web experience (`Search -> map -> pin -> address -> confirm`):

1. On `CustomerAddressEditorModal`, add a search field above "Use current location". Debounce 300-400 ms, call `location-search` from 3 characters, cancel stale requests.
2. Render each suggestion as `title` (bold) and `subtitle` (muted).
3. On selection, move the pin to the suggestion's `latitude`/`longitude`, then call `reverse-geocode` for that point to prefill the form. After the customer drags the map, reverse geocode the settled pin again (debounce; the reverse geocode is metered).
4. Ask for location permission only when the customer taps "Use current location". If it is denied, search must still work.
5. Error handling: `503` -> "Address search is unavailable right now", keep manual entry and current location available; empty `results` -> "No matching places found. Try a nearby landmark or area name."; `401` -> existing session refresh; `429` -> wait the `Retry-After` seconds before the next lookup (never retry in a loop) and keep manual entry available.
6. Do not log or persist raw queries/coordinates outside the address the customer saves.
7. Parse leniently: new optional fields may be added to both responses.

Must not:

- embed or request any Ola key, or call `api.olamaps.io` directly;
- call the web BFF routes (`https://craves.in/api/location/*`): they are same-origin protected and rate-limited per web process;
- send only one of `latitude`/`longitude` to `location-search`.

## 8. APK test checklist

1. `reverse-geocode` for Madhapur `17.4483, 78.3915` -> `200`, `formattedAddress` present, flat/house stays editable when `preciseHouseNumber` is `false`.
2. `location-search` for Madhapur, Gachibowli, Hitech City, Kondapur, Kukatpally, Jubilee Hills, Banjara Hills -> first results in Hyderabad.
3. `location-search` with only `latitude` -> `400 VALIDATION_FAILED`.
4. No token -> `401`.
5. Existing saved address (created before the migration) opens, edits and saves unchanged.
6. Location permission denied -> search still usable.
7. More than 60 searches (or 30 reverse geocodes) by one customer within a minute -> `429 LOCATION_RATE_LIMITED` with a `Retry-After` header; the app waits and recovers.

## 9. Server configuration (for reference)

| Setting | Where | Secret | Value |
|---|---|---|---|
| `OLA_MAPS_API_KEY` | `ca-craves-user-chef-service-prod`, `ca-craves-web-prodlow` | Yes | `secretref:ola-maps-api-key` -> Key Vault secret `ola-maps-api-key` |
| `CRAVES_LOCATION_SEARCH_CENTER` | same apps | No | `17.3850,78.4867` |
| `AZURE_MAPS_CLIENT_ID`, `AZURE_MAPS_ENDPOINT` | same apps | No | Removed on 2026-10-10 after the live Ola flows were verified (`operation=remove-azure-maps`, pipeline 15 run 341) |

No mobile configuration is required.
