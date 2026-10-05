# Existing documents routing repair

This appendix records a separately reviewed runtime correction discovered while
checking the Chef Statements page in the user's local signed-in Chrome. The
capability request returned 403 twice. Document frontend and backend source files
were unchanged by the performance release; that does not establish whether the
failure existed before that release because Statements had no signed-in baseline.

The live APIM API backend URL already contains `/api/v1/documents`, while each of
seven known operation policies rewrites the full `/api/v1/documents/...` path.
The source setup script expects a notification host-root backend plus those full
rewrites. A duplicated path prefix is a likely cause, not an authenticated trace
proof. Existing routing diagnostics were absent and were not enabled.

## Recorded application result

The authorized executor completed at **2026-10-05 22:26:11 UTC**. All seven
existing operation policies passed configuration readback, with capabilities last.
`documents-routing-repair-applied-receipt.json` has SHA256
`109dd22f797048ad3781ec6fa11f1ff01a32c4904efe8070a7b7e7c71c0ee44c`.
There were no apply failures, unknown transport outcomes or rollback actions.

Pre/post fingerprints match for all twelve protected applications and the current
web application at source `739650f223f2edc0dd8914b28e23916b421da9f1`.
API metadata, fourteen operation definitions, inherited policies, seven absent
wildcard policies and APIM tier remain unchanged. Anonymous boundary statuses and
cache headers remain 401/401/404/401 with private/no-store and web `CONFIG_NOCACHE`.
No response bodies were read.

The executed and delivered executor SHA256 is
`393dc85566e5beac3a152d9f1f618dcda54a18a0bf7f94f93eda739ddaa65d39`.
Its last write was 22:20:08 UTC, before invocation at 22:21:12 UTC; there were no
script edits during execution. Its offline checks validated seven frozen policies
and rejected four unsafe variations. The historical configuration receipt retains
its original pending functional status; the later native result is recorded in a
separate proof rather than changing that receipt. Document write/export/email
workflows are not validated here.

## Final native read-only proof

The root task completed three signed-in local Chrome reloads of `/chef/statements`.
The capability and saved-list GETs returned 200 in every round, the saved list
rendered, and Generate PDF was enabled. No document action was performed.

| Round | Capability GET | Saved-list GET | DOM ready | Page load | Network finish |
| --- | --- | --- | --- | --- | --- |
| 1 | 200, 430 ms | 200, 373 ms | 286 ms | 528 ms | 2450 ms |
| 2 | 200, 74 ms | 200, 75 ms | 215 ms | 335 ms | 913 ms |
| 3 | 200, 62 ms | 200, 243 ms | 166 ms | 284 ms | 964 ms |

Auth refresh returned 200 in all three rounds. Auth me returned 200 visibly in
round one; later Network rows did not show it, so those observations remain null.
No private response bodies or credentials were inspected or extracted. The
browser was restored to `/chef` with DevTools closed.

The root native receipt is `native-chrome-statements-after-routing.json`, SHA256
`0eb3ae3bfded849403752838add15f7cb65366aa177001ce292e1ffeee197b65`.
The separate linked proof is `documents-routing-repair-functional-proof.json`,
SHA256 `9e316bfba82a6c73f1b8b8878ede5b777ad4f13da2eef3fd08b86c0a477c84f2`.
Its verified scope is capability/list GETs and their displayed UI only; document
generation, download and email workflows remain untested. The routing correction
resolved the observed read-only failure, while the prior composed upstream URL
remains untraced.

## Reviewed scope

The frozen proposal is `documents-routing-repair-readonly-proposal.json`, SHA256
`90f4cbc597cf1bdf41621cd8df3112042ccccd5758e7c3f6aadd7187fe35b8a9`.
The all-operation policy supplement is
`documents-routing-all-operation-policy-preflight.json`, SHA256
`fdb30064355308830918b3120f0a27b325504989cc13b1cf5c868c1a3b096ea9`.
Both are historical read-only review records and stay unchanged after applying.

Only one operation-scoped `set-backend-service` node is added immediately before
the existing rewrite for each known operation. Its HTTPS backend is the existing
notification origin host root. The API-level service URL remains unchanged.

