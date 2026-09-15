# Referral v2 — pre-integration hardening, not a post-integration repair list

This document supersedes earlier handover descriptions of missing-Redis-key behaviour, capture helpers and focused test coverage. It records engineering improvements made before the user integrates the module. It is not permission to merge, deploy, activate benefits, bypass repository checks or send payments. The protected baseline remains `870f5293884888aa28f0c069b91a86d06492c9a2`; all changes remain confined to referral-added paths on draft PR #357.

## 1. Build defects addressed now

| Area | Change already implemented in this hardening source | Regression evidence to require |
| --- | --- | --- |
| Concurrent attribution | `ProgramService.register` is atomic for direct adapters as well as inbox callers. Transaction-scoped account and sorted identity-signal locks serialize competing signups before duplicate review. | 16 equivalent simultaneous registrations produce one member, wallet and attribution audit; 12 simultaneous shared-contact identities leave 11 reviewed followers. |
| Rare code collision | Code allocation retries `ON CONFLICT(code) DO NOTHING` up to four times without aborting the PostgreSQL transaction; exhaustion is an explicit retryable failure. | Forced collision with an existing code succeeds with the next generated code and one wallet. |
| Partial handler failure | Durable inbox processing and enrollment join the same database transaction. Receive timestamps and retry eligibility use the same injected clock. | A failure injected after inserting the member rolls back member and wallet; original event then succeeds after retry. |
| Cached outbox claim | Replaying a claim checks the current event status, matching lease ID and unexpired lease. Expired, replaced or acknowledged claims cannot grant fresh execution authority. | Exact-expiry and stale-lease tests; exhaustion reaches DEAD and audited replay keeps the original event ID. |
| Request ambiguity | Strict JSON now rejects extra JSON documents or non-whitespace trailing content in addition to duplicate keys, malformed UTF-8 and excessive nesting/size. | Unit and actual signed-HTTP rejection cases; zero inbox rows created by rejected requests. |
| Source trust separation | Decoded Auth, Order and Finance HMAC keys cannot match across source domains, including current/previous rotation slots. | Cross-source reuse fails with `SOURCE_KEY_ISOLATION_REQUIRED`; same-source rotation remains supported. |
| JWT identity | Full canonical-length UUID form is required before Java UUID parsing. Signature, issuer, audience, expiry, roles and integral token version remain verified. | Real RSA signed-token tests reject forged keys, wrong audience, expiry, shortened UUIDs and invalid claim types. |
| Redis absence | Missing projection blocks by default. The existing Auth TTL absence contract requires a separate explicit opt-in; malformed values and Redis errors always block. | Unit projection tests and actual HTTP cases for missing, malformed, suspended, old version and outage. |
| UI duplicate submit | Synchronous operation gates protect member/admin/native financial handlers before a React re-render can disable the button. | Gate tests prove a second synchronous entry is refused until completion. Server transaction protection remains authoritative. |
| Lost response then expired session | A denial of a retry no longer deletes the identity of an earlier uncertain financial request. | Original stored operation UUID survives timeout followed by 401/403/conflict. A definitive rejection of a first attempt may be cleared. |
| Invitation capture | A runnable unmounted handler now performs verified session/code lookup, sets the signed secure first-touch cookie, redirects only to an approved local signup path and provides a signup-boundary reader. | Capture/read-back, another-link first-touch preservation, existing account refusal, expired/tampered/duplicate cookie rejection and lookup-failure tests. |
| Real API/client compatibility | Actual Java HTTP response bodies from a populated synthetic ledger are consumed by the existing TypeScript/Zod contracts. | Five same-SHA fixture checks for member overview, rewards, cashouts, administrator overview and policies. No hand-authored success fixture substitutes for the server. |
| Packaged runtime | A CI-only smoke script builds the actual Dockerfile and starts a temporary non-root, read-only local container with all flags off. | Liveness UP and disabled member API; exact image ID recorded. No cloud registry push or external dependency acceptance. |

The approved rates, cap, minimum and hold are unchanged. This is a repair/verification pass, not a change to product incentives or tax policy. The supplied specification remains the business basis, especially FR-1–FR-13 on page 8.

## 2. What the expanded verification actually does

The backend gate requires at least 18 unit tests and 35 PostgreSQL integration tests, with zero failed, errored or skipped results. It specifically requires the new boundary, resilience and real-HTTP suites, so deleting one cannot be hidden by unrelated passing tests. The six `ReferralHttpContractIT` cases start the actual Spring application on a random local port, exercise RSA/HMAC filters and controllers, and use real disposable PostgreSQL. Redis is an explicit mocked dependency so outage/missing-value responses can be injected deterministically; this is not a claim that real Redis networking or current Auth publishing was tested.

