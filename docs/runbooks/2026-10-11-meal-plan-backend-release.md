# Meal plan backend release (subscription-service V18), 2026-10-11

Branch `feat/meal-plan-backend`. It backs the redesigned meal-plan screens in app 1.26.0. The app already works without this release; the release turns on plan photos, ratings data paths, the "Renews" date, the order tracker, chef photo upload and the chef "Accepting new subscribers" switch.

## What changes in production

- **V18 migration (runs once, cannot be undone):**
  - Adds `subscription_plan.accepting_subscribers` (default TRUE) and the `subscription_plan_image` table.
  - Turns customer pause, resume, skip and cancel ON for every untouched platform-default policy. Pause and cancel cutoff become 0; skip and resume need 1440 minutes (24 hours).
  - Policies an admin saved are left alone.
- **New plans** get the same enabled defaults.
- **New response fields (all additive):**
  - public plan `imageUrl`;
  - subscription `planName`, `billingPeriod`, `amount`, `currency`, `nextBillingDate`, `planImageUrl`;
  - occurrence `orderId`;
  - chef plan `imageUrl`, `acceptingSubscribers`.
- **New routes:**
  - public `GET /api/v1/subscriptions/plans/{planId}/image`;
  - chef `PUT /api/v1/chef/subscription-plans/{planId}/image` (multipart `file`; JPEG or PNG only, up to 2 MiB and 4096 px on a side, so a normal 12 MP phone photo is accepted; DRAFT or REJECTED plans only);
  - chef `PATCH /api/v1/chef/subscription-plans/{planId}/accepting-subscribers` (ACTIVE plans only).
- **Customer-facing effects:**
  - Plans with `accepting_subscribers = FALSE` disappear from the public list.
  - Creating a subscription to such a plan returns 409 `PLAN_NOT_ACCEPTING_SUBSCRIBERS`.
  - Existing subscribers are unaffected.
- **Unchanged:** cancel still takes effect immediately, by user decision.
- **`nextBillingDate` (customer subscription) is the next charge date:** the next unbilled cycle start minus the billing lead (`CRAVES_SUBSCRIPTION_BILLING_HORIZON_DAYS`, 7), never earlier than today. It is null while `CRAVES_SUBSCRIPTION_BILLING_GENERATOR_ENABLED` is false, because nothing renews then; the app falls back to "Paid until".
- **Pause and cancel cutoffs protect the earliest meal still ahead** (a generated occurrence that is not skipped, cancelled or failed, else the next scheduled date if it is in the future). Before, they used `next_service_date`, which only moves while the occurrence generator runs, so with the generator off every pause or cancel after the first meal day returned 409.
- **V18 sets `lock_timeout` to 5 s.** If a long transaction holds `subscription_plan`, the migration fails, the new revision does not become healthy, and the old revision keeps serving. Retry the deploy.
- **Customer web (`apps/customer-web-next`, same branch):** a 0-minute cutoff reads "any time before a meal" instead of "up to 0 minutes", and a subscription to a plan that is no longer listed (closed to new subscribers) shows its own `planName` instead of "Meal plan". Both are backward compatible.

## Known issue: fix before turning on automatic billing

Pause and resume do not move `next_billing_date`. With `CRAVES_SUBSCRIPTION_BILLING_GENERATOR_ENABLED=true`, a customer who pauses past a cycle and then resumes would be invoiced for the paused cycles (one invoice per cycle, from the old date). Billing is off in production today (handover notes), so nothing is charged now. Do not enable the billing generator until resume shifts `next_billing_date` (decide whether paused days are credited).

## Before merge

1. CI must run the Postgres-gated tests. They passed locally on 2026-10-11 against an embedded Postgres 16 (121 then 126 subscription-service tests, 0 skipped); CI must still confirm. These are `SubscriptionMigrationDatabaseTest` (V18 fixtures), `SubscriptionPresentationDatabaseTest` and `ChefPlanImageDatabaseTest`. Confirm the launch CI shows no skips.

## Before deploy: read-only production checks

The old default note is `Craves platform default: customer self-service pause, resume, cancel and skip are disabled until explicitly configured.`

**(a) Old-note policies that are not untouched defaults** (expected 0; V18 leaves these alone):