| Apply order | Exact operation ID | Method | Existing URL template |
| --- | --- | --- | --- |
| 1 | create-document | POST | `/` |
| 2 | list-documents | GET | `/` |
| 3 | get-document | GET | `/{id}` |
| 4 | download-document | GET | `/{id}/download` |
| 5 | email-document | POST | `/{id}/email` |
| 6 | email-history | GET | `/{id}/emails` |
| 7 | capabilities | GET | `/capabilities` |

Capabilities is last so it does not advertise enabled document operations before
all seven known mappings have the same root-backend correction. The seven extra
wildcard operation definitions remain unchanged and keep their absence of
operation policies. Global/API policies, authorization, roles, headers, request
validation, concurrency, flags, all application images/runtimes/traffic/scale and
the existing APIM tier remain unchanged. There are no new resources or tiers.

## Reviewable executor and evidence

`documents-routing-existing-only-repair.py` defaults to read-only inspection.
Run from the `tmp/craves-web-performance` Git worktree with the existing local
Azure CLI account. No credential values need to be copied into a command or chat.

```powershell
python docs/performance/chef-pass-20261006/documents-routing-existing-only-repair.py --self-test
python docs/performance/chef-pass-20261006/documents-routing-existing-only-repair.py
```

The offline checks validate seven frozen policies and reject four unsafe
variations: a prefixed backend, changed rewrite parameters, an authorization
header mutation, and an extra backend attribute. They make no Azure calls.

The authorized application command is:

```powershell
python docs/performance/chef-pass-20261006/documents-routing-existing-only-repair.py --apply
```

An existing applied receipt blocks automatic reruns. The executor checks account
and tenant, API/inventory hashes, inherited policy hashes, every existing operation
policy, twelve protected application fingerprints plus the live web fingerprint,
and APIM tier before each update. Every PUT uses the exact current target ETag in
`If-Match`; another edit to that target rejects the write.

Azure's policy collection and single-resource views format identical XML
differently. Exact frozen collection hashes protect the original state; parsed
node/attribute/text/order comparisons verify the ETag target and returned policy.
Only whitespace-only indentation and attribute serialization order are ignored.
After each successful write, its actual collection hash becomes the exact guard
for later checks. Original snapshots written on Windows contain translated
newlines; the executor reverses that byte translation and verifies the recovered
original hash before accepting a snapshot for rollback.

The seven `documents-routing-*-policy-before.xml` files preserve the original
policies. The seven `documents-routing-*-proposed-policy-put.json` files contain
the exact reviewed target payloads. Preserve both sets in the handover ZIP.

Inspection produces `documents-routing-repair-inspection.json`. Applying produces
`documents-routing-repair-applied-receipt.json`, which records current and proposed
hashes, conditional updates, each readback, pre/post application fingerprints,
private-cache boundary checks, configuration result and functional proof status.

## Recovery and validation limits

Readback failure triggers recovery of only this executor's changes. It requires
the exact own proposed structure, unchanged other scopes/applications, and a fresh
target ETag before restoring the original policy. Concurrent drift stops recovery
for review. An unacknowledged network write remains an unknown outcome even after
bounded repeated observations; the receipt retains `manualReviewRequired` and
does not report fully verified rollback merely because one read appears original.

Anonymous GET checks use no authorization header, cookie or session token. They
read no response bodies. Their pre-existing statuses are 401 for the BFF capability
and list paths, 404 for the deliberately invalid all-zero ID, and 401 for the APIM
capability path. Private/no-store cache headers and the web `CONFIG_NOCACHE`
boundary must remain unchanged.

Configuration proof alone is not functional proof. The separate root native proof
now verifies capability and saved-list GETs in the already signed-in local Chrome
session, without reading or extracting credentials. No document was generated,
downloaded or emailed, and no private document body was inspected. Successful
reads do not verify write/export/email workflows, which remain untested here.

Primary policy references: [backend URL composition](https://learn.microsoft.com/en-us/azure/api-management/import-and-publish),
[rewrite-uri](https://learn.microsoft.com/en-us/azure/api-management/rewrite-uri-policy),
and [set-backend-service](https://learn.microsoft.com/en-us/azure/api-management/set-backend-service-policy).
