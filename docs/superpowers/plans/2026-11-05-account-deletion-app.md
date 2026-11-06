# Delete Account in the App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers and chefs can ask to delete their account in the Craves app, see where the request stands, take it back with Keep my account, and see a banner on every screen while a request is open; ships as 1.36.17 (117).

**Architecture:** The server already puts `pendingDeletion` on every sign-in and token refresh. The app keeps it on `state.auth.identity` (updated on every token rotation), one `AccountDeletionProvider` at the app root renders the banner and owns the Keep action, and a new `features/accountDeletion/` holds the API, a pure model, the copy and the screens that the customer and chef navigators register.

**Tech Stack:** React Native 0.8x, Redux Toolkit (`authSlice`), @tanstack/react-query 5, zod, react-native-safe-area-context 5.7, Jest 29 + react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-11-05-account-deletion-app-design.md` (this repo). Parent: `docs/superpowers/specs/2026-11-03-account-deletion-design.md` (platform `main`, also `C:\mcoord`). Approved screens: https://claude.ai/artifact/Mo4ick1Ff8bKbcj1h1z7ub.

## Global Constraints

- Work in `C:\mdelapp` (branch `feat/account-deletion-app`), app code in `apps/mobile`. Run every command from `C:\mdelapp\apps\mobile`.
- Customer and chef app only. Never touch rider flavor code (`com.cravesapp.rider`, anything under a `rider` source set).
- No server change. Endpoints, bodies and error codes exactly as the spec's contract table: `POST|GET|DELETE /api/v1/auth/me/deletion`, POST body `{"scope": ..., "via": "APP"}`.
- All user-facing text comes from `features/accountDeletion/domain/deletionCopy.ts` (Task 1) verbatim. Speak of "Craves", never "we".
- Banner colours: `colors.warningSoft` ground, `colors.warningText` text; the Keep pill is white with `colors.flameRedAccessible` (or the app's existing accessible red token) text.
- Dates: `dueAt` shown in the device time zone, short "5 Dec", long "5 Dec 2026", `en-IN`.
- No preselected option in the chooser; never send a scope wider than the one the person tapped.
- Nothing about deletion shows while `GET /me/deletion` fails with anything other than 404 `NO_DELETION_REQUEST`.
- After every successful POST or DELETE, call `sessionManager.refresh()` before reading state again.
- Tests: Jest 29 + react-test-renderer in the style of `features/chefProfile/screens/ChefSecurityScreen.test.tsx` (mock navigation, safe area, store hooks; `screenQueries`). Run single files with `npx jest <path>`; typecheck with `npx tsc --noEmit`; lint with `npx eslint <paths>`.
- Commit messages follow the repo: `feat(mobile): …`, `fix(mobile): …`, `chore(mobile): …`, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit locally only; never push.
- Release build: `node_modules` must be a real install (`npm ci`), never a junction.

## Review Focus

1. A double tap on the red confirm button sends one POST, and the button shows a spinner and ignores taps while sending (Task 7 test).
2. The session refresh after POST fails on a bad network: the screen still moves to the request's state from the POST answer, and the banner appears on the next refresh (Task 7 test).
3. `dueAt` at 18:30 UTC shows the next day in India: `2026-12-05T18:30:00Z` reads "6 Dec" in `Asia/Kolkata` (Task 1 test).
4. An identity from an older server without the `pendingDeletion` field (undefined) shows no banner and no crash (Tasks 1 and 3 tests).
5. A restored session (app reopened, `useBootstrap`) with an open request does not show Keep it?; only a fresh OTP or email sign-in does (Task 10 test).

---

### Task 1: Types, copy and the pure model

**Files:**
- Setup: `npm ci` in `apps/mobile` if `node_modules` is missing.
- Modify: `src/features/auth/domain/types.ts` (Identity, IdentityRole)
- Create: `src/features/accountDeletion/domain/deletionTypes.ts`
- Create: `src/features/accountDeletion/domain/deletionCopy.ts`
- Create: `src/features/accountDeletion/domain/deletionModel.ts`
- Test: `src/features/accountDeletion/domain/deletionModel.test.ts`

**Interfaces:**
- Produces (`deletionTypes.ts`):
  - `type DeletionScope = 'CUSTOMER' | 'CHEF' | 'ALL'`
  - `type DeletionStatus = 'PENDING_REVIEW' | 'SCHEDULED' | 'WAITING_ON_OPEN_ITEMS' | 'ERASING' | 'CANCELLED' | 'REJECTED' | 'COMPLETED'`
  - `interface PendingDeletion {requestId: string; scope: DeletionScope; status: DeletionStatus; dueAt: string | null}`
  - `interface DeletionView {requestId: string; scope: DeletionScope; status: DeletionStatus; requestedAt: string; dueAt: string | null; reviewNote: string | null}`
  - `type AppMode = 'CUSTOMER' | 'CHEF'`
- Produces (`types.ts`): `IdentityRole` gains `'RIDER'`; `Identity` gains `pendingDeletion?: PendingDeletion | null`.
- Produces (`deletionModel.ts`):
  - `isOpenStatus(status: DeletionStatus): boolean`
  - `formatDeletionDate(iso: string, style: 'short' | 'long', timeZone?: string): string`
  - `type EntryState = {kind: 'start'} | {kind: 'inReview' | 'scheduled' | 'waiting' | 'erasing' | 'declined'; view: DeletionView}`
  - `entryStateFor(latest: DeletionView | null): EntryState`
  - `type ScopeChoice = {scope: DeletionScope; title: string; subtitle: string}`
  - `type ScopePlan = {kind: 'direct'; scope: DeletionScope} | {kind: 'choose'; options: ScopeChoice[]; riderNote: boolean}`
  - `scopePlanFor(roles: readonly string[], mode: AppMode): ScopePlan`
  - `type SummaryKind = 'customerAll' | 'customerSide' | 'chefSide' | 'chefAll'`
  - `summaryKindFor(scope: DeletionScope, roles: readonly string[]): SummaryKind`
  - `bannerFor(pending: PendingDeletion | null | undefined, timeZone?: string): {text: string; canKeep: boolean} | null`
  - `shouldShowDeleteRow(result: {ok: true} | {ok: false; error: AppApiError}): boolean`
  - `isDeletionPaused(error: unknown): boolean` (true when `toAppApiError(error).code === 'ACCOUNT_DELETION_PENDING'`)
  - `pausedOrderText(pending: PendingDeletion | null | undefined, kind: 'orders' | 'mealPlans'): string`

- [ ] **Step 1: Write `deletionCopy.ts` exactly as below** (the spec and the approved boards fix this copy)

```ts
/** Every user-facing string of the account deletion flow. Approved 5 Nov 2026 (canvas Mo4ick1Ff8bKbcj1h1z7ub + design doc). */
export const deletionCopy = {
  row: {
    customerSection: 'Your account',
    customerTitle: 'Delete account',
    customerSubtitle: 'Your details are removed 30 days after you ask',
    privacySubtitle: 'Password, sign-out and your account',
    chefTitle: 'Delete my account',
    chefSubtitle: 'Your chef side, or your whole account',
  },
  chooser: {
    title: 'What do you want to delete?',
    body: 'You use Craves as a chef and as a customer.',
    chefSide: {title: 'Only my chef side', subtitle: 'Your kitchen, menu and dish photos go. You can still order food with this login.'},
    customerSide: {title: 'Only my customer side', subtitle: 'Your addresses, saved lists, reviews and meal plans go. Your kitchen keeps running.'},
    whole: {title: 'My whole account', subtitle: 'Your chef side and your customer side go, and the login itself.'},
    riderNote: 'To delete your rider account, contact Craves.',
    info: 'Craves reviews every chef request and settles your payouts before anything is deleted.',
    continue: 'Continue',
  },
  customerSummary: {
    title: 'Delete account',
    dateTitle: (long: string) => `Deleted on ${long}`,
    dateBody: '30 days from today. Until then you can keep your account from any screen.',
    goesLabel: 'What goes',
    goesAll: ['Your profile, name, phone number and email', 'Saved addresses', 'Favourites and saved lists', 'Reviews you wrote', 'Meal plans', 'Notifications and taste data', "Referral credits you haven't used"],
    goesSide: ['Your customer profile', 'Saved addresses', 'Favourites and saved lists', 'Reviews you wrote', 'Meal plans', 'Notifications and taste data'],
    keptLabel: 'What Craves keeps, without your name',
    keptTitle: 'Past orders, payments and refunds',
    keptBody: 'Kept for tax law, with your name and phone number removed.',
    untilLabel: (short: string) => `Until ${short}`,
    until: [
      'New orders and meal plans are paused.',
      'An order on its way still arrives, and you can see its delivery code.',
      'An order you already placed, or a checkout you started before today, can still be paid and delivered.',
      "An active meal plan ends today, with its usual refund. Keep my account doesn't bring it back.",
    ],
    signUpAgain: (short: string) => `After ${short} you can sign up again with the same phone number, as a new account.`,
    chefSideStays: 'Your chef side stays. Your kitchen keeps running.',
    button: 'Delete my account',
  },
  chefSummary: {
    titleSide: 'Delete my chef side',
    titleAll: 'Delete my account',
    howLabel: 'How it works',
    steps: [
      {title: 'Today your kitchen closes to new orders', body: 'Orders already cooking can still be finished.'},
      {title: 'Craves reviews your request', body: 'Your payouts and referral earnings are paid out first. Open orders, refunds and meal-plan customers are settled.'},
      {title: '30 days after approval', body: 'Until then you can keep your account and reopen your kitchen as it was.'},
    ],
    lastStepSide: 'Your chef side is deleted',
    lastStepAll: 'Your account is deleted',
    goesLabel: 'What goes',
    goes: ['Kitchen profile and kitchen photos', 'Menu and dish photos', 'Meal plans you offer', 'Chef application details'],
    keptLabel: 'What Craves keeps, locked',
    keptTitle: 'KYC documents, bank details, earnings and payouts',
    keptBody: 'Kept for tax law and locked. Nobody uses them for anything else.',
    customerSideStays: 'Your customer side stays. You can still order food and see your past orders.',
    button: 'Send delete request',
  },
  confirm: {
    customerAllTitle: (short: string) => `Delete your account on ${short}?`,
    customerSideTitle: (short: string) => `Delete your customer side on ${short}?`,
    customerAllBody: 'Your profile, addresses, saved lists, reviews and meal plans go. Past orders stay for tax, without your name.',
    customerSideBody: 'Your addresses, saved lists, reviews and meal plans go. Your chef side stays.',
    customerInfo: (short: string) => `New orders pause today. Changed your mind? Tap Keep my account any time before ${short}.`,
    customerButton: 'Delete my account',
    chefTitle: 'Close your kitchen and send the request?',
    chefSideBody: 'Your kitchen stops taking new orders now. Craves settles your payouts, then your chef side is deleted 30 days after approval.',
    chefAllBody: 'Your kitchen stops taking new orders now. Craves settles your payouts, then your whole account is deleted 30 days after approval.',
    chefInfo: 'Changed your mind? Keep my account reopens your kitchen as it was, any time before the date.',
    chefButton: 'Close kitchen and send',
    cancel: 'Cancel',
  },
  sendErrors: {
    notEnabled: "Deleting an account isn't available yet. Try again later.",
    scopeNotAllowed: "This account can't ask for that. Contact Craves support.",
    failed: "Your request wasn't sent. Try again.",
  },
  state: {
    inReviewTag: 'In review',
    inReviewTitle: 'Request sent',
    inReviewBody: 'Craves will finish it once your payouts are settled. Your kitchen is closed to new orders.',
    inReviewSteps: ['Request sent', 'Craves reviews it', '30-day wait'],
    inReviewStepBodies: ['', 'Payouts and open orders are settled first', 'Starts when Craves approves'],
    inReviewLastSide: 'Chef side deleted',
    inReviewLastAll: 'Account deleted',
    keepNoteKitchen: 'Reopens your kitchen as it was.',
    scheduledTag: 'Scheduled',
    scheduledTitle: {ALL: (long: string) => `Your account will be deleted on ${long}`, CHEF: (long: string) => `Your chef side will be deleted on ${long}`, CUSTOMER: (long: string) => `Your customer side will be deleted on ${long}`},
    scheduledBody: {ALL: 'New orders and meal plans are paused. Orders already placed still arrive.', CHEF: 'Your kitchen stays closed to new orders.', CUSTOMER: 'New orders and meal plans are paused. Orders already placed still arrive.'},
    stepAsked: 'You asked',
    stepReminder: 'Reminder',
    stepReminderBody: (short: string) => `Craves reminds you on ${short}`,
    stepDeleted: {ALL: 'Account deleted', CHEF: 'Chef side deleted', CUSTOMER: 'Customer side deleted'},
    waitingTag: 'Waiting',
    waitingTitle: 'Deleting once open items are settled',
    waitingBody: 'The date has passed. Craves finishes once your open orders, refunds or payouts are settled.',
    erasingTitle: {CHEF: 'Your chef side is being deleted', CUSTOMER: 'Your customer side is being deleted', ALL: 'Your account is being deleted'},
    erasingBody: "This can't be stopped now.",
    goToCustomerSide: 'Go to customer side',
    declinedTag: 'Declined',
    declinedTitle: {CHEF: "Craves couldn't delete your chef side yet", ALL: "Craves couldn't delete your account yet", CUSTOMER: "Craves couldn't delete your customer side yet"},
    reasonLabel: 'Reason from Craves',
    declinedLines: ['Your kitchen is back as it was, with the same hours and menu.', 'Nothing was deleted. You can ask again once this is sorted.'],
    askAgain: 'Ask again',
    contactSupport: 'Contact support',
  },
  banner: {
    inReview: 'Delete request with Craves',
    scheduled: {ALL: (short: string) => `Account deleted on ${short}`, CHEF: (short: string) => `Chef side deleted on ${short}`, CUSTOMER: (short: string) => `Customer side deleted on ${short}`},
    waiting: 'Deleting once open items are settled',
    erasing: {CHEF: 'Chef side being deleted', CUSTOMER: 'Customer side being deleted', ALL: 'Account being deleted'},
    keep: 'Keep my account',
  },
  keep: {
    kept: 'Your account is kept.',
    mealPlans: 'Meal plans that ended when you asked stay ended.',
    kitchen: 'Your kitchen reopens as it was within a minute.',
    inProgress: "Deletion has already started and can't be stopped.",
    failed: "Couldn't keep your account. Try again.",
  },
  paused: {
    orders: (short: string | null) => (short ? `Your account is set to be deleted on ${short}, so new orders are paused.` : 'Your account is set to be deleted, so new orders are paused.'),
    mealPlans: (short: string | null) => (short ? `Your account is set to be deleted on ${short}, so new meal plans are paused.` : 'Your account is set to be deleted, so new meal plans are paused.'),
  },
  keepIt: {
    title: {ALL: (short: string) => `Your account will be deleted on ${short}`, CHEF: (short: string) => `Your chef side will be deleted on ${short}`, CUSTOMER: (short: string) => `Your customer side will be deleted on ${short}`},
    reviewTitle: 'Your delete request is with Craves',
    question: 'Do you want to keep your account?',
    body: "If you don't, you can still see your orders until then. New orders stay paused.",
    keep: 'Keep my account',
    notNow: 'Not now',
  },
  unavailable: {
    title: "This account isn't available",
    body: "If you asked Craves to delete it, the deletion is finishing. You can sign up again with this phone number in a day or two. If you didn't, contact Craves support.",
    support: 'Contact support',
    signOut: 'Sign out',
    back: 'Back',
  },
} as const;
```

- [ ] **Step 2: Write the failing model tests** in `deletionModel.test.ts`

```ts
const view = (over: Partial<DeletionView>): DeletionView => ({requestId: 'r1', scope: 'ALL', status: 'SCHEDULED', requestedAt: '2026-11-05T05:00:00Z', dueAt: '2026-12-05T05:00:00Z', reviewNote: null, ...over});
const pending = (over: Partial<PendingDeletion>): PendingDeletion => ({requestId: 'r1', scope: 'ALL', status: 'SCHEDULED', dueAt: '2026-12-05T05:00:00Z', ...over});

