# Chef Side Redesign (mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every chef-mode screen of the Craves Android app to the approved redesign, wired to every chef API the app has, so features light up as soon as their server route is published.

**Architecture:** A small chef UI kit (white screens, shared cards, rows, chips, sheets, toast) in `features/chefShell/components/ui` is built first; every screen task then rewrites its own feature folder on top of it. Route names stay stable (push deep links and process restoration depend on them). Features whose server route is not yet published for mobile call the API anyway and fall back to a "Coming soon" state on a "route not published" error, instead of compile-time `*_AVAILABLE = false` flags.

**Tech Stack:** React Native 0.7x (TypeScript), React Navigation (native-stack + bottom-tabs), TanStack Query, react-test-renderer + Jest, existing `httpClient` / `AppApiError`.

**Spec:** the approved design board `C:\Users\chakr\Downloads\Craves-Build-platform-KUSHIRAVI-app-build\design-review\chef-workspace\` (`home.html`, `orders.html`, `menu.html`, `earnings.html`, `profile.html`; every screen has layout, exact copy and a "Buttons" table saying what each control does). Clickable version: `prototype.html` in the same folder (serve the `design-review` folder: `python -m http.server 8767 --directory design-review`). User approval on 2026-10-13: "looks good but keep the backgrounds white only".

## Global Constraints

- Screen backgrounds are white only (`colors.white`). No grey page backgrounds (`surfaceMuted`/`#F7F5F3`) anywhere in chef screens. Cards are white with a 1 px `colors.border`-family line; status chips and banners keep their soft tints.
- Colours, spacing, radius, type and touch sizes come from `src/design/tokens.ts`; no new literal colours. Minimum tap target `touchTarget.minimum` (48).
- Copy: plain words from the board. Never show "contract", "APIM", "backend", "ledger", "authoritative", "route", "server", raw enums (`NON_VEG`, `PENDING_APPROVAL`), or error internals to the chef.
- Order number everywhere = `#` + last 5 characters of the id without dashes, uppercase (one helper, used by every screen).
- Money shows as `₹1,240` (whole rupees) or `₹3,450.00` (balances/withdrawals), en-IN grouping.
- Route names in `app/navigation/types.ts` keep their current names; new routes are added, none are renamed except the tab `Analytics` → `Earnings`.
- Features not yet published for mobile must not crash or show errors: call the API and on `isRouteNotPublished(error)` show `ComingSoon`. Keep every existing `export const *_AVAILABLE = false` constant (the mobile CI script `scripts/p119-apim-contract-coverage-check.mjs` requires them for routes listed in `api/apim-api/contracts/mobile-main-source-only.v1.json`), but stop using them to skip calls; add the comment `// Manifest marker for the APIM coverage check; screens fall back to Coming soon at runtime.`
- Version: `versionName "1.31.0"`, `versionCode 70` in `android/app/build.gradle`, plus a 1.31.0 entry at the top of `KUSHIRAVI_VERSION.md`.
- The chef application flow (`features/chefOnboarding`, `ChefRegistration`, `ChefAccountStatus`) is out of scope.
- Commit with `git commit -o -- <paths>` (only your own paths) on branch `feat/chef-redesign` in `C:\mchef`. Do not push.

## Review Focus

1. Route not published yet (404 / body-less 403 from api.craves.in) on schedule, reviews, support, scheduled orders, order history page, notification prefs, referral → screen shows "Coming soon", not an error or retry loop. Pinned in Task 1 (`isRouteNotPublished` tests) and in each consuming task's screen test.
2. Empty kitchen (0 orders, 0 dishes, no plans, ₹0 balance, no bank account) → every tab renders a designed empty state with one next action. Pinned in Tasks 3, 4, 5, 7.
3. Double tap on Accept / Mark ready / Withdraw / Publish → one request (button disabled while busy). Pinned in Tasks 4 and 7.
4. Customer notifications in the chef inbox → hidden in chef mode. Pinned in Task 3.
5. Long names (dish, kitchen, customer) and large font scale → text wraps or truncates with ellipsis, buttons never overlap. Pinned in Task 1 (`ListRow`, `OrderCard` snapshot with a 60-character name).

---

