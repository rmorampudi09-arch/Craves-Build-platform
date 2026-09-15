# Manual integration and release runbook

**Current state: branch implementation only; no merge or deployment authorised by this handover.** Follow-up changes to current owners require a separately reviewed integration PR. Never mark a gate complete merely because feature CI is green.

## A. Existing insertion points — what is NOT wired yet

| Owner / location | Required follow-up change | Acceptance evidence |
| --- | --- | --- |
| Auth service (`services/auth-service/`) | Publish `account.registered`/`account.status` from the owner's durable transactional outbox; generate/verify first-touch evidence, immutable creation-time parent, current terms and consented keyed hashes. Reuse current UUIDs and dual customer/chef identity. | Source transaction/outbox commit, replay/conflict test, no reward on signup, self-referral block, no re-parent on existing-account login. |
| Order service (`services/order-service/`) | Bind original order-time policy/snapshot; publish child-order delivery and cumulative food-refund versions; attest globally first qualifying delivered checkout from authoritative order history. | Multi-chef totals reconcile; duplicate/out-of-order events safe; first-checkout race yields one bonus; no fabricated source hash. |
| Finance owner / Integration (`services/integration-service/`, alongside the existing reviewed finance implementation) | Publish capture/refund/commission evidence, recipient assessments and real marketing-budget funding. Consume referral outbox with provider idempotency and emit original-attempt payout evidence. | Captured-and-delivered order reconciles with both ledgers; selling-chef net unaffected; uncertain provider timeout never generates a replacement transfer. |
| Existing checkout/payment owner | Connect `BenefitOperations` reserve/capture/release/refund for wallet spend and invitee discount. Keep current totals and payment amounts authoritative. | Concurrent checkouts cannot overspend; cancellation releases only unsubmitted funds; capture/refund repeats are idempotent; source monetary totals agree. |
| Web app / existing server session owner | Add a separately reviewed Node-runtime `/api/referrals/[...path]` handler using `createReferralBff`. `resolveSession` must call the actual existing session verifier, not decode an unverified browser JWT. Mount `ReferralWorkspace` in the account/chef area and `ReferralAdminWorkspace` within the current administrator shell. Pass verified account UUID and existing logo component. | Real customer, chef, admin and non-admin sessions; logout/revocation; 401/403 clearing; no accidental public internal endpoints. |
| Web signup / invite route | Add reviewed `/r/[code]` entry and signup handoff around `first-touch.server.ts`. Approve its proposed 30-day retention first. Existing account visit must not change parent. | Mobile/browser QR reaches correct origin, original first touch wins, tampered/expired token rejected, terms/consent captured before authoritative signup event. |
| Mobile existing referral slot | Current `CustomerSettingsReferralScreen` is in `apps/mobile/src/features/customerSettings/screens/CustomerSettingsLegacyScreens.tsx`. `CustomerRootNavigator.tsx` imports it; `CustomerProfileScreen.tsx` already navigates to `CustomerSettingsReferral`. Mount the new `ReferralRewardsScreen` there behind the approved programme flag, using the current authenticated client from `src/core/http/transport.ts` and existing session/profile owner. Update contract-unavailable state only after the route contract is accepted. | Android/iOS navigation, account switching, secure recovery, QR/share, deep-link signup, accessibility and actual device tests. No root navigator/session replacement. |
| API gateway / networking | Add reviewed member/admin routes to the private new service. Restrict signed internal routes to trusted producers/Finance network paths; do not expose them through the browser BFF. Rate-limit anonymous invite resolution, QR/member reads and admin writes; preserve no-store and audit pagination headers. | Gateway policy diff, caller isolation tests, public denial of internal APIs, payload limits and origin checks. |

These owner-side changes are **engineering work remaining**, not included current-code modifications. The new native/web features are intentionally unmounted and the Java source client is not automatically installed in those owners.

## B. Product, legal, privacy and finance approvals

