# Auth-owned email verification

This module implements the existing product rule: customer email is optional; a chef must verify an email before completing an application. Firebase remains the phone sign-in provider. A profile email is not verification evidence.

## Ownership and transitions

Auth owns the canonical email, pending challenge, code authentication, attempt/issue limits, email revision and immutable verification audit. Notification owns only bounded ACS transport. User/Chef stores a monotonically versioned projection. Ordinary transactional email and PDF email resolve the active verified Auth identity immediately before sending.

1. An authenticated identity submits an address and request UUID.
2. Auth locks that identity, enforces the issue budget and saves a ten-minute pending challenge. Only a keyed HMAC of the code is persisted. The HMAC includes the owner, address and challenge UUID.
3. Auth commits before making one signed internal Notification request. No provider work runs inside the Auth database transaction.
4. Notification commits a durable UNKNOWN receipt before ACS submission. It never stores the code, recipient or complete request body and never blindly retries an ambiguous send.
5. A valid code atomically consumes the pending challenge, updates the canonical email and increments its revision, with an immutable audit and projection outbox event in the same transaction.
6. A dedicated bounded Auth worker sends the saved projection to User/Chef with a separate internal key. Duplicate/stale events are safe; conflicting same-revision payloads fail closed. Partial failure retains the event for retry.

An existing verified address stays valid while a replacement is pending. Phone sign-in cannot overwrite either email state from Firebase token fields. New Firebase phone identities do not import email verification implicitly. Existing saved verified Auth records retain their history; the additive migration does not invent their verification timestamp.

## Browser and API contract

All browser writes are same-origin, authenticated BFF operations. No code is placed in browser storage, a URL, analytics, logs or error text. Successful verification refreshes Auth state; User/Chef projection is never treated as a verification authority.

| Method | Auth route | Body |
| --- | --- | --- |
| GET | `/api/v1/auth/email-verification` | None |
| POST | `/api/v1/auth/email-verification/challenges` | `email`, `requestId` |
| POST | `/api/v1/auth/email-verification/resend` | `challengeId`, `requestId` |
| POST | `/api/v1/auth/email-verification/verify` | `challengeId`, `code` |

The BFF mirrors these under `/api/auth/email-verification`. Requests reject unknown, duplicated, malformed and excessive fields. The resend operation derives the destination from the owned latest challenge; it does not need a browser-supplied address. A repeated request UUID returns the current state without another send. Reusing a receipt with different meaning is rejected.

The response contains canonical `email`, `emailVerified`, `emailRevision`, `serverTime` and optional `pending` fields: `challengeId`, `maskedEmail`, `expiresAt`, `resendAvailableAt`, `deliveryStatus`. A destination remains masked while pending. Delivery status is PENDING, ACCEPTED, UNKNOWN or UNAVAILABLE. ACCEPTED is an ACS submission outcome, not proof of inbox arrival.

`EMAIL_CODE_INVALID` deliberately combines wrong, expired, exhausted and replayed codes. `EMAIL_VERIFICATION_RATE_LIMITED` is HTTP 429. A missing/expired session is 401; an inactive identity is 403. Temporary capability/transport failure never sets `emailVerified=true`.

## Abuse and concurrency controls

- Cryptographically secure six-digit code, with a separately scoped HMAC key of at least 32 bytes.
- Ten-minute expiry, sixty-second resend cooldown, five wrong attempts.
- Six new issues per identity per rolling hour and ten per destination per rolling hour. Destination counters use a keyed digest, not another plaintext email index.
- Identity row locking and a PostgreSQL destination advisory lock serialize concurrent issues. Successful verification consumes a challenge once; failed attempts commit even though the API rejects the code.
- A resend or corrected-address challenge supersedes the previous active challenge. Choosing the existing verified address cancels an outstanding replacement.
- All email operations recheck active identity and token version from Auth, even when Redis is unavailable or disabled.
- Internal calls use HMAC-SHA256 over `POST`, the exact path, timestamp seconds and exact UTF-8 body, separated by newlines. Headers are `X-Craves-Email-Timestamp` and `X-Craves-Email-Signature`. Receivers accept only bounded clock skew and reject conflicting replay.
- Auth internal HTTP transport refuses redirects, bounds responses to 8 KiB, and enforces connection/request deadlines. Notification uses a separate bounded ACS client with automatic retries disabled.

The in-memory code is discarded after the single delivery attempt. If the process fails after challenge commit but before dispatch, the owner can request a new challenge after the cooldown. No reversible clear-code queue is introduced.

## Runtime configuration

Use existing Container Apps, Key Vault and ACS. Do not create another email provider or change customer payment credentials.

