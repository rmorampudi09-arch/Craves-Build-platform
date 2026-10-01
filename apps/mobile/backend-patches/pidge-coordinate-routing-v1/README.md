# Pidge Coordinate Routing Patch v1

Backend-only change on `KUSHIRAVI-app-build`. No mobile UI, Android version,
payment, authentication, finance policy, delivery radius, database migration,
APIM, remote, pipeline or provider-activation change.

## Contract and Change

Pidge's official Get Quote contract:
https://api-docs.pidge.in/#21c48d81-5d80-46e4-86b8-078fe7d0510e

`POST /v1.0/store/channel/vendor/quote` accepts pickup/drop latitude, longitude,
postcodes and package attributes. Pidge returns real-time serviceability.
The literal equality of pickup/drop city labels is not geographic proof and
incorrectly rejected `HYD` versus `Hyderabad` before any provider call.

The patch removes that comparison from the shared quote/create validation.
All address fields and actual coordinates are preserved. Valid coordinates,
Indian postcodes/country, contacts, positive measured weight, prepaid orders,
food items and activation gates remain required. Only immediate, priced,
non-self/non-captive Pidge candidates remain eligible. No arbitrary radius,
city aliases, reverse-geocoding API or automatic provider retry is introduced.
Craves checkout policies and the existing delivery intelligence remain unchanged.
Booking still rechecks partner availability/price and uses the existing durable
claim/reconciliation protection against duplicate dispatch.

Safe logs identify pre-HTTP validation failure, HTTP status, fixed failure
categories, network exception type and eligible immediate-partner count.
They never echo provider response bodies, tokens, addresses or coordinates.
Categories are diagnostic only; raw messages are not invented or displayed.

## Exact Production Baseline

Image: `cravesrm09prodlow6bf632.azurecr.io/craves/integration-service@sha256:84c06314f147e326adfb6a23cf27fbdfd8950b8863c829b1d5558a1039c44763`.

The mobile branch's older backend tree is NOT a deployment baseline.
`Fetch-Baseline.ps1` obtains the immutable running JAR from the existing ACR.
`Build-Patch.ps1` compiles against its exact classes and dependency JARs, replaces
only the two top-level Pidge classes, and verifies every other archive entry is
unchanged. The Dockerfile preserves the baseline runtime and launch command.

## Rebuild and Test

Requirements: PowerShell 7, Java 21, Maven, Azure CLI signed into the existing
subscription with read access to the registry; `tar` on PATH. No secret values
are passed as arguments, written to files or requested in chat.

```powershell
./Fetch-Baseline.ps1 -OutputDirectory C:/mscratch/artifacts/pidge-rebuild/input
./Build-Patch.ps1 -BaselineJar C:/mscratch/artifacts/pidge-rebuild/input/app/app.jar -OutputDirectory C:/mscratch/artifacts/pidge-rebuild/output -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot'
mvn -B -ntp -Dbaseline.jar=C:/mscratch/artifacts/pidge-rebuild/output/baseline-classes.jar test
```

Use a fresh output directory for each build. Unit tests do not make live Pidge
calls, create orders or dispatch riders. Coverage includes unequal city labels,
exact coordinates/postcodes, invalid coordinates at both stops, provider refusal,
prepaid/package gates, price revalidation, duplicate-create protection, safe
error categories and no automatic retry of chargeable quotes.

For an approved deployment, copy the generated `app.jar` and this Dockerfile to
an otherwise empty build context. Build in the existing ACR; update only the
existing Integration Service image after tests pass. This uses existing paid
registry/build capacity, not a new Azure resource. Preserve all configuration,
identities, secrets and Pidge-only activation. No GitHub push or CI change.

## Live Verification and Rollback

Confirm readiness, unchanged configuration and Pidge-only registry. Let the
existing waiting command retry; do not replay accepted/uncertain creates or
force a customer order state. Inspect Pidge HTTP/availability logs, the booking
journal and customer delivery-status readback. No rider availability is promised.
No new APK is required; the installed mobile version remains unchanged.

Rollback the Integration Service image to the exact immutable baseline above.
Do not alter database records, booking claims or provider settings as rollback.
See the accompanying deployment receipt for exact commit/tag/image evidence.
