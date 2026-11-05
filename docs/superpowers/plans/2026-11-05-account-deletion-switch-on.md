# Account deletion 5/5: switch-on Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One reviewed PR holding every repo change and the runbook needed to switch account deletion on in production. The owner then runs the steps by hand.

**Architecture:** The PR contains:
- a gateway script and policy for the admin route;
- a read-only Python preflight that inspects the 9 container apps and prints what is missing, never secret values;
- a Spring context test proving auth starts with the switches on;
- two deploy-definition lines (referral forfeit switch, advanced internal secret);
- a runbook.

Nothing in the PR writes to production by itself.

**Tech Stack:** bash + Azure CLI + jq (APIM script), Python 3 stdlib + unittest (preflight), Java 21 / Spring Boot `ApplicationContextRunner` + JUnit 5 (auth test), bicep and bash (deploy definitions), Markdown (runbook).

**Spec:** `docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md`. Read it first: its "Production steps", "Rollback" and "Calls made in review" sections are binding.

## Global Constraints

- **No secret values anywhere:**
  - never print, log or write a secret value: not in script output, test output, error messages, the runbook's commands, or commit text;
  - a plain-value credential is reported as `plain value (hidden)`;
  - Azure CLI stdout and stderr are captured and never echoed (pattern: `scripts/riders/rider_pilot_runtime.py:81-92`).
- **No script flips a switch:** nothing in this PR sets `CRAVES_ACCOUNT_DELETION_ENABLED` or `CRAVES_ACCOUNT_DELETION_WORKER_ENABLED`. The preflight prints no command that does.
- **New production names only:**
  - subscription `34eefd95-1a19-416f-b9df-92b326500615`;
  - resource groups `rg-craves-<feature>-prod`, apps `ca-craves-<feature>-prod`;
  - auth `ca-craves-auth-prod` in `rg-craves-auth-prod`;
  - advanced `ca-craves-advanced-prod` in `rg-craves-advanced-prod`, vault `kv-crv-advanced-34eefd`;
  - referral apps `ca-craves-referral-prod` and `ca-craves-referral-members-prod`;
  - APIM `apim-craves-prod-34eefd` (resource group looked up, overridable with `APIM_RG`).
  - Never `kmqgfy`, `prodlow`, `rg-craves-prodlow-centralindia`, or `config/production/azure-resource-inventory.json`.
- **The 8 targets, in auth's order** (`AccountErasureClient.ERASE_ORDER`): `subscription, order, integration, referral, advanced, catalog, user-chef, notification`.
- **Credential variable per target:**
  - `CRAVES_INTERNAL_SERVICE_KEY` for order, integration and notification;
  - `CRAVES_INTERNAL_SERVICE_SECRET` for subscription, advanced, catalog and user-chef;
  - `CRAVES_REFERRALS_AUTH_HMAC_BASE64` for referral.
- **Erase paths auth calls:**
  - `/internal/v1/account-erasure`, `/internal/v1/account-erasure/blockers` and `/internal/v1/account-erasure/prepare`;
  - also `/internal/v1/account-erasure/release` on subscription and catalog.
- **auth settings** (from `services/auth-service/src/main/resources/application.yml:71-103`):
  - `CRAVES_ACCOUNT_DELETION_<T>_BASE_URL` for `T` in `SUBSCRIPTION ORDER INTEGRATION ADVANCED NOTIFICATION CATALOG USER_CHEF REFERRAL`;
  - `CRAVES_ACCOUNT_DELETION_<T>_CREDENTIAL` for the same list except `REFERRAL`;
  - `CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64`.
- **Gateway:**
  - API id `craves-admin-account-deletions-v1`, path `api/v1/admin/account-deletions`, backend auth's app address plus the same path;
  - operations `GET /`, `GET /{requestId}`, `POST /{requestId}/approve`, `POST /{requestId}/reject`;
  - the gateway lets a call run at least 30 s.