The signed HTTP lifecycle goes through account registration, code retrieval, fixed seller ancestry, order binding, delivery, finance confirmation, pending awards, held/stale-finance refusal, fresh confirmation and credit, then repeated refund reversal. A separate actual HTTP withdrawal scenario checks lost-response replay, conflicting amount, wrong-owner cancellation and repeat cancellation. The injected test clock advances the hold; production hold duration is not shortened.

The web gate consumes five real server response files generated by the same-SHA Java job. Source SHA and file hashes are checked before the client schemas parse them. Its focused suite also covers the first-touch adapter and financial-operation identity helpers. The native job checks the isolated feature against unchanged dependencies and runs its contract/retry helpers plus the existing selected cross-feature regressions. Pure presentation rendering and helper tests are not equivalent to touch/keyboard/browser automation, physical device acceptance or app-store builds.

The pipeline still checks all seven packaged migration resources, the executable launcher and manifest, the exact packaged SBOM bytes, and the standalone migrator against the disposable database twice. The dormant Bicep compilation and read-only release-plan tests remain. The new Docker smoke runs locally on the CI runner, without runtime database credentials or any provider/network integration. Ordinary GitHub runner/build usage can consume existing CI allowance; no Azure resource is provisioned.

Counts here describe the enforced test inventory. The final delivery's exact-head workflow results and downloaded report hashes determine whether it passed. Do not copy an older green SHA as proof for newer files.

## 3. Capture adapter: ready code, explicit owner connections

Files:

- `apps/customer-web-next/src/lib/referrals/invitation-handler.server.ts`
- `apps/customer-web-next/src/lib/referrals/invitation-handler.test.ts`
- existing `first-touch.server.ts` and `contracts.ts`

`createReferralInvitationHandler` accepts the approved HTTPS origin, an explicit local signup path, a server-only signing key, two read-only trusted callbacks (`resolveSession`, `resolveActiveCode`) and explicit enable/retention-approval booleans. It handles only GET `/r/CODE`. The callbacks are bounded by a shared five-second abort deadline and must not infer identity from browser headers. An already-authenticated account is redirected without a new attribution cookie. An anonymous eligible visitor receives a `__Host-craves-referral-first` cookie with Secure, HttpOnly, SameSite=Lax and Path=/, and a private/no-store/no-referrer redirect.

An existing valid first touch wins over a later link and its original expiry is not extended. A present invalid/expired/duplicated token is an explicit error, not a silent switch to the newest referrer. `readSignupReferral` reads and verifies the same token at actual new-account creation; absence can represent a genuinely non-referred signup, whereas a present invalid token throws. Auth must commit the returned attribution together with the account and its durable outgoing registration fact, then clear the cookie after the transaction commits. Existing-account login must never apply it retroactively.

No existing route is mounted in this add-only change. The owner connections are the current server session verifier, an authoritative active-code lookup, the existing signup transaction/outbox and the approved invite route. Those adapters must be wired in the later integration change; they are not proof of an already-connected OTP or mobile deep-link flow. Native app links and cross-device identity transfer still require the existing app/link owners. Do not claim browser cookies alone provide cross-device or post-install attribution.

The 30-day pre-signup retention window remains a proposal requiring explicit product/privacy approval, because the supplied specification locks first-touch at signup but does not define this cookie retention period. The handler refuses to capture until `attributionWindowApproved` is true. This flag does not manufacture the underlying approval.

## 4. New strict revocation configuration

```text
CRAVES_REFERRALS_REVOCATION_ABSENCE_CONTRACT_CONFIRMED=false
```

This is the safe default, read directly by the new service security configuration. With a valid user JWT but a missing Redis projection, the request receives HTTP 503 `REVOCATION_ABSENCE_CONTRACT_UNCONFIRMED`. A wrong Redis database/namespace, lost publisher or empty cache is not silently interpreted as verified account state.

The existing Auth documentation describes short-lived `craves:auth:revocation:<UUID>` entries containing `ACTIVE|minimumVersion` or `SUSPENDED|minimumVersion`, with TTL linked to access-token lifetime plus grace. A real, normal TTL expiry can therefore mean no current revocation. Enable the compatibility opt-in only after reviewing the actual publisher, namespace, access-token lifetime, TTL/grace, outage/recovery and eviction behaviour. Opt-in accepts an absent key under that reviewed contract; it does not turn a Redis outage or malformed projection into success. Do not change or flush the existing Auth projection or disable its current security controls.

