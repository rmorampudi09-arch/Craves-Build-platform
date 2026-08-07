# CRAVES Mobile Master Implementation Plan

**Document purpose:** Durable engineering plan for the complete CRAVES mobile application rebuild.

**Authoritative product specification:** `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` — the 183-page SDS/Enterprise UI Implementation Guide containing 52 embedded reference images across customer and chef experiences.

**Implementation branch:** `mobile-ui-rebuild-from-scratch`

**Mobile workspace:** `apps/mobile`

**Build policy:** Do **not** build an APK after each phase. During implementation, validate code with TypeScript, ESLint, Jest, production JavaScript bundling, contract checks, and backend-source guards. Produce the complete Android release artifact only after all implementation and QA phases are complete.

---

## 1. Mission

Build the complete CRAVES Android-first React Native CLI application as one coherent production system, not a collection of static reference screens. The finished application must implement all 52 master-guide references, all customer and chef navigation, the documented smart UI behavior, the exact approved backend/APIM contracts, authentication/session security, shared state, lifecycle states, accessibility, performance, observability, and final device-based visual verification.

The application must remain maintainable at high scale. A screen is not complete merely because it renders. It is complete only when its real interactions, API integration, state synchronization, loading/error/offline behavior, navigation, accessibility, tests, and visual acceptance requirements are satisfied.

---

## 2. Source-of-Truth Hierarchy

When requirements conflict, use this authority order:

1. **Approved repository architecture, exact APIM/OpenAPI contracts, security policy, and runtime product decisions** define technical integration.
2. **The 183-page `CRAVES_MASTER_IMPLEMENTATION_GUIDE_v1.0` and its 52 embedded reference images** define intended appearance, layout, behavior, navigation, required state, lifecycle behavior, and acceptance gates.
3. **`agent.md`** defines how an AI/engineering agent must operate in this repository.
4. **`phases.md`** defines the approved execution order and granular phase boundaries.
5. **`build.md`** is the live completion ledger and the only authoritative statement of what this rebuild has actually completed.

Never invent an API endpoint, APIM route key, request field, response field, status value, authentication behavior, or server business rule to make a UI appear complete. If a guide capability does not have a supplied backend contract, record the gap in `build.md`, expose a typed integration boundary if useful, and block the production action rather than fabricating a contract.

---

## 3. Non-Negotiable Engineering Rules

- Follow the existing repository architecture. Do not create a second navigation system, state store, query client, API client, theme system, analytics system, or storage system.
- Use strict TypeScript. Avoid `any`, unsafe casts, untyped navigation parameters, duplicated transport models, and unchecked API payloads.
- Separate presentation, domain behavior, data access, and platform integration.
- Every visible control must have a real handler, correct disabled/loading state, press feedback, accessibility semantics, and a real navigation or mutation outcome.
- No TODO placeholders, fake success branches, hardcoded production entities, static-only controls, unreachable routes, or mock-only production paths may remain in a phase marked complete.
- Never hardcode secrets, environment URLs, access/refresh tokens, full payment data, OTPs, user identifiers, private addresses, catalog data, prices, order totals, or sensitive chef documents.
- Every asynchronous operation must model relevant pending, success, cancellation, stale-data, recoverable error, terminal error, permission, offline, and retry behavior.
- Double-submittable mutations require disabled-state protection, idempotency, authoritative revalidation, or the combination required by the backend contract.
- All user-visible copy must be localization-ready.
- Preserve safe navigation state, forms, tabs, filters, queries, scroll position, and restoration state where the product rule requires it.
- No backend, APIM, infrastructure, or server-source changes are permitted from the mobile rebuild unless the user separately and explicitly authorizes them.
- Do not claim visual/pixel-perfect completion until the reference has been compared on an actual representative Android runtime or approved screenshot-regression workflow.

---

## 4. Target Architecture

### 4.1 Runtime

- React Native CLI, Android-first, strict TypeScript.
- Keep native Android ownership in `apps/mobile/android`.
- Reuse project-approved native modules. The current rebuild uses React Native plus selected Expo modules for native capabilities such as secure storage; this does not convert the application into an Expo-managed app.

### 4.2 Navigation

Maintain typed domains:

