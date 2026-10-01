# Pidge Coordinate Serviceability - Backend Checkpoint v1

## Request and Confirmed Cause

Use longitude/latitude as supported by Pidge, without any UI/UX change.
Workspace `C:\mscratch`, branch `KUSHIRAVI-app-build`; no GitHub push.
Starting commit `ce4e0d20171a7734354e59dc4aa91315a311072e`, clean worktree.

Checkout `9047d2d6-54e1-4a05-96ad-d10ae6e4164d`, actual kitchen order
`c6c6481c-1b93-4d03-bffd-e1ea79f4f8d4`, delivery command
`c8a9fb0c-1297-347b-8196-f8c1e5aba8d8` was `WAITING_FOR_PROVIDER`.
The live deployed validator, invoked read-only against the stored request,
raised `Pidge food delivery is limited to same-city routes` for `HYD` versus
`Hyderabad`. This happened before the Pidge HTTP request. The router replaced
that failure with `Active delivery providers did not return a quote`.

Live registry readback: Pidge active; Borzo, Delhivery, Porter, Shadowfax and
Shiprocket inactive. No registry record or provider setting is changed by this patch.

## Contract Evidence

Official Pidge Get Quote API inspected on 2026-10-02:
https://api-docs.pidge.in/#21c48d81-5d80-46e4-86b8-078fe7d0510e

The quote uses pickup/drop `coordinates.latitude`, `coordinates.longitude`,
postcodes, weight, volumetric weight and COD amount. Pidge queries actual
partner serviceability in real time. It returns candidate networks with
availability and prices. City-label equality is not in this quote contract.
The API is chargeable; quotes must not be cached as a future booking promise.
The generic hybrid-serviceability endpoint is not substituted: Pidge documents
that it can return true unless enterprise-specific configuration is present.

## Precise Change

- Remove only the literal city-name equality gate from shared Pidge validation.
- Preserve the complete saved addresses and coordinates in quote/booking bodies.
- Retain coordinate ranges/non-null/nonzero checks, Indian postcode/country,
  contact/address requirements, prepaid payment and measured-weight gates.
- Retain immediate-only, priced, non-self/non-captive partner filtering.
- Retain existing intelligence ranking, booking claim, price/partner
  revalidation, verified cancellation and uncertain-create reconciliation.
- Do not add city aliases, arbitrary distance limits, geocoding costs or new
  business policy. Existing checkout distance/finance policies are unchanged.
- Add safe validation, HTTP status, bounded category, network type and candidate
  count logs. Provider bodies, tokens and personal locations are not logged.
- No automatic retry is added to the chargeable provider transport.

## Source and Runtime Boundaries

Tracked source/tests/tools:
`apps\mobile\backend-patches\pidge-coordinate-routing-v1`.
Full build/test instructions are in that directory's `README.md`.

The older backend tree on the mobile branch is not used as the live baseline.
Baseline image:
`cravesrm09prodlow6bf632.azurecr.io/craves/integration-service@sha256:84c06314f147e326adfb6a23cf27fbdfd8950b8863c829b1d5558a1039c44763`.
Only `PidgeApiClient.class` and `PidgeTransport.class` are replaced in its JAR.
Every other existing archive entry must be byte-identical; no new archive
entry is allowed. Existing nested booking/uncertainty exception classes remain.

Source checkpoint tag: `KUSHIRAVI-delivery-pidge-coordinates-v1`.
Exact source commit: `bfc870c2a37bca2fe89da8ab8d2ae5f01b3a43a5`.
The tag is immutable; this verification receipt is a later documentation commit.

Source ZIP: `C:\mscratch\artifacts\KUSHIRAVI-delivery-pidge-coordinates-v1-source.zip`.
SHA-256: `27DCD137CDAF4D59D5386B6F34DDD150A6C9B19890414A6A3F57701A74DB0256`.
The ZIP was created directly from the tag and includes source, tests, build/fetch
scripts, pinned runtime origin, Dockerfile, version notes and checkpoint document.
The original production JAR was separately downloaded and retained at
`C:\mscratch\artifacts\pidge-coordinate-routing-v1\input\app\app.jar`.

## Automated Verification

- Focused patch tests: 26 executed, zero failures/errors/skips.
- Broader production-source regression suite on final source: 680 discovered,
  396 executed, 284 database-dependent skipped; zero failures/errors.
- Exact-runtime compilation and per-entry archive comparison pass.
- Final patched JAR: `C:\mscratch\artifacts\pidge-coordinate-routing-v1\build-final\app.jar`.
- JAR SHA-256: `67817609EB7431020877DD7D0ECD05A7E7E2BF11E3C51EA03B24D646BFEA9993`.
- Database-dependent regression tests require a separate test database and are
  not run against production. Unit tests make no real provider calls/bookings.

