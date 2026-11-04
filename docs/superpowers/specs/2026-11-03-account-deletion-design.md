# Account deletion: design

Status: for owner approval (3 Nov 2026); builder check done. Code facts were read on `origin/main` at `1ec8fc3f1`/`3c381f48d`.

## Why

Google Play requires an app with sign-up to let people **request deletion of their account and its data from inside the
app**, plus a **web page** that does the same without the app. Data kept for legal, security or fraud reasons is allowed
if the app says what is kept and for how long. Deactivating or hiding an account does not count.

Today Craves has none of this. The support assistant guide says "account deletion: not available"
(`services/user-chef-service/src/main/resources/support-assistant/guide.md:93`). The chef app's "Delete my account" opens a
support ticket, and `POST /api/v1/support/cases` is missing at the gateway, so it fails. The only erasure that exists is
advanced-features "Delete my taste data" (`DELETE /api/v1/advanced/my-taste-data`), which erases 12 advanced modules.

This is a Play Store launch blocker.

## Goals

- A customer can ask to delete their account in the app (Settings → Privacy & security → Delete account) and on a
  craves.in web page, and it really happens 30 days later.
- A chef can ask in the app (Profile → Security → Delete my account); Craves reviews it, settles money, and then it
  happens 30 days after approval.
- A person with both roles chooses: **customer side only**, **chef side only**, or **both**.
- After deletion nothing identifies the person: no name, phone, email, address, photos, device tokens, notes or free
  text, and the phone number can sign up again as a new account.
- Records the law requires (orders, payments, refunds, chef earnings and payouts, tax data) stay, with the person's
  details removed, under an anonymous id.
- Staff can see every request, what is blocking it, and which service has finished.

## Non-goals

- The rider app (fleet riders have their own data rules).
- Deleting financial or tax records, or changing amounts.
- Instant deletion.
- A data export / "download my data" feature (Play does not require it; advanced already exports taste data).
- Fixing the other 8 missing gateway routes (separate work), except the routes this feature adds.

## Anti-goals (a failure even if it "works")

- Breaking the ledger: deleting or rewriting a row the finance triggers protect, or changing an order's money.
- A half-done deletion that looks finished: the login is wiped while a service still holds the person's data, or a
  failed step is never retried and nobody is told.
