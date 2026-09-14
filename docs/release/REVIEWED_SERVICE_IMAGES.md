# Reviewed single-service image releases

Auth, User/Chef, Order, Catalog, Integration and Notification release pipelines
require `expectedReleaseSha` to be the full reviewed checkout SHA. `imageTag`
defaults to `$(Build.SourceVersion)` and must equal that same SHA. Supply the
existing `AZURE_SERVICE_CONNECTION` where required; existing resource parameters,
pipeline/environment approvals, runtime preservation and replica settings remain
in force. These pipelines still have `trigger: none` and `pr: none`.

Before tests, before image publication and before deployment, the pipeline checks
the reviewed SHA against Git HEAD, `Build.SourceVersion` and the tag, and rejects
tracked source changes. The Docker build records the full SHA in
`org.opencontainers.image.revision`. After push, the pipeline resolves the actual
ACR digest, pulls that digest and verifies both the source label and its image
config ID against the local build. A different image published under the same
tag is rejected. Deployment receives the saved digest, pulls it again and checks
its source label; it never resolves the tag again to choose the deployment image.

Record the source SHA and `registry/repository@sha256:…` output together with the
pipeline run ID and the shared helper's ready revision. Separately inventory
actual traffic and replica counts against the approved runtime before and after
deployment. The
image label is provenance within the reviewed pipeline and existing registry
permissions, not an independent cryptographic source attestation. A successful
image push does not prove runtime or authenticated acceptance.

The shared deployment helper enables these checks through
`REQUIRE_REVIEWED_DIGEST=true` only for these six reviewed pipelines. Untouched
Subscription and the separate backend wrapper keep their existing contracts.
Read-only Academy baseline preflight still accepts the existing baseline image;
Academy publication retains its additional source/runtime guards unchanged.
Guarded rollback retains the previous healthy image, including an older tagged
baseline, to avoid preventing recovery during the first digest-pinned release.

`scripts/release/tests/test-reviewed-service-image.py` uses disposable Git and
mock commands to test source mismatch, mutable references, missing/incorrect
labels, changed same-SHA tags, registry/pull failures, saved-digest deployment and
six-pipeline wiring. It runs under Backend completion CI alongside the existing
runtime-preservation preflight tests. No test calls production Azure or Docker.

The verified customer-web definition (`azure-pipelines-razorpay-customer-web.yml`)
uses the same source and image helpers. Its fixed production target requires both
`targetEnvironment=production` and an existing literal production payment mode;
the replace confirmation remains required. The pipeline preserves its Firebase
build inputs and all existing runtime settings, updates only the image and
verifies the candidate's healthy revision, digest, full traffic and one actual
replica before accepting its Razorpay readiness response. It refuses rollback if
the current image or unrelated runtime state changed concurrently. Prior images
remain recovery points; a submitted rollback still requires healthy runtime
readback by the release owner.
