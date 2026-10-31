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

The proxy port changes between sessions: take it from `JAVA_TOOL_OPTIONS` (`-Dhttps.proxyPort=…`); with `-o` Maven does not use it anyway. The repo does not ignore `services/advanced-features-service/target/`: never stage it.

If a module adds a dependency, the cache must be refreshed first: upload only the new `pom.xml` to the run's bundle branch (web upload into `services/advanced-features-service`); the cache workflow republishes `ci/advanced-features-m2` in ~3 min.

## 2. Build a module

```
src/main/java/in/craves/advanced/<module>/        <Module>Module (FeatureModule bean), controller(s), service, repository, DTOs
src/main/resources/db/advanced/<schema-without-adv_>/V1__*.sql   tables fully qualified as adv_<module>.<table>
src/test/java/in/craves/advanced/<module>/        *Test (unit) and *IT (PostgreSQL, extends support.IntegrationTestBase)
```

Reuse the platform: `CurrentUser` (id, roles, bearer), `ApiProblem` (error codes), `Idempotency`, `Audit`, `Cursor`, `Sql`, `Money`, `CatalogGateway` / `OrderCartGateway` / `OrderGateway` (calls through api.craves.in with the caller's token where needed; tests use the fakes), `PersonalDataContributor` (every module holding personal data implements it, so export/erase cover it). Add each new controller to `src/main/resources/live-runtime-lock.txt`. Every module path must start with `/api/v1/advanced/` (the one gateway API routes them all); public routes go in the module's `publicGetPaths`/`publicPostPaths`. Give every DTO and controller method a name no other module uses (`TaxonomyVocabulary`, `createTerm`): springdoc names schemas by simple class name and operation ids by method name across the whole service, so a clash silently rewrites another module's contract (ContractsIT then shows drift in files you did not touch). Integration tests share one database per Spring context: clear your own module's tables in `@BeforeEach` when a test counts rows (audit rows too: `DELETE FROM adv_platform.audit_event WHERE module = '<id>'`). Test tokens expire 24 h after the `CLOCK` time they were minted at, so keep `CLOCK.advance` within a test under 24 h. In production `CatalogGateway.menuItem` returns only dishes Catalog shows publicly (active and available today), while `FakeCatalog.menuItem` ignores `unavailable`: do not build a rule on reading switched-off dishes. The service runs on at least two replicas (`minReplicas: 2`), so no rule may depend on one replica's clock alone: count a grace period (M07/M08 keep expired holds 30 s) or a sequence (M11 never accepts an older proposal once a newer exists). Order service never writes `PREPARING` today: an accepted order goes straight to `READY_FOR_PICKUP`.

```bash
cd services/advanced-features-service
export ADV_TEST_JDBC_URL=jdbc:postgresql://127.0.0.1:55432/postgres ADV_TEST_DB_USER=postgres ADV_TEST_DB_PASSWORD=
ADV_WRITE_CONTRACTS=true mvn -o -B -ntp verify   # regenerates contracts/openapi/advanced/*.yaml (x-craves-auth per operation)
mvn -o -B -ntp verify                             # must be green with no drift
cd ../.. && python3 -m unittest discover -s scripts/release/tests -p 'test_launch_live_runtime_lock.py' && python3 scripts/advanced-features/check_contracts.py
```

## 3. Ship to GitHub (no token in the sandbox — the owner's Chrome, logged in as rmorampudi09-arch)

Scheduled runs run in the cloud without the owner's computer, so Chrome is not reachable from them (unless the scheduled task has "Require this computer" turned on): build and test as usual, commit each module locally, save `git diff --binary <previous module commit> HEAD` as `claude/advanced-features-pending/<mNN-name>.patch` in the Craves-Dev project (stacked in module order), check that all pending patches apply in order to a clean `main` and pass the build, and mark the rows BUILDING. A run that has Chrome ships them: apply in order, rebuild, copy this playbook and the ledger from the project into `docs/advanced-features/`, then one bundle.

`project_read` may return a large patch inline instead of as a file. `git apply` needs it byte-exact, so never retype it: take the `content` field of that `project_read` result from the run's own transcript (`/root/.claude/projects/-home-claude/<session id>.jsonl`) with a few lines of Python and write it to disk.

1. `git fetch --depth 50 origin main && bash infra/advanced-features/make-bundle.sh <name>` → `/mnt/user-data/outputs/bundles/<name>.tgz` (+ `.delete` when files were removed).
2. New branch: open `https://github.com/rmorampudi09-arch/Craves-Build-platform/upload/main/.bundles`, `find` the file input, `file_upload` the tgz, set the commit message, choose "Create a new branch", set the name to `bundle/<name>` with real keystrokes (triple-click the branch field, ctrl+a, type), click "Propose changes". Do not create the PR on the next page yet. Upload with Claude in Chrome "Browser 2" (signed in as rmorampudi09-arch; "Browser 1" is not, and the owner picks the browser in each session): its `file_upload` takes the session path `/mnt/user-data/outputs/bundles/<name>.tgz` (a path in the connected folder is refused). Claude's built-in browser cannot attach files; use it for the PR, checks and merge.
   Existing branch: `…/upload/bundle/<name>/.bundles` and "Commit directly".
3. The `Bundle import` workflow unpacks and commits on the branch in ~30 s (`git ls-remote origin refs/heads/bundle/<name>` changes; the commit says `Import <name>.tgz`).
4. Open `…/compare/main...bundle/<name>?expand=1`, title + description, "Create pull request". Opening the PR starts CI. Later bundles on the same branch re-dispatch CI automatically.
5. Wait for "Exact-SHA complete regression evidence" (~26 min) and "Advanced features service" to pass. Runs are serialized per PR: cancel a still-running run for an older commit (Actions → that run → Cancel workflow) so the head's run starts. `main` requires the branch to be up to date: if the merge box says "out-of-date", click "Update branch", wait for the new run, then merge at once. Then "Squash and merge" → "Confirm squash and merge" (commit message ends with the Co-Authored-By/Claude-Session lines). Never merge red.

**Without Chrome, through the GitHub connector** (the session lists `mcp__github__*` tools; `git push` is still refused by the proxy, but `git fetch` works). Prefer Chrome when it is reachable (one upload instead of retyping every file). It needs the Claude GitHub app to have Contents and Pull requests write access to Craves-Build-platform: on 31 Oct it could only read, and `create_branch` answered 403 "Resource not accessible by integration" (stop there and tell the owner). The connector writes text only, so it cannot upload the .tgz: it pushes the files themselves. Rebase the module commits onto the `main` the branch starts from, `create_branch` `bundle/<name>`, then `push_files` in batches of at most ~60 KB, each file's content taken from `cat` of the committed file in the same step, never retyped from memory. After each batch, `git fetch origin bundle/<name>` and `git diff --stat origin/bundle/<name> HEAD -- <the batch's paths>` must be empty; push any file that differs again. Push everything before opening the PR (each new head restarts the 26-minute check). When `git diff origin/bundle/<name> HEAD` is empty, `create_pull_request` (it starts both required checks), poll `pull_request_read` `get_check_runs`, use `update_pull_request_branch` if `main` moved, and `merge_pull_request` (`squash`, `expectedHeadSha` = the checked head) only when both are green.

## 4. Deploy and verify

- One-time (owner, already requested — see the ledger's "Deployment status"): `curl -fsSL https://raw.githubusercontent.com/rmorampudi09-arch/Craves-Build-platform/main/infra/advanced-features/setup-once.sh | bash` in Azure Cloud Shell. Build runs must **not** create or change Azure resources from the browser (the automation's safety check refuses it); never retry that.
- After the setup, a merge to `main` is mirrored to Azure DevOps within 15 min and `release-advanced` builds and rolls out `ca-craves-advanced-prod` (10 % canary, 100 %, auto-rollback). Nothing else is needed for new modules: the gateway API `craves-adv-v1` forwards every `/api/v1/advanced/*` route.
- Verification: the GitHub workflow "Advanced features live smoke" runs after each merge (waits up to 60 min for the release, then checks every route from the contracts: user/staff routes must give the service's 401 envelope, public ones a service answer, `/features` must list each module available). Read its result on the Actions page; it is read-only. Run it on demand with "Run workflow". If it reports that `/api/v1/advanced` is not published, the one-time setup has not been run yet: keep rows MERGED (that run still shows green: read its annotation).

## 5. Finish every run

Update the ledger (statuses, infrastructure values, a run-log line), release the lease (`LEASE: free`), and send the owner a 3–5 line summary.
