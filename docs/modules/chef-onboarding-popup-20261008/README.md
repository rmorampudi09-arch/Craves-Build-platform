# Chef web onboarding popup — 8 October 2026

This change replaces the chef onboarding workspace with the popup flow described in the supplied Chef Onboarding PDF and its overriding written brief. It uses the existing Craves dialog, OTP, email verification, location, bank enrollment, support and application APIs. The Taste skills informed spacing, typography, focus treatment and feedback while the supplied Craves tokens and form requirements remain authoritative.

The implementation is confined to `apps/customer-web-next` and this module's documentation. The base is `b06825cd14bc8bd7218fc9419b96b6b47e134990`, which already includes the separate onboarding backend/mobile/admin work from PR #437. This PR does not change mobile, Java services, admin workflows, deployment pipelines or payment policy.

## Implemented behavior

| Area | Result |
| --- | --- |
| Entry | Chef registration asks for phone OTP first. It reuses the authenticated identity and skips a customer-profile registration write. Customer registration keeps its existing fields and optional email flow. |
| Popup | Existing Radix dialog primitives; centered desktop modal, mobile bottom sheet, locked background scrolling, keyboard focus trap, red/white/neutral palette, Plus Jakarta Sans, 56px controls, sticky footer, reduced motion and visible focus. No stepper. |
| Basic details | One full-name field, backend-compatible DOB, verified phone, existing authoritative email verification. No selfie. |
| Kitchen | Name and optional description, map before address fields, search/current location/map movement with reverse geocoding, editable address and exactly two named photo slots. No type, cuisine or radius input. |
| Uploads | Local image preview, replace/remove before upload, file-size checks, native conversion of supported WebP/HEIC/HEIF to JPEG, real upload progress, retry and confirmed saved metadata. Approved evidence cannot be replaced. See saved-preview/removal gap below. |
| FSSAI | One 14-digit number field, a small “Don't have FSSAI?” link, five-step official FoSCoS guidance, language-specific published content/private video playback, and a real support callback request with a retry key. No certificate upload. |
| Identity | Backend-supported Aadhaar/PAN/bank statement/other government ID; one or two files as appropriate. Uses `SELECTED_PROOF_FRONT/BACK` so historical government identity files remain intact. |
| Bank | Holder name from Basic details, account and confirmation, uppercase IFSC, current consent contract, masked inline confirmation, re-entry on the same screen and the existing server verification workflow. Failure/unknown states remain incomplete. |
| Review | Five editable sections. A successful save from any edit returns directly to Review with retained data. Bank numbers remain masked. |
| Submission | Terms confirmation, duplicate-click protection, exact draft version, server-confirmed submission only, confirmation with real application ID/date and status link. |
| Application status | Dedicated `/chef/application/status` route. Draft/submitted distinction uses the onboarding state when enabled; approval/rejection use the real application API. Pending applicants receive no dashboard link. |
| Operational access | `/chef` and existing protected chef pages require both current CHEF authorization and a fresh `APPROVED` application response before private children mount. Pending access redirects to status; unknown application responses fail closed with retry. Public customer chef pages remain available. |
| Persistence | PUT draft save with `expectedVersion`, GET restoration and first incomplete section. No private draft, document or bank number is stored in local/session storage. “Draft saved” follows a confirmed save. Submitted applications are never re-saved as drafts. |

## Files and responsibilities

| File under `apps/customer-web-next/src` | Responsibility |
| --- | --- |
| `components/chef-onboarding-workspace.tsx` | Screen composition, footer actions, review/confirmation/status rendering |
| `components/use-chef-onboarding.ts` | Owner-bound state, API orchestration, optimistic versions, upload progress, callback retry, save/submit handling |
| `components/chef-onboarding-sections.tsx` | Basic/kitchen/FSSAI/identity/review fields and location/content interactions |
| `components/chef-onboarding-shell.tsx` | Shared accessible popup wrapper |
| `components/chef-onboarding-upload.tsx` | Local preparation/preview, file picker/camera, progress/error/retry |
| `components/chef-onboarding-bank.tsx` | Bank confirmation and unchanged verification contract |
| `components/chef-application-status.tsx` | Real status reads and permitted next action |
| `components/chef-access-boundary.tsx` | Fresh application approval and current session/role gate |
| `components/auth/AuthModal.tsx` | Phone-first chef entry; customer flow retained |
| `components/auth/EmailVerificationPanel.tsx` | Required versus optional email label |
| `lib/chef-onboarding-flow.ts` | Completion, navigation and field validation rules |
| `lib/chef-onboarding-v2-contract.ts` | Existing state parser with safe null normalization |
| `lib/chef-onboarding-bff.ts`, `lib/chef-onboarding-route-policy.ts` | Allowlisted same-origin authenticated proxy, bounded JSON and private responses |
| `app/chef/application/page.tsx` | Existing server runtime feature flag and legacy fallback |
| `app/chef/application/status/page.tsx` | Dedicated status page and active-account boundary |
| `app/chef/page.tsx` | Approved dashboard boundary |
| `styles/chef-onboarding.css` | Scoped layout, responsive and accessibility styling |
| `lib/chef-onboarding-ui.vitest.ts`, `lib/chef-onboarding-workspace.vitest.ts`, `lib/chef-onboarding-bff.vitest.ts` | Rendered flow, compatibility and BFF regression coverage |

The proof upload route and evidence type allowlist are inherited unchanged from the new base; they already accept the new selected-proof and kitchen-photo slots.

## API integration