- Erasing the wrong side of a dual-role account (deleting a chef's kitchen when they chose "customer side only").
- Letting someone place new orders, start meal plans or take new kitchen orders while their deletion is pending.
- Leaving a chef unpaid for food they cooked.
- A request that silently never completes (blocked forever with no one told).

## Owner decisions

1. **30-day wait** between the request and the deletion.
2. **Signing in during the 30 days can cancel it.**
3. **Chef deletions are requests that Craves reviews** before the 30 days start.
4. **Dual-role accounts choose** customer side only / chef side only / both, asked in the app.
5. **Approach A: one coordinator** in auth-service that runs the deletion service by service (below).
6. **One-side deletion erases that side's details; the login and its locked records stay.** Every login gets the
   CUSTOMER role at sign-in (`ensureCustomerRole`, `AuthService.java:104`), and order/payout rows cannot move to another
   identity (order V24/V25, finance triggers). So "customer side only" removes addresses, favourites, reviews, meal plans
   and cart, and anonymises old orders, which stay in the person's own history; they can order again later. "Chef side
   only" removes the kitchen, menu and CHEF role; old payouts stay in their history. No identity split.
7. **Referral balances:** a chef's cash referral earnings are paid out as part of the payout settlement before approval
   (an unpaid balance is a blocker staff see); a customer's unused referral credits are forfeited at deletion, and the
   Delete screen says so.
8. **Retention:** KYC documents, encrypted bank details, earnings and payout records are kept locked with no automatic
   purge in this version; a timed purge is added once legal confirms the periods (about 72 months under GST s.36).

## My calls (owner can change)

- Signing in during the wait does not cancel by itself: the app shows "Your account will be deleted on 3 Dec. Keep it?"
  and cancels only on **Keep my account**; otherwise the person is signed out again.
- A request is accepted even with an order on its way or a refund pending; those finish during the 30 days. An active
  meal plan is cancelled when the request is made, under the plan's normal cancel and refund rules. If anything is still
  open on day 30, the deletion waits (re-checked daily) and staff see why.
- Notifications: in-app + push on request, a reminder 7 days before, and "your account was deleted" by SMS/email if a
  channel still exists at that moment (then the contact details go).
- **No forced sign-out during the wait.** The person stays signed in with a banner "Your account will be deleted on
  3 Dec · Keep my account". The server refuses new orders, new meal plans and (chef) new kitchen orders; everything else
  stays readable, so a customer still sees an order on its way and its 4-digit delivery code, and a chef still finishes
  orders already cooking. Signing in on another device shows the same banner. (Replaces the earlier "signed out
  everywhere" idea, which hid the delivery code.)
- **Chef payouts carry on until approval.** The kitchen closes to new orders at request time, so no new earnings appear
  after the orders already cooking; staff approve only when nothing is payable or on hold. After approval there are no
  new earnings to pay.
- **Fraud retention:** referral `contact_hash`, `device_hash` and `payment_hash` are kept (one-way hashes, no phone
  number), so deleting and re-joining cannot claim the new-user referral offer again. Disclosed as fraud prevention.
- **Riders:** if the login also has the RIDER role, the app does not offer "whole account"; customer side and chef side
  only, with "To delete your rider account, contact Craves". The rider app is out of scope.
- **Chef again later:** after a chef-side deletion the person may apply again; the existing `chef_application` row
  (UNIQUE per identity) is reset to a fresh draft instead of a new row.
- advanced erase runs every module, including ones switched off, and referral-service gets the internal call signature
  as well as advanced.

## How it works (behaviour)

### Customer

1. **Ask.** Settings → Privacy & security → **Delete account**. One screen lists:
   - *Goes:* profile, saved addresses, favourites and saved lists, reviews, notifications, meal plans, taste data.
   - *Kept without your name:* past orders, payments and refunds, for tax.
   - The deletion date (today + 30 days) and what happens to an open order or meal plan.
   Confirm → the deletion is scheduled.
2. **During the 30 days** the account cannot place new orders or start meal plans (server-enforced); existing orders,
   tracking and the delivery code stay visible, with a Keep my account banner on every screen (My calls).
3. **Day 30**: personal data is removed in every service (table below), kept records are anonymised, the login is wiped,
   the Firebase user is deleted, and the phone number is free to sign up as a new account.

### Chef

1. **Ask.** Profile → Security → **Delete my account** creates a deletion request (not a support ticket). The chef sees
   "Request sent. Craves will finish it once your payouts are settled." The kitchen closes to new orders at once;
   orders already cooking can still be finished (PR #602).
2. **Craves reviews** in a new admin page *Deletion requests*: each request shows open items (unpaid earnings or payouts
   on hold, live meal-plan subscribers, open orders, pending refunds, referral wallet balance). Staff settle them, then
   **Approve** → the 30-day wait starts (the chef can still cancel). Staff can also **Reject** with a reason (e.g. fraud
   case open), which the chef sees.
3. **Day 30**: kitchen profile, menu, photos and chef application details are removed or anonymised; the chef role is
   removed; KYC, bank and earnings records are kept locked (My calls).

### Dual role (CUSTOMER and CHEF on one login)

The Delete screen first asks: **customer side**, **chef side**, or **both**.
- *Customer side only*: customer data goes, CUSTOMER role removed; login and chef side stay.
- *Chef side only*: chef review flow; CHEF role removed; login and customer side stay.
- *Both*: chef review first, then the whole account as for a customer.

### Web page

`craves.in/account/delete`: sign in with phone OTP (existing web sign-in), then the same choices and the same API. A
public explainer at `craves.in/account-deletion` (what is deleted, what is kept and for how long, how to ask) is the URL
given to Play.

## Data handling

Scope column: **C** = customer side, **K** = chef side, **A** = whole account. "Delete" = rows removed; "Anonymise" =
row kept, personal fields blanked or replaced; "Keep" = untouched (ids only or legally required).

| Service | Data | Action | Scope |
|---|---|---|---|
| auth | `refresh_session`, `login_attempt`, `auth_phone_otp`, `auth_email_challenge`, academy data | Delete | A |
| auth | `auth_identity` | Anonymise: phone and `firebase_uid` → unique tombstones, email/display name null, status stays usable for the guards (see Constraints) | A |
| auth | `auth_identity_role` CUSTOMER / CHEF row | Delete the role | C / K |
| auth | Firebase user | `deleteUser` | A |
| auth | immutable audit/outbox (`auth_email_projection_outbox`, `auth_email_audit`, `referral_enrollment`) | Keep (hashes/audit); disclosed | A |
| user-chef | `customer_profile`, `customer_address`, favourites (4 tables), launch alerts | Delete (addresses: hard delete, not `is_active=false`) | C |
| user-chef | `support_case*` messages | Anonymise requester text | A |
| user-chef | `chef_application`, onboarding draft/help/visit/history | Anonymise contact and address fields | K |
| user-chef | `chef_kyc_document` blobs and rows | Keep, locked (owner decision 8) | K |
| catalog | `kitchen_profile`, `kitchen_pickup_location` | Anonymise contact/address, status INACTIVE, photos deleted from storage | K |
| catalog | `menu_item`, `menu_item_image` | Archive items, delete image blobs | K |
| order | `cart`, `cart_item`, `order_review*` (incl. media), `order_delivery_code`, `idempotency_record`, notification outbox bodies | Delete | C |
| order | `customer_order`, `checkout`: `dropoff_*`, `customer_note`, `delivery_partner_*` | Anonymise (money columns untouched; see Constraints) | C |
| subscription | `customer_subscription` notes, skip reasons | Anonymise; active plans already cancelled at request time | C |
| subscription | `subscription_plan` (chef) | Close to new subscribers at request; archive at erase | K |
| notification | `in_app_notification`, `notification_preference`, `push_device_registration`, `notification_request` bodies | Delete | A (per role for in-app) |
| notification | `pdf_document` receipts | Keep (immutable financial artefact); disclosed | A |
| integration | `payment_order.request_payload` customer name/phone/email | Anonymise | C |
| integration | ledger, payables, payouts, `finance_bank_request` | Keep (immutable, legal) | K |
| referral | `member` code and profile link | Anonymise; contact/device/payment hashes kept for fraud (My calls); balances per owner decision 7 | A |
| advanced | all 12 `PersonalDataContributor` modules | Call the existing erase | A |

## Approach (decided: A)

| | A. Coordinator in auth-service (chosen) | B. Events on Service Bus |
|---|---|---|
| How | auth stores the request and timer, then calls a private erase endpoint in each service in a fixed order, recording each result and retrying | auth publishes "deletion due"; each service listens and erases |
| For | Order is guaranteed (cancel plans before erasing, login last); one place shows progress; reuses existing signed internal calls | Services more independent |
| Against | A new internal endpoint in 8 services | Only order/integration/subscription use Service Bus today; completion is hard to know, so the login could be wiped too early |

Rejected: one job deleting straight from every schema (skips photo blobs, Firebase and the finance triggers).

## Architecture (A)

**auth-service owns the request.**
- Tables: `account_deletion_request` (id, identity_id, scope `CUSTOMER|CHEF|ALL`, status, requested_at, requested_via
  `APP|WEB`, due_at, reviewed_by, review_note, completed_at) and `account_deletion_step` (request_id, service, status,
  attempts, last_error, erased_count, completed_at). One open request per identity.
- Status: `REQUESTED` → (`PENDING_REVIEW` when scope includes CHEF) → `SCHEDULED` (due_at = approval/request + 30 days)
  → `ERASING` → `COMPLETED`; or `CANCELLED`, `REJECTED`, `WAITING_ON_OPEN_ITEMS` (re-checked daily).
- Public routes (signed-in user): `POST /api/v1/auth/me/deletion` {scope}, `GET /api/v1/auth/me/deletion`,
  `DELETE /api/v1/auth/me/deletion` (keep my account). Admin routes: list, detail with blockers, approve, reject.
- On request: no sign-out. Bump `token_version` once so every device refreshes into tokens that carry the claim below.
- While pending: tokens carry a claim `deletion_pending` (scope); order-service refuses checkout, subscription-service
  refuses new subscriptions with `409 ACCOUNT_DELETION_PENDING`, and catalog keeps the kitchen closed for a chef-scope
  request. `GET /api/v1/auth/me` returns `pendingDeletion {scope, dueAt, status}` for the app banner.
- Only at the final step does auth revoke every session and wipe or narrow the login.
- A scheduled worker in auth picks due requests and runs the steps.

**Each service adds** `POST /internal/v1/account-erasure` {requestId, identityId, scope} and
`GET /internal/v1/account-erasure/blockers?identityId&scope`, behind the existing internal call signature
(`InternalCallSignature`, `X-Craves-Call-*`). Erase is idempotent and returns `DONE {counts}`, `BLOCKED {reasons}` or
fails (retried). advanced gets an `InternalCallFilter` and wraps its existing erase.

**Step order:** subscription → order → integration → referral → advanced → notification → catalog → user-chef →
auth (role removal or login wipe, Firebase `deleteUser`) last, only when every earlier step is `DONE`.

## Constraints found in the code

- `auth_identity` cannot be deleted: non-cascading FKs and immutable tables point at it, so it is anonymised.
  `phone_number` and `firebase_uid` are NOT NULL UNIQUE: tombstones must be unique (e.g. `deleted:<identity id>`) or the
  same phone signing up again hits `409 PHONE_ALREADY_LINKED` (`AuthService.java:264-271`).
- Downstream revocation checks accept only `ACTIVE` and `SUSPENDED` (`RedisTokenRevocationPublisher.java:87`, each
  service's `RedisTokenRevocationWebConfiguration`). Do not add a new status value; a wiped identity uses `SUSPENDED`
  plus a `token_version` bump.
- Order money is guarded by `guard_bound_order_money` (order V25) and snapshots are immutable (V24); only the personal
  `dropoff_*`, `customer_note`, `delivery_partner_*` columns may change. `chk_order_dropoff_snapshot_complete` (V4)
  requires dropoff fields unless `delivery_address_id` is null: anonymise to placeholder values, not nulls, or null the
  address id too.
- Finance bank, payout and ledger tables have immutability triggers (integration V121, V125, V131): keep them.
- `pdf_document` is immutable once READY (notification V6): kept as a financial artefact.
- user-chef `BlobDocumentStorageService` has no delete method; catalog photo blobs live in `stcravesmedia34eefd`
  (catalog subnet allowed since 3 Nov).
- Firebase: auth-service has firebase-admin; `deleteUser` is not used yet.

## App, web and admin

- **App** (customer Settings → Privacy & security; chef Profile → Security): Delete account screen, side chooser for dual
  role, confirmation, and the Keep it? screen after sign-in. Mockups for owner review before building.
- **Website**: `/account/delete` (signed in) and `/account-deletion` (public explainer, the Play URL).
- **Admin website**: Deletion requests list and detail (blockers, steps, approve/reject).
- **Gateway**: publish the new auth routes and the admin routes in APIM (operation scripts in `scripts/apim`).

## Rollout

Behind a feature switch, deployed services first (endpoints idle), then auth worker, then app and web. Test with a test
customer, a test chef and a dual-role test account. Update the Play Data safety form and the support guide.

## Left to the builder

Exact table columns and indexes, retry back-off, worker schedule, internal endpoint payload details, per-service SQL for
each row in the data table, placeholder values for anonymised fields, test fixtures, admin page layout within the
existing admin shell.

## Open questions

- Retention periods per record type (legal to confirm) for the later timed purge; nothing in this version depends on it.
