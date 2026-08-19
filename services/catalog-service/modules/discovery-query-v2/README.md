# Catalog Discovery Query v2

## Purpose

This module upgrades the existing coordinate-based Catalog discovery endpoints without changing the Craves Hyderabad home-chef business model or any commercial rule.

Existing callers remain valid. All new request parameters are optional.

## Endpoints

### Nearby kitchens

```http
GET /api/v1/discovery/kitchens
```

Required query parameters:

```text
latitude
longitude
radiusMeters
```

Optional query parameters:

```text
query
category
foodType=VEG|NON_VEG|EGG
minPrice
maxPrice
maxPreparationTimeMinutes
spiceLevel=MILD|MEDIUM|SPICY
sort=DISTANCE_ASC|NAME_ASC
page
size
```

### Nearby menu items

```http
GET /api/v1/discovery/menu-items
```

The same optional filters apply. Supported menu-item sorting is:

```text
DISTANCE_ASC
PRICE_ASC
PRICE_DESC
PREPARATION_TIME_ASC
NAME_ASC
```

## Search behaviour

`query` uses PostgreSQL full-text search with the built-in `simple` text-search configuration. The searchable fields are:

Kitchen metadata:

```text
kitchen_name
display_name
description
area_name
city
```

Menu metadata:

```text
item_name
description
category
```

The `simple` configuration is deliberate. It tokenizes both Telugu and English text without applying English stemming and does not require a new PostgreSQL extension.

This is lexical search only. The module does not claim semantic intent, typo correction, AI recommendations, personalized ranking, or translated aliases.

## Eligibility remains unchanged

Every result must still satisfy the pre-existing production discovery rules:

```text
kitchen status = ACTIVE
kitchen has geocoded PostGIS location
menu item status = ACTIVE
menu item is_available = true
unit_package_weight_grams is present
thermobox_required is present
kitchen is inside caller-provided radiusMeters
```

The caller-provided browsing radius is not a delivery-fee rule, permanent chef radius, or final checkout serviceability decision.

## Structured filter semantics

- `category` is an exact case-insensitive category match.
- `foodType` and `spiceLevel` use existing catalog enums only.
- `minPrice` and `maxPrice` filter stored catalog prices; no price is calculated or changed.
- `maxPreparationTimeMinutes` filters chef-supplied catalog preparation metadata; it is not an SLA promise or delivery ETA.
- Kitchen results require at least one eligible menu item satisfying all structured menu filters.
- Free-text kitchen search can match either kitchen metadata or an eligible matching menu item.

## Technical validation

```text
query <= 120 Unicode code points
category <= 80 Unicode code points
minPrice >= 0
maxPrice >= 0
minPrice <= maxPrice
maxPreparationTimeMinutes > 0
```

Existing latitude, longitude, radius, page, and page-size guards remain unchanged.

## Database migration

```text
V6__discovery_search_filter_indexes.sql
```

The migration adds:

- partial GIN full-text index for active geocoded kitchen search;
- partial GIN full-text index for sellable menu-item search;
- partial structured-filter index anchored by `kitchen_id` for nearby menu evaluation.

V6 is intentional because current production already contains Catalog Flyway V4 and V5 for delivery pickup-location lifecycle work.

## Files

```text
services/catalog-service/src/main/java/in/craves/catalog/service/DiscoveryCriteria.java
services/catalog-service/src/main/java/in/craves/catalog/service/NearbyDiscoveryService.java
services/catalog-service/src/main/java/in/craves/catalog/web/NearbyDiscoveryController.java
services/catalog-service/src/main/resources/db/migration/V6__discovery_search_filter_indexes.sql
services/catalog-service/src/test/java/in/craves/catalog/service/NearbyDiscoveryServiceCriteriaValidationTest.java
services/catalog-service/modules/discovery-query-v2/README.md
```

## Local test

From `services/catalog-service`:

```bash
mvn -B clean test
```

For database integration validation, run against a PostgreSQL instance with PostGIS enabled and execute representative requests for:

```text
unfiltered backward-compatible discovery
Telugu query text
English query text
VEG/NON_VEG/EGG filters
category filter
price range
preparation-time filter
spice-level filter
all supported sort values
combined filters
empty result
invalid input
pagination after filtering
```

## Deployment

No new Azure resource is required. Promotion must use the current Catalog deployment pipeline and the existing Azure DevOps service connection.

## Deliberately excluded

This module does not define or change:

```text
ratings or reviews
rating-based ranking
personalized ranking
sponsored ranking
commission or platform fees
delivery fees
chef delivery radius
final order serviceability
cancellation/refund rules
FSSAI/KYC rules
provider selection rules
GST/tax rules
```
