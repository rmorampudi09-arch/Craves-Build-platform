# Second-pass change record

Date in the user's timezone: 6 October 2026. Baseline checkout: `a05205bf7708083392ba38730d277e1f8fde7dbb`. Frozen application/release-helper candidate: `739650f223f2edc0dd8914b28e23916b421da9f1`.

## Completed source changes

- Fresh chef access and applicant identity checks skip optional customer-profile display hydration. Role/token rotation still precedes approved protected children.
- Role synchronization shares its current identity request independently from caller hydration mode; the default stays awaited. `/auth/me` and refresh requests abort after 15 seconds, and invalid identity contracts fail closed. No authorization TTL or private HTTP cache was added.
- Chef dashboard sections settle independently after the role gate, with explicit pending/unavailable state, kitchen-before-menu dependency and account/session cleanup.
- Saved application status renders before optional customer display/address prefills. Late prefills respect edited and deliberately cleared fields, owner/read revisions and saves. Manual address edits invalidate the entire optional address group, preventing stale saved coordinates from mixing with new address text.
- Application load timeouts show Retry; map/current-location work ignores stale completions and cannot leave the locating indicator stuck after manual edits. Old-owner mutation receipts do not replace a new owner's application.
- Chef Profile/Operations use independently loaded, bounded private read panels with owner, role, retry and refresh guards.
- The private read-panel hook compares CHEF case-insensitively, matching the existing access boundary; a dedicated behavioral test covers that consistency.
- Shared navigation conditionally loads customer-only animation content; customer address session checks and checkout payment-code loading avoid unnecessary waits.
- Source-level admin style/import isolation is included in the customer-web candidate. Deployment of the separate live admin source remains distinct and unproven until active-image provenance is established.
- Release helper retains its strict guard and adds an explicit reviewed successor-release receipt path.
- One existing weekly opening-hours source-text assertion is whitespace-tolerant after formatting wrapped its unchanged phrase; the wording and business rule are retained.

## Review fixes before freeze

Independent review found the application timeout error matched the old loading-skeleton predicate; explicit load failure now renders a retry. Review also found a late saved address could fill untouched latitude/longitude after the applicant typed a kitchen address; any manual address edit now protects the whole address group. Both cases have behavioral tests.

## Focused checks completed

Final whole-application lint/typecheck/test/production build passed on source `739650f223f2edc0dd8914b28e23916b421da9f1`, web tree `65a58cb71a83b5e67c8a541153a4164050d2410a`: 708 Vitest tests across 56 files plus 365 Node tests, 1,073 unique total. Build ID: `VvkesMzFGGIoPjAuTQxOn`, 123 static pages verified from the build log. Saved validation evidence SHA-256: `8ec1705d8a54bbd00709ca3d18c5a8625b9617186f194ed1050350592bb00830`.

Earlier focused chef/Auth run: 140 tests across five Vitest files, all passed, including 22 newly added cases. Retained signed-in Node checks: 16/16. These focused checks, the six dedicated whitespace-correction Node checks and repeated intermediate runs are subsets/repeats, not additions to the final 1,073 unique tests.

Separate Python release-helper checks: 34 focused plus six inherited tests, 40 total. These guard release provenance/runtime/traffic boundaries and are not part of the 1,073 application tests.

## Completed production-build payload comparison

The 14 substantive chef page-entry manifests reduce raw JavaScript by 37.91–49.21%: dashboard 42.12%, profile 48.12%, operations 47.28%. All 15 listed chef patterns have no motion-bearing initial chunk in the final comparison. The public alias has zero entry bytes in both manifests, which does not mean zero real page traffic or a measured speedup. Chef entry CSS increased 788 B (approximately 0.32%). Gzip sizes are comparable estimates rather than measured downloads. Admin source-build savings remain distinct from the unproven source of the separate live admin application.

## Intermediate failures and final verification

The first full Vitest run on the earlier `89c8557fa96dcdf87f179af3f53261c3b855062b` candidate recorded 706 passes and one navigation-test timeout among 707 tests. The default 5,000 ms test timeout occurred during default-worker fanout with approximately 24 seconds of import work across 56 suites. Its failed raw log is preserved. Worker contention is a working explanation, not a confirmed application defect or passing result. No second-pass deployment was made from that run.

The next complete four-worker Vitest run on candidate `715cd9ec59466c2b26b0cd2c0f79c37b3e5a9948` passed 708 tests across 56 files. Its subsequent Node run failed only an old literal match for `no reviewed weekly opening-hours contract`, because formatting wrapped the unchanged text. That single assertion was made whitespace-tolerant while retaining its same wording and rule; all six dedicated Node checks passed. No runtime source changed. The second failed full-run log is preserved; this was not a final four-check pass and did not trigger deployment.

The exact source `739650f223f2edc0dd8914b28e23916b421da9f1` passed all four final checks with the complete Vitest suites and four workers. Its payload comparison is recorded. The guarded customer/chef release is verified: immutable image digest `9d96c9ffa88196aae401cad066d7c5d637bb971a6ce7b510a4a9f8ccd603a128`, healthy active revision `ca-craves-web-prodlow--0000077`, 100% traffic; runtime and all 12 protected applications unchanged. Release receipt SHA-256: `1db087272525ae03bea2a2da8468f14af852c31b0562921383676b8d98bde11a`.