- **Advanced secret:** app secret `internal-service-secret`, Key Vault secret `craves-internal-service-secret`, env `CRAVES_INTERNAL_SERVICE_SECRET`.
- **Referral forfeit stays off:** `CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED` is `'false'`.
- **Code style:**
  - bash scripts start with `set -euo pipefail` and `set +x`;
  - Python is stdlib only and tested with `python3 -m unittest`;
  - match the comment density of the file you edit.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Canary in progress:** a target is splitting traffic, as during a 10 % canary. The preflight must say "rolling out, try again", not report half a state. Pinned in Task 2, `test_traffic_split_is_reported_not_guessed`.
2. **Enforced-path forms:** `CRAVES_INTERNAL_AUTH_ENFORCED_PATHS` written as `/internal/**`, as an exact erase path, or comma-separated with spaces. Each must STOP. Pinned in Task 2, `test_enforced_path_patterns_stop`.
3. **IP restriction forms:** a rule given as a CIDR range that contains auth's address, a Deny rule, or no rules at all. Each must be judged correctly. Pinned in Task 2, `test_ingress_allows_auth_by_range_and_deny`.
4. **Leaks:** a secret leaking through a plain-value credential, or through Azure CLI error text. Pinned in Task 2, `test_no_secret_value_reaches_output`.
5. **Approve or reject bodies:** a reason up to 500 characters must pass the gateway's body-size check, and a POST without a token must get 401. Pinned in Task 1, `test_policy_allows_reason_bodies_and_requires_bearer`.

---

### Task 1: Admin gateway route script and policy

**Files:**
- Create: `scripts/apim/configure-admin-account-deletions-apim.sh`
- Create: `infra/apim/admin-account-deletions/authenticated-policy.xml`
- Create: `scripts/apim/tests/test_admin_account_deletions_apim.py`
- Create: `.github/workflows/account-deletion-switch-on-ci.yml`
- Commit first, as-is: `docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md`, `docs/superpowers/plans/2026-11-05-account-deletion-switch-on.md`

**Interfaces:**
- Produces: the script, run as `CONFIRM_APIM_WRITE=true bash scripts/apim/configure-admin-account-deletions-apim.sh` or `DRY_RUN=true bash ...`, with env overrides `APIM`, `APIM_RG`, `AUTH_RG`, `AUTH_APP`, `PUBLIC_HOST`. Task 5's runbook cites these.
- Produces: CI workflow job `apim-script` (Task 2 adds job `preflight`).

- [ ] **Step 0: Commit the design and plan docs**

```bash
git add docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md docs/superpowers/plans/2026-11-05-account-deletion-switch-on.md
git commit -m "docs: account deletion switch-on, design and plan"
```

- [ ] **Step 1: Write the failing test** `scripts/apim/tests/test_admin_account_deletions_apim.py` (unittest, stdlib only)

```python
def test_operations_match_the_auth_controller(self):
    # parse the OPERATIONS rows of the script; read @GetMapping/@PostMapping of
    # services/auth-service/src/main/java/in/craves/auth/deletion/AdminAccountDeletionController.java
    assert rows == {("GET", "/"), ("GET", "/{requestId}"), ("POST", "/{requestId}/approve"), ("POST", "/{requestId}/reject")}
    # controller paths use {id}; compare with the placeholder name ignored

def test_defaults_are_the_new_production_names(self):
    text = script_text()
    for name in ("apim-craves-prod-34eefd", "ca-craves-auth-prod", "rg-craves-auth-prod", "craves-admin-account-deletions-v1", "api/v1/admin/account-deletions"):
        assert name in text
    for old in ("kmqgfy", "prodlow", "rg-craves-prodlow-centralindia"):
        assert old not in text

def test_policy_allows_reason_bodies_and_requires_bearer(self):
    xml = render_policy("https://auth.example.azurecontainerapps.io", "/api/v1/admin/account-deletions/{requestId}/approve")
    root = ElementTree.fromstring(xml)          # parses
    assert int(root.find(".//validate-content").get("max-size")) >= 4096   # 500-char reason + JSON
    assert "Bearer" in xml and 'code="401"' in xml
    assert "__BACKEND_BASE_URL__" not in xml and "__REWRITE_TEMPLATE__" not in xml

def test_script_parses(self):
    assert subprocess.run(["bash", "-n", SCRIPT]).returncode == 0

def test_writes_are_gated(self):
    # run the script with CONFIRM_APIM_WRITE and DRY_RUN unset, PATH holding no az:
    # it exits non-zero before any az call and names CONFIRM_APIM_WRITE or DRY_RUN in stderr
```

