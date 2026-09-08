# CRAVES Delivery Intelligence Admin Dashboard — Full Engineering Handover

**Date:** 2026-09-08  
**Repository:** `rmorampudi09-arch/Craves-Build-platform`  
**Implementation branch:** `feature/admin-delivery-intelligence-dashboard-20260908`  
**Target branch:** `main`  
**Primary release YAML:** `azure-pipelines-admin-dashboard.yml`  
**Figma:** `Craves Delivery Intelligence Admin Dashboard` — `https://www.figma.com/design/e7FYj4WYLr3OWgFxTHSX73`

---

## 1. Executive summary

Craves now has an implementation-ready administrator module that explains what the existing Intelligent Delivery engine is doing without changing delivery business logic. The module provides a high-level operational dashboard, provider performance and delivery trend views, recent routing decisions, exceptions, and an audited per-order investigation screen.

## 2. User requirement captured

The requested outcome was a premium Craves-branded dashboard showing what the intelligent delivery tracking/routing system is doing, available to administrators, with graphs, newest-to-oldest history, per-order investigation, Figma source, a new immutable container image, and one Azure pipeline with minimal manual work.

## 3. Architecture decision

The implementation does not introduce a new delivery microservice. Read-only administrator endpoints are added to the existing Spring Boot Integration Service because the authoritative assignment, candidate, provider, job, event, webhook, telemetry, and outcome data already live there.

## 4. Frontend decision

The dashboard is added to the existing Next.js admin application under `apps/customer-web-next`. This preserves the existing administrator sign-in flow, AdminWorkspace navigation, Craves logo component, typography, colors, session cookie handling, and global admin shell.

## 5. Container decision

A dedicated Dockerfile and immutable image repository were added for the requested Delivery Intelligence release image. The image is deployed into the already existing Admin Container App rather than creating another Azure runtime resource.

## 6. Billing decision

No new Azure Container App, APIM instance, ACR, database, Redis instance, or other paid Azure resource is created by this module. The deployment fails closed if the existing Admin Container App is missing.

## 7. Existing Azure resources reused

The release reuses resource group `rg-craves-prodlow-centralindia`, ACR `cravesprodlowacr82121`, Integration Container App `ca-craves-integration-service-pr`, Admin Container App `ca-craves-admin-web-prodlow`, and Azure DevOps service connection `Craves-Dev-Service-Connection`.

## 8. Existing APIM resource reused

The dashboard extends the already existing admin operational investigations API `craves-admin-operational-investigations-v1`. It does not create a second admin API or change the public path ownership model.

## 9. Branding

The production UI reuses `CravesLogo` and `AdminWorkspace`. The new navigation entry is placed in the Operations group so the dashboard looks and behaves like the rest of the Craves administrator control center.

## 10. Figma deliverable

An editable Figma file was created with two desktop operational designs: Delivery Intelligence Overview and Order Investigation. The file includes Craves admin navigation, KPI cards, delivery activity graph, provider performance, recent engine decisions, exceptions, candidate ranking, tracking projection, and lifecycle timeline.

## 11. Overview route

The new administrator page is:

```text
/admin/delivery-intelligence
```

## 12. Browser BFF summary route

The browser calls:

```text
GET /api/admin/delivery-intelligence/summary?windowHours=24|168|720
```

The BFF forwards the authenticated HTTP-only Craves access token to the API gateway and validates the response with Zod before returning it to the browser.

## 13. Browser BFF investigation route

Order investigation uses:

```text
POST /api/admin/delivery-intelligence/investigate
```

The request is same-origin protected and requires an order UUID plus a 10-500 character investigation reason.

## 14. Integration Service summary endpoint

The new backend summary endpoint is:

```text
GET /api/v1/admin/operations/delivery-intelligence/summary?windowHours=...
```

The backend accepts a bounded operational window from one hour through 720 hours. The production UI offers 24 hours, seven days, and 30 days.

## 15. Integration Service investigation endpoint

The audited order endpoint is:

```text
GET /api/v1/admin/operations/delivery-intelligence/orders/{orderId}
```

It requires `X-Admin-Reason`; `X-Correlation-ID` may be supplied and is echoed on success.

## 16. Summary metric — assignments

The dashboard counts persisted `delivery_assignment` rows in the selected operational window. This reports actual intelligent routing decisions recorded by Craves rather than a browser-derived approximation.

## 17. Summary metric — delivered

