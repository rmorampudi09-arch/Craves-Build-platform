# Chef web onboarding popup - 8 October 2026

The Chef onboarding popup uses the existing Craves dialog, phone OTP, authoritative email verification, location, application, support and private storage APIs. The current backend completion is PR #442, based on main `347b20e592b5757722d58d2537f169f478dc9ec9`.

This release connects partial draft saving, saved upload preview/removal, number-only FSSAI review, IFSC lookup, correction/resubmission and kitchen handoff. It retains existing customer access, mobile, operational approval and financial controls. Production activation must be established by release receipts.

## Implemented behavior

| Area | Result |
| --- | --- |
| Entry | Chef registration asks for phone OTP first in both the shared application modal and the standalone landing popup. Both reuse the authenticated identity and skip a customer-profile registration write for chefs. Customer registration keeps its existing fields and optional email flow. |
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
| Persistence | PATCH partial draft and PUT completed save with `expectedVersion`, GET restoration and first incomplete section. No private draft, document or bank number is stored in local/session storage. “Draft saved” follows a confirmed save. Submitted applications are never re-saved as drafts. |

## Connected API and release details

See [backend-handover.md](backend-handover.md) for the complete feature/API table, additive V16/V149 migrations, security and compatibility contract, and exact Azure release process. The scoped coordinated release is pipeline #14, Craves (14); the existing image-only web pipeline #12 does not activate Chef onboarding.

The known production dependency is actual RazorpayX enrollment: provider execution is disabled and the key ID, secret and source-account bindings are absent. The implemented IFSC branch lookup does not prove a bank account is verified. Final application submission requires confirmed enrollment; no UI success bypasses that gate.

## Verification and local setup

Use Node 24 and the committed lockfile in `apps/customer-web-next`. Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run verify`. Keep established authentication/API settings in the existing environment secret mechanism. Local web verification completed with 52 Vitest files / 658 cases and 373 Node cases (1,031 total), zero-warning lint, TypeScript and a production Next.js build.

Chef CI runs real Java 21/PostGIS integration suites, including draft ownership/versioning, current Terms and bank gates, idempotent submission, rejection/correction history, private evidence, approved Chef compatibility and FSSAI review. Integration CI runs its full bank contracts, authenticated IFSC/security checks and additive migration checks. The complete exact-source regression additionally verifies all seven Java services and connected source. Use successful evidence for the exact current commit; older successful runs cannot authorize newer source.

Mocked frontend tests and unsigned production smoke checks have defined limits. Live OTP, uploads, review transitions and bank provider execution need an authorized test identity and correctly configured provider. The final release handover records the actual deployed source, migration/flag state, CI and pipeline results and remaining dependencies.