test('entryStateFor maps the latest request', () => {
  expect(entryStateFor(null)).toEqual({kind: 'start'});
  expect(entryStateFor(view({status: 'CANCELLED'})).kind).toBe('start');
  expect(entryStateFor(view({status: 'COMPLETED'})).kind).toBe('start');
  expect(entryStateFor(view({status: 'PENDING_REVIEW', dueAt: null})).kind).toBe('inReview');
  expect(entryStateFor(view({status: 'SCHEDULED'})).kind).toBe('scheduled');
  expect(entryStateFor(view({status: 'WAITING_ON_OPEN_ITEMS'})).kind).toBe('waiting');
  expect(entryStateFor(view({status: 'ERASING'})).kind).toBe('erasing');
  expect(entryStateFor(view({status: 'REJECTED', reviewNote: 'Payout dispute open'})).kind).toBe('declined');
});

test('scopePlanFor follows the side the person is signed in on', () => {
  expect(scopePlanFor(['CUSTOMER'], 'CUSTOMER')).toEqual({kind: 'direct', scope: 'ALL'});
  expect(scopePlanFor(['CUSTOMER', 'RIDER'], 'CUSTOMER')).toEqual({kind: 'direct', scope: 'CUSTOMER'});
  const chef = scopePlanFor(['CUSTOMER', 'CHEF'], 'CHEF');
  expect(chef).toEqual({kind: 'choose', riderNote: false, options: [
    {scope: 'CHEF', ...deletionCopy.chooser.chefSide}, {scope: 'ALL', ...deletionCopy.chooser.whole}]});
  const customerMode = scopePlanFor(['CUSTOMER', 'CHEF'], 'CUSTOMER');
  expect(customerMode.kind === 'choose' && customerMode.options.map(o => o.scope)).toEqual(['CUSTOMER', 'ALL']);
  const rider = scopePlanFor(['CUSTOMER', 'CHEF', 'RIDER'], 'CHEF');
  expect(rider).toEqual({kind: 'choose', riderNote: true, options: [{scope: 'CHEF', ...deletionCopy.chooser.chefSide}]});
  expect(scopePlanFor(['CHEF'], 'CHEF').kind).toBe('choose'); // chef whose customer side is gone
});