Completed deliveries are counted from `delivery_job.delivered_at` within the selected operational window.

## 18. Summary metric — active

The dashboard counts recent delivery jobs that are not in terminal delivery states. This is an operational count; it does not change tracking behavior.

## 19. Summary metric — fallback

Fallback is derived from the persisted selected assignment candidate rank. A selected candidate with rank greater than one is treated as evidence that the engine moved past the top-ranked candidate.

## 20. Summary metric — exceptions

Operational attention includes failed jobs, dead-letter delivery commands, and failed/rejected webhook processing. Exception cards link administrators into the order investigation workflow.

## 21. Delivery activity graph

A bounded daily trend is queried directly in PostgreSQL. The frontend renders assignments and delivered jobs side-by-side without adding a new charting dependency.

## 22. Provider performance panel

The provider panel combines the existing provider registry, selection counts, recent `delivery_score_hot` outcomes, and `delivery_partner_rolling_state`. It does not statically label a provider as production accepted.

## 23. Provider truthfulness rule

The UI deliberately avoids a static statement such as "Borzo Live" or "Shadowfax Live". Provider names, registry state, selection volume, and outcome scores are runtime evidence only; production acceptance remains a separate integration-readiness concern.

## 24. Recent engine decisions

The dashboard shows the latest 30 persisted assignments with order ID, selected provider, selected rank, final candidate score, pickup ETA, selected candidate state, scoring version, and creation time.

## 25. Newest-to-oldest behavior

The overview recent-decision and exception queries order records descending by recorded time. The order lifecycle view independently sorts its combined command/event/outcome timeline newest first.

## 26. Candidate explainability

Per-order investigation returns the persisted candidate records instead of recalculating the score in JavaScript. The page shows provider, rank, pickup distance/ETA, quote, success probability, live/stored averages, momentum, exploration sample, provider-quality score, proximity score, final score, and candidate status.

## 27. Intelligent routing strategy evidence

The page exposes the persisted assignment strategy and scoring version so an administrator can see which implementation actually made the decision for a specific order.

## 28. Delivery command evidence

The investigation includes delivery command type, state, ready/dispatch times, attempts, reconciliation provider/state, next reconciliation time, and a sanitized bounded error string when present.

## 29. Delivery job evidence

The investigation includes the provider-neutral delivery job, provider and provider delivery reference, assignment relation, normalized status, provider status, booking/pickup/delivery times, tracking observation source, ETA projection, and telemetry timestamps.

## 30. Provider-neutral telemetry

The module uses the telemetry projection already introduced by `V112__delivery_telemetry_projection.sql`. It reads the latest courier coordinates, courier observation time, pickup/drop-off estimate windows, telemetry observation time, and telemetry source (`TRACK` or `WEBHOOK`).

## 31. Delivery event timeline

Normalized `delivery_event` records are joined to the order through `delivery_job`. The UI does not expose the raw event payload column.

## 32. Outcome evidence

When a final outcome exists, `delivery_score_hot` contributes provider ID, composite score, final status, distance, area, and occurrence time to the investigation timeline.

## 33. Raw provider payload policy

Raw webhook bodies, request-context JSON, candidate provider metadata JSON, delivery event raw payloads, and secrets are not returned to the browser by the new controller.

## 34. Admin access model

