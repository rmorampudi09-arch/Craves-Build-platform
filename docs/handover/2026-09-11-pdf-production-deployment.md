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

## Approved activation completed

The user explicitly approved the container-scoped Storage Blob Data Contributor grant. It was applied to the system-assigned managed identity of `ca-craves-notification-service-p` (object ID `07a4694c-ce0f-4615-a7b6-15341e1dbced`), scoped only to the `pdf-documents` container in `stcravesprodlowl3ing6`.

- Source adapters enabled and healthy: Order revision `--0000080`, Integration `--0000140`, Subscription `--0000040`.
- Notification generation and worker enabled: `--0000038` is latest and ready, health UP.
- Customer web document controls enabled: `ca-craves-web-prodlow--0000080` is latest and ready. Existing Razorpay production readiness remains valid.
- Both web and APIM document capabilities endpoints reject unauthenticated access with HTTP 401 and private/no-store headers.

## Email enabled; final customer acceptance awaits CAPTCHA

The user explicitly authorized requesting their Craves login OTP, enabling PDF email, and sending one controlled test PDF to their verified Craves account email.

`CRAVES_DOCUMENTS_EMAIL_ENABLED=true` is active on Notification revision `--0000039`, confirmed latest=ready and health UP. Generation, worker and web activation remain enabled.

Craves displayed an interactive reCAPTCHA before completing the OTP request. Browser guidance requires confirmation at this CAPTCHA step or manual handoff. No CAPTCHA was solved and no OTP delivery was confirmed. Use secure browser authentication for any subsequent sign-in credentials; never request secret codes in chat.

Owned-order generation, saved PDF download/integrity, cross-account isolation and the single approved test email remain unverified. No test PDF email has been sent. The existing authorization for the login and one verified-account test email persists; do not request it again. Continue once the CAPTCHA is completed or permission is given to solve it.
