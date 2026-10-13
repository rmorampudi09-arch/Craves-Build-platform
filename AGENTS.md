# Rules for agents and people working in this repo

**Never break or remove anything production is running.** Read `docs/runbooks/live-runtime-safety.md` before building, deploying or changing a service.

- Deploy only code that is on GitHub `main`. If you build from a branch, Azure Repos or your machine, merge that source to `main` the same day, and put the commit in the image tag.
- Before rebuilding a service from `main`, check that `main` contains everything the live image runs. Auth does not yet. It runs code that exists only in overlays (see the runbook).
- Each backend service has `src/main/resources/live-runtime-lock.txt`. In production, a build that lacks any listed class refuses to start. Never delete a line to get a deploy through: restore the missing code. Remove a line only when retiring that code on purpose, and say so in the PR.
- When you add a controller, add it to that service's lock file. CI (`scripts/release/tests/test_launch_live_runtime_lock.py`) enforces this.
- Flyway migrations are append-only. Never renumber or edit one that production has applied.
