# Account Deletion on the Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** craves.in gets a public account-deletion explainer and a signed-in delete flow, and admin.craves.in gets a Deletion requests review page, all on the deletion server merged in #611/#612.

**Architecture:** Same-origin Next.js route handlers (`src/app/api/account-deletion`, `src/app/api/admin/account-deletions`) call auth-service through `authenticatedApiFetch`; pages render from those routes. A pure model ported from the app (`features/account-deletion/domain`) decides the screen, the chooser and the copy. The customer launch lock and the chef-mode guard gain narrow exemptions for the two deletion paths only.

**Tech Stack:** Next.js (App Router) + React, TypeScript, vitest (`*.vitest.ts`) and node test (`*.test.ts`), Tailwind classes as neighbouring files use them.

**Spec:** `docs/superpowers/specs/2026-11-05-account-deletion-web-design.md` (approved 5 Nov 2026). App-side model and copy to port: `apps/mobile/src/features/accountDeletion/domain/` on branch `feat/advanced-features-app` (read with `git show origin/feat/advanced-features-app:apps/mobile/src/features/accountDeletion/domain/<file>`).

## Global Constraints

- Work in `C:\mweb` on branch `feat/account-deletion-web`; website code in `apps/customer-web-next`; run commands there. Commit locally only; never push.
- No server change. Backend paths through `authenticatedApiFetch`: `/auth/me/deletion` (GET, POST, DELETE) and `/admin/account-deletions`, `/admin/account-deletions/{id}`, `/admin/account-deletions/{id}/approve`, `/admin/account-deletions/{id}/reject`.
- POST body to the backend is `{"scope": <CUSTOMER|CHEF|ALL>, "via": "WEB"}`; the route sets `via` itself.
- The browser never sees backend tokens or admin roles. Every new route checks `isSameOrigin` for non-GET methods, bounds the body with `boundBffRequest`, sends `Cache-Control: no-store` (admin routes also `X-Robots-Tag: noindex, nofollow`), and validates the backend body with a parser before returning it.
- Nothing about deletion shows on `/account/delete` while the GET fails with anything other than 404 `NO_DELETION_REQUEST`; the page then shows the "not available yet" message.
- After a successful POST or DELETE the browser renews the session through the existing `/api/auth/refresh` before reading again.
- No preselected chooser option; the scope sent is exactly the one tapped.
- The explainer's text is the spec's "1. /account-deletion" copy, verbatim. Speak of "Craves", never "we".
- The customer launch lock (`CUSTOMERS_LAUNCHING_SOON = true`) stays on for every path except `/account/delete` and `/account-deletion`; owners and early-access devices keep today's behaviour.
- Admin reasons: 10 to 500 characters after trimming (counter shown); the admin detail route uses a 25 s backend timeout, every other route the 10 s default.
- Tests: `npx vitest run <path>` for `*.vitest.ts(x)`, `node --test --experimental-strip-types <path>` for `*.test.ts`; `npm run typecheck`; `npm run lint` (also checks feature boundaries). Commit messages `feat(web): …` / `fix(web): …`, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents use their own model's name).

## Review Focus

1. A signed-in customer without early access who signed in through `/account/delete` tries `/home`: they get the launching-soon page, not the customer app (Task 4 test).
2. Google's reviewer opens `https://craves.in/account-deletion` with no cookie, while the launch gate is in its waiting phase and from a chef-mode tab: the explainer renders every time (Task 3 tests).
3. Double click on the confirm button or on Keep sends one request (Task 5 test).
4. The admin detail takes ~20 s because a service is slow: the page shows a loading state and the route does not time out at 10 s (Task 7 timeout test, Task 8 loading test).
5. A SUPPORT_ADMIN or AUDIT_ADMIN opens a PENDING_REVIEW request: no Approve/Reject buttons (`canDecide: false`), and a forced POST still shows the server's refusal (Tasks 7-8 tests).

---

### Task 1: Domain: types, contract parsers, copy and model

**Files:**
- Create: `src/features/account-deletion/domain/deletion-types.ts`, `deletion-contract.ts`, `deletion-copy.ts`, `deletion-model.ts`
- Test: `src/features/account-deletion/domain/deletion-contract.vitest.ts`, `deletion-model.vitest.ts`