```sql
SELECT count(*) AS old_note_but_not_untouched_default
FROM subscription_schema.subscription_plan_policy
WHERE status = 'ACTIVE'
  AND notes = 'Craves platform default: customer self-service pause, resume, cancel and skip are disabled until explicitly configured.'
  AND (version > 1
       OR pause_cutoff_minutes IS NOT NULL OR resume_lead_minutes IS NOT NULL
       OR cancel_cutoff_minutes IS NOT NULL OR skip_cutoff_minutes IS NOT NULL
       OR holiday_policy_reference IS NOT NULL OR unused_meal_policy_reference IS NOT NULL
       OR refund_policy_reference IS NOT NULL);
```

**(b) PAUSED subscriptions that become customer-resumable.** These were paused by an admin, because customers couldn't pause before. Decide on each one before deploying: resume it, cancel it, or accept that the customer can resume it.

```sql
SELECT count(*) AS paused_subscriptions_that_become_customer_resumable,
       count(DISTINCT s.plan_id) AS plans
FROM subscription_schema.customer_subscription s
JOIN subscription_schema.subscription_plan_policy p
  ON p.plan_id = s.plan_id AND p.status = 'ACTIVE'
WHERE s.status = 'PAUSED'
  AND p.notes = 'Craves platform default: customer self-service pause, resume, cancel and skip are disabled until explicitly configured.'
  AND p.customer_pause_enabled = FALSE AND p.customer_resume_enabled = FALSE
  AND p.customer_cancel_enabled = FALSE AND p.customer_skip_enabled = FALSE
  AND p.version = 1
  AND p.pause_cutoff_minutes IS NULL AND p.resume_lead_minutes IS NULL
  AND p.cancel_cutoff_minutes IS NULL AND p.skip_cutoff_minutes IS NULL
  AND p.holiday_policy_reference IS NULL AND p.unused_meal_policy_reference IS NULL
  AND p.refund_policy_reference IS NULL;
```

## Deploy

1. Merge the PR into `main`. The launch regression CI must pass.
1. Deploy customer web first (`Craves (14)` with `operation=web`, which also redeploys admin). The web changes work against the current backend too, and this avoids customers seeing "up to 0 minutes" once V18 is live.
2. Run `azure-pipelines-subscription-service.yml` (manual; container app `ca-craves-subscription-service-p`). Wait for the new revision to be Ready and healthy.
3. Run `CONFIRM_APIM_WRITE=true bash scripts/apim/configure-meal-plan-image-apim.sh` by hand, with an `az login` session. It adds only the public image operation, with a cacheable policy.
4. Run `configure-chef-subscription-plan-workflow-apim.sh` through `azure-pipelines-subscription-backoffice-apim.yml` with `confirmApimWrite=true`. It adds the chef PUT image and PATCH accepting-subscribers operations.
5. **Do not** re-run `configure-subscription-backoffice-apim.sh` for this release. It re-creates the removed admin authoring routes.

## After deploy

**(c) Old-note ACTIVE policies left over** (expect 0, or the count from (a)):

```sql
SELECT count(*) AS old_note_still_active
FROM subscription_schema.subscription_plan_policy
WHERE status = 'ACTIVE'
  AND notes = 'Craves platform default: customer self-service pause, resume, cancel and skip are disabled until explicitly configured.';
```

If the count is above (a), the old revision approved a plan during the rolling deploy. Re-run the V18 policy statement (the `WITH updated AS (UPDATE …) INSERT INTO …_audit` block in `V18__meal_plan_presentation_and_default_policy.sql`). It is idempotent and touches only untouched defaults.

Live checks:
- `GET https://api.craves.in/api/v1/subscriptions/plans/<id>/policy` shows all four flags true, with cutoffs 0/1440/0/1440.
- For a plan with a photo, `curl -sI "https://api.craves.in/api/v1/subscriptions/plans/<planId>/image?v=1"` returns 200, `Cache-Control: public, max-age=86400` and `nosniff`. A plan without a photo returns 404 `PLAN_IMAGE_NOT_FOUND`.
- With a chef token, a PUT image on a draft returns 200 with `imageUrl`, and a PATCH `{"acceptingSubscribers":false}` on an ACTIVE plan returns 200. A 404 with no JSON `code` means the APIM operation is missing.

## Rollback

- **APIM image operation:** `CONFIRM_APIM_ROLLBACK=true bash scripts/apim/configure-meal-plan-image-apim.sh --rollback` removes it.
- **Service:** redeploy the previous image digest. V18 stays applied: its columns and table are additive, and the old code ignores them. The enabled policies stay enabled; set an all-off policy through the admin policy endpoints if needed.
