# Craves PDF module: GitHub recovery handoff

## Current status — do not call this PDF module acceptance

The owner requested that the GitHub work be completed with minimal manual work.
The previous delivery supplied `pdf-module-import.zip`, a final CI workflow, a
final browser document route and a final APIM helper. That delivery explicitly
said the PDF implementation had not been committed or merged.

In this continuation, GitHub read/write access works. The prior local file
runtime still returns transport timeouts, and its artifacts cannot currently
be transferred through the available file interface. The source package has
therefore **not been imported or reviewed in this continuation**. Do not claim
that customer invoices, chef statements or email delivery are in GitHub merely
because the recovery workflow is green.

The baseline checked on GitHub is main commit
`147f381b578207e95c7678d208ae2366bce92579`. Work is isolated to
`feature/backend-pdf-documents-20260911`. No main merge, Azure deployment,
resource provisioning, email send, payment or delivery booking was performed.

## Completed GitHub changes

| Path | Responsibility |
| --- | --- |
| `scripts/documents/recover_pdf_source.py` | Inspect and import bounded source packages without executing them |
| `scripts/documents/test_recover_pdf_source.py` | Recovery-only unit and safety tests |
| `.github/workflows/pdf-module-source-recovery.yml` | Test recovery and import a ZIP only on the PDF feature branch |
| `docs/handover/2026-09-11-pdf-github-recovery.md` | This handoff and explicit acceptance boundary |

The recovery workflow passed in run
[34566341467](https://github.com/rmorampudi09-arch/Craves-Build-platform/actions/runs/34566341467)
at commit `5c15c4e8f0d0a9a9403ff19261006958fb1eee7a`.
The job log shows **22 tests passed**. The actual source-import job was
**skipped because the ZIP is absent**. The tests cover source layouts and
encoding, checksums, traversal, scope restrictions, symlinks, case collisions,
file/directory collisions, dry-run behavior and protection of existing SQL
migrations. They do not validate the PDF business module.

## One manual recovery task

1. Download the previously supplied `pdf-module-import.zip` from the chat.
2. Open [the PDF feature branch upload page](https://github.com/rmorampudi09-arch/Craves-Build-platform/upload/feature/backend-pdf-documents-20260911).
3. Upload the ZIP unchanged to the repository root and commit **directly to
   `feature/backend-pdf-documents-20260911`**, not to `main` and not to a new branch.

No extraction, code copying, local terminal, new secret or Azure action is needed.
The workflow starts on the ZIP commit. Its import step has not yet been tested
against the real package because the package bytes are unavailable. Unsupported
package layouts fail closed rather than guessing or deleting source files.

This repository is public. Upload only the source ZIP from the prior delivery,
not production records, private customer PDFs, credentials, dependency caches
or the much larger tooling ZIPs.

## What the workflow will do after upload

It runs the recovery tests, validates the archive's paths and limits, imports
in-scope source files and records SHA-256 hashes. It then removes the staging
ZIP from the branch's working tree and creates a source commit on the same
feature branch. The uploaded ZIP remains in that branch's Git history; no
history rewriting is performed.

It refuses symlinks, traversal, hidden credential files, binary executables,
font files, generated build directories, out-of-scope services, workflow
changes and changes to existing SQL migrations. It contains a limited
credential-pattern check, **not a comprehensive secret-scanning guarantee**.
The package must contain repository-relative files (optionally under
`repository/`) or a single JSON manifest with complete file contents. A manifest
supports UTF-8, explicitly identified base64 or `content_base64`; blob references
without content are insufficient. Maximum ZIP size is 20 MiB, expanded source
32 MiB, 600 source files and 2 MiB per source file.

The write operation checks that the branch still matches the triggering commit.
It never force-pushes or updates main. The workflow uses the automatically
provided GitHub job token; no personal access token is requested. The recovery
job does not execute source scripts, Maven, npm or deployment commands from
the archive. Other CI must not be assumed to run after a bot-generated push.

## Engineering work after source recovery

The remaining work belongs to the engineering continuation, not to the owner
copying files manually:

- Inspect the actual recovered files and compare them with the pinned baseline
  and current main. Resolve any genuine source conflicts without losing newer work.
- Apply the final browser request/body-timeout hardening at
  `apps/customer-web-next/src/app/api/documents/[[...segments]]/route.ts`.
- Apply the final APIM query-parameter-preservation fix at
  `scripts/documents/apim-document-api.py`.
- Add and review `.github/workflows/backend-pdf-documents-ci.yml` using the
  recovered module's real test configuration and environment-variable names.
- Run complete changed-service tests with disposable PostgreSQL. Confirm the
  previously skipped PostgreSQL tests actually execute, not merely disappear
  from the reported totals.
- Run web lint, type checking, tests and production build; inspect synthetic PDF
  outputs. Resolve findings before marking the PR ready for review or merging.
- Update the PR and record exact validated SHAs, run URLs and pending runtime
  acceptance. Remove the temporary recovery utility when it is no longer needed.

The earlier delivery's reported compilation, 40 notification tests, 12 adapter
tests, 10 web contract tests and two generated examples are **prior reported
results**, not results re-executed in this continuation. Full module validation,
merge, live private-storage/download/email checks and production acceptance
remain pending.

## Deployment boundary

Keep all new feature flags off until the module's release prerequisites and
controlled smoke checks are satisfied. Reuse the established
`Craves-Dev-Service-Connection` where the approved Azure pipeline requires it;
do not create or request a replacement connection. Do not enable tax-invoice,
credit-note, financial-allocation or other product-owned rules by inference.

This recovery workflow does not need Azure credentials and cannot provision
billable Azure resources. Production storage, email, APIM and activation are
separate work with their own verification and approval boundaries.

## Local recovery-utility test command

```bash
python3 -m unittest discover -s scripts/documents -p test_recover_pdf_source.py -v
```

The owner does not need to run this command; the GitHub workflow already ran it.
