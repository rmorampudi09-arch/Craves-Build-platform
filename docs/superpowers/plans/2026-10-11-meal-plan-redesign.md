# Meal Plan Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-screen customer meal-plan feature with the approved 8-screen flow, add a Meal plans tab and a new plan editor to the Chef Menu, extend subscription-service so every element of the design has real data, then ship Android 1.26.0 (code 54).

> **Revision 2 (user, 2026-10-11): "add the backend that satisfies this design".** Backend tasks B1–B3 run in worktree `C:\msub` (branch `feat/meal-plan-backend` from `origin/main` 8dc315b2e) and ship by PR → user merge → user-run `azure-pipelines-subscription-service.yml` → user-run APIM scripts. User decisions: cancel stays immediate; customer pause/resume/skip/cancel ON by default for new AND existing plans; pause and cancel allowed anytime (cutoff 0 — meals already dispatched as orders are still delivered), skip and resume need 24 hours (1440 minutes). The app must work against today's production too: every new response field is optional in the zod schemas and has the fallback named in the API-reality table.

**Architecture:** Customer screens become a nested native stack mounted on the existing `CustomerSettingsSubscription` route (so the bottom-nav and process-restoration policies keep working unchanged), sharing a small checkout context. Data moves from imperative `useState` fetching to React Query hooks over the EXISTING api modules. Chef plans get a segment inside `ChefMenuTabScreen` plus a new `ChefMealPlanEditor` product-stack route; the old `ChefSubscriptionPlanScreen` stays for capacity rules.

**Tech Stack:** React Native 0.8x + TypeScript, React Navigation native stack, @tanstack/react-query, zod api modules, react-native-razorpay via `features/payment/gateway/razorpayGateway.ts`, Jest + react-test-renderer.

**Spec:** Approved design board `C:\Users\chakr\Downloads\Craves-Build-platform-KUSHIRAVI-app-build\design-review\meal-plans\board.html` (screens in `screens.html`, PNGs in `out/`), adapted by the "API reality" table below.

## Global Constraints

- App work only in `C:\mscratch\apps\mobile`, branch `KUSHIRAVI-app-build`; backend work only in `C:\msub` (B1–B3). Commit locally, never push without the user. No auth, payment-provider, cart/order or Chef-business-rule changes beyond B1–B3.
- No new dependencies. New `httpClient` call sites go only into the existing api modules (`customerSubscriptionApi`, `chefSubscriptionApi`, and a `kitchenReviewSummary` function in an existing customer api module if none exists) and each new (method, path, file) is added to `C:\mscratch\api\apim-api\contracts\*.json` so `node scripts/p119-apim-contract-coverage-check.mjs` stays green.
- Styling only from `src/design/tokens.ts`: `flameRedAccessible` for red fills and red text, `flameRed` for edges/switch tracks, `surfaceMuted` for chef tab backgrounds, white for customer screens, `radius.lg` cards with `colors.border` + `elevation.card`. Use shared `Button` (primary/outline/ghost), `Badge`, `Chip`, `SegmentedControl`, `IconButton`, `Icon` (MaterialDesignIcons names). Touch targets ≥ `touchTarget.minimum` (48). Keep `allowFontScaling`.
- Payments are Razorpay only. Keep the pending-payment store, interrupted-payment recovery and verify flow exactly as `CustomerMealPlansScreen.tsx:90-105, 262-301, 399-567` do today.
- Never show data the API does not return. No ratings, no plan photos uploaded by chefs, no subscriber counts, no delivery-tracker states beyond occurrence status.
- Version: `versionName "1.26.0"`, `versionCode 54`, tag `KUSHIRAVI-app-v1.26.0`, APK `C:\mscratch\artifacts\KUSHIRAVI-app-v1.26.0.apk`.

### API reality (design element → what to build)

"New" = added by tasks B1–B3; the app must fall back when the field is absent (old production).

| Design element | Build |
|---|---|
| Plan photo (list, detail, review, payment, my plan) | New `imageUrl` on public plan / `planImageUrl` on subscription (relative path, resolve against the API base URL); fallback: primary image of the first scheduled dish via `dishDetailApi`; then `chef` icon tile |
| "By Lakshmi's Kitchen" | `kitchen.displayName ?? kitchen.kitchenName` from the first dish's detail; hidden when unavailable |
| Rating ★4.8 (320) | Existing public `GET /api/v1/public/kitchens/{kitchenId}/reviews/summary` (kitchenId from the first dish); show `★ {overallAverage 1 dp} ({reviewCount})` only when `reviewCount > 0` |
| Veg / Non-veg pill | From schedule `menuItemFoodType`: any NON_VEG → Non-veg, else any EGG → Egg, else Veg; hidden when no items |
| "5 meals · Lunch", "Mon – Fri", "12:30 PM" | Derived from schedule items |
| Saved-plans heart (list/detail header) | Omit (no API). Header right on the list = "My plans" icon button when the customer has subscriptions |
| Start date "Change" | Sheet with the next 7 dates starting tomorrow (current behaviour) |
| Delivery address "Change" | `MealPlanAddress` screen: delivery-ready saved addresses + "Add new address" (opens `CustomerAddressEditorModal`) |
| "Delivery is available at this location" note | Omit (no plan-area check) |
| Next billing date | New `nextBillingDate` on the subscription → "Renews {date}"; fallback "Paid until {cycleEnd}" from latest `SubscriptionPayment`; before payment omitted |
| Plan name on My Meal Plan for plans no longer listed | New `planName`, `billingPeriod`, `amount`, `currency` on the subscription; fallback: join with the public plan list |
| "We'll remind you" card on success | Omit (no subscription delivery notifications) |
| Cancel copy | "Cancelling stops upcoming meals right away. Meals already being prepared will still be delivered." |
| Pause / Skip / Cancel controls | Shown only when the plan policy enables them and status allows (B1 turns them on everywhere) |
| Today's Meal tracker Preparing → Out for delivery → Delivered | New `orderId` on occurrences → existing customer order API (`customerOrders` feature) status: PREPARING/CHEF_ACCEPTED… → Preparing, READY_FOR_PICKUP/OUT_FOR_DELIVERY → Out for delivery, DELIVERED → Delivered; "Track order" → `CustomerOrderTracking {orderId}`. Without `orderId`: two-step Scheduled → Order placed from occurrence status |
| Chef plan photo upload | New `PUT /api/v1/chef/subscription-plans/{planId}/image` (multipart `file`, JPEG/PNG/WebP ≤ 5 MB, DRAFT/REJECTED only); picker like `ChefAddMenuItemScreen.tsx:122-173`; hidden when the plan response has no `imageUrl` key (old production) |
| Chef "Accepting new subscribers" switch | New `PATCH /api/v1/chef/subscription-plans/{planId}/accepting-subscribers` `{acceptingSubscribers}` (ACTIVE only) and `acceptingSubscribers` on the chef plan; switch hidden when the field is absent |
| Chef monthly schedule | Day-of-month chips 1–28 instead of Mon–Sun |

