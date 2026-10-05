# Craves website performance handover

This update removes avoidable browser waits in the existing Craves website. The public landing no longer waits for its fixed splash sequence, hero media is smaller, and profile panels load independently. Concurrent session and cart reads share a request, and cached detail content can remain visible while current serviceability is checked. Auth roles, account status, prices, cart validation and checkout remain controlled by the backend. No new platform module or paid resource is created.

## Delivery status

Production release verified; post-change local Chrome visual verification and additional landing-asset edge compression verification remain pending

Production release VERIFIED from docs/performance/validation/release-deploy.json. Source dc74bfa3880b18278b015f57ae393fb25133acdf is active in ready/latest revision ca-craves-web-prodlow--0000076. Immutable image: cravesrm09prodlow6bf632.azurecr.io/craves/customer-web-next@sha256:bca745e52636105532b78b42d552e9e516f5074d72938f0ab8c4090ca8d636dc. Public version matches that source, merchant readiness is true, and the four unauthenticated email API checks returned 401 with private no-store headers; mailboxAccepted is false and no emails were sent. Fingerprints for the images, runtime and traffic of 12 other apps were preserved. Release verification does not claim signed-in UI or browser-paint timing coverage.

## User request

> my website is loading too slow on all pages. make sure it should be superfast. take my system control and work. not on cloud browser

Work used the local desktop browser and an isolated checkout of live baseline `eb5b6e641`; synced reference material and other working copies were preserved. Only this request and the supplied project instructions are available as user history for this handover.

Delivered source revision: `dc74bfa3880b18278b015f57ae393fb25133acdf`.