Keep all seven programme/public/execution flags off until separately approved activation. No production value of the new flag was written here. Current/previous source HMAC values must remain distinct across Auth, Order and Finance; use Key Vault references, never chat or Git. Existing Azure DevOps service connection remains `Craves-Dev-Service-Connection`; this build workflow performs no Azure login.

## 5. Retry identities and recovery are different concepts

A retry is safe only while it identifies the original intended effect. Source producers must persist an envelope before sending; HTTP 202 means durable receipt, not processed reward. A retry after a timeout keeps the same event/operation ID and payload, while regenerating its transport timestamp/signature. Conflicting content under an existing ID is rejected, not overwritten.

Outbox lease IDs authorize a particular delivery attempt, not a new economic effect. A repeated still-valid claim returns its original rows. An expired claim receives 409; a new claim can obtain a new lease for the same durable event. The Finance consumer must deduplicate that original event/payment attempt across leases and commit durable handling before acknowledging. A new claim ID is not permission to generate a replacement bank-transfer ID.

Member/admin browser recovery remains scoped to the existing account and same browser tab via sessionStorage; native recovery uses the installed secure-store facility. The new synchronous gate is an in-process extra guard, not a database substitute or a cross-tab lock. Closing a tab does not prove a request failed; history/original-attempt reconciliation remains an operator procedure. A recovered request denied after session expiry must retain its identity until a verified result is obtained.

UNKNOWN bank outcomes remain reserved and require Finance evidence for the original attempt. Tests use synthetic outcome facts and never call a payment provider. Provider-side idempotency and reconciliation must be accepted when the Finance connector is wired. This is a required boundary contract, not a promise of exactly-once network delivery.

## 6. Repeat the pre-integration checks without touching production

Use a full checkout of the final review SHA; the additions ZIP intentionally omits the protected baseline manifests/lockfiles. Follow the disposable loopback PostgreSQL setup in `services/referral-service/README.md`. The fixture resets the referral test schema; never point it at production or a localhost production tunnel.

After exporting the documented disposable `REFERRAL_TEST_*` variables, run from the repository root:

```bash
python3 scripts/referrals/verify-additive.py
mvn -B -ntp -f services/referral-service/pom.xml clean verify
python3 scripts/referrals/verify-build.py
export REFERRAL_WIRE_FIXTURE_DIR="$PWD/services/referral-service/target/contract-fixtures"
cd apps/customer-web-next
npm ci
npm run lint
npm run typecheck
npx vitest run --config ../../scripts/referrals/web-vitest.config.mts
npm test
npm run build
cd ../mobile
npm ci
npx tsc --project ../../scripts/referrals/mobile-tsconfig.json --noEmit
npm test -- --runInBand --runTestsByPath src/features/referralsV2/model.test.ts
npm run test:integration
```

The exact new dedicated web gate needs generated Java HTTP fixtures or the matching downloaded backend artifact. Set `REFERRAL_WIRE_FIXTURE_DIR` accordingly; omitting them is a test failure, not a skipped validation. The CI-only container script deliberately refuses casual local invocation outside its GitHub/disposable-test guard; normal local Docker build/run remains described in the service README and release runbook.

## 7. What must be settled before asking for integration

Engine defects found in this pass were fixed in the referral code and tested here; they are not delegated to the user as manual post-integration improvements. Before calling a later revision integration-ready, require its complete focused pipeline, same-source contract evidence, no unresolved high-severity module defect, and an agreed interpretation for product ambiguities. A passing count is not a guarantee of a defect-free system.

The existing mobile-consolidation workflow has a separate mobile-only scope gate that rejects this cross-stack PR before its full-mobile lint/test/bundle stages. It remains a real repository gate. Do not disable it or modify baseline workflows in this add-only branch; resolve through a maintainer-approved scope correction or appropriate PR split before merge. Feature-native tests do not replace its skipped full-mobile checks.

Still separate from standalone engine verification: actual Auth/Order/Finance/checkout publishers and consumers, route/session and mobile deep-link mounting, real Redis connection and producer contract validation, approved image/dependency security assessment, role/grant and restore acceptance, browser/device interactions, sustained-load targets, deployment credentials and policy/legal/privacy/tax/KYC/funding decisions. These must be checked in the controlled integration environment, not discovered by sending the public app live. Any module defect exposed there remains engineering work; the user is not expected to independently rewrite the referral engine.

No merge, deployment, new Azure resource, live referral enrollment, payout, rate change or existing-code modification is authorized by this report. The final PDF and evidence package distinguish observed tests, implementation choices and still-unverified external boundaries.