**Interfaces:**
- Produces (`deletion-types.ts`): `DeletionScope = "CUSTOMER" | "CHEF" | "ALL"`; `DeletionStatus` (7 values as the app); `DeletionView {requestId; scope; status; requestedAt; dueAt: string | null; reviewNote: string | null}`; `DeletionSide = "customer" | "chef" | null`; admin types `AdminDeletionSummary {requestId; identityId; scope; status; via: "APP" | "WEB"; requestedAt; dueAt: string | null; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null}`, `AdminDeletionStep {phase; service; status; attempts: number; lastError: string | null; completedAt: string | null}`, `AdminDeletionBlocker {service; code; detail: string | null}`, `AdminDeletionDetail {request: AdminDeletionSummary; phoneLast4: string | null; roles: string[]; steps: AdminDeletionStep[]; blockers: AdminDeletionBlocker[]; canDecide: boolean}`, `AdminDeletionPage {items: AdminDeletionSummary[]; nextCursor: string | null}`.
- Produces (`deletion-contract.ts`): `parseDeletionView(raw: unknown): DeletionView | null`, `parseAdminPage(raw): AdminDeletionPage | null`, `parseAdminDetail(raw, canDecide: boolean): AdminDeletionDetail | null` (backend detail has no `canDecide`), `parseAdminSummary(raw): AdminDeletionSummary | null`, `parseOpenItems(raw): AdminDeletionBlocker[] | null`, `isDeletionScope(value: unknown): value is DeletionScope`, `ADMIN_STATUS_FILTERS` (the 8 filter values: `""` for all, then the 7 statuses).
- Produces (`deletion-model.ts`), ported from the app's `deletionModel.ts` (same names and behaviour unless noted): `entryStateFor`, `formatDeletionDate(iso, "short" | "long", timeZone?)` (returns '' on a bad date), `summaryKindFor`, `isDeletionPaused(code: string | null | undefined)` (true for `ACCOUNT_DELETION_PENDING`), and the web chooser `scopePlanFor(roles: readonly string[], side: DeletionSide): ScopePlan` where `ScopePlan = {kind: "direct"; scope} | {kind: "choose"; options: ScopeChoice[]; riderNote: boolean}`.
- Produces (`deletion-copy.ts`): the app's `deletionCopy` object (all keys as in the app's `deletionCopy.ts`, same strings) with these website changes: `customerSummary.dateBody` = "30 days from today. Until then you can keep your account on this page or in the app."; new `web.unavailable` = "Deleting an account from the website isn't available yet. You can ask in the Craves app, or email support@craves.in."; new `web.signInFirst` = "Sign in with the phone number on your account to continue."; new `paused.link` = "Keep my account"; `paused.orders(null)` / `paused.mealPlans(null)` texts as the app's no-date variants.

- [ ] **Step 1: Write failing tests.** Port the app's `deletionModel.test.ts` cases for `entryStateFor`, `summaryKindFor`, `formatDeletionDate` (including `2026-12-05T18:30:00Z` → "6 Dec" in `Asia/Kolkata`) and add the web chooser:

```ts
expect(scopePlanFor(["CUSTOMER"], null)).toEqual({ kind: "direct", scope: "ALL" });
expect(scopePlanFor(["CUSTOMER", "RIDER"], null)).toEqual({ kind: "direct", scope: "CUSTOMER" });
expect(scopePlanFor(["CUSTOMER", "CHEF"], "chef").kind === "choose" && scopePlanFor(["CUSTOMER", "CHEF"], "chef").options.map(o => o.scope)).toEqual(["CHEF", "ALL"]);
expect(scopePlanFor(["CUSTOMER", "CHEF"], "customer").kind === "choose" && scopePlanFor(["CUSTOMER", "CHEF"], "customer").options.map(o => o.scope)).toEqual(["CUSTOMER", "ALL"]);
expect(scopePlanFor(["CUSTOMER", "CHEF"], null).kind === "choose" && scopePlanFor(["CUSTOMER", "CHEF"], null).options.map(o => o.scope)).toEqual(["CUSTOMER", "CHEF", "ALL"]);
expect(scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], null)).toMatchObject({ kind: "choose", riderNote: true });
expect(scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], null).kind === "choose" && scopePlanFor(["CUSTOMER", "CHEF", "RIDER"], null).options.map(o => o.scope)).toEqual(["CUSTOMER", "CHEF"]);
```

