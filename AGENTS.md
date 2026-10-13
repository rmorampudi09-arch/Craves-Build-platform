# Rules for agents and people working in this repo

**Never break or remove anything production is running.** Read `docs/runbooks/live-runtime-safety.md` before building, deploying or changing a service.

- Deploy only code that is on GitHub `main`. Backend image pipelines enforce it (`scripts/release/require-main-image-source.sh`): queue release runs on `main`; never push an image from a branch, Azure Repos or your machine.
- Before rebuilding a service from `main`, check that `main` contains everything the live image runs (see the runbook).
- Each backend service has `src/main/resources/live-runtime-lock.txt`. In production, a build that lacks any listed class refuses to start. Never delete a line to get a deploy through: restore the missing code. Remove a line only when retiring that code on purpose, and say so in the PR.
- When you add a controller, add it to that service's lock file. CI (`scripts/release/tests/test_launch_live_runtime_lock.py`) enforces this.
- Flyway migrations are append-only. Never renumber or edit one that production has applied.
