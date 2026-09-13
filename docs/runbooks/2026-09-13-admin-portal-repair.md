# Administrator portal repair — September 13, 2026

Status at 06:12 UTC: all three authenticated portals load successfully. Academy is enabled and its live learning, persistence, report and plan-conflict checks passed. Admin access correction PR333 is deployed successfully through Azure run 38904. Delivery Intelligence release 38899 is verified successful. Auth, main admin and Delivery Intelligence each have latest=ready, Single mode and min/max replicas 1/1.

## Cause and correction

The main web identity parser only recognized the legacy `ADMIN` alias. Java Auth uses nine internal roles. As a result, a valid internal administrator without the legacy alias could receive a false 403 from both `/api/admin/me` and the shared `/api/auth/admin-session` route used by Administration, Academy and Delivery Intelligence. The currently signed-in owner could load Administration and Delivery Intelligence before the parser repair; this does not establish that every internal role worked.

PR333 recognizes exactly PLATFORM_ADMIN, SUPPORT_ADMIN, PAYMENTS_ADMIN, OPERATIONS_ADMIN, CHEF_ADMIN, COMPLIANCE_ADMIN, SUBSCRIPTION_ADMIN, NOTIFICATION_ADMIN and AUDIT_ADMIN. Legacy-only, unknown, customer-only and chef-only roles remain denied. Disabled accounts remain denied. Operation-specific permissions, including Delivery Intelligence's narrower role set, are unchanged. All admin identity responses now explicitly prevent caching, including error responses.

Academy also had `CRAVES_ACADEMY_ENABLED` unset/default false. Existing migrations, routes, gateway policy and reviewed Auth image were already deployed. Only that feature flag was activated on the existing Auth app, retaining min/max replicas 1/1 and its existing image and settings.

## Reviewed source and tests

Repository: https://github.com/rmorampudi09-arch/Craves-Build-platform

- Repair PR: https://github.com/rmorampudi09-arch/Craves-Build-platform/pull/333
- Reviewed head: `538a3b8d277f888df1d68063df949d6967d21914`.
- Merge/deployment source: `0b0c1342713dac921ac4418b350a4c89aeecca3a`.
- Identical reviewed and merged tree: `4f4cb1c48a32c098c2d0a0f3269b4cc40c2bb35f`.

Changed files:

- `apps/customer-web-next/src/lib/admin-contract.ts`
- `apps/customer-web-next/src/app/api/admin/me/route.ts`
- `apps/customer-web-next/src/lib/admin-contract.test.ts`
- `apps/customer-web-next/src/lib/admin-access-route.vitest.ts`
- `apps/customer-web-next/vitest.config.ts`

| Check | Observed result | Evidence / scope |
|---|---|---|
| Reproduce real route contract defect before correction | 14 failures, 1 pass | Actual Next session-status and identity handlers, mocked Java Auth boundary; isolated synthetic cookies cannot authenticate in production |
| Corrected web suites | 31 Vitest tests and 257 Node tests pass, no skips | All nine roles accepted without legacy alias; unsupported roles and disabled accounts denied; timing, minimized identity and no-store checked |
| Static validation | Lint, TypeScript and diff checks pass | Exact five-file change |
| GitHub admin dashboard CI | Success | Run 34741362253 on reviewed head |
| GitHub admin session security CI | Success | Run 34741362252 on reviewed head |
| GitHub PDF documents CI | Success | Run 34741362251 on reviewed head |
| Azure validation and dedicated image build | Success | Definition 33, run 38904, exact merge source |
| Azure production deployment | Completed/succeeded | Run 38904; ready admin revision 0000009; final source/image readback matches PR333 merge |

These tests supplement the PostgreSQL session/Academy, revocation, migration and gateway checks recorded in the original acceptance document. They do not establish unlimited production throughput.

## Authenticated production acceptance

The owner restored both Craves and Azure access using the browser sign-in flow. No credentials, OTPs, cookies or tokens were copied into the evidence. The tests below used the existing authorized owner, not manufactured identities or production role grants.

