# Cart Bill Preview - v1.12

## Purpose and Current State

The customer cart can display finance-owned platform fees, delivery fees, taxes,
and the total before creating an order or opening Razorpay. Existing screen
layout and checkout/payment behavior are retained.

Backend and Azure/APIM deployment were explicitly approved in this chat.
The production subscription supplied by the user is
`721906c9-4a72-4606-830b-d3e7ace093ff` (Azure subscription 1). The open Azure
portal confirms directory `1e7e43ac-c7f5-4d47-a74f-289a7cc21508`.
Deployment-tool browser authentication completed with the Azure Portal account.
Device-code sign-in was blocked by Security Defaults (530035); no tenant security
settings were changed. The previously cached account's unrelated resources were
not modified. Never share credentials in chat.

`CART_BILL_PREVIEW_AVAILABLE` is enabled after real backend and APIM publication.
The phone remains on v1.11 until installation is verified separately. A signed
synthetic policy probe is not a substitute for actual customer-cart verification.

## Production Deployment Evidence

- Deployed backend baseline: `92320c9f1d20ffd291b14d5ed6a5c04e7febd445`, the source
  branch used by the existing product activation pipeline. Its backend is identical
  to `70b1196de10cdcda485e409e71ef705b4964bb4c`; the additional commit is web-only.
- Applied only eight preview source/test files from prepared checkpoint
  `3f8265d2329d38fed6462725986cfa18455159e2`. Existing finance helper files and
  production POM files were retained, not replaced from the older mobile tree.
- Build runs: Integration `cu4k`, Order `cu4m`, both succeeded.
- Integration image digest: `sha256:4bb276f4bb733455b58587d2e1c33a5a1cf257ab1c00481859612b6ba868b367`.
- Order image digest: `sha256:0314c09d17699db325d3f6b61e60deb3dd08abfb8424f84232cdd20c35aa1a01`.
- Existing apps: `ca-craves-integration-service-pr`, `ca-craves-order-service-prodlow`.
  Both new revisions end in `--cart-preview-v112`, are healthy and ready. Environment
  and full app configuration hashes remained identical across the image updates.
- APIM: only `cart-bill-preview` was added to existing `craves-cart-v1` in
  `apim-craves-prodlow-kmqgfy`. Its policy reuses the existing customer-cart bearer
  guard and no-store headers, changing only the rewrite to `/bill-preview`.
- Live private unsigned preview: 403. Signed synthetic read-only preview: 200,
  active policy revision 2, INR 100.00 food + 0.00 platform + 40.00 delivery +
  12.20 tax = 152.20 total. These are test inputs, not customer order charges.
- Public `api.craves.in` and APIM gateway: no token 401, invalid token 403.
- Production-baseline tests: Order 146 executed / 104 skipped; Integration 384
  executed / 284 skipped; no failures or errors. Database tests were not run
  against production and require an isolated PostgreSQL test database.
- Source ZIP: `C:\mscratch\artifacts\cart-preview-production-source-v1.12.zip`.
  It contains the production baseline plus the preview overlay, excluding targets.
  Regeneration inputs are the baseline and overlay ZIPs alongside it.
- Safe evidence (no keys): `C:\mscratch\artifacts\cart-preview-production-evidence`.
- Rollback images remain `craves/order-service:checkout-hotfix-125` and
  `craves/integration-service:checkout-hotfix-125`; previous revisions are recorded
  in `before-deployment.json`. No prior image or app tag was overwritten.

## Contract

Customer: `POST /api/v1/cart/bill-preview`, authenticated CUSTOMER bearer token.
Request:

```json
{
  "deliveryAddressId": "55555555-5555-4555-8555-555555555555",
  "expectedCart": {
    "cartId": "11111111-1111-4111-8111-111111111111",
    "items": [
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "quantity": 2,
        "updatedAt": "2026-09-30T00:00:00Z"
      }
    ]
  }
}
```

Response echoes expectedCart and deliveryAddressId, with policyId,
policyRevision, currency, foodSubtotal, platformFee, deliveryFee, taxAmount,
grandTotal, pricedAt and expiresAt. Money fields are exact two-decimal strings.
The quote lifetime is 120 seconds. TaxAmount contains the existing finance
policy's food, delivery and platform GST; no customer-specific fee is invented.
Coupons and referral benefits remain in their existing checkout flow.

Internal: `POST /internal/v1/finance/cart-preview`, with the existing signed-body
`X-Craves-Finance-Signature` trust boundary. This route must not be published in
public APIM. Request amounts and coordinates come only from Order Service's
verified cart, catalog and owned delivery address, never from mobile prices.

The preview supports the existing reviewed Telangana launch jurisdiction and
the active policy's configured distance tariff, including its exact rounding
and distance limit. No road-distance fallback or business policy is invented.

## Files

Mobile integration:
- `src/features/cart/api/cartBillPreviewApi.ts`: transport and strict response validation.
- `src/features/cart/query/useCartBillPreview.ts`: identity/address/cart-scoped cache and prefetch after confirmed changes.
- `src/app/navigation/CustomerRootNavigator.tsx`: background prefetch observer.
- `src/features/cart/screens/CustomerCartScreen.tsx`: existing bill rows and total use the preview, with checkout totals taking precedence.
- `src/features/cart/api/cartBillPreviewApi.test.ts`: transport, money reconciliation, expiry and input isolation checks.

