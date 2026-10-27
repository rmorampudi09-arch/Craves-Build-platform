# Rules for agents and people working in this repo

**Never break or remove anything production is running.** Read `docs/runbooks/live-runtime-safety.md` before building, deploying or changing a service.

- Production is Azure subscription 721906c9 (DevOps org rmorampudi09, service connection Craves-RMORAMPUDI09-Service-Connection); names and ids are in docs/runbooks/production-environment.md. Subscription 4f897b61, names ending l3ing6, registry cravesprodlowacr82121, Craves-Dev-Service-Connection and the ravitejamorampudi7777 org are retired: never use them.
- Azure DevOps rmorampudi09/Craves: release only through the pipelines in the runbook's "Azure DevOps pipelines" table; all build from GitHub `main`. Pipelines 3, 4, 6, 7, 8, 9, 10, 11, 14, 20 and 21 were turned off on purpose on 27 Oct 2026 because they run old Azure Repos copies: never run, re-enable, copy or recreate them, and never ask the owner to, even when an older doc, note or chat says so. Chef onboarding release is #23 (not 14), referral chef is #24 (not 20). If a task seems to need a turned-off pipeline, use its replacement from that table; if none fits, stop and ask.
- Deploy only code that is on GitHub `main`. If you build from a branch, Azure Repos or your machine, merge that source to `main` the same day, and put the commit in the image tag.
- Before rebuilding a service from `main`, check that `main` contains everything the live image runs (see the runbook).
- Each backend service has `src/main/resources/live-runtime-lock.txt`. In production, a build that lacks any listed class refuses to start. Never delete a line to get a deploy through: restore the missing code. Remove a line only when retiring that code on purpose, and say so in the PR.
- When you add a controller, add it to that service's lock file. CI (`scripts/release/tests/test_launch_live_runtime_lock.py`) enforces this.
- Flyway migrations are append-only. Never renumber or edit one that production has applied.