test('summaryKindFor', () => {
  expect(summaryKindFor('ALL', ['CUSTOMER'])).toBe('customerAll');
  expect(summaryKindFor('ALL', ['CUSTOMER', 'CHEF'])).toBe('chefAll');
  expect(summaryKindFor('CUSTOMER', ['CUSTOMER', 'CHEF'])).toBe('customerSide');
  expect(summaryKindFor('CHEF', ['CUSTOMER', 'CHEF'])).toBe('chefSide');
});

test('formatDeletionDate uses the given time zone', () => {
  expect(formatDeletionDate('2026-12-05T05:00:00Z', 'short', 'Asia/Kolkata')).toBe('5 Dec');
  expect(formatDeletionDate('2026-12-05T05:00:00Z', 'long', 'Asia/Kolkata')).toBe('5 Dec 2026');
  expect(formatDeletionDate('2026-12-05T18:30:00Z', 'short', 'Asia/Kolkata')).toBe('6 Dec');
});

test('bannerFor covers every open state and nothing else', () => {
  const tz = 'Asia/Kolkata';
  expect(bannerFor(null)).toBeNull();
  expect(bannerFor(undefined)).toBeNull();
  expect(bannerFor(pending({status: 'PENDING_REVIEW', scope: 'CHEF', dueAt: null}), tz)).toEqual({text: 'Delete request with Craves', canKeep: true});
  expect(bannerFor(pending({}), tz)).toEqual({text: 'Account deleted on 5 Dec', canKeep: true});
  expect(bannerFor(pending({scope: 'CHEF'}), tz)?.text).toBe('Chef side deleted on 5 Dec');
  expect(bannerFor(pending({scope: 'CUSTOMER'}), tz)?.text).toBe('Customer side deleted on 5 Dec');
  expect(bannerFor(pending({status: 'WAITING_ON_OPEN_ITEMS'}), tz)).toEqual({text: 'Deleting once open items are settled', canKeep: true});
  expect(bannerFor(pending({status: 'ERASING', scope: 'CHEF'}), tz)).toEqual({text: 'Chef side being deleted', canKeep: false});
  expect(bannerFor(pending({status: 'CANCELLED'}), tz)).toBeNull();
});

