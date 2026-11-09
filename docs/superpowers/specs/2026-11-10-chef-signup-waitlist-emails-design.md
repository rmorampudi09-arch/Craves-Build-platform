# Chef sign-up emails to Waitlist@craves.in: design

Date: 10 Nov 2026. Approved by the owner on 10 Nov 2026 (email content, sender, 24-hour reminder). How it is built is Claude's call; the owner left that open.

## Why

Some people who start the chef registration stop halfway, from confusion or other reasons. The support team reads the Waitlist@craves.in mailbox, and several of them have no admin access. They need an email for every sign-up that tells them who the person is, how to reach them, and where they stopped, so they can call and help.

## Goals

- Email Waitlist@craves.in when someone opens the chef application for the first time (after phone OTP sign-in), before they type anything.
- Email again each time they move forward a step, and when they submit.
- Email when they tap "Need help" in the application.
- Email once when a person has made no progress for 24 hours ("stopped" reminder). Once per person, never repeated.
- Every email stands on its own: name, phone, email, kitchen name and area, when they started and were last active, and a checklist of steps done and not done. No admin access needed to act on it.
- Covers the website and the app: both use the same server flow (`/api/v1/chef/onboarding` in user-chef-service).

## Non-goals

- No email to the chef. The chef never receives or sees these emails, and the chef is never the sender.
- No emails after submit. The admin review flow (start review, ask for changes, approve, reject) is not covered.
- No emails when an application is sent back for changes and the chef works through it again.
- No admin page changes. No HTML email template: plain text, which is what notification-service sends today.

## Anti-goals (a failure even if it works)

- Slowing down, blocking or failing any chef save, upload or submit.
- Putting ID numbers, the FSSAI number, date of birth, the full street address or document photos in an email.
- Flooding the mailbox: no emails about people who were already in the flow when the feature is switched on, and no duplicate emails when several user-chef replicas run.

## Constraints

- A merge to GitHub `main` deploys to production automatically (AGENTS.md). The feature ships switched off and is turned on by setting one environment variable.
- Flyway migrations are append-only. The newest user-chef migration on `main` (7dc4e24cd) is `V23__chef_application_erased_at.sql`, so this adds `V24`.
- `live-runtime-lock.txt` must list every new controller. This change adds no controller.
- Sending goes through notification-service `POST /internal/v1/notifications` with `channel: "EMAIL"` and `address: "Waitlist@craves.in"`:
  - user-chef-service is already an allowed caller, and its base URL and key are already set in production: `KitchenLaunchAlertJob` uses the same `NotificationInternalClient.post` path and has been live since 24 Oct.
  - It must not go through `sendSafely`, which is gated by `CRAVES_NOTIFICATION_DIRECT_DISPATCH_ENABLED` (off in production).
  - When `address` contains `@`, notification-service uses it as-is and skips the Auth lookup (`AuthRecipientEmailResolver`).
  - notification-service stores the request, retries it, and sends `title` as the subject and `body` as plain text, from `ACS_EMAIL_SENDER_ADDRESS`, with reply-to `ACS_EMAIL_REPLY_TO_ADDRESS` (default support@craves.in).
  - It drops a repeated `requestKey`, so each email needs a fixed key.
- `recipient_identity_id` is NOT NULL, so `userId` is set to the applicant's identity ID. This is safe: the in-app notification list reads only `in_app_notification`, which only `IN_APP` requests write, so the chef never sees these rows. It also means account erasure removes them along with the applicant's other notification rows.

## Approaches considered

1. **Hooks at every write.** Send from first visit, save, upload, document removal, submit and help request. Emails would be instant. But that touches six code paths across `ChefOnboardingService` and `ChefApplicationService`, inside the chef's own requests and transactions, which risks the "never slow or fail sign-up" anti-goal.
2. **One scheduled job (chosen).** Every 5 minutes, compare each applicant's current step with the last step emailed about, kept in one new table. One place catches every path, and it runs outside chef requests. It is safe on several replicas through fixed request keys. The cost is that an email can arrive up to 5 minutes late. It matches the existing `KitchenLaunchAlertJob` pattern.
3. **Daily digest email.** Fewer emails, but it loses the timing for "call them now". The owner asked for one email per step.

