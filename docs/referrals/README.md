# Referral backend integration

Status: **implementation in progress; production integration is not complete**.
Backend-only draft PR: [#358](https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/358).
The user's approval covers engineering and Azure access. It does not supply missing policy values or evidence of legal, tax, funding and recipient reviews.

This branch carries the standalone engine from the supplied pre-integration package and adds Auth enrollment/status transport, Order snapshot/lifecycle transport, and Finance observation/journal consumption. New workers default off. No frontend has been added or changed. Azure DevOps and Azure Portal sign-in were verified; no runtime resource or setting was changed.

Read [BACKEND_INTEGRATION_STATUS.md](BACKEND_INTEGRATION_STATUS.md) for the current implementation, testing boundaries and release blockers. The other architecture, acceptance, hardening and operations documents describe the **earlier pre-integration checkpoint**. Statements there about PR #357, unmounted web/native additions, 94 focused tests or absence of all owner integrations are historical; they are not the acceptance result for this branch.

Run `bash scripts/referrals/test-backend.sh` only against the explicitly named disposable databases configured in `.github/workflows/referral-backend-ci.yml`. Required suites must exist and pass without skips. Additional unrelated database suites can remain skipped when their dedicated fixture variables are absent; repository workflows run those fixtures separately. `verify-backend-scope.py` enforces this branch's bounded owner changes. The old `verify-additive.py` belongs to the earlier add-only package and must not be used to claim that owner integration changes are add-only.

Do not enable spending, withdrawals or public access until their complete owner/provider flows, infrastructure, policies and runtime acceptance gates are closed. A passing build is not deployment evidence.