test('shouldShowDeleteRow only after a 200 or a 404 NO_DELETION_REQUEST', () => {
  expect(shouldShowDeleteRow({ok: true})).toBe(true);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('NO_DELETION_REQUEST', 'x', 404)})).toBe(true);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('ACCOUNT_DELETION_NOT_ENABLED', 'x', 503)})).toBe(false);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('HTTP_404', 'x', 404)})).toBe(false);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('NETWORK_ERROR', 'x')})).toBe(false);
});

test('pausedOrderText and isDeletionPaused', () => {
  expect(isDeletionPaused(new AppApiError('ACCOUNT_DELETION_PENDING', 'x', 409))).toBe(true);
  expect(isDeletionPaused(new AppApiError('CART_EMPTY', 'x', 409))).toBe(false);
  expect(pausedOrderText(pending({dueAt: '2026-12-05T05:00:00Z'}), 'orders')).toMatch(/^Your account is set to be deleted on \d+ Dec, so new orders are paused\.$/);
  expect(pausedOrderText(null, 'mealPlans')).toBe('Your account is set to be deleted, so new meal plans are paused.');
});
```

- [ ] **Step 3: Run** `npx jest src/features/accountDeletion/domain` — Expected: FAIL (module not found).
- [ ] **Step 4: Implement `deletionTypes.ts`, the two `types.ts` additions and `deletionModel.ts`.** `formatDeletionDate` uses `Intl.DateTimeFormat('en-IN', {day: 'numeric', month: 'short', timeZone})`, adding `year: 'numeric'` for `'long'`. `pausedOrderText` uses the short date of `pending.dueAt` when present, the device time zone.
- [ ] **Step 5: Run** `npx jest src/features/accountDeletion/domain` and `npx tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `feat(mobile): account deletion model and copy`.

### Task 2: API client

**Files:**
- Create: `src/features/accountDeletion/api/accountDeletionApi.ts`
- Test: `src/features/accountDeletion/api/accountDeletionApi.test.ts`

**Interfaces:**
- Consumes: `DeletionView`, `DeletionScope` (Task 1); `httpClient` (`core/http/httpClient.ts`: `get<T>(url)`, `post<T>(url, data)`, `delete<T>(url)`, each resolving to the response body); `toAppApiError`.
- Produces: `accountDeletionApi = { getLatest(): Promise<DeletionView | null>; request(scope: DeletionScope): Promise<DeletionView>; keep(): Promise<DeletionView> }`, path constant `ACCOUNT_DELETION_PATH = '/api/v1/auth/me/deletion'`.

- [ ] **Step 1: Failing tests** (mock `../../../core/http/httpClient`):
  - `getLatest` returns the parsed view on 200; returns `null` when the call rejects with an `AppApiError` whose `code` is `NO_DELETION_REQUEST`; rethrows 503 `ACCOUNT_DELETION_NOT_ENABLED` and a 404 with another code.
  - `request('CHEF')` posts `{scope: 'CHEF', via: 'APP'}` to `ACCOUNT_DELETION_PATH` and returns the view.
  - `keep()` sends `DELETE` to `ACCOUNT_DELETION_PATH`.
  - A body missing `requestId` or with an unknown `status` rejects with `AppApiError` code `ACCOUNT_DELETION_INVALID_RESPONSE`.
