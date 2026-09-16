# Required repository protection

## Current evidence

Main was initially observed at 870f5293884888aa28f0c069b91a86d06492c9a2 with protection false and no repository rulesets. After owner browser access became available on 16 September 2026, classic branch protection rule 83269016 was created for `main` and reopened to verify its saved state. The connected GitHub app still lacks administration access; its readback returned 403, so the authenticated settings UI is the source of the saved-rule evidence.

Draft PR360 contains reconciled source and receipts. It must not be merged simply to turn the launch register green. Previous deployed customer fixes and live referral migrations are included intentionally; old PR348 was not merged wholesale.

## Saved rule

### Owner-approved amendment, 16 September 2026

After explicitly stating they are the sole approver and have verified the current work, the owner confirmed the exact change at execution time. Rule 83269016 was saved and reopened: Require approvals is now OFF. Require a pull request remains ON. The GitHub Actions exact-SHA aggregate, up-to-date branch requirement, resolved conversations, no administrator bypass, and disallowed force pushes/deletions remain unchanged. Stale-review dismissal remains configured for any voluntary reviews. No reviewer account was invited and no self-approval was fabricated. The account-switch request is no longer a blocker.

The earlier one-review setting below describes the original checkpoint and negative test, not the current approval requirement. User approval is recorded in OWNER_DECISIONS_20260916.md. Current-source regression run 35102174013 (PR) and 35102170446 (push) both succeeded on 0ff3ea1e7d902e3a137e17624137529521da8087. Later source changes still require fresh checks.

### Original checkpoint (superseded only for required approval count)

The saved rule targets only `main` (one matching branch). It requires a pull request, one approving review, dismissal of stale approvals after new commits, resolved review conversations, and an up-to-date branch. The required check is `Exact-SHA complete regression evidence`, accepting updates only from GitHub Actions. Administrator bypass is disabled. Force pushes and deletions are not allowed. Existing Azure environment approvals were not changed. No emergency bypass user or role was created.

Settings evidence: https://github.com/rmorampudi09-arch/Craves-Build-platform/settings/branch_protection_rules/83269016 . The settings page confirmed creation and the reopened form showed all of the above controls persisted. This is stronger evidence than a locally correct workflow, but the negative merge test below is still required.

Before saving the required-check rule, verify the displayed check identity belongs to this repository and the expected GitHub Actions application. The workflow now runs on every PR, including documentation-only changes. Its aggregate uses `always()` and a first-step prerequisite check; source, backend and web must all report success at the exact candidate SHA before evidence aggregation. Every required service and web command, mandatory test suite and no-skip count must then pass.

## Tests and remaining proof

The actual inline prerequisite code has positive exact-head coverage and negative cases for every failed, skipped, cancelled and missing component, missing source output and stale SHA. The evidence summarizer separately rejects missing suites, duplicate evidence, absent components, stale workflow attempts, stale manifests and inconsistent XML counts. The full current workflow passed on SHA97e2026dda92a93e649f17d5a3a0655ce74f505e in push run35097482934 and PR run35097514362. Later candidate commits need their own checks.

The latest candidate at 0ea1fc397b93521de93c2767f6f0e35606157251 also passed in push run 35098690426 and PR run 35098696023. Later commits require their own results.

Saved-rule readback and the negative source-failure probe are complete. Test-only PR 361, source 71f3a67bf288896a0f25209d51b3c01fbcdd60d8, ran the exact regression as run 35100885637. The source prerequisite failed intentionally; backend/web were skipped; the required aggregate FAILED rather than becoming skipped-green. The authenticated owner UI labelled that aggregate Required and Failing and showed Merging is blocked with a disabled Merge pull request button. Review was independently required, so this is not claimed as an experiment isolating the status rule from the review rule. PR 361 was closed, never merged or deployed. Its test branch is separate from PR 360 and must never be promoted.

Run 35100342845 passed the complete regression on e535e0fa5ec8339eebabb51af0a91691f6558444; machine evidence is retained in `evidence/regression-35100342845.json`. A later candidate requires its own result. Stale-green-head acceptance and deployment-wrapper reviewed-source/artifact/runtime-preservation reconciliation remain OPEN.

## Manual action required

Owner sign-in and sole-owner approval are complete. Do not request an alternate reviewer account or manufacture an independent review. Maintain the owner-authorized approval process and all remaining test/protection requirements. No PR has been merged by this launch package at this checkpoint.
