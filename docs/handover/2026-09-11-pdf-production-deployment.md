# PDF production deployment — 2026-09-11

## Deployed source and evidence

- Application source: `6a7517a2371aa64617f5a97f1c72cef498a46292` (merged PR #321).
- Backend deployment succeeded: [Azure run 38845](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=38845&view=results), all four stages green and seven services healthy.
- Customer web deployment succeeded: [Azure run 38846](https://dev.azure.com/ravitejamorampudi7777/Craves/_build/results?buildId=38846&view=results). Image `craves/customer-web-next:38846`; ready revision `ca-craves-web-prodlow--0000079`; Razorpay mode remains production and productionEligible=true.
- Notification Flyway logs prove V6 private PDF documents applied successfully at 2026-09-11T11:44:35Z.
- Application test evidence: [GitHub CI 34590751283](https://github.com/rmorampudi09-arch/Craves-Build-platform/actions/runs/34590751283), including required PDF tests without skips.

## Azure configuration completed

- Existing account `stcravesprodlowl3ing6`; new private container `pdf-documents` with public access off.
- Notification has the three source-service HTTPS origins, Blob endpoint and container configured.
- API `craves-documents-v1` has all seven dedicated operations. Unauthenticated capabilities and download requests return 401 with private/no-store cache headers.
- Fixed initial APIM provisioning: structured ResourceNotFound errors, UTF-8 BOM, raw policy XML, and Consumption tier support. Eight offline tests passed. Consumption uses bounded backend concurrency; application per-owner quotas remain unchanged.
- Deployment helper fixes are in `9785027924acf1d322ea980a9a4a4260f2f177ab` and its preceding fixes; these do not change application images.

## Activation blocked — explicit access approval required

Automatic approval review rejected granting a new Azure role because deployment authorization did not specifically authorize the recipient, role and scope. No workaround or alternative credentials were used.

Requested grant:
- Recipient: system-assigned managed identity of `ca-craves-notification-service-p`, object ID `07a4694c-ce0f-4615-a7b6-15341e1dbced`.
- Role: Storage Blob Data Contributor (read/write/delete Blob data).
- Scope: only `/subscriptions/4f897b61-9b52-44b4-8cf1-bdac281cc1aa/resourceGroups/rg-craves-prodlow-centralindia/providers/Microsoft.Storage/storageAccounts/stcravesprodlowl3ing6/blobServices/default/containers/pdf-documents`.

PDF API generation, worker and email activation flags remain explicitly false. Source and web feature flags remain at their default false. Generation, private download integrity, cross-account isolation and real verified-recipient email have not been runtime-accepted. No live payment, delivery booking or customer email was performed.

After explicit approval, grant only this container-scoped role, enable the existing document source adapters and generation/worker settings, verify with an existing owned record, then activate the web controls and separately verify email. Preserve existing secrets and runtime configuration. Follow the module README for rollback; retain V6 tables, issued blobs and audit records.