## Design

### Steps

The server already computes each applicant's next unfinished step with `ChefOnboardingPolicy.resume(details, documents, submitted)`, and the admin drafts list uses the same value. The job turns it into a rank:

| Rank | `resume` value | Meaning | Checklist row ticked when rank is above it |
|---|---|---|---|
| 0 | `signed-in` (visit row, no draft yet) | Opened the application | Signed in (always ticked) |
| 1 | `personal` | Personal details not done | Personal details |
| 2 | `kitchen` | Kitchen details not done | Kitchen details |
| 3 | `kitchen-photos` | Kitchen photos not done | Kitchen photos |
| 4 | `fssai` | FSSAI number not done | FSSAI number |
| 5 | `documents` | ID proof not done | ID proof |
| 6 | `review` | Every step done, not submitted yet | (all six ticked) |
| 7 | `waiting` | Submitted | Submitted |

`legacy` (old one-page-form chefs) is out of scope. The bank step never appears in `resume` and is off in production (`bankEnrollmentRequired=false`).

### Table: `V24__chef_signup_alert.sql`

`chef_signup_alert`, one row per applicant:

- `identity_id UUID PRIMARY KEY`
- `last_rank SMALLINT NOT NULL`: highest rank emailed about.
- `last_rank_at TIMESTAMPTZ NOT NULL`: when that rank was first seen. The 24-hour clock runs from here.
- `help_alerted_id UUID`: newest help request already emailed.
- `stall_alerted BOOLEAN NOT NULL DEFAULT false`
- `muted BOOLEAN NOT NULL DEFAULT false`
- `created_at` and `updated_at`

The migration seeds a muted row for every identity already in `chef_onboarding_visit` or `chef_onboarding_draft`. People already in the flow at switch-on never get emails. Production has only test accounts today (no launch yet), so nothing real is lost.

### Job: `ChefSignupAlertJob` (user-chef-service)

