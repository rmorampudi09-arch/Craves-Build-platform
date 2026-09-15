# Requirements traceability and acceptance boundary

Implementation is present on draft PR #357. Mounting the features, emitting authoritative source facts and activating production remain separate work. The business source is Craves Chef Referral Program v2.0, section 7 (p. 8); architecture/compliance/rollout are sections 10–13 (pp. 12–13).

| Requirement | Added implementation | Still needed before production acceptance |
| --- | --- | --- |
| FR-1 code/link/QR at creation | `ProgramService`, `ReferralCodes`, authenticated member code/QR endpoints; web/native sharing. | Auth registration event; `/r/CODE` landing/deep-link handoff; existing navigation mount. |
| FR-2 immutable signup attribution | Referral schema constraints/triggers; signup source validation; signed first-touch helper. | Real creation-time transactional outbox, consent/terms, no unsupported retrospective re-parenting. |
| FR-3 full ancestry / three ancestors | Stored ancestry and seller-time snapshots; preserved level numbers; canonical and database tests. | Dual-identity and approved backfill/first-order integration evidence. |
| FR-4 delivered order rewards | `AwardService`, immutable policy and child snapshots, idempotent inbox/locks, commission evidence. | Real Order/Finance publishers, gateway/network trust and approved cohort rollout. |
| FR-5 once-only customer bonus | Authoritative first-checkout attestation, customer claim and marketing budget; race/refund tests. | First qualifying determination in the Order owner; real budget funding; mixed-chef decision. |
| FR-6 post-hold settlement | `SettlementService`, fresh finance recheck/outbox, bounded recurring workers. | Clock/source freshness tests and populated production ledger reconciliation after the real hold. |
| FR-7 refund/reversal | Cumulative monotonic refund processing, append-only reversals, negative available balance, pending remainder handling. | Real food-refund allocation, late webhook/partial-refund and provider timeout acceptance. |
| FR-8 hard cap / paise | BigInteger/paise maths, per-level rounding, L1-first trimming, schema/test invariants. | Finance-funded liability comparison and approved subtotal mapping. |
| FR-9 member dashboard | Web and native module: pending/available/reserved, levels, anonymised counts, history/holds/QR. | Mount existing authenticated slots; browser/device/accessibility review. |
| FR-10 withdrawal gating | Recipient assessments, reservation and assessed net/withholding, reviewed limits, weekly outbox plan and uncertain outcome controls. | Real jurisdictional review, KYC/destination, limits and idempotent Finance payment execution. |
| FR-11 admin console | Web module: immutable policy draft/peer approval, fraud and outbox/inbox recovery, manual reversal, bounded audit export. | Mount existing admin shell/session; real independent reviewers; gateway rate limits. |
| FR-12 self-referral/fraud | Trusted contact/device/payment-hash checks, consent handling and review holds/queues. | Real keyed source normalisation, consent, privacy retention and appeal/review operations. |
| FR-13 append-only history | SQL economic-field guards, journal consistency and constrained transitions; tamper/replay tests. | Restricted production runtime role cannot bypass triggers/DDL; backup/restore and auditing proof. |

## Executed evidence (checkpoint, not a substitute for the final-head report)

