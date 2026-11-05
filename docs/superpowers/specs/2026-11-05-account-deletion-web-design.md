# Craves website: delete account, explainer and staff review (design)

Date: 5 Nov 2026 · Plan 4 of 5 for account deletion · Platform repo `main` at `2d739d4d7` · Work folder `C:\mweb`, branch `feat/account-deletion-web` · App: `apps/customer-web-next` (Next.js; customer site craves.in and, as a separate deploy with `CRAVES_ADMIN_PORTAL=true`, the staff portal admin.craves.in)

- Parent design: `docs/superpowers/specs/2026-11-03-account-deletion-design.md` (owner decisions bind this document).
- Server side, merged with switches off: plan 1 (#611) and plan 2 (#612, auth coordinator). Notes for this plan: `docs/superpowers/plans/2026-11-04-account-deletion-coordinator-followups.md`.
- The app side (plan 3, #615, merged into the app branch) is the model for the flow and its copy: `docs/superpowers/specs/2026-11-05-account-deletion-app-design.md` and `apps/mobile/src/features/accountDeletion/domain/deletionCopy.ts` on branch `feat/advanced-features-app` (approved screens: canvas Mo4ick1Ff8bKbcj1h1z7ub).

## Intent

Google Play requires a web page where a person can ask for their account to be deleted without the app, and that says what is deleted, what is kept and for how long. The Play listing gets that page's link. Craves staff also need a place to review chef deletion requests, settle what is open, and approve or reject them; until now that exists only as server routes. This plan adds both to the website, using the server that plans 1 and 2 already built.

## Goals

- `craves.in/account-deletion`: a public explainer anyone can open without signing in, that names Craves, explains how to ask (app and web), what is deleted, what Craves keeps and for how long, and the 30-day wait.
- `craves.in/account/delete`: sign in with the phone code, then the same flow as the app: pick what to delete (when the person also cooks), read the summary, confirm, see where the request stands, take it back with Keep my account.
- `admin.craves.in/admin/account-deletions`: a list of requests and a detail page with the person's open items and the deletion steps, with Approve and Reject.
- The privacy policy matches what the app does (payments through Cashfree, a deletion section linking the explainer), because Google checks it against the Data safety form.

## Non-goals

- Any server change (auth, services, APIM). Plan 5 publishes the APIM routes, sets the settings and turns the switch on.
- A banner across the whole website (the delete page itself shows the request and Keep).
- The rider app or rider data.
- Deleting a person on someone's behalf from the staff portal (staff only approve or reject what the person asked for).

## Anti-goals

- The Play link showing "opening soon", a sign-in wall or a 404.
- A delete flow that sends a wider scope than the one the person tapped, or a preselected choice.
- Staff seeing more personal data than the server returns (the server deliberately gives only the last 4 phone digits).
- Sign-in tokens reaching browser scripts.

## Constraints

### Server contract (auth-service, `in.craves.auth.deletion`)

Person (customer session, `craves_access_token` cookie):

| Call | Success | Errors |
|---|---|---|
| `POST /api/v1/auth/me/deletion` `{"scope": "CUSTOMER"\|"CHEF"\|"ALL", "via": "WEB"}` | 201 new / 200 same open request; `DeletionView` | 409 `ACCOUNT_DELETION_ALREADY_REQUESTED`, 409 `ACCOUNT_DELETION_SCOPE_NOT_ALLOWED`, 503 `ACCOUNT_DELETION_NOT_ENABLED` |
| `GET /api/v1/auth/me/deletion` | 200 latest request in any status | 404 `NO_DELETION_REQUEST`, 503 |
| `DELETE /api/v1/auth/me/deletion` (Keep my account) | 200 `DeletionView` (CANCELLED) | 404 `NO_DELETION_REQUEST`, 409 `ACCOUNT_DELETION_IN_PROGRESS` |

- `DeletionView {requestId, scope, status, requestedAt, dueAt, reviewNote}`; `reviewNote` only when REJECTED; `dueAt` null while PENDING_REVIEW.
- Scope rules and statuses exactly as the app design's contract section. A customer-only account asks for `ALL`; `ALL` is refused with the RIDER role.
- POST and DELETE bump the person's token version: **after either, the browser session must be renewed through the existing `/api/auth/refresh` before the next call**, or later calls fail with 401 once revocation is on.
- While a request with scope CUSTOMER or ALL is open, order checkout, scheduled orders and starting a meal plan answer 409 `ACCOUNT_DELETION_PENDING`.
- `GET /api/v1/auth/me` and token responses carry `identity.pendingDeletion` (`{requestId, scope, status, dueAt}` or null).

Staff (admin session on admin.craves.in):

| Call | Who | Notes |
|---|---|---|
| `GET /api/v1/admin/account-deletions?status=&cursor=&limit=` | PLATFORM_ADMIN, SUPPORT_ADMIN, COMPLIANCE_ADMIN, AUDIT_ADMIN | oldest first; `{items: Summary[], nextCursor}`; limit 1-100 (default 25) |
| `GET /api/v1/admin/account-deletions/{id}` | same | `{request: Summary, phoneLast4, roles, steps: StepRow[], blockers: Blocker[]}`; asks all 8 services live (can take seconds) |
| `POST …/{id}/approve` `{reason}` | PLATFORM_ADMIN, COMPLIANCE_ADMIN | only PENDING_REVIEW; 409 `ACCOUNT_DELETION_HAS_OPEN_ITEMS` with `{code, message, blockers}` while anything is open |
| `POST …/{id}/reject` `{reason}` | same | the reason is shown to the person |

- `Summary {requestId, identityId, scope, status, via, requestedAt, dueAt, reviewedBy, reviewedAt, reviewNote}`; `StepRow {phase, service, status, attempts, lastError, completedAt}`; `Blocker {service, code, detail}`.
- `reason`: 10 to 500 characters after trimming (400 `ADMIN_REASON_INVALID`). Staff cannot act on their own request (403 `ACCOUNT_DELETION_OWN_REQUEST`); a request that can no longer be reviewed gives 409 `ACCOUNT_DELETION_NOT_REVIEWABLE`; 403 `ADMIN_ROLE_REQUIRED` for a reader who tries to act.
- Every route answers 503 `ACCOUNT_DELETION_NOT_ENABLED` while the switch is off, and the gateway answers 404 without a Craves code until plan 5 publishes the routes.

### Website rules (`apps/customer-web-next`)

- The browser never calls the backend directly. Every call goes through a same-origin route under `src/app/api/` that checks `isSameOrigin`, bounds the request (`boundBffRequest`), and calls the backend with `authenticatedApiFetch(request, path)` from `src/shared/lib/server-api.ts` (paths like `/auth/me/deletion`, `/admin/account-deletions`). On the admin portal, `authenticatedApiFetch` already re-checks the admin session.
- The launch gate (`features/pilot-launch/lib/web-launch-security.ts`, `launchExemptPath`) lets only listed pages through while the site is in its "waiting" phase. The site is open today (5 Nov), but `/account-deletion` must be added to that list so Google's link works even if the gate closes again.
- The admin portal allows only `/admin/*`, `/sign-in`, `/api/admin/*` and `/api/auth/*` (`src/proxy.ts`); admin pages and their routes live under those prefixes and get an entry in `features/admin/shell/lib/admin-navigation.ts`.
- Code lives in `src/features/<feature>/` (feature boundaries are checked by `npm run lint`); pages in `src/app/`. Tests: `npm test` (vitest + node test), `npm run typecheck`, `npm run lint`.
- The person's role mode on the website: `isChefModeTab(user.id)` from `features/chef/lib/chef-mode.ts`; roles from the signed-in `CravesUser.roles`.

## Approaches

1. **Website's own server routes (chosen).** New same-origin routes `/api/account-deletion` (person) and `/api/admin/account-deletions` (staff) call the backend; pages render from them. Matches every existing feature (the reviews admin page is the closest model) and keeps tokens in cookies.
2. Call the backend from the browser. Rejected: tokens would have to reach page scripts, against the website's rules.
3. A deletion section inside `/privacy` instead of its own page. Rejected: harder to point Google to, and it cannot carry the step-by-step flow; `/privacy` links to the new page instead.

Owner picked approach 1 on 5 Nov.

## Owner decisions

- Everything in the parent design (30-day wait, Craves reviews chefs, both-role people choose from the side they are signed in on, Keep my account, retention locked for KYC/bank/earnings).
- The explainer states **8 years** for kept tax and payout records (5 Nov).
- Approach 1 (5 Nov).
- **Sign-in opens for the delete page only** while customers are still "launching soon" (5 Nov): `/sign-in` accepts the phone code when it is heading to `/account/delete`, and after sign-in only `/account/delete` and `/account-deletion` work for a person without early access; the rest of the customer website stays locked.
- **Website chooser** (5 Nov): the side is taken from where the person came from when known (`?side=chef` from the chef Login & security row, `?side=customer` from customer Settings); with no side (the Play link, a typed URL) a person with the CHEF role gets all three choices: "Only my customer side", "Only my chef side", "My whole account".

## What people see

### 1. `/account-deletion` (public explainer)

Built with `PublicPolicyPage` / `PolicySection` / `PolicyList` like `/privacy`, `robots` indexable, linked from `/privacy` and from the footer next to Privacy if the footer lists legal pages. Copy (my draft, for the owner to read with this document):

- Eyebrow "Account deletion". Title "Delete your Craves account". Intro: "You can ask Craves to delete your account and its data, from the Craves app or from this website. This page explains how, what is deleted, and what Craves keeps and for how long."
- **How to ask**
  - "In the Craves app: customers go to Profile → Settings → Privacy & security → Delete account. Chefs go to Profile → Login & security → Delete my account."
  - "On the website: sign in at craves.in/account/delete with the phone number on your account." (a link)
  - "If you can't sign in, email support@craves.in from the email on your account, or tell us the phone number on the account, and Craves will help."
- **What happens and when**
  - "Customer accounts are deleted 30 days after you ask."
  - "Chef accounts: your kitchen stops taking new orders at once. Craves reviews the request and settles your payouts, then your chef details are deleted 30 days after approval."
  - "If you use Craves as a chef and as a customer, you can delete one side or the whole account."
  - "Until the deletion date you can change your mind with Keep my account, in the app or on this website."
- **What is deleted**: "Your profile, name, phone number and email; saved addresses; favourites and saved lists; reviews you wrote; meal plans; notifications and taste data; referral credits you haven't used. For chefs: kitchen profile and photos, menu and dish photos, meal plans you offer, and chef application details."
- **What Craves keeps, and for how long**
  - "Past orders, payments and refunds: kept for 8 years after the end of the financial year, with your name and phone number removed, because Indian tax law requires it."
  - "For chefs: KYC documents, bank details, earnings and payout records: kept locked for 8 years after the end of the financial year, because Indian tax law requires it, then deleted."
  - "One-way security codes made from your phone, device and payment method (not the details themselves): kept for 8 years so a new account can't claim the new-customer offer again."
- **Questions**: "Write to support@craves.in."

### 2. `/account/delete` (signed-in flow)

- Not signed in: go to `/sign-in?returnTo=/account/delete` (the existing sign-in with `safeReturnPath`), then back.
- The page asks `GET /api/account-deletion` (latest request) and shows one of the app's five states, with the app's copy (customer copy on the customer side, chef copy when the scope includes the chef side):
  - **start** (no request, CANCELLED, COMPLETED): chooser when the person has the CHEF role, by the `side` query parameter: `side=chef` → "Only my chef side" / "My whole account"; `side=customer` → "Only my customer side" / "My whole account"; no or unknown `side` → "Only my customer side" / "Only my chef side" / "My whole account". RIDER rules as in the app ("My whole account" not offered, the rider note shown). A customer-only account skips the chooser (`ALL`). Then the summary for the picked scope, then a confirm dialog with the red button; nothing preselected.
  - **in review**, **scheduled**, **waiting**, **erasing**, **declined** (reason shown; "Ask again").
  - Keep my account on in review, scheduled and waiting.
- Copy: the app's `deletionCopy.ts` strings, with these website changes: "from any screen" → "from this page or the app"; the chooser intro stays; buttons are web buttons; the "Until" box keeps all four lines including the checkout and meal-plan disclosures.
- After a successful POST or DELETE: renew the session through `/api/auth/refresh`, then show the new state from the POST/DELETE answer.
- Errors: 503 or a 404 without `NO_DELETION_REQUEST` on the GET → "Deleting an account from the website isn't available yet. You can ask in the Craves app, or email support@craves.in." (no flow); POST errors as in the app's `sendErrors`; Keep errors as in the app's `keep` copy.
- Reachable from customer Settings → Account → "Delete account" (`/account/delete?side=customer`), from the chef workspace's Login & security → "Delete my account" (`/account/delete?side=chef`), and from the explainer (`/account/delete`).
- The delete page is one English page in the customer layout for both sides.

### 3. Website checkout and meal-plan payment during the wait

Where the website shows a checkout or meal-plan payment failure, a 409 `ACCOUNT_DELETION_PENDING` shows "Your account is set to be deleted, so new orders are paused." (meal plans: "…so new meal plans are paused.") with a link "Keep my account" to `/account/delete`, instead of the generic error.

### 4. `admin.craves.in/admin/account-deletions` (staff)

- Navigation entry in "People & kitchens": label "Deletion requests", description "Review chef deletion requests, see what is still open, and approve or reject.", access "Backend-authorized decisions".
- **List**: status filter (All, In review, Scheduled, Waiting, Erasing, Completed, Rejected, Cancelled; default In review), in the server's order (oldest first). Columns: requested (date and time), scope, status, via (app/web), due date, short request id. "Load more" with the cursor. Empty state per filter. 503 → "Account deletion is not switched on yet." 403 → "Your administrator role can't view deletion requests."
- **Detail** (`/admin/account-deletions/[requestId]`): summary (scope, status, via, requested, due, last 4 phone digits or "Erased", roles, reviewer and note when reviewed); **Open items** table from `blockers` (service, code, detail; `SERVICE_UNREACHABLE` rows marked "Couldn't check"); **Steps** table (phase, service, status, attempts, last error, done at). A "Refresh" button re-asks (the detail call is slow: show a loading state).
- **Approve** and **Reject** only for PENDING_REVIEW and only when the detail route says `canDecide: true`. The browser never sees admin roles (`AdminIdentity` has none, and `admin-contract.test.ts` pins that); the detail route computes `canDecide` on the server from `/auth/me` roles (PLATFORM_ADMIN or COMPLIANCE_ADMIN) and the backend still refuses with 403 `ADMIN_ROLE_REQUIRED` if anything slips. Both open a dialog with a required reason (10-500 characters, counter shown). Reject's dialog says "The person will see this reason." Approve refused with open items shows the returned blockers in the dialog. Own request → "You can't review your own request." After a decision, reload the detail.
- Personal data shown is only what the server returns (identity id, last 4 digits, roles).

### 5. Privacy policy

`/privacy`: name both payment providers the code supports, Razorpay (website checkout and meal-plan payment) and Cashfree (the app), where it describes payments and providers, and add a section "Deleting your account" that summarises the 30-day wait and links to `/account-deletion`. Update the "Effective" date.

## How it works (decided parts)

- **Feature home**: `src/features/account-deletion/` for the person's side (contract/parsers, copy, model, client screen) and `src/features/admin/account-deletions/` for staff. Pages: `src/app/account-deletion/page.tsx`, `src/app/account/delete/page.tsx`, `src/app/admin/account-deletions/page.tsx`, `src/app/admin/account-deletions/[requestId]/page.tsx`.
- **Routes**: `src/app/api/account-deletion/route.ts` (GET, POST, DELETE → `/auth/me/deletion`; POST forces `via: "WEB"` and validates `scope`), `src/app/api/admin/account-deletions/route.ts` (GET list), `src/app/api/admin/account-deletions/[requestId]/route.ts` (GET detail), `…/[requestId]/approve/route.ts` and `…/reject/route.ts` (POST). Every route validates the backend answer with a parser and maps upstream failures to stable codes, like `app/api/admin/reviews`.
- **Model**: port the app's pure model (state from latest request, chooser by roles + `side` (with the three-choice case added), summary kind, dates in the viewer's time zone with "d MMM" / "d MMM yyyy") into the website feature; the website does not import from `apps/mobile`.
- **Launch gate**: add `/account-deletion` to `launchExemptPath`. `/account/delete` stays behind the gate like the rest of the signed-in site.
- **Customer launch lock** (`CUSTOMERS_LAUNCHING_SOON` in `features/sign-in/lib/customer-launch.ts`, read by `src/app/sign-in/page.tsx` and the customer pages): the phone form shows when the safe `returnTo` is `/account/delete` (with or without `side`), and `/account/delete` and `/account-deletion` are exempt from the lock for a signed-in person without early access. Every other path keeps today's behaviour; tests pin both.
- **Chef-mode guard**: `ChefModeGuard` (`src/app/layout.tsx`) lets a chef-mode tab through only `OPEN_PATHS` in `features/chef/components/ChefModeGuard.tsx`; add `/account-deletion` and `/account/delete` so a signed-in chef reaches both.
- **Chef entry**: the chef workspace's Login & security row "Delete my account" (`features/chef/components/chef-security.tsx`, today a support-ticket link) points to `/account/delete?side=chef`; its subtitle becomes "Your chef side, or your whole account" in each chef-side language the file already carries.
- **Timeouts**: the admin detail route calls the backend with a 25 s timeout (the server asks 8 services, up to ~21 s); the other routes keep the 10 s default.
- **Unknown phone**: signing in with a phone that has no Craves account creates one (existing sign-in behaviour); the page then shows the start flow for it. Accepted.

## My calls (owner can change)

1. Explainer copy as drafted above, including the support-email path for people who can't sign in.
2. Fraud-prevention codes are stated as kept 8 years, like the tax records.
3. No banner across the website; the delete page shows the request and Keep.
4. Website checkout and meal-plan payment show the paused message with a link to the delete page.
5. The privacy policy is corrected (Cashfree) and gains a deletion section.
6. Admin list defaults to "In review", in the server's oldest-first order.
7. Approve also asks for a reason (the server requires one); it is not shown to the person.
8. Approve/Reject buttons follow a server-computed `canDecide` flag; admin roles never reach the browser.
9. The privacy policy names both Razorpay and Cashfree, since the website and the app use different providers.

## Left to the builder

- Component names and layout inside each page, following neighbouring pages (`PublicPolicyPage` for the explainer, the reviews admin page for staff).
- Which existing client fetch helper the delete page uses (`shared/lib/session-fetch.ts` already renews on 401), as long as the session is renewed after POST/DELETE.
- Test layout: vitest for parsers, model and routes (mocking `authenticatedApiFetch`), component tests where the website already has them.

## Release and checking

- Ships with the normal website and admin-portal deploys from `main` (merging to `main` deploys to production). With the server switch off, the explainer and the privacy update are live at once; `/account/delete` and the admin page show their "not available yet" states until plan 5.
- Check after deploy: `https://craves.in/account-deletion` answers 200 without a cookie; Settings shows the Delete row; admin.craves.in shows "Deletion requests". The full flow is checked with a test account after plan 5.