- **Auth stack:** role selection, phone sign-in, email sign-in, OTP, password recovery, account/onboarding status.
- **Customer shell:** Home, Chefs, Orders, Profile plus customer subroutes.
- **Chef shell:** Dashboard, Orders, Menu, Analytics, Profile plus chef operational subroutes.
- **Transactional stack:** Cart, Checkout, address selection, coupon application, payment choice/provider authorization, confirmation.
- **Modal/overlay layer:** filters, confirmations, action sheets, media viewer, support selectors, contextual pickers.

Navigation rules:

- Use serializable typed IDs and origin context; do not pass large mutable domain objects as route params.
- Android system back and header back must be consistent.
- Role switching replaces/rehydrates the correct root and prevents cross-role data leakage.
- Repeated taps/deep links must not create duplicate destination instances where inappropriate.
- Deep links must be allowlisted and authorization-validated.
- Authentication success should restore the intended destination when permitted.

### 4.3 State Ownership

**Server/query state:** catalog, chefs, dishes, orders, notifications, reviews, offers, payout data, subscriptions, analytics, business documents, addresses, payment tokens, support content.

**Global application state:** authenticated session/role, cart summary/domain, selected location, shared badges, safe profile summary, preferences, feature flags, route-restoration metadata.

**Local screen state:** input focus, draft values, open sections, gallery index, temporary selections, unsaved filter draft, local modal state.

**Persisted non-sensitive state:** approved user preferences and safe restoration references only.

**Secure state:** refresh credential and any specifically approved sensitive session material only in platform-backed secure storage.

Derived totals, badges, eligibility, counts, and status indicators should come from authoritative data/selectors rather than independently stored copies.

### 4.4 Data Access

- Use the established central typed HTTP client.
- Use the existing APIM base configuration.
- Centralize bearer-token injection, correlation ID, timeout, cancellation, normalized errors, and silent refresh.
- Map guide capabilities to exact existing route keys/methods/models before implementation.
- Use query caching, request deduplication, stale-while-revalidate where safe, pagination, and bounded memory.
- Cancel obsolete searches and route-exit requests where appropriate.
- Never blindly retry a non-idempotent mutation.

---

## 5. Authentication and Session Plan

The auth/session implementation must support both Customer and approved Chef roles.

Required behavior:

- Role-aware phone authentication.
- Firebase native phone verification/OTP flow.
- Email/password authentication where supported by Firebase/product rules.
- Password recovery.
- Firebase identity to CRAVES backend session exchange.
- Backend role/onboarding/account-status resolution.
- Access token kept in process memory.
- Refresh token stored only in secure Android-backed storage.
- Central silent refresh/rotation with one in-flight refresh guard.
- Session restoration without flashing the wrong app root.
- Secure logout/revoke and private-cache clearing.
- Expired/invalid session recovery.
- Customer registration/profile completion when required.
- Chef application/onboarding/account-status routing when required.
- No web reCAPTCHA detour as an intentional app UX; use the approved native Firebase behavior and platform capabilities.

Authentication screens are immersive: customer cart and bottom navigation are never rendered there.

---

## 6. Design System and Visual Fidelity Plan

### 6.1 Core brand tokens

- Flame Red: `#F62E18`
- Espresso Brown: `#261A15`
- Warm white/cream surface system derived from references.
- Semantic success/warning/error/info colors must remain distinct from brand red.

### 6.2 Shared tokens

Maintain centralized:

- spacing on a consistent grid,
- typography scale and weights,
- radii,
- border/elevation rules,
- icon sizing,
- touch targets,
- safe-area offsets,
- animation durations/easing,
- content widths,
- skeleton geometry.

### 6.3 Reusable UI families

Only promote genuinely repeated patterns:

- screen headers/location header,
- primary/secondary/text buttons,
- input fields and validation messages,
- chips/segmented controls,
- dish cards,
- chef cards,
- order cards/status badges,
- settings rows,
- profile rows,
- offer cards,
- payment rows,
- skeletons,
- error/empty/offline shell,
- confirmation sheets/dialogs,
- customer bottom navigation,
- chef bottom navigation,
- View Cart overlay.

Reference images are the visual contract. Shared components must preserve the per-reference composition rather than forcing unrelated screens into one generic template.

---

## 7. Smart Cross-Screen UI Behavior

### 7.1 Customer View Cart

