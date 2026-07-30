# Mobile Subscription Plans

React Native route: `SubscriptionPlans`.

Backend API: `GET /api/v1/subscriptions/plans`.

The screen displays active weekly and monthly plans using backend amount and currency. It stores no plan or customer data locally and exposes no internal chef identity.

`SubscriptionEnrollmentPendingScreen` is a typed placeholder so this branch builds independently. It does not create a subscription; the next stacked module replaces it with authenticated enrollment.

No renewal, unused-meal, refund, credit, payout or holiday rule is implemented.

Later run `azure-pipelines-customer-mobile-subscription-plans-ci.yml`, complete the reviewed native shell, and perform Android/iOS smoke tests.