The Integration Service endpoint accepts the existing administrative roles `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, `PAYMENTS_ADMIN`, `OPERATIONS_ADMIN`, and `AUDIT_ADMIN`, while the AdminWorkspace remains protected by the existing administrator identity/session gate.

## 35. Courier coordinate restriction

Exact courier latitude/longitude is field-redacted unless the principal has `PLATFORM_ADMIN`, `SUPPORT_ADMIN`, or `OPERATIONS_ADMIN`. Other administrators still receive operational state, provider, ETA windows, observation timestamps, and telemetry source.

## 36. Investigation audit

Each successful per-order investigation appends an `INVESTIGATE` record to the existing `payment_schema.admin_investigation_audit` table. The audit captures actor identity, resource type `DELIVERY_ORDER`, order UUID, reason, correlation ID, and timestamp.

## 37. Cache policy

Backend and BFF responses use no-store behavior. This prevents administrator operational evidence from being intentionally browser/proxy cached as reusable dashboard data.

## 38. CSRF/origin protection

The browser investigation route uses the existing same-origin request-security helper before accepting the POST body.

## 39. Response validation

New Zod contracts reject malformed backend responses rather than allowing loosely typed provider or delivery data to flow into the UI.

## 40. Database indexes

`V115__delivery_intelligence_admin_dashboard_indexes.sql` adds bounded read indexes for assignment creation time, delivery job creation/status and delivered time, command creation/status, webhook receive/status, and delivery event occurrence time.

## 41. No delivery behavior change

The new migration adds indexes only. It does not modify scoring weights, provider eligibility, delivery radius, pricing, commissions, routing strategy, payment flow, webhook semantics, delivery creation, cancellation, or tracking workers.

## 42. New Dockerfile

The requested image is built from:

```text
apps/customer-web-next/Dockerfile.delivery-intelligence-admin
```

It uses Node 24 Alpine and the existing Next.js standalone production output.

## 43. New immutable admin image

The pipeline pushes:

```text
<existing ACR>/craves/admin-delivery-intelligence:<Build.BuildId>
```

This gives the dashboard a distinct immutable release image while continuing to use the existing admin runtime.

## 44. Integration Service immutable image

The same run also builds:

```text
<existing ACR>/craves/integration-service:<Build.BuildId>
```

This is required because the read API and the dashboard must be deployed together.

## 45. Integration deployment safety

Integration Service deployment uses `scripts/release/deploy-single-service-preserve-runtime.sh`, preserving existing runtime environment, managed identity, Key Vault-backed secret references, ingress settings, and rollback evidence while changing the immutable image.

## 46. APIM operations

The pipeline runs `scripts/apim/configure-delivery-intelligence-dashboard-apim.sh`, which writes exactly two operations inside the existing administrator API: summary and per-order investigation.

## 47. APIM authentication

The new APIM operations reuse the existing authenticated administrator policy. The script verifies Bearer-header enforcement and response hardening after the write.

## 48. APIM fail-closed behavior

The APIM script refuses to create another API if `craves-admin-operational-investigations-v1` is missing. It also refuses an unexpected subscription-key requirement.

## 49. Admin Container App deployment

The release only updates the image on existing `ca-craves-admin-web-prodlow`. It does not add environment secrets or replace the app configuration.

## 50. Admin deployment health gate

The pipeline waits for the exact new immutable admin image to appear in a provisioned, healthy, active Container App revision before continuing to HTTP smoke tests.

## 51. Route smoke tests

The final stage verifies HTTP 200 for `/admin`, `/admin/operations`, and `/admin/delivery-intelligence` on the dedicated Admin Container App FQDN.

## 52. Signed-out API guard test

The final stage verifies that a signed-out summary request returns 401, `Cache-Control: no-store`, and the expected authentication-required body.

## 53. Signed-out investigation guard test

The final stage sends a same-origin POST with a synthetic UUID/reason and verifies that the unauthenticated investigation path is denied with HTTP 401.

## 54. One-pipeline release

The only YAML the operator needs for this module is:

```text
azure-pipelines-admin-dashboard.yml
```

It validates, builds both immutable images, deploys Integration Service, configures APIM, deploys the Admin image, and smoke-tests the result.

## 55. Existing pipeline variables reused

The pipeline uses the existing `CRAVES_API_BASE_URL`, Firebase public web configuration values, and `NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY` already expected by the Admin application. No new delivery-provider credential is required by this dashboard.

## 56. Secret handling

Do not paste Azure/Firebase/provider secrets into chat. Existing sensitive values must remain in the approved Azure DevOps variable/Key Vault configuration. This module does not request new provider keys.

## 57. Razorpay/Cashfree impact

The dashboard does not modify Razorpay credentials, payment routing, webhook configuration, Cashfree optional code, checkout, or payment state. The admin image explicitly continues to build in production Razorpay mode with catalog fallback disabled.

## 58. Manual steps required before production

The only intended human actions are: review/merge the GitHub PR into `main`, then run the existing Azure DevOps pipeline backed by `azure-pipelines-admin-dashboard.yml` from `main` if it is not automatically started by the existing pipeline definition. No Azure Portal resource creation is required.

## 59. Manual steps not required

No new DNS record, custom domain, SSL binding, Firebase project/provider, Cashfree/Razorpay credential, mobile signing key, store-console action, PostgreSQL server, Redis cache, ACR, APIM instance, or Container App needs to be created.

## 60. Local frontend validation

From `apps/customer-web-next`:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm run test
npm run build
```

