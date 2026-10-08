# Chef onboarding web UI/UX redesign — 9 October 2026

Scope: **website UI/UX only** (`apps/customer-web-next`). Built on the existing onboarding implementation from PR #440/#442 and `main` at `422349f6`. No backend, APIM, mobile, database or pipeline file changes. Bank / RazorpayX stays deferred exactly as configured (`bankEnrollmentRequired=false`).

## What changed for applicants

| Area | Before | After |
| --- | --- | --- |
| Popup shell | Global button chrome leaked in (boxed “Back”, “Save and exit”, “Edit”); flat white sheet that stopped part-way up the screen on mobile | Craves popup: centred 560px modal on desktop, full-height sheet on mobile, neutral page with white cards, round Back button, compact title on scroll, “Draft saved” only after a confirmed save, sticky 56px Flame Red primary button, no stepper |
| Become a chef (signed out) | “We couldn’t open your application” error card | Opens the existing phone-first Home Chef sign-up popup directly (locked to Home Chef, no customer registration). Session failures still show Try again / Sign in |
| Welcome back | Plain list with “Completed / Needs attention” | Section rows with icons and Complete / In progress / Not started / Needs attention chips; tap a row to open it; “Continue application” resumes at the first incomplete section |
| Basic details | Separate green-styled email widget | “About you” and “Contact details” cards; verified mobile with red Verified badge; email uses the existing verification service in a matching field style (Verify → 6-digit code → Verified) |
| Kitchen | Name, then map, then search; photos needed an extra “Upload” click | Kitchen information → Kitchen address (map or pin placeholder first, then search, Use my current location, pinned address, editable fields) → Kitchen photos. Exactly two photos, upload starts on selection with progress, cancel, retry, replace and remove |
| FSSAI | Help view’s primary button raised a 14-digit error | One number field + “Don’t have FSSAI?” link. Help view: “How to apply for FSSAI”, five FoSCoS steps, admin-managed video (play on demand, language select, empty/error states), single “Request a call from Craves” with “Request received” confirmation, “I have an FSSAI number”. Its primary button saves the draft and moves on; submission still requires the number |
| Identity | Select menu | Document-type chips (backend-supported types only), front/back uploads only where the backend requires a back side, PDF upload support, glare tip |
| Bank (when enabled) | Inline form | Locked holder name, masked account number with show/hide, confirmation match, IFSC → locked bank name and branch, inline “Confirm your bank details” card with Re-enter on the same screen |
| Review | Text blocks | One card per section with status chip and Edit; kitchen photo thumbnails; masked bank; Edit → Save → returns to Review (unchanged contract) |
| Submitted | Generic list | Red tick, “Application submitted”, real application ID/date/status, three truthful next steps, only “View application status” (no home/dashboard) |
| Application status | Showed “Pending review” only | Draft / Submitted / Under review / More information required (with reviewer note and affected sections) / Approved (Open Chef Dashboard) / Not approved (reason + support contact). Pending applicants never get dashboard links |

Also fixed: a React DOM-reuse bug where clicking a footer button (for example “Continue application”) immediately submitted the next screen’s form and showed validation errors. The footer is now keyed per screen.

## Files

Added
- `src/components/chef-onboarding-ui.tsx` — Card, field shell, chips, badges, notes, formatting helpers
- `src/lib/chef-onboarding-redesign.vitest.ts` — 7 new UI tests

