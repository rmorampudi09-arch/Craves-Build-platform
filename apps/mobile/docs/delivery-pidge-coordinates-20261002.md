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
Exact source commit and live image evidence are completed below after verification.

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

Pending live deployment verification at the source checkpoint. The receipt is
completed in a separate documentation commit without moving the source tag.

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