- `@Scheduled`, initial delay 2 minutes, fixed delay `craves.chef-signup-alerts.fixed-delay-ms` (default 300000).
- It does nothing unless `craves.chef-signup-alerts.email` (`CRAVES_CHEF_SIGNUP_ALERT_EMAIL`) holds a valid address. An empty value means off, and that is the default.
- **Candidates:** applicants who are not muted, whose application is neither APPROVED nor REJECTED, and whose row is missing or below rank 7. This means everyone the admin drafts list shows, plus people who have submitted but have not yet had their "Submitted" email.
  - Name, email and phone come the same way `drafts()` gets them, including its Auth contact fallback.
  - Move the row loading out of `drafts()` into a shared method, so the admin list and the emails always agree.
  - The batch is capped (builder's choice, about 200), newest activity first.
- **Rules for each candidate, in this order:**
  1. **No row:** send the "new sign-up" email (or a step email if they are already past rank 0), then insert the row with the current rank.
  2. **Current rank above `last_rank`:** send one step email describing the current state. A jump of several steps between runs gives one email, and its checklist shows everything done. Rank 7 sends the "Submitted" email. Then store the rank and set `last_rank_at` to now.
  3. **Newest help request differs from `help_alerted_id`:** send the "asked for help" email with their message, then store the help request ID.
  4. **Rank below 7, `last_rank_at` more than 24 hours ago, and `stall_alerted` false:** send the "stopped" email, then set `stall_alerted`.
  5. **Rank went down** (document removed, or sent back for changes): no email. The row keeps the highest rank.
- **Request keys:**
  - `chef-signup-<identity>-rank-<n>`
  - `chef-signup-<identity>-help-<helpId>`
  - `chef-signup-<identity>-stall`
- Update the row only after notification-service accepts the email. Two replicas sending the same email produce one email. If notification-service fails, log it and stop this run; the next run tries again.

### Emails

All emails come from the notification-service sender address and go only to the configured address. Times are shown in IST. A phone stored as `+919848012345` is shown as `+91 98480 12345`.

**Subjects:**
- New sign-up, step, Submitted and Need help emails all use `Chef sign-up · <phone>`. The subject stays the same for each person, so the mailbox groups them into one thread. The phone is the one detail known from the first email onwards.
- The 24-hour email uses `Stopped 24 h · chef sign-up · <phone>`, so it starts a thread of its own and stands out.

**Body (plain text):**

```
<Name> finished: Kitchen details          (first email: "New chef sign-up: opened the chef application")
Next step (not done): Kitchen photos      ("Every step done, not submitted yet" at rank 6; "Submitted for review" at rank 7)

Phone:   +91 98480 12345
Email:   ravi.k@gmail.com
Kitchen: Ravi's Tiffins, Hyderabad 500072
Started: 10 Nov 09:12 · Last active: 10 Nov 09:31

Progress
 ✓ Signed in
 ✓ Personal details
 ✓ Kitchen details
 ✗ Kitchen photos
 ✗ FSSAI number
 ✗ ID proof
 ✗ Submitted

Admins: https://admin.craves.in/admin/chef-reviews
```

- **Missing details:** lines with nothing to show are left out. The first email usually has only the phone number.
- **Need help email:** first line "<Name or phone> asked for help in the chef application", then their message, then the same details and checklist.
- **24-hour email:** first line "Stopped at <next step> for 24 hours, no progress since <time>", then the same details and checklist.
- **Never included:** date of birth, street address lines, the FSSAI number, ID type or number, or document links.

## Switch-on (after merge)

1. Owner: confirm Waitlist@craves.in receives mail from the production ACS sender. If the sender is an `azurecomm.net` address, mark it as safe in that mailbox.
2. Set `CRAVES_CHEF_SIGNUP_ALERT_EMAIL=Waitlist@craves.in` on the user-chef container app in subscription 34eefd95. Who runs this, and how, is the owner's call. The ~250 root `azure-pipelines-*.yml` files target the old org and must not be used.
3. Check: sign in with a test phone and open the chef application. An email should arrive within about 7 minutes.
4. Rollback: clear the variable. Nothing else changes.

## Tests

- **Unit tests:**
  - rank mapping
  - phone formatting
  - email body with and without a name, kitchen or email
  - checklist ticks for every rank
  - help and stall wording
  - the "never included" fields really are absent
- **Job tests (mocked client, like `KitchenLaunchAlertJobTest`):**
  - off when the address is empty
  - no row sends the new sign-up email and inserts the row
  - same rank sends nothing
  - rank up sends one email
  - rank down sends nothing
  - a send failure leaves the row unchanged
  - a muted row sends nothing
  - the stall email goes once, only after 24 hours
  - a new help request sends one email
- **Database test (like `ChefOnboardingDatabaseTest`):** migration seeds muted rows; the candidate query returns visit-only, draft and submitted-without-email applicants and skips approved and rejected ones.

## Calls made by Claude (owner may override)

- Scheduled job rather than hooks; up to 5 minutes delay.
- Subject keyed by phone, not name, so threads stay together from the first email.
- Kitchen shown as name, city and pincode, not the street address.
- People already in the flow at switch-on are muted, not emailed.
- A jump of several steps between runs gives one email, not one per step.
- The 24-hour clock counts from the last step forward, not the last visit.

## Left to the builder

- Exact candidate SQL, and the shape of the shared row loader taken out of `drafts()`.
- Batch size.
- Whether to also list the job class in `live-runtime-lock.txt` (not required; it is not a controller).

## Risks and unknowns

- Not checked: that email delivery is switched on for notification-service in the new production subscription, and which sender address it uses there. Auth verification emails for chefs suggest it is.
- Not checked: that the Waitlist@craves.in mailbox exists.
- The shared mailbox will hold applicants' names, phones, emails, city and pincode, and help messages. That is intended, so support can call. Nothing more sensitive is sent.
