# Craves location service

Craves uses device GPS only to obtain a precise map point. Customers and chefs do not enter or see latitude/longitude in normal UI.

## Provider

Craves uses **Ola Maps (Krutrim)** for place search, reverse geocoding and the static delivery map. Every call is made server-side by the Next.js BFF; the browser only talks to same-origin Craves routes and never receives the Ola key.

## Current-location flow

```text
Browser location permission (only after the customer taps "Use current location")
  -> latitude/longitude kept in component state only
  -> POST /api/location/reverse-geocode
  -> same-origin + per-instance request-rate guard
  -> Next.js BFF calls Ola Maps Reverse Geocode with the server-only OLA_MAPS_API_KEY
  -> sanitized written-address response
  -> editable Craves address fields
```

## Search and pin flow

```text
Customer types an area, street or landmark (debounced, 3+ characters)
  -> POST /api/location/search { query, latitude?, longitude? }
  -> Next.js BFF calls Ola Maps Autocomplete, biased to the supplied point,
     else CRAVES_LOCATION_SEARCH_CENTER (a bias, not a restriction)
  -> up to six suggestions with title/subtitle and coordinates
  -> customer picks one; the map opens with the pin on it
  -> customer drags the map under the fixed pin; GET /api/location/map-image renders the Ola static map
  -> each settled pin position is reverse geocoded into the form
```

The BFF returns only:

- formatted address
- house/building number when Ola Maps resolves one
- street/road
- area/neighborhood
- city/locality
- district
- state
- pincode
- country
- confidence metadata (from the Ola `location_type`)

It never returns the Ola key, request URLs or raw provider bodies.

## Production configuration

Runtime environment variables on `ca-craves-web-prodlow` (and the same key on `ca-craves-user-chef-service-prod` for the mobile APIs):

```text
OLA_MAPS_API_KEY=secretref:ola-maps-api-key      # secret: Key Vault reference to ola-maps-api-key
CRAVES_LOCATION_SEARCH_CENTER=17.3850,78.4867    # optional, not secret
```

Bind them with `azure-pipelines-customer-location-ola-maps.yml` (`operation=bind`) after the key exists as `ola-maps-api-key` in the Key Vault User/Chef already uses. `bind` checks that each app identity can read it; an app that cannot may instead get an operator-created Container App secret of that name (never on User/Chef, whose releases require Key Vault-backed secrets). The Ola credential's allowed domains must include `craves.in`; server calls identify themselves with `Origin: https://craves.in`.

## Accuracy rule

Reverse geocoding can only fill what the map provider can resolve. When Ola Maps returns a street/house number, Craves prefills it. If a private flat/unit number cannot be resolved from GPS, Craves fills the best available postal address and asks the user to correct the flat/house/building field. Craves never invents an apartment or door number.

## Security and metered-usage protection

- all Ola calls are server-side only; the browser never receives the key;
- the public BFF routes accept same-origin requests only;
- the BFF validates JSON of at most 1 KiB (2 KiB for search) within two seconds and finite, in-range numeric coordinates before consuming provider admission;
- in a rolling 60-second window per process: reverse geocoding admits 30 lookups (4 in flight), search 120 typeahead lookups (8 in flight; superseded keystrokes are aborted end to end) and the static map 90 images (6 in flight);
- forwarded IP headers do not identify callers or create extra budgets; the guard returns HTTP 429 with `Retry-After` when full;
- failed provider calls release the in-flight slot but still count against the budget;
- Ola responses have whole-body deadlines of seven seconds (twelve for map images), size limits, and redirects are rejected;
- provider failures (timeouts, 4xx, 429, 5xx, unusable bodies) become a generic 503 for the browser and one `[location] Ola Maps <operation> unavailable: <reason> (request <id>)` server log line, never the URL, key, coordinates, query or body;
- precise coordinates remain internal to Craves requests used for PostGIS discovery and delivery.

These are engineering limits for the existing single-replica deployment, not a huge-load or availability guarantee. Admission is per Node.js process and resets on process restart. Production monitoring should alert on location 429/5xx rates and on the Ola usage dashboard.

Kitchen discovery requires explicit decimal latitude and longitude, including legitimate zero values. Missing, blank, duplicate, unknown, non-finite, or out-of-range query values are rejected before Catalog is called. The query is limited to 256 characters, coordinates to 32 characters, radius to 1–100,000 metres, page to 0–1,000, and page size to 1–50. Omitted radius/page/size keep the existing defaults of 5,000/0/20. These request bounds limit input and pagination work; they do not establish measured service capacity.