- [ ] **Step 2: Run** `npx jest src/features/accountDeletion/api` — Expected: FAIL.
- [ ] **Step 3: Implement** with a zod schema for `DeletionView` (`reviewNote` and `dueAt` nullable).
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): account deletion API client`.

### Task 3: Identity follows every token rotation

**Files:**
- Modify: `src/features/auth/state/authSlice.ts`
- Modify: `src/features/auth/api/sessionManager.ts`
- Create: `src/features/accountDeletion/state/useIdentitySync.ts`
- Modify: `src/app/navigation/AppNavigator.tsx` (call `useIdentitySync()` in the root component)
- Tests: `src/features/auth/state/authSlice.test.ts` (create or extend), `src/features/auth/api/sessionManager.test.ts`, `src/features/accountDeletion/state/useIdentitySync.test.tsx`

**Interfaces:**
- Produces:
  - `authActions.identityRefreshed(identity: Identity)`: sets `state.identity`; leaves `bootstrapStatus`, `selectedRole`, `accountResolution` alone; ignored unless `bootstrapStatus === 'authenticated'`.
  - `sessionManager.onTokensRotated(listener: (tokens: AuthTokenResponse) => void): () => void` — called after every successful rotation in `rotateRefreshToken`, after the refresh token is saved; returns an unsubscribe.
  - `useIdentitySync(): void` — subscribes to `onTokensRotated`, dispatches `identityRefreshed(tokens.identity)`, then applies the role-loss rule: if `accountResolution.flow === 'CUSTOMER'` and the identity lacks `CUSTOMER` while holding `CHEF`, dispatch `authActions.roleSelected('CHEF')`; if `accountResolution.flow === 'CHEF'` and the identity lacks `CHEF`, dispatch `authActions.roleSelected('CUSTOMER')`.
  - `refreshAfterDeletionChange(): Promise<void>` in `src/features/accountDeletion/state/refreshAfterDeletionChange.ts` — `await sessionManager.refresh()`, swallowing network errors (the listener does the store update).

- [ ] **Step 1: Failing tests:** reducer keeps `accountResolution` on `identityRefreshed`; reducer ignores it when anonymous; `onTokensRotated` listener receives the rotated tokens once per refresh and not after unsubscribe; `useIdentitySync` dispatches `identityRefreshed` with `pendingDeletion` and dispatches `roleSelected('CHEF')` when a customer-mode identity loses `CUSTOMER` but has `CHEF`; an identity whose `pendingDeletion` is `undefined` is stored as is and no other action fires.
- [ ] **Step 2: Run** `npx jest src/features/auth src/features/accountDeletion/state` — Expected: FAIL.
- [ ] **Step 3: Implement** the three pieces; keep `sessionManager`'s single-flight `refreshPromise` behaviour unchanged.
- [ ] **Step 4: Run** the same plus `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): keep the signed-in identity current on every token refresh`.

### Task 4: Chef mode without the customer role

Owner approved this auth change on 5 Nov 2026 (spec, "Chef mode without the customer role"); it is the explicit request `apps/mobile/AGENTS.md` requires.

**Files:**
- Modify: `src/features/auth/state/accountResolutionService.ts` (`resolveChef`)
- Test: `src/features/auth/state/accountResolutionService.test.ts`

**Interfaces:**
- Consumes: `Identity.roles` including `'RIDER'` (Task 1).
- Produces: `resolveChef` calls `requireRole(identity, 'CUSTOMER')` only when the identity does not hold `CHEF`.

- [ ] **Step 1: Failing test:** `accountResolutionService.resolve('CHEF')` with roles `['CHEF']` and an approved chef application resolves to `{flow: 'CHEF', authorizedRole: 'CHEF', onboardingStatus: 'APPROVED'}`; roles `['RIDER']` still rejects with `ACCOUNT_ROLE_NOT_AUTHORIZED`.
- [ ] **Step 2: Run** `npx jest src/features/auth/state/accountResolutionService.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Then read every call the chef root makes on sign-in (`profileApi.getChefApplication`, the kitchen read in `useChefKitchen`) and record in the task report whether the server path checks the CUSTOMER role (`C:\mcoord\services` controllers); do not change server code.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): chef mode opens without the customer role`.

### Task 5: Provider, banner and Keep my account

**Files:**
- Create: `src/features/accountDeletion/state/AccountDeletionProvider.tsx`
- Create: `src/features/accountDeletion/components/AccountDeletionBanner.tsx`
- Modify: `src/app/navigation/AppNavigator.tsx` (wrap the authenticated product navigators)
- Tests: `src/features/accountDeletion/state/AccountDeletionProvider.test.tsx`, `src/features/accountDeletion/components/AccountDeletionBanner.test.tsx`

**Interfaces:**
- Consumes: `bannerFor`, `deletionCopy`, `accountDeletionApi.keep`, `refreshAfterDeletionChange`, `state.auth.identity.pendingDeletion`.
- Produces:
  - `useAccountDeletion(): {pending: PendingDeletion | null; keep(): Promise<'kept' | 'inProgress' | 'failed'>; keeping: boolean; notice: string | null}`. `keep()` calls the API, then `refreshAfterDeletionChange()`; on 404 `NO_DELETION_REQUEST` it refreshes and returns `'kept'`; on 409 `ACCOUNT_DELETION_IN_PROGRESS` returns `'inProgress'`. After `'kept'`, `notice` holds `deletionCopy.keep.kept` plus `deletionCopy.keep.kitchen` when the cancelled scope was `CHEF` or `ALL` with the CHEF role, or plus `deletionCopy.keep.mealPlans` for customer scopes, for 4 s. After `'inProgress'`/`'failed'`, `notice` holds `deletionCopy.keep.inProgress` / `deletionCopy.keep.failed` for 4 s.
  - `AccountDeletionProvider({children})`: provides the context and renders the banner strip above `children`.
  - Banner: one row, clock icon, text from `bannerFor`, Keep pill when `canKeep` (disabled while `keeping`), `accessibilityRole="alert"` on change; shows `notice` in the same strip when set (green `colors.successSoft`/`colors.successText` for kept, warning colours otherwise). Hidden when neither pending nor notice.
- Placement rule: the provider sits inside the authenticated branch only (never on sign-in, splash, `KeepItScreen` or `AccountUnavailableScreen`). The strip pads `useSafeAreaInsets().top` itself; everything below it renders inside a nested `<SafeAreaProvider>` with `initialMetrics` top `0` so `SafeAreaView`/`useSafeAreaInsets` below report no top inset while the strip shows. When the strip is hidden, no nested provider is rendered (screens keep today's insets). Status bar `barStyle="dark-content"` while the strip shows.

- [ ] **Step 1: Failing tests:** banner renders "Account deleted on 5 Dec" for a scheduled `ALL` request (mock the store, fix the time zone through `formatDeletionDate`'s parameter or `process.env.TZ`); no banner for `pendingDeletion: null`; Keep calls `accountDeletionApi.keep` once on a double tap, then `sessionManager.refresh`; 409 `ACCOUNT_DELETION_IN_PROGRESS` shows "Deletion has already started and can't be stopped."; `ERASING` shows no Keep button.
- [ ] **Step 2: Run** `npx jest src/features/accountDeletion/state src/features/accountDeletion/components` — Expected: FAIL.
- [ ] **Step 3: Implement**, then mount in `AppNavigator.tsx` around `AuthenticatedNavigator` (only when `auth.bootstrapStatus === 'authenticated'` and `accountResolution` is set).
- [ ] **Step 4: Run** the same and `npx jest src/app` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): account deletion banner with Keep my account`.