Three native after-change rounds recorded dashboard/Profile/Operations median Network Finish of 2,830/1,570/1,220 ms, against single old samples of 7,290/1,850/2,710 ms. All nine raw samples are retained in README and `native-chrome-after.json` (2026-10-05 22:05:53 UTC), with read-only observations for all 15 unique chef route patterns. The all-zero order/public-alias visits only cover missing-record boundaries, and the pre-routing Statements denial is retained as historical evidence. Its later read-only acceptance is recorded separately below. These observations are not LCP/FCP, useful paint or a controlled causal guarantee. Total transfer changed modestly and Operations could transfer more bytes; Finance background 15-second polling makes growing Network Finish unsuitable as initial latency.

The final source739 anonymous shell survey recorded 198 samples: all 45 chef and 45 admin samples HTTP 200, 102 customer HTTP 200 and six expected invalid-ID 404s, no 5xx. All 118 current referenced static assets were 200. Two cold misses at 2,504.699/3,301.810 ms had matching decoded bytes on follow-up and 12 warm hits at 111.958–178.689 ms; one separate optional compressed-sweep connection timeout after 20 seconds remains a failed probe.

Live admin static gzip/Brotli and warm-cache proof completed: CSS 511,059 B to 142,345/121,925 B, JS 228,922 B to 71,591/66,534 B, all representative responses 200 with matching decoded hashes. All 12 final warm samples were hits at 158.024–301.442 ms; six private/non-static boundary probes remained CONFIG_NOCACHE. Final exact rule/route readback at 21:59:39 UTC preserved other routes and all 12 protected app fingerprints, with zero resources created. This completes the earlier propagation limitation. It does not establish or deploy the separate admin image's source.

The second-pass artifacts use separate PDF/ZIP names; their artifact-verification receipt records actual final page/hash/CRC/render/source/privacy results. The complete appendix contains 36 source/test/helper files and 15 reviewed configuration/script files. Focused or repeated runs are not additional unique tests.

## Existing Statements routing correction and final scoped acceptance

The earlier local capability GET403 and disabled Generate PDF are retained in `native-chrome-after.json`, including the 401-to-403 screen-reading correction and retake after normal profile/address GETs. Eleven compared document/UI/Auth/backend source blobs were unchanged; no new frontend denial gate was found. No prior signed-in Statements baseline or authenticated old upstream URL trace was captured, so historical onset and exact old composed URL remain unproven.

The separately authorized existing APIM correction added only a host-root `set-backend-service` before the unchanged full-path rewrite in seven known operation policies, capabilities last. All seven conditional updates/readbacks passed at 22:26:11 UTC, with no apply failures, ambiguous writes or rollback. API/global policies, 14 operation definitions, seven wildcard policy absences, roles/authorization/headers/concurrency, tier/location and all 13 app fingerprints remained unchanged. Anonymous statuses/cache boundaries stayed 401/401/404/401 and private/no-store/CONFIG_NOCACHE. No new resource, backend/application image, IAM or scaling change was made.

Three signed-in native reloads then returned capability/list GET200: capability 430/74/62 ms and list 373/75/243 ms. DCL 286/215/166 ms; load 528/335/284 ms; Network Finish 2,450/913/964 ms. Generate PDF was enabled and the saved list rendered each round. Fresh refresh was 200 each time; Auth me200 was visible only in the first round, later values stay unobserved. No document was generated, downloaded or emailed and no private body/credential/cookie was extracted. Final browser state returned to chef home with DevTools closed. This is read-only capability/list acceptance, not write/export/email completion or all chef action coverage.

Exact evidence: `native-chrome-statements-after-routing.json` SHA-256 `0eb3ae3bfded849403752838add15f7cb65366aa177001ce292e1ffeee197b65`; unchanged configuration-stage `documents-routing-repair-applied-receipt.json` SHA-256 `109dd22f797048ad3781ec6fa11f1ff01a32c4904efe8070a7b7e7c71c0ee44c`; separate final `documents-routing-repair-functional-proof.json` SHA-256 `9e316bfba82a6c73f1b8b8878ede5b777ad4f13da2eef3fd08b86c0a477c84f2`. The final proof supersedes only the historical pending-functional snapshot, without changing its bytes.

The [runbook](DOCUMENTS-ROUTING-REPAIR-RUNBOOK.md), seven original XML policies, seven exact reviewed JSON targets and guarded executor are supplied in full. Executed executor SHA-256 is `393dc85566e5beac3a152d9f1f618dcda54a18a0bf7f94f93eda739ddaa65d39`, unchanged during application. Its offline seven-policy/four-rejection checks are separate from the app/release-helper totals. Evidence/configuration is not permission to replay this completed change. Source739 and source validation remained frozen.

## Historical evidence preserved

The first pass's PDF/ZIP and source/deployment evidence remain untouched. This later audit resolved its earlier landing compression propagation limitation with decoded-byte/status/compression/warm-hit proof. The later receipts supersede that specific old pending status without rewriting the original artifacts.