### Task 1: Chef UI kit and shared helpers

**Files:**
- Create: `apps/mobile/src/features/chefShell/components/ui/` — `ChefScreen.tsx`, `ChefTopBar.tsx`, `SectionHeader.tsx`, `ListRow.tsx`, `StatTile.tsx`, `StatusChip.tsx`, `ChefCard.tsx`, `VegMark.tsx`, `ChefSheet.tsx`, `ConfirmDialog.tsx`, `ChefToast.tsx`, `ComingSoon.tsx`, `OrderCard.tsx`, `index.ts`
- Create: `apps/mobile/src/features/chefShell/domain/chefFormat.ts`, `apps/mobile/src/core/http/routeAvailability.ts`
- Test: `chefShell/components/ui/ChefUiKit.test.tsx`, `chefShell/domain/chefFormat.test.ts`, `core/http/routeAvailability.test.ts`

**Interfaces (Produces — every later task uses exactly these):**
- `isRouteNotPublished(error: unknown): boolean` — true for `AppApiError` status 404, 501, or 403 whose `code` is the generic code `normalizedBackendCode` gives a body-less 403; false for 401, 409, 422, 5xx, network errors, and 403 with a real backend code.
- `shortOrderNumber(id: string): string` → `'#DF94B'` for `'…-7a3df94b'`; `formatRupees(amount: number, opts?: {paise?: boolean}): string` → `'₹1,240'`, `'₹3,450.00'`; `formatRelativeTime(iso: string, now: Date): string` → `'2 min ago'`, `'Yesterday'`, `'13 Oct'`.
- `ChefScreen({children, header, footer, refreshing, onRefresh, scroll = true, withTabBar = false, testID})` — white SafeArea screen; `footer` renders a sticky white dock with top border; `withTabBar` adds bottom padding for the floating tab bar.
- `ChefTopBar({title, subtitle, onBack, right, showBell = true})` — back arrow (48 dp) when `onBack`; bell shows `counters.unreadNotifications` badge and navigates to `ChefNotifications`.
- `SectionHeader({title, actionLabel, onAction})`; `ListRow({icon, iconTone = 'neutral', title, subtitle, value, right, onPress, destructive, accessibilityLabel})` with `iconTone: 'neutral'|'red'|'green'|'amber'|'blue'`; `StatTile({value, label, trend, onPress})` with `trend?: {text: string; direction: 'up'|'down'}`.
- `StatusChip({label, tone})` with `tone: 'new'|'cooking'|'ready'|'done'|'info'|'draft'|'cancelled'`; `VegMark({type: 'VEG'|'NON_VEG'|'EGG'})`; `ChefCard({children, onPress, highlighted, accessibilityLabel, style})`.
- `ChefSheet({visible, onClose, title, children})` (bottom sheet in a `Modal`, scrim tap and Android back close it); `ConfirmDialog({visible, title, message, confirmLabel, cancelLabel = 'Cancel', tone = 'primary'|'success'|'danger', busy, onConfirm, onCancel})`.
- `ChefToastProvider` + `useChefToast(): {show: (message: string) => void}` (one toast at a time, 2.6 s, above the tab bar).
- `ComingSoon({title, message})` — inline card, clock icon, "Coming soon" chip.
- `OrderCard({order, actions, highlighted, onPress})` where `order: {id; customerName?; area?; placedAt?; total?; items: {name; quantity; foodType?}[]; note?}` and `actions?: ReactNode` (the task supplies its buttons/timer).