| Expected behavior | Actual result | Result |
|---|---|---|
| Administration protected dashboard loads | Operational dashboard headings load; live Refresh completes without an error alert | PASS |
| Delivery Intelligence protected dashboard loads | Delivery activity, provider decisions, engine activity, recovery health and attention queue load; Refresh completes without an error alert | PASS |
| Enabled Academy loads its real catalog | Nine courses and existing Craves branding displayed | PASS |
| Protected lesson source loads | CurrentUser.java loaded through the source viewer at pinned course revision 4d042c58; source text nonempty | PASS |
| Incomplete quiz cannot submit | Submit disabled with zero answers and with only one answer | PASS |
| Complete quiz saves | First identity lesson scored 100%; 40 XP and one of 18 sections saved | PASS |
| Progress persists across full reload | 40 XP, one completed section and 50% first-course progress retained | PASS |
| Repeated quiz does not duplicate rewards | Separate submission reported previously earned rewards are not duplicated; still 40 XP | PASS |
| Reports load for authorized owner | Learning insights and learner progress displayed without an error alert | PASS |
| Private plans support empty state and persistence | Initial empty state observed; one genuine release plan created, saved and updated | PASS |
| Stale private-plan edits cannot overwrite newer revision | Two editors loaded revision 1; first saved revision 2; second stale save was rejected with a conflict alert, without reporting success | PASS |
| Guided text lesson and keyboard activation work | Enter started playback; chapter advanced; Enter paused. Text remained available because this browser has no local English narration voice | PASS, limited keyboard sample |
| Optional activity failure is recoverable | One warning occurred during earlier repeated quiz activity; core quiz save succeeded. Fresh lesson entry, guided playback and later progress refresh showed no recurrence | PASS for observed recovery; not an assertion of zero transient failures |
| Continued access beyond a 15-minute access-token lifetime | All three portals refreshed successfully at 06:09:56 UTC after authenticated observation began at 05:54:53.527 UTC; no further sign-in/OTP was required | PASS, real elapsed browser observation |
| Fresh page loads after new admin deployment | At 06:12 UTC all three canonical portal URLs reloaded into their authenticated dashboards without error alerts; Academy retained nine courses, 40 XP and one completed section | PASS |

The genuine private plan is titled “Administrator portal reliability release — September 2026.” It records release evidence and is retained; no synthetic customer, delivery, payment, refund or rider operation was performed. Quiz progress belongs to the owner who completed the actual learning activity.

The elapsed check demonstrates continued authenticated use and fresh protected data across the configured access-token lifetime. Cookie values, issuance times and internal rotation state were not inspected. The eight-hour boundary has controlled-clock test coverage; a real eight-hour browser soak has not been observed or scheduled.

## Deployment readback

Azure project: https://dev.azure.com/ravitejamorampudi7777/Craves

Delivery Intelligence definition 119, run 38899 is completed/succeeded, from `refs/heads/main` at `6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5`. The existing run was inspected without requeueing.

Auth activation produced ready revision `ca-craves-auth-service-prodlow--0000037`. Readback confirms `CRAVES_ACADEMY_ENABLED=true`, latest=ready, Single mode, min=1/max=1. The image remains `cravesprodlowacr82121.azurecr.io/craves/auth-service@sha256:ffdeb9a3fabc532a4b0bcd6baeff36b5b11188a036d7e353f5a7317150606070`.

Delivery Intelligence readback confirms ready revision `ca-craves-delivery-intel-prodlow--0000003`, latest=ready, Single mode, min=1/max=1, image `cravesprodlowacr82121.azurecr.io/craves/delivery-intelligence-admin@sha256:96f6ad13fc82caf2ce75d24dbd7fcedce7d5c5eaeb079bf61d6193ebbeeff33f`.

Admin pipeline 33 run 38904 was queued once against exact merge `0b0c1342713dac921ac4418b350a4c89aeecca3a`. The owner's existing environment approval was completed under the user's explicit release authorization, without changing approvers or bypassing checks. Validation, image build and deployment all succeeded. The agent queue delay resolved without a resource change or duplicate run.

Final readback at approximately 06:12 UTC confirms run 38904 completed/succeeded on `refs/heads/main` at the exact merge above. `ca-craves-admin-web-prodlow` is running `cravesprodlowacr82121.azurecr.io/craves/admin-web:0b0c1342713dac921ac4418b350a4c89aeecca3a`, with latest=ready revision `ca-craves-admin-web-prodlow--0000009`, Single mode, min=1/max=1 and `CRAVES_ADMIN_PORTAL=true`. Auth revision 0000037 and Delivery Intelligence revision 0000003 were rechecked in the same readback and remain ready at one replica. No admin image digest is asserted beyond the verified source tag.

## Limits and preservation

No replica scale-up or new resource was requested. Existing delivery/payment activation and consumer/chef/mobile authentication policies were preserved. The prior read-only Pidge feedback evidence remains in the original record; no fresh real-delivery outcome is asserted here.

Nine separate real production role identities were not exercised; the actual route tests cover their contract. Mobile viewport and OS reduced-motion behavior have source-level CSS support but were not fully exercised in this authenticated browser. Keyboard testing is limited to the observed guided lesson controls, not a complete accessibility audit. The Figma import remains unverified because the connector quota previously rejected access; its desktop import instructions remain in the original record.

One replica has finite capacity. No unlimited-load or zero-future-error guarantee is made. Rollback retains the previous healthy admin image `admin-web:6691aa2ff663e51a257407b9b1f4b5b7b4ba87d5` with one replica; preserve runtime settings and additive V7/V8 data. No rollback was triggered by an agent queue delay.
