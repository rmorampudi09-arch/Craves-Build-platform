# P24 — Logout, Revoke, and Role-State Cleanup

## Status

**DONE** at implementation/static-contract level.

P24 was authorized after P23 and is limited to logout/revoke semantics, local credential cleanup, private client-state cleanup, role-state reset, and safe return to the authentication root. No P25 product-shell work is included.

## Source and validation

- Started from branch head: `f3c165071f47a95c9cb0dda3a97c270d5d53c447`.
- Validated implementation commit: `4fab42f9184ffda34121adf2f8331247d946a79f`.
- GitHub Actions run: `31225688358` — **SUCCESS**.
- Workflow: `.github/workflows/mobile-phase1-ci.yml`.

Successful checks:

1. checkout `mobile-ui-rebuild-from-scratch`,
2. Node 22.13 setup,
3. `npm ci`,
4. strict TypeScript (`tsc --noEmit`),
5. ESLint with zero warnings,
6. Jest including P24 logout/revoke/cache/role-state regressions and prior tests,
7. production Android JavaScript bundle generation with `react-native bundle`,
8. backend/APIM/infrastructure source-change guard.

No per-phase APK/Gradle packaging was performed, per `phases.md` policy.

## Accepted logout boundary

P24 accepts this bounded flow:

`authenticated Customer/Chef state` → best-effort `POST /api/v1/auth/logout` with the stored refresh credential → unconditional local CRAVES credential cleanup → Firebase provider sign-out → private TanStack Query data removal → mutation-state removal → Redux auth/role reset → authenticated navigator subtree unmounted → anonymous Auth root.

Remote revoke failure, timeout, or offline state does not prevent local sign-out.

## Contract and security behavior

- Existing `authApi.logout()` remains the exact API wrapper and sends the stored refresh token to `POST /api/v1/auth/logout`.
- `authService.logout()` keeps remote revocation best-effort and always executes local CRAVES/Firebase cleanup.
- No token is added to route params, general storage, logs, query keys, or Redux.
- `selectedRole` is reset to the anonymous default (`CUSTOMER`) on `signedOut`, so a prior Chef intent is not retained across logout.
- Identity, account resolution, and auth error state are cleared on sign-out.
- Private query keys are canceled and removed. Removal executes even if query cancellation rejects.
- Mutation cache state is cleared during logout.
- If targeted private-query cleanup itself cannot finish, the coordinator fails closed by discarding the broader query cache before completing sign-out.
- Public query cache may remain when targeted cleanup succeeds; authenticated/private data does not.

## Navigation/back behavior

`AppNavigator` already selects either `AuthenticatedNavigator` or `AuthNavigator` from `auth.bootstrapStatus`. P24 routes all current sign-out controls through the centralized logout coordinator, which dispatches `signedOut` after cleanup. React therefore unmounts the authenticated navigator subtree and mounts a fresh Auth navigator; Android Back cannot revive the old Customer/Chef authenticated stack.

No parallel navigation reset mechanism was added.

## Changed files

- `apps/mobile/src/app/query/queryCache.ts`
  - Guarantees private query removal in `finally` even if cancellation fails.
- `apps/mobile/src/features/auth/state/authSlice.ts`
  - Resets selected role to anonymous default during `signedOut` in addition to clearing identity/account/error state.
- `apps/mobile/src/features/auth/state/logoutCoordinator.ts`
  - New centralized app-level logout cleanup orchestration.
- `apps/mobile/src/features/auth/state/logoutCoordinator.test.ts`
  - Covers private-query preservation boundary, mutation cleanup, root sign-out dispatch, and unexpected session-cleanup failure.
- `apps/mobile/src/features/auth/state/authLogout.test.ts`
  - Covers successful revoke/local cleanup and offline remote-revoke failure.
- `apps/mobile/src/features/auth/state/logoutState.test.ts`
  - Covers Chef intent/identity reset to anonymous state.
- `apps/mobile/src/features/auth/screens/CustomerAccountStatusScreen.tsx`
  - Routes Sign out through the centralized P24 coordinator.
- `apps/mobile/src/features/auth/screens/ChefAccountStatusScreen.tsx`
  - Routes Sign out through the same centralized P24 coordinator.

## Existing foundation intentionally reused

P24 does not duplicate earlier session architecture. It reuses:

- `features/auth/api/authApi.ts` for the exact logout endpoint,
- `features/auth/state/authService.ts` for provider/session cleanup,
- `features/auth/api/sessionManager.ts` for CRAVES token clearing,
- process-memory access token ownership from P10,
- encrypted refresh credential ownership from P10,
- TanStack Query cache ownership from P08,
- Redux auth state ownership from P12/P21,
- the existing conditional root navigation gate from P11/P21.

## Guide alignment

The master implementation guide requires sensitive refresh credentials to remain in secure storage, private persisted state to be cleared on logout/account deletion, role-specific stores to be cleared on logout/role change, and server state to remain owned by the query/cache layer. P24 follows those rules without introducing a second auth/store/cache architecture.

## Explicitly outside P24

P24 does not implement:

- P25 Customer root shell/bottom tabs,
- Customer marketplace/product screens,
- Chef operational/product screens,
- cart domain/product data,
- Settings reference UI,
- live APIM/device runtime certification,
- final Android APK/AAB packaging,
- later lifecycle/accessibility/performance/security audit phases.

## Completion result

All P24 acceptance criteria in `phases.md` are satisfied at implementation/static-contract level:

- logout/revoke path is centralized,
- local credentials are cleared regardless of remote revoke outcome,
- Customer/Chef private query and mutation state is removed,
- role/auth state is reset,
- the app returns to a fresh Auth root,
- authenticated navigation history cannot be re-entered through Back,
- CI is green,
- P25 remains unauthorized.