Contract tests: each parser accepts a valid body, rejects a missing `requestId`, an unknown `status`/`scope`, and a non-array `items`/`steps`/`blockers`; `parseAdminDetail(raw, true).canDecide === true`.
- [ ] **Step 2: Run** `npx vitest run src/features/account-deletion/domain` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four files (the three-choice options use the app's `chooser.customerSide`, `chooser.chefSide`, `chooser.whole` copy in that order).
- [ ] **Step 4: Run** the same and `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): account deletion model, contract and copy`.

### Task 2: Person route `/api/account-deletion`

**Files:**
- Create: `src/app/api/account-deletion/route.ts`
- Test: `src/features/account-deletion/lib/account-deletion-bff.vitest.ts` (mock `authenticatedApiFetch` as `features/admin/reviews/lib/review-moderation-bff.vitest.ts` does)

**Interfaces:**
- Consumes: `parseDeletionView`, `isDeletionScope` (Task 1); `authenticatedApiFetch`, `SessionRequiredError` (`shared/lib/server-api.ts`); `isSameOrigin`; `boundBffRequest`; `upstreamFailure` (`shared/lib/feature-availability.ts`).
- Produces: `GET` → 200 `DeletionView` | 200 `{ none: true }` on backend 404 `NO_DELETION_REQUEST` | `{code}` errors (401 `SESSION_EXPIRED`, 503 `ACCOUNT_DELETION_NOT_ENABLED`, 404 `FEATURE_NOT_AVAILABLE` for a gateway 404, 502 `INVALID_DELETION_RESPONSE`); `POST {scope}` → 200/201 `DeletionView` or `{code}` (codes passed through: `ACCOUNT_DELETION_ALREADY_REQUESTED`, `ACCOUNT_DELETION_SCOPE_NOT_ALLOWED`, `ACCOUNT_DELETION_NOT_ENABLED`); `DELETE` → 200 `DeletionView` or `{code}` (`NO_DELETION_REQUEST`, `ACCOUNT_DELETION_IN_PROGRESS`).

- [ ] **Step 1: Failing tests:** GET maps 200, 404 `NO_DELETION_REQUEST` → `{none: true}`, 404 without code → `FEATURE_NOT_AVAILABLE`, 503 passthrough, no cookie → 401 `SESSION_EXPIRED`; POST from another origin → 403; POST with `{scope: "ALL", via: "APP"}` forwards `{"scope":"ALL","via":"WEB"}`; POST with an unknown scope → 400 without calling the backend; a backend body failing the parser → 502; DELETE forwards to `/auth/me/deletion` with method DELETE.
- [ ] **Step 2: Run** `npx vitest run src/features/account-deletion/lib` — Expected: FAIL.
- [ ] **Step 3: Implement** following `src/app/api/customer/launch-alerts/route.ts`.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): account deletion route`.

### Task 3: Public explainer, privacy update and open paths

**Files:**
- Create: `src/app/account-deletion/page.tsx`
- Modify: `src/features/pilot-launch/lib/web-launch-security.ts` (`launchExemptPath`: add `/account-deletion`), `src/features/chef/components/ChefModeGuard.tsx` (`OPEN_PATHS`: add `/account-deletion` and `/account/delete`), `src/app/privacy/page.tsx`, `src/features/landing/components/FooterSection.tsx` (link "Delete your account" next to "Privacy policy")
- Test: extend the existing tests for `launchExemptPath` and `isOpenInChefMode` (find them with `grep -rln "launchExemptPath\|isOpenInChefMode" src --include=*.test.ts --include=*.vitest.ts*`; create beside the source if none)

**Interfaces:**
- Consumes: `PublicPolicyPage`, `PolicySection`, `PolicyList` (`features/legal/components/PublicPolicyPage.tsx`).
- Produces: route `/account-deletion` (static, indexable, `metadata.title` "Delete your Craves account | Craves").

- [ ] **Step 1: Failing tests:** `launchExemptPath("/account-deletion") === true`, `launchExemptPath("/account-deletion/x") === false`; `isOpenInChefMode("/account-deletion") === true`, `isOpenInChefMode("/account/delete") === true`, `isOpenInChefMode("/account") === false`, `isOpenInChefMode("/home") === false`.
- [ ] **Step 2: Run** the two test files — Expected: FAIL.
- [ ] **Step 3: Implement.** Explainer text verbatim from the spec section "1. `/account-deletion`" (the sign-in link points to `/account/delete`, the email to `mailto:support@craves.in`). Privacy page: payments paragraph and providers name Razorpay and Cashfree; add a "Deleting your account" section: "You can ask Craves to delete your account in the app or at craves.in/account/delete. Customer accounts are deleted 30 days after you ask; chef accounts after Craves reviews the request. Some records are kept for 8 years because Indian tax law requires it. Read more about account deletion." with the last sentence linking `/account-deletion`; update "Effective" to 5 November 2026.
- [ ] **Step 4: Run** the tests, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): account deletion explainer and privacy update`.