Draft review: [PR #423](https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/423). Checked open, draft and mergeable with no conflicts. Review/merge is pending, and production already runs the recorded candidate. Documentation is added separately with the app tree preserved.

## What changed

The active root landing is maintained under apps/landing-v20 and served from apps/customer-web-next/public/landing-v20. The forced 1.22-second reveal / 2.7-second finish timing and splash image/font wait are removed; the earlier timers began after image/style readiness, so total old startup could exceed 2.7 seconds. Below-the-fold images load lazily, and optional profile hydration runs in the background on nine customer pages. The generated HTML is 10,458 bytes instead of 269,166 bytes, about 96% smaller. The muted hero keeps the 22-second scene at 24 fps, using a 1280x720 H.264 faststart derivative with no audio: 4,183,971 bytes instead of 77,733,727 bytes, a 94.62% reduction. The original full-resolution source is preserved. The derivative SHA-256 is e6c03673ecd02fb8ba56c237a4bbac0b6692ed3d52865abdf8ee9e3563d025e0. The recorded one-frame-per-second SSIM sample is 0.981579; it is not a guarantee of subjective quality on every device.

Existing Azure Front Door Next.js public static asset compression is verified through HTTP 200 responses and matching decoded hashes. The earlier measured JavaScript sample reduced transfer bytes from 228,922 to 66,534 with Brotli (70.9% less), and the sampled largest CSS asset from 221,765 to 27,921 bytes (87.4% less). Gzip, Brotli and warm-cache checks for Next.js static assets are recorded as verified in the current summary. The static route now contains only /_next/static/* and /landing-v20/assets/*; the landing-assets configuration update succeeded. At the final bounded probe on 2026-10-05 at 18:25:18 UTC, about 20 minutes after the pattern update, all 12 origin/edge gzip, Brotli and identity requests for the current landing JavaScript and CSS returned HTTP 200 with exact decoded SHA-256 equality. The landing edge still returned identity encoding and CONFIG_NOCACHE. Landing gzip/Brotli delivery, warm cache and routing-at-edge verification remain pending propagation and are not reported as achieved. The retained security rules contain response-security-header actions and no cache override. API, sign-in/general HTML and auth-manifest cache boundaries were checked unchanged; no auth-assets extension is authorized or pending. Private API/customer data keeps no-store behavior. The generic pre-rendered /notifications HTML shell reports a shared cache header and is distinct from its private data requests. No private HTTP cache is introduced. These are asset transfer checks, not Chrome visual performance measurements. Historical receipts retain their original timestamps; the current final state is recorded in cdn-current-combined-summary.json and route-final-configured.json. No request errors or content mismatch required rollback.

Cart writes serialize within their captured session so overlapping accepted writes do not appear as false failures. Rejected writes do not block the queue; queued work from an older login cannot write under a new account. GET reads share only while in flight and cannot replace newer write receipts.

## Measured evidence

Initial Windows Chrome navigation: TTFB 37 ms, FCP 288 ms and load event 332 ms; these do not measure the later forced splash or complete page usability. Slow cart samples: 6,746 and 10,048 ms. Later fresh HTTP-200 sample: Auth 400 ms; profile 399 ms; addresses 417 ms; cart 398 ms; orders 604 ms. These are separate observations, not a controlled before/after benchmark.

Native control stopped after a safety check could not reliably identify the current Windows Chrome URL. No more browser UI was used, no cloud browser was used, and no post-change Chrome visual timings are available. The local Vite preview was stopped without opening it.

Post-release anonymous HTTP checks sampled 16 routes: all returned HTTP 200, with response headers in 111-304 ms. Live root HTML was 10,669 bytes (the source build artifact was 10,458 bytes), referenced the verified index-jSsHrZ3d.js bundle and contained no inline PNG. These are one-sample HTTP shell checks including connection setup, not signed-in customer API, first-paint, interaction or load-test measurements. No post-change Chrome visual timings are available. Initial Chrome measurements were TTFB 37 ms, FCP 288 ms and load event 332 ms. Native control stopped when it could not reliably identify the current Windows Chrome URL after opening a tab. No further browser UI or cloud browser was used, and the local Vite preview was stopped without opening it.

## Changed files

- `apps/customer-web-next/Dockerfile`
- `apps/customer-web-next/src/services/auth/cravesAuth.ts`
- `apps/customer-web-next/src/services/api/cravesCart.ts`
- `apps/customer-web-next/src/screens/public/LandingPage/LandingPage.tsx`
- `apps/customer-web-next/src/screens/Profile/Profile.tsx`
- `apps/customer-web-next/src/components/profile/AccountCard.tsx`
- `apps/customer-web-next/src/screens/public/FoodDetails/FoodDetails.tsx`
- `apps/customer-web-next/src/screens/public/ChefProfile/ChefProfile.tsx`
- `apps/customer-web-next/src/lib/session-performance.vitest.ts`
- `apps/customer-web-next/src/lib/cart-performance.vitest.ts`
- `apps/customer-web-next/src/lib/chef-profile-session.vitest.ts`
- `apps/customer-web-next/src/lib/email-session-races.vitest.ts`
- `apps/customer-web-next/src/lib/precise-customer-chef-ui.test.ts`
- `apps/customer-web-next/src/lib/signed-in-integration.test.ts`
- `apps/customer-web-next/next.config.ts`
- `apps/customer-web-next/public/landing-v20/assets/index-BXlAgL_V.css`
- `apps/customer-web-next/public/landing-v20/assets/index-jSsHrZ3d.js`
- `apps/customer-web-next/public/landing-v20/index.html`
- `apps/customer-web-next/src/lib/customer-page-startup.vitest.ts`
- `apps/customer-web-next/src/lib/landing-auth-entrypoints.test.ts`
- `apps/customer-web-next/src/lib/landing-startup.vitest.ts`
- `apps/customer-web-next/src/lib/protected-page-startup.vitest.ts`
- `apps/customer-web-next/src/lib/tracking-progress.vitest.ts`
- `apps/customer-web-next/src/screens/Cart/Cart.tsx`
- `apps/customer-web-next/src/screens/Checkout/Checkout.tsx`
- `apps/customer-web-next/src/screens/Notifications/Notifications.tsx`
- `apps/customer-web-next/src/screens/OrderHistory/OrderHistory.tsx`
- `apps/customer-web-next/src/screens/OrderSuccess/OrderSuccess.tsx`
- `apps/customer-web-next/src/screens/OrderTracking/OrderTracking.tsx`
- `apps/customer-web-next/src/screens/Profile/Addresses.tsx`
- `apps/customer-web-next/src/screens/Wishlist/Wishlist.tsx`
- `apps/customer-web-next/src/screens/public/AllChefs/AllChefs.tsx`
- `apps/landing-v20/README.md`
- `apps/landing-v20/src/App.tsx`
- `apps/landing-v20/src/components/DeliveredWithCare/DeliveredWithCare.tsx`
- `apps/landing-v20/src/components/ForHomeChefs/ForHomeChefs.tsx`
- `apps/landing-v20/src/components/Hero/Hero.tsx`
- `apps/landing-v20/src/components/RiderSection/RiderSection.tsx`
- `apps/landing-v20/vite.config.ts`
- `scripts/release/tests/test_web_performance_release.py`
- `scripts/release/web_performance_release.py`
- `docs/performance/landing-media.json`

## Verification

- An earlier source snapshot passed 649 Vitest tests across 48 files and 365 Node checks (1,014 total); this is intermediate evidence, not the final frozen-source result.
- Landing source lint, type check and build passed. Startup behavior checks are covered by the final 1,034 application checks. Release helper independent-review checks passed 25 focused tests plus 6 existing tests, including backend-image and traffic guards; these are additional helper checks and are not added to the application count.
- Final frozen-source application lint and type check passed.
- Final full tests passed: 669 Vitest tests across 51 files and 365 Node checks (1,034 total in the final full application run).
- Final production build passed and generated 123 static pages. Customer web tree: a708a893c609277d4bd851f1c57817c862c40f29. This is a build result, not a load-test or browser visual performance claim.

Focused auth/cart/race suites and the five existing cart-checkout checks passed; final broad checks above take precedence.

## Privacy and correctness

Auth roles/status are fetched fresh; only concurrent identity requests are shared. Profile display fields use 30 seconds of memory freshness. Session/owner and mutation revision checks stop older responses from replacing current private data. Cart and checkout remain server-authoritative. Environment files, dependencies, build output and runtime logs are excluded from the ZIP.

## Local testing

Use Node 24. In `apps/customer-web-next`, run:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
```

For future changes to the actual static root landing, edit the source under `apps/landing-v20`; inside that folder run `npm ci`, `npm run lint`, and `npm run build`. Its Vite build regenerates `apps/customer-web-next/public/landing-v20`; preserve the sibling folder layout and repeat customer-web checks after rebuilding.

Reuse approved local configuration through the existing secret-management process. Do not paste credentials into chat. Check landing, home, profile, details, cart and checkout in the local desktop browser. Delay secondary requests and change approved test accounts to verify responsive rendering and owner isolation.

## Local configuration for a fresh ZIP copy

The source archive excludes `.env.example` and filled environment files. Use the supplied blank template instead. From the extracted ZIP root:

```powershell
if (-not (Test-Path -LiteralPath .\apps\customer-web-next\.env.local)) {
  Copy-Item -LiteralPath .\handover\local-configuration.template.txt -Destination .\apps\customer-web-next\.env.local
}
```

Open `.env.local` in your editor and fill the existing approved local/test values outside chat. Preserve an existing local file. The backend endpoint and six Firebase fields are needed for backend/sign-in journeys; map and license/flag fields apply to their existing features. No new credentials or payment-provider choice is required. The key names are:

```dotenv
# Copy to apps/customer-web-next/.env.local for a fresh local source copy.
# Fill values from your existing approved configuration; never paste values into chat.
# Keep existing local configuration if it is already present.

# Existing backend and optional map configuration
CRAVES_API_BASE_URL=
AZURE_MAPS_CLIENT_ID=
AZURE_MAPS_ENDPOINT=

# Existing Firebase web application configuration required for sign-in
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

# Existing optional flags/license: retain approved values and payment configuration
NEXT_PUBLIC_RAZORPAY_MODE=
NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=
NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY=
```

## Retained CI reference

The ZIP root includes the unchanged `azure-pipelines-customer-web-next-integration-ci.yml`. It uses Node 24 and `npm ci`, lint, type, test and build checks. `trigger: none` and `pr: none` keep it from starting automatically. Its `ci.invalid` public placeholders and sandbox flag are for checking the build. Production requires the approved values and the reviewed guarded release process. Do not queue a historical deployment YAML for this change. Existing Azure DevOps is retained as a reference; no new pipeline or CI standardization decision was introduced.

Inherited module READMEs still describe broader historical deployment pipelines. This verified frontend-only release used `scripts/release/web_performance_release.py`, with the exact source/tree and preserved runtime/backend fingerprints recorded in the sanitized receipt. Use this handover for the current release result; review/merge the performance branch through the repository's normal process rather than queuing an old platform/deploy YAML from the ZIP.

## Historical read-only test fixtures

Existing Node contract tests read these three unchanged files at their original repository paths:

- `azure-pipelines-customer-addresses-apim.yml`
- `azure-pipelines-customer-web-next-delivery-tracking.yml`
- `scripts/apim/configure-customer-addresses-apim.sh`

They are packaged solely so `npm test` can read their historical text in a standalone source copy. They are not deployment instructions for this release. Do not queue the YAML fixtures or execute the APIM script from the ZIP.

## Manual steps required

No pending Azure Portal, credentials, DNS, Firebase or payment setup actions are required for the verified release. A post-change visual check in a known local Chrome window remains pending because native control stopped at its automatic URL-confidence safety check. This is the remaining browser-verification limitation, not a production deployment blocker.

- [x] Production activation and exact source version verified.
- [x] No new Azure Portal resources, credentials, DNS, Firebase or payment setup required.
- [ ] Complete post-change local Chrome visual verification when native safety can confirm the URL.
- [ ] For a fresh ZIP-based local setup only, create `.env.local` from the supplied blank template and populate existing approved local/test values outside chat.

- [ ] Verify landing-assets gzip/Brotli delivery, decoded hashes and warm cache after Azure edge propagation. Configuration succeeded, but the final edge probe still used identity encoding with CONFIG_NOCACHE.

## Runtime limits

Observed baseline: one replica, 0.25 CPU, 0.5 GiB memory, approximately 88% memory use. There is no load-test proof for 1M concurrent users. Any paid capacity increase requires a separate reviewed decision.

## Next steps

- Complete post-change visual checks in a known local Chrome window when native safety can confirm its URL.
- Verify gzip/Brotli delivery, decoded SHA-256 equality and warm cache for /landing-v20/assets/* after Azure edge propagation. This is the only pending compression verification; no auth-assets expansion is pending.
- Monitor real response times and error rates after release.
- Plan a separate representative load test before making any 1M concurrent-user capacity claim.
- Review and merge the performance branch through the repository's normal review/checks; the verified live source is the recorded candidate revision.

## Delivered artifacts

The PDF contains 279 pages, including complete changed-file listings. `FullChangedFiles.md` preserves exact source in the requested file-tree/full-content format. `source-inventory.json` records SHA-256 checksums. The complete customer module is under `apps/customer-web-next/` and the editable landing module under `apps/landing-v20/` in the ZIP. Complete release-helper changes are under `source-changes/scripts/release/` and apply to the reviewed original repository, where their existing helper dependencies reside. Sanitized public-asset and CDN configuration receipts are included when supplied. Credentials and generated runtime files are excluded.
