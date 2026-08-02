# Mobile Customer Notifications

Adds the authenticated in-app notification inbox to the React Native customer application.

## API

- `GET /api/v1/notifications/in-app?limit=50`
- `PATCH /api/v1/notifications/in-app/{noticeId}/read`

## Features

- bounded inbox list
- unread count
- pull-to-refresh
- mark as read
- safe navigation to owned orders or delivery tracking
- session clear on HTTP 401

## Privacy

Only title, body, type, target identifier, read time and created time are accepted. Raw event payloads, provider data, inbox/outbox metadata and internal keys are excluded.

Run `azure-pipelines-customer-mobile-notifications-ci.yml` later. Native build and device testing remain pending.