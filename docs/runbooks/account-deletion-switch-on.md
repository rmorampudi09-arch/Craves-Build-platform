# Switching account deletion on in production

How the owner turns account deletion on, by hand, in Azure Cloud Shell (Bash), and proves it on a test account. Design: `docs/superpowers/specs/2026-11-05-account-deletion-switch-on-design.md`. Production names: `docs/runbooks/production-environment.md`.

Two rules hold on every step:
- **No secret value is ever printed.** Every command here prints names, addresses and states only. Do not add `--show-values`, and do not run `az keyvault secret show` on its own.
- **Only you flip the switches.** Steps 5 and 7 (and the rollback) are typed by you. No script sets them.

Each step says what it does, the commands, the check that proves it worked, and its rollback. Do the steps in order. Stop at any check that does not match, and ask.

## Before you start

1. Open Azure Cloud Shell (Bash) and select the production subscription:

   ```bash
   az account set -s 34eefd95-1a19-416f-b9df-92b326500615 && az account show --query id -o tsv
   ```

   Expected: `34eefd95-1a19-416f-b9df-92b326500615`.

2. Get `main` once. It must include the PR that added this runbook. The clone usually stays in your Cloud Shell home, so later days reuse it. An ephemeral Cloud Shell ("Your Cloud Shell session will be ephemeral") forgets files and variables when it restarts or times out: run items 1-3 again, then set again the variables the step you are in uses (`NEW`, `SRC_URL`, `COMMIT`).

   ```bash
   D=~/craves-switch-on
   [ -d "$D" ] || git clone -q --filter=blob:none https://github.com/rmorampudi09-arch/Craves-Build-platform "$D"
   test -f "$D/docs/runbooks/account-deletion-switch-on.md" && git -C "$D" log -1 --format='%h %ad %s' --date=short
   ```

   Expected: one line, the switch-on PR's merge commit or a later one. Nothing printed means the clone is older than the merge: delete `~/craves-switch-on` and run the block again.

3. Paste the helpers. Paste them again in every new Cloud Shell session (after a time-out too), together with the `D=~/craves-switch-on` line. `copy_secret` and `with_ingress` remove their temporary rule when they end, even when the command fails or you press Ctrl+C. If a removal fails, they print `WARNING:` with the exact command to run.

   ```bash
   # copy_secret <source Key Vault secret URL> <target vault> <target secret name>
   # Copies one secret value between IP-locked vaults without printing it.
   copy_secret() (
     set -euo pipefail; set +x; umask 077
     src=$1 dst_vault=$2 dst_name=$3
     [[ "$src" == https://*.vault.azure.net/secrets/* ]] || { echo "Not a Key Vault secret URL: '$src'"; exit 1; }
     src_vault=$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$src")
     ip=$(curl -fsS https://api.ipify.org); tmp=$(mktemp)
     trap 'rm -f "$tmp"
       for v in "$src_vault" "$dst_vault"; do
         az keyvault network-rule remove -n "$v" --ip-address "$ip/32" -o none ||
           echo "WARNING: rule not removed. Run: az keyvault network-rule remove -n $v --ip-address $ip/32" >&2
       done' EXIT
     # Explicit '|| exit 1': bash ignores set -e when a function is called inside if, && or ||.
     az keyvault network-rule add -n "$src_vault" --ip-address "$ip/32" -o none || exit 1
     az keyvault network-rule add -n "$dst_vault" --ip-address "$ip/32" -o none || exit 1
     sleep 30  # the vault firewalls take a moment to let this shell in
     # -o tsv ends the value with one newline; head -c -1 drops exactly that one. Nothing reaches the screen.
     az keyvault secret show --id "$src" --query value -o tsv | head -c -1 > "$tmp"
     [ -s "$tmp" ] || { echo "Could not read $src"; exit 1; }
     az keyvault secret set --vault-name "$dst_vault" -n "$dst_name" --file "$tmp" -o none || exit 1
     echo "Copied to $dst_vault/$dst_name"
   )

   # with_ingress <resource group> <app> <command...>
   # Runs the command while this Cloud Shell may reach the app's own address, then closes it again.
   with_ingress() (
     set -euo pipefail; set +x
     rg=$1 app=$2; shift 2
     allows=$(az containerapp ingress access-restriction list -g "$rg" -n "$app" -o json | jq '[.[]? | select(.action == "Allow")] | length')
     [ -n "$allows" ] || { echo "Could not read the ingress rules of $app"; exit 1; }
     # No allow-list means the app is open already; adding an Allow rule would shut everyone else out.
     [ "$allows" -gt 0 ] || { "$@"; exit; }
     ip=$(curl -fsS https://api.ipify.org)
     trap 'az containerapp ingress access-restriction remove -g "$rg" -n "$app" --rule-name cloudshell-check -o none ||
       echo "WARNING: rule not removed. Run: az containerapp ingress access-restriction remove -g $rg -n $app --rule-name cloudshell-check" >&2' EXIT
     az containerapp ingress access-restriction set -g "$rg" -n "$app" --rule-name cloudshell-check --ip-address "$ip/32" --action Allow -o none || exit 1
     sleep 30
     "$@"
   )

   # vault_rules_left <vault>...: rules each vault still has for this Cloud Shell's address (expect 0)
   vault_rules_left() {
     local ip v; ip=$(curl -fsS https://api.ipify.org)
     for v in "$@"; do
       [ -n "$v" ] && echo "$v: $(az keyvault network-rule list -n "$v" --query "ipRules[].value" -o tsv | grep -cxF -e "$ip" -e "$ip/32")"
     done
   }
   ```

