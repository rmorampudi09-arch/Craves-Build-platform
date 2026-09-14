# Craves location service

Craves uses device GPS only to obtain a precise map point. Customers and chefs do not enter or see latitude/longitude in normal UI.

## Current-location flow

```text
Browser location permission
  -> latitude/longitude kept in component state only
  -> POST /api/location/reverse-geocode
  -> same-origin + per-instance request-rate guard
  -> Next.js BFF obtains a Microsoft Entra token from the Container App managed identity
  -> Azure Maps Reverse Geocoding
  -> sanitized written-address response
  -> editable Craves address fields
```

The BFF returns only:

- formatted address
- house/building number when Azure Maps resolves one
- street/road
- area/neighborhood
- city/locality
- district
- state
- pincode
- country
- confidence metadata

It never returns Azure credentials or managed-identity tokens.

## Production Azure configuration

Required non-secret runtime environment variables on `ca-craves-web-prodlow`:

```text
AZURE_MAPS_CLIENT_ID=<Azure Maps account properties.uniqueId>
AZURE_MAPS_ENDPOINT=https://atlas.microsoft.com
```

`IDENTITY_ENDPOINT` and `IDENTITY_HEADER` are injected by Azure Container Apps when the app has a managed identity. They must never be configured manually in source control.

Production uses:

- Azure Maps Gen2 / G2
- shared/local key authentication disabled
- customer-web system-assigned managed identity
- `Azure Maps Data Reader` RBAC scoped only to the Maps account

Provisioning is intentionally guarded because Azure Maps is a billable metered Azure resource:

```text
azure-pipelines-customer-location-azure-maps.yml
confirmBillableAzureMapsProvision=true
```

## Accuracy rule

Reverse geocoding can only fill what the map provider can resolve. When Azure Maps returns a street/house number, Craves prefills it. If a private flat/unit number cannot be resolved from GPS, Craves fills the best available postal address and asks the user to correct the flat/house/building field. Craves never invents an apartment or door number.

## Security and metered-usage protection

- reverse geocoding is server-side only;
- the browser never receives an Azure Maps key;
- the public BFF route accepts same-origin POST requests only;
- the BFF validates JSON of at most 1 KiB within two seconds and finite, in-range numeric coordinates before consuming provider admission;
- the BFF admits at most 30 lookups in a rolling 60-second window, shared by all anonymous and signed-in callers in one process, with at most four provider lookups in flight;
- forwarded IP headers do not identify callers or create extra budgets; the guard retains at most 30 timestamps and returns HTTP 429 with `Retry-After` when full;
- failed provider calls release the in-flight slot but still count against the lookup budget;
- managed-identity and Maps responses have whole-body deadlines of five and seven seconds, response limits of 32 KiB and 256 KiB respectively, and redirects are rejected;
- errors return a generic response without logging raw provider exceptions, tokens, coordinates, or response bodies;
- precise coordinates remain internal to Craves requests used for PostGIS discovery and delivery;
- provider responses are normalized before they reach UI code;
- the Azure Maps account itself uses Entra/RBAC with local/shared-key authentication disabled.

These are engineering limits for the existing single-replica deployment, not a huge-load or availability guarantee. Admission is per Node.js process and resets on process restart; more processes or replicas would each have their own budget. Anonymous use remains supported, so one caller can consume the shared budget. Production monitoring should alert on reverse-geocoding volume and 429/5xx rates; higher capacity requires reviewed traffic controls and metered-usage bounds.

Kitchen discovery requires explicit decimal latitude and longitude, including legitimate zero values. Missing, blank, duplicate, unknown, non-finite, or out-of-range query values are rejected before Catalog is called. The query is limited to 256 characters, coordinates to 32 characters, radius to 1–100,000 metres, page to 0–1,000, and page size to 1–50. Omitted radius/page/size keep the existing defaults of 5,000/0/20. These request bounds limit input and pagination work; they do not establish measured service capacity.
