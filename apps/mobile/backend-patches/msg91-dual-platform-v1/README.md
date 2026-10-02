# Independent MSG91 Web And Mobile OTP

Configuration-routing patch on `KUSHIRAVI-app-build`. No UI, mobile runtime,
payment, order, Chef authorization, database, APIM or CI changes.

The old widget cannot be switched between web and Mobile without disabling one
client. Keep existing widget `366942756930393636363638` in Mobile mode. Create a
separate web widget in the same MSG91 account using the existing approved SMS
template and verification policy. The backend's existing account-level
`verifyAccessToken` bridge verifies provider identity for either widget; never
trust a client-selected phone, widget or role as an authenticated identity.

## Source And Contracts

Exact deployed web baseline: `889fea7b13d9b05be86ea482c8abbfb387544750`.
Image: `cravesrm09prodlow6bf632.azurecr.io/craves/customer-web-next@sha256:00a8872c333352f5397b8b7a0701686dfe1c0b42cf5367ea3d3a91241798d9ca`.
The mobile branch's older web tree is not a deployment baseline. The `web`
overlay contains only two runtime files and their existing extended tests.
Everything else is restored from that exact baseline by `Prepare-Web.ps1`.

- GET `/api/auth/otp-config`: unchanged existing mobile config, so installed
  v1.21 continues to work without a new APK.
- GET `/api/auth/otp-config?platform=mobile`: explicit alias for that config.
- GET `/api/auth/otp-config?platform=web`: dedicated web widget; the existing web
  SDK now requests this exact URL.
- Other platform values return 400; missing or shared web widget returns 503,
  never a fallback to the mobile widget. All responses are private/no-store.
- Response remains `{provider: 'msg91', widgetId, tokenAuth}`. Only the scoped
  public widget token is published, never `MSG91_AUTHKEY`.
- Existing OTP length, request IDs, cooldowns, CAPTCHA/provider gates,
  verification, replay protection, Firebase custom-token compatibility and
  Craves session exchange are unchanged.

## Existing Azure App Configuration

Preserve `CRAVES_OTP_PROVIDER=msg91`, `MSG91_WIDGET_ID` and `MSG91_WIDGET_TOKEN`.
Add `MSG91_WEB_WIDGET_ID` and `MSG91_WEB_WIDGET_TOKEN` to the existing Web
Container App. Store the scoped web token as an Azure secret reference, not
inline source, logs, a build argument or a Git commit. No server authkey needs
to change. No new Azure resource is required. The existing registry build and
container capacity may incur their normal usage charges.

MSG91 may require its zero-cost widget subscription confirmation. A paid
subscription, wallet top-up, spending limit increase, CAPTCHA removal or
security-permission change is not implied by this patch. Leave existing mobile
configuration untouched and preserve web's existing security policy.

## Rebuild And Verify

PowerShell, Git, Node and Azure CLI are required. Fetching the exact baseline
does not push or change either source branch. Run in a fresh artifact directory:

```powershell
./Prepare-Web.ps1 -OutputDirectory C:/mscratch/artifacts/msg91-dual-platform-rebuild
cd C:/mscratch/artifacts/msg91-dual-platform-rebuild/repo/apps/customer-web-next
npm ci --ignore-scripts
npm run typecheck
npx vitest run src/lib/msg91-auth.vitest.ts src/lib/msg91-browser.vitest.ts
npm run test
```

Build using the baseline Dockerfile and the verified existing public build
configuration; preserve all non-OTP runtime environment/secret references.
After deployment, verify legacy/mobile requests retain the original widget,
web requests return a different widget, and provider policies read back Mobile
1 / web 0 at the same time. Ask the user to request/enter genuine OTPs directly
on each device; never read SMS codes, create artificial sessions or bypass a
CAPTCHA. Existing browser tabs should refresh once to load the new web SDK.

Rollback the Web app to the exact image above and its prior environment, without
editing accounts, sessions or mobile settings. That restores the previous
shared-widget limitation, not simultaneous-platform support. Keep all prior
mobile APKs/tags untouched. The deployment receipt records final commit, image,
revision, configuration readback and live acceptance, including any pending
user-only verification.

Official limitation:
https://msg91.com/help/sendotp/how-to-integrate-the-new-login-with-otp-widget