| Browser request | Existing upstream / purpose |
| --- | --- |
| Phone OTP/session and `/api/auth/me` | Existing MSG91/Firebase and Craves authentication; no new auth provider |
| `/api/auth/email-verification` and its challenge/resend/verify operations | Existing Auth-authoritative email verification |
| GET/PUT `/api/chef/onboarding` | GET/PUT `/chef/onboarding`, including `expectedVersion` |
| POST `/api/chef/onboarding/submit` | POST `/chef/onboarding/submit`, version-confirmed submission |
| POST `/api/chef/application/proof-files` | Existing authenticated multipart proof storage; 10 MiB file ceiling |
| `/api/location/search`, `/api/location/reverse-geocode`, `/api/location/map-image` | Existing Azure Maps BFF routes |
| GET/POST `/api/chef-onboarding/bank` | Existing bank enrollment and Razorpay verification; current consent version retained |
| POST `/api/chef/onboarding/help` | Real support case creation with `requestKey`; returns case reference |
| GET `/api/chef/onboarding/content?language=...` | Published/ready content for the selected language |
| GET `/api/chef/onboarding/content/{id}/playback` | Backend-authorized, short-lived private video URL |
| GET `/api/chef/application` | Current application approval/rejection for status and access checks |

## Validation and verification

The code checks valid calendar DOB in the supported backend range, a complete first/last name within backend limits, authoritative email verification, required address/PIN/location, the two photo slots, a 14-digit FSSAI number, identity sides for the selected proof, matching bank accounts, valid uppercase IFSC and current bank consent. The backend remains authoritative for age eligibility, FSSAI eligibility, approved document locks, supported proof types, bank validation/name matching, payout policy and final submission.

Rendered regressions cover all five Review edit/save paths, restoration/first-incomplete resume, failed-save receipts, unverified email, reverse-geocode failure, callback failure/retry keys, number-only FSSAI rejection from the backend, duplicate submission, masked bank re-entry/retry and stale-role pending access. BFF checks cover cross-origin requests, bounded JSON/route rejection, safe upstream failures and no-store private responses. Existing customer/auth/session tests are retained and updated for the requested chef entry behavior.

Local verification on 8 October 2026: `npm run verify` completed successfully with zero-warning ESLint, TypeScript, 52 Vitest files / 656 tests, 368 Node tests, approved landing-media integrity checks and the production Next.js build. These 1,024 tests include service-error and network-error access retries. Final CI links belong in the PR and release handover. Mocked component tests verify frontend behavior and contract handling; they do not establish that production backend activation or provider processing succeeds.

## Local setup and checks

Use Node 24 and the committed lockfile in `apps/customer-web-next`. Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run verify`. For local interactive work, use the existing application configuration, including `CRAVES_API_BASE_URL` and the established authentication settings; run `npm run dev`. Set the server-only `CRAVES_CHEF_ONBOARDING_V2_ENABLED=true` only with an onboarding-enabled backend. The web flag does not enable the Java API, provision storage or override eligibility rules. Keep credentials in the existing local/environment secret mechanism.

## Release operations and outstanding manual work

- Queue the existing production pipeline #12 after the exact merged-main full regression succeeds. Supply that full SHA as `expectedReleaseSha` and `imageTag`, the successful regression run ID as `regressionRunId`, and the authorized replace-current-web confirmation. Keep the existing service connection and production target.
- Verify the pipeline result, immutable image/source evidence and public readiness/authentication denial contracts. Keep the current replica configuration.
- Before feature activation, complete the separate backend handover: number-only FSSAI eligibility/approval policy, saved-upload preview/removal, IFSC lookup and any required expanded application statuses. Verify the deployed User/Chef APIs, gateway routes, private content/storage and callback processing.
- Coordinated runtime activation is a separate operation from pipeline #12's image deployment. Establish backend readiness before enabling the matching runtime flags. No DNS, resource creation, payment configuration or mobile-store work is needed for this frontend release.

## Release target and gate

The requested existing pipeline is **Craves-Customer-Web-Production, definition #12**, in `rmorampudi09 / Craves`. Its observed Run form and YAML match `azure-pipelines-razorpay-customer-web.yml`:

| Setting | Value |
| --- | --- |
| Application source | `apps/customer-web-next` |
| Service connection | `Craves-RMORAMPUDI09-Service-Connection` |
| Resource group | `rg-craves-prodlow-centralindia` |
| Container App | `ca-craves-web-prodlow` |
| ACR | `cravesrm09prodlow6bf632` |
| Image repository | `craves/customer-web-next` |
| Branch | `main` only, manual release |
| Release evidence | Exact reviewed merged-main SHA and successful full-regression run on that same SHA |
| Runtime change | Immutable image update; runtime configuration, secrets and scale guarded/preserved |

The supplied brief requires authorization before a main merge. The user's subsequent instruction explicitly requests deployment through main-only pipeline #12, authorizing the reviewed merge needed for that release. The feature-branch PR remains the concrete review artifact; required checks and branch protections remain in force. Use successful full-regression evidence for the exact merged main commit and the existing pipeline #12.

The UI retains `CRAVES_CHEF_ONBOARDING_V2_ENABLED` as a server runtime flag with the existing fallback. Pipeline #12 does not activate it. Coordinated User/Chef/APIM/runtime readiness and the FSSAI policy change described in [backend-handover.md](backend-handover.md) are needed before exposing the complete new flow.

## Remaining backend dependencies

The backend source is now on main, but its deployment and runtime activation have not been established by local frontend tests. The number-only FSSAI screen conflicts with the current mandatory certificate policy. IFSC bank/branch lookup, authenticated saved-upload previews/removal and separate under-review/more-information states are absent from the current contracts. These are concrete gaps, with proposed contracts and compatibility guidance in the separate handover. The frontend reports failures and never fabricates those capabilities.