- Hidden at zero items.
- Appears automatically after the first successful add-to-cart mutation.
- Uses Espresso Brown where specified.
- Shows synchronized quantity and authoritative total where the reference includes them.
- Updates immediately after add/remove/quantity/coupon/address/pricing changes.
- Disappears immediately when the cart becomes empty.
- Never appears in Chef role.
- Never appears on auth, checkout, payment authorization, or other route-policy immersive screens.
- Bottom content inset adapts so the overlay never obscures content.

### 7.2 Customer Bottom Navigation

Core tabs: **Home, Chefs, Orders, Profile**.

- Active state uses Flame Red.
- Floats safely above Android system navigation.
- Visible when a tab-root feed is at the top.
- Hides smoothly while scrolling down and reappears while scrolling up.
- Reappears on tab changes/return to top as defined by route policy.
- Hidden on immersive routes.
- Preserve each tab’s route/list state where appropriate.

### 7.3 Chef Bottom Navigation

Core tabs: **Dashboard, Orders, Menu, Analytics, Profile**.

- Never render customer cart UI or reserve space for it.
- Preserve selected order status/date/filter/search/scroll state where specified.
- Keep counts and operational summaries synchronized across chef surfaces.

### 7.4 Scroll and restoration

- Restore exact list position when returning from detail/filter/ingredient/review screens when the result set did not materially change.
- Preserve search query, applied filters, selected tab, expanded sections, and safe form drafts.
- Pull-to-refresh server-backed root lists where appropriate.
- Background refresh should retain last valid data whenever safe.

---

## 8. Customer Experience Scope — References 1–37

The customer app must implement these references as integrated routes/states:

| Ref | Experience | Logical route/state |
|---:|---|---|
| 1 | Customer Phone Number Sign-In | Auth / PhoneSignIn |
| 3 | Customer Email and Password Sign-In | Auth / EmailSignIn |
| 5 | Customer Home — Empty Cart | Home, empty-cart state |
| 6 | Customer Home — Active Cart | Home, active-cart state |
| 7 | Discover Home Chefs — Empty Cart | Chefs, empty-cart state |
| 8 | Discover Home Chefs — Active Cart | Chefs, active-cart state |
| 9 | My Orders — Empty Cart | Orders, empty-cart state |
| 10 | My Orders — Active Cart | Orders, active-cart state |
| 11 | Customer Profile — Empty Cart | Profile, empty-cart state |
| 12 | Customer Profile — Active Cart | Profile, active-cart state |
| 13 | Dish Detail | Dish detail |
| 14 | Dish Ingredients | Ingredients |
| 15 | Customer-facing Kitchen Profile | Kitchen profile |
| 16 | Kitchen All Dishes | Full menu |
| 17 | Filter and Sort | Discovery filter utility |
| 18 | Cart | Cart/bill summary |
| 19 | Favorites — Empty Cart | Favorites empty-cart |
| 20 | Favorites — Active Cart | Favorites active-cart |
| 21 | Notifications — Empty Cart | Notifications empty-cart |
| 22 | Notifications — Active Cart | Notifications active-cart |
| 23 | Edit Customer Profile — Active Cart | Profile edit active-cart |
| 24 | Edit Customer Profile — Empty Cart | Profile edit empty-cart |
| 25 | My Addresses — Empty Cart | Addresses empty-cart |
| 26 | My Addresses — Active Cart | Addresses active-cart |
| 27 | Payment Methods — Empty Cart | Payment methods empty-cart |
| 28 | Payment Methods — Active Cart | Payment methods active-cart |
| 29 | Coupons and Offers — Empty Cart | Offers empty-cart |
| 30 | Coupons and Offers — Active Cart | Offers active-cart |
| 31 | My Reviews — Empty Cart | Reviews empty-cart |
| 32 | My Reviews — Active Cart | Reviews active-cart |
| 33 | Customer Settings — Empty Cart | Settings empty-cart |
| 34 | Customer Settings — Active Cart | Settings active-cart |
| 35 | Help and Support — Empty Cart | Support empty-cart |
| 36 | Help and Support — Active Cart | Support active-cart |
| 37 | Empty/Search/Offline/No-Data Collection | reusable state system |

Paired empty/active cart visuals must use one route/component/domain implementation with state-driven variants, not duplicate screens.

### 8.1 Discovery

Implement location/serviceability, home feed, categories/cuisines, search, dish details, kitchen/chef discovery, availability and ETA using exact APIM contracts. Search must debounce and cancel stale requests. Long collections are paginated/virtualized. Location changes invalidate location-dependent queries.

