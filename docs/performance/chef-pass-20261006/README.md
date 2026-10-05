# Craves chef and all-page performance: second pass

This second pass removes avoidable waits before chef content appears, makes dashboard summaries settle independently, protects application drafts from late optional prefills, and reduces shared page payloads. It follows the user's request to make chef pages and every page faster and to check the result repeatedly on their own computer. This document is a separate continuation; the first handover, PDF and ZIP remain historical records with their original bytes.

**Candidate source:** `739650f223f2edc0dd8914b28e23916b421da9f1`. **Starting checkout:** `a05205bf7708083392ba38730d277e1f8fde7dbb`. **Previously deployed application source:** `dc74bfa3880b18278b015f57ae393fb25133acdf`.

All four final checks passed against this exact source: lint, typecheck, **708 Vitest tests across 56 files plus 365 Node tests = 1,073 tests**, and production build with **123 static pages**. The production build ID is `VvkesMzFGGIoPjAuTQxOn`; the validated web tree is `65a58cb71a83b5e67c8a541153a4164050d2410a`. Saved validation evidence SHA-256: `8ec1705d8a54bbd00709ca3d18c5a8625b9617186f194ed1050350592bb00830`.

**The customer and chef release is verified.** Receipt `release-deploy.json` has `verified: true`, exact source `739650f223f2edc0dd8914b28e23916b421da9f1`, immutable image digest `9d96c9ffa88196aae401cad066d7c5d637bb971a6ce7b510a4a9f8ccd603a128` and healthy active revision `ca-craves-web-prodlow--0000077` serving 100% traffic. The web's runtime and all 12 protected application fingerprints remain unchanged. Release receipt SHA-256: `1db087272525ae03bea2a2da8468f14af852c31b0562921383676b8d98bde11a`. Three after-change local Chrome rounds are recorded for the dashboard, Profile and Operations. Repeated post-release HTTP checks and live admin static gzip/Brotli and warm-cache proof are complete. A separately reviewed seven-operation existing APIM routing correction resolved the observed Statements capability denial; three signed-in capability/list reads now pass. Their measured scopes and limits appear below. The failed intermediate test runs remain recorded below.

Review: [draft pull request 423](https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/423). The existing Azure DevOps integration-check YAML is retained. No CI standardization, new payment provider, new backend architecture, new service or scaling tier was chosen in this performance repair.

## What was slow and what changed

The anonymous HTML shell was already quick on the measured network path. The remaining waits were inside the browser: optional customer-profile hydration preceded chef access, the dashboard withheld every summary until the slowest request finished, the application waited for profile and addresses before displaying its saved status, and shared navigation eagerly brought animation code onto routes that did not need it. Profile and Operations also grouped independent reads into one loading barrier.

The candidate keeps fresh identity, current role, current application, kitchen, email verification and operational readiness checks authoritative. It changes when independent display information is allowed to appear. A slow earnings request therefore no longer holds up a healthy kitchen summary, and a saved application does not wait for an optional customer address.

The user can still see real loading or error states. Pending orders do not appear as zero orders; failed earnings do not appear as no earnings; failed kitchen reads do not suggest that the kitchen is missing; unconfirmed readiness does not become approval. Tools stay closed while access is unconfirmed. Retry starts a new request after bounded failures.

## Scope: customer/chef application versus separate admin host

The released web application's customer and chef routes are the frontend deployment target. The separate live admin application has a different active image. The read-only provenance audit did not find a trustworthy OCI source label, `CRAVES_BUILD_SHA` or public version receipt for that admin image. Consequently, source-level admin import/style isolation in this candidate is not proof that those changes reached the live admin host, and this frontend release must not replace the admin image without establishing its source and approved release path.

The release audit separately authorized existing public admin JavaScript/CSS compression and honoring the origin's cache headers. Live gzip, Brotli and warm-cache behavior are now verified with matching decoded bytes. Final rule/route readback at 2026-10-05 21:59:39 UTC confirms the exact approved configuration, all other routes preserved, all 12 protected app fingerprints unchanged and zero new resources. Six HTML/sign-in/API/non-static boundary probes remained CONFIG_NOCACHE. This CDN work is a separate fact from deploying admin source: it does not establish the active admin image's source, and it adds no public cache override to private responses.

The original module README contains older, broader deployment instructions. It is useful for local setup and contract context, but do not queue an old platform or provider deployment YAML to reproduce this performance release. Use only the reviewed guarded release helper and its exact saved validation/release receipts.

## Available user request and reconstructed session record

The exact initial user request available in this task was:

> my website is loading too slow on all pages. make sure it should be superfast. take my system control and work. not on cloud browser

The exact follow-up, subsequently supplied by the root task, was:

> chef pages, everypage, should be so faster. cross check again and agian make everything so faster

These are the available exact user requests; this document does not invent the missing turns between them. The project instructions require complete runnable code, an actual ZIP, module setup/CI/manual steps, exact changed paths, pending items and a handover of at least 50 pages. These requirements carry into the second-pass final PDF and complete source appendix.

The record below reconstructs the decisions and actions from available messages and evidence. It is not an invented verbatim transcript of missing conversation turns.

