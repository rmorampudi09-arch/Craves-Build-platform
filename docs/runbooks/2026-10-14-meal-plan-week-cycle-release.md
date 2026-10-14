# Meal plan week cycle release (subscription-service V19)

Branch `feat/meal-plan-week-cycle`. Deploy **subscription-service only**. There is no APIM change, no web deploy and no other service.

Prod runs `nearby-1ddfd1c` (main 1ddfd1c1f). A build from merged main also ships the two subscription-service changes merged since then: #491 (live runtime lock) and #493 (chef plan model/repository changes from the chef app backend).

## What changes

- **Bill lengths:**
  - New billing period `FORTNIGHTLY`, a 14-day bill.
  - `MONTHLY` bills become exactly 28 days (`plusDays(28)`, was a calendar month). This also applies to the next bill of existing monthly subscribers.
  - `WEEKLY` stays 7 days.
- **Schedules:**
  - Every new or edited schedule must be a weekday (`WEEKLY` recurrence) schedule, whatever the billing period. The chef fills in one week, and it repeats across the bill.
  - A date-based (`MONTHLY` recurrence) put returns 400 `DATE_SCHEDULES_RETIRED`.
  - A submitted or pending plan that still has a date-based draft cannot be submitted or approved (409 `DATE_SCHEDULES_RETIRED`). The admin rejects it, and the chef saves one week again.
  - Live date-based schedules keep serving their subscribers unchanged.
- **Pause allowance per paid bill:** weekly 1 day, 14-day 3 days, 28-day 7 days.
  - "Bill" means the latest PAID invoice with amount > 0. ₹0 credit invoices (extra days) are not bills.
  - A customer pause with no days left returns 409 `SUBSCRIPTION_PAUSE_ALLOWANCE_USED`.
  - A customer resume after the plan's automatic restart date returns 400 `RESUME_AFTER_AUTO_RESTART`.
  - Admin pause and resume are not limited.
- **Capacity:** a customer pause now keeps the chef's capacity. Resume re-acquires capacity only if it was released, which happens with admin pauses and pauses from before this release.
- **Automatic restart:** a new worker (every 5 min, first run 60 s after start) restarts customer pauses whose allowance ends tomorrow or earlier. It runs a day early, so breakfast sent at 20:00 the night before finds its meals. It goes through the normal resume steps, including the pause credit.
  - Env `CRAVES_SUBSCRIPTION_AUTO_RESUME_ENABLED` defaults to **true**. Pauses from before this release have no restart date, and the worker never touches them.
  - An overdue restart (worker off or failing) restarts with meals from tomorrow. It never sends the chef a late order for today; the missed day is credited.
  - If the chef's spot was released while paused, the restart puts it back without the strict capacity checks. An overbooking opens a capacity incident instead of failing.
  - Once the restart date has passed, the limit on the customer's own resume no longer applies, so a customer is never locked in.
- **API:** `GET /api/v1/subscriptions` and the pause/resume responses gain `pauseDaysPerBill`, `pauseDaysLeft` and `pauseAutoResumeDate`. These are additive, and older apps ignore them.
- **V19** (`SET LOCAL lock_timeout = '5s'`):
  - widens `ck_subscription_plan_billing_period`;
  - adds `customer_subscription.pause_bill_start`, `pause_days_used` (default 0), `paused_from` and `pause_auto_resume_date`, plus a partial index;
  - is additive, so the previous image runs fine on it.

## Before deploying (user runs these read-only SELECTs, `craves_business_db`)

```sql
SELECT status, count(*) FROM subscription_schema.customer_subscription GROUP BY status;
SELECT p.id, p.name, p.status, p.billing_period, s.recurrence_type, s.status AS schedule_status
FROM subscription_schema.subscription_plan p LEFT JOIN subscription_schema.subscription_plan_schedule s ON s.plan_id = p.id;
SELECT cs.status, count(*) FROM subscription_schema.customer_subscription cs
JOIN subscription_schema.subscription_plan p ON p.id = cs.plan_id WHERE p.billing_period = 'MONTHLY' GROUP BY cs.status;
```

- **Monthly subscribers** get 28-day bills from their next bill. The design assumed only the test subscription; if the last query shows real customers, tell them before deploying.

- **PAUSED subscriptions** are legacy pauses. They stay paused until the customer resumes, as today.
- **Plans with a `MONTHLY` recurrence** keep serving. Any `DRAFT`/`PENDING_APPROVAL` one needs the chef to save one week again in app 1.34.0.

## Deploy (Cloud Shell, single-line commands; the user runs them)

1. `mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git <MERGED_MAIN_SHA> && git checkout -q --detach FETCH_HEAD`
2. `az acr build -r cravesrm09prodlow6bf632 -t craves/subscription-service:week-cycle-<SHA7> services/subscription-service`
3. `DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh rg-craves-prodlow-centralindia ca-craves-subscription-service-p cravesrm09prodlow6bf632.azurecr.io/craves/subscription-service:week-cycle-<SHA7> subscription`
4. The same command without `DEPLOY_PREFLIGHT_ONLY`, with `READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10`.

## Smoke checks

- `curl -s https://api.craves.in/api/v1/subscriptions/plans | head -c 300` lists plans (200).
- With a customer token, `GET /api/v1/subscriptions` shows `pauseDaysPerBill` on each subscription.
- With a chef token:
  - creating a draft with `"billingPeriod":"FORTNIGHTLY"` returns 201;
  - PUT schedule with `"recurrenceType":"MONTHLY"` returns 400 `DATE_SCHEDULES_RETIRED`.
- Logs show no `Automatic plan restart failed`.

## Rollback

- Redeploy image `craves/subscription-service:nearby-1ddfd1c`. V19 stays applied; the old code ignores the new columns.
- Customer pauses started on the new image stay paused after a rollback until the customer resumes, as before.
- When rolling back, clear the running pauses so a later redeploy does not restart them at once: `UPDATE subscription_schema.customer_subscription SET paused_from = NULL, pause_auto_resume_date = NULL WHERE status = 'PAUSED';`
- `CRAVES_SUBSCRIPTION_AUTO_RESUME_ENABLED=false` turns off only the automatic restart, without a rollback. Plans then stay paused past their restart date until the customer taps Resume (allowed once the date has passed) or an admin resumes them. Check daily: `SELECT id, pause_auto_resume_date FROM subscription_schema.customer_subscription WHERE status = 'PAUSED' AND pause_auto_resume_date < current_date;`
