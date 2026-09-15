# Craves Chef Referral Rewards v2 — additive delivery

## Release boundary

This is an **add-only, unmerged implementation**, not an activated production programme. Baseline: `870f5293884888aa28f0c069b91a86d06492c9a2`. Branch: `feat/chef-referral-v2-20260915`. Draft PR: [#357](https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/357).

No existing application route, authentication owner, navigation entry, dependency manifest, lockfile, host-service migration or existing workflow is changed. The new service is not attached to live signup, checkout, delivery, refund or payment processing. All referral execution/public-access switches default OFF. No production deployment, migration, provider payment or merge was performed for this delivery.

The module implements the supplied **Craves Chef Referral Program v2.0**. The future integration seams are deliberate: making them live necessarily requires a separately reviewed change to existing owners. They are **remaining engineering work**, not just entering credentials.

## Included modules

| Addition | Responsibility |
| --- | --- |
| `services/referral-service/` | Standalone Java 21 / Spring Boot service; isolated PostgreSQL schema and Flyway history; exact-paise reward maths; immutable attribution and financial history; source inbox, finance outbox, refund/settlement/benefit/cashout state machines; member/admin APIs; tests; non-root Docker image definition. |
| `apps/customer-web-next/src/components/referrals/` | Unmounted member and administrator workspaces, scoped responsive styles, verified balances, code/link/QR, earnings, policy review, exception handling and audit export. |
| `apps/customer-web-next/src/lib/referrals/` | Typed response validation, exact money, existing-session BFF factory, signed first-touch helper, financial-operation recovery, tests. |
| `apps/mobile/src/features/referralsV2/` | Unmounted native member screen; injected existing authenticated Axios client; validated QR paths; secure-store withdrawal recovery; native contract tests. |
| `scripts/referrals/` | Add-only verification and isolated test configurations. |
| `.github/workflows/chef-referral-v2-ci.yml` | Referral-specific backend/PostgreSQL, web and native checks. Builds and tests only; no deployment. |

## Read in this order

1. [Architecture and decisions](ARCHITECTURE.md): business invariants, source contracts, funding boundaries and design clarifications.
2. [Integration and manual release runbook](INTEGRATION_RUNBOOK.md): exact existing insertion points, remaining owner changes, credentials, reviews and staged release sequence.
3. [Requirements and acceptance](ACCEPTANCE.md): FR-1–FR-13 traceability, executed-test boundary and mandatory production acceptance scenarios.
4. [Operations and recovery](OPERATIONS.md): monitoring, bounded work, unknown payments, rollbacks and scaling limits.
5. [Deployment kit](../../services/referral-service/deploy/README.md): optional isolated Container App template and read-only checks. Nothing deploys by merging this branch.

## Important merge and launch blockers

The existing **CRAVES Mobile World-Class Consolidation CI** treats any PR touching mobile as a mobile-only consolidation. Its scope guard rejects this intentionally cross-stack referral PR before its build steps. That existing workflow was not edited or bypassed. A maintainer must either approve a separate scope correction for that workflow or split the native addition into a pure-mobile PR. Referral-specific mobile tests do not override that gate. Keep this PR draft until the required repository checks are resolved.

The inherited web/native dependency trees also have audit findings. Their manifests and lockfiles were intentionally not altered. Review the exact CI audit evidence and remediate in a separately approved dependency change before production acceptance. A green feature build is not vulnerability clearance, load certification, legal approval or end-to-end financial acceptance.

## Programme facts

Three earning ancestors: **200 / 120 / 80 basis points**, up to **400 bps for the selling-chef chain**. Default qualifying food subtotal: **INR 800**. Refund hold: **14 days**. One-time customer-referrer bonus: **INR 400**. Invitee discount: **INR 250**. The last two use separate marketing budgets **outside the 4% seller-chain cap**. Unused seller-chain shares stay with Craves. No signup itself earns a reward, and selling-chef earnings are not debited to fund rewards.

The source specification's legal and wallet-cost assertions are not treated as legal or accounting clearance. Its own pre-launch review gates remain mandatory.