1. The first pass was deployed and documented separately. Its source, receipts and artifacts were preserved.
2. The follow-up broadened the check to actual chef routes and other page payload/loading paths. Work continued in the isolated checkout instead of editing synced project references or the user's unrelated dirty checkout.
3. Read-only source review enumerated all 15 chef route patterns, checked their actual mounted components, and separated optional display waits from role, application, kitchen, email, pricing and payment gates.
4. Read-only network and Azure checks repeated anonymous shells and static assets. The first admin asset probe used the customer host; the audit corrected that host mismatch and checked admin assets at the owning admin host.
5. Local Windows Chrome baseline measurements were collected from an existing approved chef session. No cloud browser or credentials recorded in this report were used.
6. Source ownership was divided between chef access/dashboard/application, shared navigation/customer loading, and independently loading chef Profile/Operations panels. Edits did not overlap these ownership boundaries.
7. Fresh Auth work was given a bounded request timeout. Profile hydration became an explicit optional mode for role synchronization while its default awaited behavior was retained for existing callers.
8. Dedicated behavioral tests exercised slow and failed reads, actual abort/retry, current roles, account replacement, local draft preservation, and delayed mutation receipts.
9. Independent review found two additional application issues: timeout error text could match the loading-skeleton predicate, and a delayed saved address could mix old coordinates with a manually typed kitchen address. Both were fixed and tested before source freeze.
10. The initial second-pass candidate was frozen at `89c8557fa96dcdf87f179af3f53261c3b855062b`. The first full Vitest run recorded 706 passes and one navigation-test timeout among 707 tests; its raw log was preserved. A later consistency correction made the private panel hook's CHEF role check case-insensitive, matching the existing access boundary, and added a behavioral test. The next candidate `715cd9ec59466c2b26b0cd2c0f79c37b3e5a9948` passed the complete four-worker Vitest run, 708 tests across 56 files. The subsequent Node run failed one literal source-text assertion because formatting wrapped the existing phrase. The assertion was made whitespace-tolerant and all six dedicated Node checks passed; its failed full-run log was also preserved. The final source `739650f223f2edc0dd8914b28e23916b421da9f1`, with no runtime-source change from the previous candidate, passed all four complete validation checks and all 1,073 tests. Its guarded customer/chef release was verified on healthy active revision `ca-craves-web-prodlow--0000077`, with runtime and all 12 protected applications unchanged. Three post-release native rounds for the dashboard, Profile and Operations and the 198-sample anonymous shell survey were recorded against exact source 739650f. The existing admin static CDN change also reached verified gzip/Brotli and warm-hit behavior. The measurements below distinguish those live observations from source-build savings and signed-in workflow coverage.

11. The local Statements check found capability GET403. Read-only comparison found unchanged document/Auth source and a live APIM backend-prefix discrepancy; no earlier signed-in Statements baseline was available. The root task authorized only the reviewed seven-operation existing routing correction with exact proposal, ETag, policy and application guards.
12. All seven configuration updates/readbacks passed. Three subsequent signed-in native Statements checks returned capability/list GET200 with enabled Generate PDF and a rendered saved list. No document creation, download, email or private-body inspection occurred. Configuration and functional proof are separate immutable receipts; source739, roles, tiers and application fingerprints remained unchanged.

## Before-change local Chrome baseline

These three samples were taken in native Windows Chrome using the existing approved chef session, with DevTools Network **Disable cache** checked and **No throttling**. They refer to the earlier deployed source `dc74bfa3880b18278b015f57ae393fb25133acdf`.

| Route | DOM content loaded | Browser load | Network finish | Transferred bytes | Requests |
|---|---:|---:|---:|---:|---:|
| `/chef` | 345 ms | 688 ms | 7,290 ms | 655,583 | 62 |
| `/chef/profile` | 143 ms | 241 ms | 1,850 ms | 637,832 | 57 |
| `/chef/operations` | 269 ms | 445 ms | 2,710 ms | 575,674 | 53 |

Network Finish includes post-load API work and route prefetch. It is not LCP, FCP, a Core Web Vitals score or the moment useful content became visible. The dashboard's refresh request was approximately 2,000 ms and orders approximately 1,840 ms; application/kitchen/menu were approximately 137/105/112 ms and earnings 597 ms. Profile refresh/application/kitchen were approximately 250/134/134 ms. Operations refresh/application/kitchen/menu were approximately 237/131/122/127 ms, with readiness approximately 1,550 ms. These observations explain why waiting for every summary can be noticeable even when the HTML loads quickly.

The sanitized receipt is `native-chrome-baseline.json`. It records the observation conditions without copying account details, cookies or response bodies containing private data.

## After-change local Chrome results

The root task repeated `/chef`, `/chef/profile` and `/chef/operations` three times in native Windows Chrome on source `739650f223f2edc0dd8914b28e23916b421da9f1`, using the baseline's existing approved session, disabled browser cache and no throttling. The table retains every sample rather than reporting only the fastest one. The sanitized receipt is `native-chrome-after.json`, captured at 2026-10-05 22:05:53 UTC. It records visits to all 15 unique chef route patterns, including repeated Capacity, Finance and Statements checks; visited patterns do not mean every valid record/action functionally passed.

| Route | Round | DOM content loaded | Browser load | Network finish | Transferred bytes | Requests |
|---|---:|---:|---:|---:|---:|---:|
| `/chef` | 1 | 438 ms | 878 ms | 4,830 ms | 620,530 | 63 |
| `/chef` | 2 | 128 ms | 235 ms | 2,830 ms | 618,622 | 61 |
| `/chef` | 3 | 153 ms | 252 ms | 2,180 ms | 641,672 | 63 |
| `/chef/profile` | 1 | 131 ms | 280 ms | 2,010 ms | 623,207 | 57 |
| `/chef/profile` | 2 | 247 ms | 247 ms | 1,100 ms | 623,115 | 57 |
| `/chef/profile` | 3 | 113 ms | 220 ms | 1,570 ms | 646,160 | 59 |
| `/chef/operations` | 1 | 140 ms | 334 ms | 1,180 ms | 579,672 | 53 |
| `/chef/operations` | 2 | 116 ms | 275 ms | 1,330 ms | 602,715 | 55 |
| `/chef/operations` | 3 | 113 ms | 294 ms | 1,220 ms | 602,740 | 55 |

| Route | One before-change Network Finish sample | Median of three after-change samples |
|---|---:|---:|
| `/chef` | 7,290 ms | 2,830 ms |
| `/chef/profile` | 1,850 ms | 1,570 ms |
| `/chef/operations` | 2,710 ms | 1,220 ms |