`render_policy` applies the same two substitutions the script's `sed` does.

- [ ] **Step 2: Run, expect FAIL** (files missing)

Run: `python3 -m unittest discover -s scripts/apim/tests -p 'test_admin_account_deletions_apim.py' -v`

- [ ] **Step 3: Write the policy** `infra/apim/admin-account-deletions/authenticated-policy.xml`

Copy `infra/apim/admin-reviews/authenticated-policy.xml`, with these differences:
- keep the Bearer `choose` returning 401, the `validate-content` (max-size 4096), the `set-backend-service` and `rewrite-uri` placeholders, and the outbound no-store headers;
- change the comment to say auth-service checks the deletion reader/decider roles and the 10-500 character reason;
- keep `<backend><base /></backend>`. The script checks the timeout instead (Step 4).

- [ ] **Step 4: Write the script** `scripts/apim/configure-admin-account-deletions-apim.sh`

Base it on `scripts/apim/configure-admin-reviews-apim.sh`: same structure, read-only checks before any write, parent-shadow check, policy read-back, 401 probes retrying for 2 minutes. Differences:
- **Defaults:**
  - `APIM=apim-craves-prod-34eefd`;
  - `APIM_RG` from `az apim list --query "[?name=='$APIM'].resourceGroup" -o tsv` when unset, failing if it isn't exactly one;
  - `AUTH_RG=rg-craves-auth-prod`, `AUTH_APP=ca-craves-auth-prod`;
  - `API_ID=craves-admin-account-deletions-v1`, `API_PATH=api/v1/admin/account-deletions`, `PUBLIC_HOST=https://api.craves.in`.
- **OPERATIONS:**
  - `list-admin-account-deletions|GET|/|List account deletion requests`;
  - `get-admin-account-deletion|GET|/{requestId}|One account deletion request with blockers and steps`;
  - `approve-admin-account-deletion|POST|/{requestId}/approve|Approve a chef account deletion`;
  - `reject-admin-account-deletion|POST|/{requestId}/reject|Reject an account deletion`.
- **Gating:** `DRY_RUN=true` runs every read-only check, then prints `WOULD WRITE <METHOD> <path> (<api-id>/<op>)` per operation, writes nothing and skips the probes. Without `DRY_RUN=true`, `CONFIRM_APIM_WRITE=true` is required.
- **Timeout check:** read the global policy (`.../service/$APIM/policies/policy`) and the API policy if the API exists. If either holds a `forward-request` with `timeout="N"` and N < 30, fail with "gateway timeout under 30 s would cut approve/detail".
- **Probes:** `GET $PUBLIC_HOST/$API_PATH` and `POST $PUBLIC_HOST/$API_PATH/00000000-0000-4000-8000-000000000000/approve` with body `{}`, each expecting 401.
- **Header comment:** the usage line, plus the undo `az apim api delete -g <APIM_RG> --service-name apim-craves-prod-34eefd --api-id craves-admin-account-deletions-v1 --yes`.
- **Last line:** `SUCCESS: admin account deletion routes configured and verified. auth-service still checks the admin role.`

- [ ] **Step 5: Write the workflow** `.github/workflows/account-deletion-switch-on-ci.yml`

