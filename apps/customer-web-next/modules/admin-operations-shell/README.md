# Craves Admin Operations Shell

## Purpose

Provides a secure Next.js entry point for future Craves administrative modules.

## Route

```text
/admin
GET /api/admin/me
```

## Security

- Reuses the HTTP-only `craves_access_token` cookie.
- Calls the existing `/auth/me` backend contract.
- Requires the backend-provided `ADMIN` role.
- Does not grant, mutate or persist roles.
- Returns no phone number, email, token or private profile details.
- Uses no-store responses and an eight-second upstream timeout.
- Contains no administrative mutation.

## Local validation

```bash
cd apps/customer-web-next
npm install --ignore-scripts
npm run typecheck
npm run test
```

## CI

```text
azure-pipelines-admin-web-operations-shell-ci.yml
```

## Manual steps later

1. Register the CI YAML in Azure DevOps.
2. Run it against `feature/admin-web-operations-shell`.
3. Verify a test identity with the existing backend `ADMIN` role.
4. Do not expose this route publicly until admin authentication and audit requirements pass review.

## Deferred modules

Chef application review, refunds, subscriptions, support enquiries, audit logs, platform configuration and analytics are separate modules. This shell intentionally contains no guessed business rules.
