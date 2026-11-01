# Rules for agents and people working in this repo

**Never break or remove anything production is running.** Read `docs/runbooks/live-runtime-safety.md` before building, deploying or changing a service.

- **A merge to GitHub `main` goes to production automatically.** Since 30 Oct 2026, Azure DevOps org `ravitejamm6`, project `Craves-New-Original`, mirrors `main` every 15 minutes. A change under a feature's folder starts that feature's `release-<feature>` pipeline: build, 10 % canary, then 100 %, with automatic rollback if the new revision is unhealthy. There is no manual approval step, so the required GitHub check is the last gate.
- Production is Azure subscription 34eefd95 (account ravitejamm6@gmail.com), one resource group per feature (`rg-craves-<feature>-prod`), registry `crcravesprod34eefd`.
- The old subscription 721906c9 (DevOps org rmorampudi09, resource group rg-craves-prodlow-centralindia) is idle. Read it if you need to, but never change, deploy to or run pipelines against it. Subscription 4f897b61, names ending l3ing6, registry cravesprodlowacr82121, Craves-Dev-Service-Connection and the ravitejamorampudi7777 org are retired: never use them.
- The ~250 `azure-pipelines-*.yml` files in this repo root still target the old org and resource group. Do not run them against production. Port one to the new org when it is needed, and stop and ask if you are not sure.
- Deploy only code that is on GitHub `main`.
- Each backend service has `src/main/resources/live-runtime-lock.txt`. In production, a build that lacks any listed class refuses to start. Never delete a line to get a deploy through: restore the missing code. Remove a line only when retiring that code on purpose, and say so in the PR.
- When you add a controller, add it to that service's lock file. CI (`scripts/release/tests/test_launch_live_runtime_lock.py`) enforces this.
- Flyway migrations are append-only. Never renumber or edit one that production has applied.
- The required check "Exact-SHA complete regression evidence" covers the web app, the mobile app and seven Java services. Never merge with it red, and never put `[skip ci]` in a commit message on a branch that will be squashed.