### Task 6: The Delete rows and the latest-request query

**Files:**
- Create: `src/features/accountDeletion/query/useLatestDeletion.ts`
- Modify: `src/features/customerSettings/screens/CustomerSettingsLegacyScreens.tsx` (`CustomerSettingsPrivacySecurityScreen`)
- Modify: `src/features/chefProfile/screens/ChefSecurityScreen.tsx`
- Modify: `src/app/navigation/types.ts` (add `CustomerSettingsDeleteAccount: undefined` to `CustomerSettingsChildStackParamList`; add `ChefDeleteAccount: undefined` to `ChefProfileStackParamList`)
- Tests: `ChefSecurityScreen.test.tsx` (update), `src/features/customerSettings/screens/CustomerSettingsPrivacySecurity.test.tsx` (create)

**Interfaces:**
- Produces:
  - `useLatestDeletion(): {latest: DeletionView | null; showRow: boolean; status: 'pending' | 'success' | 'error'; refetch(): void}` — a react-query query, key `['account-deletion', identityId]`, `queryFn` = `accountDeletionApi.getLatest`, `refetchOnMount: 'always'`, refetched on screen focus (`useFocusEffect`), `retry: false`; `showRow = shouldShowDeleteRow(...)`.
  - Route names `CustomerSettingsDeleteAccount` and `ChefDeleteAccount`: this task adds only their types; Task 7 registers the screens.
- Copy: `deletionCopy.row.*`. Customer: new section label "Your account" and one card with the red-titled row; screen subtitle becomes `deletionCopy.row.privacySubtitle`. Chef: the existing `Delete my account` row keeps its icon and `destructive`, new subtitle, `onPress` navigates to `ChefDeleteAccount`; the `ChefSupportTicket` navigation for this row goes.

- [ ] **Step 1: Failing tests:** each screen hides the row while the query is pending, on 503 and on a 404 without `NO_DELETION_REQUEST`; shows it on 200 and on 404 `NO_DELETION_REQUEST`; pressing it navigates to `CustomerSettingsDeleteAccount` / `ChefDeleteAccount`. Remove the old test that pinned `ChefSupportTicket`.
- [ ] **Step 2: Run** `npx jest src/features/chefProfile/screens/ChefSecurityScreen.test.tsx src/features/customerSettings` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): Delete account rows in Privacy & security and Login & security`.

### Task 7: The start flow (chooser, summary, confirm sheet)

**Files:**
- Create: `src/features/accountDeletion/screens/DeleteAccountScreen.tsx` (entry: reads `useLatestDeletion`, renders the start flow or Task 8's state view)
- Create: `src/features/accountDeletion/components/ScopeChooser.tsx`, `DeletionSummary.tsx`, `DeletionConfirmSheet.tsx`
- Create: `src/features/accountDeletion/screens/CustomerDeleteAccountScreen.tsx` (customer scaffold: back + title, `ScreenShell` like `ChildScaffold`) and `src/features/accountDeletion/screens/ChefDeleteAccountScreen.tsx` (`ChefScreen` + `ChefTopBar`)
- Modify: `src/app/navigation/CustomerRootNavigator.tsx` (register `CustomerSettingsDeleteAccount` next to `CustomerSettingsPrivacySecurity`, line ~465), `src/app/navigation/ChefRootNavigator.tsx` (register `ChefDeleteAccount` next to `ChefSecurity`, line ~150), `src/app/navigation/navigationPolicy.ts` (add `CustomerSettingsDeleteAccount` to `CURRENT_IMMERSIVE_ROUTES`), `src/app/navigation/CustomerRootNavigator.test.tsx` (expected screens list)
- Test: `src/features/accountDeletion/screens/DeleteAccountScreen.test.tsx`

**Interfaces:**
- Consumes: `scopePlanFor`, `summaryKindFor`, `formatDeletionDate`, `deletionCopy`, `accountDeletionApi.request`, `refreshAfterDeletionChange`, `useLatestDeletion`, `state.auth.identity.roles`, mode (`'CUSTOMER'` for the customer screen, `'CHEF'` for the chef screen).
- Produces: `DeleteAccountScreen({mode, Scaffold}: {mode: AppMode; Scaffold: React.ComponentType<{title: string; children: React.ReactNode; footer?: React.ReactNode}>})`; after a successful POST it sets the query data to the returned view (`queryClient.setQueryData`) so the screen shows the state view without a second GET, then calls `refreshAfterDeletionChange()`.
- Flow: plan `direct` → summary for that scope; plan `choose` → chooser (nothing selected, Continue disabled) → summary for the picked scope. Summary content by `SummaryKind` (spec, "The start"): `customerAll` = `customerSummary` with `goesAll`, kept block, `untilLabel` + all four `until` lines, `signUpAgain`; `customerSide` = `goesSide`, kept block, `until` lines, plus `chefSideStays` only when roles include `CHEF`; `chefSide` = `chefSummary` steps 1-3 + `lastStepSide`, `goes`, chef kept block, `customerSideStays`; `chefAll` = steps 1-3 + `lastStepAll`, chef `goes` then `customerSummary.goesAll`, both kept blocks, no stays box. Dates: today + 30 days for customer scopes. Footer button opens the confirm sheet (`confirm.*` by kind); the sheet's red button sends POST.
- POST errors: 503 → `sendErrors.notEnabled`; 409 `ACCOUNT_DELETION_SCOPE_NOT_ALLOWED` → `sendErrors.scopeNotAllowed`; 409 `ACCOUNT_DELETION_ALREADY_REQUESTED` → refetch `useLatestDeletion` (shows the open request); anything else → `sendErrors.failed`. Errors show inside the sheet above its buttons.

- [ ] **Step 1: Failing tests:**
  - customer-only identity skips the chooser and shows "Deleted on <date>" and "Referral credits you haven't used";
  - chef mode shows "Only my chef side" and "My whole account", Continue disabled until one is tapped, and tapping "Only my chef side" then the summary and sheet sends `{scope: 'CHEF', via: 'APP'}` (assert the mocked `accountDeletionApi.request` was called with `'CHEF'`);
  - **double tap on "Close kitchen and send" calls `request` once** (Review Focus 1);
  - **`sessionManager.refresh` rejecting with a network error still shows "Request sent"** (Review Focus 2);
  - 503 on POST shows "Deleting an account isn't available yet. Try again later.";
  - rider-and-chef identity in chef mode shows one option and "To delete your rider account, contact Craves."
- [ ] **Step 2: Run** `npx jest src/features/accountDeletion/screens` — Expected: FAIL.
- [ ] **Step 3: Implement** and register the routes.
- [ ] **Step 4: Run** the same plus `npx jest src/app/navigation` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): ask to delete the account from the app`.