## Deployment Verification Receipt

- Existing subscription: `721906c9-4a72-4606-830b-d3e7ace093ff`.
- Resource group: `rg-craves-prodlow-centralindia`.
- Only updated service: `ca-craves-integration-service-pr`.
- Existing registry build: `cu4w`, successful; no GitHub source push.
- New image:
  `cravesrm09prodlow6bf632.azurecr.io/craves/integration-service@sha256:9c0919f6d25f69ffe00cbadc7957f2afd717949b6306ee12e5f7ee385110ca81`.
- Healthy live revision: `ca-craves-integration-service-pr--pidge-coord-1002`,
  one replica, 100% traffic. Prior revision has zero traffic and deprovisioned.
- Startup completed at `2026-10-01T23:51:58.877Z`; latest-ready revision
  readback verified at `2026-10-01T23:52:42.1945811Z`.
- Running `/app/app.jar` SHA-256 exactly matches the tested final JAR above.
- Environment-array SHA-256 before/after is identical:
  `4BD939543ED4B54E75897FADC9832CB39F7AA8C4E13FE4C5C19A279784551AF4`.
- Protected readiness: PIDGE / PRODUCTION, productionReady true,
  catalogActive true, blockers empty. No environment/secret/identity update.
- Post-deployment registry readback still has Pidge alone active; Borzo false.
- No database write, order-status override, queue replay, forced worker call,
  extra diagnostic quote, manual provider booking or fabricated rider occurred.
  The existing scheduled delivery-command retry performed the normal booking.

### Existing Order Recovery

New-revision logs from the normal retry:

- `2026-10-01T23:53:00.847Z` (05:23:00 IST): `Pidge quote HTTP response status=200`.
- `2026-10-01T23:53:00.848Z`: `eligibleImmediatePartners=1`.
- Command is now `COMPLETED`, `last_error=null`; updated
  `2026-10-01T23:53:02.784011Z`. Stored addresses are still HYD/Hyderabad;
  the new deployed validator passes the actual request without making an
  additional provider call.
- Assignment: `f82bdf7f-96ca-42bb-8746-772b84f8552f`, status `ASSIGNED`,
  selected provider `pidge`.
- Delivery job: `f4fdbaab-6a85-48b3-8f6c-ab41cc341707`.
- Actual Pidge booking/order: `179089878105454L7CGG6`, journal `FULFILLED`.
- Delivery job status `COURIER_TO_PICKUP`; provider status `OUT_FOR_PICKUP`;
  `last_tracking_error=null` at the read-only verification.
- Authenticated Pidge callback applied at `2026-10-01T23:53:10.318Z`; an earlier
  equal/stale callback was safely ignored. Physical pickup/delivery is not claimed.

Read-only evidence used existing backend container bindings and rolled back its
database transaction; no temporary database firewall or new permissions were needed.
Ignored local evidence directory: `C:\mscratch\artifacts\pidge-coordinate-routing-v1`.

The unchanged browser tracking URL was refreshed, but its session returned HTTP
401. The user was asked to sign in again; authenticated customer-screen readback
is not claimed until that succeeds. Backend booking/provider status above was
verified independently from the live database and provider-origin callback logs.

## Mobile and Manual Checks

Mobile UI/source remain `KUSHIRAVI-app-v1.21`, source
`5fac235a421f9541dfac40f3d82beee7fe6fad93`, Android code 32 / name 1.21.
APK remains `C:\mscratch\artifacts\KUSHIRAVI-app-v1.21.apk`; no new APK/install.

1. Confirm the existing web/mobile tracking page still opens unchanged.
2. Let the existing pending delivery command retry through the normal worker.
3. Confirm logs show an actual coordinate quote HTTP result or a precise
   transport failure, not the removed city-name rejection.
4. Inspect the authoritative provider ID, booking journal, delivery job and
   customer delivery-status readback. Do not fabricate rider assignment.
5. If Pidge reports no eligible partner or an account/wallet issue, report it
   separately. Do not enable Borzo or weaken payment/booking protections.

No new Azure resource, APIM route, credential, permission, CI/CD, payment,
authentication, schema or mobile signing change is required. Existing ACR
build capacity is billable under the user's earlier deployment approval.

## Rollback

Restore the Integration Service to the exact baseline image digest above.
Preserve environment, secret/identity bindings, booking journal and provider
activation. Do not reset or replay accepted/uncertain commands to roll back.
All previous mobile version tags and APKs remain untouched.