- **Trigger:** `pull_request` on paths `scripts/apim/configure-admin-account-deletions-apim.sh`, `scripts/apim/tests/test_admin_account_deletions_apim.py`, `infra/apim/admin-account-deletions/**` and `.github/workflows/account-deletion-switch-on-ci.yml`.
- **Job `apim-script`:** on `ubuntu-latest`, check out, then run `python3 -m unittest discover -s scripts/apim/tests -p 'test_admin_account_deletions_apim.py' -v`.

- [ ] **Step 6: Run, expect PASS**

Run: `python3 -m unittest discover -s scripts/apim/tests -p 'test_admin_account_deletions_apim.py' -v`
Expected: 5 tests OK. (On Windows, `bash -n` needs Git Bash on PATH. If `bash` is missing, the test may skip with a reason, but CI must run it.)

- [ ] **Step 7: Commit**

```bash
git add scripts/apim/configure-admin-account-deletions-apim.sh infra/apim/admin-account-deletions/authenticated-policy.xml scripts/apim/tests/test_admin_account_deletions_apim.py .github/workflows/account-deletion-switch-on-ci.yml
git commit -m "feat(apim): admin account deletion route script"
```

---

### Task 2: Read-only preflight

**Files:**
- Create: `scripts/account-deletion/preflight.py`
- Create: `scripts/account-deletion/test_preflight.py`
- Modify: `.github/workflows/account-deletion-switch-on-ci.yml` (add job `preflight` and its paths)

**Interfaces:**
- Consumes: nothing from Task 1, except the workflow file.
- Produces, cited by Task 5's runbook:
  - command `python3 scripts/account-deletion/preflight.py [--auth-outbound-ip IP] [--output preflight.json]`;
  - exit codes `0` ready, `1` something missing or unreadable, `2` STOP (an enforced path covers the erase paths);
  - report sections titled `auth`, one per target name, and `commands`.

- [ ] **Step 1: Write the failing tests** `scripts/account-deletion/test_preflight.py`

Use a `FakeAz` world like `scripts/riders/test_rider_pilot_runtime.py:21-128`: a dict of `(resource group, app name) -> app JSON`, with helpers `app(name, env, secrets=None, fqdn=..., restrictions=None, traffic=None)`, `ref(name, secret)` and `val(name, value)`.
- `ready_world()` has:
  - auth holding `CRAVES_INTERNAL_SERVICE_SECRET=secretref:internal-secret`, `CRAVES_REFERRAL_SOURCE_HMAC_BASE64=secretref:referral-source-hmac` and all 19 deletion settings, with both switches literal `false`;
  - each target holding its credential variable as a secretref;
  - the HMAC only on `ca-craves-referral-prod`;
  - no ingress restrictions;
  - traffic pinned 100 % to one revision.
- Secret values in the world are the sentinel `"SENTINEL-SECRET-VALUE"`.