## Review Focus

1. A plan whose schedule is empty or fails to load must still render its card (name, price, frequency) with the fallback photo and no meal meta.
2. A customer with no delivery-ready address reaching Review/Payment must see "Add an address" (opens the editor) and a disabled pay button — never a crash or a null address id sent to `create`.
3. Razorpay closed or failed: stay on Payment with an inline "Payment not completed" message; the subscription stays `PENDING_PAYMENT` and My Meal Plan offers "Complete payment".
4. Policy with every customer flag false: My Meal Plan shows no Pause, Skip or Cancel controls (so no 403 taps).
5. Monthly plans (`dayOfMonth`) and dish-detail 404 / inactive kitchen: labels read "Day 5", photos fall back, nothing throws.

---

## Backend (worktree `C:\msub`, module `services/subscription-service`)

Paths below are relative to `services/subscription-service/src/main/java/in/craves/subscription/` unless absolute. Persistence is plain `JdbcTemplate` SQL (no JPA). Build: `mvnd -f services/subscription-service/pom.xml clean verify` with `JAVA_HOME="C:\Program Files\Java\jdk-21"` (mvnd at `C:\Program Files\Apache\maven\bin\mvnd.cmd`). DB tests are skipped locally (they need `SUBSCRIPTION_TEST_JDBC_URL`; CI runs them) — still write them.

### Task B1: Migration V18, default policy ON, presentation columns

**Files:**
- Create: `src/main/resources/db/migration/V18__meal_plan_presentation_and_default_policy.sql`
- Modify: `policy/DefaultSubscriptionPolicyService.java`, `C:\msub\scripts\release\validate-chef-owned-subscription-plans.sh:36`, `src/test/.../SubscriptionMigrationDatabaseTest.java:155` (expected versions ≤ 18)

- [ ] **Step 1:** V18 does exactly:
  - `ALTER TABLE subscription_schema.subscription_plan ADD COLUMN accepting_subscribers BOOLEAN NOT NULL DEFAULT TRUE;`
  - `CREATE TABLE subscription_schema.subscription_plan_image (plan_id UUID PRIMARY KEY REFERENCES subscription_schema.subscription_plan(id) ON DELETE CASCADE, content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')), image_bytes BYTEA NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880), updated_by_identity_id UUID NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`
  - Turn on every ACTIVE platform-default policy (rows whose `notes` equal the old `DEFAULT_NOTE` text exactly): set the four `customer_*_enabled` to TRUE, `pause_cutoff_minutes = 0`, `cancel_cutoff_minutes = 0`, `resume_lead_minutes = 1440`, `skip_cutoff_minutes = 1440`, `notes` = new note, `updated_at = now()`; insert one `subscription_plan_policy_audit` row per updated policy with `action = 'PLATFORM_DEFAULT_UPDATE'`, `actor_identity_id = policy.created_by_identity_id`, `policy_version = policy.version`, `reason` = new note.
- [ ] **Step 2:** `DefaultSubscriptionPolicyService` inserts the same enabled values for new plans. New `DEFAULT_NOTE` = `"Craves platform default: customer self-service pause, resume, cancel and skip are enabled. Pause and cancel apply to meals not yet sent to the kitchen; skip and resume need 24 hours notice."` Update the validator's `require_text` to `'customer self-service pause, resume, cancel and skip are enabled'`.
- [ ] **Step 3:** Update the migration test's expected max version to 18 and add DB assertions: column default TRUE; image table exists; a default policy created by `ensureActiveDefault` has all four flags TRUE with cutoffs 0/1440/0/1440.
- [ ] **Step 4: Run** `bash scripts/release/validate-chef-owned-subscription-plans.sh` (from `C:\msub`) and `mvnd … clean verify` — PASS.
- [ ] **Step 5: Commit** `feat(subscription): default customer self-service policy and meal plan presentation columns`.

### Task B2: Response fields and public plan image

**Files:** `web/ApiDtos.java`, `service/SubscriptionService.java`, `repository/PostgresCompatibleSubscriptionRepository.java` (+ `SubscriptionRepository` if the interface needs new methods), `lifecycle/SubscriptionLifecycleModels.java`, `lifecycle/SubscriptionLifecycleRepository.java:78-98`, `lifecycle/SubscriptionLifecycleService.java:298`, `web/SubscriptionController.java`, new `plan/PlanImageRepository.java`; tests next to the touched classes.

**Interfaces (JSON names are the contract the app uses):**
- `PublicPlanResponse` += `String imageUrl` — `"/api/v1/subscriptions/plans/{id}/image?v={updated_at epoch seconds}"` when an image row exists, else `null`.
- `GET /api/v1/subscriptions/plans` excludes plans with `accepting_subscribers = FALSE`; `POST /api/v1/subscriptions` for such a plan → 409 `PLAN_NOT_ACCEPTING_SUBSCRIBERS`. `GET /plans/{id}`, `/schedule`, `/policy` are unchanged (existing subscribers still read them).
- `GET /api/v1/subscriptions/plans/{planId}/image` (already `permitAll` via `/api/v1/subscriptions/plans/**`): bytes with the stored `Content-Type`, `Cache-Control: public, max-age=86400`; 404 `PLAN_IMAGE_NOT_FOUND` when none.
- `CustomerSubscriptionResponse` += `String planName, String billingPeriod, BigDecimal amount, String currency, LocalDate nextBillingDate, String planImageUrl` (same path rule), filled in BOTH builders (`SubscriptionService` ~:206 and `SubscriptionLifecycleService.current()` ~:298).
- `CustomerOccurrenceResponse` += `UUID orderId` (read `o.order_id` in the SELECT at `SubscriptionLifecycleRepository.java:83`).

