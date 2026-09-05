# In-App Notification Inbox v2

## Purpose

This backend-only module upgrades the persisted Craves in-app notification inbox for production-scale customer and chef journeys while preserving the existing notification API.

It does not change Firebase phone OTP, email provider configuration, push-provider activation, order status rules, payment rules, or any frontend code.

## Backward compatibility

The existing endpoint remains available:

```http
GET /api/v1/notifications/in-app?limit=50
```

Existing single-notice read behavior also remains unchanged:

```http
PATCH /api/v1/notifications/in-app/{noticeId}/read
```

## New endpoints

### Cursor-paged inbox

```http
GET /api/v1/notifications/in-app/page?limit=50&unreadOnly=false&cursor=<opaque-cursor>
```

Response:

```json
{
  "notices": [],
  "nextCursor": null,
  "hasMore": false
}
```

Rules:

```text
limit = 1..100
cursor = optional opaque URL-safe token
unreadOnly = false by default
```

The cursor represents the final `(created_at, id)` tuple from the current page. The repository queries the next page using strictly older rows and orders by:

```text
created_at DESC, id DESC
```

This avoids offset-pagination drift when a new notification is inserted while the customer or chef is scrolling.

### Unread count

```http
GET /api/v1/notifications/in-app/unread-count
```

Response:

```json
{
  "unreadCount": 7
}
```

### Mark all read

```http
PATCH /api/v1/notifications/in-app/read-all
```

Returns `204 No Content`.

The operation is idempotent: notices already marked read remain unchanged.

## Security

All customer/chef inbox endpoints resolve the authenticated Craves identity from `CravesPrincipal`. A caller cannot supply another identity ID in the request path or query string.

The database repository always scopes reads and writes by `recipient_identity_id`.

## Database migration

```text
V5__in_app_notification_inbox_indexes.sql
```

Adds:

```text
idx_in_app_notification_recipient_cursor
idx_in_app_notification_recipient_unread_cursor
```

The second index is partial (`WHERE read_at IS NULL`) to keep unread-only pages and unread badge counts efficient as historical notifications grow.

## Files

```text
services/notification-service/src/main/java/in/craves/notification/domain/AppNoticeCursor.java
services/notification-service/src/main/java/in/craves/notification/service/AppNoticeCursorCodec.java
services/notification-service/src/main/java/in/craves/notification/api/AppNoticePageResponse.java
services/notification-service/src/main/java/in/craves/notification/api/UnreadCountResponse.java
services/notification-service/src/main/java/in/craves/notification/api/AppNotificationController.java
services/notification-service/src/main/java/in/craves/notification/service/NotificationService.java
services/notification-service/src/main/java/in/craves/notification/repository/NotificationRepository.java
services/notification-service/src/main/resources/db/migration/V5__in_app_notification_inbox_indexes.sql
services/notification-service/src/test/java/in/craves/notification/service/AppNoticeCursorCodecTest.java
services/notification-service/src/test/java/in/craves/notification/service/NotificationServiceInboxTest.java
```

## Local test

```bash
cd services/notification-service
mvn -B -ntp clean verify
```

Recommended integration checks:

```text
first inbox page
second page with returned cursor
new notification inserted between page requests
unreadOnly=true
unread count before and after marking one read
mark-all-read with zero unread notices
mark-all-read with many unread notices
malformed cursor -> 400
limit 0 -> 400
limit 101 -> 400
identity isolation between two users
```

## Azure impact

No Azure resource provisioning and no new secret are required. The normal Notification Service Azure DevOps deployment pipeline should build the Java 21 service, run Flyway V5, deploy the image without replacing runtime secrets, and then verify health/readiness.

## Deliberately excluded

This module does not define or modify:

```text
notification marketing preferences
promotional campaigns
ratings/reviews
commercial rules
payment/refund policy
order cancellation policy
Firebase OTP behavior
push provider credentials
email provider credentials
web/mobile UI
```