```python
def test_ready_world_exits_0_and_suggests_eight_base_urls(self):
    code, out = run(ready_world())
    assert code == 0
    for name in ("subscription", "order", "integration", "referral", "advanced", "catalog", "user-chef", "notification"):
        assert f"{name}:" in out
    assert out.count("https://") >= 8

def test_missing_credential_on_a_target_exits_1_and_names_it(self):
    world = ready_world(); drop_env(world, "ca-craves-advanced-prod", "CRAVES_INTERNAL_SERVICE_SECRET")
    code, out = run(world)
    assert code == 1 and "advanced" in out and "CRAVES_INTERNAL_SERVICE_SECRET missing" in out

def test_enforced_path_patterns_stop(self):
    for value in ("/internal/**", "/internal/v1/account-erasure", "/a/b, /internal/v1/account-erasure/**"):
        world = ready_world(); set_val(world, "ca-craves-order-prod", "CRAVES_INTERNAL_AUTH_ENFORCED_PATHS", value)
        code, out = run(world)
        assert code == 2 and "STOP" in out and "order" in out
    world = ready_world(); set_val(world, "ca-craves-order-prod", "CRAVES_INTERNAL_AUTH_ENFORCED_PATHS", "/internal/v1/orders/**")
    assert run(world)[0] == 0

def test_ingress_allows_auth_by_range_and_deny(self):
    # catalog: Allow 20.198.108.0/24 -> "allows auth"; Allow 10.0.0.1/32 only -> "does not allow auth" and exit 1;
    # a Deny rule naming auth's /32 -> "does not allow auth"; no rules -> "open"
    ...

def test_referral_target_is_the_app_holding_the_auth_hmac(self):
    code, out = run(ready_world())
    assert "referral: ca-craves-referral-prod" in out
    world = ready_world(); add_env(world, "ca-craves-referral-members-prod", ref("CRAVES_REFERRALS_AUTH_HMAC_BASE64", "x"))
    code, out = run(world)
    assert code == 1 and "both referral apps" in out

def test_traffic_split_is_reported_not_guessed(self):
    world = ready_world(); split_traffic(world, "ca-craves-auth-prod", 90, 10)
    code, out = run(world)
    assert code == 1 and "rolling out" in out

def test_no_secret_value_reaches_output(self):
    world = ready_world(); set_val(world, "ca-craves-auth-prod", "CRAVES_ACCOUNT_DELETION_ORDER_CREDENTIAL", "SENTINEL-SECRET-VALUE")
    code, out = run(world)
    assert "SENTINEL-SECRET-VALUE" not in out and "plain value (hidden)" in out
    code, out = run(failing_az(stderr="token SENTINEL-SECRET-VALUE"))
    assert code == 1 and "SENTINEL-SECRET-VALUE" not in out and "Azure command failed" in out

def test_commands_never_set_switches_or_values(self):
    world = ready_world(); drop_all_deletion_settings(world)
    code, out = run(world)
    commands = section(out, "commands")
    assert "az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod" in commands
    assert "secretref:internal-secret" in commands and "secretref:referral-source-hmac" in commands
    assert "CRAVES_ACCOUNT_DELETION_ENABLED" not in commands and "WORKER_ENABLED" not in commands
    assert "SENTINEL-SECRET-VALUE" not in commands
```

`run(world)` patches `preflight.subprocess.run` with the fake and returns `(exit code, stdout)`.

- [ ] **Step 2: Run, expect FAIL**

Run: `python3 -m unittest discover -s scripts/account-deletion -p 'test_preflight.py' -v`

- [ ] **Step 3: Implement** `scripts/account-deletion/preflight.py`

- **`TARGETS`:** an ordered list in `ERASE_ORDER`. Each entry is `(name, resource group, [app names], credential variable, auth credential setting or None for referral)`. Referral lists both apps.
- **`AUTH_OUTBOUND_DEFAULT`:** auth's outbound address from `docs/runbooks/production-environment.md` (auth row), with a comment naming that file. `--auth-outbound-ip` overrides it.
- **`az(*args)`:** like `rider_pilot_runtime.az`. Capture output, raise `GuardError("Azure command failed: az <first 3 args>")` and never include its stdout or stderr. The only Azure calls are `az containerapp show -g RG -n APP`.
- **`traffic_state(app) -> str`:** `"pinned <rev>"`, `"latest"`, or raise `GuardError("<app> is rolling out (traffic split); try again once it has finished")`. Same rules as `rider_pilot_runtime.pinned_revision`.
- **`setting(app, var) -> str`:** `"missing"`, `"secretref:<name> -> <vault>/<secret>"` (from `configuration.secrets[].keyVaultUrl` when present), or `"plain value (hidden)"`. These variables are non-secret and their value is shown: base URLs, `CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS`, `CRAVES_INTERNAL_AUTH_ENFORCED_PATHS`, and the two switches.
- **`enforced_stop(value) -> bool`:** split on `,`, strip each item, and match Ant style (`**` any depth, `*` one segment) against the 4 erase paths.
- **`ingress_verdict(app, ip) -> str`:** `"open"` (no `ipSecurityRestrictions`), `"allows auth"` (an Allow rule whose CIDR contains ip, and no Deny rule containing it), or `"does not allow auth"`. Use `ipaddress`.
- **Report:**
  - auth first: running state, latest/ready revision, traffic, and the 19 settings plus the two switches;
  - each target: the app chosen, running state and traffic, its fqdn and the base URL `https://<fqdn>`, whether ingress is external or internal, the ingress verdict, its credential setting, allowed callers and enforced paths;
  - `commands`: one `az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars ...` line for the missing settings only. Base URLs as values; the 7 credentials as `secretref:<auth secret behind CRAVES_INTERNAL_SERVICE_SECRET>`; the HMAC as `secretref:<auth secret behind CRAVES_REFERRAL_SOURCE_HMAC_BASE64>`. If either secret is not a secretref, print `secretref:<create-a-key-vault-backed-secret>` and a note.