- [ ] **Step 1: Write failing tests**: serializer/controller test that the plan list JSON has `imageUrl` null when no image; repository DB tests (gated) for list exclusion of non-accepting plans, `nextBillingDate` populated, occurrence `orderId` mapped, image GET 404/200 with content type.
- [ ] **Step 2: Run** `mvnd … clean verify` — new non-DB tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(subscription): meal plan presentation fields, plan image endpoint and occurrence order link`.

### Task B3: Chef plan image upload and accepting-subscribers switch, APIM and contracts

**Files:** `plan/ChefPlanWorkflowController.java`, `plan/ChefPlanWorkflowService.java`, `plan/ChefPlanModels.java:35`, `plan/ChefPlanRepository.java:143-176`, `plan/PlanImageRepository.java`, new `plan/PlanImageValidator.java`, `src/main/resources/application.yml` (`spring.servlet.multipart.max-file-size: 6MB`, `max-request-size: 7MB`), `C:\msub\scripts\apim\configure-chef-subscription-plan-workflow-apim.sh` (two `put_operation` lines after :130), the APIM script that defines the public `/subscriptions/plans/{planId}/policy` operation (add `get-public-meal-plan-image` GET `/plans/{planId}/image` beside it), `C:\mscratch\api\apim-api\contracts\mobile-subscriptions.v1.json` (in the app repo: the three new routes).

**Interfaces:**
- `ChefPlanResponse` += `String imageUrl` (same path rule), `boolean acceptingSubscribers`.
- `PUT /api/v1/chef/subscription-plans/{planId}/image` multipart part `file` → `ChefPlanResponse`. Owner only (`chef_identity_id = caller` else 404 `PLAN_NOT_FOUND` like the other chef routes); status DRAFT or REJECTED else 409 `PLAN_NOT_EDITABLE`; content type from magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`) else 400 `PLAN_IMAGE_TYPE_UNSUPPORTED`; empty or > 5 242 880 bytes → 400 `PLAN_IMAGE_SIZE_INVALID`. Upsert; touching the image also sets `subscription_plan.updated_at = now()`.
- `PATCH /api/v1/chef/subscription-plans/{planId}/accepting-subscribers` JSON `{"acceptingSubscribers": true|false}` (required) → `ChefPlanResponse`. Owner only; status ACTIVE else 409 `PLAN_NOT_ACTIVE`. Never touches status, billing or existing subscriptions.

- [ ] **Step 1: Write failing tests**: `PlanImageValidatorTest` (jpeg/png/webp accepted, gif rejected, 0 bytes and 5 242 881 bytes rejected); controller/service tests for status gates (PENDING_APPROVAL image → 409; DRAFT accepting PATCH → 409); DB test (gated) for upsert and the PATCH round-trip.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `mvnd … clean verify` and the validator script — PASS.
- [ ] **Step 5: Commit** `feat(subscription): chef plan photo upload and accepting-subscribers switch`; then push branch + open PR only after the user says so (record the APIM scripts the user must run after deploy in the PR body).

---

### Task 1: Shared schedule domain + customer presentation helpers

**Files:**
- Create: `src/features/mealPlans/domain/mealPlanSchedule.ts`
- Create: `src/features/customerSubscription/domain/mealPlanPresentation.ts`
- Test: `src/features/mealPlans/domain/mealPlanSchedule.test.ts`, `src/features/customerSubscription/domain/mealPlanPresentation.test.ts`

**Interfaces:**
- Produces (`mealPlanSchedule.ts`):
  - `type MealPlanFoodType = 'VEG' | 'NON_VEG' | 'EGG'`
  - `interface ScheduleItemLike { menuItemId: string; menuItemName?: string | null; menuItemFoodType?: string | null; isoDayOfWeek?: number | null; dayOfMonth?: number | null; mealSlotCode: string; serviceTime: string; sequenceNumber: number; quantity: number }`
  - `type BillingUnit = 'week' | 'month'`; `billingUnit(period: string): BillingUnit` (MONTHLY → month, else week)
  - `mealSlotLabel(code: string): string` (BREAKFAST→Breakfast, LUNCH→Lunch, SNACK→Snack, DINNER→Dinner, else title case)
  - `formatServiceTime(time: string): string` ('12:30' or '12:30:00' → '12:30 PM', '08:30' → '8:30 AM', '00:15' → '12:15 AM')
  - `dayLabel(item: ScheduleItemLike, style: 'short' | 'long'): string` (iso 1 → 'Mon'/'Monday'; dayOfMonth 5 → 'Day 5')
  - `sortScheduleItems<T extends ScheduleItemLike>(items: readonly T[]): T[]` (by day, then sequenceNumber)
  - `interface PlanScheduleSummary { mealCount: number; slotLabels: string[]; daysLabel: string | null; timeLabel: string | null; foodType: MealPlanFoodType | null; coverMenuItemId: string | null }`
  - `summarizeSchedule(items: readonly ScheduleItemLike[]): PlanScheduleSummary` — `mealCount` = number of distinct (day, slot) pairs; `daysLabel` for weekly: consecutive run → 'Mon – Fri', all 7 → 'Every day', otherwise comma list 'Mon, Wed, Fri'; for monthly: '{n} days a month'; `timeLabel` = formatted time when every item shares one time, else null; `coverMenuItemId` = first sorted item's id.
  - `formatMealCount(summary, unit: BillingUnit): string` → '5 lunches' when one slot label, '7 meals' otherwise (singular for 1).