- [ ] **Step 1:** Write `routeAvailability.test.ts` (404 → true; body-less 403 → true; 403 with code `CHEF_KITCHEN_SUSPENDED` → false; 401/500/timeout → false) and `chefFormat.test.ts` (the examples above, plus `formatRupees(0)` → `'₹0'`). Run `npx jest src/core/http/routeAvailability src/features/chefShell/domain/chefFormat` → FAIL.
- [ ] **Step 2:** Implement both files (read `normalizedBackendCode` in `core/http/apiError.ts` for the body-less 403 code). Run again → PASS.
- [ ] **Step 3:** Write `ChefUiKit.test.tsx`: `OrderCard` renders `#DF94B`, `2×`, the note, a 60-character dish name with `numberOfLines`; `ConfirmDialog` confirm button is disabled and shows a spinner when `busy`; `ListRow` exposes `accessibilityRole="button"` only when `onPress`; `ChefScreen` style backgroundColor is `colors.white`. Run → FAIL.
- [ ] **Step 4:** Implement the components to the board's look (`chef.css` classes `.card`, `.li`, `.stat`, `.chip.*`, `.sheet`, `.dialog`, `.oc`, `.vd`), white backgrounds. Run → PASS. Run `npx tsc --noEmit` → no new errors.
- [ ] **Step 5:** Commit `feat(mobile): chef UI kit, order number and rupee helpers, route-not-published check`.

### Task 2: Navigation shell, tab bar, header, version

**Files:**
- Modify: `app/navigation/ChefRootNavigator.tsx`, `app/navigation/chefTabs.ts`, `app/navigation/types.ts`, `app/navigation/ChefMenuTabScreen.tsx`, `features/chefShell/components/ChefHeader.tsx` (delete the ☰ menu modal and the notifications sheet; keep a thin wrapper over `ChefTopBar` until all screens move), `android/app/build.gradle`, `KUSHIRAVI_VERSION.md`
- Create: `app/navigation/ChefTabBar.tsx`
- Test: `app/navigation/chefTabs.test.ts` (update), `app/navigation/ChefMenuTabScreen.test.tsx` (update), `processRestoration.test.ts` / `inboundRouting.test.ts` must still pass unchanged

**Interfaces (Produces):**
- Tabs in order: `Dashboard` (label "Home", icon `home`), `Orders`, `Menu`, `Earnings` (label "Earnings", icon `wallet`/closest in `IconName`), `Profile`.
- `ChefOrdersStackParamList` adds `ChefOrdersScheduled: undefined` and keeps `ChefOrdersNew | ChefOrdersPreparing | ChefOrdersReady | ChefOrdersCompleted`; all five render `ChefOrdersScreen` (Task 4) with `animation: 'none'`.
- `ChefProfileStackParamList` adds `ChefReviews`, `ChefSecurity`, `ChefBankAccount`; keeps all existing names (`ChefSubscriptionPlan` now renders Daily limits from Task 6; `ChefScheduledOrders` redirects to Orders → Scheduled).
- `ChefProductStackParamList` adds `ChefNotifications: undefined`, `ChefDailyLimits: {planId?: string}`, `ChefSupportTicket: {caseId?: string; orderId?: string; topic?: string}`.
- `ChefTabBar` — white floating pill (border + soft shadow, no glass), labels `colors.textPrimary`, active `colors.flameRedAccessible`, Orders badge = `counters.pendingAcceptance` (99+ cap).
- `ChefToastProvider` wraps `ChefProductNavigator`.

- [ ] **Step 1:** Update `chefTabs.test.ts` to the new order/labels and add a test that `ChefOrdersScheduled` is in `ChefOrdersStackParamList` keys used by the navigator. Run → FAIL.
- [ ] **Step 2:** Implement the navigator, tab bar, types, placeholder screens for new routes (each a `ChefScreen` with its title, replaced by later tasks). Bump version. Run the navigation tests + `npx tsc --noEmit` → PASS.
- [ ] **Step 3:** Commit `feat(mobile): chef tabs Home/Orders/Menu/Earnings/Profile with a light tab bar (1.31.0)`.

### Task 3: Home, kitchen status, notifications, switch dialog

**Spec:** `home.html` sections 1.1–1.4 (screens `switch-dialog`, `home-open`, `home-closed`, `status-sheet`, `home-paused`, `notifications`).