### 8.2 Favorites

Favorite state must be authoritative and synchronized across Home, Search, Dish, Kitchen, Favorites, and any other related screen. Optimistic behavior is allowed only when rollback is reliable.

### 8.3 Cart and checkout

Use one authoritative cart domain. It must reconcile quantity, current price, kitchen compatibility, stock/availability, serviceability, taxes, fees, coupon, delivery quote, and checkout eligibility. Conflict flows must follow product rules instead of silently replacing data.

Checkout creation/payment initiation must be guarded against duplicate taps and network replay. Payment success/failure/cancel must be verified via approved backend/provider flows.

### 8.4 Orders

Support paginated order lists/details, timeline/tracking, reorder validation, cancellation/refund eligibility where exact contracts exist. Status changes must update counts and affected surfaces without forcing unnecessary full refreshes.

### 8.5 Profile, rewards, addresses, payments, offers, reviews, settings, support

Each capability uses exact server ownership and contracts. Sensitive payment details remain provider-tokenized/masked. Destructive actions use confirmation and any required re-authentication. Support/account/legal content must not be fabricated if backend/content contracts are missing.

### 8.6 Reference 37 reusable lifecycle-state system

Implement the eight documented scenarios using one reusable state component plus contextual adapters:

- Empty Cart
- No Orders
- No Search Results
- No Favorites
- No Internet
- No Saved Addresses
- No Reviews
- No Coupons

Each state owns the correct recovery CTA, preserves context such as search query/origin route, handles connectivity recovery without retry loops, and obeys bottom-navigation/View Cart policy.

---

## 9. Chef Experience Scope — References 2, 4, 38–52

| Ref | Experience | Logical route/state |
|---:|---|---|
| 2 | Chef Phone Number Sign-In | Auth / PhoneSignIn, Chef role |
| 4 | Chef Email and Password Sign-In | Auth / EmailSignIn, Chef role |
| 38 | Chef Dashboard | Dashboard |
| 39 | Chef New Order Detail | Order detail |
| 40 | Chef Preparing Orders | Orders / Preparing |
| 41 | Chef Orders — New | Orders / New |
| 42 | Chef Ready for Pickup | Orders / Ready |
| 43 | Chef Completed Orders | Orders / Completed |
| 44 | Chef Menu | Menu |
| 45 | Chef Add New Menu Item | Menu item form |
| 46 | Chef Analytics | Analytics |
| 47 | Chef Account Profile | Profile |
| 48 | Chef Edit Profile | Edit profile |
| 49 | Chef Business Information | Business/documents |
| 50 | Chef Payout History | Payout/transactions |
| 51 | Chef Subscription Plan | Plan/subscription |
| 52 | Chef App Preferences | Preferences |

### 9.1 Chef dashboard and operational state

Dashboard counters, active-order cards, notification count, menu availability, payout/balance, and analytics summaries must use authoritative data and synchronize with detail/tab operations.

### 9.2 Chef orders

- Paginate/bound order lists.
- Preserve independent status-tab scroll positions.
- Derive timers from server timestamps, never accumulating local drift.
- Revalidate status before accept/reject/mark-ready/pickup/completion operations.
- Guard against duplicate action submission.
- Use real-time or near-real-time update mechanism only where the project contracts/infrastructure support it.
- Moving an order between states updates tab counts, dashboard, and analytics consistently.
- Customer contact actions use only authorized/masked data.

### 9.3 Chef menu

Menu data, availability, item creation/update, categories, price, media, diet/spice data, preparation times, and validation must follow exact backend models. Upload validation/compression must happen before network upload where applicable.

### 9.4 Chef analytics

Use backend-authoritative metrics and time ranges. Charts are visualizations, not independent calculations unless the contract explicitly supplies raw series for client calculation. Provide accessible numeric alternatives and avoid expensive render work on the critical interaction path.

### 9.5 Chef profile/business/documents

Treat verification and document validity as backend-authoritative. Secure uploads require validation, progress, retry, no sensitive log output, and actionable rejection/expiry states. Operational restrictions resulting from verification must reconcile across Dashboard/Menu/Orders.

### 9.6 Payouts

Financial data has the highest accuracy and audit expectations. Refresh available balance/withdraw eligibility immediately before payout. Require confirmation, idempotency, authoritative status handling, masked bank destination, and synchronized dashboard balance.

