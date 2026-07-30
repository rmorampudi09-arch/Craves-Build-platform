# Mobile Customer Checkout and Cashfree Payment

Adds saved-address checkout creation and Cashfree hosted payment to the React Native customer app.

## Customer flow

```text
secure customer session
  -> backend cart validation
  -> select customer-owned saved address
  -> Order Service checkout and charge calculation
  -> Integration Service owned payment session
  -> Cashfree React Native web checkout
  -> SDK callback
  -> Integration Service ownership-protected verification
  -> Order Service paid propagation
```

## Cashfree packages

```json
"react-native-cashfree-pg-sdk": "2.4.0",
"cashfree-pg-api-contract": "2.1.1"
```

The current implementation uses `CFEnvironment.SANDBOX`. Production activation requires a separate reviewed amendment after sandbox acceptance, Cashfree KYC/domain/app configuration, webhook verification and signed release builds.

## Security

- Cashfree client ID and secret never enter the mobile app.
- Payment session and Cashfree order ID remain in component memory only.
- SDK `onVerify` is not treated as payment success.
- The callback order ID must match the current backend-issued Cashfree order ID.
- Craves calls its ownership-protected backend verification endpoint before displaying success.
- No card, UPI PIN or bank credential is collected by Craves.

## Native manual steps later

1. Generate and review Android/iOS native shells.
2. Install dependencies and generate reviewed lockfile.
3. Run CocoaPods for iOS.
4. Confirm Android and iOS Cashfree SDK linkage from clean builds.
5. Keep sandbox mode.
6. Configure test merchant credentials only in Integration Service/Key Vault.
7. Configure Cashfree application/domain/return and webhook settings.
8. Test with Cashfree sandbox and exact owned checkout.
9. Configure Android keystore and Apple provisioning only for signed releases.

## Pipeline

Run `azure-pipelines-customer-mobile-checkout-payment-ci.yml` after all parent PRs and APIM dependencies are merged. No native or payment pipeline was run while creating this module.
