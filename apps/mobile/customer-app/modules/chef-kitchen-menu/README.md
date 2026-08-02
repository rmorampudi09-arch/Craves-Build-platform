# Craves React Native Chef Kitchen and Menu

## Scope

Replaces the ChefKitchen placeholder with owned Catalog kitchen profile, menu list/edit and availability controls.

## Backend routes

```text
GET|PUT /api/v1/kitchens/me
GET|POST /api/v1/kitchens/me/menu-items
PUT /api/v1/kitchens/me/menu-items/{menuItemId}
PATCH /api/v1/kitchens/me/menu-items/{menuItemId}/availability
```

## Safety

- Secure Keychain/Keystore session bearer.
- Catalog Service validates CHEF role and ownership.
- Identity, kitchen ownership and blob/image-storage fields are excluded.
- Empty kitchen profile is handled through backend 404.
- Suspended kitchen is read-only.
- No tax, discount, fee, commission or serviceability calculation.
- Native image upload is deliberately deferred until a picker and platform permissions are reviewed.

## Pipeline

`azure-pipelines-chef-mobile-kitchen-menu-ci.yml`
