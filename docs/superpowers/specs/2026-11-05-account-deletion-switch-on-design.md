# Account deletion 5/5: switching it on in production - design

Date: 5 Nov 2026. Status: for owner approval (builder-checked).
Parent spec: `docs/superpowers/specs/2026-11-03-account-deletion-design.md`.
Notes carried from earlier plans: `docs/superpowers/plans/2026-11-03-account-erasure-followups.md` ("Notes for plan 5") and `docs/superpowers/plans/2026-11-04-account-deletion-coordinator-followups.md` ("Notes for plan 3 (app), plan 4 (web/admin) and plan 5").

## Intent

Google Play requires that a person can delete their Craves account in the app and on the web, and that the deletion really happens. Plans 1-4 built every piece and merged them with the server switches off:

- plan 1 (#611): the 8 services' internal erase endpoints;
- plan 2 (#612): auth-service's coordinator;
- plan 3 (#615): the app screens;
- plan 4 (#617): the website and the admin page.

Plan 5 turns it on in production safely, and proves on a test account that a real erase works end to end.

## Goals

- `CRAVES_ACCOUNT_DELETION_ENABLED` and `CRAVES_ACCOUNT_DELETION_WORKER_ENABLED` are on in auth-service, with all 8 service addresses and credentials set.
- Staff can use `admin.craves.in` → Deletion requests: `/api/v1/admin/account-deletions` is published at the gateway.
- A test account asks for deletion on switch-on day, before any real person. Its erase on day 30 is the first erase that ever runs, and it is watched.
- Every production step is written down in the repo, reviewed in a PR, and has a rollback.

## Non-goals

- Shortening the 30-day wait, or editing any database row by hand. The owner chose to let the test account's own request run its 30 days.
- Turning on the referral forfeit switch (`CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED`). It stays off until finance approves a forfeiture account. See "Open for the owner".
- Plan 2b scrubs (chef pickup in events/Pidge, meal-plan provider ids, Cashfree expiry), the app release (PR #599) and the Play submission itself.
- The rider app, and any change to the old subscription 721906c9 or the root `azure-pipelines-*.yml` files.

## Anti-goals

- A real person's erase runs before the test account's.
- A secret value printed in a log, a terminal transcript, the repo or chat.
- A script that flips feature switches. The repo forbids it (`docs/advanced-features/PLAYBOOK.md:77`): switches are flipped by the owner by hand.
- A switch flip that takes auth-service down. auth refuses to start without its full config, and traffic is pinned to a named revision, so a bad revision never serves. The runbook must keep traffic on the old revision until the new one is healthy.
- Changing other services' data before connectivity is proven. The worker stays off until the read-only blockers calls show all 8 services answer.

## Constraints (facts found 5 Nov)

- **Production names:** subscription 34eefd95; one resource group per feature, `rg-craves-<feature>-prod`; apps `ca-craves-<feature>-prod`; APIM `apim-craves-prod-34eefd` (its resource group is not in the docs, so look it up). Source: `docs/runbooks/production-environment.md`, `AGENTS.md`.
- **App settings are set by hand:** `az containerapp update --set-env-vars` in Cloud Shell, with secrets as `secretref:<app secret>` backed by the app's Key Vault. A merge to main only releases a new image and leaves settings alone (`docs/riders/GO-LIVE.md` §8).
- **Revisions:** traffic is pinned to a named revision. A settings change makes a new revision with no traffic until the owner moves traffic to it.
- **auth start-up guard** (`AccountDeletionProperties.java:36-65`): with either switch on, auth refuses to start unless all of these are set:
  - 8 base URLs, each a bare https origin;
  - 7 credentials;
  - `CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64`, base64 of at least 32 bytes.
- **Credential per target service**, from the plan 1 matrix (`account-erasure-followups.md` "Notes for plan 5"):
  - `CRAVES_INTERNAL_SERVICE_KEY` for order, integration and notification;
  - `CRAVES_INTERNAL_SERVICE_SECRET` for subscription, user-chef, catalog and advanced;
  - referral checks an HMAC with source `auth` (`CRAVES_REFERRALS_AUTH_HMAC_BASE64`).
  - One shared internal value is expected across services (`GO-LIVE.md:48-54`), and auth already holds it as `CRAVES_INTERNAL_SERVICE_SECRET`.
- **Advanced has no internal secret set** (`infra/advanced-features/provision.sh:259-268`), so its erase endpoints answer 503 until one is set.
  - Advanced is deployed with `provision.sh app <sha>`, which rewrites the whole app from YAML with a fixed env and secrets list. A setting added by hand would be wiped on its next deploy.
  - That YAML sets `latestRevision: true`, so advanced's traffic follows its latest revision (not pinned).
- **The release template is not in this repo** (`templates/release.yml` in craves-pipelines), so it is unknown which revision `release-auth` copies settings from. It could copy a revision that has not taken traffic, or one that was rolled back from by moving traffic only.
- **Signed-call enforcement:** auth's erase client sends unsigned calls with only the credential header. `InternalCallFilter` checks allowed callers only on signed calls. An unsigned call to a path listed in `CRAVES_INTERNAL_AUTH_ENFORCED_PATHS` gets 401 (`order-service .../InternalCallFilter.java:96-102`). The default list is empty, and the live value is unknown.
- **The shared value is unproven for catalog and subscription.** `GO-LIVE.md:48-52` names order, integration, notification, user-chef and auth, not catalog or subscription. Key Vaults are IP-locked, so values cannot be compared from Cloud Shell.
- **Referral has two apps:** `ca-craves-referral-prod` and `ca-craves-referral-members-prod`. The one that serves `/internal/v1/account-erasure` holds `CRAVES_REFERRALS_AUTH_HMAC_BASE64`.
- **auth has no Spring Boot context test today.** `admin-session-ci.yml` already runs auth's tests against a Postgres service.
- **Allowed callers:** every InternalCallFilter service's default `CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS` already includes `/internal/v1/account-erasure/**=auth`, and notification's includes `auth` on `/internal/v1/notifications`. No deploy file overrides them, but Azure may, so the preflight checks the live value.
- **Base URL form:** `https://<ingress fqdn>`. Catalog's existing callers use the public APIM address, so auth needs catalog's own app address.
- **Unproven network path:** each feature has its own network and ingress allow-list. Nothing proves auth can reach the other 7 apps. The first blockers call shows it.
- **When a request reaches other services:**
  - The request itself inserts PREPARE steps and sends a notice through notification-service; the worker carries out PREPARE.
  - Approve and the admin detail page call all 8 services' blockers endpoints. These calls are read-only.
- **Referral forfeit off:** a whole-account request from someone with referral credit left waits on `FORFEIT_AWAITING_FINANCE` and does not erase (`referral/erasure/AccountErasureService.java:57-77`).
- **Customer route already live:** `/api/v1/auth/me/deletion` already reaches auth at the gateway (401 `AUTHENTICATION_REQUIRED` without a token). Only `/api/v1/admin/account-deletions` returns the gateway's 404.

## Approaches

**A. Small reviewed PR, then the owner runs the steps.** The owner picked this one.
- The PR adds:
  - a gateway script for the admin route;
  - a read-only preflight;
  - an auth start-up test;
  - the referral forfeit line in the referral deploy file;
  - a runbook.
- The owner then sets secrets and settings and flips the switches by hand.
- It costs one PR before switch-on. In return every production step is written down and reviewed, and the repo stops pointing at old names.

**B. One script that sets everything when CONFIRM=true.** Rejected:
- the repo forbids scripted switch flips;
- a script that handles secrets risks printing them.

**C. Cloud Shell steps only, no PR.** Rejected:
- it is fastest, but nothing records what production holds;
- the start-up guard stays untested in CI.

## The design

### Repo PR (one branch, `feat/account-deletion-switch-on`)

1. **Admin gateway script**
   - Files: `scripts/apim/configure-admin-account-deletions-apim.sh` plus `infra/apim/admin-account-deletions/authenticated-policy.xml`.
   - Model it on `scripts/apim/configure-admin-reviews-apim.sh`:
     - explicit rewrite-uri;
     - a real parent-shadow check;
     - `CONFIRM_APIM_WRITE=true` gate, and `DRY_RUN=true`;
     - 401 probes that retry for 2 minutes.
   - API `craves-admin-account-deletions-v1`, path `api/v1/admin/account-deletions`, backend auth's app address plus the same path. Four operations:
     - `GET /`;
     - `GET /{requestId}`;
     - `POST /{requestId}/approve`;
     - `POST /{requestId}/reject`.
   - The gateway must let a call run at least 30 s. Approve and detail wait up to 25 s for the 8 services, and the website's admin routes allow 25 s.
   - Defaults are the new names: `ca-craves-auth-prod` in `rg-craves-auth-prod`, and APIM `apim-craves-prod-34eefd`, whose resource group the script looks up.
2. **Read-only preflight**
   - File: `scripts/account-deletion/preflight.py`, in the style of `scripts/riders/rider_pilot_runtime.py --stage status`.
   - For auth and each of the 8 target apps it reports:
     - running state;
     - latest, ready and traffic revision;
     - ingress fqdn, and whether ingress is external or internal;
     - whether ingress IP restrictions exist;
     - for each required setting, whether it is set, as a plain value or a `secretref` name. It never prints a secret value.
     - the live `CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS` and `CRAVES_INTERNAL_AUTH_ENFORCED_PATHS` values, if set. If an enforced path covers `/internal/v1/account-erasure`, the preflight says STOP: plan 5 halts, because auth would need to sign its calls (a code change);
     - for the two referral apps, which one holds `CRAVES_REFERRALS_AUTH_HMAC_BASE64`. That app is the referral target;
     - whether each target's ingress restrictions allow auth's outbound address (listed in `docs/runbooks/production-environment.md`).
   - For auth it also prints:
     - the deletion settings: present, or missing;
     - the 8 suggested base URLs;
     - the exact `az containerapp update` lines still needed, with secret values left as `secretref:` placeholders.
   - It only runs `az ... show/list`.
   - It gets unit tests like `test_rider_pilot_runtime.py`, with canned `az` JSON.
3. **auth start-up test:** a Spring Boot context test in auth-service, closing the coordinator note "no CI job boots it".
   - With both switches on, 8 https base URLs, 7 credentials and a 32-byte base64 HMAC, the context starts.
   - With one base URL missing, it refuses to start, naming the missing setting.
   - auth has no context test yet. The builder picks how it gets a database: the Postgres service `admin-session-ci.yml` already uses, or test config that keeps the context off the database.
4. **Referral deploy file:** add `CRAVES_REFERRAL_ERASURE_FORFEIT_ENABLED: 'false'` beside the other `CRAVES_REFERRALS_*` switches in `services/referral-service/deploy/main.bicep`.
5. **Runbook:** `docs/runbooks/account-deletion-switch-on.md`, the ordered production steps below with exact commands, each step's check, and the rollback.
6. **Advanced internal secret in `infra/advanced-features/provision.sh`:**
   - add a Key Vault-backed app secret `internal-service-secret` pointing at Key Vault secret `craves-internal-service-secret` in advanced's vault;
   - add env `CRAVES_INTERNAL_SERVICE_SECRET` with secretRef `internal-service-secret`;
   - so the documented deploy keeps the secret instead of wiping it.

The owner follows the runbook, `docs/runbooks/account-deletion-switch-on.md`, with exact commands; "Production steps" below is its outline.

### Production steps (the owner runs them, in order)

1. **Preflight:** run it read-only and fix anything it reports missing.
2. **Advanced service:**
   - store the shared internal value in advanced's Key Vault as `craves-internal-service-secret`, without echoing it;
   - re-run `provision.sh app <sha advanced runs now>`, which now carries the secret. Advanced's traffic follows the new revision by itself;
   - check advanced's erase endpoint stops answering 503: 401 for a wrong credential is expected.
   - Confirm order, integration, notification, subscription, user-chef and catalog already hold their key or secret (preflight).
3. **auth settings, switches still off:**
   - set the 8 base URLs;
   - set the 7 credentials as `secretref:` to auth's existing internal-secret app secret;
   - set `CRAVES_ACCOUNT_DELETION_REFERRAL_HMAC_BASE64` as a `secretref:` to the secret referral checks for source `auth`.
   - Move traffic once healthy. Nothing changes for anyone yet.
4. **Admin gateway route:** run the script, and wait until its 401 probes pass.
5. **Turn on requests, worker off:**
   - set `CRAVES_ACCOUNT_DELETION_ENABLED=true` and leave `_WORKER_ENABLED=false`;
   - move traffic once healthy;
   - the app and the website now show Delete account.
6. **Test account, same hour:**
   - The owner signs in on the phone with the test number and asks for deletion: Delete account, then whole account.
   - On `admin.craves.in` → Deletion requests, the owner opens it. The detail page calls all 8 services. Any `SERVICE_UNREACHABLE` must be fixed before going on, and auth's log names the status code for that service:
     - **401/403 means a credential mismatch** (most likely catalog or subscription holding a different value). Give auth a separate app secret for that target, pointing at the target's own value, and point that target's `_CREDENTIAL` at it.
     - **Timeout or connection refused means the network.** Add an ingress allow rule for auth's outbound address on that target. Rollback: remove the rule.
   - Tap **Keep my account**. This proves keep and release.
   - Ask again. This request stays open to day 30.
7. **Turn on the worker:**
   - set `CRAVES_ACCOUNT_DELETION_WORKER_ENABLED=true` and move traffic;
   - the test request's PREPARE steps run;
   - check that the admin detail shows them done.
8. **Day 23:** the test account gets the 7-day reminder.
9. **Day 30:** the test account is erased.
   - Check the admin detail, which should show COMPLETED.
   - Check that the phone number can sign up fresh.
   - Check that the services' erase counts are in the step records.
   - Record the result in the runbook.

**Rollback at any step:**
- set the switch back to `false` and move traffic. Open requests stay in the database and nothing is erased while the worker is off.
- Never roll back by moving traffic alone: a later release could copy settings from the revision you moved away from.
- Deactivate every active auth revision except the one just moved to (a 0-traffic active revision still runs the worker).
- For the gateway route, delete the API `craves-admin-account-deletions-v1`.

**Merge freeze:** no merge that touches `services/auth-service` from step 3 until step 7 is done (about one day). It's unknown which revision `release-auth` copies, so a release mid-way could ship half-set settings.

## Left to the builder

- Script internals: bash or Python, how the APIM resource group is looked up, retry timing.
- Exactly which `az` fields the preflight reads to detect ingress restrictions.
- How the auth context test supplies its database (whatever auth's existing context tests use).
- Runbook wording and layout.

## Calls made in review (Claude's, for the owner to check)

- **Advanced:** its secret goes into `provision.sh`, not set by hand, because the documented deploy would wipe a hand-set one.
- **Rollback:** always by switching the setting off, never by moving traffic alone. auth-service merges freeze for about a day during switch-on, because the release template can't be checked from this repo.
- **Enforced paths:** if signed calls are enforced on the erase paths, the preflight stops plan 5 instead of working around it.
- **Shared value:** catalog's and subscription's values are proven at step 6 by the read-only detail call, not by reading Key Vaults. The fix paths are written into the runbook.
- **Network:** an ingress allow rule for auth, if one is needed, is a conditional runbook step with its own rollback.
- **Referral target:** whichever referral app holds the auth HMAC; the preflight picks it.

## Owner answers (5 Nov)

- **Referral forfeit stays off for launch.** A customer with referral credit left waits on `FORFEIT_AWAITING_FINANCE` until finance acts. Staff see it as blocked, and the alert fires.
- **Test account:** a spare number the owner controls, customer-only, with at least one past order, so the order and payment scrubs run. The owner signs in. It is erased for good on day 30.
