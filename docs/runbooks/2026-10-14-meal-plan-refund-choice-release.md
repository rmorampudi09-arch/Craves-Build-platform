# Meal plan refund-or-extend choice release (subscription-service V20)

Branch `feat/meal-plan-refund-choice`. Deploy **subscription-service only**. The refunds switch ships **off**, so customers see no change: declined and paused days are still added at the end of the plan, as today. There is no web deploy and no other service. The APIM operation is written only when finance turns refunds on (below).

This release builds on release 1 (#505, V19, `docs/runbooks/2026-10-14-meal-plan-week-cycle-release.md`). If production subscription-service does not run #505 yet, this deploy ships release 1 too: read and follow release 1's "Before deploying" checks first.

## What changes

- **V20** (`SET LOCAL lock_timeout = '5s'`) adds the table `subscription_schema.subscription_day_credit` (one row per choice), a partial index on pending deadlines, and `customer_subscription.pause_credited_until`. It is additive, so the previous image runs fine on it.
- **Fix, switch on or off:** a customer who pauses again before the plan's restart date (after resuming) no longer has the days before that restart credited twice. Each resume records `pause_credited_until`; the next resume counts paused days only from there.
- **Switch** `CRAVES_SUBSCRIPTION_REFUND_CHOICE_ENABLED`, default **false**. While it is off:
  - a chef-declined day and the paid days of a pause are added at the end exactly as before (same code path);
  - no choice row is written;
  - `dayCredits` in the customer subscription response is an empty list;
  - `POST /api/v1/subscriptions/{subscriptionId}/day-credits/{creditId}/choice` refuses a refund with 409 `REFUNDS_NOT_AVAILABLE`.
- **With the switch on:**
  - A chef-declined paid day becomes a `DECLINE` choice (one per day). A declined day that was already free (covered only by a ₹0 credit) is added at the end at once.
  - On every resume (customer, automatic restart, admin) unpaid cycles are voided and earlier credits are laid out as before, but the newly paused paid days become one `PAUSE` choice instead of a `PAUSE_CREDIT` invoice.
  - The customer picks **Get a refund** (saved as `REFUND_REQUESTED`, amount empty: finance prices and pays it) or **Add N day(s) at the end** (a ₹0 credit invoice, exactly like today's decline credit).
  - A choice is made once. The same choice again returns the outcome; a different one returns 409 `DAY_CREDIT_ALREADY_SETTLED`. Days at the end need a running plan (ACTIVE or PAUSED), otherwise 409 `EXTEND_NOT_AVAILABLE`.
- **Deadline sweep:** every 5 min (first run 60 s after start), choices unanswered for 48 hours are settled by `SYSTEM`: days at the end if the plan runs, otherwise a refund request. It runs with the switch on or off, so choices left pending when the switch is turned off still settle. Env `CRAVES_SUBSCRIPTION_DAY_CREDIT_SWEEP_ENABLED` defaults to **true**.
- **API:** customer subscription responses gain `dayCredits` (additive; older apps ignore it). New endpoint above (CUSTOMER role, owner only; 404 `DAY_CREDIT_NOT_FOUND`, 400 `INVALID_DAY_CREDIT_CHOICE`).

## Deploy (Cloud Shell, single-line commands; the user runs them)

1. `mkdir -p ~/c8 && cd ~/c8 && git init -q && git fetch -q --depth 1 https://github.com/rmorampudi09-arch/Craves-Build-platform.git <MERGED_MAIN_SHA> && git checkout -q --detach FETCH_HEAD`
2. Record the rollback image: `az containerapp show -g rg-craves-prodlow-centralindia -n ca-craves-subscription-service-p --query 'properties.template.containers[0].image' -o tsv`
3. `az acr build -r cravesrm09prodlow6bf632 -t craves/subscription-service:<MERGED_MAIN_SHA> services/subscription-service`
4. Check the image exists before deploying: `az acr repository show-tags -n cravesrm09prodlow6bf632 --repository craves/subscription-service --query "[?@=='<MERGED_MAIN_SHA>']" -o tsv`
5. `DEPLOY_PREFLIGHT_ONLY=true bash scripts/release/deploy-single-service-preserve-runtime.sh rg-craves-prodlow-centralindia ca-craves-subscription-service-p cravesrm09prodlow6bf632.azurecr.io/craves/subscription-service:<MERGED_MAIN_SHA> subscription`
6. The same command without `DEPLOY_PREFLIGHT_ONLY`, with `READY_ATTEMPTS=150 READY_SLEEP_SECONDS=10`.

## Smoke checks (switch off)

- Logs show `Successfully applied 1 migration` (V20, or 2 with V19) and no `Day credit deadline could not be settled`.
- With a customer token, `GET /api/v1/subscriptions` shows `"dayCredits":[]` on each subscription.
- A chef decline on the test plan still adds a `DECLINE_CREDIT` invoice at the end, as today.

## Turning refunds on (the finance release)

Only once finance can price and pay refunds, and only after these are true:

- **App 1.34.4 or later is on customers' phones.** Older apps never show a choice, so every choice would quietly settle as days at the end after 48 hours.
- **Decide when paid paused days are given back** (found in the final review, not built): with the switch on, a resume no longer lays the paused paid days out at once. `next_billing_date` stays at the resume date, so when the paid bill ran out during the pause, the next bill is raised right away and the paid days (if the customer picks days, or the deadline does) come after that bill. Days and money still add up, but the customer pays again before eating their paid days. Either lay the paused days out at resume as today and make Refund remove the part not yet started, or say in the app that meals restart with the next bill.
- **Decide what cancelling a paused plan gives back** (old behaviour, unchanged here): cancelling while paused credits nothing for the paused paid days. Once refunds exist, customers will expect one.

1. **APIM:** `CONFIRM_APIM_WRITE=true APIM=apim-craves-prodlow-kmqgfy bash scripts/apim/configure-subscription-backoffice-apim.sh`, then `APIM=apim-craves-prodlow-kmqgfy bash scripts/apim/status-subscription-backoffice-apim.sh`. The script's default APIM name (`l3ing6`) does not exist; always pass `kmqgfy`.
2. **Order-service text:** the customer notification in `ChefAcceptanceResolutionService` ("Your chef couldn't make this meal, so we've added a day to the end of your meal plan.") must become "Your chef couldn't make this meal. Open your meal plan to choose a refund or an extra day at the end." and open My Meal Plan. Deploy order-service with it.
3. **Switch:** `az containerapp update -g rg-craves-prodlow-centralindia -n ca-craves-subscription-service-p --set-env-vars CRAVES_SUBSCRIPTION_REFUND_CHOICE_ENABLED=true`
4. **Daily finance query** (read-only, `craves_business_db`): refund requests to price and pay. Keep running it even if the switch is later turned off: the deadline sweep still saves refund requests for plans that have ended.

```sql
SELECT c.id, c.subscription_id, c.kind, c.first_date, c.last_date, c.days, c.chosen_by, c.chosen_at
FROM subscription_schema.subscription_day_credit c
WHERE c.status = 'REFUND_REQUESTED' ORDER BY c.chosen_at;
```

Choices still pending past their deadline (should be empty; otherwise the sweep is off or failing):

```sql
SELECT id, subscription_id, kind, choice_deadline FROM subscription_schema.subscription_day_credit
WHERE status = 'PENDING_CHOICE' AND choice_deadline < now() - interval '15 minutes';
```

## Rollback

- Redeploy the image recorded in step 2. V20 stays applied; the old code ignores the table.
- With the switch off nothing was written, so nothing is lost.
- If the switch was on: pending choices stop being settled by the old image. Turn the switch off first (`CRAVES_SUBSCRIPTION_REFUND_CHOICE_ENABLED=false`) and let the sweep settle the pending ones (48 hours at most) before rolling back, or settle them by hand from the query above.
