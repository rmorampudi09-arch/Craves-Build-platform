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

None of these block the UI release. Each needs an owner decision before it can be enforced or shown.

1. **Age eligibility** — the backend only checks that DOB is a real date between 1900 and today. There is no 18+ rule, so the UI shows none. If Craves requires 18+, add it to `ChefOnboardingPolicy.validate` and return a field error.
2. **Callback status on return visits** — `POST /chef/onboarding/help` de-duplicates open requests, but there is no applicant `GET` for the latest request, so “Request received” only shows in the session that raised it. Suggest `GET /chef/onboarding/help/latest`. Category, stage and FSSAI status are sent inside the message text; structured fields would make the admin queue filterable.
3. **More information required** — only a free-text reason and per-document review reasons exist. A structured `affectedSections` list would let the status page name sections that have no document (for example Basic details).
4. **Human-friendly application reference** — only the UUID exists. The design called for a short reference (for example `CRV-48213`); that needs a backend field.
5. **FSSAI verification** — no automated FoSCoS lookup; “Verified by Craves” appears only after an admin `VERIFY_FSSAI` action.
6. **FSSAI video fallback** — content is strictly per language. If a language has no video, the UI shows an empty state; a server-side fallback to English would help.
7. **Identity types** — Voter ID, Driving Licence and Passport are only available through “Other government ID”, and the backend always requires a back side for it. A “no back side” option needs a policy change. Confirm that removing uploaded proof clears the `PROOF_CHOICE_LOCKED` check (the UI tells applicants to remove files to change type).
8. **Bank** — unchanged and deferred: `CRAVES_CHEF_ONBOARDING_BANK_REQUIRED=false`, RazorpayX bindings absent. The bank screen is ready when that is switched on.
9. **Official FSSAI guidance** — the step text is generic and links to `https://foscos.fssai.gov.in/`; web verification of current FoSCoS wording wasn’t possible from the build sandbox, so no fees or turnover thresholds are stated.

## Verification (local, Node 22.22)

- `npm run lint` — 0 warnings
- `npm run typecheck` — pass
- `npm run test` — 53 Vitest files / 668 tests and 375 Node tests, all passing
- `npm run build` — production Next.js build passes (Google Fonts blocked in the sandbox, so the build used Next’s `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` with a local font; CI fetches the real fonts)
- Visual check — every screen rendered with mocked APIs at 390×844 and 1280×860 (Playwright)

Live OTP, uploads to private storage, email delivery and callbacks need an authorised test identity on the deployed environment.

## Release

This is a web-only change. After review and merge to `main`:

1. Wait for **GitHub Actions `launch-regression-ci.yml`** to pass on the merged `main` SHA (it covers `apps/customer-web-next/**`).
2. Queue **Azure DevOps definition #14 “Craves (14)”** (org `rmorampudi09`, project `Craves`; reviewed YAML `azure-pipelines-chef-onboarding-release.yml`) with `operation=web`, `releaseSha=<merged main SHA>`, `regressionRunId=<that run>`, `confirmDeploy=true`. It builds `apps/customer-web-next` into `craves/customer-web-next` and deploys `ca-craves-web-prodlow` in `rg-craves-prodlow-centralindia`. No `backend`, `apim` or `activate` run is needed for this change.
3. Do **not** use `azure-pipelines-customer-web.yml` (it builds the legacy `apps/customer-web`) or the image-only pipeline #12.