Modified
- `src/styles/chef-onboarding.css` — full design system for the popup (scoped under `.cob`)
- `src/components/chef-onboarding-shell.tsx`, `chef-onboarding-workspace.tsx`, `chef-onboarding-sections.tsx`, `chef-onboarding-upload.tsx`, `chef-onboarding-bank.tsx`, `chef-application-status.tsx`, `chef-application-session-boundary.tsx`
- `src/components/use-chef-onboarding.ts` — `go/open/edit` navigation, FSSAI help view state, continue-without-FSSAI, upload cancel, richer callback message, More-information routing to status
- `src/lib/chef-onboarding-flow.ts` — section labels, `sectionProgress`, `applicationPhase`, phase copy
- `src/components/auth/EmailVerificationPanel.tsx` — additive `variant="onboarding"` (default and compact variants unchanged)
- `src/components/location/AddressMapPicker.tsx` — optional `ariaLabel` and `showLocateButton` props (defaults keep customer address behaviour)
- `src/app/chef/application/status/page.tsx` — sign-in mode and return path for the status route
- Tests updated for new labels: `chef-onboarding-ui.vitest.ts`, `chef-onboarding-workspace.vitest.ts`, `chef-onboarding-v2-contract.test.ts` (+2 node tests)

## Backend APIs used (unchanged)

`GET/PUT/PATCH /api/chef/onboarding`, `POST /api/chef/onboarding/submit`, `POST /api/chef/onboarding/help`, `GET /api/chef/onboarding/content?language=`, `GET /api/chef/onboarding/content/{id}/playback`, `GET|DELETE /api/chef/onboarding/documents/{id}[/preview]`, `POST /api/chef/application/proof-files`, `GET /api/chef/application`, `GET /api/customer/profile`, `/api/auth/email-verification[/challenges|resend|verify]`, `/api/auth/me`, `/api/auth/session`, MSG91 phone OTP, `/api/location/map-image`, `/api/location/reverse-geocode`, location search, `GET/POST /api/chef-onboarding/bank`, `GET /api/chef-onboarding/bank/ifsc/{ifsc}`.

## Backend handover — gaps found while redesigning

Items 1–4, 6 and 7 were fixed in backend and web on 9 October 2026 (follow-up release, see “Gap fixes” below). Items 5, 8 and 9 stay as they are.

1. **Age eligibility** — fixed. Applicants must be 18 or older.
2. **Callback status on return visits** — fixed. The onboarding state returns the latest callback request.
3. **More information required** — fixed. Reviewers pick the sections to update.
4. **Human-friendly application reference** — fixed. Every application has a `CRV-#####` reference.
5. **FSSAI verification** — unchanged: no automated FoSCoS lookup; “Verified by Craves” appears only after an admin `VERIFY_FSSAI` action.
6. **FSSAI video fallback** — fixed. English content is shown when the chosen language has none.
7. **Identity types / back side** — fixed. “Other government ID” can be marked as having no back side. (Removing uploaded proof still clears `PROOF_CHOICE_LOCKED` because removed files are excluded from the check.)
8. **Bank** — unchanged and deferred: `CRAVES_CHEF_ONBOARDING_BANK_REQUIRED=false`, RazorpayX bindings absent. The bank screen is ready when that is switched on.
9. **Official FSSAI guidance** — the step text is generic and links to `https://foscos.fssai.gov.in/`; no fees or turnover thresholds are stated.

## Gap fixes (backend + web)

| Gap | Backend (`services/user-chef-service`) | Web (`apps/customer-web-next`) |
| --- | --- | --- |
| 18+ rule | `ChefOnboardingPolicy.validateDraft` rejects a date of birth less than 18 years before today (India time) with `APPLICANT_UNDER_18`, on draft save, full save and submit. 29 February birthdays count from 1 March. | Basic details: helper “You must be at least 18 years old to apply”, the date picker stops at 18 years ago, and the same message shows before any save. |
| Callback status after reload | `GET /chef/onboarding` (and the admin application view) now include `callbackRequest {caseNumber, status, requestedAt}` — the applicant’s latest FSSAI help request. No new route. | “Don’t have FSSAI?” shows “Request received” (or “Our team contacted you”) with the reference after any reload. A resolved request lets the chef ask again. Admin review shows the callback status. |
| Structured “more information” | `REQUEST_INFORMATION` now requires `sections` (any of `personal, kitchen, fssai, documents`, plus `bank` only when bank is required). Stored in `chef_onboarding_draft.correction_sections`, returned as `progress.sections`, cleared on resubmission, and recorded in the action audit. | Admin review has a section checklist; “Request information” stays disabled until one is picked. Chef status lists those sections under “What needs updating” (with any rejected-document reasons), Welcome back marks them “Needs attention”, and “Update application” opens the first one. |
| Short application reference | New `chef_application.reference_code` (`CRV-10001`, `CRV-10002`, …) from a sequence; existing applications get one when the migration runs. Returned as `referenceCode` on every application response. | Submitted and status screens show “Application reference CRV-…”; admin review list and detail show it next to the status. |
| English video fallback | `GET /chef/onboarding/content?language=xx` returns English published content when nothing is published in `xx`. Items keep their own language. | The FSSAI guide shows “Not available in <language> yet, so we’re showing the English guide.” |
| No back side | `Details.proofHasBack` (only kept for `OTHER_GOVERNMENT_ID`; `false` means front only). Required documents, resume step, submission and final approval all use it. | Identity step shows “This document has no back side” for Other government ID; the back upload disappears and Review lists only the document. |

