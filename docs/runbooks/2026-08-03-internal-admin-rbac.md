# Craves internal administrator roles — backend handover

Date: 2026-08-03

## Outcome

The backend now has a complete internal-role model rather than one unrestricted `ADMIN` role. No admin/customer/chef UI, React Native code, payment-provider activation, delivery-provider activation, notification-provider activation, credential or live Azure resource is changed by this source module. A guarded APIM source rollout is included but remains non-mutating until its explicit pipeline is run.

## Existing backend operations retained

The following backend capabilities already existed on `main` and remain authoritative:

- chef application and KYC review;
- chef approval/rejection and CHEF role grant;
- subscription plan, schedule and lifecycle administration;
- account suspension/reactivation with Firebase synchronization;
- notification backlog recovery;
- order, payment, refund and delivery investigations;
- chef earnings allocation and settlement records;
- launch-policy creation and activation;
- append-only service-owned audit evidence.

This change applies least-privilege internal roles to those operations and adds secure role lifecycle management in Auth Service.

Chef rejection now also enforces the same pending-application guard as approval, preventing an internal operator from rejecting an already approved or previously rejected application.

## Role ownership

Auth Service owns internal role definitions, assignments, token invalidation and role-change audit. Downstream services trust only signed Craves JWT role claims and apply operation-specific authorization again inside the owning service.

## Compatibility boundary

`ADMIN` is retained only so the unchanged Next.js admin shell can identify a backoffice user. It is not accepted as permission for sensitive service methods in this module. Every identity that held `ADMIN` before Flyway V6 is granted `PLATFORM_ADMIN` during migration.

## Operation matrix

| Backend operation | Authorized roles |
|---|---|
| Internal role assignment | `PLATFORM_ADMIN` |
| Internal user and role-audit reads | `PLATFORM_ADMIN`, `AUDIT_ADMIN` |
| Suspend/reactivate identity | `PLATFORM_ADMIN` |
| Read intervention status | `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, `AUDIT_ADMIN` |
| List/detail chef applications | `PLATFORM_ADMIN`, `CHEF_ADMIN`, `COMPLIANCE_ADMIN`, `AUDIT_ADMIN` |
| Stream KYC proof | `PLATFORM_ADMIN`, `CHEF_ADMIN`, `COMPLIANCE_ADMIN` |
| Approve/reject chef | `PLATFORM_ADMIN`, `CHEF_ADMIN` |
| Subscription administration | `PLATFORM_ADMIN`, `SUBSCRIPTION_ADMIN` |
| Order investigation | `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, `PAYMENTS_ADMIN`, `OPERATIONS_ADMIN`, `AUDIT_ADMIN` |
| Payment/refund investigation | `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, `PAYMENTS_ADMIN`, `AUDIT_ADMIN` |
| Delivery investigation | `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, `OPERATIONS_ADMIN`, `AUDIT_ADMIN` |
| Earnings/settlement mutations | `PLATFORM_ADMIN`, `PAYMENTS_ADMIN` |
| Earnings/settlement reads | `PLATFORM_ADMIN`, `PAYMENTS_ADMIN`, `AUDIT_ADMIN` |
| Launch-policy administration | `PLATFORM_ADMIN`, `OPERATIONS_ADMIN` |
| Notification backlog read | `PLATFORM_ADMIN`, `NOTIFICATION_ADMIN`, `AUDIT_ADMIN` |
| Notification requeue | `PLATFORM_ADMIN`, `NOTIFICATION_ADMIN` |

## Database migration

`V6__internal_admin_rbac.sql`:

1. adds nine internal role codes to `auth_role`;
2. backfills every legacy `ADMIN` identity to `PLATFORM_ADMIN`;
3. creates `auth_internal_role_change_audit`;
4. indexes target, actor and correlation lookups;
5. adds reason and token-version constraints.

The migration does not remove customer, chef or legacy role rows and does not create any identity.

## Concurrency and lockout controls

