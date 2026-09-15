# Craves Backend Notification Inbox v2 — Convergence Handover

Date: 2026-09-11  
Service: Notification Service  
Migration: `V5__in_app_notification_inbox_indexes.sql`  
Runtime posture: source only; no Azure, Firebase, ACS, APIM or production database change

## Purpose

Converge the tested long-lived in-app notification inbox backend onto current `main` without changing channel-provider delivery, transactional notification meaning or marketing policy.

## Capabilities

### Backward-compatible bounded list

`GET /api/v1/notifications/in-app?limit=` remains available for existing clients. Ordering now uses `created_at DESC, id DESC` so equal timestamps are deterministic.

### Cursor-paged inbox

`GET /api/v1/notifications/in-app/page?limit=&cursor=&unreadOnly=` provides stable keyset paging over the authenticated recipient's own notices. Page size is constrained to 1–100. Cursors carry only creation timestamp and notice UUID.

### Unread count

`GET /api/v1/notifications/in-app/unread-count` returns the authenticated recipient's exact unread total.

### Read operations

- `PATCH /api/v1/notifications/in-app/{noticeId}/read`
- `PATCH /api/v1/notifications/in-app/read-all`

Both are idempotent and ownership constrained. A recipient cannot mutate another recipient's notice even when a valid UUID is supplied.

## Privacy boundary

Inbox response DTOs expose only:

- notice ID;
- title/body;
- notification type;
- safe target type/ID;
- read timestamp;
- creation timestamp.

They do not expose delivery addresses, device tokens, provider payloads, retry/dead-letter fields, email addresses, template internals, request keys or provider credentials.

## Existing provider behavior preserved

This convergence keeps the existing durable notification request path, Firebase Cloud Messaging adapter, Azure Communication Services email adapter, delivery-attempt persistence, recovery controls and SMS refusal unchanged.

It does not enable provider workers, alter channel preferences or turn optional availability/marketing notifications on.

## Database

V5 adds partial/keyset indexes for:

- recipient + creation time/UUID inbox traversal;
- unread recipient inbox/count access.

The migration is additive and does not rewrite existing notification rows.

## Scale and consistency

- keyset pagination avoids growing offset scans;
- page sizes are bounded;
- unread count uses the partial unread index;
- mark-all is one ownership-constrained SQL update;
- legacy and cursor reads share deterministic ordering;
- no N+1 query path is introduced.

## Product-rule boundary

This package deliberately does not define:

- optional notification frequency cap;
- quiet hours;
- marketing consent defaults;
- which future optional category should use push/email;
- notification copy for unapproved features;
- compensation or escalation behavior.

Transactional event generation remains owned by each business service. Optional category/frequency governance remains disabled until approved values exist.

## Primary paths

```text
services/notification-service/src/main/java/in/craves/notification/api/AppNoticePageResponse.java
services/notification-service/src/main/java/in/craves/notification/api/AppNotificationController.java
services/notification-service/src/main/java/in/craves/notification/api/UnreadCountResponse.java
services/notification-service/src/main/java/in/craves/notification/domain/AppNoticeCursor.java
services/notification-service/src/main/java/in/craves/notification/repository/NotificationRepository.java
services/notification-service/src/main/java/in/craves/notification/service/AppNoticeCursorCodec.java
services/notification-service/src/main/java/in/craves/notification/service/NotificationService.java
services/notification-service/src/main/resources/db/migration/V5__in_app_notification_inbox_indexes.sql
```

## Validation

Dedicated Java 21 CI runs Notification Service `mvn clean verify`, cursor/inbox tests, ownership/index checks and privacy/sensitive-output scans.

## Deployment later

1. Deploy the exact reviewed Notification Service image through the existing guarded pipeline.
2. Verify V5 checksum and index presence.
3. Keep push/email worker flags in their current approved state.
4. Publish only the additive inbox page/count/read-all operations through guarded APIM source.
5. Test two identities: cursor traversal, unread-only, count, one read and read-all; verify cross-account UUID mutation has no effect.
6. Confirm existing transactional in-app, FCM/ACS and recovery tests remain green.

No new Azure resource or secret is required. Existing PostgreSQL, Firebase and ACS bindings are reused unchanged.
