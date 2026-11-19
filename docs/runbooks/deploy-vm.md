# Deploy one service to the production VM (manual)

**Costs: following this checklist adds no Azure cost.** It builds on the VM, keeps the image in the VM's local Docker store and writes backups to the VM's own disk. Nothing here creates, scales or bills an Azure resource.

Since 17 Nov 2026 production runs as Docker containers on one VM, from `/opt/craves/compose.json` (project `craves`, containers `craves-<service>-1`, network `craves`). No pipeline reaches the VM: every deploy is this checklist, by hand, one service at a time. Integration is the first; the steps are the same for the other Java services (change the service name, its database and its health URL).

Rules that still apply (`AGENTS.md`, `docs/runbooks/live-runtime-safety.md`): deploy only a commit on GitHub `main`; never edit a lock file or a Flyway migration to get a deploy through; never use the old subscription, org or registries.

**Run the whole checklist in one shell on the VM**, starting with `umask 077`: the compose file and the dumps hold secrets, so everything this checklist writes is private (mode 600) and stays in `/opt/craves/backup/deploy/` (mode 700). The steps set `SHA`, `TAG`, `IMAGE`, `STAMP`, `BK`, `PREV` and `DB`, and every block stops at once if one it needs is missing. If you open a new shell, run `umask 077` and set them again; `BK=/opt/craves/backup/deploy`, and `STAMP` is the stamp in the names of the files written there (for example `running-20261120T0230Z.txt`).

`/opt/craves/images.txt` does **not** match what runs (for example it lists voice `d6e77ecfe4fe` while `pr699-033da19` runs). Trust only `docker ps` and `compose.json`.

## 0. Pick the commit

The required check runs on pull requests, not on `main`: a commit on `main` (a squash merge) never has a check run of its own. So check the pull request it came from, and that `main` holds exactly the code that was tested. Do this on any machine with `git` and `gh`; the VM needs neither.

1. Choose a commit `SHA` on `main`. Its title ends with the pull request number, `(#NNN)`.
2. Find that pull request's last head commit (`HEAD_SHA`) and check its required check:

```bash
git fetch origin main && git merge-base --is-ancestor "$SHA" origin/main && echo "on main"
HEAD_SHA=$(gh api "repos/rmorampudi09-arch/Craves-Build-platform/pulls/<NNN>" --jq .head.sha)
gh api --method GET "repos/rmorampudi09-arch/Craves-Build-platform/commits/$HEAD_SHA/check-runs" \
  -f check_name='Exact-SHA complete regression evidence' --jq '[.check_runs[]] | max_by(.started_at) | .conclusion'
git fetch origin "$HEAD_SHA" && [ "$(git rev-parse "$SHA^{tree}")" = "$(git rev-parse "$HEAD_SHA^{tree}")" ] && echo "same code as tested"
```

The check must print `success` and the last line `same code as tested`. Anything else: stop.

3. `TAG=$(git rev-parse --short=12 "$SHA")`. Image tags are the 12-character commit. Set `SHA` and `TAG` in the VM shell too.

## 1. Record what runs now (before anything else)

On the VM:

```bash
umask 077
: "${SHA:?set SHA first}" "${TAG:?set TAG first}"
IMAGE="cravesacr34eefd.azurecr.io/craves/integration-service:$TAG"
STAMP=$(date -u +%Y%m%dT%H%MZ)
BK=/opt/craves/backup/deploy
mkdir -p -m 700 "$BK"
cd /opt/craves
docker ps --format '{{.Names}} {{.Image}}' | sort | tee "$BK/running-$STAMP.txt"
jq '.services.integration' compose.json > "$BK/integration-entry-$STAMP.json"     # holds secrets: never print it
PREV=$(jq -r '.services.integration.image' compose.json); echo "PREV=$PREV"     # what you will roll back to
```