## 61. Local backend validation

From `services/integration-service`:

```bash
mvn -B -ntp clean verify
```

## 62. Local end-to-end validation

Run the admin app with the standard existing environment variables and an HTTPS Craves API base. Sign in with an administrator account, open `/admin/delivery-intelligence`, load 24h/7d/30d windows, and investigate an order UUID with a valid reason.

## 63. Production validation after pipeline

After the pipeline succeeds, sign in to the existing Admin portal and confirm the Operations navigation contains Delivery Intelligence, the overview renders runtime data, and an actual known delivery order produces the persisted candidate/job/event evidence expected from Integration Service.

## 64. Expected empty-state behavior

A period with no recent delivery activity may legitimately show zero metrics/empty recent decisions. A valid order with no delivery activity returns a not-found investigation result rather than fabricated data.

## 65. Provider-production-readiness caveat

This dashboard observes Craves delivery-engine records. It must not be used as proof that a provider is commercially or technically production-accepted unless a real production create/accept/track lifecycle has independently been verified.

## 66. Scale consideration

Dashboard queries are bounded and indexed, but this remains an operational read model on the Integration PostgreSQL database. If Craves reaches very high sustained admin/analytics query volume, the next scale step should be a replicated/streamed analytics projection rather than running large ad-hoc historical queries against the transactional database.

## 67. Why no separate analytics database now

Creating a dedicated analytics store would add cost, deployment complexity, replication semantics, and more manual Azure work without being necessary for the present administrator use case. The 30-day bounded, indexed operational dashboard is the lower-risk first production design.

## 68. Why no real-time WebSocket/SSE infrastructure now

The current page refreshes from persisted authoritative data. It avoids a new streaming infrastructure dependency. Provider tracking continues to be driven by the existing webhook/polling subsystem, not the dashboard.

## 69. Read-only principle

There are intentionally no buttons for force-dispatch, provider override, cancellation, retry, reassignment, or score modification. Those actions could change a customer delivery and require separate product/operational policy and audited command workflows.

## 70. Current Git diff scope

At handover the feature branch is ahead of `main` and contains only the dashboard backend, migration, BFF/contracts, UI/navigation, dedicated Dockerfile, APIM script, pipeline change, README, and this handover. No unrelated Craves module was intentionally modified.

## 71. Files added — backend

```text
services/integration-service/src/main/java/in/craves/integration/admin/AdminDeliveryIntelligenceDashboardController.java
services/integration-service/src/main/resources/db/migration/V115__delivery_intelligence_admin_dashboard_indexes.sql
```

## 72. Files added — frontend

```text
apps/customer-web-next/src/app/admin/delivery-intelligence/page.tsx
apps/customer-web-next/src/app/api/admin/delivery-intelligence/summary/route.ts
apps/customer-web-next/src/app/api/admin/delivery-intelligence/investigate/route.ts
apps/customer-web-next/src/components/admin-delivery-intelligence.tsx
apps/customer-web-next/src/lib/admin-delivery-intelligence-contract.ts
```

## 73. Files added — container/deployment

```text
apps/customer-web-next/Dockerfile.delivery-intelligence-admin
scripts/apim/configure-delivery-intelligence-dashboard-apim.sh
```

## 74. Files modified

```text
apps/customer-web-next/src/components/admin-workspace.tsx
azure-pipelines-admin-dashboard.yml
```

## 75. Files added — documentation

```text
apps/customer-web-next/modules/admin-delivery-intelligence/README.md
docs/handover/2026-09-08-delivery-intelligence-admin-dashboard.md
```

## 76. Design-to-code mapping

Figma overview maps to the KPI/TrendChart/Provider Performance/Recent Decisions/Exceptions sections in `admin-delivery-intelligence.tsx`. Figma Order Investigation maps to the audited search, summary, latest tracking projection, candidate ranking, and lifecycle timeline sections in the same component.

## 77. Audit reason UX

The UI explicitly labels the investigation reason as audited. It does not silently auto-generate a reason because the human operator should state why a specific order was inspected.

## 78. Correlation handling

The BFF generates a new UUID for each investigation, forwards it to Integration Service, checks the echoed correlation ID when supplied, then displays it in the investigation detail for support traceability.

## 79. Error sanitization

The backend strips line breaks and bounds surfaced delivery command error text to 500 characters before returning it to the UI.