- Produces (`mealPlanPresentation.ts`):
  - `formatPlanPrice(amount: number | string, currency: string): string` ('1499', 'INR' → '₹1,499'; keeps paise when non-zero: '₹1,499.50')
  - `formatMealPlanDate(iso: string, style: 'long' | 'short'): string` ('2026-09-29' → 'Mon, 29 Sep 2026' / 'Mon, 29 Sep'), date-only, no timezone shift
  - `upcomingStartDates(today: Date, count = 7): string[]` (ISO dates starting tomorrow)
  - `type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info'`
  - `subscriptionStatusPresentation(status: string): {label: string; tone: Tone}` — ACTIVE Active/success, PAUSED Paused/warning, PENDING_PAYMENT Payment pending/warning, PAYMENT_FAILED Payment failed/error, CANCELLED Cancelled/neutral, EXPIRED Ended/neutral, other → title case/neutral
  - `occurrenceStatusPresentation(status: string): {label: string; tone: Tone; step: 0 | 1 | 2 | null}` — BILLING_PENDING/PAYMENT_PENDING 'Awaiting payment' warning 0; READY_FOR_ORDER 'Scheduled' info 1; ORDER_REQUESTED 'Order requested' info 1; ORDER_CREATED 'Order placed' success 2; SKIPPED 'Skipped' neutral null; CANCELLED 'Cancelled' neutral null; FAILED "Couldn't place order" error null
  - `formatCutoff(minutes: number): string` (1440 → '24 hours', 90 → '90 minutes', 60 → '1 hour')
  - `planRules(policy: PublicSubscriptionPolicy): {icon: string; title: string; body: string}[]` — one rule per enabled flag (pause → icon 'pause' 'Pause or resume' 'Pause from My Meal Plan up to {cutoff} before a meal.'; skip → 'calendar-remove-outline' 'Skip a meal' 'Skip any upcoming meal up to {cutoff} before it.'; cancel → 'close' 'Cancel anytime' 'Cancelling stops all upcoming meals right away.'); when none enabled → single `{icon: 'information-outline', title: 'Plan changes', body: 'Contact Craves support to change this plan.'}`
  - `weekOccurrences(occs: readonly CustomerSubscriptionOccurrence[], today: Date)` → occurrences whose `serviceDate` is in today's Mon–Sun week, sorted by date then `serviceAt`
  - `nextOccurrence(occs, today: Date)` → first with `serviceDate >= today` whose status is not SKIPPED/CANCELLED, else null
  - `occurrenceDishNames(occ, scheduleItems: readonly ScheduleItemLike[]): string[]` (join by `menuItemId`, keep order, unknown → 'Meal')
  - `shortSubscriptionId(id: string): string` ('3f2a9c1e-…' → 'CRV-3F2A9C1E')

- [ ] **Step 1: Write failing tests** covering every example value above, plus: `summarizeSchedule([])` → `{mealCount: 0, slotLabels: [], daysLabel: null, timeLabel: null, foodType: null, coverMenuItemId: null}`; items Mon–Fri LUNCH 12:30 one NON_VEG → `{mealCount: 5, slotLabels: ['Lunch'], daysLabel: 'Mon – Fri', timeLabel: '12:30 PM', foodType: 'NON_VEG'}` and `formatMealCount(..,'week')` = '5 lunches'; Mon/Wed/Fri → 'Mon, Wed, Fri'; dayOfMonth items → daysLabel '3 days a month' and `dayLabel` 'Day 5'; `planRules` with all flags false → the single support rule; `nextOccurrence` skips SKIPPED.
- [ ] **Step 2: Run** `npx jest src/features/mealPlans src/features/customerSubscription/domain` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** both modules (pure, no React imports; `Intl` is unreliable on Hermes — format dates and money by hand).
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(mobile): meal plan schedule and presentation helpers`.

### Task 2: Customer React Query hooks

**Files:**
- Create: `src/features/customerSubscription/query/mealPlanQueries.ts`
- Test: `src/features/customerSubscription/query/mealPlanQueries.test.ts` (key builders + `selectPlanCover` only)

**Interfaces:**
- Consumes: `customerSubscriptionApi.*`, `subscriptionPaymentApi.getLatestForSubscription`, `dishDetailApi` (whatever function `useCustomerDishDetailQuery` calls) with `createCustomerDishDetailQueryKey` so the cache is shared; Task 1 `summarizeSchedule`.
- Produces:
  - `mealPlanQueryPrefix = ['customer-meal-plans'] as const`; identity-gated keys built like `customerAddressQueries.ts:90-104`
  - `usePublicMealPlansQuery()`, `usePlanScheduleQuery(planId: string | null)`, `usePlanPolicyQuery(planId: string | null)` (staleTime 5 min)
  - `useMySubscriptionsQuery()`, `useSubscriptionOccurrencesQuery(subscriptionId: string | null)`, `useLatestSubscriptionPaymentQuery(subscriptionId: string | null)` (staleTime 30 s)
  - `useMenuItemPreview(menuItemId: string | null): {imageUrl: string | null; kitchenName: string | null}` — dish detail query, `retry: false`, errors → nulls
  - `usePlanCover(planId: string | null): {imageUrl: string | null; kitchenName: string | null; summary: PlanScheduleSummary | null}`
  - `useSubscriptionActions(subscriptionId: string)` → `{pause(), resume(resumeDate: string), skip(serviceDate: string), cancel(), pending: boolean}`; each invalidates `mealPlanQueryPrefix`
  - `invalidateMealPlanQueries(queryClient: QueryClient): Promise<void>`
  - `selectPlanCover(detail: CustomerDishDetail | undefined): {imageUrl: string | null; kitchenName: string | null; kitchenId: string | null}` (primary image first, else lowest `sortOrder`)
  - `resolveApiImageUrl(path: string | null | undefined): string | null` — absolute https URLs pass through; paths starting with `/api/` are prefixed with the httpClient's configured API base URL; anything else → null
  - `usePlanCover` prefers `plan.imageUrl` (resolved) over the dish photo, and also returns `rating: {average: number; count: number} | null` from `useKitchenRatingQuery(kitchenId)`
  - `useKitchenRatingQuery(kitchenId: string | null)` → `{average, count} | null` (null when `reviewCount` is 0 or the call fails; staleTime 10 min)
  - `useOccurrenceOrderQuery(orderId: string | null)` → the existing customer-orders query hook/API for one order (reuse `customerOrders` feature hooks; do not add a new order endpoint)
- Modifies `api/customerSubscriptionApi.ts` schemas (all optional + nullable so old production still parses): plan `imageUrl`; subscription `planName`, `billingPeriod`, `amount`, `currency`, `nextBillingDate`, `planImageUrl`; occurrence `orderId`. Adds `kitchenReviewSummary(kitchenId)` → GET `/api/v1/public/kitchens/{kitchenId}/reviews/summary` (zod: `reviewCount` int ≥ 0, `overallAverage` number | null; other keys ignored) unless an equivalent mobile function already exists — then reuse it. Add the route to the mobile APIM contract manifest if p119 requires.

- [ ] **Step 1: Write failing tests** for `selectPlanCover` (primary wins; no images → null; kitchen displayName preferred over kitchenName) and that two different identity ids produce different plan-list keys.
- [ ] **Step 2: Run** `npx jest src/features/customerSubscription/query` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): meal plan query hooks`.

