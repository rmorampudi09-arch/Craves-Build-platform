# Craves web-only instant pilot launch

The private launch button opens the already deployed customer website. It does
not build or deploy on click. The public waiting page polls once per second and
reloads its current address after the state becomes open. No launch control is
added to customer navigation or the normal landing page.

## Authorized scope

- Only `ca-craves-web-prodlow` is deployed. Existing public Firebase build values,
  secret references, API endpoints, payments settings, resources, ingress,
  identity, and one-replica limits are preserved.
- No APK, mobile source/configuration, Spring service, APIM route/policy,
  customer, chef, order, subscription, payment, document or media record is changed.
- The separate admin website and its authentication are unchanged.
- New metadata lives only in the private `web-pilot-launch/state.json` blob in
  the existing `stcravesprodlowkmqgfy` account. The existing customer-web managed
  identity receives blob access scoped only to that new container.

## State and private control

`schema: 1`, `phase: open | waiting | launched`, and a UTC `updatedAt` are the
whole stored contract. Deployment requires `open` so preparation does not close
the working website. An Azure owner enables `waiting` only after verification.

The owner receives `/pilot-launch#key=<32-byte-random-base64url-key>` privately.
The key is not in source, server logs, query strings, HTML, customer navigation,
or browser persistent storage. The page removes the fragment from the address
bar and retains the key in memory. Reopening the original private link restores
access after a page reload. Whoever possesses the private link can launch;
this is a capability link, independent of Craves account login. Do not share it.

The server stores only the key's SHA256 and an expiry. A valid key reveals the
button; missing, wrong or expired keys receive HTTP 404. Launch requires an
exact same-origin JSON action, bounded to 256 bytes. It can only open access,
never close the website or modify a Craves business record. Conditional ETag
writes and read-back verification make repeated/concurrent clicks idempotent.
The UI reports success only after durable launch persistence is confirmed.

Legal pages, static assets, version/readiness routes and the launch control stay
available while waiting. HTML aliases and customer web APIs receive a private,
uncached HTTP 503. Existing authentication still protects business data.

The state is shared across processes and restarts. Reads coalesce for at most
500 ms. On a transient storage outage, the last observed state is retained. A
cold instance without a known state preserves the working website's availability
and allows access; status/control return unavailable and never claim successful
launch. This presentation gate is not a security boundary or admission policy.

## Required release evidence

`azure-pipelines-web-pilot-launch.yml` uses the existing
`Craves-RMORAMPUDI09-Service-Connection`. It pins a merged GitHub `main` SHA and
requires the existing complete four-job regression evidence for that exact SHA.
It builds and verifies an immutable image digest with the correct source label.
`web_pilot_release.py` allows exactly three new launch settings and the web
image/build SHA. Unknown environment additions, secret/binding changes, resource
or scaling changes, and concurrent releases stop deployment. Other Container
Apps are fingerprinted before and after preparation without reading app data.

The sanitized receipt contains prior/current immutable web image and source,
runtime fingerprint, launch settings (hash only), protected-app fingerprints,
and successful web readbacks. No private launch key or customer body is included.
Rollout starts with access open and verifies public sign-in/chef routes, merchant
configuration readiness, private control denial, and durable state access.

## Verification and recovery

Run the full existing web lint/type/test/build checks, the web-release guard
tests, and `scripts/release/tests/test-web-pilot-standalone.mjs` after preparing
the standalone assets. The compiled-server fixture verifies waiting routes,
unauthorized denial, private launch, repeat-click idempotency, immediate public
visibility, and byte-identical approved landing HTML. It prohibits production
service calls and uses disposable storage/identity fixtures only.

Before enabling waiting, verify the actual web origin's health probes and edge
cache settings, private-key access, neutral managed-identity blob read/write,
and public web routes. Do not send real OTPs, place orders, capture payments,
or write customer/chef records as a smoke test.

If rollout verification fails and the candidate runtime still matches the
receipt, recovery restores the captured prior immutable image/build SHA and
removes only the three launch additions. It rechecks the unchanged runtime and
public previous source. A concurrent runtime change stops automatic recovery.
The pipeline remains failed even if recovery succeeds.

Verified preparation baseline: source
`f30d1e0a432a5f80421e31ee1a6f89fa09316a45`, revision
`ca-craves-web-prodlow--0000070`, image
`cravesrm09prodlow6bf632.azurecr.io/craves/customer-web-next@sha256:d3dffc8f87a5a0f2a2b6deb1f78cb512637bbdb10d344fc72eb48e31538d7afe`.