### Task 4: Sign-in for the delete page only

**Files:**
- Modify: `src/app/sign-in/page.tsx` (lock branch near line 35), `src/features/sign-in/lib/customer-launch.ts`, `src/features/chef/components/ChefModeGuard.tsx` (the `confirm` rule near line 41)
- Test: `src/features/sign-in/lib/customer-launch.test.ts` (create or extend), the ChefModeGuard test file if one exists (else a `*.vitest.tsx` beside it)

**Interfaces:**
- Produces (`customer-launch.ts`): `export const DELETION_PATHS = ["/account/delete", "/account-deletion"] as const`; `isDeletionPath(pathname: string): boolean` (exact match or `/account/delete?…`/`/account/delete/…` — compare the path part only); `opensSignInDuringLaunch(returnTo: string): boolean` (true when the path part of a safe `returnTo` is `/account/delete`).
- Behaviour:
  - Sign-in page: when `CUSTOMERS_LAUNCHING_SOON` and not early access, render `<CustomerSignIn …>` (with `earlyAccess={false}`, so the device is NOT remembered as early access) when `opensSignInDuringLaunch(returnTo)`; otherwise today's launching-soon note.
  - ChefModeGuard: while `CUSTOMERS_LAUNCHING_SOON`, a signed-in person who is not an owner and has no early access, on a path that is not open (`isOpenInChefMode` false, which now includes both deletion paths), is sent to `/sign-in` (the launching-soon note) — today this applies only to chefs/chef devices; extend it to everyone in that state. Owners and early-access devices unchanged.

- [ ] **Step 1: Failing tests:** `opensSignInDuringLaunch("/account/delete") === true`, `opensSignInDuringLaunch("/account/delete?side=chef") === true`, `opensSignInDuringLaunch("/home") === false`; guard: a plain CUSTOMER session without early access on `/home` is redirected to `/sign-in` (Review Focus 1), the same session on `/account/delete` is not, an owner on `/home` is not, an early-access device on `/home` is not.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm test` once (the sign-in and guard suites) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): sign-in opens for account deletion during the customer launch lock`.

### Task 5: `/account/delete` page and its entry rows

**Files:**
- Create: `src/app/account/delete/page.tsx` (`robots: noindex`), `src/features/account-deletion/components/delete-account-screen.tsx` (client), plus small components it needs (chooser, summary, confirm dialog, state view) in the same folder
- Modify: `src/features/profile/screens/Settings.tsx` (`ACCOUNT` rows: add `{ to: "/account/delete?side=customer", icon: Trash2, title: "Delete account", subtitle: "Your details are removed 30 days after you ask" }` last), `src/features/chef/components/chef-security.tsx` (the "Delete my account" row links to `/account/delete?side=chef`; its subtitle `deleteNote` becomes "Your chef side, or your whole account" in English and the same meaning in each other language the file carries)
- Test: `src/features/account-deletion/components/delete-account-screen.vitest.tsx`

