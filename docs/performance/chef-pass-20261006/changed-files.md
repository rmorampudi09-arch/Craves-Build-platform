# Exact second-pass source file map

Diff baseline: `a05205bf7708083392ba38730d277e1f8fde7dbb`. Frozen candidate: `739650f223f2edc0dd8914b28e23916b421da9f1`. Exact diff contains **36 changed text files**. Validated customer-web tree: `65a58cb71a83b5e67c8a541153a4164050d2410a`. All paths below are repository-relative. This map explains responsibilities; the final complete-code appendix must supply every changed text file in `### path` fenced full-file form. No application source change in this second pass is in `apps/landing-v20`.

## Fresh access, dashboard and application

| Exact file | What changed and why |
|---|---|
| `apps/customer-web-next/src/services/auth/cravesAuth.ts` | In-flight fresh role sharing independent of optional hydration; backward-compatible awaited default; 15-second identity/refresh abort; existing contract decoding; invalid fresh bodies fail closed. |
| `apps/customer-web-next/src/components/chef-access-boundary.tsx` | Explicit skipped display hydration, retained ACTIVE/CHEF and JWT rotation, bounded unavailable/retry state and account-keyed child reset. |
| `apps/customer-web-next/src/components/chef-application-session-boundary.tsx` | Applicant identity checks skip optional profile, with captured owner guard and retained retry/timeouts. |
| `apps/customer-web-next/src/components/chef-mode-dashboard.tsx` | Session-keyed private state, independent pending/error summaries, kitchen/menu dependency and bounded per-read cleanup. |
| `apps/customer-web-next/src/components/chef-application-workspace.tsx` | Saved status before new-application prefills; edited-field/address-group guards; read/save/account revisions; location cleanup; explicit timeout retry. |
| `apps/customer-web-next/src/lib/chef-startup-performance.vitest.ts` | New rendered authorization, abort/retry, progressive summary, owner, prefill and mixed-address/coordinate cases. |
| `apps/customer-web-next/src/lib/session-performance.vitest.ts` | Additional fresh-role hydration-sharing, invalid-body, abort/retry and replacement-owner cases. |
| `apps/customer-web-next/src/lib/chef-application-session.vitest.ts` | Existing guided workflow assertions retained; optional-read count updated and late old-owner save receipt case added. |
| `apps/customer-web-next/src/lib/signed-in-integration.test.ts` | Necessary literal call assertions updated to explicit skip options; fresh-role and existing route assertions retained. |

## Independently loaded chef Profile and Operations

| Exact file | Responsibility |
|---|---|
| `apps/customer-web-next/src/hooks/use-chef-read-panels.ts` | New private panel hook with independently settled reads, 15-second timeout/race, owner/role/revision guards, retry and case-insensitive CHEF comparison matching the existing boundary. |
| `apps/customer-web-next/src/app/chef/profile/page.tsx` | Uses independent application/kitchen panels instead of a shared page loading barrier. |
| `apps/customer-web-next/src/components/chef-operations-workspace.tsx` | Independently shows healthy application/kitchen/menu/readiness; unconfirmed readiness remains unavailable. |
| `apps/customer-web-next/src/lib/chef-read-panels-performance.vitest.ts` | Slow/error/retry/timeout/owner/logout/role-revocation behavioral checks. |
| `apps/customer-web-next/src/lib/chef-workspace-integration.test.ts` | One existing source-text assertion accepts formatting whitespace between the unchanged words of the weekly opening-hours contract limitation; wording and business rule remain intact. |

## Shared navigation and customer secondary content

| Exact file | Responsibility |
|---|---|
| `apps/customer-web-next/src/components/layout/BottomNav.tsx` | Lean shared route wrapper; customer-only content loads conditionally. |
| `apps/customer-web-next/src/components/layout/BottomNavContent.tsx` | Extracted customer navigation content, including customer motion code. |
| `apps/customer-web-next/src/components/profile/LazyAddressEditorFlow.tsx` | Address editor loads when used rather than in the page entry. |
| `apps/customer-web-next/src/components/profile/address-editor-loader.ts` | Shared deferred editor import/preload helper. |
| `apps/customer-web-next/src/screens/Profile/Addresses.tsx` | Identity/profile display wait removed; bounded visible auth failure/retry; deferred address editor. |
| `apps/customer-web-next/src/screens/Checkout/Checkout.tsx` | Defers existing payment code until the corresponding checkout flow needs it. |
| `apps/customer-web-next/src/components/checkout/CheckoutPaymentButton.tsx` | Deferred payment component import without new pricing/payment authority. |
| `apps/customer-web-next/src/components/checkout/RazorpayPayment.tsx` | Loading boundary for the existing inherited payment integration. |
| `apps/customer-web-next/src/lib/bottom-nav-loading.vitest.ts` | New conditional navigation-loading checks. |
| `apps/customer-web-next/src/lib/customer-secondary-loading.vitest.ts` | Deferred address/payment behavior and identity failure/retry checks. |
| `apps/customer-web-next/src/lib/all-chefs-navigation.test.ts` | Existing navigation source reference adjusted for extracted content. |
| `apps/customer-web-next/src/lib/mobile-customer-experience.test.ts` | Existing mobile navigation assertions retained with extraction. |
| `apps/customer-web-next/src/lib/cart-checkout-integration.test.ts` | Existing checkout/payment assertions adjusted for deferred imports. |
| `apps/customer-web-next/src/lib/precise-customer-chef-ui.test.ts` | Existing UI source references adjusted for extracted/deferred modules. |

