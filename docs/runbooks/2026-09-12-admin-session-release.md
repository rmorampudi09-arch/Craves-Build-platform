# Administrator session release

## Scope and policy

Internal administrator credentials have an absolute 28,800-second deadline from the verified Firebase `auth_time`. Short access JWTs retain their existing 15-minute default and are shortened at the final boundary. Rotation does not extend the original deadline. Customer/chef-only credentials keep the existing 30-day refresh policy. No idle-lock policy or sensitive-action reason/confirmation is removed.

The browser coordinates renewal with Web Locks across tabs, rechecks the shared cookie after acquiring the lock, and broadcasts logout without credentials. Only a non-secret refresh request receipt is shared in memory through BroadcastChannel; no browser persistence is used, and access and refresh credentials remain host-only HttpOnly/Secure/SameSite=Lax cookies, with refresh Path `/api/auth`. Delivery Intelligence uses the host-root refresh/status endpoints. The bounded server coalescer supports browsers without Web Locks.

Ordinary admin requests use the same renewal wrapper. Safe reads retry at most once after verification; mutations return an explicit retry-required conflict, preserving application idempotency receipts. The BFF checks live Auth authorization before forwarding admin operations. Temporary errors never clear cookies or become a fabricated 401. Protected components remain mounted but hidden while reconnecting, preserving in-memory work; actual sign-out removes them.

PostgreSQL identity locks serialize refresh, logout and role administration. A rotated credential can recover the same request receipt for 30 seconds while its replacement is unused; a different receipt or replay outside that window revokes the family. A lost rotation response that cannot be recovered within that window requires interactive sign-in. Logout through an old token revokes its replacement. Existing V4 token-version outbox events support downstream invalidation; its publisher and downstream verification must be verified before production acceptance.

Pre-existing administrator credentials lack trustworthy original session metadata and require one fresh interactive sign-in after this security release. The verified Firebase authentication time cannot be reused to resurrect a signed-out family. Staff credentials bearing internal roles follow the administrator policy; unprivileged customer/chef sessions do not.

## Observed preflight on 2026-09-12

| Resource | Rollback reference / observed state |
|---|---|
| Auth | `cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:d3729d7873c2586c6500e212b2e4a16c667ccebc4f91d3066098998e128dae61`, revision `ca-craves-auth-service-prodlow--0000035`, min/max 1/1 |
| Admin web | `cravesprodlowacr82121.azurecr.io/craves/admin-web:36288`, revision `ca-craves-admin-web-prodlow--0000007`, configured min/max 0/10 |
| Delivery Intelligence web | `cravesprodlowacr82121.azurecr.io/craves/delivery-intelligence-admin:36501`, revision `ca-craves-delivery-intel-prodlow--0000002`, configured min/max 0/3 |
| PostgreSQL | `pg-craves-prodlow-l3ing6`, Ready; 7-day backup retention; earliest restore `2026-09-06T14:00:10.298552Z`; geo-redundant backup Disabled |
| Auth revocation | `CRAVES_TOKEN_REVOCATION_ENABLED=false`, `CRAVES_TOKEN_REVOCATION_PUBLISHER_ENABLED=false` |

The two web replica settings and disabled revocation flags disagree with assumptions in the supplied handover. Do not report them as already fixed at one replica or as active downstream revocation. Preserve the user's one-replica limit when updating these existing applications. No scale-up, new resources or provider activation changes are authorized by this release.

## Migration and deployment gate

Academy PR #326 reserves `V7__craves_academy.sql`. This change uses additive `V8__admin_session_families.sql`. **Both must be present in the first deployed Auth image**, with Academy disabled until its separate API/UI/permission acceptance passes. Do not deploy V8 and subsequently attempt to introduce V7 out of order. Neither migration was applied by local work.

The admin deployment gate checks the non-secret Auth `ADMIN_SESSION_V1` runtime capability before replacing its healthy image and pins the existing admin application to min/max 1/1.

Use the existing Auth, dedicated `Dockerfile.admin` and Delivery Intelligence pipelines with `Craves-Dev-Service-Connection`. Record exact tested/deployed SHA, immutable images, ready revisions and one-replica limits. Check inherited gateway cookie/no-cache policies and downstream revocation readiness. Preserve Pidge, payments, orders, database configuration and unrelated flags.

Local Java dependency resolution was unavailable in this workspace; the dedicated GitHub CI provisions disposable PostgreSQL 16 for actual transaction, replay, revocation and concurrency checks. Controlled-clock tests are not an eight-hour browser soak. Neither a green build nor a health response substitutes for authenticated production acceptance.

## Rollback

Restore the recorded healthy image/revision for each affected existing application. Keep additive schema and session records. Disable Academy if any Academy acceptance gate fails. Retain prior gateway policy for restoration. Do not drop data or reset production clocks/TTLs as a test.

## Final review refinements

The admin portal BFF explicitly requests an administrator session. Consumer/mobile exchanges and ordinary refresh credentials retain 15-minute access/30-day refresh policy even for a staff identity; these credentials carry only consumer roles. Privileged roles require the bounded admin session. `/auth/me` returns the intersection of live and credential-scoped roles. Legacy internal-role access credentials need one fresh portal sign-in.

Auth responses are private/no-store. A successful, validated family on `/auth/me` carries the nonsecret `X-Craves-Admin-Session: verified-v1` marker; downstream interceptors require it as well as status 200, avoiding authorization from a generic proxy success. They preserve ordinary customer/chef and provider callback processing. All six owning services must deploy after Auth.

