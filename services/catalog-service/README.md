# Craves Catalog Service

Catalog Service owns kitchen discovery, kitchen profiles, menu items, menu item availability, delivery-handling metadata, and public menu media metadata for Craves.

This service follows the approved HLD direction for Catalog and Discovery: kitchens, dishes, menu items, prices, schedule/availability and search metadata are owned by the Catalog Service. Public images are stored in Azure Blob Storage and can be delivered through Azure Front Door/CDN.

## Current V1 scope

- Approved CHEF users can create/update one kitchen profile.
- CHEF users can create/update menu items.
- Every menu item stores an explicit packaged weight in grams.
- Every menu item stores an explicit thermobox requirement (`true` or `false`).
- CHEF users can upload menu item images.
- CHEF users can toggle item availability.
- Customers/public clients can discover active nearby kitchens.
- Default discovery radius is 10 km.
- Radius can be overridden dynamically by city/area policy.
- Public discovery returns only ACTIVE kitchens with ACTIVE + available menu items.

## Menu delivery metadata

The chef must explicitly supply these fields while creating or editing every menu item:

```json
{
  "unitPackageWeightGrams": 650,
  "thermoboxRequired": false
}
```

`unitPackageWeightGrams` means the packaged weight of one sellable unit of the item. It is stored in grams so Craves does not lose precision.

Examples:

```text
One meal box             = 650 grams
One family biryani pack  = 1800 grams
Two ordered meal boxes   = 650 x 2 = 1300 grams
```

`thermoboxRequired` is an explicit operational decision. It must be sent as either `true` or `false`; absence is rejected.

Existing menu items created before this migration are not assigned invented values. Flyway makes those incomplete legacy items unavailable until the chef edits them and supplies both fields.

## Not included in V1

- Video upload/transcoding. This is phase 2.
- Commission/platform fee rules.
- Delivery radius guarantee at checkout.
- GST/invoice logic.
- Chef payout logic.
- Advanced Redis cache. Redis cache can be added after the API behavior is stable.

## Main endpoints

### Chef endpoints

```http
GET    /api/v1/kitchens/me
PUT    /api/v1/kitchens/me
GET    /api/v1/kitchens/me/menu-items
POST   /api/v1/kitchens/me/menu-items
PUT    /api/v1/kitchens/me/menu-items/{menuItemId}
PATCH  /api/v1/kitchens/me/menu-items/{menuItemId}/availability
POST   /api/v1/kitchens/me/menu-items/{menuItemId}/images
```

These require a Craves access token containing the `CHEF` role.

Example menu-item request:

```json
{
  "itemName": "Home-style veg meal",
  "description": "Rice, dal, curry and curd",
  "category": "MEALS",
  "foodType": "VEG",
  "price": 199.00,
  "currency": "INR",
  "servesCount": 1,
  "preparationTimeMinutes": 30,
  "spiceLevel": "MEDIUM",
  "unitPackageWeightGrams": 650,
  "thermoboxRequired": false,
  "available": true,
  "status": "ACTIVE"
}
```

### Public customer discovery endpoints

```http
GET /api/v1/catalog/kitchens?latitude=17.448&longitude=78.391&city=Hyderabad&areaName=Madhapur
GET /api/v1/catalog/kitchens/{kitchenId}
GET /api/v1/catalog/kitchens/{kitchenId}/menu-items
GET /api/v1/catalog/menu-items/{menuItemId}
```

## Environment variables

```text
SPRING_DATASOURCE_URL
SPRING_DATASOURCE_USERNAME
SPRING_DATASOURCE_PASSWORD
CRAVES_JWT_VERIFICATION_PEM_BASE64
CRAVES_JWT_ISSUER
CRAVES_JWT_AUDIENCE
CRAVES_STORAGE_ENDPOINT_VALUE
CRAVES_STORAGE_MEDIA_CONTAINER
CRAVES_MEDIA_PUBLIC_BASE_URL
CRAVES_DISCOVERY_DEFAULT_RADIUS_KM
CRAVES_DISCOVERY_MAX_RADIUS_KM
```

## Local run

```bash
cd services/catalog-service
mvn spring-boot:run \
  -Dspring-boot.run.profiles=local
```

For local PostgreSQL, create `craves_business_db` and set the datasource variables. Flyway creates `catalog_schema` and the required tables.

## Media design

Images are uploaded to Azure Blob Storage under paths like:

```text
public/dishes/{kitchenId}/{menuItemId}/{assetId}-{filename}
```

The service stores metadata in PostgreSQL and returns a public URL. If `CRAVES_MEDIA_PUBLIC_BASE_URL` is set, returned URLs use that CDN/base URL. If not set, the Azure Blob URL is returned.

## Discovery radius design

Default policy:

```text
Hyderabad / DEFAULT = 10 km default, 15 km max
```

Dynamic policy table:

```text
catalog_schema.service_area_policy
```

This lets us later configure dense areas like Madhapur/Gachibowli differently from outer areas like Kompally/Shamshabad without code changes.

## Deployment

Pipeline:

```text
azure-pipelines-catalog-service.yml
```

Required Azure DevOps variables:

```text
AZURE_SERVICE_CONNECTION
POSTGRES_BUSINESS_DB_URL
POSTGRES_BUSINESS_DB_USER
POSTGRES_BUSINESS_DB_PASSWORD
CRAVES_JWT_VERIFICATION_PEM_BASE64
CRAVES_STORAGE_ENDPOINT_VALUE
CRAVES_MEDIA_PUBLIC_BASE_URL
```

`CRAVES_MEDIA_PUBLIC_BASE_URL` can be blank until Azure Front Door/CDN custom media endpoint is configured.