**Interfaces:**
- Consumes: Task 1 model/copy/types; `/api/account-deletion` (Task 2); the session (`getSession`/`subscribeSession` as `ChefModeGuard` uses, roles from `CravesUser.roles`); `sessionFetch` (`shared/lib/session-fetch.ts`); the existing renew call `/api/auth/refresh` (via the helper in `features/auth/api/cravesAuth.ts` or `shared/lib/session-fetch.ts`).
- Behaviour (spec section "2. `/account/delete`"):
  - Signed out → `router.replace("/sign-in?returnTo=" + encodeURIComponent(current path with query))`.
  - GET → `{none: true}` or a view → `entryStateFor`; errors other than `SESSION_EXPIRED` → `web.unavailable` text only.
  - start: `scopePlanFor(roles, side)` with `side` from `?side=` (`customer`/`chef`, anything else null); chooser (nothing selected; Continue disabled) → summary by `summaryKindFor` (contents exactly as the app's four summaries, with `customerSideStays` only when roles include CHEF and the chef summary's `customerSideStays` only when roles include CUSTOMER) → confirm dialog (app's `confirm.*` copy; `customerSideBodyNoChef` when roles lack CHEF) → POST.
  - After POST/DELETE success: renew session, then render the returned view's state; a ref guards against a second click while sending.
  - States: in review, scheduled, waiting, erasing, declined, as the app's `DeletionStateView` (copy `state.*`, unknown scope falls back to `ALL`); Keep → DELETE; "Ask again" → start; "Contact support" → `/help`.
  - POST errors in the dialog: `sendErrors.notEnabled` (503 / `ACCOUNT_DELETION_NOT_ENABLED`), `sendErrors.scopeNotAllowed`, `ACCOUNT_DELETION_ALREADY_REQUESTED` → re-GET; others `sendErrors.failed`. Keep errors: `keep.inProgress` (409), `keep.failed`; 404 → re-GET.

- [ ] **Step 1: Failing tests:** (mock `fetch`/`sessionFetch` and the session) signed-out redirect keeps `?side=chef`; customer-only → no chooser, summary shows "Referral credits you haven't used"; CHEF+CUSTOMER with no side → three options, Continue disabled until a pick; `side=chef` → two options; picking "Only my chef side" → confirm → POST body `{"scope":"CHEF"}`; **double click on the confirm button → one POST** (Review Focus 3); **double click on Keep → one DELETE**; renew is called after POST before the state renders; GET 503 → only the unavailable text; REJECTED view shows the reason and "Ask again".
- [ ] **Step 2: Run** `npx vitest run src/features/account-deletion/components` — Expected: FAIL.
- [ ] **Step 3: Implement**, styling like the Settings screen and the website's existing dialogs.
- [ ] **Step 4: Run** the same plus the Settings and chef-security tests if present — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): delete account page`.

### Task 6: Paused checkout and meal-plan payment

**Files:**
- Modify: `src/app/api/checkout/route.ts` (make sure a backend 409 `ACCOUNT_DELETION_PENDING` reaches the client as `{code: "ACCOUNT_DELETION_PENDING"}`; today the route reads `raw.error` — keep existing behaviour for other errors), `src/features/checkout/components/customer-checkout.tsx` (show `paused.orders(null)` + a "Keep my account" link to `/account/delete` for that code), the meal-plan subscription create route under `src/app/api/subscriptions/` and `src/features/meal-plans/components/subscription-razorpay-payment.tsx` (same with `paused.mealPlans(null)`)
- Test: the existing tests beside those files (search `*.vitest.ts*` / `*.test.ts` next to each), else new `*.vitest.ts` beside the route

**Interfaces:**
- Consumes: `isDeletionPaused`, `deletionCopy.paused` (Task 1).

- [ ] **Step 1: Failing tests:** checkout route turns a backend 409 `{code:"ACCOUNT_DELETION_PENDING"}` into a client 409 with that code; the checkout component shows "Your account is set to be deleted, so new orders are paused." and a link to `/account/delete` for it, and the old message for any other error; same pair for the meal-plan path.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): explain paused checkout during account deletion`.

### Task 7: Admin routes

**Files:**
- Create: `src/app/api/admin/account-deletions/route.ts` (GET list), `src/app/api/admin/account-deletions/[requestId]/route.ts` (GET detail), `src/app/api/admin/account-deletions/[requestId]/approve/route.ts`, `…/reject/route.ts` (POST)
- Test: `src/features/admin/account-deletions/lib/account-deletions-bff.vitest.ts`

**Interfaces:**
- Consumes: Task 1 parsers; `authenticatedApiFetch(request, path, init, timeoutMs)`; `isUuid` (`shared/lib/server-api.ts`).
- Produces: list `GET ?status=&cursor=` → `AdminDeletionPage` (status must be one of `ADMIN_STATUS_FILTERS`, cursor `^[A-Za-z0-9_-]{1,200}$`, else 400 without calling the backend; `limit=25`); detail `GET` → `AdminDeletionDetail` with `canDecide` = the `/auth/me` roles include PLATFORM_ADMIN or COMPLIANCE_ADMIN (one extra `authenticatedApiFetch(request, "/auth/me")`; on failure `canDecide: false`), backend call with a 25 000 ms timeout; approve/reject `POST {reason}` → trimmed reason length-checked (10-500, else 400 `ADMIN_REASON_INVALID` without calling) → `AdminDeletionSummary`, or 409 `{code: "ACCOUNT_DELETION_HAS_OPEN_ITEMS", blockers}`; error codes passed through: `ADMIN_ROLE_REQUIRED` (403), `ACCOUNT_DELETION_OWN_REQUEST` (403), `ACCOUNT_DELETION_NOT_REVIEWABLE` (409), `NO_DELETION_REQUEST` (404), `ACCOUNT_DELETION_NOT_ENABLED` (503), 401 → `ADMIN_SESSION_EXPIRED`. A non-UUID `requestId` → 404 without calling.