These are one old sample versus three newer samples on one local network and edge path. Network Finish includes background API requests, common runtime, images and prefetch. It is not useful paint, LCP, FCP, a controlled causal experiment or a promise about every user's device. Whole-page transfer changes were modest; Operations transferred more bytes in these newer samples. The 42.12% dashboard page-entry JavaScript reduction therefore does not mean a 42.12% whole-network reduction. Profile's first newer Finish sample was also slower than its single old sample; the complete table preserves that variation.

Additional native visits showed the approved application state at Network Finish 879 ms, kitchen at 903 ms, menu at 1,760 ms, meal plans at 2,180 ms and media at 1,360 ms. Capacity recorded 3,800 ms with an approximately 2,640 ms API request, then 1,300 ms on repeat. Finance loaded in 458 ms on the first visit and 193 ms on repeat; its Network Finish grows as required application/bank polling continues every 15 seconds, so that Finish is not an initial-page latency comparison. Its initial reads were 117–163 ms and remained HTTP 200. These observed states retain their approval, application, kitchen, email and finance gates. Earnings loaded with DCL 149/load 246/Finish 1,220 ms; the chef Orders inbox showed its real empty state at DCL 121/load 214/Finish 2,110 ms. The all-zero chef order detail was only an unavailable-record boundary (171/354/864 ms, HTTP 403), and the public all-zero chef alias redirected to a readable kitchen not-found state (211/417/1,570 ms). Neither is a real owned-order or public-record benchmark. No application, order, availability, price, financial action or upload was submitted during these read-only route checks.

The application route later prefetched customer-home code after the initial chef scripts. This is an observed background navigation behavior, not evidence that motion-bearing code returned to the initial chef entry. The menu visit included three later lazy/viewport images of approximately 246 KB, 67.6 KB and 101 KB and roughly 1.1 MB of total traffic including common runtime/prefetch. A separately measured mobile image/prefetch budget remains useful future work; no frozen source was changed for these later observations. A fresh native Console snapshot showed no Uncaught, TypeError, ReferenceError or hydration-failed errors; the visible historical messages were HTTP denials and CSS preload warnings. The local session ended on the chef dashboard with DevTools closed. This snapshot is not proof of all runtime paths or all real-user devices.

## Repeated page-shell and CDN observations

The second-pass pre-release HTTP audit requested 66 route patterns in three rounds: 198 anonymous page-shell samples. Every chef sample returned HTTP 200; the slowest chef sample was 429.255 ms. No shell sample exceeded three seconds. Two isolated samples exceeded one second, and the audit recorded additional bounded follow-up rounds for those routes. Invalid all-zero customer order/tracking IDs produced expected 404s; those are not signed-in order performance results.

The table records the 15 actual chef route patterns. Some rows represent dynamic route patterns. Their HTTP samples are shell checks, not proof of every possible authenticated record or action.

| Route | Mounted content and required gate | Average HTTP shell | Maximum HTTP shell |
|---|---|---:|---:|
| `/chef` | Dashboard; fresh identity and role/token rotation | 158.700 ms | 173.789 ms |
| `/chef/application` | Applicant session boundary and application workspace | 157.680 ms | 166.041 ms |
| `/chef/capacity` | Approved boundary and capacity quick setup | 258.812 ms | 429.255 ms |
| `/chef/earnings` | Approved boundary and earnings ledger | 170.320 ms | 182.511 ms |
| `/chef/finance` | Approved boundary, verified email, bank/withdrawal/ledger panels | 206.517 ms | 263.250 ms |
| `/chef/kitchen` | Approved boundary and kitchen form | 208.290 ms | 299.612 ms |
| `/chef/meal-plans` | Approved boundary and subscription-plan manager | 179.372 ms | 204.864 ms |
| `/chef/menu` | Approved boundary and menu manager | 176.458 ms | 195.333 ms |
| `/chef/menu/media` | Approved boundary and menu manager | 173.729 ms | 180.769 ms |
| `/chef/operations` | Approved boundary and independent readiness panels | 176.037 ms | 192.239 ms |
| `/chef/orders` | Approved boundary and order inbox | 166.779 ms | 176.074 ms |
| `/chef/orders/[orderId]` | Approved boundary and chef-owned order detail | 178.726 ms | 201.461 ms |
| `/chef/profile` | Approved boundary and independently loaded application/kitchen | 168.597 ms | 193.674 ms |
| `/chef/statements` | Approved boundary and document center | 214.872 ms | 271.679 ms |
| `/chef/[id]` | Public chef profile alias; public catalog loader | 272.038 ms | 297.520 ms |

The first pass's landing gzip/Brotli propagation limitation was resolved in this later read-only audit: representative decoded asset bytes matched, gzip and Brotli were verified, and repeated warm-cache requests were hits. The authorized landing pattern remains only `/landing-v20/assets/*`; the auth prefix was not extended. Current Next assets likewise matched decoded bytes and verified compression/warm hits. These facts are timestamped in `second-pass-current-summary.json`, `landing-compression-check.json`, `landing-warm-cache-check.json` and `next-current-compression-check.json`. They supersede the older pending propagation statement without altering the original first-pass artifact.

The initial aggregate asset probe found 26 admin-only chunk URLs returning 404 at the customer host. That was a probe-host mismatch. Admin pages redirect to `admin.craves.in`, and the audit repeated those chunk requests there. Customer/chef assets were HTTP 200 at `craves.in`. See the owning-host correction receipts; do not report the initial mismatched-host results as a production admin defect.

## Statements routing repair and read-only acceptance

Before the route correction, `/chef/statements` rendered its document-center header/form with DOM content loaded 333 ms, load 468 ms and Network Finish 2,270 ms. GET `/api/documents/capabilities` returned **403 Forbidden**, approximately 1,010 ms, after successful fresh Auth checks, and Generate PDF stayed disabled. The initial screen reading was corrected from 401 to 403. A retake recorded DCL 294/load 436/Finish 1,670 ms and the same denial in approximately 76 ms after normal profile/address reads. These historical rows remain in `native-chrome-after.json`, now linked to the separate resolution receipt. They do not support optional profile hydration as the cause.