### Task 8: State views and deletion notices

**Files:**
- Create: `src/features/accountDeletion/components/DeletionStateView.tsx` (in review, scheduled, waiting, erasing, declined)
- Modify: `src/features/accountDeletion/screens/DeleteAccountScreen.tsx` (render it for non-`start` entry states)
- Modify: `src/features/notifications/domain/customerNotificationsModel.ts` (`resolveCustomerNotificationDestination`: case `ACCOUNT_DELETION` → `{route: 'CustomerSettingsDeleteAccount'}`; extend the destination union) and the screen code that navigates by destination
- Modify: `src/features/chefShell/screens/ChefNotificationsScreen.tsx` (`open(notice)`: `targetType` `ACCOUNT_DELETION` → Profile tab → `ChefDeleteAccount`)
- Tests: `DeletionStateView.test.tsx`, `customerNotificationsModel.test.ts` (extend)

**Interfaces:**
- Consumes: `EntryState`, `useAccountDeletion().keep`, `deletionCopy.state.*`, `formatDeletionDate`.
- Produces: `DeletionStateView({state, roles, onAskAgain}: {state: Exclude<EntryState, {kind: 'start'}>; roles: readonly string[]; onAskAgain(): void})`.
- Content (spec, "One entry screen, five states"; boards *ChefRequestSent*, *CustomerScheduled*, *ChefRejected*):
  - inReview: tag, title, body, four steps (step 1 done with the short `requestedAt`, step 2 current), footer Keep button + `keepNoteKitchen`.
  - scheduled: tag, `scheduledTitle[scope](long dueAt)`, `scheduledBody[scope]`, steps "You asked" (done, short `requestedAt`), "Reminder" (`dueAt` − 7 days), `stepDeleted[scope]` (short `dueAt`), footer Keep button.
  - waiting: `waitingTag`, `waitingTitle`, `waitingBody`, Keep button.
  - erasing: `erasingTitle[scope]`, `erasingBody`, no button.
  - declined: tag, `declinedTitle[scope]`, reason box with `reviewNote`, `declinedLines`, footer "Ask again" (calls `onAskAgain`, which shows the start flow) and "Contact support" (customer: `CustomerSettingsSupport`; chef: `ChefSupport`).
  - After Keep returns `'kept'`, the screen refetches `useLatestDeletion` and shows the start flow.
- Notification targets use the existing UUID check (`isInboundResourceId(notice.targetId)`).

- [ ] **Step 1: Failing tests:** each state's title for a `CHEF` and an `ALL` view; declined shows the `reviewNote` text; erasing has no Keep button; Keep on scheduled calls `useAccountDeletion().keep`; a customer notice with `targetType: 'ACCOUNT_DELETION'` and a UUID `targetId` resolves to `CustomerSettingsDeleteAccount`, and with a non-UUID id to `null`.
- [ ] **Step 2: Run** `npx jest src/features/accountDeletion src/features/notifications` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): deletion request states and notices`.

### Task 9: Refusals while a request is open

**Files:**
- Create: `src/features/accountDeletion/components/DeletionPausedNotice.tsx`
- Modify: `src/features/cart/screens/CustomerCartScreen.tsx` (checkout `catch` near line 896 and the error render near line 997), and the screen that calls `scheduledOrdersApi.create` (find it with `grep -rn "scheduledOrdersApi" src --include=*.tsx`), giving its `catch` the same treatment
- Modify: `src/features/customerSubscription/state/useSubscriptionCheckout.ts` (`payNew` create `catch`, line ~224: add `deletionPaused: true` to the `not-completed` result when `isDeletionPaused(createError)`) and `src/features/customerSubscription/screens/MealPlanPaymentScreen.tsx` (render the notice for that result)
- Modify: `src/features/chefShell/domain/sellingNotReady.ts` (`chefFailureText`: return the server's `backendMessage` for `ACCOUNT_DELETION_PENDING`)
- Modify: `src/features/chefSubscription/screens/ChefMealPlanEditorScreen.tsx` (create path, line ~382) and `src/features/chefSubscription/query/chefMealPlanQueries.ts` (`setAcceptingSubscribers`, line ~135) callers so their failure text goes through `chefFailureText`
- Modify: `src/features/customerOrders/screens/CustomerOrdersScreen.tsx` (`reorderDisabled`, line ~511: also true while `pendingDeletion.scope` is `CUSTOMER` or `ALL`)
- Tests: `DeletionPausedNotice.test.tsx`, `sellingNotReady.test.ts` (extend or create), `useSubscriptionCheckout` test (extend the existing one), `CustomerOrdersScreen` test (extend)

**Interfaces:**
- Consumes: `isDeletionPaused`, `pausedOrderText`, `useAccountDeletion()`.
- Produces: `DeletionPausedNotice({kind}: {kind: 'orders' | 'mealPlans'})` — red-tinted box (`colors.dangerSoft` or the token `RecoverableErrorBanner` uses), alert icon, `pausedOrderText(pending, kind)`, white "Keep my account" pill calling `keep()`; after `'kept'` the notice hides and the cart can check out again.
- Server messages used for chef sites (exact, from catalog/subscription): "Your account is set to be deleted. Tap Keep my account to open your kitchen." / "… to create meal plans." / "… to take new subscribers." — shown through `chefFailureText`; the banner above carries the Keep button.

- [ ] **Step 1: Failing tests:** a 409 `ACCOUNT_DELETION_PENDING` from checkout renders `DeletionPausedNotice` instead of `RecoverableErrorBanner`; `payNew` returns `{kind: 'not-completed', deletionPaused: true, …}` on that 409; `chefFailureText(new AppApiError('ACCOUNT_DELETION_PENDING', 'm', 409, …, backendMessage 'Your account is set to be deleted. Tap Keep my account to open your kitchen.'), 'fallback')` returns that message; reorder is disabled with `pendingDeletion.scope === 'ALL'` and enabled with `'CHEF'`.
- [ ] **Step 2: Run** `npx jest src/features/cart src/features/customerSubscription src/features/chefShell src/features/customerOrders src/features/accountDeletion/components` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): explain paused orders and meal plans during deletion`.

