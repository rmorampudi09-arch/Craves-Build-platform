# P57 — Customer Profile/Rewards Contract

**Status:** DONE  
**Branch:** `mobile-ui-rebuild-from-scratch`  
**Started from:** `6a8bc45f8cda0a4f9d3f1b0db82451bf31f245e9`  
**Validated implementation:** `9983592fc87e603a95fa4eace5b6fbf71225057b`  
**CI:** `31270356726` / `93135116492` — SUCCESS

## Scope delivered

P57 defines the customer profile/rewards data boundary required by P58 without implementing the P58 profile UI.

The approved server-owned customer profile source is the existing `GET /api/v1/customer/profile` response from `user-chef-service`. The mobile contract allow-lists and normalizes only the fields actually supplied by that response: profile ID, identity ID, registered phone number, first name, last name, email, created timestamp, and updated timestamp.

The contract preserves registered-phone readiness without inventing verification semantics. It exposes the server registered number, its last four digits, and `isRegistered`; it deliberately does not claim a separate `verified` state because no such field exists in the accepted profile response.

## Unsupported capability posture

The current accepted backend/profile surface does not expose a reward balance, reward tier, reward history, customer order-status aggregate counters, profile notification unread count, or chef-role/eligibility summary. P57 therefore models these capabilities explicitly as `unsupported` with null/empty payloads and the stable reason `not-exposed-by-approved-contract`.

This is intentional fail-closed behavior, not placeholder data. P58 can capability-gate or omit unsupported rows/cards instead of fabricating reward coins, counters, notification badges, or role state.

No reward endpoint, aggregate-count endpoint, notification endpoint, chef-eligibility endpoint, backend field, or APIM route was invented by this phase.

## Explicit state contract

P57 provides a discriminated profile hub state covering:

- `loading`
- `ready`
- `empty`
- `unsupported`
- `error` with `invalid-response` or `request-failed`

It also distinguishes `full` versus `partial` supported profile data and keeps missing optional identity details explicit.

## Query integration

A private customer-scoped TanStack Query key and `useCustomerProfileQuery()` are provided using the existing mobile API client, authentication identity scope, request cancellation signal, dedupe key, stale-time pattern, and invalidation boundary. Full server profile data remains server state; this phase does not create a parallel global store.

## Fixtures and tests

Fixtures are included for full, partial, empty, and unsupported profile states.

Focused Jest coverage verifies:

- approved profile-field mapping;
- profile/identity metadata validation;
- registered-phone last-four/readiness derivation;
- partial/missing profile behavior;
- unsupported rewards/history/order-count/notification/chef-role posture;
- exact customer profile GET route and request dedupe usage;
- malformed-response rejection;
- loading, empty, invalid-response, request-failed, and ready query states.

## Changed implementation files

- `apps/mobile/src/features/customerProfile/domain/customerProfileContract.ts`
- `apps/mobile/src/features/customerProfile/api/customerProfileApi.ts`
- `apps/mobile/src/features/customerProfile/query/customerProfileQueries.ts`
- `apps/mobile/src/features/customerProfile/fixtures/customerProfileFixtures.ts`
- `apps/mobile/src/features/customerProfile/customerProfileContract.test.ts`
- `apps/mobile/src/features/customerProfile/customerProfileApi.test.ts`
- `apps/mobile/src/features/customerProfile/customerProfileQueries.test.ts`

## Validation

GitHub Actions workflow `.github/workflows/mobile-phase1-ci.yml`, run `31270356726`, job `93135116492` completed successfully for implementation SHA `9983592fc87e603a95fa4eace5b6fbf71225057b`.

Successful gates:

- dependency installation;
- TypeScript strict check;
- ESLint zero-warning gate;
- Jest;
- production Android JavaScript bundle;
- backend/APIM/infrastructure source guard.

No Java/Gradle/APK/AAB packaging was performed, consistent with the implementation-phase policy.

## P57 exit

P57 is DONE at its defined contract/integration scope. P58 can consume a typed profile summary and explicit capability availability without inventing backend fields or reward semantics.

P58 — Customer Profile UI — was not implemented or pre-started by this phase.
