# Craves web flow fixes

Base: exact live source 739650f223f2edc0dd8914b28e23916b421da9f1, image sha256:9d96c9ffa88196aae401cad066d7c5d637bb971a6ce7b510a4a9f8ccd603a128.

This patch aligns the landing OTP countdown with the adapter's server/local deadline, maps OTP failures to reviewed text, shows a normal sign-in prompt for an authoritative signed-out chef application request, and restores Home browser caches after hydration.

Product files:
- apps/customer-web-next/src/lib/msg91-browser.ts: exposes the actual resend deadline without altering provider, cooldown, attempt or resend limits.
- apps/customer-web-next/src/landing-auth/AuthModal.tsx: displays the returned deadline; retains the prior 30-second fallback for compatible callers.
- apps/customer-web-next/src/landing-auth/entry.tsx: passes deadlines and maps verification errors.
- apps/customer-web-next/src/lib/phone-auth-errors.ts: reviewed OTP request and verification copy.
- apps/customer-web-next/src/components/chef-application-session-boundary.tsx: uses existing typed authentication-required detection, preserving refresh and stale-session protections.
- apps/customer-web-next/src/screens/public/BrowseFoods/BrowseFoods.tsx: deterministic first render, cache restoration after hydration and existing fresh checks.

## Local setup and checks
Use Node 24.21 or another supported Node 24 version. In apps/customer-web-next:
npm ci --ignore-scripts
npm run typecheck
npm run lint
npx vitest run --maxWorkers=2
node --test --experimental-strip-types src/lib/*.test.ts
npm run build
npm start

Reuse the existing NEXT_PUBLIC_FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, APP_ID, MESSAGING_SENDER_ID, STORAGE_BUCKET build settings and existing payment/catalog flags. Server settings are documented in the application README and .env.example. Do not paste credentials into chat or commit them.

Browser tests are supplied in the QA evidence package. They block non-read checkout, order and payment requests before forwarding any API call. Local browser verification proxies the unchanged live API to the local compiled web UI; live verification runs against craves.in.

## Manual steps required
No new resources, DNS, Firebase providers, payment credentials or scaling changes are required.
An authorized admin test session, an approved chef test account, and genuine applicant evidence remain necessary to validate successful chef approval and public publishing. Workbook role labels grant no privileges.
The temporary phone bypass retains its existing expiry; this patch does not extend it.
Opening a real payment popup currently creates unpaid order records first, so that action remains excluded while order creation is prohibited.

## Deployment and rollback
Only replace the web image and its CRAVES_BUILD_SHA after verification. Capture the exact current image/configuration and all other app fingerprints, compare immediately before and after rollout, preserve every other setting, and verify ready revision and public /api/version.
Rollback restores the captured web image/SHA. It does not change business data, backend images, roles or infrastructure. Do not run any auth bypass activation helper again.