Precise visual changes and regression tests:
- `src/features/home/screens/CustomerHomeScreen.tsx`: white unselected Popular Near You heart outline.
- `src/shared/components/LiquidGlassSurface.tsx`: reduced image-capsule blur and stronger reflective rim; navigation blur unchanged.
- `src/shared/components/LiquidGlassSurface.test.tsx`
- `src/features/favorites/components/CustomerFavoriteHeartButton.test.tsx`
- `android/app/build.gradle`: prepared Android 1.12 / versionCode 13.
- `KUSHIRAVI_VERSION.md`: prepared checkpoint, explicitly not installed.

Backend additions, relative to repository root:
- `services/order-service/src/main/java/in/craves/order/service/CartBillPreviewService.java`
- `services/order-service/src/main/java/in/craves/order/web/CartBillPreviewController.java`
- `services/order-service/src/main/java/in/craves/order/finance/FinanceSourceClient.java`: adds cartPreview; existing quote/event methods are unchanged.
- `services/integration-service/src/main/java/in/craves/integration/finance/CartBillPreviewFinanceService.java`
- `services/integration-service/src/main/java/in/craves/integration/web/InternalCartBillPreviewController.java`

Pure finance helpers and signed JSON utility were reused unchanged from main
commit `13710384`, since the mobile baseline contains older backend source.
The additions also compile and pass their focused tests against a read-only
snapshot of that newer main. Do not deploy the older backend tree wholesale.

Reused helper paths under `services/integration-service/src/main/java/in/craves/integration/`:
- `finance/FinancePolicy.java`
- `finance/FinanceCalculations.java`
- `finance/DeliveryTariff.java`
- `finance/source/FinancialJson.java`
- `ledger/LedgerMoney.java`

`services/integration-service/pom.xml` adds main's existing GeographicLib 2.1
dependency for the same configured distance calculation. Backend regression
tests are `services/order-service/src/test/java/in/craves/order/service/CartBillPreviewServiceTest.java`,
`services/integration-service/src/test/java/in/craves/integration/finance/CartBillPreviewFinanceServiceTest.java`,
and `services/integration-service/src/test/java/in/craves/integration/web/InternalCartBillPreviewControllerTest.java`.
`api/apim-api/contracts/mobile-production.v1.json` records the published preview
route. It was removed from `mobile-main-source-only.v1.json` only after deployment.

## Manual Deployment Steps

1. Authenticate locally to the Azure subscription owning the actual production
   API; check APIM backend mapping and running service revisions before changes.
2. Apply only the preview additions to the deployed backend source revision,
   retaining all current finance, auth, payment and delivery configurations.
3. Build and deploy Integration Service first, then Order Service, using existing
   resources and rollback revisions. No new paid resources are required; registry
   build executions can still incur ordinary build charges.
4. Retain existing server-side `CRAVES_FINANCE_INTERNAL_KEY`,
   `CRAVES_FINANCE_INTEGRATION_BASE_URL`, `CRAVES_USER_CHEF_INTERNAL_BASE_URL`
   and address verification secret. No keys go into the APK or source ZIP.
5. Add only `POST /bill-preview` to the existing customer-cart APIM API, routed to
   Order Service's `/api/v1/cart/bill-preview`. Preserve inherited bearer policies,
   use no-store responses, and do not relax subscription/auth requirements.
6. Verify unauthenticated and wrong-customer calls fail; verify a valid customer's
   bill without any new checkout, order, payment attempt or cart deletion.
7. Move the route from the source-only manifest to the published manifest and set
   `CART_BILL_PREVIEW_AVAILABLE` true only after publication is verified. Commit
   this activation as a new checkpoint, rebuild and install, recording evidence.

## Testing

```powershell
cd C:\mscratch\apps\mobile
npx tsc --noEmit
npx jest --runInBand --runTestsByPath src/features/cart/api/cartBillPreviewApi.test.ts
node scripts/p119-apim-contract-coverage-check.mjs

cd C:\mscratch
mvn -f services/order-service/pom.xml test
mvn -f services/integration-service/pom.xml test
```

After deployment and activation:
1. Add a dish with a saved address selected. Open Cart without pressing checkout.
2. Verify subtotal, platform fee, delivery fee, taxes and To Pay are numeric and
   reconcile; zero fees appear as zero, not as missing amounts.
3. Change quantities, remove/add dishes, switch kitchens and change addresses.
   Old bill amounts must disappear while a new verified bill is requested.
4. Simulate offline/timeout, retry, and test another customer's cart/address.
   No stale cross-cart bill or client-calculated fallback may appear.
5. Proceed to checkout and review its authoritative final bill before Razorpay.
   Previewing alone must never create a pending-payment order or clear the cart.
6. Check Popular Near You: unselected heart outline white; selected heart red;
   capsule blur reduced and rounded highlights stronger. Bottom menu unchanged.

No live payment, production database mutation, or iOS hardware test was performed
for this checkpoint. Local tests are not a substitute for deployment verification.