## Admin source isolation and guarded successor release

| Exact file | Responsibility |
|---|---|
| `apps/customer-web-next/src/app/admin/layout.tsx` | Removes eager shared admin style/library imports. |
| `apps/customer-web-next/src/components/admin-workspace.tsx` | Removes eager visual library stylesheet import. |
| `apps/customer-web-next/src/components/admin-dashboard-visuals.tsx` | Owns relevant visual-library styles where needed. |
| `apps/customer-web-next/src/app/admin/academy/academy.css` | Scopes/adjusts inherited academy font behavior. |
| `apps/customer-web-next/src/styles/admin-control.css` | Scopes/adjusts inherited admin typography. |
| `apps/customer-web-next/src/lib/admin-library-loading.vitest.ts` | New module-boundary checks for isolated visual library/style loading. |
| `scripts/release/web_performance_release.py` | Explicit reviewed successor receipt mode while retaining strict source/image/runtime/traffic/protected-app/recovery guards. |
| `scripts/release/tests/test_web_performance_release.py` | Expanded successor-receipt provenance/guard tests. |

The separate active admin application image was not proven to come from this candidate. Treat those admin source changes as reviewed candidate code and build payload changes, not evidence of deployment to `admin.craves.in`. The CDN static-asset check is a distinct operation and must be reported with its own exact receipt.

## Separately reviewed existing APIM configuration and executor

These are **15 additional full-file appendices**, separate from the 36 changed source/test/helper files above. They record the seven existing document operation policies before the repair, seven exact target payloads and the executed guarded correction script. They do not change the frozen application tree. Preserve original XML bytes and the recorded hash recovery method; do not silently normalize recovery snapshots.

| Exact repository-relative path | Delivered purpose |
|---|---|
| `docs/performance/chef-pass-20261006/documents-routing-capabilities-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-create-document-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-list-documents-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-get-document-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-download-document-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-email-document-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-email-history-policy-before.xml` | Frozen original operation policy; recovery evidence |
| `docs/performance/chef-pass-20261006/documents-routing-capabilities-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-create-document-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-list-documents-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-get-document-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-download-document-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-email-document-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-email-history-proposed-policy-put.json` | Exact reviewed target policy payload |
| `docs/performance/chef-pass-20261006/documents-routing-existing-only-repair.py` | Existing-only guarded executor; inspection default, ETag/app/scope guards and drift-safe recovery |

The full appendix therefore supplies **51 text files**: 36 source/test/helper files plus these 15 reviewed configuration/script files. The seven conditional updates/readbacks and all application/cache boundaries were verified, followed by three native capability/list GET200 checks. Document generation/download/email remains untested. These snapshots and targets are historical evidence and recovery inputs, not instructions to replay the already completed update.

Exact operating context: [DOCUMENTS-ROUTING-REPAIR-RUNBOOK.md](DOCUMENTS-ROUTING-REPAIR-RUNBOOK.md), `documents-routing-repair-readonly-proposal.json`, `documents-routing-all-operation-policy-preflight.json`, `documents-routing-repair-applied-receipt.json`, `native-chrome-statements-after-routing.json` and `documents-routing-repair-functional-proof.json`. The executed executor hash is `393dc85566e5beac3a152d9f1f618dcda54a18a0bf7f94f93eda739ddaa65d39`; source739 and all app images/runtimes/IAM/tiers were preserved during this routing correction.

## Unchanged references to retain in the complete package

Retain `azure-pipelines-customer-web-next-integration-ci.yml` at repository root as the existing manually started integration-check reference. Retain the inherited module READMEs and existing historical root contract fixtures required by `npm test`, clearly identified as read-only references rather than release instructions. Do not include `.env` files, secrets, build output, dependency folders, raw logs or probe `.tmp` files.

## New handover content

This pass's narrative lives under `docs/performance/chef-pass-20261006/`: `README.md`, `CHANGELOG.md`, this file map, later full-file appendix and exact sanitized receipts. The separate artifacts are `output/pdf/Craves_Chef_All_Pages_Performance_Handover_20261006.pdf` and `output/performance/Craves_Chef_All_Pages_Performance_Source_20261006.zip`. Their external artifact-verification receipt records final page count, source inventory, CRC, full-page rendering, privacy exclusions and hashes. It is written after generation and does not create a PDF self-hash loop. The earlier `docs/performance/README.md` and first-pass PDF/ZIP remain untouched.