### Task 3: Nested navigator, checkout context and shared feature components

**Files:**
- Modify: `src/app/navigation/types.ts` (add `CustomerMealPlanStackParamList`)
- Create: `src/features/customerSubscription/navigation/CustomerMealPlanNavigator.tsx`
- Create: `src/features/customerSubscription/state/MealPlanCheckoutContext.tsx`
- Create: `src/features/customerSubscription/components/MealPlanUi.tsx`
- Modify: `src/features/customerSettings/screens/CustomerSettingsChildScreens.tsx:13` (export the navigator as `CustomerSettingsSubscriptionScreen`)

**Interfaces:**
- Produces:
  ```ts
  export type CustomerMealPlanStackParamList = {
    MealPlans: undefined;
    MealPlanDetail: {planId: string};
    MealPlanReview: {planId: string};
    MealPlanAddress: undefined;
    MealPlanPayment: {planId: string; subscriptionId?: string};
    MealPlanActivated: {subscriptionId: string};
    MyMealPlan: {subscriptionId: string};
    MealPlanMeal: {subscriptionId: string; occurrenceId: string};
  };
  ```
  - Navigator: `headerShown: false`, same reduced-motion animation helper the customer stacks use; wraps children in `MealPlanCheckoutProvider`. Screens are registered by Tasks 4–7; until then register placeholders that render `null` so the app compiles.
  - `useMealPlanCheckout(): {startDate: string | null; setStartDate(d: string): void; deliveryAddressId: string | null; setDeliveryAddressId(id: string): void}`
  - `useSelectedDeliveryAddress(): {address: CustomerAddress | null; addresses: CustomerAddress[]; loading: boolean}` — delivery-ready addresses only (`isCustomerAddressDeliveryReady`); when nothing is chosen yet, picks the default then the first.
  - `MealPlanUi.tsx` exports: `MealPlanHeader({title, subtitle?, onBack, right?})` (white, 64 high, back `IconButton` 'arrow-left'), `FoodTypePill({foodType})` (8px dot success/warning/error + 'Veg'/'Egg'/'Non-veg' on `surfaceMuted` pill, like `CustomerKitchenMenuCard.tsx:113-115`), `MealPlanPhoto({uri, size | {width,height}, radius?})` (fallback `chef` icon tile), `InfoRow({icon?, label, value, action?})` (min height 48, top border except first), `CardSection({title?, children})`, `BottomPriceBar({price, unitLabel, buttonLabel, onPress, disabled?, loading?, footnote?})` (sticky, safe-area bottom, price left + `Button` primary flex 1), `PlanRulesList({rules})` (red-soft round icon tiles as in design screen 3).

- [ ] **Step 1:** Add the param list and placeholders; mount the navigator through the re-export.
- [ ] **Step 2: Run** `npx tsc --noEmit -p .` — expect 0 errors; `npx jest src/app/navigation` — PASS (route names unchanged, so policy tests hold).
- [ ] **Step 3: Commit** `feat(mobile): meal plan navigator, checkout context and UI kit`.

### Task 4: Meal Plans list, Meal Plan detail, Review, Delivery Address

**Files:**
- Create: `src/features/customerSubscription/screens/MealPlansScreen.tsx`, `MealPlanDetailScreen.tsx`, `MealPlanReviewScreen.tsx`, `MealPlanAddressScreen.tsx`
- Modify: `CustomerMealPlanNavigator.tsx` (register them)

**Interfaces:** consumes Tasks 1–3; navigation params as in Task 3.

Screen content (match `screens.html` sections `list`, `detail`, `review`, `address`, with the API-reality substitutions):
- **MealPlansScreen**: header "Meal Plans" (+ right "My plans" `IconButton` icon `calendar-check-outline` when `useMySubscriptionsQuery` has items → `MyMealPlan` of the first non-cancelled subscription; if several, show them as compact cards above the chips instead), search box (filters by plan name and kitchen name), chips All/Weekly/Monthly (`billingPeriod`), cream banner "Healthy homemade meals, every day" / "Wholesome. Fresh. Crafted with love." with `assets/home/home-kitchen-picks.jpg` on the right (no button), then one tappable card per plan: photo 104×120, name, "By {kitchen}", `FoodTypePill` + "{mealCount} · {slot}", price red + "/ week|month", chevron. Interrupted-payment banner from Task 5's `useInterruptedPaymentRecovery`. Loading `ListSkeleton`; error `RecoverableErrorBanner` with retry; empty "No meal plans yet".
- **MealPlanDetailScreen**: header "Meal Plan"; 188-high hero photo; Weekly/Monthly `Badge` (error tone) + `FoodTypePill`; name (hero size); kitchen name; description; 3-up facts (meals per unit, days, time — hide a fact whose value is null); "What's included" rows (dish thumbnail via `useMenuItemPreview`, day long label, dish name, time); delivery address row with "Change" → `MealPlanAddress`; plan rules (`planRules(policy)`); `BottomPriceBar` "Choose plan" → `MealPlanReview` (sets default start date `upcomingStartDates(today)[0]` if unset).
- **MealPlanReviewScreen**: header "Review Subscription" / "Almost there! Review your plan details."; plan card (photo 96, name, kitchen, price); "Subscription details": Start date + Change (sheet of `upcomingStartDates`), Delivery address + Change, Plan type, Meals per week|month ('5 lunches · Mon – Fri'); plan rules + "View full policy" only when `refundPolicyReference` is a URL (open with `Linking`); `BottomPriceBar` "Proceed to payment" → `MealPlanPayment {planId}`; disabled with "Add an address" link when no address.
- **MealPlanAddressScreen**: header "Delivery Address" / "Select where you want your meals delivered"; cards (icon by label: home/briefcase-outline/map-marker-outline), label + "Default" `Badge` neutral, area line, full display line, radio, "Edit" (opens `CustomerAddressEditorModal` mode edit); dashed "Add new address" card (editor mode add; on save select it); bottom `Button` "Deliver here" → `setDeliveryAddressId` + `goBack()`.