### Task 10: Sign-in: Keep it?, account unavailable, chef side being deleted

**Files:**
- Modify: `src/features/auth/state/authSlice.ts` (`keepItPending: boolean`; `signedInFresh(identity)`; `keepItDismissed()`)
- Modify: `src/features/auth/screens/OtpVerificationScreen.tsx` (line ~140) and `src/features/auth/screens/EmailSignInScreen.tsx` (line ~81): dispatch `signedInFresh` instead of `authenticated`; on 403 `IDENTITY_INACTIVE` or `IDENTITY_NOT_ACTIVE` navigate to `AccountUnavailable`
- Create: `src/features/accountDeletion/screens/KeepItScreen.tsx`, `src/features/accountDeletion/screens/AccountUnavailableScreen.tsx`, `src/features/accountDeletion/components/KeepItGate.tsx`
- Modify: `src/app/navigation/types.ts` (`RootStackParamList.AccountUnavailable: {signedIn: boolean}`; add to `AuthStackParamList`), the auth navigator registration, `navigationPolicy.ts` (`AccountUnavailable` immersive)
- Modify: `src/features/auth/screens/AccountRouterScreen.tsx`: a resolve error with code `IDENTITY_NOT_ACTIVE` renders `AccountUnavailableScreen` (signed-in variant) instead of the generic error; a CHEF request whose identity has `pendingDeletion` `{scope: 'CHEF', status: 'ERASING'}` renders the erasing state with `deletionCopy.state.goToCustomerSide` dispatching `authActions.roleSelected('CUSTOMER')`
- Modify: `src/app/navigation/AppNavigator.tsx` (wrap the product navigators in `KeepItGate`, inside `AccountDeletionProvider` so the gate can call `keep()`)
- Modify: `src/features/accountDeletion/state/AccountDeletionProvider.tsx`: render no strip while `state.auth.keepItPending` is true (no banner on Keep it?)
- Tests: `authSlice.test.ts` (extend), `KeepItGate.test.tsx`, `AccountUnavailableScreen.test.tsx`, `AccountRouterScreen.test.tsx` (extend or create), `OtpVerificationScreen` test (extend)

**Interfaces:**
- Produces:
  - `authActions.signedInFresh(identity)`: same state as `authenticated`, plus `keepItPending = identity.pendingDeletion != null && isOpenStatus(status) && status !== 'ERASING'`. `authenticated` (used by `useBootstrap`) sets `keepItPending = false`. `keepItDismissed()` sets it `false`. `signedOut` resets it.
  - `KeepItGate({children})`: while `keepItPending`, renders `KeepItScreen` instead of `children` (no banner on it). Keep → `useAccountDeletion().keep()` then `keepItDismissed()`; Not now → `keepItDismissed()`.
  - `KeepItScreen` copy: `keepIt.title[scope](short dueAt)` or `keepIt.reviewTitle` when `dueAt` is null, then `keepIt.question`, `keepIt.body`, buttons `keepIt.keep`, `keepIt.notNow`.
  - `AccountUnavailableScreen({signedIn}: {signedIn: boolean})`: `unavailable.*` copy; "Contact support" opens `tel:+918367366787` (shortcut: the support number the server gives elsewhere, hard-coded because nobody is signed in to fetch it; move to a fetched value when a public support endpoint exists); bottom button `signOut` (signed in: `authService.logout()` + `signedOut`) or `back` (OTP screens: `navigation.goBack()`).

- [ ] **Step 1: Failing tests:**
  - `signedInFresh` with a scheduled `pendingDeletion` sets `keepItPending`; with `ERASING` or `null` it does not;
  - **`authenticated` (restore path) never sets `keepItPending`** (Review Focus 5);
  - the gate shows "Your account will be deleted on 5 Dec" and "Not now" reveals the children; Keep calls `keep()` then dismisses;
  - OTP verify rejecting with 403 `IDENTITY_INACTIVE` navigates to `AccountUnavailable` with `{signedIn: false}`;
  - AccountRouter with `IDENTITY_NOT_ACTIVE` shows "This account isn't available" and "Sign out".
- [ ] **Step 2: Run** `npx jest src/features/auth src/features/accountDeletion` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same plus `npx jest src/app` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): Keep it? after sign-in and the account unavailable screen`.

### Task 11: Version 1.36.17 (117) and the whole suite

**Files:**
- Modify: `android/app/build.gradle` (`versionCode 117`, `versionName "1.36.17"`), `src/features/customerSettings/domain/customerSettingsChildModel.ts:2` (`CUSTOMER_APP_VERSION = '1.36.17'`), `src/features/chefProfile/screens/ChefProfileScreen.tsx:29` (`CHEF_APP_VERSION = '1.36.17'`), and any test that pins `1.36.16`.

- [ ] **Step 1: Bump the four values;** `grep -rn "1.36.16" src android/app/build.gradle` must print nothing.
- [ ] **Step 2: Run** `npx jest` — Expected: every suite passes (report the count).
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npx eslint src` — Expected: no errors.
- [ ] **Step 4: Commit** `chore(mobile): 1.36.17 (117) delete account`.
- [ ] **Step 5 (controller, with the owner):** build the release APK from `C:\mdelapp\apps\mobile\android` with `.\gradlew.bat assembleRelease` (real `node_modules`), install on the owner's phone (Xiaomi `GURKT4DYYPUW7DX8`) and check that nothing changed: no Delete rows (switch off), no banner, sign-in, cart and kitchen toggle work as before. The full flow is checked after plan 5 turns the server switch on.
