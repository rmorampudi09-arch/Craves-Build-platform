# Administrator session release

## Scope and policy

Internal administrator credentials have an absolute 28,800-second deadline from the verified Firebase `auth_time`. Short access JWTs retain their existing 15-minute default and are shortened at the final boundary. Rotation does not extend the original deadline. Customer/chef-only credentials keep the existing 30-day refresh policy. No idle-lock policy or sensitive-action reason/confirmation is removed.

The browser coordinates renewal with Web Locks across tabs, rechecks the shared cookie after acquiring the lock, and broadcasts logout without credentials. Only a non-secret refresh request receipt may be stored in localStorage; access and refresh credentials remain host-only HttpOnly/Secure/SameSite=Lax cookies, with refresh Path `/api/auth`. Delivery Intelligence uses the host-root refresh/status endpoints. The bounded server coalescer supports browsers without Web Locks.

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

Use the existing Auth, dedicated `Dockerfile.admin` and Delivery Intelligence pipelines with `Craves-Dev-Service-Connection`. Record exact tested/deployed SHA, immutable images, ready revisions and one-replica limits. Check inherited gateway cookie/no-cache policies and downstream revocation readiness. Preserve Pidge, payments, orders, database configuration and unrelated flags.

Local Java dependency resolution was unavailable in this workspace; the dedicated GitHub CI provisions disposable PostgreSQL 16 for actual transaction, replay, revocation and concurrency checks. Controlled-clock tests are not an eight-hour browser soak. Neither a green build nor a health response substitutes for authenticated production acceptance.

## Rollback

Restore the recorded healthy image/revision for each affected existing application. Keep additive schema and session records. Disable Academy if any Academy acceptance gate fails. Retain prior gateway policy for restoration. Do not drop data or reset production clocks/TTLs as a test.
