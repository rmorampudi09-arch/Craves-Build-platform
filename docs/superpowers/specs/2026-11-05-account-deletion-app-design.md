# Craves app: delete account (design)

Date: 5 Nov 2026 · Plan 3 of 5 for account deletion · App baseline 1.36.16 (116), `08d660dbf` · Work folder `C:\mdelapp`, branch `feat/account-deletion-app` (cut from `feat/advanced-features-app`, open PR #599) · Ships as **1.36.17 (117)**

- Parent design: `docs/superpowers/specs/2026-11-03-account-deletion-design.md` (on `main` of the platform repo, also in `C:\mcoord`). Its owner decisions bind this document.
- Server side, already merged with its switches off: plan 1 (#611, erase endpoints) and plan 2 (#612, auth coordinator). Plan 2's notes for this plan are in `docs/superpowers/plans/2026-11-04-account-deletion-coordinator-followups.md` (platform repo).
- Approved screens: canvas https://claude.ai/artifact/Mo4ick1Ff8bKbcj1h1z7ub (15 boards, approved by the owner 5 Nov). Where this document and a board differ, this document wins; the differences are listed under "My calls".

## Intent

Google Play requires that anyone who signs up in the app can ask for their account and its data to be deleted from inside the app, and that the app says what is kept. The Play submission waits on this. The server already does the deletion (30-day wait, Craves review for chefs, one-side or whole-account erase). This work gives the customer and chef app the screens to ask, see where the request stands, and take it back ("Keep my account"), plus a banner on every screen while a request is open.

## Goals

- A customer can ask from Settings → Privacy & security → **Delete account**; a chef from Profile → Login & security → **Delete my account** (replacing today's support-ticket row, which fails because its route is not published).
- The person sees, before confirming, what goes, what Craves keeps and why, and the date.
- While a request is open, every screen of the signed-in app shows the banner with **Keep my account**, and the places the server now refuses (checkout, scheduled orders, starting a meal plan, reorder, a chef reopening the kitchen or taking meal-plan subscribers) explain why and offer Keep my account instead of a raw error.
- Signing in during the wait asks "Keep it?"; signing in after erasing has started explains that the account is being deleted.
- Before the server switch is on, nothing about deletion shows: the app can ship first.

## Non-goals

- The rider app and anything in the rider flavor.
- The website pages and the admin page (plan 4); APIM routes, service settings and switch-on (plan 5).
- Any server change. Everything here uses endpoints and fields already on `main`.
- Showing the list of what is still open ("blockers"); that is staff-only.

## Anti-goals (a failure even if it works)

- A delete button that fails: a visible row while the server would answer 503 or 404.
- Deleting the wrong side: a chef in chef mode who meant "only my chef side" sending `ALL`, or any default selection that sends a wider scope than the person picked.
- Hiding an order on its way or its delivery code during the wait.
- Signing the person out because a request is open.

## Constraints: the server contract (platform repo `services/auth-service`, package `in.craves.auth.deletion`)

| Call | Success | Errors the app must handle |
|---|---|---|
| `POST /api/v1/auth/me/deletion` body `{"scope": "CUSTOMER"\|"CHEF"\|"ALL", "via": "APP"}` | 201 new, 200 same request already open; body `DeletionView` | 409 `ACCOUNT_DELETION_ALREADY_REQUESTED` (a different request is open), 409 `ACCOUNT_DELETION_SCOPE_NOT_ALLOWED`, 503 `ACCOUNT_DELETION_NOT_ENABLED` |
| `GET /api/v1/auth/me/deletion` | 200 the **latest** request in any status | 404 `NO_DELETION_REQUEST`, 503 `ACCOUNT_DELETION_NOT_ENABLED` |
| `DELETE /api/v1/auth/me/deletion` ("Keep my account") | 200 `DeletionView` (status `CANCELLED`) | 404 `NO_DELETION_REQUEST`, 409 `ACCOUNT_DELETION_IN_PROGRESS` (erasing has started) |

- `DeletionView`: `{requestId, scope, status, requestedAt, dueAt, reviewNote}`. `reviewNote` is filled only when `status` is `REJECTED`. `dueAt` is null while `PENDING_REVIEW`.
- Statuses: open = `PENDING_REVIEW`, `SCHEDULED`, `WAITING_ON_OPEN_ITEMS`, `ERASING`; ended = `CANCELLED`, `REJECTED`, `COMPLETED`.
- Scope rules (409 `ACCOUNT_DELETION_SCOPE_NOT_ALLOWED` otherwise): `CHEF` needs the CHEF role; `CUSTOMER` needs CHEF or RIDER as well (a customer-only account asks for `ALL`); `ALL` is refused with the RIDER role. A scope that includes CHEF goes to Craves review (`PENDING_REVIEW`); `CUSTOMER` and customer-only `ALL` go straight to `SCHEDULED` with `dueAt` = now + 30 days.
- Every token response and `GET /api/v1/auth/me` carry `identity.pendingDeletion = {requestId, scope, status, dueAt}` while a request is open, else `null`. Access tokens carry a `deletion_pending` claim that the other services check, so **after POST or DELETE the app must refresh its session** before the next order or meal-plan call, or the old token keeps the old answer.
- While a request with scope `CUSTOMER` or `ALL` is open: order checkout and scheduled orders, and starting a meal plan, return 409 `ACCOUNT_DELETION_PENDING`. While one with `CHEF` or `ALL` is open: creating a chef meal plan, reopening a plan to subscribers, and kitchen schedule changes return 409 `ACCOUNT_DELETION_PENDING`. Each carries a plain message ending "Tap Keep my account to …".
- Day 30, whole account: the identity becomes `SUSPENDED` and sessions are revoked, so the app's refresh fails and it signs out. A fresh sign-in is refused before any token: OTP verify answers 403 `IDENTITY_INACTIVE` (`Msg91FirebaseBridge`, `CentralOtpIdentity`), the Firebase exchange and `/me` answer 403 `IDENTITY_NOT_ACTIVE` (`AuthService.assertActive`). A staff suspension gives the same codes, so the app cannot tell the two apart. Once the erase finishes, the phone number is free and signing in creates a new account.
- Day 30, one side only: the role is removed and the identity stays `ACTIVE`. For scope `CUSTOMER`, signing in does not give CUSTOMER back until the erase completes (`AuthService.ensureCustomerRole` skips it), and a token refresh never adds it.
- Deletion notices arrive in the in-app inbox (and push) with `targetType = "ACCOUNT_DELETION"`, `targetId = requestId`.
- Until plan 5, the routes answer 503 `ACCOUNT_DELETION_NOT_ENABLED` (switch off) or a 404 from the gateway with no Craves error code (route not published).

## Approaches

1. **Session-driven (chosen).** `pendingDeletion` already rides on every sign-in and token refresh. The app keeps it with the signed-in identity in `authSlice`; one banner mounted once at the app root reads it; the deletion screens call the three endpoints and refresh the session after POST/DELETE. Single source of truth, the same one the server enforces against.
2. A separate checker calling `GET /me/deletion` on every app open and foreground. More calls, and its answer can disagree with the token the server checks. Rejected.
3. A remote on/off flag to show the row. The app has no remote flags; it would need new server work. Rejected: probing the endpoint answers the same question.

Owner picked approach 1 on 5 Nov.

## Owner decisions (from the parent design and this round)

- 30-day wait; Keep my account cancels at any time before erasing starts.
- Chef deletions are reviewed by Craves; payouts and chef referral cash are settled first; the kitchen closes to new orders at request time and reopens exactly as it was on Keep or on rejection.
- A person with both roles chooses **from the side they are signed in on**: that side only, or the whole account (owner's words, 5 Nov). Customer-only accounts get no choice (`ALL`).
- Final confirmation is a **confirm sheet** (not typing DELETE, not an OTP).
- No forced sign-out during the wait; banner on every screen.
- The 15 boards on the canvas are the approved look.
- A chef keeps chef mode while their customer side is deleted: chef mode no longer needs the CUSTOMER role (5 Nov).

## What the person sees

Board names refer to the canvas.

### Where the row lives, and when it shows

- Customer: Privacy & security gets a "Your account" section with one row, **Delete account**, subtitle "Your details are removed 30 days after you ask" (board *Main*). The screen's subtitle becomes "Password, sign-out and your account".
- Chef: Login & security's row **Delete my account** keeps its place and trash icon; subtitle becomes "Your chef side, or your whole account" and it opens the deletion flow (board *ChefSecurity*). The navigation to `ChefSupportTicket` for this topic goes.
- Both screens call `GET /me/deletion` when they gain focus. The row shows only after a 200 or a 404 with code `NO_DELETION_REQUEST`. On 503, a 404 without that code, a network error or anything else, the row stays hidden (no error message; the next focus asks again).

### One entry screen, five states

Tapping the row opens one screen per mode (customer: inside the customer settings scaffold; chef: inside `ChefScreen` with `ChefTopBar`). It shows a state chosen from the latest `GET`:

| Latest request | Shows |
|---|---|
| none (404), `CANCELLED`, or `COMPLETED` | the start: chooser (if any), then the summary |
| `PENDING_REVIEW` | Request sent, in review (board *ChefRequestSent*) |
| `SCHEDULED`, `WAITING_ON_OPEN_ITEMS` | Scheduled with the date (board *CustomerScheduled*; for scope CHEF the chef wording) |
| `ERASING` (one side) | "Your chef side is being deleted" / "Your customer side is being deleted", no button |
| `REJECTED` | Declined with Craves' reason (board *ChefRejected*); **Ask again** goes to the start |

A request opened from the other mode shows here too (one open request at a time).

### The start

- **Chooser** (board *ChefChooseSide*), shown when the person has the CHEF role:
  - In chef mode: "Only my chef side" (`CHEF`) / "My whole account" (`ALL`).
  - In customer mode: "Only my customer side" (`CUSTOMER`) / "My whole account" (`ALL`).
  - Nothing is preselected; Continue stays disabled until one is picked.
  - With the RIDER role, "My whole account" is not offered and the screen adds "To delete your rider account, contact Craves." A customer-only account with RIDER goes straight to the customer-side summary with `CUSTOMER`.
- **Summary**, one of four, built from the two approved summary boards:
  - Whole account, customer-only (`ALL`): board *CustomerDelete* as drawn, with two lines added to its "Until 5 Dec" box (disclosures the server's behaviour requires): "An order you already placed, or a checkout you started before today, can still be paid and delivered." and, after the meal-plan line, "Keep my account doesn't bring it back."
  - Customer side only (`CUSTOMER`): board *CustomerDelete* without "phone number and email" in the profile line and without the referral-credits line and the sign-up-again line, plus the green box "Your chef side stays. Your kitchen keeps running."
  - Chef side only (`CHEF`): board *ChefDelete* as drawn.
  - Whole account with a chef side (`ALL`): board *ChefDelete*'s four steps, then both "What goes" lists (chef items, then customer items including referral credits), both "kept" lines, no green box.
  - The date line says "Deleted on 5 Dec 2026" (today + 30 days) for customer scopes and "30 days after Craves approves" for scopes with the chef side.
- **Confirm sheet** (boards *CustomerConfirm*, *ChefConfirm*): customer scopes use "Delete your account on 5 Dec?" / "Delete my account"; scopes with the chef side use "Close your kitchen and send the request?" / "Close kitchen and send". Cancel closes the sheet. The red button sends `POST {scope, via: "APP"}`, shows a spinner, refreshes the session, then replaces the flow with the state screen.

### The banner (boards *CustomerOrders*, *BannerStates*)

One amber strip at the top of every screen of the signed-in customer and chef app, both modes, whenever `identity.pendingDeletion` is non-null. Copy by request:

| `pendingDeletion` | Text | Button |
|---|---|---|
| `PENDING_REVIEW` | Delete request with Craves | Keep my account |
| `SCHEDULED`, scope `ALL` | Account deleted on 5 Dec | Keep my account |
| `SCHEDULED`, scope `CHEF` | Chef side deleted on 5 Dec | Keep my account |
| `SCHEDULED`, scope `CUSTOMER` | Customer side deleted on 5 Dec | Keep my account |
| `WAITING_ON_OPEN_ITEMS` | Deleting once open items are settled | Keep my account |
| `ERASING` (one side) | Chef side being deleted / Customer side being deleted | none |

Dates are `dueAt` in the phone's time zone, "d MMM" (en-IN). Not shown on sign-in, splash, the Keep-it screen or the being-deleted screen.

### Keep my account (banner, state screens, refusal notices, Keep-it screen)

`DELETE /me/deletion` → refresh the session → banner goes → a short confirmation "Your account is kept." For customer scopes, when the request ended a meal plan, add "Meal plans that ended when you asked stay ended." For scopes with the chef side: "Your kitchen reopens as it was within a minute" (the server's release runs on a one-minute worker). On 409 `ACCOUNT_DELETION_IN_PROGRESS`: "Deletion has already started and can't be stopped." On 404: refresh the session silently (the request already ended).

### Refusals while a request is open

Wherever the server answers 409 `ACCOUNT_DELETION_PENDING`, the screen shows the deletion notice (board *CustomerCart*: the server's message is replaced by "Your account is set to be deleted on 5 Dec, so new orders are paused." for customer scopes, the server's own message for chef actions) with a **Keep my account** button, in place of today's generic error banner. Call sites: customer checkout (`CustomerCartScreen`), scheduled order create, meal-plan payment (`useSubscriptionCheckout` / `MealPlanPaymentScreen`), chef kitchen open/schedule change (`useKitchenOpenState`), chef meal-plan create and "take subscribers". The reorder button on order cards (`CustomerOrderCard` `reorderDisabled`) is disabled while `pendingDeletion.scope` is `CUSTOMER` or `ALL`.

### Signing in

- **Keep it?** (board *KeepIt*): right after a fresh phone sign-in (not when the app restores a saved session), if `pendingDeletion` is open and not `ERASING`. "Keep my account" → DELETE as above → app; "Not now" → app with the banner. Shown once per sign-in.
- **Account not available** (board *BeingDeleted*, reworded): when sign-in fails with 403 `IDENTITY_INACTIVE` (OTP screens) or 403 `IDENTITY_NOT_ACTIVE` (Firebase exchange, `/me`, and the account router's existing `requireActiveIdentity` check), the app shows this screen instead of a generic error. Title "This account isn't available". Body: "If you asked Craves to delete it, the deletion is finishing. You can sign up again with this phone number in a day or two. If you didn't, contact Craves support." Buttons: the support contact the app already shows elsewhere, and **Sign out** (or **Back** on the OTP screens, where nobody is signed in yet). The copy covers both deletion and a staff suspension because the server answers both the same way.
- **Keep it?** for a request with no date yet (`PENDING_REVIEW`): "Your delete request is with Craves. Do you want to keep your account?"
- A chef whose chef side is `ERASING` and who signs in to chef mode sees the one-side "being deleted" state with a button to switch to the customer side.

### Notifications

Inbox items with `targetType` `ACCOUNT_DELETION` open the entry screen of the current mode (add the case beside `ORDER`, `DELIVERY`, `KITCHEN` in `resolveCustomerNotificationDestination` and the chef inbox equivalent).

## How it works (the decided parts)

- **State.** `Identity` gains `pendingDeletion: PendingDeletion | null` and the `RIDER` role. `authSlice` gains an `identityRefreshed(identity)` action that updates `identity` without touching `accountResolution`. `sessionManager` lets one listener hear every successful token rotation (silent refresh on 401, the foreground timer in `useSessionLifecycle`, and explicit refreshes); the app root registers a listener that dispatches `identityRefreshed`. So the banner follows the server within one access-token lifetime (Craves approving changes "Delete request with Craves" to "Chef side deleted on …" without a restart).
- **Chef mode without the customer role** (owner approved 5 Nov; this approval is the explicit request `apps/mobile/AGENTS.md` asks for before an auth change). An identity holding CHEF opens chef mode even when CUSTOMER is missing: `resolveChef` in `accountResolutionService.ts` requires CUSTOMER only for identities without CHEF (applicants). The builder checks that every call chef mode makes at sign-in (for example the chef application read) accepts a token without CUSTOMER, and reports any that does not.
- **Role loss.** If a refreshed identity no longer has the role the current mode was resolved for (one-side erase), the app re-runs account resolution. Customer mode that lost CUSTOMER moves a chef to chef mode, banner showing; chef mode that lost CHEF moves the person to customer mode.
- **After POST/DELETE:** `sessionManager.refresh()`; its listener updates the store; the screen then reads the store. If the refresh fails with a network error, the screen still shows the server's answer and the banner catches up on the next refresh.
- **Banner placement.** Rendered once above the navigators for the authenticated product roots; it pads the status-bar inset itself and the content below must not pad it again. Screens use `ScreenShell` (35), `ChefScreen`, and 17 files call `useSafeAreaInsets` directly, so the inset must be removed for all of them in one place (a nested safe-area provider below the banner), not screen by screen. Status bar icons are dark while the banner shows.
- **Code home.** A new `features/accountDeletion/` holds the API client (on the shared `apiClient`, errors via `AppApiError.code`), the pure model (state from a GET result, chooser options from roles + mode, banner copy, row visibility from an error), the banner, the Keep action hook, the notice used at refusal sites, and the screens. Customer and chef screens share the model and content components and differ only in their scaffold. Routes are registered in both navigators and in `navigationPolicy.ts` / `processRestoration.ts` like the existing settings children.
- **Copy** is in the approved boards and the tables above; the app speaks of "Craves", never "we".

## My calls (owner can change)

1. The chooser offers two options per mode (the owner's words), not three on one screen as the parent design said.
2. "Not now" on Keep it? goes into the app with the banner instead of signing out (the parent design contradicted itself; its later "no forced sign-out" rule keeps the delivery code visible).
3. The banner is amber, not red: red already marks errors and delete buttons.
4. `WAITING_ON_OPEN_ITEMS` reads "Deleting once open items are settled" instead of the board's "once open orders finish": the open item can be a refund, a payout or a referral balance.
5. The customer-side-only and chef-with-whole-account summaries are composed from the two approved summary boards as described, not drawn separately.
6. Deletion takes version 1.36.17; the allergens feature planned for 1.36.17 moves to the next free version.
7. Nothing is preselected in the chooser (anti-goal: wrong side).
8. The approved *BeingDeleted* screen becomes "This account isn't available", worded for both deletion and a staff suspension, because the server refuses both at sign-in with the same code. No server change.
9. Two disclosure lines are added to the customer summary and the Keep confirmation: a checkout started before the request can still be paid and delivered, and a meal plan ended by the request stays ended after Keep my account.

## Left to the builder

- Component and file names inside `features/accountDeletion/`, query caching (use the app's existing query pattern), and how the Keep-it gate is mounted (the `ChefAvatarGate` pattern is the model).
- The exact nested safe-area technique, proven on the phone.
- Test layout, following the app's Jest 29 + react-test-renderer tests. The pure model (state, chooser, banner copy, row visibility) and the three API calls must be unit-tested; `ChefSecurityScreen.test.tsx`, which pins the support-ticket row, changes with the row.

## Release and checking

- 1.36.17 can be built, installed and shipped before plan 5: with the server switch off the row stays hidden and `pendingDeletion` is always null, so only "nothing changed" can be checked on the owner's phone (Xiaomi `GURKT4DYYPUW7DX8`). The full flow is checked on the phone with a test account after plan 5 turns the switch on.
- The Play submission waits for plans 4 and 5: Google's reviewers look for the in-app path and the web page, and both work only once the switch is on.