Read-only source comparison found the document proxy, document center, Statements route, Auth refresh/cookie/server renewal and Notification document/security files unchanged from `dc74bfa` to `739650f`. Missing cookies would yield 401; a disabled web flag would yield a 200 capability object with enabled false. The POST origin guard does not apply to the capability GET. Display hydration does not replace the document Bearer token or grant a role. No inspected frontend change introduced a new document 403 gate. There was no earlier signed-in Statements baseline, so this cannot prove that the denial existed before the performance release.

The existing APIM backend URL already ended with `/api/v1/documents`, while each of seven known operation policies rewrote the full `/api/v1/documents/...` path. The source setup expects an origin-root backend with those full rewrites. The separately reviewed correction inserted one operation-scoped `set-backend-service` pointing to the existing Notification host root before each existing rewrite, with capabilities applied last. The exact old composed upstream URL was not traced. The observed mapping discrepancy, followed by successful reads after this sole scoped correction, supports a routing explanation; it is not a captured authenticated backend trace.

Configuration verification completed at **2026-10-05 22:26:11 UTC**: all seven conditional updates and readbacks passed, with no failures, transport ambiguity or rollback. The API/global policies, all 14 operation definitions, seven absent wildcard policies, existing authorization/headers/validation/concurrency, tier/location and all 13 application fingerprints were preserved. Source739 and the deployed image were unchanged. Anonymous boundary statuses stayed **401/401/404/401**, with their existing private/no-store and edge CONFIG_NOCACHE behavior. No application image, IAM, role gate, scaling tier or resource was changed by this routing repair.

The root task then repeated Statements three times in the existing signed-in native Windows Chrome session:

| Round | DCL | Load | Network Finish | Capability GET | Saved-list GET | Transferred bytes | Requests |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 286 ms | 528 ms | 2,450 ms | 200 / 430 ms | 200 / 373 ms | 573,484 | 54 |
| 2 | 215 ms | 335 ms | 913 ms | 200 / 74 ms | 200 / 75 ms | 593,862 | 54 |
| 3 | 166 ms | 284 ms | 964 ms | 200 / 62 ms | 200 / 243 ms | 593,847 | 54 |

Generate PDF was enabled and the saved-document list rendered in all three rounds. Fresh Auth refresh returned 200 each round. Auth `/me` 200 was visible only in round one; later values remain unobserved, not assumed successful. No document was created, generated, downloaded or emailed; no private response body, credential or cookie was extracted. This verifies read-only capability/list acceptance and visible controls, not export/email completion, a Core Web Vitals result or all chef actions. The browser was restored to the chef dashboard with DevTools closed.

Exact records: [runbook](DOCUMENTS-ROUTING-REPAIR-RUNBOOK.md), [read-only source review](statements-capabilities-readonly-review.json), [frozen configuration receipt](documents-routing-repair-applied-receipt.json), [three native samples](native-chrome-statements-after-routing.json), and [separate final functional proof](documents-routing-repair-functional-proof.json). Configuration receipt SHA-256: `109dd22f797048ad3781ec6fa11f1ff01a32c4904efe8070a7b7e7c71c0ee44c`; native receipt: `0eb3ae3bfded849403752838add15f7cb65366aa177001ce292e1ffeee197b65`; functional proof: `9e316bfba82a6c73f1b8b8878ede5b777ad4f13da2eef3fd08b86c0a477c84f2`. The configuration-stage receipt keeps its original pending-functional snapshot; the separate final proof records the subsequent successful scoped acceptance without changing that history.

The delivered executor is `documents-routing-existing-only-repair.py`, SHA-256 `393dc85566e5beac3a152d9f1f618dcda54a18a0bf7f94f93eda739ddaa65d39`. It checks frozen proposal/supplement hashes, all scopes and application fingerprints before every ETag-protected update, verifies only the reviewed XML insertion, and restores only its own change when drift-safe. Unknown transport writes require manual review. Its default is inspection; an existing applied receipt blocks blind replay. Seven original XML snapshots and seven exact target JSON payloads are delivered with the executor. They are evidence and recovery inputs, not instructions to reapply an already completed change. Offline policy checks validated seven originals and rejected four unsafe variants; those separate checks are not added to the 1,073 application or 40 release-helper tests.

## Verified post-release HTTP, assets and admin CDN

The final anonymous survey on source `739650f` repeated 66 route patterns three times, for 198 samples. All 45 chef samples returned HTTP 200 with maximum 849.739 ms; all 45 admin samples returned HTTP 200 with maximum 608.666 ms. Customer samples were 102 HTTP 200 plus six expected 404s for the two deliberately invalid all-zero order/tracking IDs, with maximum 569.934 ms. There were no 5xx responses. The source version matched at both the start and end. These are page-shell observations, not signed-in record or action coverage. Receipt: `anonymous-page-shells-after739-three-rounds.json`.

All 118 current HTML-referenced Next JavaScript/CSS assets returned HTTP 200 on their owning hosts. Two customer cold misses took 2,504.699 and 3,301.810 ms. Bounded follow-up confirmed the same decoded bytes and 12 warm TCP_HIT responses at 111.958–178.689 ms. One additional optional compressed-sweep connection attempt timed out after 20 seconds; it is retained as a failed probe and is not counted as passing. The cold-miss and timeout observations prevent an unqualified claim that every asset request was fast. Receipts include `all-current-after739-referenced-next-assets.json`, `after739-cold-miss-followup-byte-equality.json` and `after739-cold-miss-followup-warm-cache.json`.

The existing admin static CDN now proves live gzip and Brotli delivery of representative CSS/JS with HTTP 200 and exact decoded hash equality:

| Representative asset | Uncompressed bytes | Gzip bytes | Brotli bytes |
|---|---:|---:|---:|
| CSS `21kzlhfktwm2o.css` | 511,059 | 142,345 | 121,925 |
| JavaScript `3kmozkq6tgqnz.js` | 228,922 | 71,591 | 66,534 |

All 12 repeated admin compressed warm probes were TCP_HIT at 158.024–301.442 ms. The six private/non-static boundary probes remained CONFIG_NOCACHE, including `/admin`, `/sign-in`, identity/admin APIs, an API path ending in `.js` and a non-static `.html` path. The API/sign-in responses retained their private/no-store headers; `/admin` still had its existing origin HTML header, and its edge behavior remained CONFIG_NOCACHE. Do not describe every admin response as carrying the same origin cache header. The final 21:59:39 UTC readback preserved all other routes and all 12 protected apps and created no resources. Receipts: `admin-static-propagation-06.json`, `admin-static-repeated-warm-cache-final.json`, `admin-private-boundaries-after-compression-verified.json` and `admin-static-final-configuration-readback.json`.

Earlier propagation receipts correctly recorded identity encoding and pending warm-cache proof at their own timestamps. The final receipts supersede that completed propagation limitation without rewriting those historical observations. Live admin compression is achieved; deployment of the separate admin application's source isolation remains unproven because its active image's source provenance is still unknown.

## Final production-build page-entry payload comparison

`route-payload-comparison.json` compares the unique JavaScript/CSS files referenced by production App Router page-entry manifests before and after the second pass. It belongs to source `739650f223f2edc0dd8914b28e23916b421da9f1` and web tree `65a58cb71a83b5e67c8a541153a4164050d2410a`. These raw build-file sizes are comparable source-build observations, not downloaded browser traffic. Its gzip figures are estimates, shared framework runtime may add bytes, and deferred modules can load later when used.

| Chef route | Before page-entry JS | After page-entry JS | Raw JS reduction |
|---|---:|---:|---:|
| `/chef` | 363,567 B | 210,415 B | 42.12% |
| `/chef/application` | 406,296 B | 252,258 B | 37.91% |
| `/chef/capacity` | 320,740 B | 165,972 B | 48.25% |
| `/chef/earnings` | 314,476 B | 159,708 B | 49.21% |
| `/chef/finance` | 342,351 B | 187,583 B | 45.21% |
| `/chef/kitchen` | 332,279 B | 177,511 B | 46.58% |
| `/chef/meal-plans` | 362,325 B | 207,557 B | 42.72% |
| `/chef/menu` | 369,093 B | 214,325 B | 41.93% |
| `/chef/menu/media` | 369,093 B | 214,325 B | 41.93% |
| `/chef/operations` | 325,618 B | 171,659 B | 47.28% |
| `/chef/orders` | 314,593 B | 160,144 B | 49.09% |
| `/chef/orders/[orderId]` | 327,415 B | 172,647 B | 47.27% |
| `/chef/profile` | 310,199 B | 160,926 B | 48.12% |
| `/chef/statements` | 318,282 B | 163,514 B | 48.63% |

All 15 listed chef route patterns have no motion-bearing initial page-entry chunk in the final comparison. The public `/chef/[id]` alias has zero page-entry bytes reported in both compared manifests; that means this measurement has no entry bytes for that alias, not that its real browser page downloads zero bytes or became faster by a measured amount. The 14 substantive entries above reduce raw JavaScript by 37.91–49.21%. Chef page-entry CSS increased from 243,730 to 244,518 B, an increase of 788 B (approximately 0.32%). Do not claim that every resource type became smaller.

The `/admin` source build changed page-entry JS from 616,523 to 111,231 B (81.96% lower) and CSS from 1,031,032 to 294,992 B (71.39% lower). These are source-build improvements only. The separate active admin image's source remains unproven; these figures do not show an admin source deployment or new live admin browser performance.

## Chef access and Auth changes

`src/services/auth/cravesAuth.ts` now lets `synchronizeSessionRoles` choose awaited, background or skipped customer-profile hydration. The default remains awaited. The fresh identity/token request is shared only while it is in flight, within the session generation, independently of each caller's display-hydration choice. A skipped or background caller therefore returns its fresh roles without waiting for a concurrently awaited display profile.

`/api/auth/me` and `/api/auth/refresh` browser requests have 15-second abort signals. A hung lookup can finish as a failure and release its in-flight entry, allowing a real retry. Settled roles are not given an authorization TTL. A later role check sends a fresh request even if display names are still fresh. Identity response bodies are decoded with the existing identity contract; an invalid successful response does not approve private content using an old saved identity.

`src/components/chef-access-boundary.tsx` skips optional customer-profile hydration while retaining current ACTIVE/CHEF checks and token rotation before Catalog/Order children mount. Failed checks keep children closed and offer retry; the screen check itself ends after 15 seconds. Account/session scope keys reset private child forms while healthy same-owner profile/email updates keep local work.

`src/components/chef-application-session-boundary.tsx` likewise skips optional display hydration and confirms the applicant's current active identity before mounting saved private details. Applicants do not need a pre-existing CHEF role to submit their application. Existing timeout, sign-in return path, retry and keyed owner reset remain in place, with an explicit captured-context guard on lookup completion.

## Dashboard behavior

`src/components/chef-mode-dashboard.tsx` subscribes to session/role/readiness changes and keys its private inner state by account/session scope. Logout, replacement login, role loss or inactive status removes the old snapshot. Late network completions are checked against both effect lifetime and captured session context, including at the functional state update.

After fresh role rotation, application, kitchen, orders and earnings begin independently. Their sections update when their own valid response arrives. Menu remains dependent on a valid existing kitchen; an authoritative null kitchen means setup is needed and does not make an invalid menu request. Each private summary read has its own 15-second abort. Application status already loaded for an applicant becoming approved is reused within that current startup instead of requested twice.