- **Exit code:** 2 if any target's `enforced_stop` is true. Otherwise 1 if anything is missing, not running, not allowing auth, rolling out, or referral is ambiguous (both or neither). Otherwise 0.
- **`--output`:** writes the same facts as JSON, same no-value rule.

- [ ] **Step 4: Add CI job** `preflight` to `.github/workflows/account-deletion-switch-on-ci.yml`

Add the paths `scripts/account-deletion/**`, and run `python3 -m unittest discover -s scripts/account-deletion -p 'test_preflight.py' -v`.

- [ ] **Step 5: Run, expect PASS**

Run: `python3 -m unittest discover -s scripts/account-deletion -p 'test_preflight.py' -v`
Expected: 8 tests OK.

- [ ] **Step 6: Commit**

```bash
git add scripts/account-deletion/preflight.py scripts/account-deletion/test_preflight.py .github/workflows/account-deletion-switch-on-ci.yml
git commit -m "feat(ops): read-only account deletion preflight"
```

---

### Task 3: auth starts with the switches on

**Files:**
- Create: `services/auth-service/src/test/java/in/craves/auth/deletion/AccountDeletionStartupTest.java`

**Interfaces:**
- Consumes: the beans in `in.craves.auth.deletion` (`AccountDeletionProperties`, `AccountErasureClient`, `AccountDeletionService`, `AccountDeletionEngine`, `AccountDeletionWorker`, `DeletionNotices`, `DeletionNoticeExecutorConfiguration`, `AccountDeletionRepository`, `AccountLock`, `AuthAccountEraser`, both controllers).
- Produces: nothing for later tasks. It runs in CI through `.github/workflows/admin-session-ci.yml` (`mvn -f services/auth-service/pom.xml verify`, triggered on `services/auth-service/**`).

- [ ] **Step 1: Write the test** with `ApplicationContextRunner`, in the style of `src/test/java/in/craves/auth/referrals/ReferralAccessActivationTest.java`

- **Runner setup:**
  - `.withInitializer(new ConfigDataApplicationContextInitializer())`, so the real `application.yml` and its `${CRAVES_ACCOUNT_DELETION_*}` placeholders bind;
  - `.withUserConfiguration(...)` for the deletion classes above;
  - mocks via `.withBean(Type.class, () -> mock(Type.class))` for what they need outside the package: `JdbcTemplate`, `PlatformTransactionManager`, `FirebaseApp`, `Clock`, `ObjectMapper`, `AuthIdentityRepository`, `AuthIdentityRoleRepository`, `JwtProperties`, and any other constructor dependency the context reports missing.
- **`ON`:** the property values `CRAVES_ACCOUNT_DELETION_ENABLED=true`, `CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=true`, each of the 8 `CRAVES_ACCOUNT_DELETION_<T>_BASE_URL=https://<t>.example.azurecontainerapps.io`, the 7 `_CREDENTIAL=test-credential`, and `CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64=` base64 of 32 zero bytes.

