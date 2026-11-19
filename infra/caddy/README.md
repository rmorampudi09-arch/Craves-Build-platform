# Caddy gateway: fix program routes

Production runs one Caddy container (`craves-caddy-1`, stock `caddy:2.10`) with `/etc/caddy/Caddyfile`. `fix-program.caddy` adds, in the house style (one named matcher per operation, `method` + case-insensitive `path_regexp` with an optional trailing slash, `import to integration:8080`):

| Matcher | Route | Gateway rule (as in APIM) |
|---|---|---|
| `@fix_courier_webhook_borzo` | `POST /api/v1/webhooks/delivery/borzo` | body over 262144 bytes is 413, else forwarded unchanged (`infra/apim/courier-webhooks/policy.xml`) |
| `@fix_courier_webhook_pidge` | `POST /api/v1/webhooks/delivery/pidge` | the same |
| `@fix_rider_offer_rang` | `POST /api/v1/rider/offers/{offerId}/rang` (PR #697) | Bearer header or a non-empty `X-Craves-Shift-Credential`, else 401; credential passed through; 16384-byte cap; `private, no-store`, `nosniff` (`infra/apim/rider-fleet/location-policy.xml`) |
| `@fix_admin_fleet_courier_billing_*` (5) | `GET /settings`, `PUT /settings/{courier}`, `GET /invoices`, `POST /invoices`, `GET /invoices/{importId}` under `/api/v1/admin/fleet/courier-billing` (PR #708) | Bearer header, else 401; shift credential dropped; `no-store, no-cache, must-revalidate`, `Pragma: no-cache`, `nosniff`, `X-Frame-Options: DENY` (`infra/apim/rider-fleet/admin-policy.xml`). `POST /invoices` only: body over 1048576 bytes is 413 (the service takes a CSV of up to 512,000 characters, `CourierBilling.MAX_CHARS`, inside JSON; 1 MiB leaves room for its escaping). APIM has no cap here |

Paths and methods come from the controllers (`BorzoWebhookController`, `PidgeWebhookController`, `FleetRingReceiptController`, `CourierBillingController`), `contracts/openapi/rider-v1.yaml`, `contracts/openapi/admin-fleet-v1.yaml` and `infra/apim/*/routes.txt`. The backend stays authoritative for the JWT, roles and the shift credential; the ring receipt and courier billing routes exist only while their flags are on (they stay off), otherwise integration answers 401/404 as it does today.

## Placement (why it is unambiguous)

Caddy sorts `handle` blocks that use named matchers in the order they appear in the Caddyfile, and the first one that matches wins ([directive sorting](https://caddyserver.com/docs/caddyfile/directives#sorting-algorithm); only single-path matchers are reordered by specificity). So the fix routes must come before `handle @op456` (the `^/api/v1/webhooks/.*` catch-all). Two lines:

1. Immediately above the line `(api_routes) {`: `import fix-program.caddy` (defines the snippets; they must exist before `(api_routes)` is imported).
2. As the first line inside `(api_routes) {`: `import fix_program`.

The fix routes are then the first `handle` blocks in `(api_routes)`. They only match requests that today hit the catch-all (`POST` borzo/pidge) or no route at all, so no existing route changes. Do not put the file under `sites/`: `import sites/*.caddy` would load it at the top level.

## Apply on the VM (by hand)

Costs nothing: it is a config file and a `caddy reload` in the running container, and it is reverted by reloading the previous file.

1. See where `/etc/caddy` comes from: `docker inspect craves-caddy-1 --format '{{json .Mounts}}'`. If the directory is a bind mount, copy `fix-program.caddy` next to the Caddyfile on the host. If only the Caddyfile file is mounted, the new file needs its own mount (a compose change and a Caddy restart): stop and plan that separately.
2. Confirm the production `(to)` snippet sets `X-Azure-SocketIP`, `X-Azure-ClientIP` and `X-Azure-FDID` with `header_up <Name> <value>` inside `reverse_proxy`, as `test/Caddyfile` does. That form replaces any value the client sent (the test checks it). If it adds (`header_up +Name`) or sets them some other way, a client could pass its own values to integration: stop and fix `(to)` first.
3. Back up the Caddyfile (`cp Caddyfile Caddyfile.before-fix-$(date +%Y%m%d%H%M)`), add the two lines above.
4. `docker exec craves-caddy-1 caddy validate --config /etc/caddy/Caddyfile` must print `Valid configuration`.
5. Order check, for **all** new routes. This prints every path matcher in the order Caddy tries them (needs `jq` on the VM):

   ```bash
   docker exec craves-caddy-1 caddy adapt --config /etc/caddy/Caddyfile 2>/dev/null \
     | jq -r '.. | objects | select(has("match")) | .match[] | (.path_regexp | select(.) | "\(.name) \(.pattern)") // ((.path // empty) | "path " + join(" "))' \
     | grep -n -i -E 'webhooks|/rider|/admin|^path '
   ```

   The eight `fix_` lines must come before every line that could match the same requests: `op456` (`^/api/v1/webhooks/.*`), and any broad pattern or `path` line for `/api/v1/webhooks`, `/api/v1/rider` or `/api/v1/admin`. Lines for other, unrelated paths may come first. Watch for `path` lines: a `handle` with an inline path matcher (`handle /api/v1/webhooks/* {`) is sorted ahead of every named matcher, wherever it is in the file, so it would take these requests before the fix routes. If one does, stop: the fix routes cannot win over it without changing that block.
6. `docker exec craves-caddy-1 caddy reload --config /etc/caddy/Caddyfile` (graceful; a rejected config leaves the running one in place).
7. Check: an unauthenticated `GET /api/v1/admin/fleet/courier-billing/settings` is 401 from Caddy; the next real Borzo and Pidge callbacks are stored as before (`delivery_webhook_inbox` keeps growing).

Roll back: restore the saved Caddyfile and run step 6 again.

## What Caddy does not do here

- **No rate limiting.** Stock `caddy:2.10` has no rate-limit handler, so APIM's `rate-limit-by-key` (300 calls per 60 s per caller on the courier webhooks) and `limit-concurrency` (2 calls in flight per shift on the ring receipt) have no equivalent. It would need a custom Caddy image built with `xcaddy build --with github.com/mholt/caddy-ratelimit` (a third-party module) and swapped into the compose file. Not built; the gap is open. It can be built on the VM and kept in its local image store at no Azure cost (as in `docs/runbooks/deploy-vm.md`); pushing it to a registry would add storage cost.
- **Correlation id.** APIM's admin policy copies `X-Craves-Correlation-ID`, else `X-Correlation-ID`, else its request id, into `X-Correlation-ID` both ways. Not reproduced; integration sets its own when none is sent.
- **Backend timeouts** per policy (20 s, 30 s): `(to)` keeps its own defaults.
- **Byte counting** is the same as APIM (bytes, not characters). A chunked body without `Content-Length` is cut at the limit and also gets 413.

## Test

`bash infra/caddy/test/run-test.sh` (Docker, curl and jq) runs `caddy:2.10` with `test/Caddyfile`, a copy of the house structure (`(to)`, `(api_routes)` with a sample `@op21` and the `@op456` catch-all, this file placed as above), and a stand-in `integration:8080` that reads and echoes the body. It runs `caddy validate`, checks the route order with the step 5 command, then checks every route: over-size bodies 413, normal ones reach the upstream, other webhook paths still use the catch-all, each new route reaches the upstream with the path it should (from the upstream's echo) and the right headers, client-sent `X-Azure-FDID`/`X-Azure-ClientIP` are replaced, a missing, empty or whitespace-only credential gets 401, and an encoded dot segment (`/api/v1/rider/offers/%252e%252e/rang`) does not reach integration as the ring receipt. It listens on loopback only. It removes its own containers and network on exit.