**Files:**
- Modify: `features/chefDashboard/screens/ChefDashboardScreen.tsx` (rewrite), `features/chefDashboard/state/useChefDashboardModel.ts`, `features/customerProfile/screens/CustomerProfileScreen.tsx` (switch dialog copy only)
- Create: `features/chefDashboard/components/KitchenStatusSheet.tsx`, `features/chefShell/screens/ChefNotificationsScreen.tsx`, `features/chefShell/domain/chefNoticeAudience.ts`, `features/chefProfile/state/useKitchenOpenState.ts`
- Delete: `features/chefAnalytics/` (screen replaced by Task 7)
- Test: `features/chefDashboard/screens/ChefDashboardScreen.test.tsx`, `features/chefShell/domain/chefNoticeAudience.test.ts`, `features/chefShell/screens/ChefNotificationsScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1 kit; `useChefOperationalState()`; `chefPayoutApi.getBalance`; `chefProfileApi.getKitchen/updateKitchen`; `chefKitchenScheduleApi.get/update`; `chefReviewsApi`; `chefNotificationInboxApi.markAllRead`.
- Produces: `useKitchenOpenState(): {status: 'open'|'paused'|'closed'|'unknown'; pausedUntil: string | null; opensAt: string | null; setOpen(open: boolean): Promise<void>; pause(minutes: 30|60|120|'rest-of-day'): Promise<void>; resume(): Promise<void>; pauseAvailable: boolean}` — open/close uses `PUT /api/v1/kitchens/me` with the full current kitchen and `status: 'ACTIVE'|'INACTIVE'` (what craves.in does); pause/resume uses the schedule API, `pauseAvailable` false when `isRouteNotPublished`. Profile (Task 8) reuses it.
- `isChefAudienceNotice(notice): boolean` — port of the craves.in chef inbox filter (`git show origin/main:apps/customer-web-next/...` — find `audience="chef"` in the web notifications inbox) so customer-order notices are hidden.

- [ ] **Step 1:** Tests: dashboard shows the first pending order with "Accept · ready in N min" and Reject; with 0 pending it shows no "Needs you now" section; closed kitchen shows "Your kitchen is closed" + "Open kitchen"; balance card shows `formatRupees(balance, {paise: true})` and Withdraw navigates to `Earnings`; reviews section hidden (not an error) when reviews route not published; `isChefAudienceNotice` drops a customer "Order created … Complete payment" notice and keeps a chef "New order" notice; notifications screen rows navigate to `ChefOrderDetail` for order notices. Run → FAIL.
- [ ] **Step 2:** Implement to the board. Accept on Home uses `useChefNewOrderActions().accept`; Mark ready uses the same confirm dialog as Task 4 (`ConfirmDialog`, "Is #X packed and ready?", "Not yet" / "Yes, it's ready"). Run → PASS; `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(mobile): chef Home with kitchen open/pause, chef-only notifications`.

### Task 4: Orders (lists, detail, reject, ready, handoff, scheduled, past)

**Spec:** `orders.html` 2.1–2.7 (screens `orders-*`, `confirm-ready`, `not-picked-sheet`, `reject-sheet`, `detail-*`).

**Files:**
- Create: `features/chefOrders/screens/ChefOrdersScreen.tsx`, `features/chefOrders/components/RejectOrderSheet.tsx`, `features/chefOrders/components/NotPickedUpSheet.tsx`, `features/chefOrders/domain/chefOrderFilters.ts`
- Modify: `features/chefOrders/screens/ChefOrderDetailScreen.tsx` (rewrite), `features/chefShell/api/chefOperationalApi.ts` (keep `foodSubtotal`, `grandTotal`, `deliveryAddress.contactName`/area, `customerNote` if present), `features/chefScheduledOrders/api/chefScheduledOrdersApi.ts`, `features/chefOrders/api/chefOrderHistoryApi.ts` (drop flags; use `isRouteNotPublished`)
- Delete: `ChefNewOrdersScreen.tsx`, `ChefPreparingOrdersScreen.tsx`, `ChefReadyOrdersScreen.tsx`, `ChefCompletedOrdersScreen.tsx`, `features/chefScheduledOrders/screens/ChefScheduledOrdersScreen.tsx`
- Test: `features/chefOrders/screens/ChefOrdersScreen.test.tsx`, `ChefOrderDetailScreen.test.tsx` (replace `ChefAcceptanceScreens.test.tsx`), `domain/chefOrderFilters.test.ts`

**Interfaces:**
- `ChefOrderFilter = 'NEW'|'PREPARING'|'READY'|'SCHEDULED'|'PAST'`; `PAST` = DELIVERED, OUT_FOR_DELIVERY, CHEF_REJECTED, CANCELLED (and any other terminal status) grouped by local day with day count and food total; route → filter: `ChefOrdersNew→NEW`, `ChefOrdersPreparing→PREPARING`, `ChefOrdersReady→READY`, `ChefOrdersScheduled→SCHEDULED`, `ChefOrdersCompleted→PAST`.
- Reject reasons (sent as the existing free-text `reason`): "An item is sold out", "Kitchen is too busy right now", "Closing soon", "Can't deliver to this area", "Other reason" (requires the note). Same sheet on list, detail and Scheduled Decline.
- Ready: "Handed over" button shown only when the order exposes a pickup-confirm action (not today → hidden; the order moves to Past as "On the way" when status becomes `OUT_FOR_DELIVERY`). "Not picked up" opens `NotPickedUpSheet` → `chefSupportCasesApi.create` with the order id and chosen reason; `ComingSoon`-style toast "Support is coming soon. Call Craves support." when not published.
- Detail dock by status: pending → Reject / Accept · ready in N min; accepted/preparing → call icon / Mark ready; ready → Not picked up; terminal → "Problem with this order?" → `ChefSupportTicket {orderId}`. Bill: "Food" = `foodSubtotal`; "Customer also paid ₹delivery and ₹tax" line; no invented commission.

- [ ] **Step 1:** Tests: filter chips show counts and switch content without a stack push (`navigation.replace`/`setParams`); Accept is disabled while accepting (one call on double press); reject sheet requires a reason and "Other reason" requires text; Mark ready opens the confirm dialog and calls `markReadyForPickup` once; PAST includes a `CHEF_REJECTED` order; Scheduled shows `ComingSoon` on route-not-published; detail title is `Order #DF94B` with the status chip (not "New order"); order number format matches Task 1. Run → FAIL.
- [ ] **Step 2:** Implement. Run → PASS; `npx tsc --noEmit`; `npx jest src/app/navigation` still PASS.
- [ ] **Step 3:** Commit `feat(mobile): one chef Orders screen with New/Preparing/Ready/Scheduled/Past and a status-aware order page`.