At `87e5bd86194c7f3e22f944e30404dab52493892b`, referral workflow [34935049650](https://github.com/rmorampudi09-arch/Craves-Build-platform/actions/runs/34935049650) passed all three jobs: backend/PostgreSQL, web and native. The preceding same-backend/web checkpoint `c9698fdb547be96eeb9bd624180a6aaff15ac763` produced downloaded XML evidence with **12 Java unit tests + 19 real PostgreSQL integration tests**, no failures/errors/skips, and **17 focused web tests**, no failures/errors/skips. Native correction only changed its additive typecheck configuration. The native focused suite contains 3 model tests; use the final report/artifact to verify its exact executed count.

The feature workflow also runs existing web lint/typecheck/tests/production build and existing selected native cross-feature regression tests. It does not prove native store submission, full device testing, full native lint, every cross-platform bundle, a production database migration, an Azure deployment, a payment-provider call, a penetration test or production load capacity. Docker is defined with a non-root runtime, but CI Maven/web builds do not by themselves prove a scanned and deployed container digest.

The existing mobile consolidation workflow fails its mobile-only scope guard on the cross-stack diff. That is a real unresolved repository check, not a passed test. Reviewers must address the scope separately without weakening the protected baseline.

## Synthetic financial cases exercised

The test suites include canonical ancestor depth/cutoff, cap/rounding and cumulative refund arithmetic, immutable policy/parent/ledger protection, below-minimum and missing-funding refusal, duplicate and out-of-order handling, competing award/spend calls, one-time checkout benefits, stale reconciliation holds, reservation/provider-outcome controls and a backlog exceeding 1,000 rewards. `ReferralBacklogIT` creates 334 child orders with 3 rewards each (1,002), then verifies that successive bounded ticks enrol the entire eligible backlog within the same hour while stale Finance evidence still prevents any credit. This is a deterministic correctness test, **not a production transactions-per-second benchmark**.

## Required acceptance scenarios — record actual/expected/status/evidence

| Scenario | Required result |
| --- | --- |
| A→B→C→D→E canonical sales | On INR 1,000, A receives INR 20/12/8/0 for B/C/D/E; only the seller's three ancestors earn. |
| Unknown, tampered, inactive and self-referral signup | No unsupported parent reassignment; blocked/reviewed as appropriate; never a signup reward. |
| INR 799.99 / INR 800.00 food minimum | Below-floor refused, boundary accepted only with delivery/capture/funding/active policy; taxes/delivery do not lift food floor. |
| Same buyer, simultaneous first qualifying checkouts | Exactly one customer bonus/discount claim under authoritative owner-side ordering. |
| Multi-chef checkout with partial delivery/refund | Bindings and totals reconcile; agreed child-floor semantics used; no premature parent-checkout benefit. |
| Duplicate source event / same ID different body | Same body is idempotent; conflicting body quarantined/rejected and audited. |
| Partial → partial → full refund, including replays | Cumulative food amount controls monotonic reversal; no double debit; negative credited wallet supported. |
| Refund while settlement runs | Same locked original order and latest Finance/refund version determine the remaining credit; no stale optimistic award. |
| Insufficient commission or marketing funds | Hold/deny the relevant track without reducing selling-chef earnings or fabricating budget. |
| Concurrent wallet spend and withdrawal | Available funds cannot be spent twice; submitted/unknown reservations cannot be freely released. |
| Provider timeout followed by success | Original attempt reconciled, one outcome recorded and no duplicate bank transfer. |
| Redis unavailable, logout/revocation, role downgrade | Private endpoints fail closed or refuse identity; no stale account's data after switch; non-admin cannot access admin actions. |
| CSRF / untrusted origin / internal-route probe | BFF refuses write/caller or route; gateway does not expose source-signed internal endpoints publicly. |
| Poison event / stale outbox lease / worker crash | Durable IDs survive restart, lease fencing works, bounded retry reaches visible dead-letter recovery. |
| DBA privilege misuse attempt | Runtime cannot alter/drop protected tables/triggers or write existing host-service tables. |
| Restore rehearsal | Restore to isolated target, reconcile source cursors/outstanding attempts/journal before resuming; never blindly overwrite newer financial truth. |
| Browser/native UI | Actual Chrome/Edge/Safari/mobile devices, screen reader, keyboard, large text, reduced motion, share/QR, deep links and account switching accepted. |
| Sustained and burst load / database pressure | Approved peak profile meets measured owner-agreed latency/backlog/recovery limits with zero cap breach or wallet drift; no invented capacity target. |

## Dependency and security review

The unchanged web lockfile checkpoint reported **5 audit findings: 2 moderate and 3 high**. The unchanged mobile install reported **37: 1 low, 29 moderate and 7 high**. These are tool-reported dependency findings, not a claim that every issue is exploitable in production. Triage exact dependency paths/advisories, reachable runtime/development surfaces and upgrade compatibility. The web audit JSON names Vitest/@vitest/mocker, brace-expansion, browserslist and js-yaml. No automatic audit-fix, key rotation or baseline dependency edits were made.

Archive the final-head test XML/JSON, dependency scans and SBOM before CI artifacts expire. Security acceptance must explicitly cover supply chain/image vulnerabilities, API authorisation, replay controls, privacy minimisation and least-privilege production roles; it is not inferred from this checklist.