```java
@Test void startsWithBothSwitchesOnAndEverySettingByItsEnvironmentName() {
    runner.withPropertyValues(ON).run(context -> {
        assertThat(context).hasNotFailed();
        assertThat(context).hasSingleBean(AccountDeletionWorker.class);
        AccountDeletionProperties p = context.getBean(AccountDeletionProperties.class);
        assertThat(p.isEnabled()).isTrue();
        assertThat(p.getServices().keySet()).containsAll(AccountErasureClient.ERASE_ORDER);
    });
}

@Test void refusesToStartWhenOneBaseUrlIsMissing() {
    runner.withPropertyValues(ON).withPropertyValues("CRAVES_ACCOUNT_DELETION_CATALOG_BASE_URL=").run(context ->
        assertThat(context).hasFailed().getFailure().rootCause().hasMessageContaining("base URL for catalog must be https"));
}

@Test void refusesToStartWhenTheReferralKeyIsShort() {
    runner.withPropertyValues(ON).withPropertyValues("CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64=AAAA").run(context ->
        assertThat(context).hasFailed().getFailure().rootCause().hasMessageContaining("at least 32 bytes"));
}

@Test void startsWithEverythingOffAndNoWorker() {
    runner.run(context -> {
        assertThat(context).hasNotFailed();
        assertThat(context).doesNotHaveBean(AccountDeletionWorker.class);
    });
}
```

If `AccountDeletionProperties` has no `getServices()`, assert through the properties' existing getter. Add no production code for the test.

- [ ] **Step 2: Run**

Run (Git Bash): `export JAVA_HOME="/c/Program Files/Java/jdk-21"; /c/tools/apache-maven-3.9.9/bin/mvn -B -ntp -f services/auth-service/pom.xml test -Dtest=AccountDeletionStartupTest`
Expected: 4 tests pass.
- The test proves existing wiring, so it may pass on first run. If it fails, the failure is the finding: report it, don't change production code without saying so.
- Make sure each refusal test fails for the stated reason: remove the property override temporarily and see the test go red.

- [ ] **Step 3: Run the auth suite**

Run: same mvn with `test` and no `-Dtest`.
Expected: no new failures. DB tests skip without `EMAIL_TEST_DB_URL`.

- [ ] **Step 4: Commit**

```bash
git add services/auth-service/src/test/java/in/craves/auth/deletion/AccountDeletionStartupTest.java
git commit -m "test(auth): account deletion starts with both switches on"
```

---

### Task 4: Deploy definitions (referral forfeit line, advanced internal secret)

**Files:**
- Modify: `services/referral-service/deploy/main.bicep:84-111` (the `CRAVES_REFERRALS_*` block)
- Modify: `infra/advanced-features/provision.sh` (the `app()` YAML: `secrets:` and `env:`)

**Interfaces:**
- Produces: Key Vault secret name `craves-internal-service-secret` in `kv-crv-advanced-34eefd`, which Task 5's runbook tells the owner to create before re-running `provision.sh app <sha>`.

- [ ] **Step 1: Referral.** After the `CRAVES_REFERRALS_SPENDING_ENABLED` entry, add `{ name: 'CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED', value: 'false' }` in the file's multi-line style.

- [ ] **Step 2: Advanced.** In `app()`:
- under `secrets:`, add `- {name: internal-service-secret, keyVaultUrl: ${kv_uri}secrets/craves-internal-service-secret, identity: $uai_id}`;
- under `env:`, add `- {name: CRAVES_INTERNAL_SERVICE_SECRET, secretRef: internal-service-secret}`;
- add a one-line comment above the secret: the Key Vault secret must exist before `app`, or the revision cannot start (runbook step 2).

- [ ] **Step 3: Verify**

- `bash -n infra/advanced-features/provision.sh` exits 0.
- `az bicep build --file services/referral-service/deploy/main.bicep --stdout >/dev/null`, if the Azure CLI is installed. Otherwise check the edit by eye against neighbouring entries, and say so in the report.
- `git grep -n "CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED" services/referral-service` shows `application.yml` and `main.bicep`.

- [ ] **Step 4: Commit**