Obtain real evidence references for each field required by the policy draft: `legalReviewRef`, `termsVersion`, `taxReviewRef`, `privacyReviewRef`, `fundingReviewRef`, `multiChefDecisionRef`, `payoutReviewRef`. The reviewer must assess the actual launch jurisdiction and reward structure. This repository does not decide legality, applicable tax rates or exemptions. The source document's general claims are not substitutes for those reviews.

Resolve before activation:

- The source's locked retained-share policy is implemented; no rollup. Approve or change through a reviewed future policy design, never ad hoc historic recalculation.
- Approve the child-order INR 800 floor interpretation and invitee-discount allocation for mixed-chef checkouts. Decide treatment of any existing referral/loyalty/Craves Coins programme before enabling a second incentive path.
- Confirm the food-subtotal definition from the Order owner, especially item-level versus post-subtotal discounts and refunded-food allocation. Never infer food refunds from a gross refund including tax/delivery.
- Approve the INR 400/250 marketing budgets in addition to seller-chain commission funding. Do not advertise all-in acquisition cost as 4%.
- Set approved positive `CRAVES_REFERRALS_CASHOUT_MINIMUM_PAISE`, `CRAVES_REFERRALS_ANNUAL_KYC_THRESHOLD_PAISE`, and `CRAVES_REFERRALS_LIFETIME_REVIEW_PAISE`; defaults are zero and do not represent legal thresholds.
- Decide fiscal-year boundaries, withholding assessment/reporting, destination verification, cashout limits, KYC refresh and audit retention. Supply real recipient evidence; do not convert existing chef business approval into financial consent.
- Approve consent, fingerprint minimisation/retention and the proposed 30-day pre-signup attribution cookie. Publish accepted programme terms including reversals, negative-balance clawback and no earnings guarantee. Marketing must not project downline income.

Save a new evidence-backed policy draft with Administrator A. Administrator B must independently approve a future effective time. The seeded, unauthored draft cannot act as a real approval. Existing orders retain their original policy and ancestry snapshot.

## C. Infrastructure — explicit manual work

1. Reserve a **new isolated referral Container App name**. Confirm that name is not any current Craves app and does not already exist. Reuse only explicitly approved environment/registry/identity resources. No existing app, environment or database server is replaced by this delivery. The included template is dormant, not a command that has been executed.
2. Verify registry image digest, target subscription/resource group/environment, regional networking and capacity. Obtain cost approval for the new workload. Template launch configuration is one active-revision replica; that is **not high availability**. Do not silently increase replicas or deploy the seven-service backend pipeline.
3. Create or approve a restricted database/schema allocation and separate migration/runtime roles. Confirm backups/PITR and perform a restore rehearsal. The runtime role must not be superuser, schema owner or have CREATE/ALTER/DROP/TRIGGER-bypass rights or access to existing chef/order/auth tables. Preserve the append-only triggers and grants. Test permitted application operations with the real restricted role, not just a test superuser.
4. Build the standalone service, archive tests and SBOM, scan the application/image and pin the released image digest. Resolve inherited dependency findings in a separate authorised change. Do not run `npm audit fix --force` against protected baseline lockfiles.
5. Run the isolated migrator once using migration-only credentials and the exact approval phrase below. Automatic Spring Flyway startup is disabled. Check `referral_schema.flyway_schema_history_referral`, migration checksums and isolated object/grant inventory. Do not apply these migrations to a host service's Flyway history or renumber live host migrations.
6. Provision source-specific current/previous HMAC secret references, approved JWT verification PEM, issuer/audience, Redis TLS connection and database credentials in Key Vault. Do not paste values into GitHub, evidence PDFs, issue comments or shell tracing. Auth/Order/Finance keys must be distinct and at least 32 decoded bytes. Validate rotation with overlapping current/previous keys and confirm time synchronisation.
7. Deploy only the referral image with **all seven public/execution flags false**. Check liveness, database/revocation connectivity and no side effects. Public/member routes remain disabled. Keep the original web/Auth/Order/Integration revisions untouched in this step.
8. After separate owner integration review, test private event transport and Finance outbox handling in staging. Validate source JWT token-version/revocation semantics using the current Auth owner. Apply gateway controls and observability. Archive exact SHA, image digest, migration state, runtime settings, role grants, test results and rollback revision.