Existing Azure definition 119 referenced a pipeline file missing from main and an older branch. The restored maintenance pipeline uses that same filename, updates only the already-existing DI web app, preserves runtime settings, pins one replica, checks Auth policy before deployment, and restores its prior image on failure. It performs no API, Front Door, role-assignment or resource-creation writes. Definition 33 remains the dedicated admin Dockerfile pipeline.

Figma was rechecked in this session and is still blocked by the Starter MCP limit. No canvas import or visual acceptance is claimed. Use the supplied development-plugin manifest in Figma Desktop, then choose design.json inside the plugin.

## Second factor (CH-09)

Auth issues an admin session only when the Firebase ID token carries `firebase.sign_in_second_factor = "totp"`. Firebase
sets that reserved claim only after an MFA challenge; phone, custom-token (MSG91, central OTP) and anonymous sign-ins
cannot have one. SMS as a second factor is refused on purpose. The 8-hour family and its refresh are unchanged: a family
is checked once, when it is created.

| Setting | Where | Default | Meaning |
|---|---|---|---|
| `CRAVES_ADMIN_SECOND_FACTOR_ENABLED` | Auth Container App | `false` | `false`: sessions are issued as before and each admin sign-in without TOTP logs `CRAVES_ALERT alert=ADMIN_SECOND_FACTOR_MISSING mode=monitor`. `true`: that sign-in gets 401 `ADMIN_SECOND_FACTOR_REQUIRED` (`mode=enforce`). |
| `CRAVES_ADMIN_TOTP_SIGN_IN_ENABLED` | Admin web Container App | absent | `true` shows the staff email, password and authenticator form (with first-time enrolment) above the phone OTP form. Absent: the page is unchanged. |

Steps, each with its own owner approval:

1. Upgrade the Firebase project to Firebase Authentication with Identity Platform (billing changes). Identity Platform
   uses a fully blocking SMS region policy: confirm India (IN) is still allowed and smoke-test a customer phone OTP
   straight after. Confirm the Email/Password provider is enabled (mobile already uses it).
2. Enable TOTP. `GET https://identitytoolkit.googleapis.com/admin/v2/projects/PROJECT_ID/config` first, then
   `PATCH .../config?updateMask=mfa` resending the existing `mfa` fields plus
   `providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } }]`. This allows enrolment only;
   it does not force MFA on any user.
3. Per administrator, on their existing phone-created Firebase uid (never a new user, or the token loses
   `phone_number`): set the staff email, `emailVerified: true` and a random password that is never shared, then send a
   password-reset link to the staff mailbox. New administrators enrol before their internal role is granted.
4. In a non-production Firebase project, with a TOTP-enrolled test user, record whether Firebase phone OTP, the MSG91 and
   central OTP custom tokens, and mobile email sign-in still work. If phone sign-in is refused for enrolled users, staff
   use a separate number for their administrator identity.
5. Deploy `infra/monitoring/silent-failure-alerts.bicep` (`deployAlerts=true`) so the new code pages at severity 3.
6. Set `CRAVES_ADMIN_TOTP_SIGN_IN_ENABLED=true` on the admin web. Administrators sign in with email and password, scan
   or type the shown key into an authenticator app, enter a code to enrol, then a fresh code to sign in.
7. Enforce when every holder of an internal admin role has a TOTP factor (Admin SDK `getUser(uid).multiFactor.enrolledFactors`
   for the `firebase_uid` of each `auth_identity_role` holder), including at least one CHEF_ADMIN and one different
   COMPLIANCE_ADMIN for maker-checker, and no `ADMIN_SECOND_FACTOR_MISSING` alert has fired for 7 days. The alert has no
   identity in it; to see who signed in, match its time with `auth_audit` rows where `action = 'FIREBASE_EXCHANGE'`.
   Then set `CRAVES_ADMIN_SECOND_FACTOR_ENABLED=true` on Auth, preferably at the end of a working day: phone-only families
   end within 8 hours. To end them at once (optional; Auth and the downstream `/auth/me` checks reject revoked families):
   `UPDATE admin_session_family SET revoked_at = now(), revoke_reason = 'SECOND_FACTOR_ENFORCED' WHERE revoked_at IS NULL;`

Rollback: set `CRAVES_ADMIN_SECOND_FACTOR_ENABLED=false` (new revision, no data change); remove
`CRAVES_ADMIN_TOTP_SIGN_IN_ENABLED` to hide the form.

Lost authenticator: after verifying the person out of band, an operator runs Admin SDK
`updateUser(uid, { multiFactor: { enrolledFactors: null } })`; the administrator enrols again at the next sign-in.
Suggest each administrator enrols a second device (Firebase allows up to 5 factors).

Shared test numbers and any acceptance script that signs in to the admin portal by OTP stop getting admin sessions once
enforced. Acceptance testers need a TOTP-enrolled administrator.

Contract follow-up "CH-09 contract", once enforcement is stable: remove `PhoneAuthForm` from the admin branch of
`apps/customer-web-next/src/app/sign-in/page.tsx`, delete `CRAVES_ADMIN_TOTP_SIGN_IN_ENABLED` (form always on for the
admin host), and delete the monitor mode and `CRAVES_ADMIN_SECOND_FACTOR_ENABLED` (always enforce, and drop it from
`config/production/backend-completion-pack.json`).