**Admin portal uploads (question asked):** yes — `/admin/chef-onboarding` (“Chef onboarding help” in the admin menu) already lets Platform/Chef admins create articles or upload MP4/WebM videos (≤100 MB) per language, preview, and publish/unpublish. Published, verified items appear in the chef app’s “Watch how to apply” card; with this release English items also cover languages that have none. The page now says so.

**Database:** `V17__chef_onboarding_reference_and_correction_sections.sql` — additive only (new sequence, `reference_code` with unique constraint, nullable `correction_sections` with a format check). `scripts/release/rmorampudi09_preflight.py` approves V17 so the guarded Chef release can apply it.

**Mobile app:** not changed. It ignores the new fields; it still asks for a back side for Other government ID, and the 18+ rule now applies there through the backend.

**Release order:** merged `main` → `launch-regression-ci.yml` → pipeline #14 `operation=backend` (deploys user-chef-service, Flyway applies V17) → pipeline #14 `operation=web`. No APIM change (no new routes).

## Verification (local, Node 22.22)

- `npm run lint` — 0 warnings
- `npm run typecheck` — pass
- `npm run test` — 53 Vitest files / 668 tests and 375 Node tests, all passing
- `npm run build` — production Next.js build passes (Google Fonts blocked in the sandbox, so the build used Next’s `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` with a local font; CI fetches the real fonts)
- Visual check — every screen rendered with mocked APIs at 390×844 and 1280×860 (Playwright)

Live OTP, uploads to private storage, email delivery and callbacks need an authorised test identity on the deployed environment.

Gap fixes (9 Oct 2026, follow-up): `npm run lint`, `npm run typecheck`, `npm run test` (53 Vitest files / 672 tests and 378 Node tests) and `npm run build` pass locally; release preflight tests pass with the new V17 test. All migrations V1–V17 were applied in order to a local PostgreSQL 16 + PostGIS database, including V17 over existing applications (references `CRV-10001…` assigned, section check accepts `kitchen,documents` and rejects `kitchen,menu`). Java compilation and `ChefOnboardingDatabaseTest` (three new database tests) run in GitHub Actions because Maven Central is not reachable from the build sandbox.

## Release

This is a web-only change. After review and merge to `main`:

1. Wait for **GitHub Actions `launch-regression-ci.yml`** to pass on the merged `main` SHA (it covers `apps/customer-web-next/**`).
2. Queue **Azure DevOps definition #14 “Craves (14)”** (org `rmorampudi09`, project `Craves`; reviewed YAML `azure-pipelines-chef-onboarding-release.yml`) with `operation=web`, `releaseSha=<merged main SHA>`, `regressionRunId=<that run>`, `confirmDeploy=true`. It builds `apps/customer-web-next` into `craves/customer-web-next` and deploys `ca-craves-web-prodlow` in `rg-craves-prodlow-centralindia`. No `backend`, `apim` or `activate` run is needed for this change.
3. Do **not** use `azure-pipelines-customer-web.yml` (it builds the legacy `apps/customer-web`) or the image-only pipeline #12.