### Task 5: Menu — dishes, one dish form, publish drafts

**Spec:** `menu.html` 3.1–3.2 (`menu-dishes`, `dish-new`, `dish-edit`).

**Files:**
- Modify: `features/chefMenu/screens/ChefMenuScreen.tsx` (rewrite), `app/navigation/ChefMenuTabScreen.tsx` (Dishes / Meal plans toggle in the header area, "+ Add dish" / "+ New plan" header button, no bottom bar), `shared/catalog/menuCategories.ts` (label "Snacks" for value `Snakes`; keep the stored value)
- Create: `features/chefMenu/screens/ChefDishFormScreen.tsx`, `features/chefMenu/components/DishRow.tsx`
- Modify to re-export: `ChefAddMenuItemScreen.tsx` and `ChefEditMenuItemScreen.tsx` become thin wrappers around `ChefDishFormScreen` (`mode: 'add'|'edit'`); `ChefMenuItemDetailScreen.tsx` redirects (`navigation.replace('ChefEditMenuItem', params)`)
- Test: `features/chefMenu/screens/ChefMenuScreen.test.tsx`, `ChefDishFormScreen.test.tsx`

**Interfaces:**
- Consumes: `chefMenuApi` (`listItems`, `createItem`, `replaceItem`, `updateAvailability`, `uploadImage`), `chefMenuForm` zod schema (keep its rules; labels change).
- Publish draft = `replaceItem` with `status: 'ACTIVE'` and `available: true`. "Publish dish" on the add form creates with `ACTIVE` + `available: true`. Delete dish = `ComingSoon` toast "Deleting dishes is coming soon" (no server route). Duplicate = open add form prefilled.
- Switch shows toast "Prawns biryani is off" with Undo (re-calls `updateAvailability`).

- [ ] **Step 1:** Tests: filters All/On/Off/Drafts/categories narrow the list; switch toggles with optimistic update + rollback on error; draft row shows Publish and calls `replaceItem` with ACTIVE once; add form "Publish dish" creates `ACTIVE` + `available: true`; required-field errors appear on blur; category chip label "Snacks" saves value `Snakes`; leaving the add form with typed text asks "Discard changes?". Run → FAIL.
- [ ] **Step 2:** Implement. Run → PASS; `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(mobile): chef dishes list with inline switches and one add/edit dish form`.

