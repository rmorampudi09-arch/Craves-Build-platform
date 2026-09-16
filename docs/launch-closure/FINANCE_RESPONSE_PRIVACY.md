# Finance response privacy repair

## Observed problem

On16 September2026 at12:49:07 UTC, four fresh anonymous GET requests to the public API returned HTTP401 with `Cache-Control: private` and no Pragma header:

- `/api/v1/admin/finance/settings`
- `/api/v1/admin/finance/source-status`
- `/api/v1/admin/finance/manual-settlements`
- `/api/v1/chef/finance/balance`

Only response headers were inspected. No customer body, token, account detail, payment, order or finance mutation was requested. These are freshly reproduced affected paths; the unavailable September15 continuation's exact four historical paths have not been independently identified. Do not equate the two sets without the original record.

## Responsible policy and narrowly selected change

The existing finance release archive describes an API-level missing-Bearer `return-response` with no cache header and an outbound `no-store` header. Microsoft's policy contract says `return-response` cancels the processing pipeline, so an outbound header alone does not cover this denial. The current byte fingerprints of the two selected API policies match each other. Current inherited policy structure must pass inspection before repair.

`scripts/apim/finance-response-privacy.py` operates only on the existing `craves-finance-admin-v1` and `craves-chef-finance-v1` API policies. It adds `Cache-Control: private, no-store, max-age=0` and `Pragma: no-cache` to each local early response, outbound section and error section. Header insertion respects APIM's status/header/body ordering. Authentication conditions, status codes, body values, backends, CORS, operation routing and all non-privacy XML structure must remain equivalent.

Write mode refuses unknown policy bytes, inherited-policy drift, missing ETags, wildcard ETags and off-scope management URLs. Read-only inspection may report baseline mismatches as hashes and structural metadata, but never accepts or applies them. Writes use the actual current ETag and fail on concurrent changes. Global policies and operations are never written. Current Azure service-connection authentication is used in memory, never logged or exported. Public probes do not follow redirects or read response bodies.

## Test and execution boundary

Thirteen local regression tests cover header placement and uniqueness, idempotence, nested errors, unchanged routing/auth/body, malformed XML, scope restrictions, exact ETags, no-write inspection including drift diagnostics, and protected apply/readback. All 29 current APIM tests passed locally. These are isolated structural and mocked management tests, not authenticated production 200/403/400/500 acceptance.

Read-only Azure run 39081 at source 0ea1fc397b93521de93c2767f6f0e35606157251 stopped at `Inherited global policy drifted`. No policy write was attempted. The earlier inventory used the collection endpoint while the repair helper reads a policy resource; formatting differences are only a hypothesis until comparison, not a reason to relax write guards. Diagnostic metadata was added without changing apply guards. F14 remains OPEN.

The pipeline122 action `inspect-finance-response-privacy` runs the tests and a read-only live inspection. At this checkpoint the action does not expose a write option. An application image rollout is unnecessary for this cache-only gateway repair. Before publication, attach the current exact-source test result and inspect the emitted plan. After publication, record exact after-policy hashes and independently repeat the anonymous probes; then verify authenticated success, wrong-role denial, validation error and upstream-failure handling through controlled authorized paths. Keep F14 OPEN until all required evidence exists.

## Recovery

Do not overwrite a drifted policy or retry a timed-out write blindly. Read the exact target and compare the non-privacy structure and expected repaired structure. Preserve existing routing, JWT enforcement and newer policies. A verified cache-only correction should not be reverted merely because a later unrelated authenticated check fails. If routing truly breaks, use a separately reviewed compatible policy while retaining safe uncached failure responses; do not restore the original missing privacy control as a convenience.

## Primary references

- https://learn.microsoft.com/en-us/azure/api-management/return-response-policy
- https://learn.microsoft.com/en-us/azure/api-management/api-management-error-handling-policies
- https://learn.microsoft.com/en-us/rest/api/apimanagement/api-policy/create-or-update?view=rest-apimanagement-2024-05-01

These explain policy execution and conditional writes. They are not evidence of Craves deployment or acceptance.
