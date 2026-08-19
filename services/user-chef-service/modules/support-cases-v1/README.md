# Support Cases v1

## Purpose

Backend support-case workflow for Craves customers, home chefs, and authorized internal support administrators. This module is intentionally hosted inside User & Chef Service so it reuses the existing authenticated identity boundary and does not provision a new runtime service or paid Azure resource.

No customer/chef web or mobile frontend is modified by this module.

## Requester roles

A caller must own at least one of:

```text
CUSTOMER
CHEF
```

A dual-role user may explicitly create a case in either active context using `contextRole`. The service rejects a context role the caller does not own.

## Internal roles

Case workflow operations are limited to:

```text
SUPPORT_ADMIN
PLATFORM_ADMIN
```

This permission applies only to the support-case domain. It does not grant account intervention, order mutation, payment, refund, settlement, delivery-provider, or commercial-policy permissions.

## Requester API

Base:

```http
/api/v1/support/cases
```

### Create case

```http
POST /api/v1/support/cases
```

Example:

```json
{
  "contextRole": "CUSTOMER",
  "orderId": "optional-order-uuid",
  "subject": "Need help with my order",
  "message": "Please check the latest status."
}
```

`orderId` is an optional reference only. Support Case v1 deliberately does not validate, modify, cancel, refund, or transition the referenced order.

### List my cases

```http
GET /api/v1/support/cases?limit=20&status=OPEN&cursor=<opaque-cursor>
```

Keyset order:

```text
updated_at DESC, id DESC
```

### Read my case

```http
GET /api/v1/support/cases/{caseId}
```

Ownership is always enforced by authenticated `requester_identity_id`.

### Add requester message

```http
POST /api/v1/support/cases/{caseId}/messages
```

Closed cases reject new messages with `409 SUPPORT_CASE_CLOSED`.

## Admin support API

Base:

```http
/api/v1/admin/support/cases
```

Operations:

```http
GET   /api/v1/admin/support/cases
GET   /api/v1/admin/support/cases/{caseId}
POST  /api/v1/admin/support/cases/{caseId}/messages
PATCH /api/v1/admin/support/cases/{caseId}/status
POST  /api/v1/admin/support/cases/{caseId}/assign-to-me
```

Admin list supports:

```text
limit
cursor
status
assignedToMe=true|false
```

`assign-to-me` is deliberate. v1 does not accept an arbitrary assignee UUID from the client because the User-Chef service does not own authoritative internal-admin role membership for another identity.

## Statuses

Technical workflow states:

```text
OPEN
IN_PROGRESS
WAITING_FOR_REQUESTER
RESOLVED
CLOSED
```

Support administrators explicitly set status. Adding a message does not invent an automatic reopening/escalation business rule.

## Messages and privacy

Requester-visible messages exclude `internal_note=true` rows in SQL.

Additionally, requester responses redact:

```text
support agent identity UUID
assigned support agent UUID
internal status notes
```

Internal senders are represented to requesters as `SUPPORT`.

Admin support responses retain the full operational audit trail.

## Durable notifications

The module reuses the existing User-Chef `notification_outbox` from Flyway V2.

The support service writes an outbox row **inside the same database transaction** when:

```text
SUPPORT_ADMIN or PLATFORM_ADMIN posts a public reply
SUPPORT_ADMIN or PLATFORM_ADMIN changes case status
```

An internal note never creates a requester notification.

Event types:

```text
SUPPORT_CASE_REPLY
SUPPORT_CASE_STATUS_CHANGED
```

Each event key includes the immutable support-message or status-history UUID, so the existing unique `notification_outbox.event_key` constraint makes enqueueing idempotent.

Notification payloads contain only:

```text
caseId
caseNumber
status
```

Internal support notes are never copied into requester notification payloads.

The existing User-Chef outbox dispatcher then retries delivery to Notification Service. Production must keep the already-existing notification dispatcher configuration enabled; this module introduces no new secret.

## Database

Flyway:

```text
V7__support_case_domain.sql
```

Tables:

```text
support_case
support_case_message
support_case_status_history
support_case_assignment_history
```

Indexes cover requester history, status queues, assigned queues, optional order reference, messages, and audit history.

## Validation

```text
page limit 1..100
cursor <= 512 characters and valid opaque keyset token
subject <= 160 Unicode code points
message <= 5000 Unicode code points
status note <= 500 Unicode code points
contextRole must be CUSTOMER or CHEF owned by caller
```

Case numbers are generated as non-sequential opaque `CRV-...` identifiers. Database uniqueness remains authoritative.

## APIM

Configure requester and admin APIs after the User-Chef revision is healthy:

```bash
bash scripts/apim/configure-support-cases-v1-apim.sh
```

Rollback only the new operations:

```bash
bash scripts/apim/rollback-support-cases-v1-apim.sh
```

APIM policies require Bearer authorization syntax and disable caching. Backend JWT/RBAC remains authoritative.

## Local / CI test

```bash
cd services/user-chef-service
mvn -B -ntp clean verify
```

Integration tests should cover:

```text
CUSTOMER creates/reads/messages own case
CHEF creates/reads/messages own case
dual-role context selection
another user cannot read case
requester cannot access admin route
SUPPORT_ADMIN admin workflow
PLATFORM_ADMIN admin workflow
internal note hidden from requester
support agent UUID hidden from requester
status note hidden from requester
assign-to-me audit row
closed case rejects messages
cursor pagination while new case updates arrive
public support reply creates notification_outbox event
internal note does not create notification_outbox event
admin status change creates notification_outbox event
```

## Azure impact

No new Azure resource, secret, DNS entry, Firebase setting, Cashfree setting, or mobile-store action is required. Deploy User-Chef Service through its existing Azure DevOps pipeline, then configure APIM.

## Deliberately excluded

Support Case v1 does not define or modify:

```text
refund eligibility or amount
cancellation eligibility
payment reversals
order state transitions
delivery provider actions
pricing or commission
service radius
FSSAI/KYC policy
ratings/reviews
SLA/response-time promises
automatic compensation
frontend support UI
```
