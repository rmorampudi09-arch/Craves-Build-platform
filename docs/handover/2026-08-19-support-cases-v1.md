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

## Durable notification implementation

The support service writes the support mutation and its `notification_outbox` row in the same Spring database transaction.

Outbox events are created when:

```text
SUPPORT_ADMIN or PLATFORM_ADMIN posts a public reply
SUPPORT_ADMIN or PLATFORM_ADMIN changes support-case status
```

Internal notes do not create requester notifications.

Event types:

```text
SUPPORT_CASE_REPLY
SUPPORT_CASE_STATUS_CHANGED
```

The event key contains the immutable support-message or status-history UUID and remains idempotent under the existing unique `notification_outbox.event_key` constraint.

The payload contains only `caseId`, `caseNumber`, and `status`; internal support notes are not copied into requester notifications.

## Production deployment sequence

1. Run `mvn -B -ntp clean verify` in `services/user-chef-service`.
2. Validate Flyway V1-V7 and confirm the existing V2 `notification_outbox` table is present.
3. Verify the existing User-Chef notification outbox dispatcher configuration remains enabled for production delivery.
4. Deploy User-Chef via `azure-pipelines-user-chef-service.yml` using the established service connection.
5. Confirm the new Container App revision is Ready/Healthy and runtime settings are preserved.
6. Create one test customer support case through the backend and confirm ownership isolation.
7. Use SUPPORT_ADMIN to post a public reply; confirm one PENDING `notification_outbox` row is created and dispatched.
8. Post an internal note; confirm no requester outbox row is created.
9. Change status; confirm status history plus a status-change outbox event.
10. Configure APIM with `scripts/apim/configure-support-cases-v1-apim.sh`.
11. Verify requester and admin routes reject requests without Bearer authorization.
12. Verify a CUSTOMER cannot use `/api/v1/admin/support/cases` even with a valid Craves JWT.
13. Roll back only APIM operations with `scripts/apim/rollback-support-cases-v1-apim.sh` if gateway exposure must be withdrawn.

## Security boundary

`SUPPORT_ADMIN` remains an internal support role. The new code grants it mutation rights only over support-case tables. It does not expand the role into account intervention, payment/refund, order mutation, chef approval, compliance, delivery, or commercial-policy domains.

## Azure/manual impact

No new Azure resource or secret is required. No Firebase, Cashfree, DNS, mobile-store, signing, or billing action is introduced. The remaining external actions are the normal User-Chef Azure DevOps pipeline execution and APIM configuration because this ChatGPT session does not have an Azure DevOps execution connector.

## Production smoke matrix

```text
CUSTOMER create/list/get/message own case
CHEF create/list/get/message own case
dual-role contextRole ownership enforcement
requester A cannot access requester B case
requester cannot use admin endpoints
SUPPORT_ADMIN list/get/public reply/internal note/status/assign-to-me
PLATFORM_ADMIN same workflow
internal note hidden from requester
support agent UUID hidden from requester
assigned support agent UUID hidden from requester
closed case rejects new messages
public reply -> durable notification outbox event
internal note -> no requester notification
status change -> durable notification outbox event
cursor remains stable under concurrent case updates
APIM missing Authorization -> 401
APIM response -> no-store
```

## Product decisions not invented

The module deliberately contains no refund eligibility, automatic compensation, cancellation eligibility, SLA promise, order transition, pricing/commission, service-radius, FSSAI or ratings/reviews rule.