- [ ] **Step 1:** Build the four screens and register them.
- [ ] **Step 2: Run** `npx tsc --noEmit -p .` and `npx eslint src/features/customerSubscription` — 0 errors, 0 warnings.
- [ ] **Step 3: Commit** `feat(mobile): meal plan browse and review screens`.

### Task 5: Payment, checkout hook and Activated screen; remove the old screen

**Files:**
- Create: `src/features/customerSubscription/state/useSubscriptionCheckout.ts`
- Create: `src/features/customerSubscription/screens/MealPlanPaymentScreen.tsx`, `MealPlanActivatedScreen.tsx`
- Delete: `src/features/customerSubscription/screens/CustomerMealPlansScreen.tsx` (after porting)
- Test: `src/features/customerSubscription/state/useSubscriptionCheckout.test.ts` (pure helper `checkoutOutcome` only)

**Interfaces:**
- Produces:
  - `useSubscriptionCheckout(): {payNew(input: {planId: string; startDate: string; deliveryAddressId: string; notes?: string}): Promise<CheckoutOutcome>; payExisting(subscriptionId: string): Promise<CheckoutOutcome>; busy: boolean}`
  - `type CheckoutOutcome = {kind: 'paid'; subscriptionId: string; payment: SubscriptionPayment} | {kind: 'processing'; subscriptionId: string} | {kind: 'not-completed'; subscriptionId: string | null; message: string} | {kind: 'profile-incomplete'}`
  - `checkoutOutcome(payment: SubscriptionPayment | null, subscriptionId: string): CheckoutOutcome` (PAID → paid; PAYMENT_REQUESTED/PENDING → processing; else not-completed 'Payment not completed. You can try again.')
  - `useInterruptedPaymentRecovery(): {pending: PendingSubscriptionPaymentReference | null; resume(): Promise<CheckoutOutcome | null>}` — ported from `CustomerMealPlansScreen.tsx:262-301` (mount + AppState active)
  - Port verbatim the create → `waitForSubscriptionPayment` (0/400/900/1600 ms) → profile name/phone check → `createOrder` → provider/order/key checks → pending store save → `openRazorpayCheckout` → `verifyRazorpay` → store clear sequence. Pass the Razorpay description 'Craves meal plan' only if `openRazorpayCheckout` already accepts a description; otherwise leave it.
- **MealPlanPaymentScreen** (`screens.html#payment`): header "Payment"; plan card (photo 88, Weekly badge, name, kitchen) + rows Meals, Delivery time, Starts, Billing ('Every week'/'Every month'); "This week's menu" (weekly: Mon–Sun rows of dish names; monthly: title "Menu", first 7 sorted items 'Day n'); "Delivering to" card with full address + Change; green note "Secure payment with Razorpay" / "Pay with UPI, card, net banking or wallet on the next step."; bottom: "Total amount ₹1,499 / week", `Button` "Pay & Subscribe" (loading while busy), footnote "You can cancel anytime. No lock-in period." only when `customerCancelEnabled`. With `subscriptionId` param it calls `payExisting`. Outcomes: paid → `navigation.replace('MealPlanActivated', {subscriptionId})`; processing → inline info "Payment is processing. We'll update your plan shortly." + "Go to My Meal Plan"; not-completed → inline error with the message; profile-incomplete → Alert pointing to Profile (as today).
- **MealPlanActivatedScreen** (`screens.html#activated`, no reminder card): success mark, "Meal Plan Activated!", "Your subscription has been successfully created. Get ready for homemade goodness!", rows Subscription ID (`shortSubscriptionId`), Plan, Amount paid (latest payment amount), Start date, First meal ('{dish} · {time}' from the first sorted schedule item on/after start date). Buttons: "View My Plan" → `replace('MyMealPlan', {subscriptionId})`; "Back to Home" (outline) → pop this stack and navigate the tab navigator to `Home` › `CustomerHomeRoot`. Android back on this screen behaves like "Back to Home".

- [ ] **Step 1: Write failing test** for `checkoutOutcome` (PAID, PAYMENT_PENDING, FAILED, null).
- [ ] **Step 2: Run** `npx jest src/features/customerSubscription/state` — FAIL.
- [ ] **Step 3: Implement** hook + screens; delete the old screen; fix imports.
- [ ] **Step 4: Run** the test (PASS), `npx tsc --noEmit -p .`, `npx eslint src/features/customerSubscription`, `node scripts/p119-apim-contract-coverage-check.mjs` — all clean.
- [ ] **Step 5: Commit** `feat(mobile): meal plan payment and activation screens`.

### Task 6: My Meal Plan and meal details

**Files:**
- Create: `src/features/customerSubscription/screens/MyMealPlanScreen.tsx`, `MealPlanMealScreen.tsx`

**Content:**
- **MyMealPlanScreen** (`screens.html#myplan`): plan card (photo 80, name, `subscriptionStatusPresentation` badge, kitchen, price/unit) + divider row "Paid until {short date}" (when latest payment PAID) and address area; payment banner for PENDING_PAYMENT/PAYMENT_FAILED with `Button` "Complete payment" → `MealPlanPayment {planId, subscriptionId}`; next-meal card from `nextOccurrence` ("Today · 12:30 PM" or "{short date} · time", dish names, status badge, "View details" → `MealPlanMeal`); action tiles shown only when allowed: "Pause plan" (ACTIVE + pause enabled) / "Resume plan" (PAUSED + resume enabled, resumeDate = tomorrow), "Skip a meal" (ACTIVE + skip enabled → sheet of upcoming non-skipped occurrence dates); each confirmed with `Alert`; "This week's schedule" from `weekOccurrences` with "Today" badge and skipped rows struck through, empty text "Your meals will show here once they're scheduled."; bottom ghost `Button` "Cancel plan" (cancel enabled and status ACTIVE/PAUSED) with helper "Cancelling stops all upcoming meals right away." and a destructive confirm `Alert`.
- **MealPlanMealScreen** (`screens.html#today`): title "Today's Meal" when `serviceDate` is today else "Upcoming Meal"; meal card (first dish photo, dish names joined ' + ', plan name, kitchen); status card:
  - with `occurrence.orderId`: three-step tracker Preparing (chef-hat) → Out for delivery (truck-delivery-outline) → Delivered (check) from the order status (PAID/CHEF_ACCEPTANCE_PENDING/CHEF_ACCEPTED/PREPARING → step 0; READY_FOR_PICKUP/OUT_FOR_DELIVERY → 1; DELIVERED → 2; CHEF_REJECTED/CANCELLED/REFUND_* → no step, error badge "Order cancelled"), one status line ("Your meal is being prepared by the chef." / "Your meal is on the way." / "Delivered. Enjoy your meal!") and ghost `Button` "Track order" → `CustomerOrderTracking {orderId}` (route exists in both Home and Profile stacks via `CustomerOrderDetailStackParamList`; navigate through the parent stack);
  - without it: two-step Scheduled (calendar-check-outline) → Order placed (receipt-text-outline) from `occurrenceStatusPresentation(...).step`;
  - SKIPPED/CANCELLED/FAILED show the badge and line only;
  - rows Date, Time, Delivery address, Quantity ('{n} serving(s)' = sum of item quantities).