- [ ] **Step 1: Failing tests:** list rejects `status=bogus` and a cursor with `/`; detail sets `canDecide` true for `["COMPLIANCE_ADMIN"]`, false for `["SUPPORT_ADMIN"]` and when `/auth/me` fails; **detail passes `timeoutMs` 25000** (Review Focus 4); approve with a 9-character reason → 400 and no backend call; approve 409 returns the blockers; reject forwards the trimmed reason; cross-origin POST → 403; non-UUID id → 404.
- [ ] **Step 2: Run** `npx vitest run src/features/admin/account-deletions/lib` — Expected: FAIL.
- [ ] **Step 3: Implement** following `src/app/api/admin/reviews/[[...path]]/route.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): admin account deletion routes`.

### Task 8: Admin pages and navigation

**Files:**
- Create: `src/app/admin/account-deletions/page.tsx`, `src/app/admin/account-deletions/[requestId]/page.tsx`, `src/features/admin/account-deletions/components/deletion-request-list.tsx`, `deletion-request-detail.tsx`, `deletion-decision-dialog.tsx`
- Modify: `src/features/admin/shell/lib/admin-navigation.ts` (entry `{ id: "account-deletions", label: "Deletion requests", group: "People & kitchens", href: "/admin/account-deletions", description: "Review chef deletion requests, see what is still open, and approve or reject.", access: "Backend-authorized decisions", keywords: "delete account deletion erase gdpr play remove close" }`)
- Test: `src/features/admin/account-deletions/components/deletion-requests.vitest.tsx`; the navigation test if it pins the list

**Interfaces:**
- Consumes: Task 7 routes; Task 1 types; `AdminPageIntro`; the reviews page's components and classes as the visual model.
- Behaviour (spec section "4."): list with the 8 filters (labels: All, In review, Scheduled, Waiting, Erasing, Completed, Rejected, Cancelled; default In review), columns requested / scope / status / via / due / short id, "Load more"; detail with summary, Open items (rows with code `SERVICE_UNREACHABLE` show "Couldn't check"), Steps, Refresh, loading state while the detail loads; Approve/Reject only when status PENDING_REVIEW and `canDecide`; dialog with reason textarea, counter, Reject note "The person will see this reason.", Approve 409 lists the blockers; messages: 503 "Account deletion is not switched on yet.", 403 `ADMIN_ROLE_REQUIRED` "Your administrator role can't make this decision.", `ACCOUNT_DELETION_OWN_REQUEST` "You can't review your own request.", 409 not reviewable "This request changed. Refresh before deciding."

- [ ] **Step 1: Failing tests:** list renders rows and loads more with the cursor; filter change refetches with `status`; detail shows "Couldn't check" for `SERVICE_UNREACHABLE`; **no Approve/Reject when `canDecide` is false** and none when status is SCHEDULED (Review Focus 5); reject sends the reason and reloads; approve 409 shows the blockers in the dialog; loading state shows while the detail request is pending.
- [ ] **Step 2: Run** `npx vitest run src/features/admin/account-deletions` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and the admin navigation tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): admin Deletion requests page`.

### Task 9: Whole website suite

**Files:** none planned (fixes only for failures this branch caused).

- [ ] **Step 1: Run** `npm test`, `npm run typecheck`, `npm run lint` — Expected: all pass (report counts). A failure this branch caused gets a small fix in its own commit; a failure that also happens on `origin/main` is reported, not changed.
- [ ] **Step 2: Run** `npx next build` with `CRAVES_ADMIN_PORTAL` unset, then with `CRAVES_ADMIN_PORTAL=true` — Expected: both build (report any warning this branch added).
- [ ] **Step 3: Commit** fixes, if any: `fix(web): …`.
