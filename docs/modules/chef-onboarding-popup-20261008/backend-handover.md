# Backend handover — chef onboarding popup

Inspected baseline: main commit `b06825cd14bc8bd7218fc9419b96b6b47e134990`. The onboarding implementation and migrations are already present in that source. This frontend PR does not deploy Java services, change eligibility or rewrite legacy evidence. Every proposal below is a required backend follow-up or production readiness check; it is not a claim that the capability is deployed.

## 1. Number-only FSSAI — blocking full submission

Current `ChefOnboardingPolicy.required()` always adds `FSSAI_LICENSE`. `resume()` requires that evidence together with the number. `ChefOnboardingService.submit()` rejects an incomplete policy result with `ONBOARDING_INCOMPLETE`. The supplied brief removes the certificate upload and explicitly asks to report the contract change instead of bypassing it.

Required change: confirm the business/compliance eligibility rule, then align the policy's required evidence, resume calculation, submission validation, admin readiness/approval checks and regression fixtures with number-only registration if that rule is authorized. Keep the 14-digit validation and any server verification/review needed to establish eligibility. Do not authorize payouts or approval based solely on a populated string. Existing uploaded licences must remain private and available for audit.

If no-FSSAI final submissions are allowed, return an explicit eligibility/next-action result distinguishing a saved draft, submitted incomplete compliance and approval. Until that policy is defined, the client saves a no-FSSAI draft and requires a number to continue. It does not fabricate registration or approval.

## 2. Production onboarding readiness — blocking new-flow activation

Source contains `ChefOnboardingController`, draft/help/content services, V14 onboarding tables and V15 selected-proof slots. Confirm their User/Chef deployment, migrations, private Blob configuration, approved API gateway routes, identity authentication and support case integration before enabling the runtime flag.

Applicant routes needed: GET/PUT `/chef/onboarding`, POST `/chef/onboarding/submit`, POST `/chef/onboarding/help`, GET `/chef/onboarding/content` and GET `/chef/onboarding/content/{uuid}/playback`, plus the existing proof-files endpoint accepting `KITCHEN_PHOTO_1/2` and `SELECTED_PROOF_FRONT/BACK`.

The runtime switch is `CRAVES_CHEF_ONBOARDING_V2_ENABLED=true` on the corresponding backend and customer web. Existing admin content/support controls need their own readiness check. Pipeline #12 updates the image while preserving environment variables; it does not set this flag or deploy/migrate User/Chef. An approved image release alone is not complete feature activation.

## 3. Persisting incomplete Basic details

The current draft PUT validates full first name, last name, DOB and verified email before any save. It therefore cannot persist an early partial Basic-details form, even through “Save and exit.” The frontend keeps entered values and shows the real rejection; it never says the partial draft was saved.

If the requested universal early save/resume is mandatory, define a versioned partial-draft/PATCH contract with nullable incomplete fields, immutable verified phone ownership and strict per-field limits. Keep completeness and email authority checks at section completion/final submission. Return persisted fields, version, completion and next action from the saved state; do not overload final application submission as draft storage.

## 4. Saved upload preview and removal

Evidence GET currently returns ID/type/original filename/file size/review status/reason/date, without a usable authenticated preview URL. Replacement exists through POST proof-files; approved evidence is locked. No applicant-owned deletion operation was found.

Proposed preview: authenticated GET `/chef/application/proof-files/{uuid}/preview` returning a private short-lived URL or streamed bytes, verified owner, safe MIME and expiry. Enforce ownership, no-store, same-session lifetime and filename/content disposition. Never expose Blob credentials or public container access.

Proposed removal: authenticated DELETE of an unapproved evidence ID with application/draft version or equivalent conflict protection. Return updated evidence and completion/version. Prevent deleting approved/audited evidence; retain an audit record and preserve historical government identity files. Include expiry, removal, replacement, approved-lock, account-switch and concurrent-tab tests.

Current client removal affects a local file selected before upload. A confirmed saved upload shows its actual filename/status and can be replaced if permitted. It does not show a fake thumbnail or claim a persisted deletion.

## 5. IFSC bank and branch lookup

Existing bank POST accepts request UUID, expected current bank ID, saved holder name, account and repeated account, IFSC, consent and consent version. GET returns masked last four, IFSC, verification state/booleans/message/date. Neither exposes bank name/branch or provides a lookup endpoint.

Proposed GET `/chef-onboarding/bank/ifsc/{code}` with validated 11-character IFSC, rate limits and a provider-backed `{ifsc, bankName, branchName, verifiedAt}` response. Define unavailable and unknown-code behavior separately. Add the server-confirmed bank/branch labels to the safe bank read model if they must be retained in Review. The backend should derive them; the browser must not submit invented branch data.

Continue existing name matching, encryption, verification, withdrawal/payout holds, cooldowns and idempotent retry handling. Reject unknown/failed provider states as incomplete. Reconcile changes to the applicant name with existing bank verification so a previously verified account is not misrepresented after a name edit.

## 6. Application statuses and correction workflow

The current application enum/read model has `NOT_SUBMITTED`, `PENDING`, `APPROVED`, `REJECTED`. The onboarding DTO adds `submitted`, which distinguishes a draft row from a pending final submission. There are no separate under-review or more-information states or structured correction requests in this contract.

If those states are required, provide an authoritative versioned status/next-action model with submitted/review timestamps, review reason, permitted editable sections and outstanding requested information. Update backend enum/serialization, admin transitions, gateway/BFF allowlists, frontend parser and state tests together. Preserve existing clients through an additive/versioned read model or confirmed compatibility mapping. The present frontend fails closed on unknown status values and never invents a review transition.

For rejected v2 applications, define whether the applicant may edit and resubmit, which evidence locks can be relaxed and how prior review history remains auditable. The UI currently shows the actual rejection reason and permits customer access; it does not reset rejection silently or make an unsupported resubmission call.

## 7. Callback and multilingual learning

The current help API creates a real support case, captures saved details/verified phone/language and deduplicates on request key or an existing unresolved request. Verify the operational callback queue, ownership, notifications and staff handling. The frontend includes the FSSAI stage and application state in the message; a confirmed case reference is required before showing success.

Admin content operations already exist in the inspected backend source. Verify their deployed/admin-accessible state, ready/published transitions, language selection, private Blob upload/finalization and authorized expiring video playback. Empty selected-language responses remain empty in the UI, with text guidance and callback available. No fake translated video, static demo completion or public video URL is substituted.

## 8. Compatibility and release evidence

V15 isolates new selected proof from historical `GOVERNMENT_ID_FRONT/BACK`. Keep that distinction throughout uploads, approval/readiness, admin review and mobile compatibility. The frontend uses the new selected-proof slots while leaving old files untouched.

Before enabling the new flow, prove real draft save/restore, two-photo upload, identity evidence, number-only FSSAI policy, support-case creation, bank enrollment/provider transitions, duplicate final submission, rejection/correction and approved role synchronization against the actual deployed services. Use an explicitly authorized disposable account/environment for sensitive test uploads and financial enrollment.

Web release remains **pipeline #12, Craves-Customer-Web-Production** to **ca-craves-web-prodlow**, **rg-craves-prodlow-centralindia** via **Craves-RMORAMPUDI09-Service-Connection**. Its required inputs are the reviewed merged-main SHA, immutable image tag and a successful full-regression run ID on that same SHA. The user's subsequent explicit request to deploy through this main-only pipeline authorizes the necessary reviewed merge. Keep required checks, branch protections and source/runtime/rollback guards intact.
