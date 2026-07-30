# Craves Admin Web Operations Shell — Engineering Handover

Date: 2026-07-30
Repository: `rmorampudi09-arch/Craves-Build-platform`
Branch: `feature/admin-web-operations-shell`
Status: Code only. No pipeline, deployment, APIM or runtime change performed.

## 1. Objective
Create the secure entry point for future administrative modules without introducing any administrative mutation or business rule.

## 2. Parent branch
`feature/chef-mobile-order-workflow`.

## 3. Runtime route
`/admin`.

## 4. BFF route
`GET /api/admin/me`.

## 5. Upstream contract
The BFF reuses the existing `GET /auth/me` contract through `CRAVES_API_BASE_URL`.

## 6. Authentication
The browser sends only the HTTP-only Craves access cookie to the BFF.

## 7. Authorization
The shell becomes available only when the backend identity contains the exact `ADMIN` role.

## 8. No role mutation
The client cannot grant, request, persist or elevate the ADMIN role.

## 9. No administrative action
The module contains no approve, reject, refund, price, subscription, support or configuration mutation.

## 10. Public identity allow-list
Only identity ID, display name, roles and the derived `adminEnabled` flag are returned.

## 11. Excluded data
Phone, email, tokens, provider data, audit internals and secrets are excluded.

## 12. Caching
Admin identity responses use no-store/no-cache headers.

## 13. Timeout
The BFF aborts the upstream request after eight seconds.

## 14. Session expiry
HTTP 401 clears the Craves access cookie.

## 15. Access denial
HTTP 403 returns `ADMIN_ACCESS_REQUIRED`.

## 16. Invalid backend response
Malformed identity responses return HTTP 502.

## 17. UI behavior
The page shows access-check, authentication-required, authorization-denied and temporary-unavailable states.

## 18. Files added
- `apps/customer-web-next/src/lib/admin-session-contract.ts`
- `apps/customer-web-next/src/lib/admin-session-contract.test.ts`
- `apps/customer-web-next/src/app/api/admin/me/route.ts`
- `apps/customer-web-next/src/components/admin-operations-shell.tsx`
- `apps/customer-web-next/src/app/admin/page.tsx`
- `apps/customer-web-next/modules/admin-operations-shell/README.md`
- `azure-pipelines-admin-web-operations-shell-ci.yml`

## 19. CI
The CI performs dependency installation, TypeScript validation, tests and static privacy checks.

## 20. Lockfile amendment
The wider project still requires reviewed lockfiles and migration from `npm install` to `npm ci` before public deployment.

## 21. Deployment
No deployment pipeline is introduced because this shell is part of the existing Next.js image.

## 22. APIM
No new APIM operation is required; the shell reuses the existing auth identity route.

## 23. Azure cost
No Azure resource is created.

## 24. Secrets
No new secret is required.

## 25. Logging
The runtime does not log tokens or identity payloads.

## 26. Search indexing
The admin page is marked `noindex` and `nofollow`.

## 27. Browser storage
No localStorage or sessionStorage is used.

## 28. Backend authority
Auth Service remains authoritative for identity and roles.

## 29. Future chef review module
Must use User/Chef Service admin endpoints and append audit records.

## 30. Future refund module
Must use Order/Integration Service ownership and approved refund rules only.

## 31. Future subscription module
Must use Subscription Service and configured plans without inventing pricing.

## 32. Future support module
Must expose only the minimum enquiry information required for triage.

## 33. Future audit module
Must be read-only by default and redact secrets/provider payloads.

## 34. Future configuration module
Must use versioned, auditable settings with dual confirmation for high-risk changes.

## 35. Future analytics module
Must use aggregated metrics and avoid exposing personal data.

## 36. Manual CI action
Register `azure-pipelines-admin-web-operations-shell-ci.yml` in Azure DevOps later.

## 37. Test branch
Run CI against `feature/admin-web-operations-shell` only.

## 38. Test identity
Use a controlled identity that already has the backend ADMIN role.

## 39. Negative test
A CUSTOMER/CHEF-only identity must receive HTTP 403.

## 40. Session test
An expired token must receive HTTP 401 and clear the cookie.

## 41. Privacy test
Browser responses must not include phone, email or token values.

## 42. Rollback
Remove only the admin page, component, BFF, contract, tests, CI and documentation from the feature branch before merge, or restore the previous exact web image after deployment.

## 43. Main branch
Nothing from this module is merged into `main` yet.

## 44. Runtime state
No running environment has changed.

## 45. Business rules
No pricing, commission, KYC approval, refund entitlement, SLA, GST or FSSAI rule is introduced.

## 46. Provider state
Cashfree, Borzo and delivery providers are untouched.

## 47. Acceptance criterion
CI passes and controlled ADMIN/CUSTOMER role smoke tests behave as expected.

## 48. Merge order
This module follows PR #55 and becomes the base for subsequent admin modules.

## 49. Operational recommendation
Keep admin access behind a dedicated domain or network/access policy before production exposure.

## 50. Final status
The secure administrative shell is implementation-complete and fail-closed. All operational modules remain isolated future changes.