- My Meal Plan plan card: name/price from the subscription's new fields first (fallback plan list); divider row "Renews {short nextBillingDate}" when present, else "Paid until {short cycleEnd}"; cancel helper text "Cancelling stops upcoming meals right away. Meals already being prepared will still be delivered."

- [ ] **Step 1:** Build both screens and register them.
- [ ] **Step 2: Run** `npx tsc --noEmit -p .`, `npx eslint src/features/customerSubscription` — clean.
- [ ] **Step 3: Commit** `feat(mobile): my meal plan and meal detail screens`.

### Task 7: Chef Menu "Items | Meal plans" segment and plan list

**Files:**
- Create: `src/features/chefSubscription/query/chefMealPlanQueries.ts`
- Create: `src/features/chefSubscription/screens/ChefMealPlansScreen.tsx`
- Create: `src/features/chefSubscription/domain/chefMealPlanPresentation.ts` + test
- Modify: `src/app/navigation/ChefRootNavigator.tsx:146-162` (`ChefMenuTabScreen`), `src/features/chefMenu/screens/ChefMenuScreen.tsx` (optional `headerAccessory?: React.ReactNode` rendered between the title block and the metric grid)
- Modify: `src/app/navigation/types.ts` (`ChefProductStackParamList.ChefMealPlanEditor: {planId?: string}`)

**Interfaces:**
- Produces: `useChefMealPlansQuery()`, `useChefMealPlanSchedulesQuery(planIds: string[])` (useQueries, staleTime 30 s, identity-gated keys under `['chef-meal-plans']`), `invalidateChefMealPlans(queryClient)`; `chefPlanStatusPresentation(status): {label: string; tone: Tone}` (DRAFT Draft/info, PENDING_APPROVAL Pending approval/warning, ACTIVE Live/success, REJECTED Changes requested/error, INACTIVE Inactive/neutral); `chefPlanMetrics(plans): {total, live, pending, draft}` (draft counts DRAFT + REJECTED).
- `ChefMenuTabScreen` keeps `segment: 'items' | 'plans'` state; renders `ChefMenuScreen` or `ChefMealPlansScreen`, each given `headerAccessory={<SegmentedControl value={segment} options={[{value:'items',label:'Items'},{value:'plans',label:'Meal plans'}]} onChange={setSegment} />}`; bottom bar label '+ Add new item' / '+ Add new plan' and target `ChefAddMenuItem` / `ChefMealPlanEditor` (no params).
- **ChefMealPlansScreen** (`screens.html#chefmenu` minus the switch): `ChefHeader title="Menu"`, "Your menu" + existing subtitle, accessory, metrics Total / Live / Pending approval / Draft, search "Search your meal plans", "Meal plans  N of M", cards mirroring `MenuItemCard` (92×92 photo = chef menu image of the first scheduled dish via `useChefMenuModel().items` + `getChefMenuPrimaryImageUrl`, else chef icon), name + status badge, meta "Weekly · 5 lunches · Mon – Fri" from `summarizeSchedule`, description (2 lines), REJECTED shows "Admin: {reviewReason}" in `colors.error`, price "₹1,499 / week" + chevron; tap → `ChefMealPlanEditor {planId}`. Photo prefers the plan's new `imageUrl` (resolved like the customer side). Bottom availability row "Accepting new subscribers" + `Switch` (track `flameRed`) only when the plan has `acceptingSubscribers` (new field) and status ACTIVE; hint "Live and visible to customers." / "Hidden from new customers. Current subscribers are not affected."; toggling calls the new `chefSubscriptionApi.setAcceptingSubscribers(planId, value)` and invalidates. Empty: "No meal plans yet" / "Create a weekly or monthly plan from dishes on your menu." Pull to refresh.
- Modifies `api/chefSubscriptionApi.ts`: plan schema += optional nullable `imageUrl`, optional `acceptingSubscribers`; adds `setAcceptingSubscribers(planId, acceptingSubscribers): Promise<ChefMealPlan>` (PATCH `/api/v1/chef/subscription-plans/{planId}/accepting-subscribers`) and `uploadPlanImage(planId, form: FormData): Promise<ChefMealPlan>` (PUT `/api/v1/chef/subscription-plans/{planId}/image`, multipart like `chefMenuApi.uploadImage`); both routes added to `C:\mscratch\api\apim-api\contracts\mobile-subscriptions.v1.json`.

- [ ] **Step 1: Write failing tests** for `chefPlanStatusPresentation` and `chefPlanMetrics`.
- [ ] **Step 2: Run** `npx jest src/features/chefSubscription/domain` — FAIL.
- [ ] **Step 3: Implement** queries, presentation, screen, navigator changes.
- [ ] **Step 4: Run** tests (PASS), `npx tsc --noEmit -p .`, `npx eslint` on changed files, `npx jest src/app/navigation` — clean.
- [ ] **Step 5: Commit** `feat(mobile): chef menu meal plans tab`.

### Task 8: Chef Create / Edit Meal Plan

**Files:**
- Create: `src/features/chefSubscription/domain/mealPlanEditor.ts` + `mealPlanEditor.test.ts`
- Create: `src/features/chefSubscription/screens/ChefMealPlanEditorScreen.tsx`
- Modify: `src/app/navigation/ChefRootNavigator.tsx` (register `ChefMealPlanEditor` in the product stack next to `ChefAddMenuItem`)