4. **Wait for the releases this PR's merge started.** The PR touches auth-service (its start-up test) and referral-service (its deploy file), so the merge runs `release-auth` and `release-referral`. A release landing in the middle of step 3 or 5 could ship half-set settings. In Azure DevOps (org `ravitejamm6`, project `Craves-New-Original`), both runs for the merge commit must show finished. Then check the images:

   ```bash
   az containerapp show -g rg-craves-auth-prod -n ca-craves-auth-prod --query "properties.template.containers[0].image" -o tsv
   az containerapp show -g rg-craves-referral-prod -n ca-craves-referral-prod --query "properties.template.containers[0].image" -o tsv
   ```

   Expected: each tag (after the `:`) starts with the merge commit's id, or a later `main` commit's. Start step 1 only then.

5. **Check that advanced runs code with the erase endpoint.** Advanced has no automatic release: a merge to `main` does not redeploy it, so it can run code older than account deletion 1/5 (#611, `eff853255`). That code has no `/internal/v1/account-erasure` route and answers auth with `HTTP 401` (on 5 Nov 2026 it ran `0fb5ca9b`, from 3 Nov). Read only:

   ```bash
   ADV_TAG=$(az containerapp show -g rg-craves-advanced-prod -n ca-craves-advanced-prod --query "properties.template.containers[0].image" -o tsv); ADV_TAG=${ADV_TAG##*:}
   git -C "$D" merge-base --is-ancestor eff853255 "$(git -C "$D" rev-parse --verify "$ADV_TAG^{commit}")" && echo "has the erase endpoint" || echo "older than #611"
   git -C "$D" log --oneline "$ADV_TAG..origin/main" -- services/advanced-features-service
   ```

   Expected: `has the erase endpoint`. With `older than #611`, step 2 deploys a newer commit instead of the one advanced runs now (step 2, part 4): the last line lists every change that deploy would ship. Each one must be meant to go live; otherwise stop and ask.

6. **Merge freeze starts now:** no merge that touches `services/auth-service` until step 7 is done (about one day). See "Merge freeze".

7. Have ready:
   - the test phone: a spare number you control, customer-only (no chef, rider or staff role: never your own admin login), with at least one past order, signed in on an app build that has the Delete account screen (plan 3, #615, app 1.36.17 or later). Never write the number in this file or in chat;
   - your staff sign-in on `admin.craves.in`.

   Steps 5 and 6 run in the same hour. Pick a quiet one.

## Why it is done this way

Calls made in review (the owner checked them):
- **Advanced:** its secret goes into `provision.sh`, not set by hand, because the documented deploy would wipe a hand-set one (step 2).
- **Rollback:** always by switching the setting off, never by moving traffic alone. auth-service merges freeze for about a day during switch-on, because the release template can't be checked from this repo.
- **Enforced paths:** if signed calls are enforced on the erase paths, the preflight says STOP and plan 5 halts. It does not work around it.
- **Shared value:** catalog's and subscription's values are proven at step 6 by the read-only detail call, not by reading Key Vaults. Fix A is the fix path.
- **Network:** an ingress allow rule for auth, if one is needed, is a conditional step with its own rollback (Fix B).
- **Referral target:** whichever referral app holds the auth HMAC; the preflight picks it.

Owner answers (5 Nov):
- **Referral forfeit stays off for launch.** A customer with referral credit left waits on `FORFEIT_AWAITING_FINANCE` until finance acts. Staff see it as blocked, and the alert fires.
- **Test account:** a spare number the owner controls, customer-only, with at least one past order, so the order and payment scrubs run. The owner signs in. It is erased for good on day 30.

## Move auth's traffic

Steps 3, 5, 7, Fix A and the rollback each end here. auth's traffic stays pinned to a named revision, so a settings change makes a new revision with no traffic until you move it. Moving traffic is not enough: the deletion worker runs inside every active revision, with or without traffic. So part 3 deactivates every other revision (as `docs/riders/GO-LIVE.md` §8 does).

1. Find the new revision and wait for it. Run the second line once a minute until it shows `Running` (or `RunningAtMaxScale`) and `Healthy`:

   ```bash
   NEW=$(az containerapp show -g rg-craves-auth-prod -n ca-craves-auth-prod --query properties.latestRevisionName -o tsv); echo "$NEW"
   az containerapp revision show -g rg-craves-auth-prod -n ca-craves-auth-prod --revision "$NEW" --query "[properties.runningState, properties.healthState]" -o tsv
   ```

   Not `Healthy` after 10 minutes: do not move traffic. Go to that step's rollback.

2. Give it all traffic, then look:

   ```bash
   az containerapp ingress traffic set -g rg-craves-auth-prod -n ca-craves-auth-prod --revision-weight "$NEW=100" -o none
   az containerapp ingress traffic show -g rg-craves-auth-prod -n ca-craves-auth-prod -o table
   ```

   Expected: the `$NEW` row has weight 100; any other row has 0.

3. Deactivate every other active revision, then list what is left. The first line does nothing unless `$NEW` really holds all traffic:

   ```bash
   [ "$(az containerapp ingress traffic show -g rg-craves-auth-prod -n ca-craves-auth-prod --query "[?revisionName=='$NEW'].weight | [0]" -o tsv)" = 100 ] &&
   for R in $(az containerapp revision list -g rg-craves-auth-prod -n ca-craves-auth-prod --query "[?properties.active && name!='$NEW'].name" -o tsv); do
     az containerapp revision deactivate -g rg-craves-auth-prod -n ca-craves-auth-prod --revision "$R" -o none && echo "deactivated $R"
   done
   az containerapp revision list -g rg-craves-auth-prod -n ca-craves-auth-prod --query "[?properties.active].name" -o tsv
   ```

   Expected: `deactivated <name>` for each old revision, then one line: `$NEW`. Nothing deactivated and more than one name left means `$NEW` did not hold all traffic: run part 2 again, then part 3.

## Step 1. Preflight (read only)

Reads auth and the 8 services it will call, and prints what is missing. It writes nothing.

```bash
python3 "$D/scripts/account-deletion/preflight.py" --output ~/preflight-1.json; echo "exit $?"
```

Expected now: `NOT READY` and `exit 1`, with only these `PROBLEM` lines, which steps 2 and 3 fix:
- `auth: CRAVES_ACCOUNT_DELETION_..._BASE_URL missing`, `..._CREDENTIAL missing` and `..._REFERRAL_HMAC_BASE64 missing` (16 lines at most);
- `advanced: CRAVES_INTERNAL_SERVICE_SECRET missing`.

Anything else first:

| Output | Do |
|---|---|
| `STOP` and `exit 2` | Plan 5 halts. A service enforces signed calls on the erase paths, so auth would need to sign them (a code change). Change nothing. |
| `rolling out` | A release is splitting traffic. Wait until it ends, then run step 1 again. |
| `<service>: internal ingress; ...` | The service is not reachable from auth's environment except over network peering. Stop and ask. |
| `<service>: ingress does not allow auth's address ...` | Fix B (under step 6) for that service, then run step 1 again. |
| any other `PROBLEM` line | Stop and ask. |

Rollback: none, nothing was written.

## Step 2. Advanced: give it the shared internal value

Advanced has no internal secret yet, so its erase endpoints answer 503. This copies auth's shared value into advanced's vault, then redeploys advanced the documented way. Advanced's traffic follows its newest revision by itself.

1. Note how advanced runs now, for the rollback and the check:

   ```bash
   az containerapp revision list -g rg-craves-advanced-prod -n ca-craves-advanced-prod -o table
   az containerapp show -g rg-craves-advanced-prod -n ca-craves-advanced-prod --query "properties.template.containers[0].env[].name" -o tsv | sort > ~/advanced-env-before.txt
   ```

   Write down the revision with traffic 100. It is advanced's rollback.

2. Find where auth keeps the shared value. This prints a Key Vault address, never the value:

   ```bash
   REF=$(az containerapp show -g rg-craves-auth-prod -n ca-craves-auth-prod --query "properties.template.containers[0].env[?name=='CRAVES_INTERNAL_SERVICE_SECRET'].secretRef | [0]" -o tsv)
   SRC_URL=$(az containerapp show -g rg-craves-auth-prod -n ca-craves-auth-prod --query "properties.configuration.secrets[?name=='$REF'].keyVaultUrl | [0]" -o tsv)
   echo "$REF -> $SRC_URL"
   ```

   Expected: `<app secret> -> https://kv-crv-auth-34eefd.vault.azure.net/secrets/<name>`. Nothing after the arrow: auth's value is not in a Key Vault. Stop and ask.

3. Copy it into advanced's vault. Both vaults are opened to this Cloud Shell for the copy and closed again:

   ```bash
   copy_secret "$SRC_URL" kv-crv-advanced-34eefd craves-internal-service-secret
   ```

   Expected: `Copied to kv-crv-advanced-34eefd/craves-internal-service-secret`.
   - `Client address is not authorized`: the firewall rule was not active yet. Run it again.
   - `Forbidden` naming `getSecret` or `setSecret`: you lack the data role on that vault. Give it to yourself once (`Key Vault Secrets User` to read, `Key Vault Secrets Officer` to write), wait 5 minutes, run the copy again:

     ```bash
     az role assignment create --assignee-object-id "$(az ad signed-in-user show --query id -o tsv)" --assignee-principal-type User --role "Key Vault Secrets Officer" --scope "$(az keyvault show -n <vault> --query id -o tsv)" -o none
     ```

   Then check that both vaults are closed to this Cloud Shell again, whether the copy worked or not:

   ```bash
   vault_rules_left "$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$SRC_URL")" kv-crv-advanced-34eefd
   ```

   Expected: `kv-crv-auth-34eefd: 0` and `kv-crv-advanced-34eefd: 0`. A `1` means a rule stayed: run the `WARNING:` command the copy printed.

4. Find the commit advanced runs now, and make sure its image is there. The image tag is the first 12 characters of that commit:

   ```bash
   IMAGE=$(az containerapp show -g rg-craves-advanced-prod -n ca-craves-advanced-prod --query "properties.template.containers[0].image" -o tsv)
   COMMIT=$(git -C "$D" rev-parse --verify "${IMAGE##*:}^{commit}"); echo "$IMAGE -> $COMMIT"
   [ "${IMAGE##*:}" = "${COMMIT:0:12}" ] && echo "same tag" || echo "different tag"
   ```

   Expected: `crcravesprod34eefd.azurecr.io/craves/advanced-features-service:<12 characters> -> <40 characters, the same 12 first>`, then `same tag`. If `rev-parse` fails, the tag is not a `main` commit: stop and ask.

   If "Before you start" item 5 said `older than #611`, deploy the newest `main` commit that changes advanced instead (the image builds first, several minutes):

   ```bash
   COMMIT=$(git -C "$D" log -1 --format=%H origin/main -- services/advanced-features-service); echo "$COMMIT"
   ```

   Only then:

   ```bash
   bash "$D/infra/advanced-features/provision.sh" image "$COMMIT"
   ```

   Expected: `exists`. With `different tag` it builds that commit's 12-character tag first (several minutes); let it finish.

5. Before deploying, check that `provision.sh` keeps every setting advanced has now. It rewrites the whole app, and advanced's traffic follows the new revision at once:

   ```bash
   grep -oE '^      - \{name: [A-Z][A-Z0-9_]*' "$D/infra/advanced-features/provision.sh" | sed 's/.*name: //' | sort | diff ~/advanced-env-before.txt - | grep '^[<>]'
   ```

   Expected: `> CRAVES_INTERNAL_SERVICE_SECRET`. Another `>` line is a setting `provision.sh` gained since advanced's last deploy: fine. A `<` line is a setting the live app has and `provision.sh` would drop: stop and ask. Do not deploy.

6. Deploy:

   ```bash
   bash "$D/infra/advanced-features/provision.sh" app "$COMMIT"
   ```

   Expected, after up to 10 minutes: `Revision ca-craves-advanced-prod--m<8 characters>[-<time>]: Healthy`. Any other state: roll back.

7. Check that the erase endpoint stops answering 503. A wrong credential must now get 401:

   ```bash
   ADV=$(az containerapp show -g rg-craves-advanced-prod -n ca-craves-advanced-prod --query properties.configuration.ingress.fqdn -o tsv)
   with_ingress rg-craves-advanced-prod ca-craves-advanced-prod curl -s -w ' HTTP %{http_code}\n' -X POST \
     "https://$ADV/internal/v1/account-erasure/blockers" -H 'Content-Type: application/json' -H 'X-Craves-Internal-Secret: wrong' \
     --data '{"identityId":"00000000-0000-4000-8000-000000000000","scope":"ALL"}'
   az containerapp ingress access-restriction list -g rg-craves-advanced-prod -n ca-craves-advanced-prod --query "[?name=='cloudshell-check'].name" -o tsv
   ```

   Expected:
   - the call prints `INTERNAL_SECRET_REQUIRED` and `HTTP 401`. `INTERNAL_SECRET_NOT_CONFIGURED` and `HTTP 503` mean the secret has not reached the app: check that the newest revision is the one with traffic. `HTTP 403` with no JSON means the Cloud Shell rule was not active yet: run the call again.
   - the last line prints nothing: the temporary rule is gone.

8. In step 1's preflight output, the sections `subscription`, `order`, `integration`, `user-chef`, `catalog` and `notification` each show their credential line as `secretref:...` (or `plain value (hidden)`), never `missing`.

Rollback: move advanced's traffic back to the revision you noted. The vault secret can stay: nothing uses it until a revision does.

```bash
az containerapp ingress traffic set -g rg-craves-advanced-prod -n ca-craves-advanced-prod --revision-weight <revision you noted>=100 -o none
```

## Step 3. auth settings, both switches still off

Gives auth the 8 service addresses, the 7 credentials and the referral HMAC, all as references to secrets auth already holds. Nothing changes for anyone yet.

1. Run the preflight again:

   ```bash
   python3 "$D/scripts/account-deletion/preflight.py" --output ~/preflight-3.json; echo "exit $?"
   ```

   Expected: the only `PROBLEM` lines left are the `auth: ... missing` ones. The `advanced` section now shows `secretref:internal-service-secret -> kv-crv-advanced-34eefd/craves-internal-service-secret`.

2. Copy the one line under `## commands`. It looks like this, with real values:

   ```text
   az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod -o none --set-env-vars CRAVES_ACCOUNT_DELETION_SUBSCRIPTION_BASE_URL=https://ca-craves-subscription-prod.<...>.azurecontainerapps.io ... CRAVES_ACCOUNT_DELETION_SUBSCRIPTION_CREDENTIAL=secretref:<auth's internal secret> ... CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64=secretref:<auth's referral secret>
   ```

   Before you run it, check that it has:
   - one `..._BASE_URL=https://...azurecontainerapps.io` per missing address (8 on a first run);
   - one `..._CREDENTIAL=secretref:...` per missing credential (7 on a first run);
   - `..._REFERRAL_HMAC_BASE64=secretref:...`;
   - no `<create-a-key-vault-backed-secret>`. If it is there, stop and ask.

3. Paste the line and press Enter. It already has `-o none`, so Azure does not print the app's settings back.

4. Move auth's traffic (section above).

Check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.craves.in/api/v1/auth/me
python3 "$D/scripts/account-deletion/preflight.py"; echo "exit $?"
```

Expected: `401`, then `READY` and `exit 0`. In the auth section, the two switch lines still read `missing` or `false`.

Rollback: if the new revision never became `Healthy`, deactivate it: `az containerapp revision deactivate -g rg-craves-auth-prod -n ca-craves-auth-prod --revision "$NEW"`. Traffic never moved, so nobody was affected. Ask before trying again. Once traffic has moved, nothing needs undoing: these settings do nothing while both switches are off.

## Step 4. Admin gateway route

Publishes `/api/v1/admin/account-deletions` on `api.craves.in`, so `admin.craves.in` → Deletion requests works. Today the route answers 404.

```bash
DRY_RUN=true bash "$D/scripts/apim/configure-admin-account-deletions-apim.sh"
```

Expected: four `WOULD WRITE ...` lines, then `DRY RUN: all read-only checks passed, nothing written.` An `ERROR:` line means nothing was written: stop and ask.

```bash
CONFIRM_APIM_WRITE=true bash "$D/scripts/apim/configure-admin-account-deletions-apim.sh"
```

Expected: four `WRITTEN ...` lines, two `OK ... -> 401 without a login` lines (each may take up to 2 minutes), then `SUCCESS: admin account deletion routes configured and verified. auth-service still checks the admin role.` `Azure command failed: <step>` names the step that failed. Re-run it (every write is a PUT and safe to repeat), or run this step's rollback.

Check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.craves.in/api/v1/admin/account-deletions
```

Expected: `401` (it was `404`).

Rollback (the undo line in the script's header):

```bash
APIM_RG=$(az apim list --query "[?name=='apim-craves-prod-34eefd'].resourceGroup" -o tsv)
az apim api delete -g "$APIM_RG" --service-name apim-craves-prod-34eefd --api-id craves-admin-account-deletions-v1 --yes
```

## Step 5. Turn requests on, worker off (you type it)

People can now ask for deletion in the app and on the website. Nothing reaches the other services' data: the worker stays off. Type this line yourself:

```bash
az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars CRAVES_ACCOUNT_DELETION_ENABLED=true CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=false -o none
```

Then move auth's traffic. If the revision never becomes `Healthy`, auth refused to start: a deletion setting is missing or malformed. Go to Rollback.

Check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.craves.in/api/v1/auth/me/deletion
```

Expected: `401` signed out. On the test phone, Profile shows Delete account; the website's account page shows it too. Go straight on to step 6.

Rollback: see Rollback, "Turn everything off".

## Step 6. Test account, the same hour

Proves that auth reaches all 8 services, and that keep and release work. The detail page's calls are read-only.

1. On the test phone: Profile → Delete account → the whole account → confirm.
2. On `admin.craves.in` → Deletion requests, open the new request (Scope: Whole account, Via: App). It can take 30 seconds: auth asks all 8 services.

   Expected:
   - Summary: Scope Whole account, Roles `CUSTOMER` only, Status Scheduled, Due 30 days from now. Any other role (CHEF, an `*_ADMIN`) means a chef or staff login, and the scope shows Customer: tap **Keep my account** at once and use another number. Keep also signs that account out everywhere, `admin.craves.in` included;
   - Open items: "Nothing is open";
   - Steps: 8 PREPARE rows, status PENDING (the worker is off).

   Also check the list: the test request should be the only Scheduled one. If a real person asked between step 5 and the test request, treat their request as the first erase. Note their due date in Results, watch it with step 9's admin checks, and run Rollback, "Stop erasing", on the first `ACCOUNT_DELETION_ERASE_BLOCKED` or `ACCOUNT_DELETION_STEP_FAILING` alert.

3. Any row with code `SERVICE_UNREACHABLE` must be fixed before you go on. Its Detail column says why:

   | Detail | Meaning | Do |
   |---|---|---|
   | `HTTP 401` on advanced | Most likely advanced runs code older than the erase endpoint (a missing route also answers 401). | "Before you start" item 5, then step 2 parts 4-6 with the newer commit. Fix A only if advanced already has the endpoint. |
   | `HTTP 401` or `HTTP 403` | The service refuses auth's credential (most likely catalog or subscription holding a different value). | Fix A. A 403 can also be the service's ingress: if the preflight's `ingress:` line for it says `does not allow auth`, Fix B instead. |
   | `TIMEOUT` or `UNREACHABLE` | The network. | Fix B, but only if the preflight's `ingress:` line for that service says `does not allow auth`. Otherwise (`open`, `allows auth`, or `internal ingress`) stop and ask. |
   | `NOT_CONFIGURED` | A step 3 setting is missing. | Step 3 again. |
   | `HTTP 503` on advanced | Step 2 did not reach the app. | Step 2, part 7. |
   | anything else | | Stop and ask. |

   After a fix, reload the request. The row must be gone.

4. On the phone, tap **Keep my account**. In the admin list the request becomes Cancelled. This proves keep, and queues the release.
5. Ask again: Profile → Delete account → the whole account → confirm. This request stays open to day 30. Write its request id (shown on the admin page) and its due date in Results.

### Fix A: a service refuses auth's credential

Gives auth its own copy of that service's value, for that service only. Paste the three blocks one at a time, and check each one's output before you paste the next.

1. Name the service (example values for catalog):

   ```bash
   T=catalog                                                   # the service the admin page names
   T_RG=rg-craves-catalog-prod; T_APP=ca-craves-catalog-prod   # the app in the preflight's section for it
   T_VAR=CRAVES_INTERNAL_SERVICE_SECRET                        # the credential line in that section
   AUTH_SETTING=CRAVES_ACCOUNT_DELETION_CATALOG_CREDENTIAL     # for referral: CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64
   ```

2. Find the service's own Key Vault secret, copy it into auth's vault, and check both vaults are closed again:

   ```bash
   REF=$(az containerapp show -g "$T_RG" -n "$T_APP" --query "properties.template.containers[0].env[?name=='$T_VAR'].secretRef | [0]" -o tsv)
   SRC_URL=$(az containerapp show -g "$T_RG" -n "$T_APP" --query "properties.configuration.secrets[?name=='$REF'].keyVaultUrl | [0]" -o tsv); echo "$SRC_URL"
   copy_secret "$SRC_URL" kv-crv-auth-34eefd "account-deletion-$T-credential"
   vault_rules_left "$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$SRC_URL")" kv-crv-auth-34eefd
   ```

   Expected: a Key Vault address, then `Copied to kv-crv-auth-34eefd/account-deletion-<service>-credential`, then lines ending `: 0` (a `1`: run the `WARNING:` command). `Not a Key Vault secret URL: ''` means the service's value is not in a Key Vault: stop and ask. Any other error: fix it as in step 2, part 3, and paste this block again. Go on only after `Copied to`.

3. Give auth an app secret for it, and point the one setting at it:

   ```bash
   (
     set -euo pipefail
     ID=$(az containerapp show -g rg-craves-auth-prod -n ca-craves-auth-prod --query "properties.configuration.secrets[?keyVaultUrl].identity | [0]" -o tsv)
     [ -n "$ID" ] || { echo "auth has no Key Vault identity; stop and ask"; exit 1; }
     az containerapp secret set -g rg-craves-auth-prod -n ca-craves-auth-prod -o none \
       --secrets "account-deletion-$T-credential=keyvaultref:https://kv-crv-auth-34eefd.vault.azure.net/secrets/account-deletion-$T-credential,identityref:$ID"
     az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars "$AUTH_SETTING=secretref:account-deletion-$T-credential" -o none
     echo "auth: $AUTH_SETTING -> account-deletion-$T-credential"
   )
   ```

   Expected: `auth: <setting> -> account-deletion-<service>-credential`. Then move auth's traffic. Check: reload the request; that service's row is gone.

Rollback: point the setting back at auth's shared secret (the name `secretref:` showed in step 3's line), then move auth's traffic: `az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars "$AUTH_SETTING=secretref:<auth's secret from step 3>" -o none`.

### Fix B: auth cannot reach a service

Lets auth's outbound address through that service's ingress. Take the address from the auth row of `docs/runbooks/production-environment.md` (the preflight's `PROBLEM` line names it too). Use the service's resource group and app from the preflight.

```bash
az containerapp ingress access-restriction list -g <resource group> -n <app> -o table
```

Expected: a list of Allow rules. If the list is empty, stop: the app is open, and one Allow rule would lock everyone else out, the gateway included. If it shows Deny rules, stop and ask.

```bash
az containerapp ingress access-restriction set -g <resource group> -n <app> --rule-name craves-auth --ip-address <auth outbound address>/32 --action Allow --description "auth-service account deletion" -o none
```

Check: the preflight's section for that service says `ingress: allows auth`, and reloading the request clears its row.

Rollback:

```bash
az containerapp ingress access-restriction remove -g <resource group> -n <app> --rule-name craves-auth -o none
```

## Step 7. Turn the worker on (you type it)

Starts the worker, which runs the PREPARE and RELEASE steps now and the erase on day 30. Type this line yourself:

```bash
az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=true -o none
```

Then move auth's traffic.

Check, within 5 minutes:
- the open test request's 8 PREPARE rows show DONE, with no Last error;
- the cancelled first request's RELEASE rows (subscription, catalog) show DONE;
- auth's log has no `ACCOUNT_DELETION_` alert since step 5 (query in "Where things are"). Run the positive control there first: a count of 0 means the logs go elsewhere, so an empty alert list proves nothing.

The merge freeze ends here.

Rollback: see Rollback, "Stop erasing".

## Step 8. Day 23: the reminder

The test phone gets the 7-day reminder. On the admin page the request is still Scheduled, and auth's log has no `ACCOUNT_DELETION_` alert. Write it in Results. No reminder: look at auth's log, write it in Results, and ask.

## Step 9. Day 30: the erase

The test account is erased for good. The erase starts a few minutes after the due time: auth locks the account, waits one sign-in token lifetime, then erases one service a minute.

Check:
1. Admin detail: Status Completed, Phone "Erased", and ERASE rows for the 8 services and auth, all DONE. A day later a SWEEP row for notification shows DONE too.
2. The test number signs up fresh in the app: a new, empty customer account with no past orders.
3. The erase counts. auth keeps them in its step records (`account_deletion_step.erased_count`, in the IP-locked database). Each service also logs its counts, so read them in Log Analytics (portal: `law-craves-prod` in `rg-craves-shared-prod` → Logs):

   First check that the service's logs reach Log Analytics (use `ca-craves-order-prod`); the count must be above 0, else logs go elsewhere: stop and ask.

   ```kusto
   ContainerAppConsoleLogs_CL | where ContainerAppName_s == "ca-craves-order-prod" and TimeGenerated > ago(1h) | count
   ```

   ```kusto
   ContainerAppConsoleLogs_CL
   | where TimeGenerated > ago(2d) and Log_s contains "<request id>" and Log_s contains "counts="
   | project TimeGenerated, ContainerAppName_s, Log_s
   | order by TimeGenerated asc
   ```

   Expected: one line per service, each with its `counts={...}`. order-service's line has counts above 0 (the test account had an order).

If the request shows Waiting with `FORFEIT_AWAITING_FINANCE`, the test account had referral credit, and the forfeit stays off (Owner answers). If an `ACCOUNT_DELETION_ERASE_BLOCKED` or `ACCOUNT_DELETION_STEP_FAILING` alert fires, write it in Results and ask. Stop erasing first if it repeats.

## Results

Fill in as you go. Ids, dates, states and counts only: no phone number, name or email.

| Step | Date | Request id | Outcome | Erase counts |
|---|---|---|---|---|
| 1 Preflight | 5 Nov 2026 | | NOT READY as expected: 16 auth settings + advanced secret missing; no STOP; all 8 services external and allow auth | |
| 2 Advanced | 5 Nov 2026 | | Secret added, rev `m0fb5ca9b-11051644`. Step 6 then showed advanced `HTTP 401`: its code (`0fb5ca9b`) predated #611. Redeployed at `eff853255`, rev `meff85325` Healthy | |
| 3 auth settings | 5 Nov 2026 | | auth rev `81ixzfh`, preflight READY, `/auth/me` 401 | |
| 4 Gateway | 5 Nov 2026 | | `craves-admin-account-deletions-v1` written, both probes 401, SUCCESS | |
| 5 Requests on | 5 Nov 2026 | | auth rev `0000001` started Healthy with the switch on (start-up check passed) | |
| 6 Wrong account (kept) | 5 Nov 2026 | `0a863f3b` | Mistake: a staff login (CHEF + admin roles), scope Customer, via web. Kept at once; its steps never ran | |
| 6 Test request (first, kept) | 6 Nov 2026 | `5ce8aafc` | Customer-only test account, app 1.36.17, Whole account, all 8 services answered, nothing open. Kept; RELEASE catalog + subscription DONE after step 7 | |
| 6 Test request (second, open) | 6 Nov 2026 | `673330d5` | Scheduled, due 6 Dec 2026 | |
| 7 Worker on | 6 Nov 2026 | `673330d5` | auth rev `0000002`; PREPARE 8/8 DONE 00:31 IST, no error; logs arrive (118 lines/h), no `ACCOUNT_DELETION_` alert | |
| 8 Reminder | | | | |
| 9 Erase | | | | |
| 9 Sweep (day 31) | | | | |

## Rollback

**Never roll back by moving traffic alone.** A later release could copy settings from the revision you moved away from. Always set the switch back to `false`, then move traffic to that new revision. Open requests stay in the database, and nothing is erased while the worker is off.

- **Stop erasing** (requests stay open, the app still offers deletion). Type:

  ```bash
  az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=false -o none
  ```

- **Turn everything off.** Type:

  ```bash
  az containerapp update -g rg-craves-auth-prod -n ca-craves-auth-prod --set-env-vars CRAVES_ACCOUNT_DELETION_ENABLED=false CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=false -o none
  ```

Then move auth's traffic, all three parts. Part 3 matters most here: it deactivates every other active revision, including the worker-on one. An active revision with 0 traffic still runs the worker. It also removes a revision that never became `Healthy`.

Other rollbacks: the gateway route (step 4), advanced (step 2), Fix A and Fix B each have their own.

## Merge freeze

No merge that touches `services/auth-service` from the start until step 7 is done (about one day). It is unknown which revision `release-auth` copies its settings from, so a release mid-way could ship half-set settings. Tell everyone who can merge before you start, and tell them when step 7 is done.

After the freeze, once auth's next release is live, run the preflight again: both switch lines must still read `true`. If not, set them again by hand (steps 5 and 7) and ask why.

## Where things are

- **Requests:** `admin.craves.in` → Deletion requests. The detail page shows open items (with why a service could not be asked) and every step.
- **Alerts:** auth logs `CRAVES_ALERT alert=ACCOUNT_DELETION_*`: `REQUEST_FAILING`, `STEP_FAILING`, `ERASE_BLOCKED` and `WAITING`. In Log Analytics, first the positive control (it must count more than 0; if 0, logs go elsewhere: stop and ask), then the alerts:

  ```kusto
  ContainerAppConsoleLogs_CL | where ContainerAppName_s == "ca-craves-auth-prod" and TimeGenerated > ago(1h) | count
  ```

  ```kusto
  ContainerAppConsoleLogs_CL
  | where ContainerAppName_s == "ca-craves-auth-prod" and Log_s contains "CRAVES_ALERT alert=ACCOUNT_DELETION_"
  | project TimeGenerated, Log_s
  | order by TimeGenerated desc
  ```

- **What auth holds:** `python3 "$D/scripts/account-deletion/preflight.py"` (read only, any time).
- **Gateway route:** `scripts/apim/configure-admin-account-deletions-apim.sh`; its header has the undo line.
- **Advanced's deploy:** `infra/advanced-features/provision.sh app <commit>`.