Every summary records pending and unavailable states. The card for orders shows Loading until its response arrives and a dash on failure. Earnings and menu show their own loading/error labels. The primary setup action waits until kitchen/menu are known and never suggests missing setup after a failed read. Malformed orders/earnings are unavailable, not empty arrays. The approval notice requires an actual approved application and a completed, nonfailed kitchen read.

## Application behavior and location correctness

`src/components/chef-application-workspace.tsx` loads and validates `/api/chef/application` first. Existing APPROVED, PENDING or REJECTED state is displayed without customer-profile/address prefills. Only a new NOT_SUBMITTED application starts optional profile/address requests, and those requests merge independently after the saved state is visible.

Prefill is allowed only for the same current owner, mounted component and read revision. A field the applicant typed or deliberately cleared is considered edited; a late profile does not replace it. A manual edit to any address field marks the entire optional address group edited, including coordinates. This prevents a delayed customer's saved address from attaching an unrelated latitude/longitude pair to a newly typed kitchen house or city. Existing already-entered values are retained; this performance repair does not invent new geocoding or delivery rules.

Map-pin and current-location work retain their own latest-request and owner checks. Manual address edits cancel the old location completion and clear the locating indicator so Continue is not stuck disabled. A save invalidates older reads/prefills/location work before posting. Its response and final busy-state update are accepted only for the captured current owner and mutation revision. An old owner's successful POST receipt cannot replace the next owner's loaded application.

Application reads end after 15 seconds. A timeout is an explicit load failure with Retry, not an endless skeleton. The existing 45-second save timeout and uncertain-save message are retained: the application does not pretend a timed-out mutation failed harmlessly or fabricate a pending/approved state. Verified Auth email, required fields, uploaded evidence and server-returned application status still determine what can be submitted or shown.

## Other frontend changes in this candidate

Profile and Operations use `src/hooks/use-chef-read-panels.ts` so independent private reads finish separately with bounded errors and retry. The hook checks account generation and current CHEF readiness, aborts abandoned requests and ignores responses from older refreshes. Its role comparison is case-insensitive, matching the existing chef access boundary; a dedicated behavioral test verifies that consistency. Missing readiness remains unknown and cannot make operational setup approved.

Shared `BottomNav` loads customer-only navigation/animation content conditionally in `BottomNavContent.tsx`; chef routes avoid the unnecessary shared animation payload. The customer address screen chooses a valid identity without waiting for display profile hydration and exposes a retry on failed or bounded session checks. The checkout screen delays payment-provider code until the checkout/payment portion is reached. Existing checkout totals, ownership, payment provider configuration and server-authoritative payment outcomes remain unchanged.

Admin styles are moved from eager shared layout/workspace imports to their relevant visual modules, and typography/academy font scoping is adjusted in the customer-web candidate. Their source improvement and build payload comparison are separate from deployment to the independently hosted live admin application.

The guarded release helper supports an explicit successor receipt, allowing this second frontend release to verify that the currently live image is the reviewed first performance release. The strict default guard is preserved. A successor release still requires exact source/image/validation provenance, unchanged runtime/traffic/protected applications, a healthy revision and recovery checks; it cannot use an arbitrary receipt to skip those rules.

## Focused validation and independent review

The final whole-application checks passed against the exact source/web tree recorded above: lint, typecheck, **708 Vitest tests across 56 files and 365 Node tests, 1,073 total**, and production build. Evidence: `local-validation/evidence.json`, SHA-256 `8ec1705d8a54bbd00709ca3d18c5a8625b9617186f194ed1050350592bb00830`. All four saved exit codes are zero; raw logs are retained outside the final sanitized package.

The earlier focused chef/Auth run passed **140 behavioral tests across five Vitest files**, including **22 new behavioral cases**. The retained signed-in Node integration file passed **16/16** checks. These focused checks and repeated runs are subsets/verification repeats and must not be added to the final unique total of 1,073. The six dedicated Node checks for the whitespace correction are likewise part of the full suite, not six extra tests.

The Python release-helper suites passed **34 focused plus six inherited tests, 40 total**. These verify the release guard and are separate from the 1,073 application tests; do not label them application tests or count repeated helper runs again.

Focused files:

- `src/lib/chef-startup-performance.vitest.ts`: 17 new rendered startup, timeout, ownership, progressive-summary, optional-prefill and mixed-location tests.
- `src/lib/session-performance.vitest.ts`: four new role-refresh tests for hydration-mode independence, fresh roles/invalid bodies, old-owner response isolation and an aborted refresh followed by a fresh retry.
- `src/lib/chef-application-session.vitest.ts`: existing guided application, rejection, applicant identity, timeout and owner behavior retained; one new delayed POST/account replacement case, plus the expected request count updated because failed primary application reads no longer start two optional prefills.
- `src/lib/chef-profile-session.vitest.ts`: existing role/logout/owner, finance, profile, kitchen/menu and first-step behavior retained.
- `src/lib/email-session-races.vitest.ts`: existing versioned verified-email, role refresh, logout and replacement-session races retained.
- `src/lib/signed-in-integration.test.ts`: only necessary literal call assertions updated for explicit skip hydration; the same fresh-role and route-boundary contract assertions remain.

The new tests verify that slow calls do not hold unrelated sections, pending calls do not report zeros, malformed data is an error, approved tools wait for fresh rotation, role denial fails closed, actual request abort releases a shared lookup, late account responses are ignored, and a deliberately cleared field stays cleared. The mixed-location test checks the typed address, absence of an old-coordinate map and the submitted null latitude/longitude; it is more than a text-input-only assertion.

The first full Vitest run against the earlier candidate recorded **706 passes and one failure among 707 tests**. A navigation test exceeded its default 5,000 ms timeout during default-worker fanout; the run also recorded approximately 24 seconds of import work across 56 suites. The failed raw log is preserved for audit and is not a passing validation receipt. Worker contention is the working explanation for the timeout, not proof of a fixed application defect.