### 9.7 Subscription plan

Plan catalogue, eligibility, pricing, change/effective-date/cancel behavior must use an exact chef subscription contract. Never reuse an unrelated customer meal-subscription API merely to make the screen functional.

### 9.8 Chef preferences

Use the established preference/notification/privacy mechanisms. Preference state must remain role-specific and must not leak customer cart state into the chef experience.

---

## 10. Validation Plan

Centralize typed validation schemas and server-error mapping for:

- phone/E.164/country code,
- email normalization,
- password rules,
- OTP expiry/retry/rate limits,
- profile fields/media,
- addresses/pincode/geocode/serviceability,
- cart quantity/availability/compatibility/pricing,
- coupon code/eligibility,
- payment intent/provider eligibility,
- reviews/rating/media/edit eligibility,
- chef menu/category/price/media/diet/preparation rules,
- chef business/document/expiry/service-area rules,
- payout/subscription eligibility.

Client validation improves UX but never replaces server validation. Map server validation back to fields when possible and preserve valid input after recoverable failure.

---

## 11. Lifecycle, Error, Offline, and Weak-Network Plan

Every server-backed feature must deliberately implement applicable states:

1. initial skeleton/loading,
2. populated content,
3. background refresh with last valid data,
4. pull-to-refresh,
5. pagination/loading more,
6. empty,
7. offline/cached-stale,
8. permission denied,
9. timeout/recoverable error with retry,
10. terminal/authorization error,
11. mutation pending/disabled,
12. mutation success,
13. mutation rollback/reconciliation,
14. stale entity/deleted resource,
15. session-expiry refresh/re-auth.

Do not use infinite retry loops. Queue offline writes only if product/backend semantics explicitly allow it.

---

## 12. Performance Plan

- Target smooth 60 FPS interactions on supported mid-range Android devices.
- Use FlashList/approved virtualized lists for long collections.
- Stable IDs/keys, memoized expensive rows, bounded pagination, no unbounded arrays.
- Request appropriately sized media and use cache/placeholders/lazy loading.
- Debounce search, cancel stale requests, deduplicate query keys, and use bounded retry/backoff.
- Avoid broad global-store subscriptions causing entire-screen rerenders.
- Release media resources on blur/background.
- Defer non-critical startup work until after initial interactive shell.
- Avoid client fan-out when an approved aggregate endpoint exists.
- Profile startup, long lists, cart changes, and chef order event churn before release.

---

## 13. Accessibility and Responsive Plan

For every screen/state:

- safe-area/system-bar/gesture-nav awareness,
- compact, standard, and large Android phone widths,
- keyboard/IME avoidance,
- dynamic font scaling without clipping essential content,
- minimum Android touch target sizing,
- screen-reader labels/roles/states,
- logical focus order,
- sufficient contrast,
- error announcements where appropriate,
- reduced-motion equivalent behavior,
- no essential information conveyed only by color,
- large-screen content-width constraints rather than uncontrolled stretching.

---

## 14. Animation Plan

Motion communicates state and continuity; it must not delay work.

Use a centralized motion vocabulary for:

- press feedback,
- chip/tab selection,
- View Cart entrance/exit,
- bottom-nav hide/reveal,
- favorite/add-to-cart feedback,
- list insert/remove,
- modal/sheet transitions,
- skeletons,
- order status transitions,
- chart first-load/range-change animation.

Prefer opacity/transform to expensive layout animation. Respect reduced motion and never wait on decorative animation before authentication, payment, error, or critical navigation.

---

## 15. Security and Privacy Plan

- Access token: memory only.
- Refresh token: secure platform storage only.
- No sensitive material in logs, analytics, crash data, screenshots, route params, or general-purpose storage.
- Central auth header/silent refresh.
- Mask contact/payment/bank identifiers.
- Validate deep-link destinations and resource ownership.
- Clear private query/store data on logout/account deletion according to policy.
- High-risk actions require appropriate confirmation/re-auth.
- Sensitive chef documents follow least-privilege handling.
- Payment/provider data remains tokenized and uses approved SDK/backend verification.
- Run dependency and secret-scanning/security review before release.

---

## 16. Analytics and Observability Plan

Use the project abstractions for:

- screen views,
- meaningful user actions,
- auth/session failures,
- discovery/search/filter behavior,
- cart/checkout funnel,
- payment handoff/result,
- order interactions,
- chef operational mutations,
- backend/request correlation,
- performance traces,
- crash reporting.

Never include passwords, OTPs, tokens, raw payment details, private addresses, precise location beyond approved diagnostic policy, or document content.

---

## 17. Testing Strategy

### Unit

- selectors/derived state,
- validators,
- formatters,
- auth/session/token rotation,
- cart reconciliation/eligibility,
- order-state rules,
- API error mapping,
- idempotency guards.

### Component

For each major screen: loading, populated, empty, offline, error, retry, disabled, mutation pending/success/failure, accessibility queries, and cart/state variants.

### Integration

- typed navigation/back behavior,
- deep links,
- session restoration,
- role switching,
- cart synchronization,
- location invalidation,
- order status synchronization,
- notification routing,
- form/child-selector state preservation.

### End-to-end

Critical journeys include auth, discovery → cart → checkout → payment outcomes, order access/tracking, reviews, chef order lifecycle, menu publication, business flow, payout, and subscription change where contracts/environments support them.

### Visual/device QA

Compare all 52 references against implemented states on representative Android sizes. Also test font scaling, keyboard, gesture navigation, background/foreground, process recreation, poor network, and approved orientation behavior.

---

## 18. CI and Build Strategy

### During all implementation phases

Run code-level validation only:

- `npm ci`
- `tsc --noEmit`
- ESLint with zero warnings for new baseline
- Jest
- production Android JavaScript bundle generation
- contract-focused tests
- backend/APIM/infrastructure source-change guard

Do **not** run a complete APK build merely because a mini-phase finished.

### Final release phase only

After all implementation, integration, lifecycle, accessibility, performance, security, contract-coverage, visual, and regression gates are complete:

- clean Android dependency/build validation,
- release bundle/APK/AAB as required,
- production signing through secure CI secrets/Play App Signing,
- install/smoke tests,
- artifact checksums,
- release notes,
- rollback/monitoring readiness.

No production keystore/password may be committed or pasted into source.

---

## 19. Definition of Done — Mini Phase

A mini-phase can be marked `DONE` in `build.md` only when:

- its guide references and acceptance criteria have been inspected,
- exact APIM/backend contracts needed by that phase have been inspected,
- implementation is integrated into current architecture,
- all visible controls in that phase have real behavior,
- relevant lifecycle/error/offline states are implemented,
- focused tests are added/updated,
- TypeScript, lint, Jest, production JS bundle, and backend-source guard pass,
- no placeholder/TODO/mock-only production path remains inside the completed scope,
- any missing backend contract is explicitly recorded rather than fabricated,
- `build.md` is updated with changed files, routes/contracts, validation result, and blockers.

Visual certification is tracked separately until the final visual-QA phases unless the current phase explicitly performs device screenshot comparison.

---

## 20. Definition of Done — Complete Application

The application is complete only when:

- all 52 master-guide references are implemented,
- all required child flows/routes are reachable,
- customer/chef role isolation works,
- exact APIM contracts are used for every supported backend interaction,
- every visible control is functional,
- smart View Cart/bottom-nav/state-restoration behavior is correct,
- lifecycle/offline/error/retry states are complete,
- long lists/media/networking meet performance constraints,
- accessibility/responsive requirements are verified,
- security/privacy/observability requirements are verified,
- automated tests and critical E2E journeys pass,
- device-based visual comparison is complete for all 52 references,
- final release Android artifact is built/signed only after those gates,
- no TODOs, placeholders, fake production data, empty handlers, duplicated architecture, or unexplained visual redesign remain.

---

## 21. Change Control and Missing Contracts

If a design, API, or architecture decision changes:

1. identify the authoritative new source,
2. update the affected plan/phase/build records,
3. update implementation only within the authorized scope,
4. preserve backward compatibility or migration behavior where required,
5. re-run affected tests and integration checks.

If the needed backend capability does not exist, the agent must stop that specific production integration at a typed boundary and record the blocker. The mobile rebuild must never silently create a competing API contract.

---

## 22. Execution Control

Implementation proceeds according to `phases.md`. After each mini-phase, the agent updates `build.md` and stops. The next mini-phase begins only when the user explicitly authorizes it (for example: **“start next phase”**).
