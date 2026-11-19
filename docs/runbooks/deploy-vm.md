# Deploy one service to the production VM (manual)

**Costs: following this checklist adds no Azure cost.** It builds on the VM, keeps the image in the VM's local Docker store and writes backups to the VM's own disk. Nothing here creates, scales or bills an Azure resource.

Since 17 Nov 2026 production runs as Docker containers on one VM, from `/opt/craves/compose.json` (project `craves`, containers `craves-<service>-1`, network `craves`). No pipeline reaches the VM: every deploy is this checklist, by hand, one service at a time. Integration is the first; the steps are the same for the other Java services (change the service name, its database and its health URL).

Rules that still apply (`AGENTS.md`, `docs/runbooks/live-runtime-safety.md`): deploy only a commit on GitHub `main`; never edit a lock file or a Flyway migration to get a deploy through; never use the old subscription, org or registries.

`/opt/craves/images.txt` does **not** match what runs (for example it lists voice `d6e77ecfe4fe` while `pr699-033da19` runs). Trust only `docker ps` and `compose.json`.

## 0. Pick the commit

1. Choose a commit `SHA` on `main` and check it:

```bash
git fetch origin main && git merge-base --is-ancestor "$SHA" origin/main && echo "on main"
gh api --method GET "repos/rmorampudi09-arch/Craves-Build-platform/commits/$SHA/check-runs" \
  -f check_name='Exact-SHA complete regression evidence' --jq '.check_runs[] | .conclusion'
```

The second command must print `success`. Anything else (empty, `failure`, `cancelled`): stop.

2. `TAG=$(git rev-parse --short=12 "$SHA")`. Image tags are the 12-character commit.

## 1. Record what runs now (before anything else)

On the VM:

```bash
cd /opt/craves
STAMP=$(date -u +%Y%m%dT%H%MZ)
docker ps --format '{{.Names}} {{.Image}}' | sort | tee "/opt/craves/backup/running-$STAMP.txt"
jq '.services.integration' compose.json > "/opt/craves/backup/integration-entry-$STAMP.json"
jq -r '.services.integration.image' compose.json      # PREV: what you will roll back to
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
free -m; df -h / /var/lib/docker          # if free memory is under about 2 GB, or disk is short, use (b)
D=$(mktemp -d) && git clone -q https://github.com/rmorampudi09-arch/Craves-Build-platform "$D" && git -C "$D" checkout -q "$SHA"
docker build --pull -t "$IMAGE" "$D/services/integration-service"
docker image inspect "$IMAGE" --format '{{.Id}} {{.Created}}' && rm -rf "$D"
docker builder prune -f                   # frees the build cache only; images are kept
```

**(b) Build on a developer machine, copy over SSH:** no Azure cost (data sent into Azure is not billed) and no load on the VM, but the image is only as trustworthy as that machine's checkout, so build from a clean clone of `$SHA`. Match the VM's CPU type (`uname -m` on the VM; `x86_64` means `--platform linux/amd64`):

```bash
docker build --pull --platform linux/amd64 -t "$IMAGE" "$D/services/integration-service"
docker save "$IMAGE" | gzip | ssh <VM_USER>@<VM_HOST> 'gunzip | docker load'
```

**(c) GitHub Actions:** building is free for this public repository, but the image then has to be stored somewhere the VM can pull from. Pushing to Azure Container Registry adds the stored image size to its bill. GitHub Container Registry is free for public images, but that makes the image public. Either is an owner decision; no workflow for this exists or is added here.

## 4. Back up the database (just before)

Find integration's database from its compose entry (the JDBC URL ends in `/<database>`; do not print passwords) and the Postgres user from the `postgres` service:

```bash
jq -r '.services.integration.environment.SPRING_DATASOURCE_URL // "see env_file"' compose.json
df -h /opt/craves     # room for the dump
mkdir -p /opt/craves/backup
docker compose -f /opt/craves/compose.json exec -T postgres pg_dump -U <PG_USER> -Fc -d <DATABASE> \
  > "/opt/craves/backup/integration-<DATABASE>-$STAMP-before-$TAG.dump"
docker compose -f /opt/craves/compose.json exec -T postgres pg_restore -l \
  < "/opt/craves/backup/integration-<DATABASE>-$STAMP-before-$TAG.dump" | head -5
```

The dump must be non-empty and `pg_restore -l` must list it. Take it immediately before step 6: anything written after it is not in it.

## 5. Change only the tag

```bash
cp /opt/craves/compose.json "/opt/craves/backup/compose-$STAMP.json"
jq --arg t "$TAG" '.services.integration.image |= sub(":[^:/]+$"; ":" + $t)' /opt/craves/compose.json > /tmp/compose.new.json
diff <(jq -S . /opt/craves/compose.json) <(jq -S . /tmp/compose.new.json)    # exactly one line: the integration image
cp /tmp/compose.new.json /opt/craves/compose.json
docker compose -f /opt/craves/compose.json config --quiet && echo "compose ok"
```

Compose reads a JSON file with `-f` as it reads YAML; the project name `craves` comes from the folder, so always use this exact path (or `-p craves`).

## 6. Start

```bash
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
docker exec craves-caddy-1 wget -qO- http://integration:8080/actuator/health/readiness; echo
docker exec craves-caddy-1 wget -qO- http://integration:8080/actuator/health/liveness; echo
docker ps --format '{{.Names}} {{.Image}}' | grep integration
echo "$(date -u +%FT%TZ) integration $PREV -> $TAG ($SHA) dump integration-<DATABASE>-$STAMP-before-$TAG.dump" >> /opt/craves/backup/deploy-log.txt
```

Both health calls must return `{"status":"UP"}` (the actuator health URLs are open without a token; everything else needs one). Then watch for 15 minutes: the next Borzo and Pidge callbacks are stored (`delivery_webhook_inbox` grows), orders get couriers as before, and `docker ps` shows the container not restarting.

## 9. Roll back

**Code only** (the usual case; migrations are additive and the previous build ignores versions it does not know):

```bash
cp "/opt/craves/backup/compose-$STAMP.json" /opt/craves/compose.json
docker compose -f /opt/craves/compose.json up -d --no-deps integration
```

`PREV` is still in the local image store (it was running); check with `docker image inspect "$PREV"` before you start. Then step 8 with `PREV`, and a line in `deploy-log.txt`.

**Database too** (a migration failed half way, or the old build cannot run on the new schema): a migration cannot be reversed, so the only way back is the dump from step 4. Stop integration, restore only integration's schemas (`delivery_schema`, `fleet_schema`, `payment_schema`) from it with `pg_restore --clean -n …`, then start `PREV`. Everything integration wrote since the dump is lost (callbacks, bookings, fleet events), so decide this with the owner, never alone.

## Feature flags

Flags are environment variables in `.services.integration.environment` of `compose.json`. A change takes effect only after `docker compose -f /opt/craves/compose.json up -d --no-deps integration`, which restarts the service (same gap as step 6). Back up `compose.json` first, as in step 5.

The fix program's flags stay **off** on this deploy: do not add them. Absent means off, for example `CRAVES_FLEET_RING_RECEIPT_ENABLED`, `CRAVES_DELIVERY_COURIER_CHARGE_ENABLED`, `CRAVES_DELIVERY_COURIER_CANCEL_ENABLED`, `CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED`, `CRAVES_COURIER_BREAKER_ENABLED`, `CRAVES_FLEET_TIMERS`, `CRAVES_FLEET_POSTGIS_CANDIDATES`. Check after the start: `docker exec craves-integration-1 env | grep -E '^CRAVES_(FLEET|DELIVERY|COURIER)_.*(ENABLED|TIMERS|CANDIDATES)='`. The gateway routes for these features (`infra/caddy/README.md`) can go in first: while a flag is off the service answers 401/404 there.
