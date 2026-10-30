# Advanced features — playbook for each build run

Read `AGENTS.md` and `docs/runbooks/live-runtime-safety.md` first. The ledger (`claude/advanced-features-ledger.md` in the Craves-Dev project, repo copy `docs/advanced-features/LEDGER.md`) says what to build next. Module decisions so far: `docs/advanced-features/modules.md`.

## Ground rules

- Build only inside `services/advanced-features-service`, `contracts/openapi/advanced/`, `infra/advanced-features/`, `infra/apim/advanced-features/`, `docs/advanced-features/`, `scripts/advanced-features/` (the bundle-import allow-list). Ledger items M24/M25 are the only ones allowed to touch another service, additively, behind a flag that defaults off — they need the allow-list widened in `.github/workflows/bundle-import.yml` by a direct web upload.
- Never break what production runs: never merge with a red required check, never `[skip ci]`, Flyway migrations are append-only.
- Commercial numbers (discounts, fees, deposits, radii, refund rules) are admin-configured data, never invented. Record every product decision in `docs/advanced-features/modules.md`.
- Money is integer paise; API times are UTC instants; IST only for business-day logic.

## 1. Sandbox setup (every run starts clean)

```bash
git clone --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git repo && cd repo
# Maven Central is blocked in the sandbox: fetch the dependency cache the "Advanced features dependency cache" workflow publishes
mkdir -p ~/m2cache && cd ~/m2cache && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git ci/advanced-features-m2 \
  && git checkout -q FETCH_HEAD && sha256sum -c SHA256SUMS && cat m2.tgz.part-* | tar -xzf - -C ~ && find ~/m2 -name _remote.repositories -delete \
  && mkdir -p ~/.m2 && rm -rf ~/.m2/repository && ln -s ~/m2 ~/.m2/repository && cd -
# Maven also needs ~/.m2/settings.xml with the agent proxy (127.0.0.1:45505) for https and http, then always build with -o
# Local PostgreSQL 16 (binaries in /usr/lib/postgresql/16/bin; must run as a non-root user):
su claude -s /bin/bash -c "/usr/lib/postgresql/16/bin/initdb -D /home/claude/pgdata -U postgres --auth=trust && \
  /usr/lib/postgresql/16/bin/pg_ctl -D /home/claude/pgdata -o '-p 55432 -k /tmp -c listen_addresses=127.0.0.1' -l /home/claude/pgdata/log start"
```

If a module adds a dependency, the cache must be refreshed first: upload only the new `pom.xml` to the run's bundle branch (web upload into `services/advanced-features-service`); the cache workflow republishes `ci/advanced-features-m2` in ~3 min.

## 2. Build a module

```
src/main/java/in/craves/advanced/<module>/        <Module>Module (FeatureModule bean), controller(s), service, repository, DTOs
src/main/resources/db/advanced/<schema-without-adv_>/V1__*.sql   tables fully qualified as adv_<module>.<table>
src/test/java/in/craves/advanced/<module>/        *Test (unit) and *IT (PostgreSQL, extends support.IntegrationTestBase)
```

Reuse the platform: `CurrentUser` (id, roles, bearer), `ApiProblem` (error codes), `Idempotency`, `Audit`, `Cursor`, `Sql`, `Money`, `CatalogGateway` / `OrderCartGateway` (calls through api.craves.in; tests use the fakes), `PersonalDataContributor` (every module holding personal data implements it, so export/erase cover it). Add each new controller to `src/main/resources/live-runtime-lock.txt`. Public routes go in the module's `publicGetPaths`/`publicPostPaths`.

```bash
cd services/advanced-features-service
export ADV_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:55432/postgres ADV_TEST_DB_USER=postgres ADV_TEST_DB_PASSWORD=
ADV_WRITE_CONTRACTS=true mvn -o -B -ntp verify   # regenerates contracts/openapi/advanced/*.yaml and infra/apim/advanced-features/routes.txt
mvn -o -B -ntp verify                             # must be green with no drift
cd ../.. && python3 -m unittest discover -s scripts/release/tests -p 'test_launch_live_runtime_lock.py' && python3 scripts/advanced-features/check_contracts.py
```

## 3. Ship to GitHub (no token in the sandbox — the owner's Chrome, logged in as rmorampudi09-arch)

1. `git fetch --depth 50 origin main && bash infra/advanced-features/make-bundle.sh <name>` → `/mnt/user-data/outputs/bundles/<name>.tgz` (+ `.delete` when files were removed).
2. New branch: open `https://github.com/rmorampudi09-arch/Craves-Build-platform/upload/main/.bundles`, `find` the file input, `file_upload` the tgz, set the commit message, choose "Create a new branch", set the name to `bundle/<name>` with real keystrokes (triple-click the branch field, ctrl+a, type), click "Propose changes". Do not create the PR on the next page yet.
   Existing branch: `…/upload/bundle/<name>/.bundles` and "Commit directly".
3. The `Bundle import` workflow unpacks and commits on the branch in ~30 s (`git ls-remote origin refs/heads/bundle/<name>` changes; the commit says `Import <name>.tgz`).
4. Open `…/compare/main...bundle/<name>?expand=1`, title + description, "Create pull request". Opening the PR starts CI. Later bundles on the same branch re-dispatch CI automatically.
5. Wait for "Exact-SHA complete regression evidence" and "Advanced features service" to pass (PR checks page). Then "Squash and merge" → "Confirm squash and merge". Never merge red.

## 4. Deploy

- After the first deployment, a merge to `main` is mirrored to Azure DevOps within 15 min and `release-advanced` (file `/advanced.yml` in repo craves-pipelines; source `infra/advanced-features/devops/advanced.yml`) builds and rolls out with canary and auto-rollback — if that pipeline exists (see ledger). Otherwise deploy from Cloud Shell:
- Azure Cloud Shell (portal directory ravitejamm6gmail, Bash): fetch the scripts of the merged commit and run the phases you need:
  ```bash
  C=<40-char main commit>; mkdir -p ~/adv && cd ~/adv && for f in infra/advanced-features/provision.sh infra/advanced-features/apim-publish.sh \
    infra/advanced-features/smoke.sh infra/apim/advanced-features/routes.txt infra/apim/advanced-features/user-policy.xml \
    infra/apim/advanced-features/admin-policy.xml infra/apim/advanced-features/public-policy.xml; do mkdir -p $(dirname $f); \
    curl -fsSL https://raw.githubusercontent.com/rmorampudi09-arch/Craves-Build-platform/$C/$f -o $f; done
  bash infra/advanced-features/provision.sh image $C && bash infra/advanced-features/provision.sh app $C
  bash infra/advanced-features/apim-publish.sh && bash infra/advanced-features/smoke.sh
  ```
- Cloud Shell gotchas: `set +H` before commands with `!`; if Cloud Shell says "Timeout waiting for token", switch the portal directory back to ravitejamm6gmail and open a fresh shell.

## 5. Finish every run

Update the ledger (statuses, infrastructure values, a run-log line), release the lease (`LEASE: free`), and send the owner a 3–5 line summary.