| Setting | Service | Purpose |
| --- | --- | --- |
| `CRAVES_EMAIL_VERIFICATION_ENABLED` | Auth | Browser capability; default false |
| `CRAVES_EMAIL_VERIFICATION_HMAC_KEY` | Auth only | Code/destination keyed hashing; secret reference |
| `CRAVES_EMAIL_VERIFICATION_INTERNAL_KEY` | Auth + Notification | Narrow verification transport signing key; secret reference |
| `CRAVES_EMAIL_NOTIFICATION_BASE_URL` | Auth | Discovered existing Notification HTTPS origin |
| `CRAVES_EMAIL_VERIFICATION_TRANSPORT_ENABLED` | Notification | Dedicated transport; default false |
| `CRAVES_EMAIL_PROJECTION_WORKER_ENABLED` | Auth | Dedicated projection reconciliation; default false |
| `CRAVES_EMAIL_PROJECTION_INTERNAL_KEY` | Auth + User/Chef | Separate projection signing key; secret reference |
| `CRAVES_EMAIL_USER_CHEF_BASE_URL` | Auth | Discovered existing User/Chef HTTPS origin |
| `CRAVES_EMAIL_VERIFICATION_ALLOW_LOCAL_HTTP` | Auth | Loopback-only synthetic HTTP tests; keep false in production |

The three new keys are independently scoped. Reuse an existing compatible secure binding if present; generate only a missing key through the approved configuration path and retain it across reruns. Never print key values. Existing Notification ACS and Auth identity-lookup references remain in use. Ordinary notification email still requires canonical verified Auth email; a supplied delivery address cannot bypass this rule.

Private operations `/internal/v1/auth-email/verification` and `/internal/v1/auth-email/projection` must remain outside public APIM products. Public Auth leaf routes require sensitive no-store policies, inherited security, no request/response body logging, and authenticated success/denial acceptance. An anonymous 401 alone is insufficient.

## Migrations and deployment

The reconciled 16 September source uses **Auth V15** for canonical email revision/timestamp, pending challenges, audit and projection outbox, and **Auth V16** for the reviewed PostgreSQL request limiter; see [Auth request protection](AUTH_RATE_LIMITS.md). User/Chef V12 adds projection and receipt history. Notification V7 adds verification transport receipts. Earlier document references to Auth V10/V11 described an older candidate, not the compatible current release. Preserve the existing Auth V9.1 admin admission and V12-V14 referral history and all other earlier migrations. The customer-email rollout retained those releases; current upgrade tests cover the preserved baseline and the additive email/limiter changes. Independent applied database history/checksum evidence remains a launch gate: healthy startup alone does not replace it. Never renumber or edit an applied migration, or repair Flyway to hide a mismatch.

Deploy the exact reviewed release through existing targeted Auth, User/Chef, Notification and customer-web pipelines using `Craves-Dev-Service-Connection`. Preserve one replica, previous healthy revisions, Firebase configuration and existing payment/document settings. Root release evidence records actual deployment order, SHA, image digest, traffic, migrations and activation timestamps. New code existing in this document is not proof of deployment.

Provision compatible secret references and discovered origins with capability gates closed. Deploy and verify private authentication/connectivity, then enable dedicated Notification transport and Auth projection processing. Publish reviewed Auth leaf routes and enable Auth email capability after the handlers are healthy. Chef submission and approval intentionally reject unverified canonical email; coordinate the customer-web rollout in the same controlled release window.

## Testing and production acceptance

`.github/workflows/email-verification-ci.yml` runs Java 21/Maven tests against disposable PostgreSQL/PostGIS. `scripts/email/require-email-test-evidence.py` fails if any required email suite is absent, fails or skips. Persistence tests guard the exact disposable database name, loopback host and GitHub CI environment before schema changes. They cover clean migrations, deployed-version upgrades, replay, OTP attempt/expiry/resend/idempotency/owner/concurrency limits, canonical preservation, receipt ambiguity and monotonic projection. No production credential or provider call is required.

Local compile/unit tests are useful but do not count skipped persistence tests as acceptance. The final release must retain actual CI reports and the exact reviewed source SHA.

Authorized production acceptance uses the owner's normal UI/session and email inbox: receive the branded code, complete verification without logging it, verify canonical Auth and User/Chef state, reject replay, and show resend invalidates the prior code. Then email one already-owned generated PDF and verify actual inbox arrival and the exact attachment. No new payment or order is needed. Real inbox acceptance is separate from mocked ACS unit tests.

## Rollback and operations

Stop new challenges by disabling `CRAVES_EMAIL_VERIFICATION_ENABLED` and disable the narrow transport if needed. Preserve canonical verification, challenge/audit/receipt/outbox history and keys. Keep projection reconciliation running for committed legitimate verification events unless the receiver itself is unsafe. A rollback must not reintroduce Firebase overwriting canonical email; review compatibility before restoring an older Auth image. Prefer a reviewed forward fix or gate-only rollback over an image that erases this new authority.

Inspect only redacted aggregate challenge states, issue/attempt limits, unknown transport receipts, projection attempt/age counters and last safe error codes. Never export pending addresses, OTPs, credentials, cookies or authorization headers into diagnostics. New work may pause; already committed identity projection must remain recoverable.
