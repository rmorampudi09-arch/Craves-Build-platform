# Craves Customer Cart Preflight v1

## Purpose

Give the customer client a read-only pre-check immediately before checkout so it can explain current Catalog changes instead of discovering them only when payment/checkout validation fails.

## Endpoint

```http
GET /api/v1/cart/preflight
```

The endpoint does not mutate the cart and does not decide whether a customer accepts a new price. It reports facts from the current Catalog state.

## Issue model

Blocking issues:

```text
MENU_ITEM_UNAVAILABLE
DELIVERY_METADATA_MISSING
```

Review-only changes:

```text
PRICE_CHANGED
KITCHEN_CHANGED
ITEM_NAME_CHANGED
```

`readyForCurrentCheckoutValidation` is false when at least one blocking issue exists. `hasReviewChanges` is true when a non-blocking snapshot difference exists.

## Scale behavior

The Order service does not call Catalog once per cart line. It sends one bounded internal batch request for up to 100 menu IDs:

```http
POST /api/v1/catalog/internal/menu-items/resolve
X-Craves-Internal-Key: <secret-bound value>
```

Catalog resolves active/available menu snapshots in one SQL query.

## Files

Order:

```text
src/main/java/in/craves/order/web/CartPreflightDtos.java
src/main/java/in/craves/order/service/CartPreflightService.java
src/main/java/in/craves/order/web/CartController.java
src/main/java/in/craves/order/service/CatalogClient.java
src/test/java/in/craves/order/service/CartPreflightServiceTest.java
```

Catalog:

```text
src/main/java/in/craves/catalog/web/PublicCatalogBatchDtos.java
src/main/java/in/craves/catalog/service/PublicMenuBatchResolveService.java
src/main/java/in/craves/catalog/web/InternalCatalogController.java
```

Gateway:

```text
openapi/customer-cart-preflight-v1.yaml
infra/apim/customer-cart/customer-cart-policy.xml
scripts/apim/configure-customer-cart-apim.sh
scripts/apim/rollback-customer-cart-preflight-v1-apim.sh
```

## Security

The customer preflight route requires authenticated customer access through Order. The Catalog batch resolver is not public and requires the existing internal-service secret.

## Test

```bash
cd services/order-service
mvn -B -ntp clean verify
```

Important cases:

```text
unchanged active cart -> ready
one unavailable item -> blocking
missing delivery metadata -> blocking
price changed -> review change, not auto-mutated
kitchen changed -> review change
item name changed -> review change
multiple lines -> one Catalog batch call
```

## Product decisions not introduced

No automatic price acceptance, promotional repricing, item substitution, refund/cancellation rule, minimum order or delivery-fee policy is introduced here.
