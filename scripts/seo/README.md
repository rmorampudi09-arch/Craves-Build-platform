# Public SEO acceptance and release

The public search entry points are the homepage, Hyderabad customer and chef
guides, public pricing, contact, and the four existing policy pages. Keep the
allowlist in `src/lib/public-seo.ts` and the HTTP verifier aligned. Account,
checkout, operational and address-dependent catalog screens carry `noindex`.
This is indexing control, not an authentication or privacy boundary.

Public pages must return 200, unique titles, a single self-canonical, descriptive
metadata and absolute social image URLs. The sitemap contains only these public
canonical pages. No fabricated review, price, address, opening-hours, local
store or product schema is included. The Hyderabad areas guide explicitly
requires an address-based availability check; it does not promise citywide
delivery. Do not create duplicate neighbourhood doorway pages.

The homepage Organization/WebSite schema and footer use the profiles verified
on 2026-09-27: Facebook page 61594485405454, Instagram `craves.in_`, and LinkedIn
`craves-technologies-private-limited`. Verify ownership before adding others.
The original X and YouTube availability notices remain until official accounts
are verified. Do not substitute similarly named businesses.

## Build and verify

From the repository root, first run the normal clean installs, landing lint and
build in `apps/landing-v20`, then web lint, typecheck, tests and build in
`apps/customer-web-next`. Run:

```sh
python3 scripts/seo/verify-built-seo.py > public-seo.json
```

The verifier checks nine public routes, five representative account routes,
sitemap, robots discovery, canonical www redirects and real image optimizer
responses. The full launch regression web job runs this check automatically.
Responsive images preserve the original artwork and cache fingerprints; Vite
development and optimizer errors use the original images. Desktop and mobile
visual checks and a new production PageSpeed report are still required after
deployment; local byte savings are not a measured production speed score.

## Release and post-deployment sequence

1. Obtain the existing required review and passing complete launch regression
   for the exact release SHA. Merge through normal branch protection.
2. Verify the currently active Azure tenant, registry, Front Door and web app;
   older deployment targets may predate the infrastructure migration. Use the
   existing guarded production pipeline. Do not replace deployment safeguards.
3. Run `python3 scripts/seo/verify-public-seo.py --check-images` against production.
   Verify the actual www host redirects with HTTPS, including path and query,
   since a local Host-header check cannot validate edge routing or certificates.
4. Confirm the nine public URLs are reachable and indexable, and the guide links
   and sign-in entry work on mobile and desktop. Verify image fallback, console
   errors and any image optimizer proxy/cache behavior.
5. Only after the live sitemap returns 200, submit
   `https://craves.in/sitemap.xml` in Google Search Console and Bing Webmaster
   Tools. Inspect the two new guide URLs and request indexing once if available.
   A submission is not an indexing or ranking guarantee.
6. Record the release SHA, deployment ID, HTTP evidence and fresh performance
   report. Monitor Search Console indexing, clicks, queries and real-user Core
   Web Vitals when sufficient data appears.

Rollback uses the prior verified web revision through the existing deployment
process. Do not change backend services or infrastructure to roll back this
web-only change.

## Verified baseline, 2026-09-27

Live homepage was indexed and HTTPS-valid; Search Console showed no manual
actions or security issues. Indexing/performance reports were processing and
Core Web Vitals lacked sufficient real-user data. The live sitemap returned 404;
the only Search Console submission was a stale `/` entry reporting one error.

PageSpeed mobile lab run: performance 82, accessibility 93, best practices 100,
basic SEO 100; FCP/LCP 2.7s, TBT 0ms, CLS 0.075, Speed Index 9.6s.
It reported about 7,711 KiB potential image savings. Outstanding accessibility
items included contrast, heading order and video captions. Footer heading order
and the three flagged contrast elements are corrected here. The existing muted,
non-interactive hero background video is marked decorative for assistive
technology; its visual headline remains real accessible text. Future informative
or audible videos need accurate captions rather than decorative semantics.
The 100 basic SEO score is not a ranking or completeness guarantee.

Google Business Profile requires verified eligibility and accurate physical
business facts. Do not invent a storefront, address, service areas, hours or
phone number. Bing/Instagram authentication and LinkedIn admin access must be
resolved through their normal account flows before account-only edits.

Primary references: [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[Organization data](https://developers.google.com/search/docs/appearance/structured-data/organization),
[site names](https://developers.google.com/search/docs/appearance/site-names),
[spam policies](https://developers.google.com/search/docs/essentials/spam-policies),
[Business Profile eligibility](https://support.google.com/business/answer/13763036),
[Bing guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a).
