# Craves landing page v20

This is the user's uploaded landing design, integrated into the existing Next.js customer web application. The page is a separate HTML document served by an exact `/` rewrite. Its styles, React runtime, splash, and scroll behavior cannot leak into the customer, chef, admin, cart, or checkout documents.

## Source and output

- `src/`, `index.html`, and `vite.config.ts`: editable landing source.
- `../customer-web-next/public/landing-v20/`: original referenced images and committed production output. The original hero video is assembled from ten checked binary parts in `../customer-web-next/assets/landing-v20/` by `scripts/restore-landing-media.mjs` during the existing prebuild/predev step; SHA-256 checks guarantee identical served bytes. No compression or visual change is applied.
- `../customer-web-next/next.config.ts`: exact root rewrite; every other route retains the existing implementation.
- `../customer-web-next/eslint.config.mjs`: generated landing bundles excluded from Next.js source lint. The landing source has its own lint command.

The uploaded ZIP SHA-256 is `f228311ec018ddfa6958cb0b6c7808b855a56f866331f41d9b0c897a9881e290`. Image bytes, hero video, page content, splash timing and scroll behavior are preserved. The September 17 correction removes screen-height-dependent empty space from the features section and the closing quote. Only two unused duplicate video exports, Windows dependency caches and temporary build files are omitted from the repository import.

## Links

| Control | Destination |
| --- | --- |
| Sign up / Sign in | Original customer/chef `AuthModal`, opened over this landing page |
| Start cooking with Craves / Become a chef | `/chef/application` |
| Chef resources | `/chef` |
| Earnings | `/chef/earnings` |
| Contact / Help center | `/contact` |
| Privacy policy | `/privacy` |
| Terms of service | `/terms` |
| Refund policy | `/refunds-cancellations` |
| Security | `/security` |
| Section navigation / About us | Original page sections |
| Get the App | Coming-soon placeholder until App Store and Google Play approval; no authentication action |
| Social icons | Availability dialog with `/contact` action |
| Guidelines | Guidance dialog with `/chef/application` action |

No app-store URL or official social profile was supplied. Those controls do not invent external destinations. Dialogs support native keyboard focus, Escape and a Close button.

## Build locally

Requires Node.js 24. From this folder:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
node ../customer-web-next/scripts/restore-landing-media.mjs
npm run build
```

The Vite build writes only the landing output into the existing customer-web `public/landing-v20` directory. Static asset URLs include content fingerprints. Preserve referenced media there. Commit source and regenerated HTML/JS/CSS together. Old unreferenced generated bundle files may be removed after checking `index.html`.

From `../customer-web-next`, run the existing `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Start the existing web app and verify `/`, section scrolling, splash reload, dialog open/close, auth destination, chef destination, legal links, and browser Back. Compare `/home`, `/cart`, `/checkout`, and admin routing against the baseline.

## Deployment and manual work

Use the existing guarded Azure DevOps `azure-pipelines-razorpay-customer-web.yml` pipeline (definition 93). It requires merged main, the exact full commit SHA as both source and image tag, a successful full `launch-regression-ci.yml` run on that same main SHA, and the existing owner approval. Preserve deployment checks, credentials, runtime configuration, and rollback behavior. No new Azure resources, DNS, keys, payment changes or database migration are required.

Official App Store, Google Play and social profile URLs remain owner-provided follow-up configuration. Deployment and live verification results are recorded separately; a passing local build is not a claim that the page is live.

## Customer authentication correction — September 17, 2026

The sign-in link opens the existing `apps/customer-web-next/src/components/auth/AuthModal.tsx` directly over the new landing design. Its customer/chef role selection, registration, Firebase phone verification, email verification and same-origin session APIs are reused without copying their business logic. The dedicated `/sign-in` page and admin authentication remain unchanged.

- `src/components/CustomerAuth.tsx` loads the customer popup only when requested, showing a recoverable error if assets cannot load.
- `apps/customer-web-next/src/landing-auth/entry.tsx` mounts the original popup, preserves session-aware navigation, prevents background interaction while open, and restores focus/scrolling on close.
- `apps/customer-web-next/scripts/build-landing-auth.mjs` builds this entry during the existing Next prebuild using the same six allowlisted public Firebase variables. No new API, credentials or runtime settings are needed. The image-only adapter preserves the shared brand component in this standalone document.
- Generated authentication assets have content hashes and scoped CSS. The small manifest is fetched without caching. Authentication CSS cannot target the landing page. These deployment-specific assets are generated in `public/landing-auth`, not committed.
- `RiderSection.css` bounds the closing gap to 32–56px depending on width. `DeliveredWithCare.css` sizes to content instead of reserving nearly a full screen of height.

Run the existing customer-web checks and production build, plus the landing lint/build above. The rendered `landing-customer-auth.vitest.ts` covers both roles, registration, duplicate clicks, closing/reopening, focus/scroll cleanup and failed session lookup. Existing shared authentication regression tests continue to apply. Real OTP/email delivery still requires a user-controlled verification journey.