### Build and isolated migration commands

Execute from a reviewed checkout; do not paste database secrets into command arguments. These are manual instructions, not a deployment executed by the assistant.

```bash
# Read-only scope assertion against the protected baseline:
python3 scripts/referrals/verify-additive.py

# CI supplies a disposable PostgreSQL test database and explicit test confirmation.
mvn -B -ntp -f services/referral-service/pom.xml verify

# Build only this service; the Docker build skips tests, so require verified CI first.
docker build -t "$APPROVED_REFERRAL_IMAGE" services/referral-service

# Run outside the application, with migration-only credentials injected securely.
# All required values must target the approved isolated database/schema.
export REFERRAL_MIGRATE_CONFIRM=APPLY_ISOLATED_REFERRAL_SCHEMA
java -Dloader.main=in.craves.referral.infra.ReferralMigrate \
  -cp services/referral-service/target/referral-service-0.1.0-SNAPSHOT.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher
```

Required migrator environment: `REFERRAL_DB_URL`, `REFERRAL_DB_USER`, `REFERRAL_DB_PASSWORD`, and the approval phrase. Verify the PropertiesLauncher class exists in the exact built archive before running this command. Migration credentials must not be the normal application credentials. Never use Flyway clean, drop the schema, delete journal history or restore a backup over newer real financial events as an ordinary rollback.

## D. Staged activation — only after evidence passes

| Stage | Permitted action | Must remain off / stop condition |
| --- | --- | --- |
| Dormant deployment | New service/image, schema and private connectivity validation. | All programme execution/public flags off; no real payouts. |
| Staging contract acceptance | Synthetic accounts/orders; authoritative source publishers and Finance consumer; duplicate/refund/unknown-outcome and permissions tests. | Production sources/payouts remain disconnected. |
| Production private observation | After approvals, explicit `ENABLED` and `WORKERS_ENABLED` only; source completeness and reconciliation observed without awarding. | `AWARDS`, `SETTLEMENT`, `WITHDRAWALS`, `SPENDING`, `PUBLIC_ACCESS` off. Pause on missing binding/funding or unresolved incompatible source contract. |
| Approved small pilot | Activate reviewed policy and future-order award creation for an explicit allowlisted cohort enforced by owner/gateway rollout, then settlement only after fresh finance evidence and holds. | No automatic public rollout; cashout off. Cohort filtering is an integration responsibility, not an implemented runtime allowlist. |
| Wallet pilot | Enable spending only after checkout reserve/capture/refund integration and reconciliation are accepted. | Withdrawals off. Wallet-first does not mean checkout is already wired. |
| Cashout beta | Positive assessed limits, destination/KYC/tax review, independent approval and Finance provider reconciliation accepted. | Unknown outcomes never trigger replacement payments. |
| Public availability | Explicit decision after completed technical/compliance/economic gates; public flag, web/native navigation and programme communication enabled together. | No inferred approval from an elapsed pilot duration or passing CI. |

The source recommends a 20–50 chef, one-city pilot (4–6 weeks), then beta. These are planning suggestions, not a scheduled rollout or results achieved. Owner/gateway cohort selection is still to be implemented; do not turn on awards globally and call that a limited pilot.

## E. Required repository work before merge

Resolve the existing mobile-only consolidation scope gate through a maintainer-approved, separate workflow-scope correction or a pure-mobile split. Do not disable that check, alter branch protection or claim the cross-stack PR has all checks green. Re-run the full required checks against the final integration SHA and current main. Review older referral/loyalty branches and current runtime ownership; names alone do not prove they are deployed.

Only after all approvals should a human remove draft status, merge the reviewed additions and execute the isolated release. This delivery deliberately does none of those actions.