### Task 6: Meal plans, 3-step editor, daily limits

**Spec:** `menu.html` 3.3–3.5 (`menu-plans`, `plan-step1..3`, `daily-limits`).

**Files:**
- Modify: `features/chefSubscription/screens/ChefMealPlansScreen.tsx`, `ChefMealPlanEditorScreen.tsx` (split into 3 steps in place; keep the existing save/submit logic and validation), `ChefSubscriptionPlanScreen.tsx` → becomes `ChefDailyLimitsScreen.tsx` (keep its capacity API calls: slot rules, dish limits, date overrides; drop its duplicate plan editor)
- Test: update `ChefMealPlansScreen.test.tsx`, `ChefMealPlanEditorScreen.test.tsx`; create `ChefDailyLimitsScreen.test.tsx`

**Interfaces:** Consumes `chefSubscriptionApi` as today. Editor steps: 1 Details (photo, name, how often, price, cook how early, description) → 2 Meals (day chips, slots, dishes, quantity, "Copy {day} to all weekdays") → 3 Review (summary, note for Craves, submit). Step 2 "Next" blocked with the existing "Add at least one meal" errors. Daily limits uses date pickers (no typed dates).

- [ ] **Step 1:** Tests: plans list filters by status and shows "Taking new subscribers" switch for live plans only; editor step 1 → 2 blocked by missing name/price; "Copy Tuesday to all weekdays" copies slots; submit sends the note; daily limits saves slot capacity with the stepper values and shows `ComingSoon` if capacity routes are not published. Run → FAIL.
- [ ] **Step 2:** Implement. Run → PASS; `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(mobile): meal plan list, 3-step plan editor, daily limits`.

### Task 7: Earnings tab, withdraw, payout history, bank account

**Spec:** `earnings.html` 4.1–4.4.

**Files:**
- Create: `features/chefPayout/screens/ChefEarningsScreen.tsx`, `features/chefPayout/domain/chefEarningsSummary.ts`, `features/chefPayout/components/WithdrawSheet.tsx`, `features/chefBankOnboarding/screens/ChefBankAccountScreen.tsx`
- Modify: `features/chefPayout/screens/ChefPayoutHistoryScreen.tsx` (rewrite: Payouts / Order earnings), remove `ChefFinanceBalancePanel` accounting text
- Test: `chefEarningsSummary.test.ts`, `ChefEarningsScreen.test.tsx`, `WithdrawSheet.test.tsx`

**Interfaces:**
- `summarizeEarnings(input: {orders: ChefOperationalOrder[]; earnings: ChefEarningLedgerEntry[]; range: 'today'|'week'|'month'|{from: Date; to: Date}; now: Date}): {earned: number; delivered: number; averageOrder: number; byDay: {label: string; amount: number}[]; topDishes: {name: string; sold: number; amount: number}[]; split: {delivered: number; cancelled: number; rejected: number}; changeVsPrevious: number | null}` — earnings from ledger entries in range (net amount), counts from orders.
- Withdraw: `chefPayoutApi.requestWithdrawal` once per press (keep idempotency key logic); disabled reason line from the balance response ("You already withdrew today…", "No bank account yet", "₹0 balance", "On hold").
- Payout statuses mapped to craves.in words: Asked, Sending, With the bank, Paid, Didn't go through, Returned by bank, Craves is checking, Cancelled.
- Bank account: verified → account card + "Change bank account"; otherwise the form (reuse `chefBankOnboardingApi` + IFSC lookup).

- [ ] **Step 1:** Tests: `summarizeEarnings` for a week with 3 delivered, 1 rejected, ledger entries on 2 days (exact numbers); range chips change the stats; Withdraw button disabled with "You already withdrew today." when the balance says so; withdraw pressed twice → one API call; payout `PENDING_APPROVAL` shows "Craves is checking"; verified bank shows no form. Run → FAIL.
- [ ] **Step 2:** Implement. Run → PASS; `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(mobile): chef Earnings tab with sales, withdraw and payouts`.