The next complete Vitest run, using four workers against candidate `715cd9ec59466c2b26b0cd2c0f79c37b3e5a9948`, passed **708 tests across 56 files**. The following Node suite failed only its old literal match for `no reviewed weekly opening-hours contract`, because formatting had wrapped that unchanged phrase. The single assertion now accepts whitespace between the same words and retains the same rule. Its dedicated six Node checks passed. This second failed full-run raw log is preserved as well. No runtime source changed for the assertion correction.

All four full checks were rerun against final candidate `739650f223f2edc0dd8914b28e23916b421da9f1`, with the complete Vitest suites and four workers, and passed. No test was removed, skipped or reported as passed because a focused run had succeeded. Repeated runs and focused checks are not additional unique tests. No second-pass deployment was made from either failed full run; guarded deployment began only after the exact final candidate's saved checks passed.

Independent component review found and corrected the timeout-skeleton and address-coordinate races before freeze. The React checklist reviewed waterfall removal, effect lifecycle, typed response decoding, functional state updates, accessible retry controls and account reset keys. No new client cache library or dependency was introduced.

## Privacy and business safeguards

- No public or persistent private-response cache was introduced. Identity, role, application, kitchen, orders, earnings and authenticated fetches use no-store.
- Shared Auth requests are in-flight only and scoped by session generation; old-generation completion cannot clear or replace a newer in-flight request.
- The earlier bounded display-name freshness is display-only. Current role/status and token rotation remain freshly checked.
- Account/session replacement resets private child state. Email/profile projection cannot grant CHEF or change verified Auth email authority.
- Profile and address prefills never approve the chef application, set payment eligibility, change commission/tax/pricing or bypass food compliance/evidence checks.
- No new billable resource, replica, tier, backend deployment, secret, DNS record, auth provider or payment merchant setting is required for this frontend source change.
- The final package must exclude `.env`, cookies, tokens, raw runtime logs, `node_modules`, `.next` and temporary wire/header probe files. Retain only reviewed sanitized evidence and complete intended source files.

## Capacity and measurement limits

The observed live web revision was healthy with **0.25 CPU, 0.5 GiB and one replica**; minimum and maximum replicas remained one. The later 30-minute observation had a maximum five-minute average CPU percentage of 3.7 and reported maximum CPU 33; maximum average memory was 24 with reported maximum 25; recorded restart count was zero. These are metrics under observed current traffic, not a stress test. They should not be combined with the earlier approximately 88% memory observation as if both described the same workload or moment.

This runtime does not prove the platform's approximately one-million concurrent-user target. The repair reduces avoidable waiting and transfer, but Auth/database/API latency, geographic edge behavior, concurrent requests, memory pressure and downstream services still need measured capacity work before that target can be promised. This pass leaves billing-sensitive scaling decisions to an explicitly reviewed capacity plan.

HTTP shell timings cannot prove signed-in workflow speed. Native Chrome Network Finish cannot prove useful paint or LCP/FCP. Payload gzip estimates from build manifests are comparison estimates, not network measurements, and dynamic modules may load later when used. The final record must label each measurement accordingly and avoid presenting a single warm request as universal page performance.

## Local setup and tests

Use Node.js 24 and npm. Work in the complete repository/source package so retained root-level contract fixtures and the integration CI reference remain at their original paths. The bundled runtime used here was Node.js 24; the machine's older Node.js 22 did not satisfy the current jsdom/undici requirements.

For a development checkout, create `apps/customer-web-next/.env.local` locally using approved values. Do not paste secrets into chat. The following names are the safe setup template; blank public values must be supplied from the already configured web project. Use the approved server API URL, not an arbitrary production placeholder. A bare CI placeholder build is a check, not a working sign-in environment.

```dotenv
CRAVES_API_BASE_URL=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_RAZORPAY_MODE=sandbox
NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=false
```

The retained provider mode variable names reflect the current inherited frontend contract; this repair does not decide a new provider or change the locked product architecture. Browser-facing Firebase configuration is the Web SDK configuration, never a Firebase Admin private key. Existing server-only secrets stay in their existing approved runtime/Key Vault location. Optional provider-specific configuration remains documented in the inherited module README and existing runtime; no new credential is needed for this code repair.

From `apps/customer-web-next`:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

Open `http://localhost:3000` in the local browser. Use an approved test identity and test phone/provider configuration; enter codes only in the website. Avoid real financial mutations or customer orders during a performance-only comparison.

Focused commands:

```powershell
npx vitest run src/lib/chef-startup-performance.vitest.ts src/lib/chef-application-session.vitest.ts src/lib/chef-profile-session.vitest.ts src/lib/session-performance.vitest.ts src/lib/email-session-races.vitest.ts
node --test --experimental-strip-types src/lib/signed-in-integration.test.ts
```

Existing CI check: repository root `azure-pipelines-customer-web-next-integration-ci.yml`. It uses Node 24, npm ci, lint, typecheck, tests and production build, with `trigger: none` and `pr: none`. Its `ci.invalid` public placeholders and sandbox mode are for build/check execution. Production must preserve approved existing values. This pass does not queue that CI file or standardize on a new CI system.

## Manual steps required and actions already followed

No new Azure Portal resource creation, paid scaling change, secrets, Firebase project/provider setup, DNS, signing certificate, app-store work or payment account configuration is required by this frontend repair. The root task completed only the separately authorized existing CDN and seven-operation APIM routing updates; neither created a resource or changed a tier, IAM or application image beyond the verified frontend release. This documentation subtask made no infrastructure change. Candidate source stayed isolated from synced project references and unrelated local changes.

