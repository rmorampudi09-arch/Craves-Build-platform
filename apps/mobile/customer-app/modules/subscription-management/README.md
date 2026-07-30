# Mobile Subscription Management

Screens:

```text
Subscriptions
SubscriptionEnrollment
```

Backend APIs:

```text
POST /api/v1/subscriptions
GET /api/v1/subscriptions
PATCH /api/v1/subscriptions/{id}/pause
PATCH /api/v1/subscriptions/{id}/cancel
```

Enrollment uses the secure mobile session, an active plan, a customer-owned saved address, a non-past `YYYY-MM-DD` start date and optional notes.

Only pause and cancel are exposed. Subscription Service owns status and service dates. No renewal, resume, unused-meal credit, refund, payout or holiday logic is implemented.

Later run `azure-pipelines-customer-mobile-subscription-management-ci.yml`, then perform Android/iOS smoke tests after native shell and Firebase setup.