Write down `PREV` (today `cravesacr34eefd.azurecr.io/craves/integration-service:66157cfe45d7`, PR #658 of 14 Nov). If `docker ps` and `compose.json` disagree for integration, stop and find out why first.

## 2. Know which migrations will run

Flyway runs when the service starts (`baseline-on-migrate`, history in `payment_schema.flyway_schema_history`), before any request, and **a migration cannot be undone**. List what the new commit adds over what runs:

```bash
git diff --name-only --diff-filter=A <PREV commit> "$SHA" -- services/integration-service/src/main/resources/db/migration
```

From #658 (`66157cfe4`, last migration V190) to `main` on 19 Nov (`cc047f23c`), integration applies nine:

| Version | File |
|---|---|
| V191 | `courier_booking_journal` |
| V192 | `dispatch_policy_notice_covers_every_rule` |
| V193 | `provider_create_attempt_provider_ref_index` |
| V194 | `webhook_first_tracking_and_provider_api_usage` |
| V195 | `provider_breaker` |
| V196 | `courier_breaker_order_and_handoff_pidge_try` |
| V197 | `fleet_stage_next_match_at` |
| V198 | `dispatch_policy_search_rings` |
| V199 | `courier_charge_and_invoice_import` |

They touch `delivery_schema` (most), `fleet_schema` and `payment_schema`. Read each one before the first deploy that carries it: a long lock on a busy table stops webhooks and orders for that long.

## 3. Get an image for the commit (no Azure cost)

The image is built from `services/integration-service/Dockerfile` with that folder as context (Maven runs inside the build; tests are skipped there because the required check already ran them), as `azure-pipelines-integration-service.yml` did. Do not run that YAML: it targets the old org. Do not use `az acr build`: ACR Tasks bill build time.

The image stays in the VM's local Docker store; compose uses a local image when the tag is present. It is named with the same repository as today, so in `compose.json` only the tag changes: `IMAGE=cravesacr34eefd.azurecr.io/craves/integration-service:$TAG`. That tag exists **only on the VM**, not in the registry, so never `docker compose pull` this service (it would fail with "not found"; nothing breaks, but nothing is pulled) and never remove the image (`docker image rm`, `docker image prune -a`) while it runs or is the rollback target. Build once per commit; if `docker image inspect "$IMAGE"` already succeeds, skip the build.

**(a) Build on the VM. Recommended:** no Azure cost, no transfer, and the build comes straight from the commit on `main` where it will run. It uses the VM's CPU, memory and disk while it runs (several minutes of Maven) and can slow production meanwhile, so do it off-peak and check room first:

```bash
: "${SHA:?set SHA first}" "${IMAGE:?set IMAGE first (step 1)}"
free -m; df -h / /var/lib/docker          # if free memory is under about 2 GB, or disk is short, use (b)
D=$(mktemp -d) && git clone -q https://github.com/rmorampudi09-arch/Craves-Build-platform "$D" && git -C "$D" checkout -q "$SHA"
docker build --pull -t "$IMAGE" "$D/services/integration-service"
docker image inspect "$IMAGE" --format '{{.Id}} {{.Created}}' && rm -rf "$D"
docker builder prune -f                   # frees the build cache only; images are kept
```

**(b) Build on a developer machine, copy over SSH:** no Azure cost (data sent into Azure is not billed) and no load on the VM, but the image is only as trustworthy as that machine's checkout, so build from a clean clone of `$SHA`. Match the VM's CPU type (`uname -m` on the VM; `x86_64` means `--platform linux/amd64`):

```bash
: "${IMAGE:?set IMAGE as in step 1}" "${D:?set D to the clean clone of SHA}"
docker build --pull --platform linux/amd64 -t "$IMAGE" "$D/services/integration-service"
docker save "$IMAGE" | gzip | ssh <VM_USER>@<VM_HOST> 'gunzip | docker load'
```

**(c) GitHub Actions:** building is free for this public repository, but the image then has to be stored somewhere the VM can pull from. Pushing to Azure Container Registry adds the stored image size to its bill. GitHub Container Registry is free for public images, but that makes the image public. Either is an owner decision; no workflow for this exists or is added here.

## 4. Back up the database (just before)

For integration the database is `craves_integration_db` and the admin role `postgres` (`docs/runbooks/production-environment.md`); the nightly dump in `/opt/craves/backup/nightly/` is up to a day old, so take this fresh one too. Confirm the database name from its compose entry. Never print the JDBC URL or the environment: the command below prints only the name after the last `/`:

```bash
umask 077
: "${STAMP:?set STAMP first (step 1)}" "${TAG:?set TAG first}" "${BK:?set BK=/opt/craves/backup/deploy}"
jq -r '.services.integration.environment.SPRING_DATASOURCE_URL // empty' /opt/craves/compose.json | sed 's#.*/##; s/?.*//'
DB=craves_integration_db          # must equal the name printed above (nothing printed: the URL is in an env_file; check there the same way)
df -h /opt/craves                 # room for the dump
docker compose -f /opt/craves/compose.json exec -T postgres pg_dump -U postgres -Fc -d "$DB" > "$BK/integration-$DB-$STAMP-before-$TAG.dump"
ls -l "$BK/integration-$DB-$STAMP-before-$TAG.dump"     # -rw------- and not empty
docker compose -f /opt/craves/compose.json exec -T postgres pg_restore -l < "$BK/integration-$DB-$STAMP-before-$TAG.dump" | head -5
```

The dump must be non-empty, mode 600, and `pg_restore -l` must list it. Take it immediately before step 6: anything written after it is not in it.

## 5. Change only the tag

```bash
umask 077
: "${STAMP:?set STAMP first (step 1)}" "${TAG:?set TAG first}" "${BK:?set BK=/opt/craves/backup/deploy}"
cp /opt/craves/compose.json "$BK/compose-$STAMP.json" && chmod 600 "$BK/compose-$STAMP.json"
jq --arg t "$TAG" '.services.integration.image |= sub(":[^:/]+$"; ":" + $t)' /opt/craves/compose.json > "$BK/compose-$STAMP.new.json"
diff <(jq -r '.services[].image' /opt/craves/compose.json) <(jq -r '.services[].image' "$BK/compose-$STAMP.new.json")   # only the integration image
cmp <(jq -S 'del(.services.integration.image)' /opt/craves/compose.json) <(jq -S 'del(.services.integration.image)' "$BK/compose-$STAMP.new.json") && echo "nothing else changed"
cp "$BK/compose-$STAMP.new.json" /opt/craves/compose.json && rm -f "$BK/compose-$STAMP.new.json"
docker compose -f /opt/craves/compose.json config --quiet && echo "compose ok"
```

The two checks compare images only and then the rest without printing it, so no secret reaches the screen. `cp` onto the existing `compose.json` keeps that file's owner and mode.

Compose reads a JSON file with `-f` as it reads YAML; the project name `craves` comes from the folder, so always use this exact path (or `-p craves`).

## 6. Start

```bash
: "${IMAGE:?set IMAGE first (step 1)}"
docker image inspect "$IMAGE" --format '{{.Id}}'      # must succeed: the image is already local (step 3)
docker compose -f /opt/craves/compose.json up -d --no-deps integration
```

No `pull`: the image is local (step 3), so the gap is only the start. (Only if the new tag really is in the registry would `docker compose -f /opt/craves/compose.json pull integration` come first.) `up -d` replaces the container: unlike Container Apps, **nothing keeps the old version serving**, so integration (webhooks, delivery, fleet) is down until the new one is ready. Pick a quiet time. `--no-deps` leaves `postgres` and every other service alone.

## 7. Watch it start

```bash
docker logs -f --since 10m craves-integration-1 2>&1 | grep -E 'LIVE_RUNTIME_LOCK|Flyway|Migrating schema|Successfully applied|Started .*Application|ERROR'
```

- `LIVE_RUNTIME_LOCK: refusing to start …`: the build lacks code production runs. It stops before Flyway, so the database is untouched. Roll back (step 9) and restore the missing code on `main`; never edit the lock file.
- Flyway prints each `Migrating schema … to version "191 - …"` and then `Successfully applied 9 migrations`. A failed migration stops the start: roll back, and the database needs the dump (step 9).
- Then `Started …Application`.

## 8. Check health and record

```bash
: "${PREV:?}" "${TAG:?}" "${SHA:?}" "${STAMP:?}" "${DB:?}" "${BK:?}"
docker exec craves-caddy-1 wget -qO- http://integration:8080/actuator/health/readiness; echo
docker exec craves-caddy-1 wget -qO- http://integration:8080/actuator/health/liveness; echo
docker ps --format '{{.Names}} {{.Image}}' | grep integration
echo "$(date -u +%FT%TZ) integration $PREV -> $TAG ($SHA) dump integration-$DB-$STAMP-before-$TAG.dump" >> "$BK/deploy-log.txt"
```

Both health calls must return `{"status":"UP"}` (the actuator health URLs are open without a token; everything else needs one). Then watch for 15 minutes: the next Borzo and Pidge callbacks are stored (`delivery_webhook_inbox` grows), orders get couriers as before, and `docker ps` shows the container not restarting.

## 9. Roll back

**Code only** (the usual case; migrations are additive and the previous build ignores versions it does not know):

This works from a new shell too: set `STAMP` to the stamp of the backup step 5 made.

```bash
umask 077
BK=/opt/craves/backup/deploy
ls -t "$BK"/compose-*.json | head -3          # the newest compose-<STAMP>.json is the one from before the deploy
: "${STAMP:?set STAMP to the stamp in that file name}"
PREV=$(jq -r '.services.integration.image' "$BK/compose-$STAMP.json"); echo "PREV=$PREV"
docker image inspect "$PREV" --format '{{.Id}}'                   # must succeed: still in the local store
cp "$BK/compose-$STAMP.json" /opt/craves/compose.json
docker compose -f /opt/craves/compose.json up -d --no-deps integration
```

`PREV` is still in the local image store because it was running. Then step 8 with `PREV`, and a line in `deploy-log.txt`.

**Database too** (a migration failed half way, or the old build cannot run on the new schema): a migration cannot be reversed, so the only way back is the dump from step 4. Stop integration, restore only integration's schemas (`delivery_schema`, `fleet_schema`, `payment_schema`) from it with `pg_restore --clean -n …`, then start `PREV`. Everything integration wrote since the dump is lost (callbacks, bookings, fleet events), so decide this with the owner, never alone.

## Feature flags

Flags are environment variables in `.services.integration.environment` of `compose.json`. A change takes effect only after `docker compose -f /opt/craves/compose.json up -d --no-deps integration`, which restarts the service (same gap as step 6). Back up `compose.json` first, as in step 5.

The fix program's flags stay **off** on this deploy: do not add them. Absent means off, for example `CRAVES_FLEET_RING_RECEIPT_ENABLED`, `CRAVES_DELIVERY_COURIER_CHARGE_ENABLED`, `CRAVES_DELIVERY_COURIER_CANCEL_ENABLED`, `CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED`, `CRAVES_COURIER_BREAKER_ENABLED`, `CRAVES_FLEET_TIMERS`, `CRAVES_FLEET_POSTGIS_CANDIDATES`. Check after the start: `docker exec craves-integration-1 env | grep -E '^CRAVES_(FLEET|DELIVERY|COURIER)_.*(ENABLED|TIMERS|CANDIDATES)='`. The gateway routes for these features (`infra/caddy/README.md`) can go in first: while a flag is off the service answers 401/404 there.