Role replacement is serialized through a PostgreSQL transaction advisory lock. The target identity row is also locked. A supplied `expectedTokenVersion` must match the current row, preventing two administrators from silently overwriting one another. Self-removal of `PLATFORM_ADMIN` is rejected, and the last active platform administrator cannot be removed.

## Token and session controls

When roles actually change:

- the target token version increments;
- all active refresh sessions are revoked;
- V4 queues the account/token-version projection for Redis;
- old refresh tokens stop immediately;
- old access tokens are rejected immediately when distributed token-revocation enforcement is enabled, and otherwise expire at the existing short access-token TTL.

The mutating role endpoint also rechecks the actor's live database role and token version, so a revoked platform administrator cannot use an old access token to change roles in Auth Service.

## Audit controls

Every role replacement stores actor, target, exact previous/new role sets, previous/new token versions, changed/no-change result, reason, correlation UUID and timestamp. Sensitive internal-user and audit reads also write to the existing `auth_audit` table with the operator-supplied reason.

## Privacy

Internal user responses return identity UUID, masked phone, masked email, display name, status, token version and internal roles. Firebase UID, raw phone, raw provider state, tokens, credentials and refresh-session contents are excluded. All responses are no-store.

## Runtime flag

The management API defaults fail closed:

```text
CRAVES_INTERNAL_ADMIN_RBAC_API_ENABLED=false
```

All downstream role enforcement is code-level and becomes active with the new images. The management API must be enabled only after V6 is confirmed and at least one platform administrator has refreshed their session.

## Deployment order

Use the backend completion pipeline order:

1. Auth Service
2. Notification Service
3. User/Chef Service
4. Catalog Service
5. Integration Service
6. Subscription Service
7. Order Service

The catalog image has no RBAC source change but remains part of the atomic seven-service release and rollback boundary.

## Verification before deployment

Run `azure-pipelines-backend-completion.yml` in `VERIFY_ONLY`. It now invokes the internal RBAC validator and Maven verification for all services. Confirm Auth Flyway validation includes V6 and every new JUnit role-isolation test passes.

## Manual activation prerequisites

- Confirm a restorable PostgreSQL backup/restore point.
- Confirm V6 applied successfully to `craves_auth_db`.
- Confirm at least one existing internal identity has both `ADMIN` and `PLATFORM_ADMIN`.
- Sign that identity out and back in so its JWT contains `PLATFORM_ADMIN`.
- Confirm the token-revocation/security rollout state before changing any existing staff roles.
- Enable only `CRAVES_INTERNAL_ADMIN_RBAC_API_ENABLED`; do not enable external providers as part of this action.

## First production validation

1. Read the role catalog with the refreshed platform administrator token.
2. Read the platform administrator record with a reason and correlation UUID.
3. Submit the same exact role set and verify `changed=false` with an audit row.
4. Assign `SUPPORT_ADMIN` to a non-production test staff identity.
5. Confirm its old refresh session is revoked.
6. Sign in again and confirm the new token contains `SUPPORT_ADMIN` plus compatibility `ADMIN`.
7. Confirm order/payment investigation reads work.
8. Confirm chef approval, settlement mutation, launch-policy mutation and notification requeue return 403.
9. Remove the test role and confirm backoffice compatibility access is removed.

## Rollback

Disable the management API flag first. Roll back all seven service images through the guarded release pipeline if necessary. Do not delete V6 tables or role rows: Flyway migrations and append-only audit evidence are forward-only. Existing staff retain their assigned roles in the database, but older images authorize only the legacy `ADMIN` role, so rollback should be short-lived and followed by a corrected forward release.

## APIM publication

The guarded API definition owns only `api/v1/admin/internal-access`, verifies a unique path owner, refuses inherited `backend-id` routing, preserves the caller's Bearer token, adds no-store security headers, reads every operation back, and confirms unauthenticated requests receive HTTP 401. Status and operation-scoped rollback pipelines are included.

## Deferred items

- admin portal UI/UX for role assignment;
- external provider activation;
- final staff assignments and separation-of-duties decisions;
- production token-revocation activation if it is still disabled.

Those items require later operator or product decisions; no value or staff assignment has been invented in source.
