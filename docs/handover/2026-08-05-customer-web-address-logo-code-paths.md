# Customer Web Address and Logo Code Paths

## Address request path

```text
Browser screen
  apps/customer-web-next/src/screens/Profile/Addresses.tsx
      ↓ same-origin fetch
Next.js BFF
  apps/customer-web-next/src/app/api/customer/addresses/route.ts
      ↓ authenticatedApiFetch
APIM
  /api/v1/customer/addresses
      ↓ operation policy
User/Chef Service
  CustomerProfileController
  CustomerProfileService
      ↓
PostgreSQL customer_address
```

## Address response compatibility

```text
apps/customer-web-next/src/lib/address-contract.ts
```

This file distinguishes a saved historical row from a delivery-ready address. Historical rows remain editable while complete rows are eligible for checkout.

## Logo rendering path

```text
HeroSection
  → CravesLogo
  → /brand/craves-logo.png
```

Before build:

```text
public/brand/craves-logo.svg
  → scripts/extract-brand-logo.mjs
  → public/brand/craves-logo.png
```

The extraction is deterministic and uses only the approved image already stored in the repository.