```bash
git add services/referral-service/deploy/main.bicep infra/advanced-features/provision.sh
git commit -m "chore(deploy): referral forfeit switch listed off, advanced internal secret"
```

---

### Task 5: Runbook

**Files:**
- Create: `docs/runbooks/account-deletion-switch-on.md`
- Modify: `docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md`: one line under "Repo PR" pointing to the runbook.

**Interfaces:**
- Consumes:
  - Task 1's script and its env overrides;
  - Task 2's preflight command and exit codes;
  - Task 4's Key Vault secret name.

- [ ] **Step 1: Write the runbook**

Follow the spec's "Production steps" 1-9, "Rollback" and "Merge freeze" in order. Each step has:
- what it does, in one line;
- the exact Cloud Shell commands, in fenced `bash` blocks, with real names from Global Constraints and `<placeholders>` only for values the preflight prints;
- the check that proves it worked, with expected output;
- its rollback.

Required content:
- **Before you start:**
  - run in Azure Cloud Shell on subscription `34eefd95-1a19-416f-b9df-92b326500615`, with a clone of `main` at the merge commit;
  - freeze merges touching `services/auth-service` until step 7 is done;
  - have the test phone (spare number, customer-only, at least one past order) ready.
- **Step 2, copying the shared value into `kv-crv-advanced-34eefd`:**
  - the vaults are IP-locked, so open both vaults to the Cloud Shell address with `az keyvault network-rule add`, and remove the rules at the end of the step even on failure;
  - copy with a pipe through a private temp file (`umask 077`), stripping the trailing newline. Never echo the value. Delete the temp file;
  - re-run `bash infra/advanced-features/provision.sh app <the commit advanced runs now>`, and take that commit from the revision's image tag;
  - check: `POST https://<advanced fqdn>/internal/v1/account-erasure/blockers` with a wrong credential answers 401 or 403, not 503.
- **Step 3:**
  - paste the preflight's `commands` line;
  - wait for the new auth revision to be Running and healthy, then move traffic with `az containerapp ingress traffic set -g rg-craves-auth-prod -n ca-craves-auth-prod --revision-weight <new>=100`;
  - check `GET https://api.craves.in/api/v1/auth/me` still answers 401.
- **Step 4:** `DRY_RUN=true` first, then `CONFIRM_APIM_WRITE=true`.
- **Step 5:**
  - the owner types `--set-env-vars CRAVES_ACCOUNT_DELETION_ENABLED=true` by hand, then moves traffic;
  - check: signed out, `GET https://api.craves.in/api/v1/auth/me/deletion` still answers 401. In the app, Profile shows Delete account.
- **Step 6, test account:**
  - ask, then open the request on `admin.craves.in` → Deletion requests;
  - all 8 services answer, with no `SERVICE_UNREACHABLE`;
  - the fix paths: 401/403 means a separate secret for that target; timeout means an ingress allow rule for auth's address, with `az containerapp ingress access-restriction set` / `remove`;
  - Keep, then ask again.
- **Step 7:** `CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=true`, then traffic. Check that PREPARE steps show done in the admin detail within a few minutes.
- **Steps 8-9:** what to check on day 23 and day 30, and a results table to fill in: date, request id, step outcomes, erase counts. No personal data in it.
- **Rollback:**
  - switch to `false` and move traffic;
  - never roll back by moving traffic alone;
  - `az containerapp revision deactivate` for revisions that never took traffic;
  - gateway undo command from Task 1's script header.
- **Where things are:** auth's log for `CRAVES_ALERT alert=ACCOUNT_DELETION_*`, and the admin page.

- [ ] **Step 2: Check the runbook against the spec**

Every spec production step, rollback line and merge-freeze line appears. No `kmqgfy`/`prodlow` name. No command prints a secret value (`secret show` is only ever piped, never shown). The switch names appear only in the owner-typed steps 5, 7 and the rollback.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/account-deletion-switch-on.md docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md
git commit -m "docs(runbook): switching account deletion on"
```
