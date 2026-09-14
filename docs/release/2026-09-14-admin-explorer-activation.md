# Admin explorer Consumption-compatible activation

Status: ACTIVE. All three scoped backend deployments, gateway operations and Explorer flags are live. Admin production run 38987 succeeded, and the authenticated production UI checks below passed.

## Reviewed release

- Final admin/main source: `8a2d10834084f67644ce2a9d082440dd67976e5a` (PRs #349, #351, #352 and #353).
- PR #351 restricts backend inventory to required metadata. Its exact head f064016d passed the complete Explorer workflow, and its merge tree is identical. The current admin app has only two public literal settings and no secrets in its control-plane response.
- Tested admin PR head: `7563eae2486a31fb24f394218ce81bb0ae630b4e`. All 15 returned applicable GitHub workflows succeeded. The merge tree is identical to the tested head.
- Backend maintenance source: `3a4dfa69a547a64223ec09373bfcefbd5d487131` (PR #350), based on deployed `f06d3f64194a0754de2a173b539f46e2270819c0`.
- The checked-in backend manifest verifies ancestry, exact Explorer implementation and migration parity, and no unrelated backend delta. Admin source and backend source are deliberately distinct immutable builds.
- The exact backend candidate passed all five Explorer jobs, including eight real PostgreSQL limiter cases per service with no skips, report/audit/authorization tests and browser acceptance. Its other service/regression workflows passed. A merged-preview email migration fixture failed because it did not reset/count the newly added table; the final admin/main release fixes those fixtures and its complete email security workflow passes. The email feature is absent from the deployed backend candidate.

## Behavior and scope

The existing APIM Consumption tier remains. The owning service admits 20 Explorer reads per rolling minute per dataset, across all administrators and entry points. PostgreSQL admission uses database time and a nonblocking transaction advisory lock, commits before reporting, survives restarts, counts failed reports, and fails closed. Counter rows store only random admission IDs and timestamps. The append-only access audit remains separate.

Auth V9.1, User/Chef V11.1 and Order V26.1 add the counters before pending higher-numbered migrations. Existing audit migrations V9/V11/V26 are unchanged. Existing connection, keys, references, provider settings, resource sizes, and one-replica limits are preserved. No roles were granted.

## Predeployment production evidence

The four current apps were healthy and matched the recorded previous images. The three backends still ran f06 with Explorer absent/default-false; admin ran f0ba9d64 on revision 0000010. Metadata-only rollback snapshots exclude secret values. Existing datasource credential references were resolved only in memory for read-only PostgreSQL inspection; no credentials were printed or saved.

Read-only verification confirmed V9/V11/V26 succeeded, both append-only audit guards were enabled in every owner, and all six reviewed indexes remained valid. Aggregate counts: 25 Auth identities, 9 chef applications, 112 chef-specific orders. Existing role assignment totals: 7 PLATFORM_ADMIN and 7 AUDIT_ADMIN. These are database baselines, not authenticated Explorer acceptance.

The existing owner session displayed the healthy old admin overview. The APIM Explorer namespace was absent; no ancestor or descendant operation conflicted. Global policy was checked and backed up. All four pipeline definitions use Craves-Dev-Service-Connection.

## Deployment runs

| Component | Definition | Run | Source |
| --- | --- | --- | --- |
| Auth | 2 | 38980 | 3a4dfa69 |
| User/Chef | 4 | 38981 | 3a4dfa69 |
| Order | 6 | 38982 | 3a4dfa69 |
| Admin | 33 | 38987 | 8a2d1083 |

Azure has one Microsoft-hosted build job. The backends ran sequentially after the automatic main admin validation job 38983. No job was cancelled and no capacity was purchased.

## Backend and gateway activation

All three backend runs succeeded. Read-only production checks confirmed the audit migrations and V9.1/V11.1/V26.1 counter migrations succeeded, all counter tables exist, all audit guards remain enabled, and all six reviewed indexes remain valid. Counts remain 25/9/112.

The three POST operations were installed under craves-admin-explorer-v1 on the existing Consumption gateway. The first Orders anonymous check transiently returned 500 during propagation; subsequent checks returned 401 for all three routes. Exact raw XML comparisons pass for each operation. PR #352 corrects policy readback to request rawxml; all five Explorer CI jobs passed at its exact head 038286ec, and the final merge tree is identical.

All three Explorer flags are now true, and images are pinned to reviewed registry digests. Ready revisions are Auth 0000041, User/Chef 0000048 and Order 0000088. Each has exactly one actual replica and min/max 1. Metadata comparison verifies unchanged identity, secret references, other environment references, resources and scale settings.

| Service | Active digest | Rollback digest |
| --- | --- | --- |
| Auth | sha256:e1df34a9ab8dbbec68f289ef0ece19ca05d54e98d203db3a8aee58317e5b5599 | sha256:1d98baf7ce10297729b03bdb6b4b14c6b81d8f1556d83b83d80ffa52fe7fad0d |
| User/Chef | sha256:fa546c94af8eb329593d158589e0bffee96e19d6f84a55f937032de1f74fa93d | sha256:ea5ea4d21c19f1c418531fc872abc9c836b8930f2a508e5494a993e16d0dc75c |
| Order | sha256:be3e6c02d56df7e8abcd6c7020480dc67c3be4500ea05623acdad7c0eb0ae39f | sha256:2346d828b38d7cfe55ce167fa590d6d2403598827cf2a6e51f8cdc5771747d8d |

Previous admin digest: sha256:d2ca7467d82236f90254e6aebfbcb17d74ee06634196649190ab41c1f4a2cbe3.

## Final readiness

Live readiness now passes all three source-linked backends, active flags, exact gateway and inherited policies, health, immutable digests, replica limits and anonymous 401 denial. Azure CLI reports an absent API-scoped policy as a JSON ResourceNotFound error; PR #353 recognizes that explicit response while keeping authorization/timeouts fatal. All 11 local readiness tests and all five Explorer CI jobs pass at exact PR #353 head fd41cbe4. Its final merge tree is identical.

The exact final main admin image was promoted through its existing environment. The live UI evidence below is separate from CI fixture results.

Admin production run 38987 is bound to main 8a2d10834084f67644ce2a9d082440dd67976e5a with deployProduction=true, matching imageTag/expectedReleaseSha, and unchanged target app/registry/resource group. All three stages (validation, image build and deployment) succeeded. The existing environment approval passed. Invalid bearer checks return 401 for Auth and 403 for User/Chef and Order, without a successful data response. Public Auth session policy is ADMIN_SESSION_V1, accessTokenSeconds=900 and adminAbsoluteSeconds=28800. This confirms configured capability, not a forced live expiry/renewal test.


## Production admin and authenticated acceptance

Admin is running the reviewed 8a2d1083 image at immutable digest `sha256:1bc3f013239c2dc7acebe7b6878036525d05b1683af9c38c8f90389daac611f7`, ready revision `ca-craves-admin-web-prodlow--0000011`. The deployment passed its preserved identity/secret/configuration hash comparison, actual one-replica check, all-traffic readiness, signed-out identity guard and page route matrix.

Normal UI interaction in the existing authorized owner session at https://admin.craves.in confirmed:

- Analytics: 25 identities, 9 chef applications and 112 chef-specific orders, matching the independently verified database baseline. No sample data substitution or service error appeared.
- Users: Active chart opens 25 matching records, all 25 displayed contact cells are masked, Next is disabled at the complete single-page boundary. July chart opens exactly 7 records and the displayed date range agrees.
- Chefs: 9 total applications with masked contacts; Approved chart opens exactly 6 records. Date filters carried between datasets and Reset restored the complete count.
- Orders: all five pages return 25, 25, 25, 25 and 12 records, totaling 112 distinct displayed references with no repetition. Next is disabled on page five; Previous returns the exact page-four references.
- Orders status: Payment pending chart opens 62 total matching records with only that status in the displayed rows. September chart opens exactly 12 records with matching displayed dates.
- Order detail drawer opens the selected record and closes without losing the filtered list.
- Admin-domain BFF: all three datasets return 401 without a session, 403 with an untrusted Origin, and no-store headers. Gateway anonymous requests return 401; invalid bearer requests are denied by the owning services.
- The existing owner session continued through deployment and all UI navigation. The 900-second access / 28,800-second absolute session policy is verified live. This does not claim a deliberately forced token-expiry/renewal scenario.

A separate low-privilege real account was not available; live wrong-role acceptance was not performed. Controller/BFF and browser-fixture role-denial and renewal cases passed CI. An attempt to navigate the browser directly to non-secret session timing metadata was blocked by the browser; no alternate credential, cookie or token access was attempted. Forced expiry/renewal remains a distinct unperformed live acceptance case.

## Rollback readiness

The previous admin and backend digests are recorded above. Disable the three Explorer flags first if rollback is needed, restore the prior admin digest, and use the compatible prior backend digests only after reviewing the additive migrations. Keep all audit data and guards; do not drop tables or shared gateway APIs. Rollback was prepared, not executed during successful activation.
