# Security notes

- Authentication tokens are server-only, HTTP-only cookies.
- Mutating BFF routes require same-origin requests.
- Razorpay secrets and Firebase Admin credentials do not belong in this repository or its environment files.
- `sharp` is pinned and overridden to `0.35.4`; Next.js and its ESLint configuration are pinned to `16.3.5`.

## September 2026 dependency review

The former August PostCSS exception is closed. Next.js 16.3.5 contains a patched PostCSS version; the reviewed lockfile also updates affected nanoid and baseline-browser-mapping dependencies. Run `npm ci` and `npm audit --omit=dev` against the exact release lockfile and retain their actual results.

The upgrade also addresses the [Next.js AVIF image-optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and the [sharp/libheif advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). The sharp issue can affect Linux image processing; a Linux deployment does not make that advisory inapplicable.

No exploit payload is needed for production acceptance. Verify the deployed image came from the reviewed lockfile, normal image rendering works, and the final dependency audit passes. Recheck advisories for each release instead of treating this snapshot as permanent assurance.