### Task 8: Profile and its screens

**Spec:** `profile.html` 5.1–5.9.

**Files:**
- Modify (rewrite): `features/chefProfile/screens/ChefProfileScreen.tsx`, `ChefEditProfileScreen.tsx` (= Kitchen details), `features/chefBusinessInformation/screens/ChefBusinessInformationScreen.tsx` (= Documents & verification), `features/chefPreferences/screens/ChefAppPreferencesScreen.tsx`, `features/chefSchedule/screens/ChefKitchenScheduleScreen.tsx` (= Opening hours with day editor sheet), `features/chefReferrals/screens/ChefReferralScreen.tsx`, `ChefReferralEarningsScreen.tsx`, `features/chefSupport/screens/ChefSupportScreen.tsx`
- Create: `features/chefSupport/screens/ChefSupportTicketScreen.tsx`, `features/reviews/screens/ChefReviewsScreen.tsx`, `features/chefProfile/screens/ChefSecurityScreen.tsx`, `features/chefPreferences/api/notificationPreferencesApi.ts` (`GET /api/v1/notifications/preferences`, `PUT /api/v1/notifications/preferences/{channel}`)
- Test: one screen test per rewritten/created screen (route-not-published → `ComingSoon` where the screen depends on an unpublished route)

**Interfaces:** Consumes `useKitchenOpenState` (Task 3) for the Opening hours "Taking orders" switch; `chefKitchenScheduleApi` for weekly windows and overrides (editor writes `weeklyWindows[{dayOfWeek, opensAt, closesAt}]`); `chefSupportCasesApi` (create/list/get/addMessage) and a Call row using the support phone the onboarding content already returns; `chefReviewsApi`; `referralRewardsApi` + `chefReferralEarningsApi`. Photo, cuisines, delivery areas, social links, auto-accept, default cooking time, language, theme, "Log out of other devices" render as disabled rows with a "Coming soon" chip. "Delete my account" opens `ChefSupportTicket {topic: 'Delete my account'}`.

- [ ] **Step 1:** Tests: profile rows navigate to the right routes (Kitchen details, Opening hours, Documents, Reviews, Bank account → `ChefBankAccount`, Payout history, Refer a chef, Preferences, Help & support, Login & security); Switch to customer and Log out ask to confirm; opening-hours day editor saves Monday 11:00–15:00 + 18:00–22:00 and copies to Tue–Fri in one PUT; support ticket reply calls `addMessage`; every screen depending on an unpublished route shows `ComingSoon`. Run → FAIL.
- [ ] **Step 2:** Implement. Run → PASS; `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(mobile): chef Profile, kitchen details, documents, hours, help, reviews, referral, security`.

### Task 9: Whole-app verification, build, install

- [ ] **Step 1:** `cd C:\mchef\apps\mobile && npx tsc --noEmit && npx eslint src --quiet && npx jest` → all pass (fix or update any test the redesign broke; do not delete tests of behaviour that still exists).
- [ ] **Step 2:** `grep -rniE "contract|APIM|authoritative|backend|ledger" src/features/chef* src/app/navigation/Chef*` in user-visible strings → none.
- [ ] **Step 3:** Build: `cmd /c "powershell -ExecutionPolicy Bypass -File scripts\build-kushiravi-release-apk.ps1 -SkipNpmCi -PhoneOnly > C:\mchef\build.log 2>&1"`; then `adb -s GURKT4DYYPUW7DX8 install -r <apk>`; confirm `versionName=1.31.0`.
- [ ] **Step 4:** On the phone (chef mode): walk every flow in the prototype's left list; screenshot each screen; fix anything that differs from the board.
- [ ] **Step 5:** Commit any fixes; update memory notes.

## Backend (separate plan)

Publishing the existing routes for mobile and the new server fields (courier details, pickup confirm, response deadline, customer note, status history, kitchen photos/cuisines/areas/social, chef settings, dish delete, subscriber counts, notification audience, log out other devices) are planned in `2026-10-13-chef-backend-connections.md`. The app above needs no rebuild when they ship: screens switch from "Coming soon" to live on the first successful call.