For the final release record, distinguish automated actions completed by the root task from items still requiring the user. Exact-source validation, payload comparison and guarded customer/chef deployment are complete and verified. The root task captured the native repeated samples and post-release HTTP/static surveys above and completed the authorized existing admin static CDN change with verified compression, warm hits and boundary preservation. The seven-operation existing APIM routing repair and three read-only Statements capability/list checks are also complete, with private boundaries preserved. The PR remains a draft for review/merge. Admin source deployment is separately blocked on trustworthy active-image provenance and its approved release path, not on a new frontend permission assumption.

Manual browser comparison checklist:

1. Keep the same approved test chef, browser, network throttle setting, cache setting and viewport for before/after samples.
2. Reload `/chef`, `/chef/profile` and `/chef/operations`; record each API and Network DOM/load/Finish separately. Do not call Finish useful paint.
3. Open every approved chef route from the route table and verify each active-role gate, content/error state and retry. Use valid chef-owned IDs for detail flows.
4. Verify CUSTOMER applicants can open their application; a current non-CHEF cannot open approved tools; inactive accounts and sign-out hide private content immediately.
5. Simulate a slow orders/earnings/readiness response in a development test environment. Healthy independent sections should remain usable, while pending/error sections remain explicit.
6. Type and clear application names before optional profile finishes. Type a kitchen address before optional saved address finishes; an unrelated saved pin must not appear or be submitted.
7. Check healthy same-owner email/profile updates preserve local forms; account switch/logout/role revocation must reset private drafts. Verify retry after a timed-out request makes a fresh lookup.
8. Recheck checkout totals and payment eligibility through controlled existing sandbox flows; do not infer correctness from a lighter chunk alone.

## Final release and verification record

| Item | Current recorded state |
|---|---|
| Frozen candidate source | `739650f223f2edc0dd8914b28e23916b421da9f1` |
| Final full lint/typecheck/test/build | All four passed; 708 Vitest/56 files plus 365 Node = 1,073; both failed intermediate full-run logs preserved |
| Final validation evidence | `local-validation/evidence.json`; SHA-256 `8ec1705d8a54bbd00709ca3d18c5a8625b9617186f194ed1050350592bb00830` |
| Final web tree and production build | `65a58cb71a83b5e67c8a541153a4164050d2410a`; build ID `VvkesMzFGGIoPjAuTQxOn`; 123 static pages |
| Final build payload comparison | `route-payload-comparison.json`; 14 substantive chef entries reduce raw JS 37.91–49.21%; CSS increases 788 B; alias measurement and network limits explicit |
| New customer/chef deployment source/image/revision | Verified source `739650f223f2edc0dd8914b28e23916b421da9f1`; digest `9d96c9ffa88196aae401cad066d7c5d637bb971a6ce7b510a4a9f8ccd603a128`; healthy active `ca-craves-web-prodlow--0000077`, 100% traffic |
| Release receipt | `release-deploy.json`; `verified: true`; SHA-256 `1db087272525ae03bea2a2da8468f14af852c31b0562921383676b8d98bde11a` |
| Other 12 app/runtime/traffic fingerprints | Unchanged through verified release; web runtime remains 0.25 CPU, 0.5 GiB, min/max one replica |
| Repeated post-release HTTP checks | 198 samples/66 patterns/three rounds: all 45 chef and 45 admin samples 200; 102 customer 200 plus six expected invalid-ID 404s; no 5xx |
| Native after-change chef/Profile/Operations timings | Three rounds each: median Network Finish 2,830/1,570/1,220 ms versus single old samples 7,290/1,850/2,710 ms; sample and metric limits explicit |
| Separate live admin source deployment | Not proven deployable; trustworthy source provenance/release path required |
| Statements document reads and existing routing | Seven scoped APIM policy corrections verified; three signed-in capability/list GET200, Generate PDF enabled and saved list rendered; no export/download/email acceptance |
| Public static compression | Landing/Next decoded bytes, gzip/Brotli and warm hits verified; all 118 current referenced assets 200; two cold misses and one failed optional timeout retained |
| Separate admin public static CDN | Live gzip/Brotli decoded equality and 12 warm hits verified; six protected boundaries CONFIG_NOCACHE; exact final readback at 21:59:39 UTC |
| Second-pass handover artifacts | `output/pdf/Craves_Chef_All_Pages_Performance_Handover_20261006.pdf` and `output/performance/Craves_Chef_All_Pages_Performance_Source_20261006.zip`; separate artifact-verification receipt records final page/hash/CRC/render/source/privacy results |
| Review/merge | Draft PR 423 remains the review location; do not infer merge completion |

## Next work and remaining risks

Exact-tree validation, production page-entry comparison, guarded customer/chef release, repeated post-release HTTP/static checks, three-round local Chrome comparison and live admin static compression/warm-cache proof are complete. Keep their measured scopes and outliers visible: there is no real-user Core Web Vitals dataset, controlled causal speed guarantee or load-test proof. Admin source deployment remains a separately scoped provenance/release task.

The separate handover artifacts are `output/pdf/Craves_Chef_All_Pages_Performance_Handover_20261006.pdf` and `output/performance/Craves_Chef_All_Pages_Performance_Source_20261006.zip`. They include complete changed source, the 15 reviewed policy/script appendices, retained CI/setup references and sanitized evidence. A separate `artifact-verification.json` receipt records their final page count, hashes, archive CRC, full-page rendering, source inventory and privacy checks after generation. It avoids a PDF self-hash loop. The original first-pass PDF/ZIP remain immutable.

The observed Statements capability denial is resolved by the reviewed existing routing correction, with three capability/list reads accepted. Document creation, export/download/email acceptance remains untested and must use a separately controlled product workflow; no authorization gate was relaxed. All 15 patterns were visited, but invalid-ID examples and read-only checks do not establish every real-record mutation workflow.

For the separately hosted live admin source, first establish which reviewed source built its active image and which approved process owns that release. CDN compression alone is not a source deployment. For the million-user objective, plan representative load tests and capacity sizing separately; billing-sensitive provisioning and scaling are outside this frontend repair.