**Interfaces:**
- Produces (`mealPlanEditor.ts`):
  - `type MealSlot = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER'`; `SLOT_DEFAULT_TIME` = `{BREAKFAST:'08:30', LUNCH:'12:30', SNACK:'16:30', DINNER:'19:30'}`
  - `interface EditorSlot { key: string; day: number; slot: MealSlot; time: string; menuItemId: string | null; quantity: number }` (`day` = isoDayOfWeek 1–7 for WEEKLY, dayOfMonth 1–28 for MONTHLY)
  - `scheduleToSlots(schedule: ChefMealSchedule): EditorSlot[]`
  - `slotsToScheduleRequest(slots: EditorSlot[], period: 'WEEKLY' | 'MONTHLY', leadHours: number): PutChefScheduleRequest` — sequenceNumber 1.. per day in slot order B/L/S/D; timezone 'Asia/Kolkata'; recurrenceType = period
  - `addSlot(slots, day, slot): EditorSlot[]` (time = existing time of that slot code anywhere, else default); `removeSlot(slots, key)`; `setSlotTime(slots, slot: MealSlot, time): EditorSlot[]` (applies to EVERY slot with that code — backend requires one time per slot); `setSlotDish(slots, key, menuItemId)`; `setSlotQuantity(slots, key, qty)` (clamped 1–100)
  - `daysWithMeals(slots): Set<number>`; `freeSlotsForDay(slots, day): MealSlot[]`
  - `validateMealPlanForm(form: {name: string; description: string; amount: string}, slots: EditorSlot[], mode: 'draft' | 'submit'): Record<string, string>` — name required (≤160), description required (≤500 per design), amount > 0; submit also needs ≥1 slot and every slot has a dish
  - `LEAD_HOUR_OPTIONS = [1, 2, 4, 6, 12, 24, 48, 72, 168]`; `TIME_OPTIONS` = '06:00'…'23:30' every 30 min
- **Plan photo field** (first field of Plan details; editable only in DRAFT/REJECTED; a 404/405 from the upload — old production — shows "Plan photos aren't available yet." and keeps the saved plan): dashed tile "Add plan photo" / "Customers see this on the plan card"; picker copied from `ChefAddMenuItemScreen.tsx:122-150` (4:3, quality 0.9, JPEG/PNG/WebP); the picked image previews in the tile with "Change photo"; it uploads after the plan is saved (needs a plan id) via `uploadPlanImage`; upload failure shows inline "Photo couldn't be uploaded. Try again." without losing the saved plan.
- **ChefMealPlanEditorScreen** (`screens.html#create`): header back + "Create Meal Plan"/"Edit Meal Plan" + "Plan your meals, delight your customers"; read-only banner when status is PENDING_APPROVAL/ACTIVE/INACTIVE ("This plan is {label}. You can't edit it right now.") and admin-reason banner for REJECTED; Plan details card: Plan name, Frequency `SegmentedControl` Weekly/Monthly (changing it with slots present asks "Changing frequency clears the meal schedule." and clears), Price (₹ prefix, "per week|month" suffix), Description (multiline, counter 0/500), Preparation lead time row opening a sheet of `LEAD_HOUR_OPTIONS` ('24 hours (Default)' label for 24) + help "Meals are prepared this many hours in advance. Min 1 hour, max 168 hours."; Meal schedule card: day selector (weekly 7 equal cells with dots; monthly horizontal 1–28 chips with dots), slot cards (slot icon + label, time chip → time sheet with footnote "Applies to every {slot} in this plan", delete icon button on `errorSoft`, dish row → dish sheet of AVAILABLE menu items with thumbnails, "Quantity per customer" stepper), dashed outline "Add meal slot" → sheet of `freeSlotsForDay`, info note "You can only select dishes that are Active and Available on your menu."; bottom bar: outline "Save draft" + primary "Submit for approval" + footnote "You can add a note for the admin in the next step." Submit opens a modal with an optional "Note for admin" input and "Submit". Save = `createPlan` (new) or `updatePlan`, then `putSchedule` when slots exist; submit = save then `submit(planId, note)`; then `invalidateChefMealPlans` and `goBack()`. Server errors show inline under the bar.

- [ ] **Step 1: Write failing tests** for `slotsToScheduleRequest` (Mon LUNCH + DINNER → sequence 1,2; monthly uses `dayOfMonth`), `setSlotTime` (updates every LUNCH across days), `setSlotQuantity` clamping (0 → 1, 101 → 100), `validateMealPlanForm` (submit with an empty dish fails with a slot error; draft without slots passes), `scheduleToSlots` round-trip.
- [ ] **Step 2: Run** `npx jest src/features/chefSubscription/domain` — FAIL.
- [ ] **Step 3: Implement** helpers and screen; register route.
- [ ] **Step 4: Run** tests (PASS), `npx tsc --noEmit -p .`, `npx eslint` on changed files — clean.
- [ ] **Step 5: Commit** `feat(mobile): chef meal plan editor`.

### Task 9: Verify, version, build

**Files:**
- Modify: `android/app/build.gradle` (`versionCode 54`, `versionName "1.26.0"`)
- Modify: `KUSHIRAVI_VERSION.md` (new top checkpoint "Version 1.26.0 - Meal plan redesign, 2026-10-11": what changed, API-reality omissions, checks run, APK path + SHA-256; header fields updated; also record that 1.25.5–1.25.14 / code 53 is the previously installed build)

- [ ] **Step 1: Run** full checks: `npx tsc --noEmit -p .`; `npx eslint src --max-warnings 0` on changed files; `npx jest --maxWorkers=4`; `node scripts/p119-apim-contract-coverage-check.mjs`; `git diff --check`. All must pass (pre-existing unrelated failures noted, not fixed).
- [ ] **Step 2:** Bump version, write notes, commit `feat(mobile): meal plan redesign in v1.26.0`, tag `KUSHIRAVI-app-v1.26.0`.
- [ ] **Step 3: Build** `powershell -File scripts\build-kushirav-release-apk.ps1 -PhoneOnly -SkipNpmCi` from `C:\mscratch\apps\mobile` (script name `build-kushiravi-release-apk.ps1`); copy `android/app/build/outputs/apk/release/app-release-signed.apk` to `C:\mscratch\artifacts\KUSHIRAVI-app-v1.26.0.apk`; record SHA-256 and signer (must match `fac61745…3b9c`).
- [ ] **Step 4:** Amend nothing; add the APK hash to `KUSHIRAVI_VERSION.md` in a follow-up commit `docs(mobile): record v1.26.0 APK`.