## 80. No raw webhook troubleshooting in browser

If an administrator needs raw provider webhook debugging, that should remain in controlled backend/logging evidence rather than be added to this general admin dashboard. This reduces accidental exposure of provider/customer data.

## 81. Rollback — Integration Service

The existing preserve-runtime deployment helper records/protects the previous healthy revision and refuses unexpected secret/runtime changes. Follow its printed diagnostics if a new revision fails.

## 82. Rollback — Admin image

The final pipeline stage captures the previous admin image before updating. The previous immutable image is printed in pipeline output and can be restored through the existing Container App release procedure if required.

## 83. Rollback — APIM operations

The APIM change is additive and limited to two operations inside the existing API. If rollback is necessary, remove those two operations after the application rollback; do not delete the shared administrator API.

## 84. Migration rollback policy

The Flyway migration is additive indexes only and follows the existing immutable migration-history policy. Do not edit or renumber an applied migration after production execution.

## 85. Data retention assumption

The dashboard reads whatever operational history is retained in the existing delivery tables. It does not introduce a new retention policy. The maximum dashboard query window is 30 days even if older rows remain.

## 86. Performance risk

The largest scale risk is future administrator analytics volume on transactional PostgreSQL. The indexes and bounded windows mitigate the present risk; longer historical BI should be moved to a separate projection later.

## 87. Security risk

Courier location is operationally sensitive. The implementation already restricts exact coordinates to operational/platform/support roles and omits raw payloads. Any future map/history feature should preserve that least-privilege rule.

## 88. Product risk

Do not interpret a high provider score as permission to activate a provider for production delivery. Provider commercial approval, credentials, create contract, webhook contract, and full lifecycle acceptance remain separate controls.

## 89. Operational risk

The dashboard is observational. If an order appears stuck, administrators should use existing approved investigation/repair processes rather than adding ad-hoc database mutations from this page.

## 90. Pipeline risk control

The pipeline performs validation before image build/deployment and APIM writes occur only after the new Integration Service revision has passed deployment readiness. Admin deployment occurs only after APIM configuration succeeds.

## 91. Figma status

The Figma file is populated and editable, not a placeholder. The two primary screens were written directly into the file and can be refined later without blocking the implementation.

## 92. Implementation status

Code, migration, frontend, BFF, image, APIM script, pipeline, README, and Figma source are completed on the feature branch. Production deployment has not been claimed until the Azure pipeline succeeds on the merged commit.

## 93. Validation status

A repository comparison confirms the feature branch is based directly on current `main` with no behind commits at the time of implementation. This chat execution environment could not clone GitHub because outbound DNS is unavailable, so local compile execution here is not claimed.

## 94. Authoritative validation gate

`azure-pipelines-admin-dashboard.yml` runs the actual Maven, npm lint, TypeScript, tests, Next.js build, immutable image builds, Azure revision health checks, APIM verification, and HTTP smoke tests. A failed stage must be treated as a failed release.

## 95. What success means

Production success means the single pipeline completes all stages, the admin Container App serves `/admin/delivery-intelligence`, unauthenticated API requests are rejected, an authenticated administrator can load the overview, and a known delivered/in-flight order can be investigated with correlated persisted evidence.

## 96. What success does not mean

Dashboard success does not certify Borzo, Shadowfax, Delhivery Local, Shiprocket QUICK, or any provider as fully production accepted. That certification requires independent real production delivery lifecycle evidence.

## 97. Immediate operator action

Merge the Delivery Intelligence PR after review, then run the existing Azure DevOps pipeline backed by `azure-pipelines-admin-dashboard.yml` from the merged `main` commit.

## 98. After-pipeline operator check

Open the Admin portal, select **Operations → Delivery Intelligence**, verify the selected time window shows sensible persisted data, then investigate one known Craves order using a support reason. Record the pipeline Build ID and investigation correlation ID as deployment evidence.

## 99. Pending enhancements, not blockers

Future optional enhancements include server-sent live refresh, geo-map visualization of authorized courier coordinates, dedicated analytics projection for long retention, downloadable investigation evidence, and approved repair actions. None are required for this module to satisfy the current request.

## 100. Final handover state

The module is intentionally production-oriented, read-only, audited, provider-neutral, and integrated with Craves' existing admin/security/deployment architecture. The remaining release action is the controlled merge and the single Azure pipeline execution; no additional Azure resource provisioning is part of this implementation.
