# Craves Support Cases v1 — Engineering Handover

Date: 2026-08-19
Scope: Backend + APIM only
Frontend: unchanged

## Objective

Provide a durable customer/chef issue-handling workflow without introducing refund, cancellation, payment, order, or account-policy decisions into a support module.

## Placement

No Support microservice exists in the approved architecture/deployment inventory. Support Cases v1 is therefore a bounded domain inside User & Chef Service, where the authenticated customer/chef identity already exists. This avoids a new Container App, pipeline, database, secret set, or billable Azure resource.

## Implemented

- Customer/Chef support-case creation with dual-role context selection.
- Optional order reference stored without cross-service FK or mutation authority.
- Opaque user-facing case number.
- Cursor-paged requester case history.
- Identity-owned case detail and requester messages.
- SUPPORT_ADMIN / PLATFORM_ADMIN queue, detail, public response and internal note.
- Explicit support status workflow and audit history.
- Safe self-assignment with assignment audit.
- Internal-note isolation.
- Requester redaction of staff identity UUIDs, assignment UUID and internal status notes.
- Durable Notification Service fan-out through the existing `notification_outbox` for public support replies and support status changes.
- APIM requester/admin routes with Bearer guard and no-store response policy.
- Operation-only rollback script.
- Cursor, access-guard and requester-redaction tests.

## Production deployment sequence

1. Run `mvn -B -ntp clean verify` in `services/user-chef-service`.
2. Validate Flyway V1-V7 and confirm V2 `notification_outbox` exists before V7 support triggers.
3. Deploy User-Chef via `azure-pipelines-user-chef-service.yml` using the established service connection.
4. Confirm the new Container App revision is Ready/Healthy and runtime settings are preserved.
5. Create one test customer support case through the backend and confirm ownership isolation.
6. Use SUPPORT_ADMIN to post a public reply; confirm one `notification_outbox` row is created.
7. Post an internal note; confirm no requester outbox row is created.
8. Change status; confirm status history and outbox event.
9. Configure APIM with `scripts/apim/configure-support-cases-v1-apim.sh`.
10. Verify requester and admin routes reject requests without Bearer authorization.
11. Verify a CUSTOMER cannot use `/api/v1/admin/support/cases` even with a valid Craves JWT.
12. Roll back only APIM operations with `scripts/apim/rollback-support-cases-v1-apim.sh` if gateway exposure must be withdrawn.

## Security boundary

`SUPPORT_ADMIN` remains an internal support role. The new code grants it mutation rights only over support-case tables. It does not expand the role into account intervention, payment/refund, order mutation, chef approval, compliance, delivery, or commercial-policy domains.

## Azure/manual impact

No new Azure resource or secret is required. No Firebase, Cashfree, DNS, mobile-store, signing, or billing action is introduced. The remaining external actions are the normal User-Chef Azure DevOps pipeline execution and APIM configuration because this ChatGPT session does not have an Azure DevOps execution connector.

## Product decisions not invented

The module deliberately contains no refund eligibility, automatic compensation, cancellation eligibility, SLA promise, order transition, pricing/commission, service-radius, FSSAI or ratings/reviews rule.
